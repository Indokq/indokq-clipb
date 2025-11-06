import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Orchestrator } from '../core/orchestrator.js';
import { Phase, WebSearch, AppMode, Message, PendingDiff, FileContext } from '../core/types.js';
import { MessageStream } from './components/MessageStream.js';
import { DiffViewer } from './components/DiffViewer.js';
import { ApprovalPrompt } from './components/ApprovalPrompt.js';
import { claudeClient } from '../core/models/claude-client.js';
import { PLANNING_SYSTEM_PROMPT } from '../config/prompts.js';
import { parseFileMentions, resolveFileMentions, buildContextualPrompt, getWorkspaceFiles, filterFilesByQuery } from '../tools/file-context.js';
import { generateWorkspaceSummary } from '../tools/codebase-summary.js';
import { parseAgentInvocation, AVAILABLE_AGENTS } from '../core/tool-executor.js';
import { agentModeTools } from '../config/tools.js';
import path from 'path';

// Agent metadata - accessible globally for event handlers
const AGENT_INFO: Record<string, { name: string; description: string }> = {
  terminus: { name: 'Terminus', description: 'Quick initial exploration and reasoning' },
  environment: { name: 'Environment', description: 'Analyze system state and environment' },
  strategy: { name: 'Strategy', description: 'Generate strategic approaches' },
  exploration: { name: 'Exploration', description: 'Safe testing in Docker containers' },
  search: { name: 'Web Research', description: 'Research relevant information' },
  prediction: { name: 'Prediction', description: 'Analyze task requirements' },
  synthesis: { name: 'Synthesis', description: 'Combine intelligence findings' },
  execution: { name: 'Execution', description: 'Execute the final plan' }
};

interface AppProps {
  initialTask?: string;
}

export const App: React.FC<AppProps> = ({ initialTask }) => {
  // Unified state
  const [mode, setMode] = useState<AppMode>('normal'); // Default to normal mode
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>(initialTask || '');
  const [input, setInput] = useState('');
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  
  // Status tracking
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [showStatus, setShowStatus] = useState(false);
  const hasReceivedFirstChunkRef = useRef(false);
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingMessageIdRef = useRef<number | null>(null);
  
  // Diff approval state
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);
  const [showDiffApproval, setShowDiffApproval] = useState(false);
  
  // File context state
  const [attachedFiles, setAttachedFiles] = useState<FileContext[]>([]);
  
  // Verbose mode state (Ctrl+O to toggle)
  const [showVerbose, setShowVerbose] = useState(false);
  const [verboseMessages, setVerboseMessages] = useState<Message[]>([]);
  
  // Message queue for typing during streaming
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  
  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<{label: string, value: string}[]>([]);
  const [atPosition, setAtPosition] = useState<number>(-1);
  
  // Slash command autocomplete state
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const slashCommandOptions = [
    { label: '/help - Display help', value: '/help' },
    { label: '/normal - Switch to normal mode', value: '/normal' },
    { label: '/plan - Switch to planning mode', value: '/plan' },
    { label: '/exec - Switch to execution mode', value: '/exec' },
    { label: '/clear - Clear history', value: '/clear' },
    { label: '/context reset', value: '/context reset' },
    { label: '/context show', value: '/context show' },
    { label: '/exit - Quit', value: '/exit' }
  ];
  const [filteredSlashCommands, setFilteredSlashCommands] = useState(slashCommandOptions);
  
  // Orchestrator reference for approval callbacks
  const orchestratorRef = useRef<Orchestrator | null>(null);
  
  // Track separate messages for each intelligence stream
  const streamMessageIdsRef = useRef<Record<string, number>>({});
  
  // Message counter for unique keys
  const messageCounterRef = useRef<number>(0);
  
  // Planning history for multi-turn conversations
  const planningHistoryRef = useRef<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  
  // Track if workspace context has been added
  const workspaceContextAddedRef = useRef(false);
  
  // Execution history for multi-turn conversations in execution mode
  const executionHistoryRef = useRef<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Spinner animation (runs when any activity is happening)
  useEffect(() => {
    if (!isRunning && !isStreaming && !showStatus) return;
    
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % 10);
    }, 80);
    
    return () => clearInterval(interval);
  }, [isRunning, isStreaming, showStatus]);

  // Helper to add messages
  const addMessage = (msg: Omit<Message, 'timestamp'>) => {
    const msgId = ++messageCounterRef.current;  // Increment FIRST to avoid duplicates
    setMessages(prev => [...prev, { 
      ...msg, 
      timestamp: msgId
      // Let assistant messages use default terminal color (no explicit color)
    }]);
  };
  
  // Helper to add verbose messages (hidden by default, shown with Ctrl+O)
  const addVerboseMessage = (msg: Omit<Message, 'timestamp'>) => {
    const msgId = ++messageCounterRef.current;  // Increment FIRST to avoid duplicates
    setVerboseMessages(prev => [...prev, { 
      ...msg, 
      timestamp: msgId
    }]);
  };

  // Process chunk content to add spacing at sentence boundaries
  const processChunk = (chunk: string): string => {
    // Find sentence boundaries within chunk: [.!?:] followed by capital letter (no space)
    // Exclude cases like: URLs (://) and markdown bold (**text**)
    return chunk.replace(/([.!?:])(?!\/)(?!\*)([A-Z])/g, '$1\n\n$2');
  };

  // Smart concatenation with automatic spacing
  const smartConcat = (existing: string, newChunk: string): string => {
    if (!existing) return processChunk(newChunk);
    if (!newChunk) return existing;
    
    // Step 1: Process the chunk itself to add spacing within it
    const processedChunk = processChunk(newChunk);
    
    // Step 2: Check boundary between existing and new chunk
    const sentenceEnd = /[.!?:]\s*$/;
    const startsWithCapital = /^[A-Z]/;
    
    // If existing ends with punctuation and new chunk starts with capital
    if (sentenceEnd.test(existing) && startsWithCapital.test(processedChunk)) {
      // Don't add spacing if there's already whitespace
      if (existing.endsWith('\n') || existing.endsWith(' ')) {
        return existing + processedChunk;
      }
      return existing + '\n\n' + processedChunk;
    }
    
    return existing + processedChunk;
  };

  // Direct stream update without throttling
  const handleStreamChunk = (chunk: string) => {
    if (streamingMessageIdRef.current !== null) {
      // Update existing streaming message
      setMessages(prev =>
        prev.map(m =>
          m.timestamp === streamingMessageIdRef.current
            ? { ...m, content: smartConcat(m.content, chunk) }
            : m
        )
      );
    } else {
      // Create new streaming message
      messageCounterRef.current += 1;
      const msgId = messageCounterRef.current;
      streamingMessageIdRef.current = msgId;
      setMessages(prev => [...prev, {
        type: 'assistant',
        content: chunk,
        timestamp: msgId
      }]);
    }
  };

  const handleStop = () => {
    if (isRunning && orchestratorRef.current) {
      // Actually abort the orchestrator
      orchestratorRef.current.abort();
      
      // Update UI state
      setIsRunning(false);
      setShowStatus(false);
      addMessage({
        type: 'system',
        content: '⚠️ Execution stopped by user (ESC)',
        color: 'yellow'
      });
      
      // Abort any ongoing operations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  };

  // Execute with tools in agent mode (Claude can call tools but not spawn_agents)
  const executeWithTools = async (task: string, fileContexts: any[]) => {
    setIsRunning(true);
    setIsStreaming(true);
    streamingMessageIdRef.current = null;
    
    // Build contextual prompt if files attached
    const contextualTask = fileContexts.length > 0 
      ? buildContextualPrompt(task, fileContexts)
      : task;
    
    // Create abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      const stream = claudeClient.streamMessage({
        system: 'You are a helpful AI assistant with access to tools. Use tools to accomplish user requests.',
        messages: [{ role: 'user', content: contextualTask }],
        tools: agentModeTools,  // All tools except spawn_agents
        max_tokens: 16384
      });
      
      let fullResponse = '';
      let toolUses: any[] = [];
      
      for await (const chunk of stream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }
        
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          fullResponse += chunk.delta.text;
          handleStreamChunk(chunk.delta.text);
        }
        
        if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
          toolUses.push(chunk.content_block);
        }
      }
      
      // Execute any tool calls
      if (toolUses.length > 0) {
        const { handleToolCall } = await import('../tools/index.js');
        
        for (const toolUse of toolUses) {
          addVerboseMessage({
            type: 'tool',
            content: `🔧 ${toolUse.name}`,
            color: 'cyan'
          });
          
          const result = await handleToolCall(toolUse);
          
          addVerboseMessage({
            type: 'tool',
            content: `  ↳ ${typeof result === 'string' ? result.substring(0, 100) : 'Success'}`,
            color: 'gray'
          });
        }
      }
      
      setIsRunning(false);
      setIsStreaming(false);
      streamingMessageIdRef.current = null;
      
    } catch (error: any) {
      addMessage({
        type: 'system',
        content: `Error: ${error.message}`,
        color: 'red'
      });
      setIsRunning(false);
      setIsStreaming(false);
    }
  };
  
  // Execute a specific agent directly (user invoked with @agentname)
  const executeAgentDirectly = async (agentName: string, task: string, fileContexts: any[]) => {
    setIsRunning(true);
    setIsStreaming(true);
    streamingMessageIdRef.current = null;
    
    // Build contextual prompt if files attached
    const contextualTask = fileContexts.length > 0 
      ? buildContextualPrompt(task, fileContexts)
      : task;
    
    // Load agent definition
    const { loadAgent } = await import('../.agents/agent-loader.js');
    const agent = loadAgent(agentName);
    
    if (!agent) {
      addMessage({
        type: 'system',
        content: `Unknown agent: ${agentName}`,
        color: 'red'
      });
      setIsRunning(false);
      setIsStreaming(false);
      return;
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      addMessage({
        type: 'system',
        content: `\n[@${agentName}]`,
        color: 'cyan'
      });
      
      // Get agent tools
      const toolNames = agent.toolNames || [];
      const allTools = await import('../config/tools.js');
      const tools = toolNames.map((name: string) => {
        switch (name) {
          case 'list_files': return allTools.listFilesTool;
          case 'search_files': return allTools.searchFilesTool;
          case 'grep_codebase': return allTools.grepCodebaseTool;
          case 'read_file': return allTools.readFileTool;
          case 'write_file': return allTools.writeFileTool;
          case 'execute_command': return allTools.executeCommandTool;
          case 'spawn_agents': return allTools.spawnAgentsTool;
          case 'task_complete': return allTools.taskCompleteTool;
          default: return null;
        }
      }).filter(Boolean);
      
      // Stream agent execution
      const stream = claudeClient.streamMessage({
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: contextualTask }],
        tools: tools,
        max_tokens: 16384
      });
      
      for await (const chunk of stream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }
        
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          handleStreamChunk(chunk.delta.text);
        }
        
        if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
          addVerboseMessage({
            type: 'tool',
            content: `🔧 ${chunk.content_block.name}`,
            color: 'cyan'
          });
        }
      }
      
      setIsRunning(false);
      setIsStreaming(false);
      streamingMessageIdRef.current = null;
      
    } catch (error: any) {
      addMessage({
        type: 'system',
        content: `Agent error: ${error.message}`,
        color: 'red'
      });
      setIsRunning(false);
      setIsStreaming(false);
    }
  };

  const executeInExecutionMode = async (task: string, isFirstMessage: boolean = false) => {
    setIsRunning(true);
    setCurrentTask(task);
    abortControllerRef.current = new AbortController();
    
    // Reset status tracking
    hasReceivedFirstChunkRef.current = false;
    setCurrentStatus('Thinking...');
    setShowStatus(true);
    
    // Clear verbose messages for new execution
    setVerboseMessages([]);

    // Add user message to execution history
    executionHistoryRef.current.push({ role: 'user', content: task });

    // Build conversation history with optional planning context on first message
    let conversationHistory = [...executionHistoryRef.current];
    
    if (isFirstMessage && planningHistoryRef.current.length > 0) {
      // Prepend planning context to first user message only
      const recentHistory = planningHistoryRef.current.slice(-4);
      let contextPrefix = `## Recent Planning Context\n\n`;
      
      for (const msg of recentHistory) {
        const label = msg.role === 'user' ? 'User' : 'Plan';
        const content = msg.content.length > 800 
          ? msg.content.substring(0, 800) + '...'
          : msg.content;
        contextPrefix += `**${label}:** ${content}\n\n`;
      }
      
      contextPrefix += `---\n\n## Task to Execute\n\n`;
      
      // Modify first message with planning context
      conversationHistory[0] = {
        role: 'user',
        content: contextPrefix + conversationHistory[0].content
      };
    }



    let spawnAgentsShown = false;
    const completedStreams = new Set<string>();

    const orchestrator = new Orchestrator({
      onEvent: (event) => {
        switch (event.type) {
          case 'phase_change':
            // Don't clear streamMessageIdsRef - let each stream track continuously
            
            // Show spawn agents marker when intelligence phase starts
            if (event.phase === 'intelligence' && !spawnAgentsShown) {
              setCurrentStatus('Invoking tools...');
              addMessage({
                type: 'system',
                content: '[Spawn Agents]'
              });
              spawnAgentsShown = true;
              
              // Clear orchestrator stream ID so post-agent text creates NEW message at bottom
              delete streamMessageIdsRef.current['orchestrator'];
            }
            
            if (event.phase === 'complete') {
              setShowStatus(false);
              streamMessageIdsRef.current = {}; // Clear all stream tracking
              completedStreams.clear(); // Clear completed set
            }
            break;

          case 'text_chunk':
            // Capture agent text in verbose array
            if (event.streamId !== 'orchestrator') {
              const existingMsgId = streamMessageIdsRef.current[event.streamId];
              
              if (existingMsgId) {
                setVerboseMessages(prev =>
                  prev.map(m =>
                    m.timestamp === existingMsgId
                      ? { ...m, content: smartConcat(m.content, event.chunk) }
                      : m
                  )
                );
              } else {
                const agent = AGENT_INFO[event.streamId];
                const header = agent ? `${agent.description}\n\n` : '';
                addVerboseMessage({
                  type: 'assistant',
                  content: header + event.chunk
                });
                streamMessageIdsRef.current[event.streamId] = messageCounterRef.current;
              }
              break;
            }
            
            // First chunk from orchestrator
            if (!hasReceivedFirstChunkRef.current) {
              hasReceivedFirstChunkRef.current = true;
              setShowStatus(false);
              
              // Show "indokq:" header right before response
              addMessage({
                type: 'system',
                content: '\nindokq:',
                color: 'cyan'
              });
            }
            
            // Stream orchestrator text
            const existingMsgId = streamMessageIdsRef.current['orchestrator'];
            
            if (existingMsgId) {
              setMessages(prev =>
                prev.map(m =>
                  m.timestamp === existingMsgId
                    ? { ...m, content: smartConcat(m.content, event.chunk) }
                    : m
                )
              );
            } else {
              addMessage({
                type: 'assistant',
                content: event.chunk
              });
              streamMessageIdsRef.current['orchestrator'] = messageCounterRef.current;
            }
            break;

          case 'tool_requested':
            // Capture in verbose array
            addVerboseMessage({
              type: 'tool',
              content: `🔧 ${event.toolName}`,
              color: 'cyan'
            });
            break;

          case 'tool_result':
            // Capture in verbose array
            const resultPreview = typeof event.result === 'string' 
              ? event.result.substring(0, 100) + (event.result.length > 100 ? '...' : '')
              : 'Success';
            addVerboseMessage({
              type: 'tool',
              content: `  ↳ ${resultPreview}`,
              color: 'gray'
            });
            break;

          case 'tool_error':
            // Only show errors, not every tool result
            addMessage({
              type: 'log',
              content: `\n⚠️  Error: ${event.error}\n`
            });
            break;
          
          case 'system':
            // Show system messages (including agent headers)
            addMessage({
              type: 'system',
              content: event.content
            });
            break;

          case 'web_search':
            break;

          case 'complete':
            setIsRunning(false);
            break;

          case 'diff_approval_needed':
            // Show diff and wait for user approval
            setPendingDiff(event.pendingDiff);
            setShowDiffApproval(true);
            addMessage({
              type: 'system',
              content: `\n📝 File changes proposed: ${event.pendingDiff.path}\n${event.pendingDiff.description || ''}`
            });
            break;
        }
      },

      onComplete: (result) => {
        setIsRunning(false);
        
        // Return to normal mode after execution
        setMode('normal');
        
        // Process queued messages (use functional update to get current state)
        setTimeout(() => {
          setMessageQueue(prev => {
            if (prev.length > 0) {
              const nextMessage = prev[0];
              handleUserInput(nextMessage);
              return prev.slice(1);
            }
            return prev;
          });
        }, 100);
      },

      onError: (err) => {
        addMessage({
          type: 'system',
          content: `\nError: ${err.message}`
        });
        setIsRunning(false);
      }
    });

    // Store orchestrator reference for approval callbacks
    orchestratorRef.current = orchestrator;

    orchestrator.executeTask(conversationHistory).then(result => {
      // Save assistant response to execution history
      executionHistoryRef.current.push({ role: 'assistant', content: result });
      setIsRunning(false);
      
      // Return to normal mode after execution
      setMode('normal');
    }).catch(err => {
      if (err.name === 'AbortError') {
        return;
      }
      addMessage({
        type: 'system',
        content: `Execution error: ${err.message}`,
        icon: '❌',
        color: 'red'
      });
      setIsRunning(false);
    });
  };

  // Global key handlers
  useInput((inputChar, key) => {
    // Ctrl+O to toggle verbose output
    if (key.ctrl && inputChar === 'o') {
      setShowVerbose(prev => !prev);
      return;
    }
    
    // HIGHEST PRIORITY: ESC to stop execution or streaming
    if (key.escape) {
      // Close slash commands dropdown
      if (showSlashCommands) {
        setShowSlashCommands(false);
        return;
      }
      
      // Close autocomplete dropdown (if not running)
      if (showAutocomplete && !isRunning && !isStreaming) {
        setShowAutocomplete(false);
        return;
      }
      
      // Stop execution/streaming
      if (isRunning || isStreaming) {
        if (isRunning) {
          // Execution mode - stop orchestrator
          handleStop();
        } else if (isStreaming) {
          // Planning mode - abort stream
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          setIsStreaming(false);
          setShowStatus(false);
          addMessage({
            type: 'system',
            content: '⚠️ Streaming stopped',
            color: 'yellow'
          });
        }
        // Clear message queue
        setMessageQueue([]);
        return;
      }
    }

    // Handle diff approval
    if (showDiffApproval && pendingDiff) {
      if (inputChar === 'a') {
        // Approve - notify orchestrator
        orchestratorRef.current?.resolveApproval('approve');
        addMessage({
          type: 'system',
          content: `✅ Approving changes to ${pendingDiff.path}`,
          color: 'green'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (inputChar === 'r') {
        // Reject - notify orchestrator
        orchestratorRef.current?.resolveApproval('reject');
        addMessage({
          type: 'system',
          content: `❌ Changes rejected`,
          color: 'yellow'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (inputChar === 'e') {
        // Edit - notify orchestrator
        orchestratorRef.current?.resolveApproval('edit');
        addMessage({
          type: 'system',
          content: `📝 Manual edit requested (feature coming soon)`,
          color: 'cyan'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (key.escape) {
        // ESC to reject diff
        orchestratorRef.current?.resolveApproval('reject');
        addMessage({
          type: 'system',
          content: `❌ Changes rejected`,
          color: 'yellow'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      }
    }

    // Handle slash command navigation
    if (showSlashCommands) {
      // Allow backspace
      if (key.backspace || key.delete) {
        setInput(prev => {
          const newInput = prev.slice(0, -1);
          if (!newInput.startsWith('/')) {
            setShowSlashCommands(false);
            setFilteredSlashCommands(slashCommandOptions);
          } else {
            // Filter commands based on current input
            filterSlashCommands(newInput);
          }
          return newInput;
        });
        return;
      }
      
      // Allow typing to continue filtering
      if (!key.ctrl && !key.meta && !key.shift && inputChar) {
        setInput(prev => {
          const newInput = prev + inputChar;
          filterSlashCommands(newInput);
          return newInput;
        });
        return;
      }
      
      // Arrow keys and Enter handled by SelectInput
      if (key.upArrow || key.downArrow || key.return) {
        return;
      }
    }

    // Handle autocomplete navigation
    if (showAutocomplete) {
      
      // Allow backspace to delete characters
      if (key.backspace || key.delete) {
        setInput(prev => {
          const newInput = prev.slice(0, -1);
          // Close autocomplete if @ is removed
          if (!newInput.includes('@')) {
            setShowAutocomplete(false);
            setAutocompleteOptions([]);
          } else {
            // Update filter
            handleAutocompleteFilter(newInput);
          }
          return newInput;
        });
        return;
      }
      
      // Allow typing to continue filtering
      if (!key.ctrl && !key.meta && !key.shift && inputChar) {
        setInput(prev => {
          const newInput = prev + inputChar;
          handleAutocompleteFilter(newInput);
          return newInput;
        });
        return;
      }
      
      // Arrow keys and Enter are handled by SelectInput - don't interfere
      if (key.upArrow || key.downArrow || key.return) {
        return;
      }
    }

    // Don't accept input while showing diff approval
    if (showDiffApproval) return;

    // Handle text input
    if (key.return && input.trim()) {
      if (isRunning || isStreaming) {
        // Queue message during streaming/execution
        setMessageQueue(prev => [...prev, input.trim()]);
        setInput('');
        return;
      }
      
      // Normal send
      handleUserInput(input);
      setInput('');
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && !key.shift && inputChar) {
      setInput(prev => {
        const newInput = prev + inputChar;
        
        // Trigger autocomplete on @
        if (inputChar === '@') {
          setAtPosition(newInput.length - 1);
          handleAutocompleteOpen();
        }
        
        // Trigger slash commands on /
        if (inputChar === '/' && newInput === '/') {
          setShowSlashCommands(true);
          setFilteredSlashCommands(slashCommandOptions);
        }
        
        return newInput;
      });
    }
  });

  // Open autocomplete and load files
  const handleAutocompleteOpen = async () => {
    try {
      const files = await getWorkspaceFiles(process.cwd());
      const options = files.slice(0, 50).map(f => ({
        label: f,
        value: f
      }));
      setAutocompleteOptions(options);
      setShowAutocomplete(true);
    } catch (error) {
      // Silent fail - just don't show autocomplete
      console.error('Failed to load files:', error);
    }
  };

  // Filter autocomplete based on current query
  const handleAutocompleteFilter = async (currentInput: string) => {
    // Extract text after last @
    const match = currentInput.match(/@([\w.-/\\]*)$/);
    if (!match) {
      setShowAutocomplete(false);
      return;
    }
    
    const query = match[1];
    const files = await getWorkspaceFiles(process.cwd());
    const filtered = filterFilesByQuery(files, query);
    const options = filtered.map(f => ({
      label: f,
      value: f
    }));
    
    setAutocompleteOptions(options);
  };

  // Handle file selection from autocomplete
  const handleFileSelect = (item: {label: string, value: string}) => {
    // Replace @query with @filepath
    const beforeAt = input.substring(0, atPosition);
    const newInput = beforeAt + '@' + item.value + ' ';
    setInput(newInput);
    setShowAutocomplete(false);
    setAutocompleteOptions([]);
  };
  
  // Handle slash command selection
  const handleSlashCommandSelect = (item: {label: string, value: string}) => {
    setInput(item.value + ' ');
    setShowSlashCommands(false);
    setFilteredSlashCommands(slashCommandOptions);
  };
  
  // Filter slash commands based on current input
  const filterSlashCommands = (currentInput: string) => {
    const query = currentInput.toLowerCase();
    const filtered = slashCommandOptions.filter(cmd => 
      cmd.value.toLowerCase().startsWith(query)
    );
    setFilteredSlashCommands(filtered);
    
    // Close if no matches
    if (filtered.length === 0) {
      setShowSlashCommands(false);
    }
  };

  const handleUserInput = async (input: string) => {
    // Parse @mentions for file context
    const { text: cleanedInput, mentions } = parseFileMentions(input);
    
    // Resolve file mentions if any
    let fileContexts: FileContext[] = [];
    if (mentions.length > 0) {
      const { contexts, errors } = await resolveFileMentions(mentions, process.cwd());
      fileContexts = contexts;
      
      // Show errors for failed mentions
      for (const error of errors) {
        addMessage({
          type: 'system',
          content: error,
          color: 'yellow'
        });
      }
      
      // Set attached files (shown above input)
      if (contexts.length > 0) {
        setAttachedFiles(contexts);
      }
    }
    
    // Use cleaned input (without @mentions)
    const finalInput = cleanedInput || input;
    
    // Help command
    if (finalInput === '/help' || finalInput === 'help') {
      addMessage({
        type: 'system',
        content: `
Commands:
/help ............... Display help information
/plan <message> ..... Switch to planning mode (chat)
/exec <task> ........ Execute task in execution mode
/clear .............. Clear conversation history
/context reset ...... Reset workspace context
/context show ....... Show current workspace context
/exit ............... Quit indokq CLI

Normal Mode (default):
- Talk naturally and Claude will use tools to help you
- Example: "create a hello.txt file"
- Example: "analyze the codebase structure"
- Claude can call tools but CANNOT spawn agents
- You explicitly spawn agents with @agentname

Explicit agent invocation:
  @terminus <task> ....... Quick exploration agent
  @environment <task> .... System state analyzer
  @prediction <task> ..... Task predictor
  @intelligence <task> ... Meta-agent coordinator
  @synthesis <task> ...... Intelligence synthesizer
  @execution <task> ...... Execution agent

File Context:
@filename ........... Attach file context to your query
                      Example: @app.tsx how does the spinner work?

Features:
- Press Ctrl+O to toggle verbose output
- Type during execution to queue messages
- ESC to cancel operations

Current mode: ${mode}
        `
      });
      setAttachedFiles([]);
      return;
    }

    // Clear command
    if (finalInput === '/clear') {
      setMessages([]);
      planningHistoryRef.current = [];
      executionHistoryRef.current = [];
      setAttachedFiles([]);
      workspaceContextAddedRef.current = false;
      return;
    }
    
    // Context command
    if (finalInput === '/context reset') {
      workspaceContextAddedRef.current = false;
      addMessage({
        type: 'system',
        content: '✓ Context reset'
      });
      return;
    }
    
    if (finalInput === '/context show') {
      generateWorkspaceSummary(process.cwd()).then(summary => {
        addMessage({
          type: 'system',
          content: summary
        });
      });
      return;
    }

    // Normal command - switch to normal mode
    if (finalInput === '/normal') {
      setMode('normal');
      addMessage({
        type: 'system',
        content: '✓ Switched to normal mode'
      });
      return;
    }
    
    // Plan command - switch to planning mode
    if (finalInput.startsWith('/plan')) {
      const message = finalInput.slice(5).trim();
      if (message) {
        // User provided message - switch mode and process
        setMode('planning');
        planningHistoryRef.current = [];
        handleUserInput(message);
      } else {
        // No message - just show hint, don't switch
        addMessage({
          type: 'system',
          content: '💡 Use /plan <message> to switch to planning mode and send a message'
        });
      }
      return;
    }
    
    // Exec command - switch to execution and run
    if (finalInput.startsWith('/exec')) {
      const task = finalInput.slice(5).trim();
      if (task) {
        // User provided task - switch mode and execute
        setMode('execution');
        executionHistoryRef.current = [];  // Clear history for new execution session
        streamMessageIdsRef.current = {};  // Reset stream tracking
        // Build contextual prompt if files attached
        const contextualTask = fileContexts.length > 0 
          ? buildContextualPrompt(task, fileContexts)
          : task;
        executeInExecutionMode(contextualTask, true);  // Mark as first message
        setAttachedFiles([]);
      } else {
        // No task - just show hint, don't switch
        addMessage({
          type: 'system',
          content: '💡 Use /exec <task> to switch to execution mode and run a task'
        });
      }
      return;
    }

    // Exit command
    if (finalInput === '/exit') {
      process.exit(0);
    }

    // Add user message to stream with spacing
    addMessage({
      type: 'user',
      content: `\n${finalInput}`,
      icon: '💬',
      color: 'green'
    });

    if (mode === 'normal') {
      // Normal mode - Claude can call tools naturally, but can't spawn agents
      // Users explicitly spawn agents with @agentname
      
      // Check for explicit agent invocation (@agentname task)
      const agentInvocation = parseAgentInvocation(finalInput);
      if (agentInvocation) {
        // User explicitly spawned agent - execute it directly
        executeAgentDirectly(agentInvocation.agentName, agentInvocation.task, fileContexts);
        setAttachedFiles([]);
        return;
      }
      
      // Regular natural language - let Claude handle with tools (no spawn_agents)
      executeWithTools(finalInput, fileContexts);
      setAttachedFiles([]);
      return;
    }

    if (mode === 'planning') {
      // Auto-add workspace context on first message
      let contextualInput = finalInput;
      
      if (!workspaceContextAddedRef.current && planningHistoryRef.current.length === 0) {
        const workspaceSummary = await generateWorkspaceSummary(process.cwd());
        contextualInput = `${workspaceSummary}\n\n---\n\n${finalInput}`;
        workspaceContextAddedRef.current = true;
      }
      
      // Build contextual prompt if files attached
      if (fileContexts.length > 0) {
        contextualInput = buildContextualPrompt(contextualInput, fileContexts);
      }

      // Planning mode - chat with Claude
      planningHistoryRef.current.push({ role: 'user', content: contextualInput });
      setIsStreaming(true);
      streamingMessageIdRef.current = null;  // Reset for new stream
      
      // Clear attached files after use
      setAttachedFiles([]);
      
      // Show thinking status
      setCurrentStatus('Thinking...');
      setShowStatus(true);

      // Create abort controller for this stream
      abortControllerRef.current = new AbortController();

      try {
        const stream = claudeClient.streamMessage({
          system: PLANNING_SYSTEM_PROMPT,
          messages: planningHistoryRef.current,
          max_tokens: 16384
        });

        let fullResponse = '';
        let firstChunk = true;
        
        for await (const chunk of stream) {
          // Check if aborted
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }
          
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            if (firstChunk) {
              firstChunk = false;
              setShowStatus(false);
              addMessage({
                type: 'system',
                content: '\nindokq:',
                color: 'cyan'
              });
            }
            fullResponse += chunk.delta.text;
            handleStreamChunk(chunk.delta.text);
          }
        }

        // Stream complete - reset message ID
        if (!abortControllerRef.current?.signal.aborted) {
          // Save to history only if not aborted
          planningHistoryRef.current.push({ role: 'assistant', content: fullResponse });
          
          // Process queued messages (use functional update to get current state)
          setTimeout(() => {
            setMessageQueue(prev => {
              if (prev.length > 0) {
                const nextMessage = prev[0];
                handleUserInput(nextMessage);
                return prev.slice(1);
              }
              return prev;
            });
          }, 100);
        }
        streamingMessageIdRef.current = null;
      } catch (error: any) {
        if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
          // Stream was aborted - silent, already showed message
          return;
        }
        addMessage({
          type: 'system',
          content: `Error: ${error.message}`,
          icon: '❌',
          color: 'red'
        });
      } finally {
        setIsStreaming(false);
        setShowStatus(false);
        abortControllerRef.current = null;
      }
    } else {
      // Execution mode - subsequent messages in conversation
      executeInExecutionMode(input, false);
    }
  };

  const folderName = path.basename(process.cwd());

  return (
    <Box flexDirection="column" height="100%">
      {/* Main Message Stream - Clean continuous output */}
      <Box flexGrow={1} flexDirection="column" paddingY={1} paddingX={1}>
        <MessageStream messages={messages} />
        
        {/* Verbose output - toggle with Ctrl+O */}
        {showVerbose && verboseMessages.length > 0 && (
          <Box flexDirection="column" borderStyle="single" borderColor="gray" marginTop={1} padding={1}>
            <Text color="yellow">--- Verbose Output (Ctrl+O to hide) ---</Text>
            <MessageStream messages={verboseMessages} />
          </Box>
        )}
        
        {/* Hint to show verbose */}
        {!showVerbose && isRunning && (
          <Text color="gray" dimColor>Press Ctrl+O for verbose output</Text>
        )}
        
        {/* Show simple spinner when running */}
        {(isRunning || showStatus) && currentStatus && (
          <Box marginTop={1}>
            <Text color="blue">{['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][spinnerFrame]} {currentStatus}</Text>
          </Box>
        )}
        
        {/* Show diff approval UI */}
        {showDiffApproval && pendingDiff && (
          <Box flexDirection="column" marginTop={1}>
            <DiffViewer diff={pendingDiff.diff} filepath={pendingDiff.path} />
            <ApprovalPrompt message="Apply these changes?" />
          </Box>
        )}
      </Box>

      {/* Show queued messages count */}
      {messageQueue.length > 0 && (
        <Box paddingX={1}>
          <Text color="yellow">
            {messageQueue.length} queued
          </Text>
        </Box>
      )}
      
      {/* Show attached files above input */}
      {attachedFiles.length > 0 && (
        <Box paddingX={1} flexDirection="row" gap={1}>
          <Text color="gray">Attached:</Text>
          {attachedFiles.map((file, idx) => (
            <Box key={idx} marginLeft={1}>
              <Text color="cyan">📎 {path.basename(file.path)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Terminal-style inline input prompt with folder and mode indicator */}
      <Box paddingX={1} paddingY={1} flexDirection="row">
        <Text color={mode === 'normal' ? 'cyan' : mode === 'planning' ? 'yellow' : 'green'}>
          {folderName} ({mode}) &gt;{' '}
        </Text>
        <Text>{input}</Text>
        <Text inverse> </Text>
      </Box>

      {/* Slash command dropdown - appears BELOW input */}
      {showSlashCommands && filteredSlashCommands.length > 0 && (
        <Box paddingX={1} borderStyle="round" borderColor="yellow" flexDirection="column">
          <SelectInput
            items={filteredSlashCommands}
            onSelect={handleSlashCommandSelect}
            limit={8}
          />
        </Box>
      )}

      {/* Autocomplete dropdown - appears BELOW input */}
      {showAutocomplete && autocompleteOptions.length > 0 && (
        <Box paddingX={1} borderStyle="round" borderColor="cyan" flexDirection="column">
          <SelectInput
            items={autocompleteOptions}
            onSelect={handleFileSelect}
            limit={8}
          />
        </Box>
      )}
    </Box>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Orchestrator } from '../core/orchestrator.js';
import { Phase, WebSearch, AppMode, Message, PendingDiff, FileContext, SystemMessage, ToolMessage, AssistantMessage } from '../core/types.js';
import { MessageStream } from './components/MessageStream.js';
import { DiffViewer } from './components/DiffViewer.js';
import { ApprovalPrompt } from './components/ApprovalPrompt.js';
import { claudeClient } from '../core/models/claude-client.js';
import { getClipboardImage } from '../tools/clipboard-image.js';
import { PLANNING_SYSTEM_PROMPT } from '../config/prompts.js';
import { parseFileMentions, resolveFileMentions, buildContextualPrompt, buildMultimodalContent, getWorkspaceFiles, filterFilesByQuery } from '../tools/file-context.js';
import { generateWorkspaceSummary } from '../tools/codebase-summary.js';
import { parseAgentInvocation, AVAILABLE_AGENTS } from '../core/tool-executor.js';
import { 
  listFilesTool,
  searchFilesTool,
  grepCodebaseTool,
  readFileTool,
  createFileTool,
  editFileTool,
  writeFileTool,
  executeCommandTool,
  dockerExecuteTool
} from '../config/tools.js';
import { handleToolCall, validateToolCall, setMCPToolRegistry } from '../tools/index.js';
import { NORMAL_MODE_PROMPT } from '../config/prompts.js';
import { ConversationMemoryManager } from '../core/conversation-memory.js';
import { ApprovalManager, type ApprovalLevel } from '../tools/approval-manager.js';
import { WorkspaceScanner } from '../core/workspace-scanner.js';
import { RelevanceRanker } from '../core/relevance-ranking.js';
import { AugmentedPromptBuilder } from '../core/prompt-builder.js';
import { setMemoryManager, setCurrentMode } from '../tools/index.js';
import { setCommandMemoryManager } from '../tools/execute-command.js';
import { config } from '../config/env.js';
import path from 'path';
import { MCPMainMenu } from './components/mcp/MCPMainMenu.js';
import { MCPServerList } from './components/mcp/MCPServerList.js';
import { MCPAddServerForm } from './components/mcp/MCPAddServerForm.js';
import { MCPServerDetails } from './components/mcp/MCPServerDetails.js';

// Helper functions for creating typed messages
const createSystemMessage = (content: string, color?: string, icon?: string): Omit<SystemMessage, 'timestamp' | 'id'> => ({
  type: 'system',
  content,
  color,
  icon
});

const createToolMessage = (content: string, color?: string, icon?: string): Omit<ToolMessage, 'timestamp' | 'id'> => ({
  type: 'tool',
  content,
  color,
  icon
});

const createAssistantMessage = (content: string): Omit<AssistantMessage, 'timestamp' | 'id'> => ({
  type: 'assistant',
  content
});

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
  const [approvalLevel, setApprovalLevel] = useState<ApprovalLevel>(
    config.TOOL_APPROVAL_LEVEL as ApprovalLevel
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>(initialTask || '');
  const [input, setInput] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
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
    { label: '/normal - Normal mode (default)', value: '/normal' },
    { label: '/plan or /spec - Specification mode', value: '/plan' },
    { label: '/exec - Execution mode', value: '/exec' },
    { label: '/mcp - MCP server management', value: '/mcp' },
    { label: '/approval - View/set approval level', value: '/approval' },
    { label: '/clear - Clear history', value: '/clear' },
    { label: '/context reset', value: '/context reset' },
    { label: '/context show', value: '/context show' },
    { label: '/exit - Quit', value: '/exit' }
  ];
  const [filteredSlashCommands, setFilteredSlashCommands] = useState(slashCommandOptions);
  
  // MCP state
  const [showMCPMenu, setShowMCPMenu] = useState(false);
  const [mcpView, setMCPView] = useState<'main' | 'list' | 'add' | 'details'>('main');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  
  // Orchestrator reference for approval callbacks
  const orchestratorRef = useRef<Orchestrator | null>(null);
  
  // Conversation memory manager
  const memoryManagerRef = useRef<ConversationMemoryManager>(new ConversationMemoryManager());
  
  // Context management system
  const workspaceScannerRef = useRef<WorkspaceScanner>(new WorkspaceScanner());
  const relevanceRankerRef = useRef<RelevanceRanker>(
    new RelevanceRanker(workspaceScannerRef.current, memoryManagerRef.current)
  );
  const promptBuilderRef = useRef<AugmentedPromptBuilder>(
    new AugmentedPromptBuilder(
      memoryManagerRef.current,
      workspaceScannerRef.current,
      relevanceRankerRef.current
    )
  );
  
  // Track separate messages for each intelligence stream
  const streamMessageIdsRef = useRef<Record<string, number>>({});
  
  // Message counter for unique keys
  const messageCounterRef = useRef<number>(0);
  
  // Approval manager for tool execution
  const approvalManagerRef = useRef<ApprovalManager>(
    new ApprovalManager(config.TOOL_APPROVAL_LEVEL as ApprovalLevel)
  );
  
  // Planning history for multi-turn conversations
  const planningHistoryRef = useRef<Array<{ role: 'user' | 'assistant', content: any }>>([]);
  
  // Track if workspace context has been added
  const workspaceContextAddedRef = useRef(false);
  
  // Execution history for multi-turn conversations in execution mode
  const executionHistoryRef = useRef<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize context management system
  useEffect(() => {
    // Set memory manager for tool tracking
    setMemoryManager(memoryManagerRef.current);
    setCommandMemoryManager(memoryManagerRef.current, mode);
    
    // Initialize MCP manager
    const initMCP = async () => {
      try {
        // Create orchestrator (which creates MCP manager)
        const orch = new Orchestrator();
        orchestratorRef.current = orch;
        
        // Initialize MCP
        const mcpManager = orch.getMCPManager();
        await mcpManager.loadFromStorage();
        
        // Auto-connect if enabled
        if (config.MCP_AUTO_CONNECT_ON_STARTUP) {
          await mcpManager.connectAll();
        }
        
        // Set MCP tool registry for tool handler
        const { MCPToolRegistry } = await import('../tools/mcp-tools.js');
        const mcpToolRegistry = new MCPToolRegistry(mcpManager);
        setMCPToolRegistry(mcpToolRegistry);
        
        console.error('[MCP] Initialized successfully');
      } catch (error) {
        console.error('[MCP] Failed to initialize:', error);
      }
    };
    
    initMCP();
    
    // Scan workspace on startup (async, doesn't block)
    if (config.WORKSPACE_SCAN_ON_STARTUP) {
      workspaceScannerRef.current.scan(process.cwd()).catch(err => {
        console.error('Failed to scan workspace:', err);
      });
    }
  }, []);
  
  // Update mode in tools when mode changes
  useEffect(() => {
    setCurrentMode(mode);
    setCommandMemoryManager(memoryManagerRef.current, mode);
  }, [mode]);

  // Spinner animation (runs when any activity is happening)
  useEffect(() => {
    if (!isRunning && !isStreaming && !showStatus) return;
    
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % 10);
    }, 80);
    
    return () => clearInterval(interval);
  }, [isRunning, isStreaming, showStatus]);

  // Helper to add messages  
  const addMessage = (msg: any) => {
    const msgId = ++messageCounterRef.current;  // Increment FIRST to avoid duplicates
    setMessages(prev => [...prev, { 
      ...msg, 
      timestamp: msgId,
      id: `msg-${msgId}-${Date.now()}`
      // Let assistant messages use default terminal color (no explicit color)
    } as Message]);
  };
  
  // Helper to add verbose messages (hidden by default, shown with Ctrl+O)
  const addVerboseMessage = (msg: any) => {
    const msgId = ++messageCounterRef.current;  // Increment FIRST to avoid duplicates
    setVerboseMessages(prev => [...prev, { 
      ...msg, 
      timestamp: msgId,
      id: `verbose-${msgId}-${Date.now()}`
    } as Message]);
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
        prev.map(m => {
          if (m.timestamp === streamingMessageIdRef.current) {
            // Only update if message has content property
            if ('content' in m && typeof m.content === 'string') {
              return { ...m, content: smartConcat(m.content, chunk) } as Message;
            }
          }
          return m;
        })
      );
    } else {
      // Create new streaming message
      messageCounterRef.current += 1;
      const msgId = messageCounterRef.current;
      streamingMessageIdRef.current = msgId;
      setMessages(prev => [...prev, {
        type: 'assistant',
        content: chunk,
        timestamp: msgId,
        id: `stream-${msgId}-${Date.now()}`
      } as Message]);
    }
  };

  const handleStop = () => {
    if (isRunning || isStreaming) {
      // Abort orchestrator if it exists (execution mode)
      if (orchestratorRef.current) {
        orchestratorRef.current.abort();
      }
      
      // Abort current controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Update UI state
      setIsRunning(false);
      setIsStreaming(false);
      setShowStatus(false);
      setCurrentStatus('');
      
      // Clear message queue
      setMessageQueue([]);
      
      // Single message without icon
      addMessage({
        type: 'system',
        content: 'Execution stopped by user (ESC)',
        color: 'red'
      });
    }
  };

  // Execute with tools in agent mode (Claude can call tools but not spawn_agents)
  // Implements multi-turn tool execution: Claude → tool call → results → Claude → repeat until done
  const executeWithTools = async (task: string, fileContexts: any[]) => {
    setIsRunning(true);
    setIsStreaming(true);
    streamingMessageIdRef.current = null;
    
    // Show spinner with status
    setCurrentStatus('Analyzing request...');
    setShowStatus(true);
    
    // Build contextual prompt or multimodal content if files/images attached
    const contextualTask = fileContexts.length > 0 
      ? buildMultimodalContent(task, fileContexts)
      : task;
    
    // Create abort controller
    abortControllerRef.current = new AbortController();
    
    // Add user message to persisted history
    executionHistoryRef.current.push({
      role: 'user',
      content: contextualTask as any
    });
    
    // Use persisted conversation history (preserves context across turns)
    const conversationHistory: any[] = [...executionHistoryRef.current];
    
    try {
      let continueLoop = true;
      const validationFailureCount = new Map<string, number>(); // Track validation failures per tool
      const MAX_VALIDATION_FAILURES = 3; // Circuit breaker threshold
      let turnCount = 0; // Track turns to only send system prompt once
      
      // Multi-turn loop: keep going while Claude makes tool calls
      while (continueLoop && !abortControllerRef.current?.signal.aborted) {
        // Update status
        setCurrentStatus('Thinking...');
        
        // Build base tools array
        const baseTools = [listFilesTool, searchFilesTool, grepCodebaseTool, readFileTool, createFileTool, editFileTool, writeFileTool, executeCommandTool, dockerExecuteTool];
        
        // Fetch and add MCP tools
        let toolsArray = baseTools;
        try {
          const mcpManager = orchestratorRef.current?.getMCPManager();
          if (mcpManager) {
            const { MCPToolRegistry } = await import('../tools/mcp-tools.js');
            const mcpToolRegistry = new MCPToolRegistry(mcpManager);
            const mcpTools = await mcpToolRegistry.getAllClaudeTools();
            toolsArray = [...baseTools, ...mcpTools];
            
            if (mcpTools.length > 0 && turnCount === 0) {
              console.error(`[MCP] Added ${mcpTools.length} MCP tools to conversation`);
            }
          }
        } catch (error) {
          console.error('[MCP] Failed to load MCP tools for conversation:', error);
          // Continue with base tools only
        }
        
        // Build context-aware prompt for first turn
        let systemPrompt: any = undefined;
        if (turnCount === 0) {
          const augmentedPrompt = await promptBuilderRef.current.buildPrompt(
            task,
            NORMAL_MODE_PROMPT,
            {
              includeWorkspaceOverview: true,
              includeRelevantFiles: true,
              includeToolHistory: true,
              includeSessionSummary: true,
              mode: 'normal',
              maxContextTokens: 3500
            }
          );
          systemPrompt = augmentedPrompt.system;
        }
        
        const stream = claudeClient.streamMessage({
          system: systemPrompt,
          messages: conversationHistory,
          tools: toolsArray,
          signal: abortControllerRef.current?.signal
        });
        
        turnCount++;
        
        let textContent = '';
        let toolUses: any[] = [];
        let currentToolUseIndex = -1;
        
        // Stream Claude's response
        for await (const chunk of stream) {
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }
          
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            textContent += chunk.delta.text;
            handleStreamChunk(chunk.delta.text);
          }
          
          if (chunk.type === 'content_block_start') {
            if (chunk.content_block?.type === 'tool_use') {
              // Initialize tool use with empty input and buffer for accumulating JSON
              const correlationId = Math.random().toString(36).substring(2, 10);
              toolUses.push({
                ...chunk.content_block,
                input: {},
                _inputBuffer: '',
                _correlationId: correlationId
              });
              currentToolUseIndex = toolUses.length - 1;
            }
          }
          
          if (chunk.type === 'content_block_delta') {
            const lastToolUse = toolUses[currentToolUseIndex];
            if (lastToolUse && chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
              // Accumulate JSON input incrementally
              lastToolUse._inputBuffer = (lastToolUse._inputBuffer || '') + chunk.delta.partial_json;
            }
          }
          
          if (chunk.type === 'content_block_stop') {
            const lastToolUse = toolUses[currentToolUseIndex];
            if (lastToolUse && lastToolUse._inputBuffer) {
              try {
                // Parse the accumulated JSON buffer
                lastToolUse.input = JSON.parse(lastToolUse._inputBuffer);
                delete lastToolUse._inputBuffer;
              } catch (e) {
                console.error(`[${lastToolUse._correlationId}] Failed to parse tool input JSON:`, lastToolUse._inputBuffer);
                // Keep empty input on parse failure
              }
            }
          }
        }
        
        // Build assistant message with text and/or tool uses
        const assistantContent: any[] = [];
        
        if (textContent) {
          assistantContent.push({ type: 'text', text: textContent });
        }
        
        if (toolUses.length > 0) {
          // Add tool use blocks to assistant message
          for (const toolUse of toolUses) {
            assistantContent.push({
              type: 'tool_use',
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input
            });
          }
        }
        
        // Add assistant's response to conversation
        conversationHistory.push({
          role: 'assistant',
          content: assistantContent
        });
        
        // If there are tool calls, execute them and continue loop
        if (toolUses.length > 0) {
          setCurrentStatus(`Executing ${toolUses.length} tool${toolUses.length > 1 ? 's' : ''}...`);
          const toolResults = [];
          
          for (const toolUse of toolUses) {
            setCurrentStatus(`Running ${toolUse.name}...`);
            
            // Tool badge will be shown after execution with actual results
            
            // Also add to verbose for those who want detailed logs
            addVerboseMessage({
              type: 'tool',
              content: `🔧 ${toolUse.name}`,
              color: 'cyan'
            });
            
            try {
              // Clean up internal tracking fields before validation
              const cleanToolUse = { ...toolUse };
              delete cleanToolUse._inputBuffer;
              delete cleanToolUse._correlationId;
              
              const validation = validateToolCall(toolUse.name, toolUse.input);
              
              if (!validation.valid) {
                // Track validation failures for circuit breaker
                const currentFailures = validationFailureCount.get(toolUse.name) || 0;
                validationFailureCount.set(toolUse.name, currentFailures + 1);
                
                // Circuit breaker - stop if too many failures for this tool
                if (currentFailures >= MAX_VALIDATION_FAILURES - 1) {
                  const errorMessage = `❌ CRITICAL: ${toolUse.name} has failed validation ${MAX_VALIDATION_FAILURES} times.

This indicates the tool is not being called correctly. Stopping execution to prevent infinite loop.

Last error: ${validation.error}

Please revise your approach or try a different method to accomplish the task.`;
                  
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: errorMessage,
                    is_error: true
                  });
                  
                  addMessage({
                    type: 'system',
                    content: `⚠️ Circuit breaker activated: ${toolUse.name} failed validation ${MAX_VALIDATION_FAILURES} times`,
                    color: 'red'
                  });
                  
                  // Exit the loop to prevent infinite retry
                  continueLoop = false;
                  break;
                }
                
                // Simple, clear error message
                const errorMessage = `Tool call validation failed: ${validation.error}

Check the tool examples in the system prompt. Each tool call needs this structure:
{
  "name": "tool_name",
  "input": { parameters }
}

This is attempt ${currentFailures + 1} of ${MAX_VALIDATION_FAILURES}.`;
                
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: errorMessage,
                  is_error: true
                });
                
                addVerboseMessage({
                  type: 'tool',
                  content: `  ↳ Validation Error (${currentFailures + 1}/${MAX_VALIDATION_FAILURES}): ${validation.error}`,
                  color: 'red'
                });
                
                continue; // Skip execution, let Claude see error and retry
              }
              
              // Reset failure count on successful validation
              validationFailureCount.set(toolUse.name, 0);
              
              // Check if tool requires approval based on approval level
              const approvalDecision = approvalManagerRef.current.shouldApprove(
                toolUse.name,
                validation.data
              );
              
              // If approval not required, execute directly
              if (!approvalDecision.requiresApproval) {
                const result = await handleToolCall({ ...toolUse, input: validation.data });
                
                // Handle edit_file/write_file/create_file that return pending changes
                if ((toolUse.name === 'edit_file' || toolUse.name === 'write_file' || toolUse.name === 'create_file') && result.content) {
                  try {
                    const parsed = typeof result.content === 'string' ? JSON.parse(result.content) : result.content;
                    
                    // If it has pending changes, auto-apply them (no approval needed at this level)
                    if (parsed.requiresApproval && parsed.pendingChanges) {
                      let applyResult;
                      
                      if (toolUse.name === 'edit_file') {
                        const { applyEditFileChanges } = await import('../tools/handlers/edit-file.js');
                        applyResult = applyEditFileChanges({
                          path: parsed.pendingChanges.path,
                          newContent: parsed.pendingChanges.newContent
                        });
                      } else if (toolUse.name === 'write_file') {
                        const { applyWriteFileChanges } = await import('../tools/handlers/write-file.js');
                        applyResult = applyWriteFileChanges({
                          path: parsed.pendingChanges.path,
                          newContent: parsed.pendingChanges.newContent
                        });
                      } else if (toolUse.name === 'create_file') {
                        const { applyCreateFileChanges } = await import('../tools/handlers/create-file.js');
                        applyResult = applyCreateFileChanges({
                          path: parsed.pendingChanges.path,
                          newContent: parsed.pendingChanges.newContent
                        });
                      }
                      
                      if (applyResult.success) {
                        toolResults.push({
                          type: 'tool_result',
                          tool_use_id: toolUse.id,
                          content: `✅ Changes applied to ${parsed.pendingChanges.path}`
                        });
                      } else {
                        toolResults.push({
                          type: 'tool_result',
                          tool_use_id: toolUse.id,
                          content: `❌ Failed to apply changes: ${applyResult.error}`,
                          is_error: true
                        });
                      }
                      
                      continue;
                    }
                  } catch (e) {
                    // Not a pending changes result, handle normally
                  }
                }
                
                toolResults.push(result);
                
                // Show tool badge before continuing
                if (mode !== 'execution') {
                  const filepath = toolUse.input?.path || toolUse.input?.command || '';
                  let statusMsg = '';
                  
                  if (toolUse.name === 'read_file' && typeof result.content === 'string') {
                    const lines = result.content.split('\n').length;
                    statusMsg = `Read ${lines} lines.`;
                  } else if (toolUse.name === 'list_files' && typeof result.content === 'string') {
                    const items = result.content.split('\n').filter(Boolean).length;
                    statusMsg = `Listed ${items} items.`;
                  } else if (toolUse.name === 'execute_command') {
                    statusMsg = 'Command executed successfully';
                  } else {
                    const preview = typeof result.content === 'string' 
                      ? result.content.substring(0, 100) + (result.content.length > 100 ? '...' : '')
                      : 'Success';
                    statusMsg = preview;
                  }
                  
                  addMessage({
                    type: 'tool',
                    content: toolUse.name,
                    toolName: toolUse.name,
                    filepath,
                    success: !result.is_error,
                    statusMessage: statusMsg
                  } as any);
                  
                  // Verbose output matches badge format
                  addVerboseMessage({
                    type: 'tool',
                    content: `  ↳ ${statusMsg}`,
                    color: 'gray'
                  });
                }
                
                continue;
              }
              
              // Execute with validated data (might return approval request)
              const result = await handleToolCall({ ...toolUse, input: validation.data });
              
              // Check if edit_file, write_file, or create_file returned approval request
              if ((toolUse.name === 'edit_file' || toolUse.name === 'write_file' || toolUse.name === 'create_file') && result.content) {
                try {
                  const parsed = typeof result.content === 'string' ? JSON.parse(result.content) : result.content;
                  if (parsed.requiresApproval && parsed.diff && parsed.pendingChanges) {
                    // Show diff and wait for user approval
                    const approval = await new Promise<'approve' | 'reject' | 'edit'>((resolve) => {
                      setPendingDiff({
                        path: parsed.pendingChanges.path,
                        oldContent: parsed.pendingChanges.oldContent,
                        newContent: parsed.pendingChanges.newContent,
                        diff: parsed.diff
                      });
                      setShowDiffApproval(true);
                      
                      // Store resolver in ref for useInput handler
                      const approvalResolver = resolve;
                      (globalThis as any).__pendingApprovalResolver = approvalResolver;
                    });
                    
                    // Hide diff UI
                    setShowDiffApproval(false);
                    setPendingDiff(null);
                    
                    if (approval === 'approve') {
                      // Apply the changes - use appropriate handler
                      let applyResult;
                      if (toolUse.name === 'edit_file') {
                        const { applyEditFileChanges } = await import('../tools/handlers/edit-file.js');
                        applyResult = applyEditFileChanges({
                          path: parsed.pendingChanges.path,
                          newContent: parsed.pendingChanges.newContent
                        });
                      } else if (toolUse.name === 'write_file') {
                        const { applyWriteFileChanges } = await import('../tools/handlers/write-file.js');
                        applyResult = applyWriteFileChanges({
                          path: parsed.pendingChanges.path,
                          newContent: parsed.pendingChanges.newContent
                        });
                      } else if (toolUse.name === 'create_file') {
                        const { applyCreateFileChanges } = await import('../tools/handlers/create-file.js');
                        applyResult = applyCreateFileChanges({
                          path: parsed.pendingChanges.path,
                          newContent: parsed.pendingChanges.newContent
                        });
                      }
                      
                      if (applyResult.success) {
                        toolResults.push({
                          type: 'tool_result',
                          tool_use_id: toolUse.id,
                          content: `✅ Changes applied to ${parsed.pendingChanges.path}`
                        });
                      } else {
                        toolResults.push({
                          type: 'tool_result',
                          tool_use_id: toolUse.id,
                          content: `❌ Failed to apply changes: ${applyResult.error}`,
                          is_error: true
                        });
                      }
                    } else {
                      toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: `❌ Changes rejected by user`
                      });
                    }
                    
                    // Show tool badge before continuing
                    if (mode !== 'execution') {
                      const filepath = toolUse.input?.path || toolUse.input?.command || '';
                      const statusMsg = approval === 'approve' 
                        ? `Changes applied to ${parsed.pendingChanges.path}`
                        : 'Changes rejected';
                      
                      addMessage({
                        type: 'tool',
                        content: toolUse.name,
                        toolName: toolUse.name,
                        filepath: parsed.pendingChanges.path,
                        success: approval === 'approve',
                        statusMessage: statusMsg
                      } as any);
                    }
                    
                    continue; // Skip normal result handling
                  }
                } catch (e) {
                  // Not a special approval result, handle normally
                }
              }
              
              toolResults.push(result);
              
              const resultPreview = typeof result.content === 'string' 
                ? result.content.substring(0, 100) + (result.content.length > 100 ? '...' : '')
                : 'Success';
              
              // Show tool badge with actual result in normal/planning modes
              if (mode !== 'execution') {
                const filepath = toolUse.input?.path || toolUse.input?.command || '';
                
                // Build formatted status message based on tool type
                let statusMsg = resultPreview;
                
                if (toolUse.name === 'read_file' && typeof result.content === 'string') {
                  const lines = result.content.split('\n').length;
                  statusMsg = `Read ${lines} lines.`;
                } else if (toolUse.name === 'list_files' && typeof result.content === 'string') {
                  const items = result.content.split('\n').filter(Boolean).length;
                  statusMsg = `Listed ${items} items.`;
                } else if (toolUse.name === 'execute_command') {
                  statusMsg = 'Command executed successfully';
                }
                
                addMessage({
                  type: 'tool',
                  content: toolUse.name,
                  toolName: toolUse.name,
                  filepath: filepath,
                  success: !result.is_error,
                  statusMessage: statusMsg
                } as any);
                
                addVerboseMessage({
                  type: 'tool',
                  content: `  ↳ ${statusMsg}`,
                  color: 'gray'
                });
              }
            } catch (error: any) {
              // Add error as tool result
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `Error: ${error.message}`,
                is_error: true
              });
              
              // Show error in badge
              if (mode !== 'execution') {
                const filepath = toolUse.input?.path || toolUse.input?.command || '';
                addMessage({
                  type: 'tool',
                  content: toolUse.name,
                  toolName: toolUse.name,
                  filepath: filepath,
                  success: false,
                  statusMessage: `Error: ${error.message}`
                } as any);
              }
              
              addVerboseMessage({
                type: 'tool',
                content: `  ↳ Error: ${error.message}`,
                color: 'red'
              });
            }
          }
          
          // Add tool results to conversation as user message
          conversationHistory.push({
            role: 'user',
            content: toolResults
          });
          
          // Reset stream message ID for next turn
          streamingMessageIdRef.current = null;
          
          // Update status for next iteration
          setCurrentStatus('Processing results...');
          
        } else {
          // No tool calls - Claude provided final answer, exit loop
          continueLoop = false;
          
          // Save assistant's final response to persisted history
          const finalAssistantMessage = conversationHistory[conversationHistory.length - 1];
          if (finalAssistantMessage && finalAssistantMessage.role === 'assistant') {
            // Extract text content from assistant message
            let textContent = '';
            if (Array.isArray(finalAssistantMessage.content)) {
              for (const block of finalAssistantMessage.content) {
                if (block.type === 'text') {
                  textContent += block.text;
                }
              }
            } else {
              textContent = finalAssistantMessage.content;
            }
            
            executionHistoryRef.current.push({
              role: 'assistant',
              content: textContent
            });
          }
        }
      }
      
      setIsRunning(false);
      setIsStreaming(false);
      setShowStatus(false);
      setCurrentStatus('');
      streamingMessageIdRef.current = null;
      abortControllerRef.current = null;
      
    } catch (error: any) {
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        setIsRunning(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
        return;
      }
      
      addMessage({
        type: 'system',
        content: `Error: ${error.message}`,
        color: 'red'
      });
      setIsRunning(false);
      setIsStreaming(false);
      setShowStatus(false);
      setCurrentStatus('');
      streamingMessageIdRef.current = null;
      abortControllerRef.current = null;
    }
  };
  
  // Execute a specific agent directly (user invoked with @agentname)
  const executeAgentDirectly = async (agentName: string, task: string, fileContexts: any[]) => {
    setIsRunning(true);
    setIsStreaming(true);
    streamingMessageIdRef.current = null;
    
    // Build contextual prompt or multimodal content if files/images attached
    const contextualTask = fileContexts.length > 0 
      ? buildMultimodalContent(task, fileContexts)
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
      let tools = toolNames.map((name: string) => {
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
      
      // Add MCP tools to agent
      try {
        const mcpManager = orchestratorRef.current?.getMCPManager();
        if (mcpManager) {
          const { MCPToolRegistry } = await import('../tools/mcp-tools.js');
          const mcpToolRegistry = new MCPToolRegistry(mcpManager);
          const mcpTools = await mcpToolRegistry.getAllClaudeTools();
          tools = [...tools, ...mcpTools];
          
          if (mcpTools.length > 0) {
            console.error(`[MCP] Added ${mcpTools.length} MCP tools to agent execution`);
          }
        }
      } catch (error) {
        console.error('[MCP] Failed to load MCP tools for agent:', error);
      }
      
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
      abortControllerRef.current = null;
      
    } catch (error: any) {
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        setIsRunning(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
        return;
      }
      
      addMessage({
        type: 'system',
        content: `Agent error: ${error.message}`,
        color: 'red'
      });
      setIsRunning(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
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
    
    // Show spawn agents marker at the start
    addMessage({
      type: 'system',
      content: '\n[Spawn Agents]'
    });

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



    let spawnAgentsShown = true; // Already shown at start
    const completedStreams = new Set<string>();

    const orchestrator = new Orchestrator({
      onEvent: (event) => {
        switch (event.type) {
          case 'phase_change':
            // Don't clear streamMessageIdsRef - let each stream track continuously
            
            // When intelligence phase starts, prepare for agent output
            if (event.phase === 'intelligence') {
              setCurrentStatus('Invoking tools...');
              
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
                  prev.map(m => {
                    if (m.timestamp === existingMsgId && 'content' in m && typeof m.content === 'string') {
                      return { ...m, content: smartConcat(m.content, event.chunk) } as Message;
                    }
                    return m;
                  })
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
                prev.map(m => {
                  if (m.timestamp === existingMsgId && 'content' in m && typeof m.content === 'string') {
                    return { ...m, content: smartConcat(m.content, event.chunk) } as Message;
                  }
                  return m;
                })
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
    // HIGHEST PRIORITY: Ignore all input when MCP menu is active
    // (except ESC to close the menu)
    if (showMCPMenu) {
      if (key.escape) {
        setShowMCPMenu(false);
        setMCPView('main');
        return;
      }
      return; // Block all other input when MCP menu is open
    }
    
    // While SelectInput is active (autocomplete/slash commands),
    // let it handle navigation keys to prevent interference
    if ((showAutocomplete || showSlashCommands) && 
        (key.return || key.upArrow || key.downArrow || key.tab)) {
      return; // Let SelectInput handle these keys
    }
    
    // Alt+V to paste clipboard image
    if (key.meta && inputChar === 'v') {
      (async () => {
        const imagePath = await getClipboardImage();
        
        if (imagePath) {
          const { contexts, errors } = await resolveFileMentions([imagePath], process.cwd());
          
          if (contexts.length > 0) {
            setAttachedFiles(prev => [...prev, ...contexts]);
          }
          
          for (const error of errors) {
            addMessage({
              type: 'system',
              content: error,
              color: 'yellow'
            });
          }
        } else {
          addMessage({
            type: 'system',
            content: '⚠️ No image in clipboard',
            color: 'yellow'
          });
        }
      })();
      return;
    }
    
    // Ctrl+O to toggle verbose output
    if (key.ctrl && inputChar === 'o') {
      setShowVerbose(prev => !prev);
      return;
    }
    
    // Ctrl+T to cycle approval levels
    if (key.ctrl && inputChar === 't') {
      const currentLevel = approvalManagerRef.current.getLevel();
      const nextLevel = ((currentLevel + 1) % 4) as ApprovalLevel;
      approvalManagerRef.current.updateLevel(nextLevel);
      setApprovalLevel(nextLevel);
      return;
    }
    
    // Shift+Tab to cycle modes
    if (key.tab && key.shift) {
      // Don't cycle if dropdowns are active
      if (showAutocomplete || showSlashCommands) {
        return;
      }
      
      // Cycle: normal → planning → execution → normal
      if (mode === 'normal') {
        setMode('planning');
        if (planningHistoryRef.current.length === 0) {
          planningHistoryRef.current = [];
        }
      } else if (mode === 'planning') {
        setMode('execution');
        executionHistoryRef.current = [];
        streamMessageIdsRef.current = {};
      } else {
        setMode('normal');
      }
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
      
      // Stop execution/streaming - handleStop now handles all modes
      if (isRunning || isStreaming) {
        handleStop();
        // Clear message queue
        setMessageQueue([]);
        return;
      }
    }

    // Handle diff approval
    if (showDiffApproval && pendingDiff) {
      if (inputChar === 'a') {
        // Approve - notify orchestrator OR write_file approval resolver
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('approve');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('approve');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({
          type: 'system',
          content: `✅ Approving changes to ${pendingDiff.path}`,
          color: 'green'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (inputChar === 'r') {
        // Reject - notify orchestrator OR write_file approval resolver
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('reject');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('reject');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({
          type: 'system',
          content: `❌ Changes rejected`,
          color: 'yellow'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (inputChar === 'e') {
        // Edit - notify orchestrator OR write_file approval resolver
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('edit');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('edit');
          delete (globalThis as any).__pendingApprovalResolver;
        }
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
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('reject');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('reject');
          delete (globalThis as any).__pendingApprovalResolver;
        }
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
          setCursorPosition(newInput.length);
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
          setCursorPosition(newInput.length);
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
          setCursorPosition(newInput.length);
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
          setCursorPosition(newInput.length);
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
        setAttachedFiles([]);
        return;
      }
      
      // Normal send
      handleUserInput(input);
      setInput('');
      setCursorPosition(0);
    } else if (key.backspace || key.delete) {
      setInput(prev => {
        const newInput = prev.slice(0, -1);
        setCursorPosition(newInput.length);
        return newInput;
      });
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
        
        setCursorPosition(newInput.length);
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
    // Find the last @ position to properly replace the mention
    const lastAtIndex = input.lastIndexOf('@');
    
    let newInput: string;
    if (lastAtIndex === -1) {
      // No @ found (shouldn't happen), just append
      newInput = input + '@' + item.value + ' ';
    } else {
      // Replace from @ onwards with the selected file
      newInput = input.substring(0, lastAtIndex) + '@' + item.value + ' ';
    }
    
    // Close autocomplete immediately
    setShowAutocomplete(false);
    setAutocompleteOptions([]);
    setAtPosition(-1);
    
    // Update input with small delay to ensure clean state and force re-render
    setTimeout(() => {
      setInput(newInput);
      setCursorPosition(newInput.length);
      setInputKey(k => k + 1); // Force input Box re-mount
    }, 10);
  };
  
  // Handle slash command selection
  const handleSlashCommandSelect = (item: {label: string, value: string}) => {
    const newInput = item.value + ' ';
    setInput(newInput);
    setCursorPosition(newInput.length);
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
    // Detect drag-dropped image paths (Windows: C:\path\file.png, Unix: /path/file.png)
    const imagePathPattern = /(?:[A-Z]:\\[\w\s\-().\\/]+|\/[\w\s\-().\\/]+)\.(png|jpg|jpeg|gif|webp|bmp)/gi;
    const imagePaths = input.match(imagePathPattern);
    
    // Auto-attach detected image paths
    if (imagePaths && imagePaths.length > 0) {
      for (const imagePath of imagePaths) {
        const { contexts, errors } = await resolveFileMentions([imagePath.trim()], process.cwd());
        if (contexts.length > 0) {
          setAttachedFiles(prev => [...prev, ...contexts]);
          addMessage({
            type: 'system',
            content: `🖼️ Image auto-attached: ${path.basename(imagePath)}`,
            color: 'cyan'
          });
          // Remove the path from input
          input = input.replace(imagePath, '').trim();
        }
        for (const error of errors) {
          addMessage({
            type: 'system',
            content: error,
            color: 'yellow'
          });
        }
      }
    }
    
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
    }
    
    // Merge with already-attached files from state (Alt+V clipboard images, etc.)
    fileContexts = [...attachedFiles, ...fileContexts];
    
    // Set attached files (shown above input)
    if (fileContexts.length > 0) {
      setAttachedFiles(fileContexts);
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
/plan or /spec ...... Switch to specification mode
/exec <task> ........ Execute task in execution mode
/normal ............. Switch to normal mode
/mcp ................ MCP server management
/approval [0-3] ..... View/set tool approval level
/clear .............. Clear conversation history
/context reset ...... Reset workspace context
/context show ....... Show current workspace context
/exit ............... Quit indokq CLI

Normal Mode (default - current: ${mode}):
- Talk naturally and Claude will use tools to help you
- Example: "create a hello.txt file"
- Example: "analyze the codebase structure"
- Quick tasks and exploratory work

Specification Mode:
- Describe features in simple terms (4-6 sentences)
- indokq generates detailed spec with implementation plan
- Review and approve before any code changes
- Automatic safety checks and verification
- Example: "Add MCP server connection with UI management"

Execution Mode:
- Full AI agent with multi-phase intelligence system
- Parallel intelligence streams (terminus, web research, strategy, etc.)
- Automated task execution
- Example: /exec "refactor the authentication system"

Keyboard Shortcuts:
Shift+Tab ........... Cycle modes (normal → spec → execution)
Alt+V ............... Paste clipboard image
Ctrl+O .............. Toggle verbose output
Ctrl+T .............. Cycle approval level (OFF→LOW→MEDIUM→HIGH)
ESC ................. Cancel operation / Close menus

File & Image Attachment:
@filename ........... Attach files to your query
                      Example: @app.tsx how does this work?
Alt+V ............... Paste image from clipboard (screenshots)
Drag & Drop ......... Drag image files into terminal

Explicit agent invocation:
  @terminus <task> ....... Quick exploration agent
  @environment <task> .... System state analyzer
  @intelligence <task> ... Meta-agent coordinator
  (and more agents available...)

Supported images: .png, .jpg, .jpeg, .gif, .webp, .bmp

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
      memoryManagerRef.current.clear(); // Clear conversation memory
      setAttachedFiles([]);
      workspaceContextAddedRef.current = false;
      return;
    }
    
    // MCP command
    if (finalInput === '/mcp') {
      setShowMCPMenu(true);
      setMCPView('main');
      setInput('');
      return;
    }
    
    // Approval level command
    if (finalInput.startsWith('/approval')) {
      const args = finalInput.split(/\s+/);
      if (args.length === 1) {
        // Show current level
        const currentLevel = approvalManagerRef.current.getLevel();
        const levelName = approvalManagerRef.current.getLevelName();
        addMessage({
          type: 'system',
          content: `Current approval level: ${currentLevel} (${levelName})

Approval Levels:
  0 (OFF)    - All tools require approval
  1 (LOW)    - Only modifications require approval (read-only auto-allowed)
  2 (MEDIUM) - Reversible operations auto-allowed: reads, file edits, safe commands
               Dangerous/irreversible require approval: rm -rf, git push, sudo, docker, MCP
  3 (HIGH)   - All tools auto-allowed (full automation)

To change level: /approval [0-3]
Example: /approval 1`,
          color: 'cyan'
        });
      } else {
        const newLevel = parseInt(args[1]);
        if (isNaN(newLevel) || newLevel < 0 || newLevel > 3) {
          addMessage({
            type: 'system',
            content: '❌ Invalid approval level. Must be 0, 1, 2, or 3.',
            color: 'red'
          });
        } else {
          approvalManagerRef.current.updateLevel(newLevel as ApprovalLevel);
          setApprovalLevel(newLevel as ApprovalLevel);
          const levelName = approvalManagerRef.current.getLevelName();
          addMessage({
            type: 'system',
            content: `✓ Approval level set to ${newLevel} (${levelName})`,
            color: 'green'
          });
        }
      }
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
      return;
    }
    
    // Plan/Spec command - switch to specification mode
    if (finalInput.startsWith('/plan') || finalInput.startsWith('/spec')) {
      const message = finalInput.startsWith('/plan') 
        ? finalInput.slice(5).trim() 
        : finalInput.slice(5).trim();
      
      // Always switch to planning mode
      setMode('planning');
      
      if (planningHistoryRef.current.length === 0) {
        // First time entering planning - clear history
        planningHistoryRef.current = [];
      }
      
      if (message) {
        // User provided message - process it
        handleUserInput(message);
      }
      return;
    }
    
    // Exec command - switch to execution mode
    if (finalInput.startsWith('/exec')) {
      const task = finalInput.slice(5).trim();
      
      // Always switch to execution mode
      setMode('execution');
      executionHistoryRef.current = [];
      streamMessageIdsRef.current = {};
      
      if (task) {
        // User provided task - execute it
        const contextualTask = fileContexts.length > 0 
          ? buildContextualPrompt(task, fileContexts)
          : task;
        executeInExecutionMode(contextualTask, true);
        setAttachedFiles([]);
      }
      return;
    }

    // Exit command
    if (finalInput === '/exit') {
      process.exit(0);
    }

    // Build user message with inline image indicators
    let userMessage = finalInput;
    if (fileContexts.length > 0) {
      const imageCount = fileContexts.filter(f => f.isImage).length;
      if (imageCount > 0) {
        const imageIndicators = fileContexts
          .filter(f => f.isImage)
          .map((_, idx) => `[image#${idx + 1}]`)
          .join(' ');
        userMessage = `${imageIndicators} ${finalInput}`;
      }
    }
    
    // Add user message to stream
    addMessage({
      type: 'user',
      content: userMessage,
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
        // Read-only tools for planning mode
        const readOnlyTools = [listFilesTool, readFileTool, searchFilesTool, grepCodebaseTool];
        
        let firstChunk = true;
        let turnCount = 0;
        let continueLoop = true;
        
        // Multi-turn loop: keep going while Claude makes tool calls
        while (continueLoop && !abortControllerRef.current?.signal.aborted) {
          turnCount++;
          
          // Build context-aware prompt for first turn
          let systemPrompt: any = undefined;
          if (turnCount === 1) {
            const augmentedPrompt = await promptBuilderRef.current.buildPrompt(
              contextualInput,
              PLANNING_SYSTEM_PROMPT,
              {
                includeWorkspaceOverview: true,
                includeRelevantFiles: true,
                includeToolHistory: true,
                includeSessionSummary: true,
                mode: 'planning',
                maxContextTokens: 3000
              }
            );
            systemPrompt = augmentedPrompt.system;
          }
          
          const stream = claudeClient.streamMessage({
            system: systemPrompt,
            messages: planningHistoryRef.current,
            max_tokens: 16384,
            tools: readOnlyTools
          });

          let textContent = '';
          let toolUses: any[] = [];
          let currentToolUseIndex = -1;
          
          for await (const chunk of stream) {
            // Check if aborted
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }
            
            // Handle text content
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
              textContent += chunk.delta.text;
              handleStreamChunk(chunk.delta.text);
            }
            
            // Handle tool call start
            if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
              toolUses.push({
                ...chunk.content_block,
                input: {},
                _inputBuffer: ''
              });
              currentToolUseIndex = toolUses.length - 1;
            }
            
            // Accumulate tool input JSON
            if (chunk.type === 'content_block_delta') {
              const lastToolUse = toolUses[currentToolUseIndex];
              if (lastToolUse && chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
                lastToolUse._inputBuffer = (lastToolUse._inputBuffer || '') + chunk.delta.partial_json;
              }
            }
            
            // Parse complete tool input
            if (chunk.type === 'content_block_stop') {
              const lastToolUse = toolUses[currentToolUseIndex];
              if (lastToolUse && lastToolUse._inputBuffer) {
                try {
                  lastToolUse.input = JSON.parse(lastToolUse._inputBuffer);
                  delete lastToolUse._inputBuffer;
                } catch (e) {
                  console.error('Failed to parse tool input:', lastToolUse._inputBuffer);
                }
              }
            }
          }

          // Build structured assistant message
          const assistantContent: any[] = [];
          if (textContent) {
            assistantContent.push({ type: 'text', text: textContent });
          }
          for (const toolUse of toolUses) {
            assistantContent.push({
              type: 'tool_use',
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input
            });
          }
          
          planningHistoryRef.current.push({
            role: 'assistant',
            content: assistantContent
          });

          // If no tool calls, we're done
          if (toolUses.length === 0) {
            continueLoop = false;
            break;
          }

          // Execute tools
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }
          
          const toolResults = [];
          for (const toolUse of toolUses) {
            setCurrentStatus(`Reading: ${toolUse.name}...`);
            setShowStatus(true);
            
            try {
              const result = await handleToolCall({
                type: 'tool_use',
                id: toolUse.id,
                name: toolUse.name,
                input: toolUse.input
              });
              toolResults.push(result);
            } catch (error: any) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `Error: ${error.message}`,
                is_error: true
              });
            }
          }
          
          // Add tool results to history
          planningHistoryRef.current.push({
            role: 'user',
            content: toolResults as any
          });
          
          // Reset stream for next turn
          streamingMessageIdRef.current = null;
          setCurrentStatus('Thinking...');
          setShowStatus(true);
        }

        // Process queued messages
        if (!abortControllerRef.current?.signal.aborted) {
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
          setIsStreaming(false);
          abortControllerRef.current = null;
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
      
      {/* MCP Menu */}
      {showMCPMenu && (
        <Box flexDirection="column">
          {mcpView === 'main' && (
            <MCPMainMenu
              manager={orchestratorRef.current?.getMCPManager()!}
              onSelect={(view) => {
                if (view === 'back') {
                  setShowMCPMenu(false);
                } else {
                  setMCPView(view);
                }
              }}
            />
          )}
          {mcpView === 'list' && (
            <MCPServerList
              manager={orchestratorRef.current?.getMCPManager()!}
              onSelectServer={(serverId) => {
                setSelectedServerId(serverId);
                setMCPView('details');
              }}
              onBack={() => setMCPView('main')}
              onAdd={() => setMCPView('add')}
            />
          )}
          {mcpView === 'add' && (
            <MCPAddServerForm
              manager={orchestratorRef.current?.getMCPManager()!}
              onSuccess={() => {
                setMCPView('list');
                addMessage({
                  type: 'system',
                  content: '✓ MCP server added successfully!',
                  color: 'green'
                });
              }}
              onCancel={() => setMCPView('main')}
            />
          )}
          {mcpView === 'details' && selectedServerId && (
            <MCPServerDetails
              manager={orchestratorRef.current?.getMCPManager()!}
              serverId={selectedServerId}
              onBack={() => setMCPView('list')}
              onDisconnect={async () => {
                try {
                  const servers = await orchestratorRef.current?.getMCPManager().getConnectedServers();
                  const server = servers?.find(s => s.id === selectedServerId);
                  if (server) {
                    await orchestratorRef.current?.getMCPManager().disconnectServer(server.name);
                    addMessage({
                      type: 'system',
                      content: `✓ Disconnected from ${server.name}`,
                      color: 'green'
                    });
                  }
                  setMCPView('list');
                } catch (error: any) {
                  addMessage({
                    type: 'system',
                    content: `✗ Error: ${error.message}`,
                    color: 'red'
                  });
                }
              }}
              onRemove={async () => {
                try {
                  await orchestratorRef.current?.getMCPManager().removeServer(selectedServerId);
                  addMessage({
                    type: 'system',
                    content: '✓ Server removed successfully',
                    color: 'green'
                  });
                  setMCPView('list');
                } catch (error: any) {
                  addMessage({
                    type: 'system',
                    content: `✗ Error: ${error.message}`,
                    color: 'red'
                  });
                }
              }}
            />
          )}
        </Box>
      )}
      
      {/* Input section */}
      <Box flexDirection="column">
        {/* Terminal-style inline input prompt with folder and mode indicator */}
        {(() => {
          // Validate cursor position
          const validCursorPos = Math.max(0, Math.min(cursorPosition, input.length));
          
          // Handle empty input
          if (!input) {
            return (
              <Box key={inputKey} paddingX={1} flexDirection="row">
                <Text color={mode === 'normal' ? 'cyan' : mode === 'planning' ? 'yellow' : 'green'}>
                  {folderName} ({mode}) &gt;{' '}
                </Text>
                {attachedFiles.length > 0 && (
                  <Text color="gray">
                    {attachedFiles.filter(f => f.isImage).map((_, idx) => `[image#${idx + 1}]`).join(' ')}{' '}
                  </Text>
                )}
                <Text inverse> </Text>
              </Box>
            );
          }
          
          const lines = input.split('\n');
          let charCount = 0;
          let cursorLine = 0;
          let cursorCol = 0;

          // Find which line the cursor is on
          for (let i = 0; i < lines.length; i++) {
            if (charCount + lines[i].length >= validCursorPos) {
              cursorLine = i;
              cursorCol = validCursorPos - charCount;
              break;
            }
            charCount += lines[i].length + 1; // +1 for \n
          }
          
          // Handle cursor at very end (after last newline)
          if (validCursorPos >= input.length) {
            cursorLine = lines.length - 1;
            cursorCol = lines[cursorLine].length;
          }

          return lines.map((line, idx) => (
            <Box key={`${inputKey}-${idx}`} paddingX={1} flexDirection="row">
              {idx === 0 && (
                <>
                  <Text color={mode === 'normal' ? 'cyan' : mode === 'planning' ? 'yellow' : 'green'}>
                    {folderName} ({mode}) &gt;{' '}
                  </Text>
                  {attachedFiles.length > 0 && (
                    <Text color="gray">
                      {attachedFiles.filter(f => f.isImage).map((_, idx) => `[image#${idx + 1}]`).join(' ')}{' '}
                    </Text>
                  )}
                </>
              )}
              {idx > 0 && <Text>  </Text>}
              <Text>{idx === cursorLine ? line.slice(0, cursorCol) : line}</Text>
              {idx === cursorLine && <Text inverse> </Text>}
              {idx === cursorLine && <Text>{line.slice(cursorCol)}</Text>}
            </Box>
          ));
        })()}
      </Box>

      {/* Approval level indicator */}
      <Box paddingX={1}>
        {(() => {
          const level = approvalLevel;
          const levelName = approvalManagerRef.current.getLevelName();
          
          const colors: Record<ApprovalLevel, string> = {
            0: 'red',     // OFF
            1: 'yellow',  // LOW
            2: 'cyan',    // MEDIUM
            3: 'green'    // HIGH
          };
          
          return (
            <Text dimColor>
              Approval: <Text color={colors[level]}>{levelName}</Text> | Use /approval to change
            </Text>
          );
        })()}
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

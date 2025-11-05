import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Orchestrator } from '../core/orchestrator.js';
import { Phase, WebSearch, AppMode, Message } from '../core/types.js';
import { MessageStream } from './components/MessageStream.js';
import { claudeClient } from '../core/models/claude-client.js';
import { PLANNING_SYSTEM_PROMPT } from '../config/prompts.js';
import path from 'path';

interface AppProps {
  initialTask?: string;
}

export const App: React.FC<AppProps> = ({ initialTask }) => {
  // Unified state
  const [mode, setMode] = useState<AppMode>('planning');
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
  const streamBufferRef = useRef<string>('');
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track separate messages for each intelligence stream
  const streamMessageIdsRef = useRef<Record<string, number>>({});
  
  // Message counter for unique keys
  const messageCounterRef = useRef<number>(0);
  
  // Planning history for multi-turn conversations
  const planningHistoryRef = useRef<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Spinner animation
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % 10);
    }, 80);
    
    return () => clearInterval(interval);
  }, [isRunning]);

  // Helper to add messages
  const addMessage = (msg: Omit<Message, 'timestamp'>) => {
    messageCounterRef.current += 1;
    setMessages(prev => [...prev, { 
      ...msg, 
      timestamp: messageCounterRef.current
      // Let assistant messages use default terminal color (no explicit color)
    }]);
  };

  // Throttled stream update
  const handleStreamChunk = (chunk: string) => {
    streamBufferRef.current += chunk;
    
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
    }
    
    streamTimeoutRef.current = setTimeout(() => {
      if (streamingMessageIdRef.current !== null) {
        // Update existing streaming message
        setMessages(prev =>
          prev.map(m =>
            m.timestamp === streamingMessageIdRef.current
              ? { ...m, content: m.content + streamBufferRef.current }
              : m
          )
        );
      } else {
        // Create new streaming message
        const msgId = Date.now();
        streamingMessageIdRef.current = msgId;
        addMessage({
          type: 'assistant',
          content: streamBufferRef.current,
          icon: '🤖',
          color: 'cyan'
        });
      }
      streamBufferRef.current = '';
    }, 50);
  };

  const handleStop = () => {
    if (isRunning) {
      setIsRunning(false);
      setShowStatus(false);
      addMessage({
        type: 'system',
        content: 'Execution stopped by user (ESC)',
        icon: '⛔',
        color: 'red'
      });
      
      // Abort any ongoing operations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  };

  const executeInExecutionMode = async (task: string) => {
    setIsRunning(true);
    setCurrentTask(task);
    abortControllerRef.current = new AbortController();
    
    // Reset status tracking
    hasReceivedFirstChunkRef.current = false;
    setCurrentStatus('Thinking...');
    setShowStatus(true);

    const agentInfo: Record<string, { name: string; description: string }> = {
      terminus: { name: 'Terminus', description: 'Quick initial exploration and reasoning' },
      environment: { name: 'Environment', description: 'Analyze system state and environment' },
      strategy: { name: 'Strategy', description: 'Generate strategic approaches' },
      exploration: { name: 'Exploration', description: 'Safe testing in Docker containers' },
      search: { name: 'Web Research', description: 'Research relevant information' },
      prediction: { name: 'Prediction', description: 'Analyze task requirements' },
      synthesis: { name: 'Synthesis', description: 'Combine intelligence findings' },
      execution: { name: 'Execution', description: 'Execute the final plan' }
    };

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
            }
            
            if (event.phase === 'complete') {
              setShowStatus(false);
              streamMessageIdsRef.current = {}; // Clear tracking when fully complete
            }
            break;

          case 'text_chunk':
            // First chunk from orchestrator
            if (event.streamId === 'orchestrator' && !hasReceivedFirstChunkRef.current) {
              hasReceivedFirstChunkRef.current = true;
              setShowStatus(false);
              
              // Show "IndoKQ:" header right before response
              addMessage({
                type: 'system',
                content: '\nIndoKQ:',
                color: 'cyan'
              });
            }
            
            // Any agent running means we're in agent execution phase
            if (event.streamId !== 'orchestrator' && agentInfo[event.streamId]) {
              setCurrentStatus('Agents running...');
            }
            
            const existingMsgId = streamMessageIdsRef.current[event.streamId];
            
            if (existingMsgId) {
              setMessages(prev =>
                prev.map(m =>
                  m.timestamp === existingMsgId
                    ? { ...m, content: m.content + event.chunk }
                    : m
                )
              );
            } else {
              // First chunk - show agent spawn announcement
              const agent = agentInfo[event.streamId];
              if (agent && !completedStreams.has(event.streamId)) {
                addMessage({
                  type: 'system',
                  content: `\n@indokq/${event.streamId}@1.0.0:\n${agent.description}`
                });
              }
              
              // Create message first, then capture its ID
              addMessage({
                type: 'assistant',
                content: event.chunk
                // No color - use default terminal color
              });
              const msgId = messageCounterRef.current; // Get the ID that was just assigned
              streamMessageIdsRef.current[event.streamId] = msgId;
            }
            break;

          case 'tool_requested':
            // Hide individual tool calls to reduce noise
            break;

          case 'tool_result':
            // Hide individual tool results
            // Show completion marker only once per stream when it finishes
            if (!completedStreams.has(event.streamId)) {
              const agent = agentInfo[event.streamId];
              if (agent) {
                const completionId = Math.random().toString(36).substring(2, 12).toUpperCase();
                addMessage({
                  type: 'system',
                  content: `----------- Done the ${agent.name} (${completionId}) -----------`
                });
                completedStreams.add(event.streamId);
              }
            }
            break;

          case 'tool_error':
            // Only show errors, not every tool result
            addMessage({
              type: 'log',
              content: `\n⚠️  Error: ${event.error}\n`
            });
            break;

          case 'web_search':
            break;
        }
      },

      onComplete: (result) => {
        setIsRunning(false);
      },

      onError: (err) => {
        addMessage({
          type: 'system',
          content: `\nError: ${err.message}`
        });
        setIsRunning(false);
      }
    });

    orchestrator.executeTask(task).catch(err => {
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
    // ESC to stop execution
    if (key.escape && isRunning) {
      handleStop();
      return;
    }

    // Don't accept input while running
    if (isRunning || isStreaming) return;

    // Handle text input
    if (key.return && input.trim()) {
      handleUserInput(input);
      setInput('');
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && !key.shift && inputChar) {
      setInput(prev => prev + inputChar);
    }
  });

  const handleUserInput = async (input: string) => {
    // Help command
    if (input === '/help') {
      addMessage({
        type: 'system',
        content: `
/help ............... Display help information
/exec <task> ........ Execute task in execution mode
/clear .............. Clear conversation history
/exit ............... Quit IndoKQ CLI

Tip: Type your message for planning or use /exec for direct execution
        `
      });
      return;
    }

    // Clear command
    if (input === '/clear') {
      setMessages([]);
      planningHistoryRef.current = [];
      return;
    }

    // Exec command - switch to execution and run
    if (input.startsWith('/exec ')) {
      const task = input.slice(6).trim();
      if (task) {
        setMode('execution');
        executeInExecutionMode(task);
      }
      return;
    }

    // Exit command
    if (input === '/exit') {
      process.exit(0);
    }

    // Add user message to stream with spacing
    addMessage({
      type: 'user',
      content: `\n${input}`,
      icon: '💬',
      color: 'green'
    });

    if (mode === 'planning') {

      // Planning mode - chat with Claude
      planningHistoryRef.current.push({ role: 'user', content: input });
      setIsStreaming(true);
      streamingMessageIdRef.current = null;
      
      // Show thinking status
      setCurrentStatus('Thinking...');
      setShowStatus(true);

      try {
        const stream = claudeClient.streamMessage({
          system: PLANNING_SYSTEM_PROMPT,
          messages: planningHistoryRef.current,
          max_tokens: 8192
        });

        let fullResponse = '';
        let firstChunk = true;
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            if (firstChunk) {
              firstChunk = false;
              setShowStatus(false);
              addMessage({
                type: 'system',
                content: '\nIndoKQ:',
                color: 'cyan'
              });
            }
            fullResponse += chunk.delta.text;
            handleStreamChunk(chunk.delta.text);
          }
        }

        // Save to history
        planningHistoryRef.current.push({ role: 'assistant', content: fullResponse });
        streamingMessageIdRef.current = null;
      } catch (error: any) {
        addMessage({
          type: 'system',
          content: `Error: ${error.message}`,
          icon: '❌',
          color: 'red'
        });
      } finally {
        setIsStreaming(false);
        setShowStatus(false);
      }
    } else {
      // Execution mode - run task directly
      executeInExecutionMode(input);
    }
  };

  const folderName = path.basename(process.cwd());

  return (
    <Box flexDirection="column" height="100%">
      {/* Main Message Stream - Clean continuous output */}
      <Box flexGrow={1} flexDirection="column" paddingY={1} paddingX={1}>
        <MessageStream messages={messages} />
        
        {/* Show status spinner with current activity */}
        {showStatus && (
          <Box marginTop={1}>
            <Text color="gray">{['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][spinnerFrame]} {currentStatus}</Text>
          </Box>
        )}
      </Box>

      {/* Terminal-style inline input prompt */}
      <Box paddingX={1} paddingY={1} marginTop={1}>
        <Text color="green">{folderName} &gt; </Text>
        <Text>{input}</Text>
        <Text inverse> </Text>
      </Box>
    </Box>
  );
};

import { MutableRefObject } from 'react';
import { Orchestrator } from '../../core/orchestrator.js';
import { buildContextualPrompt } from '../../tools/file-context.js';
import { AGENT_INFO } from '../utils/agentInfo.js';
import { smartConcat } from '../utils/messageHelpers.js';
import { Message, AppMode } from '../../core/types.js';

interface UseExecutionModeProps {
  setIsRunning: (value: boolean) => void;
  setCurrentTask: (value: string) => void;
  setMode: (mode: AppMode) => void;
  setCurrentStatus: (value: string) => void;
  setShowStatus: (value: boolean) => void;
  setVerboseMessages: (updater: (prev: Message[]) => Message[]) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setMessageQueue: (updater: (prev: string[]) => string[]) => void;
  setPendingDiff: (diff: any) => void;
  setShowDiffApproval: (value: boolean) => void;
  addMessage: (msg: any) => void;
  addVerboseMessage: (msg: any) => void;
  handleUserInput: (input: string) => void;
  hasReceivedFirstChunkRef: MutableRefObject<boolean>;
  streamMessageIdsRef: MutableRefObject<Record<string, number>>;
  messageCounterRef: MutableRefObject<number>;
  executionHistoryRef: MutableRefObject<Array<{ role: 'user' | 'assistant', content: any }>>;
  planningHistoryRef: MutableRefObject<Array<{ role: 'user' | 'assistant', content: any }>>;
  orchestratorRef: MutableRefObject<Orchestrator | null>;
  abortControllerRef: MutableRefObject<AbortController | null>;
}

export const useExecutionMode = (props: UseExecutionModeProps) => {
  const {
    setIsRunning,
    setCurrentTask,
    setMode,
    setCurrentStatus,
    setShowStatus,
    setVerboseMessages,
    setMessages,
    setMessageQueue,
    setPendingDiff,
    setShowDiffApproval,
    addMessage,
    addVerboseMessage,
    handleUserInput,
    hasReceivedFirstChunkRef,
    streamMessageIdsRef,
    messageCounterRef,
    executionHistoryRef,
    planningHistoryRef,
    orchestratorRef,
    abortControllerRef
  } = props;

  const executeInExecutionMode = async (task: string, isFirstMessage: boolean = false) => {
    setIsRunning(true);
    setCurrentTask(task);
    abortControllerRef.current = new AbortController();
    
    // Reset status tracking
    hasReceivedFirstChunkRef.current = false;
    setCurrentStatus('Thinking...');
    setShowStatus(true);
    
    // Clear verbose messages for new execution
    setVerboseMessages(() => []);
    
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

    const completedStreams = new Set<string>();

    const orchestrator = new Orchestrator({
      onEvent: (event) => {
        switch (event.type) {
          case 'phase_change':
            if (event.phase === 'intelligence') {
              setCurrentStatus('Invoking tools...');
              delete streamMessageIdsRef.current['orchestrator'];
            }
            
            if (event.phase === 'complete') {
              setShowStatus(false);
              streamMessageIdsRef.current = {};
              completedStreams.clear();
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
            addVerboseMessage({
              type: 'tool',
              content: `🔧 ${event.toolName}`,
              color: 'cyan'
            });
            break;

          case 'tool_result':
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
            addMessage({
              type: 'log',
              content: `\n⚠️  Error: ${event.error}\n`
            });
            break;
          
          case 'system':
            addMessage({
              type: 'system',
              content: event.content
            });
            break;

          case 'complete':
            setIsRunning(false);
            break;

          case 'diff_approval_needed':
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
        setMode('normal');
        
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

    orchestratorRef.current = orchestrator;

    orchestrator.executeTask(conversationHistory).then(result => {
      executionHistoryRef.current.push({ role: 'assistant', content: result });
      setIsRunning(false);
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

  return { executeInExecutionMode };
};

import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext.js';
import { useMessages, smartConcat } from './useMessages.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { Message } from '../../core/types.js';

// Agent metadata
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

export const useExecutionModeExecution = () => {
  const ctx = useAppContext();
  const { addMessage, addVerboseMessage } = useMessages();

  const executeInExecutionMode = useCallback(async (task: string, isFirstMessage: boolean = false) => {
    ctx.setIsRunning(true);
    ctx.setCurrentTask(task);
    ctx.abortControllerRef.current = new AbortController();
    
    ctx.hasReceivedFirstChunkRef.current = false;
    ctx.setCurrentStatus('Thinking...');
    ctx.setShowStatus(true);
    
    ctx.setVerboseMessages(() => []);
    
    addMessage({
      type: 'system',
      content: '\n[Spawn Agents]'
    });

    ctx.conversationHistoryRef.current.push({ role: 'user', content: task, mode: 'execution' });

    let conversationHistory = ctx.conversationHistoryRef.current.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    if (isFirstMessage) {
      const planningMessages = ctx.conversationHistoryRef.current.filter(m => m.mode === 'planning');
      if (planningMessages.length > 0) {
        const recentPlanning = planningMessages.slice(-4);
        let contextPrefix = `## Recent Planning Context\n\n`;
        
        for (const msg of recentPlanning) {
          const label = msg.role === 'user' ? 'User' : 'Plan';
          let content = '';
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            content = msg.content.map((c: any) => c.type === 'text' ? c.text : '').join('');
          }
          content = content.length > 800 ? content.substring(0, 800) + '...' : content;
          contextPrefix += `**${label}:** ${content}\n\n`;
        }
        
        contextPrefix += `---\n\n## Task to Execute\n\n`;
        
        const lastIndex = conversationHistory.length - 1;
        conversationHistory[lastIndex] = {
          role: 'user',
          content: contextPrefix + conversationHistory[lastIndex].content
        };
      }
    }

    const completedStreams = new Set<string>();

    const orchestrator = new Orchestrator({
      onEvent: (event) => {
        switch (event.type) {
          case 'phase_change':
            if (event.phase === 'intelligence') {
              ctx.setCurrentStatus('Invoking tools...');
              delete ctx.streamMessageIdsRef.current['orchestrator'];
            }
            
            if (event.phase === 'complete') {
              ctx.setShowStatus(false);
              ctx.streamMessageIdsRef.current = {};
              completedStreams.clear();
            }
            break;

          case 'text_chunk':
            if (event.streamId !== 'orchestrator') {
              const existingMsgId = ctx.streamMessageIdsRef.current[event.streamId];
              
              if (existingMsgId) {
                ctx.setVerboseMessages(prev =>
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
                ctx.streamMessageIdsRef.current[event.streamId] = ctx.messageCounterRef.current;
              }
              break;
            }
            
            if (!ctx.hasReceivedFirstChunkRef.current) {
              ctx.hasReceivedFirstChunkRef.current = true;
              ctx.setShowStatus(false);
              
              addMessage({
                type: 'system',
                content: '\nindokq:',
                color: 'cyan'
              });
            }
            
            const existingMsgId = ctx.streamMessageIdsRef.current['orchestrator'];
            
            if (existingMsgId) {
              ctx.setMessages(prev =>
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
              ctx.streamMessageIdsRef.current['orchestrator'] = ctx.messageCounterRef.current;
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
            ctx.setIsRunning(false);
            break;

          case 'diff_approval_needed':
            ctx.setPendingDiff(event.pendingDiff);
            ctx.setShowDiffApproval(true);
            addMessage({
              type: 'system',
              content: `\n📝 File changes proposed: ${event.pendingDiff.path}\n${event.pendingDiff.description || ''}`
            });
            break;
        }
      },

      onComplete: (result) => {
        ctx.setIsRunning(false);
        ctx.setMode('normal');
        
        setTimeout(() => {
          ctx.setMessageQueue(prev => {
            if (prev.length > 0) {
              // Queue processing handled by keyboard handler
              return prev;
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
        ctx.setIsRunning(false);
      }
    });

    ctx.orchestratorRef.current = orchestrator;

    orchestrator.executeTask(conversationHistory).then(result => {
      ctx.conversationHistoryRef.current.push({ role: 'assistant', content: result, mode: 'execution' });
      ctx.setIsRunning(false);
      ctx.setMode('normal');
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
      ctx.setIsRunning(false);
    });
  }, [ctx, addMessage, addVerboseMessage]);

  return { executeInExecutionMode };
};

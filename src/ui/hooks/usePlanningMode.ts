import { MutableRefObject } from 'react';
import { claudeClient } from '../../core/models/claude-client.js';
import { PLANNING_SYSTEM_PROMPT } from '../../config/prompts.js';
import { listFilesTool, readFileTool, searchFilesTool, grepCodebaseTool } from '../../config/tools.js';
import { handleToolCall } from '../../tools/index.js';
import { buildContextualPrompt, buildMultimodalContent } from '../../tools/file-context.js';
import { generateWorkspaceSummary } from '../../tools/codebase-summary.js';
import { FileContext } from '../../core/types.js';

interface UsePlanningModeProps {
  setIsStreaming: (value: boolean) => void;
  setCurrentStatus: (value: string) => void;
  setShowStatus: (value: boolean) => void;
  addMessage: (msg: any) => void;
  handleStreamChunk: (chunk: string) => void;
  resetStreamingMessageId: () => void;
  setMessageQueue: (updater: (prev: string[]) => string[]) => void;
  planningHistoryRef: MutableRefObject<Array<{ role: 'user' | 'assistant', content: any }>>;
  workspaceContextAddedRef: MutableRefObject<boolean>;
  abortControllerRef: MutableRefObject<AbortController | null>;
}

export const usePlanningMode = (props: UsePlanningModeProps) => {
  const {
    setIsStreaming,
    setCurrentStatus,
    setShowStatus,
    addMessage,
    handleStreamChunk,
    resetStreamingMessageId,
    setMessageQueue,
    planningHistoryRef,
    workspaceContextAddedRef,
    abortControllerRef
  } = props;

  const executePlanningMode = async (finalInput: string, fileContexts: FileContext[], handleUserInput: (input: string) => void) => {
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
    resetStreamingMessageId();
    
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
        
        const stream = claudeClient.streamMessage({
          system: turnCount === 1 ? PLANNING_SYSTEM_PROMPT : undefined,
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
        resetStreamingMessageId();
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
      resetStreamingMessageId();
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
  };

  return { executePlanningMode };
};

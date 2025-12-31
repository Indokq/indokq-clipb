import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext.js';
import { useMessages, smartConcat } from './useMessages.js';
import { claudeClient } from '../../core/models/claude-client.js';
import { PLANNING_SYSTEM_PROMPT } from '../../config/prompts.js';
import { listFilesTool, readFileTool, searchFilesTool, grepCodebaseTool } from '../../config/tools.js';
import { handleToolCall } from '../../tools/index.js';
import { buildContextualPrompt, buildMultimodalContent } from '../../tools/file-context.js';
import { generateWorkspaceSummary } from '../../tools/codebase-summary.js';
import { FileContext } from '../../core/types.js';

export const usePlanningModeExecution = () => {
  const ctx = useAppContext();
  const { addMessage, handleStreamChunk, resetStreamingMessageId } = useMessages();

  const executePlanningMode = useCallback(async (input: string, fileContexts: FileContext[]) => {
    let contextualInput = input;
    
    // Check if this is first planning message
    const planningMessages = ctx.conversationHistoryRef.current.filter(m => m.mode === 'planning');
    if (!ctx.workspaceContextAddedRef.current && planningMessages.length === 0) {
      const workspaceSummary = await generateWorkspaceSummary(process.cwd());
      contextualInput = `${workspaceSummary}\n\n---\n\n${input}`;
      ctx.workspaceContextAddedRef.current = true;
    }
    
    // Build contextual prompt if files attached
    if (fileContexts.length > 0) {
      contextualInput = buildContextualPrompt(contextualInput, fileContexts);
    }

    // Add to unified conversation history
    ctx.conversationHistoryRef.current.push({ role: 'user', content: contextualInput, mode: 'planning' });
    ctx.setIsStreaming(true);
    resetStreamingMessageId();
    
    ctx.setCurrentStatus('Thinking...');
    ctx.setShowStatus(true);

    ctx.abortControllerRef.current = new AbortController();

    try {
      const readOnlyTools = [listFilesTool, readFileTool, searchFilesTool, grepCodebaseTool];
      
      let firstChunk = true;
      let turnCount = 0;
      let continueLoop = true;
      
      while (continueLoop && !ctx.abortControllerRef.current?.signal.aborted) {
        turnCount++;
        
        let systemPrompt: any = undefined;
        if (turnCount === 1) {
          const augmentedPrompt = await ctx.promptBuilderRef.current.buildPrompt(
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
        
        const conversationMessages = ctx.conversationHistoryRef.current.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        
        const stream = claudeClient.streamMessage({
          system: systemPrompt,
          messages: conversationMessages,
          max_tokens: 16384,
          model: ctx.selectedModel,
          tools: readOnlyTools
        });

        let textContent = '';
        let toolUses: any[] = [];
        let currentToolUseIndex = -1;
        
        for await (const chunk of stream) {
          if (ctx.abortControllerRef.current?.signal.aborted) break;
          
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            if (firstChunk) {
              firstChunk = false;
              ctx.setShowStatus(false);
              addMessage({
                type: 'system',
                content: '\nindokq:',
                color: 'cyan'
              });
            }
            textContent += chunk.delta.text;
            handleStreamChunk(chunk.delta.text);
          }
          
          if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
            toolUses.push({
              ...chunk.content_block,
              input: {},
              _inputBuffer: ''
            });
            currentToolUseIndex = toolUses.length - 1;
          }
          
          if (chunk.type === 'content_block_delta') {
            const lastToolUse = toolUses[currentToolUseIndex];
            if (lastToolUse && chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
              lastToolUse._inputBuffer = (lastToolUse._inputBuffer || '') + chunk.delta.partial_json;
            }
          }
          
          if (chunk.type === 'content_block_stop') {
            const lastToolUse = toolUses[currentToolUseIndex];
            if (lastToolUse && lastToolUse._inputBuffer) {
              try {
                lastToolUse.input = JSON.parse(lastToolUse._inputBuffer);
                delete lastToolUse._inputBuffer;
              } catch (e) {
                console.error('Failed to parse tool input');
              }
            }
          }
        }

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
        
        ctx.conversationHistoryRef.current.push({
          role: 'assistant',
          content: assistantContent,
          mode: 'planning'
        });

        if (toolUses.length === 0) {
          continueLoop = false;
          break;
        }

        if (ctx.abortControllerRef.current?.signal.aborted) break;
        
        const toolResults = [];
        for (const toolUse of toolUses) {
          ctx.setCurrentStatus(`Reading: ${toolUse.name}...`);
          ctx.setShowStatus(true);
          
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
        
        ctx.conversationHistoryRef.current.push({
          role: 'user',
          content: toolResults as any,
          mode: 'planning'
        });
        
        resetStreamingMessageId();
        ctx.setCurrentStatus('Thinking...');
        ctx.setShowStatus(true);
      }

      resetStreamingMessageId();
    } catch (error: any) {
      if (error.name === 'AbortError' || ctx.abortControllerRef.current?.signal.aborted) {
        ctx.setIsStreaming(false);
        ctx.abortControllerRef.current = null;
        return;
      }
      addMessage({
        type: 'system',
        content: `Error: ${error.message}`,
        icon: '❌',
        color: 'red'
      });
    } finally {
      ctx.setIsStreaming(false);
      ctx.setShowStatus(false);
      ctx.abortControllerRef.current = null;
    }
  }, [ctx, addMessage, handleStreamChunk, resetStreamingMessageId]);

  return { executePlanningMode };
};

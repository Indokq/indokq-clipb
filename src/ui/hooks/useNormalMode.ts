import { MutableRefObject } from 'react';
import { claudeClient } from '../../core/models/claude-client.js';
import { NORMAL_MODE_PROMPT } from '../../config/prompts.js';
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
} from '../../config/tools.js';
import { buildMultimodalContent } from '../../tools/file-context.js';
import { FileContext } from '../../core/types.js';

interface UseNormalModeProps {
  setIsRunning: (value: boolean) => void;
  setIsStreaming: (value: boolean) => void;
  setCurrentStatus: (value: string) => void;
  setShowStatus: (value: boolean) => void;
  handleStreamChunk: (chunk: string) => void;
  resetStreamingMessageId: () => void;
  executeTools: (toolUses: any[], validationFailureCount: Map<string, number>) => Promise<{ toolResults: any[]; shouldContinue: boolean }>;
  executionHistoryRef: MutableRefObject<Array<{ role: 'user' | 'assistant', content: any }>>;
  abortControllerRef: MutableRefObject<AbortController | null>;
}

export const useNormalMode = (props: UseNormalModeProps) => {
  const {
    setIsRunning,
    setIsStreaming,
    setCurrentStatus,
    setShowStatus,
    handleStreamChunk,
    resetStreamingMessageId,
    executeTools,
    executionHistoryRef,
    abortControllerRef
  } = props;

  const executeWithTools = async (task: string, fileContexts: FileContext[]) => {
    setIsRunning(true);
    setIsStreaming(true);
    resetStreamingMessageId();
    
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
      const validationFailureCount = new Map<string, number>();
      let turnCount = 0;
      
      // Multi-turn loop: keep going while Claude makes tool calls
      while (continueLoop && !abortControllerRef.current?.signal.aborted) {
        // Update status
        setCurrentStatus('Thinking...');
        
        // Send message to Claude
        const toolsArray = [listFilesTool, searchFilesTool, grepCodebaseTool, readFileTool, createFileTool, editFileTool, writeFileTool, executeCommandTool, dockerExecuteTool];
        
        const stream = claudeClient.streamMessage({
          system: (turnCount === 0 ? NORMAL_MODE_PROMPT : undefined) as any,
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
                console.error(`[${lastToolUse._correlationId}] Failed to parse tool input JSON:`, lastToolUse._inputBuffer);
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
          const { toolResults, shouldContinue } = await executeTools(toolUses, validationFailureCount);
          
          if (!shouldContinue) {
            continueLoop = false;
            break;
          }
          
          // Add tool results to conversation as user message
          conversationHistory.push({
            role: 'user',
            content: toolResults
          });
          
          // Reset stream message ID for next turn
          resetStreamingMessageId();
          
          // Update status for next iteration
          setCurrentStatus('Processing results...');
          
        } else {
          // No tool calls - Claude provided final answer, exit loop
          continueLoop = false;
          
          // Save assistant's final response to persisted history
          const finalAssistantMessage = conversationHistory[conversationHistory.length - 1];
          if (finalAssistantMessage && finalAssistantMessage.role === 'assistant') {
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
      resetStreamingMessageId();
      abortControllerRef.current = null;
      
    } catch (error: any) {
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        setIsRunning(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
        return;
      }
      
      throw error; // Re-throw to be handled by caller
    }
  };

  return { executeWithTools };
};

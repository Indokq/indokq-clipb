import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext.js';
import { useMessages, smartConcat } from './useMessages.js';
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
import { handleToolCall, validateToolCall } from '../../tools/index.js';
import { buildMultimodalContent } from '../../tools/file-context.js';
import { FileContext, Message } from '../../core/types.js';

const MAX_VALIDATION_FAILURES = 3;

export const useNormalModeExecution = () => {
  const ctx = useAppContext();
  const { addMessage, addVerboseMessage, handleStreamChunk, resetStreamingMessageId } = useMessages();

  const executeWithTools = useCallback(async (task: string, fileContexts: FileContext[]) => {
    ctx.setIsRunning(true);
    ctx.setIsStreaming(true);
    resetStreamingMessageId();
    
    ctx.setCurrentStatus('Analyzing request...');
    ctx.setShowStatus(true);
    
    const contextualTask = fileContexts.length > 0 
      ? buildMultimodalContent(task, fileContexts)
      : task;
    
    ctx.abortControllerRef.current = new AbortController();
    
    ctx.conversationHistoryRef.current.push({
      role: 'user',
      content: contextualTask as any,
      mode: 'normal'
    });
    
    const conversationHistory: any[] = ctx.conversationHistoryRef.current.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    try {
      let continueLoop = true;
      const validationFailureCount = new Map<string, number>();
      let turnCount = 0;
      
      while (continueLoop && !ctx.abortControllerRef.current?.signal.aborted) {
        ctx.setCurrentStatus('Thinking...');
        
        let toolsArray = [listFilesTool, searchFilesTool, grepCodebaseTool, readFileTool, createFileTool, editFileTool, writeFileTool, executeCommandTool, dockerExecuteTool];
        
        // Add MCP tools
        try {
          const mcpManager = ctx.orchestratorRef.current?.getMCPManager();
          if (mcpManager) {
            const { MCPToolRegistry } = await import('../../tools/mcp-tools.js');
            const mcpToolRegistry = new MCPToolRegistry(mcpManager);
            const mcpTools = await mcpToolRegistry.getAllClaudeTools();
            toolsArray = [...toolsArray, ...mcpTools];
          }
        } catch (error) {
          console.error('[MCP] Failed to load MCP tools:', error);
        }
        
        let systemPrompt: any = undefined;
        if (turnCount === 0) {
          const augmentedPrompt = await ctx.promptBuilderRef.current.buildPrompt(
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
          model: ctx.selectedModel,
          signal: ctx.abortControllerRef.current?.signal
        });
        
        turnCount++;
        
        let textContent = '';
        let toolUses: any[] = [];
        let currentToolUseIndex = -1;
        
        for await (const chunk of stream) {
          if (ctx.abortControllerRef.current?.signal.aborted) break;
          
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            textContent += chunk.delta.text;
            handleStreamChunk(chunk.delta.text);
          }
          
          if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
            toolUses.push({
              ...chunk.content_block,
              input: {},
              _inputBuffer: '',
              _correlationId: Math.random().toString(36).substring(2, 10)
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
                console.error('Failed to parse tool input JSON');
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
        
        conversationHistory.push({
          role: 'assistant',
          content: assistantContent
        });
        
        if (toolUses.length > 0) {
          ctx.setCurrentStatus(`Executing ${toolUses.length} tool${toolUses.length > 1 ? 's' : ''}...`);
          const toolResults = [];
          
          for (const toolUse of toolUses) {
            ctx.setCurrentStatus(`Running ${toolUse.name}...`);
            
            addVerboseMessage({
              type: 'tool',
              content: `🔧 ${toolUse.name}`,
              color: 'cyan'
            });
            
            try {
              const validation = validateToolCall(toolUse.name, toolUse.input);
              
              if (!validation.valid) {
                const currentFailures = validationFailureCount.get(toolUse.name) || 0;
                validationFailureCount.set(toolUse.name, currentFailures + 1);
                
                if (currentFailures >= MAX_VALIDATION_FAILURES - 1) {
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: `❌ CRITICAL: ${toolUse.name} failed validation ${MAX_VALIDATION_FAILURES} times.`,
                    is_error: true
                  });
                  continueLoop = false;
                  break;
                }
                
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: `Tool validation failed: ${validation.error}`,
                  is_error: true
                });
                continue;
              }
              
              validationFailureCount.set(toolUse.name, 0);
              
              const approvalDecision = ctx.approvalManagerRef.current.shouldApprove(
                toolUse.name,
                validation.data
              );
              
              if (!approvalDecision.requiresApproval) {
                const result = await handleToolCall({ ...toolUse, input: validation.data });
                toolResults.push(result);
                
                const filepath = toolUse.input?.path || toolUse.input?.command || '';
                let statusMsg = 'Success';
                
                if (toolUse.name === 'read_file' && typeof result.content === 'string') {
                  statusMsg = `Read ${result.content.split('\n').length} lines.`;
                } else if (toolUse.name === 'list_files' && typeof result.content === 'string') {
                  statusMsg = `Listed ${result.content.split('\n').filter(Boolean).length} items.`;
                }
                
                addMessage({
                  type: 'tool',
                  content: toolUse.name,
                  toolName: toolUse.name,
                  filepath,
                  success: !result.is_error,
                  statusMessage: statusMsg
                } as any);
                
                continue;
              }
              
              const result = await handleToolCall({ ...toolUse, input: validation.data });
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
          
          conversationHistory.push({
            role: 'user',
            content: toolResults
          });
          
          resetStreamingMessageId();
          ctx.setCurrentStatus('Processing results...');
          
        } else {
          continueLoop = false;
          
          const finalMsg = conversationHistory[conversationHistory.length - 1];
          if (finalMsg?.role === 'assistant') {
            let text = '';
            if (Array.isArray(finalMsg.content)) {
              for (const block of finalMsg.content) {
                if (block.type === 'text') text += block.text;
              }
            } else {
              text = finalMsg.content;
            }
            
            ctx.conversationHistoryRef.current.push({
              role: 'assistant',
              content: text,
              mode: 'normal'
            });
          }
        }
      }
      
      ctx.setIsRunning(false);
      ctx.setIsStreaming(false);
      ctx.setShowStatus(false);
      ctx.setCurrentStatus('');
      resetStreamingMessageId();
      ctx.abortControllerRef.current = null;
      
    } catch (error: any) {
      if (error.name === 'AbortError' || ctx.abortControllerRef.current?.signal.aborted) {
        ctx.setIsRunning(false);
        ctx.setIsStreaming(false);
        ctx.abortControllerRef.current = null;
        return;
      }
      
      addMessage({
        type: 'system',
        content: `Error: ${error.message}`,
        color: 'red'
      });
      ctx.setIsRunning(false);
      ctx.setIsStreaming(false);
      ctx.setShowStatus(false);
      ctx.abortControllerRef.current = null;
    }
  }, [ctx, addMessage, addVerboseMessage, handleStreamChunk, resetStreamingMessageId]);

  const executeAgentDirectly = useCallback(async (agentName: string, task: string, fileContexts: FileContext[]) => {
    ctx.setIsRunning(true);
    ctx.setIsStreaming(true);
    resetStreamingMessageId();
    
    const contextualTask = fileContexts.length > 0 
      ? buildMultimodalContent(task, fileContexts)
      : task;
    
    const { loadAgent } = await import('../../.agents/agent-loader.js');
    const agent = loadAgent(agentName);
    
    if (!agent) {
      addMessage({
        type: 'system',
        content: `Unknown agent: ${agentName}`,
        color: 'red'
      });
      ctx.setIsRunning(false);
      ctx.setIsStreaming(false);
      return;
    }
    
    ctx.abortControllerRef.current = new AbortController();
    
    try {
      addMessage({
        type: 'system',
        content: `\n[@${agentName}]`,
        color: 'cyan'
      });
      
      const stream = claudeClient.streamMessage({
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: contextualTask }],
        tools: [],
        model: ctx.selectedModel,
        max_tokens: 16384
      });
      
      for await (const chunk of stream) {
        if (ctx.abortControllerRef.current?.signal.aborted) break;
        
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          handleStreamChunk(chunk.delta.text);
        }
      }
      
      ctx.setIsRunning(false);
      ctx.setIsStreaming(false);
      resetStreamingMessageId();
      ctx.abortControllerRef.current = null;
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        ctx.setIsRunning(false);
        ctx.setIsStreaming(false);
        ctx.abortControllerRef.current = null;
        return;
      }
      
      addMessage({
        type: 'system',
        content: `Agent error: ${error.message}`,
        color: 'red'
      });
      ctx.setIsRunning(false);
      ctx.setIsStreaming(false);
      ctx.abortControllerRef.current = null;
    }
  }, [ctx, addMessage, handleStreamChunk, resetStreamingMessageId]);

  return { executeWithTools, executeAgentDirectly };
};

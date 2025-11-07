import { MutableRefObject } from 'react';
import { claudeClient } from '../../core/models/claude-client.js';
import { buildMultimodalContent } from '../../tools/file-context.js';
import { FileContext } from '../../core/types.js';

interface UseAgentModeProps {
  setIsRunning: (value: boolean) => void;
  setIsStreaming: (value: boolean) => void;
  addMessage: (msg: any) => void;
  addVerboseMessage: (msg: any) => void;
  handleStreamChunk: (chunk: string) => void;
  resetStreamingMessageId: () => void;
  abortControllerRef: MutableRefObject<AbortController | null>;
}

export const useAgentMode = (props: UseAgentModeProps) => {
  const {
    setIsRunning,
    setIsStreaming,
    addMessage,
    addVerboseMessage,
    handleStreamChunk,
    resetStreamingMessageId,
    abortControllerRef
  } = props;

  const executeAgentDirectly = async (agentName: string, task: string, fileContexts: FileContext[]) => {
    setIsRunning(true);
    setIsStreaming(true);
    resetStreamingMessageId();
    
    // Build contextual prompt or multimodal content if files/images attached
    const contextualTask = fileContexts.length > 0 
      ? buildMultimodalContent(task, fileContexts)
      : task;
    
    // Load agent definition
    const { loadAgent } = await import('../../.agents/agent-loader.js');
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
      const allTools = await import('../../config/tools.js');
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
      resetStreamingMessageId();
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

  return { executeAgentDirectly };
};

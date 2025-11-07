import { handleToolCall, validateToolCall } from '../../tools/index.js';

interface ToolUse {
  id: string;
  name: string;
  input: any;
  _inputBuffer?: string;
  _correlationId?: string;
}

interface ExecuteToolsResult {
  toolResults: any[];
  shouldContinue: boolean;
}

interface UseToolExecutorProps {
  setCurrentStatus: (value: string) => void;
  addVerboseMessage: (msg: any) => void;
  addMessage: (msg: any) => void;
  setPendingDiff: (diff: any) => void;
  setShowDiffApproval: (value: boolean) => void;
}

const MAX_VALIDATION_FAILURES = 3;

export const useToolExecutor = (props: UseToolExecutorProps) => {
  const {
    setCurrentStatus,
    addVerboseMessage,
    addMessage,
    setPendingDiff,
    setShowDiffApproval
  } = props;

  const executeTools = async (
    toolUses: ToolUse[],
    validationFailureCount: Map<string, number>
  ): Promise<ExecuteToolsResult> => {
    setCurrentStatus(`Executing ${toolUses.length} tool${toolUses.length > 1 ? 's' : ''}...`);
    const toolResults = [];
    let shouldContinue = true;
    
    for (const toolUse of toolUses) {
      setCurrentStatus(`Running ${toolUse.name}...`);
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
            shouldContinue = false;
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
        
        // Execute with validated data
        const result = await handleToolCall({ 
          type: 'tool_use',
          id: toolUse.id,
          name: toolUse.name,
          input: validation.data
        });
        
        // Check if edit_file or write_file requires approval
        if ((toolUse.name === 'edit_file' || toolUse.name === 'write_file') && result.content) {
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
                (globalThis as any).__pendingApprovalResolver = resolve;
              });
              
              // Hide diff UI
              setShowDiffApproval(false);
              setPendingDiff(null);
              
              if (approval === 'approve') {
                // Apply the changes - use appropriate handler
                let applyResult;
                if (toolUse.name === 'edit_file') {
                  const { applyEditFileChanges } = await import('../../tools/handlers/edit-file.js');
                  applyResult = applyEditFileChanges({
                    path: parsed.pendingChanges.path,
                    newContent: parsed.pendingChanges.newContent
                  });
                } else {
                  const { applyWriteFileChanges } = await import('../../tools/handlers/write-file.js');
                  applyResult = applyWriteFileChanges({
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
        
        addVerboseMessage({
          type: 'tool',
          content: `  ↳ ${resultPreview}`,
          color: 'gray'
        });
      } catch (error: any) {
        // Add error as tool result
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: ${error.message}`,
          is_error: true
        });
        
        addVerboseMessage({
          type: 'tool',
          content: `  ↳ Error: ${error.message}`,
          color: 'red'
        });
      }
    }
    
    return { toolResults, shouldContinue };
  };

  return { executeTools };
};

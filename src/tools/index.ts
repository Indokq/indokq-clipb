import { handleExecuteCommand } from './execute-command.js';
import { handleReadFile } from './handlers/read-file.js';
import { handleWriteFile } from './handlers/write-file.js';
import { handleListFiles } from './handlers/list-files.js';
import { handleSearchFiles } from './handlers/search-files.js';
import { handleGrepCodebase } from './handlers/grep-codebase.js';
import { dockerExecute } from './docker-execute.js';
import { handleProposeFileChanges } from './handlers/propose-file-changes.js';

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

export async function handleToolCall(toolUse: ToolUse): Promise<any> {
  const result = await executeTool(toolUse.name, toolUse.input);
  
  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: result.success 
      ? (result.output || 'Success') 
      : `Error: ${result.error || 'Unknown error'}`
  };
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function executeTool(
  toolName: string,
  input: any
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'execute_command':
        return await handleExecuteCommand(input);
      
      case 'read_file': {
        const result = await handleReadFile(input);
        return {
          success: result.success,
          output: result.content,
          error: result.error,
        };
      }
      
      case 'write_file': {
        const result = await handleWriteFile(input);
        return {
          success: result.success,
          output: result.message,
          error: result.error,
        };
      }
      
      case 'list_files': {
        const result = await handleListFiles(input);
        return {
          success: result.success,
          output: result.result,
          error: result.error,
        };
      }
      
      case 'search_files': {
        const result = await handleSearchFiles(input);
        return {
          success: result.success,
          output: result.files
            ? `Found ${result.files.length} files:\n${result.files.join('\n')}`
            : undefined,
          error: result.error,
        };
      }
      
      case 'grep_codebase': {
        const result = await handleGrepCodebase(input);
        if (!result.success) {
          return { success: false, error: result.error };
        }
        
        const matches = result.matches || [];
        let output = `Found ${matches.length} matches`;
        if (result.truncated) {
          output += ` (showing first ${matches.length})`;
        }
        output += ':\n\n';
        
        output += matches
          .map((match) => `${match.file}:${match.line}: ${match.content}`)
          .join('\n');
        
        return {
          success: true,
          output,
        };
      }
      
      case 'docker_execute': {
        const result = await dockerExecute(input);
        return {
          success: result.exitCode === 0,
          output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
          error: result.error
        };
      }
      
      case 'task_complete': {
        // This is a special tool that just signals completion
        // It doesn't actually execute anything
        const summary = input.summary || 'Task completed';
        const status = input.status || 'success';
        return {
          success: true,
          output: `Task completed: ${summary} (Status: ${status})`
        };
      }
      
      case 'propose_file_changes': {
        const result = await handleProposeFileChanges(input);
        if (!result.success) {
          return { success: false, error: result.error };
        }
        
        // Return diff preview and await user approval
        // The orchestrator will handle showing the diff and getting approval
        return {
          success: true,
          output: JSON.stringify({
            type: 'diff_preview',
            diff: result.diffPreview,
            pendingChanges: result.pendingChanges
          })
        };
      }
      
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export { validateToolCall } from './schemas.js';
export type { ValidationResult } from './schemas.js';

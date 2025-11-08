import { handleExecuteCommand } from './execute-command.js';
import { handleReadFile } from './handlers/read-file.js';
import { handleCreateFile } from './handlers/create-file.js';
import { handleEditFile } from './handlers/edit-file.js';
import { handleWriteFile } from './handlers/write-file.js';
import { handleListFiles } from './handlers/list-files.js';
import { handleSearchFiles } from './handlers/search-files.js';
import { handleGrepCodebase } from './handlers/grep-codebase.js';
import { dockerExecute } from './docker-execute.js';
import { handleProposeFileChanges } from './handlers/propose-file-changes.js';
import type { ConversationMemoryManager } from '../core/conversation-memory.js';
import type { AppMode } from '../core/types.js';
import { MCPToolRegistry } from './mcp-tools.js';

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

// Global reference to memory manager (will be set by app initialization)
let memoryManager: ConversationMemoryManager | null = null;
let currentMode: AppMode = 'normal';
let mcpToolRegistry: MCPToolRegistry | null = null;

export function setMemoryManager(manager: ConversationMemoryManager) {
  memoryManager = manager;
}

export function setCurrentMode(mode: AppMode) {
  currentMode = mode;
}

export function setMCPToolRegistry(registry: MCPToolRegistry) {
  mcpToolRegistry = registry;
}

export async function handleToolCall(toolUse: ToolUse): Promise<any> {
  const startTime = Date.now();
  let success = false;
  let output = '';
  let filesTouched: string[] = [];
  
  try {
    const result = await executeTool(toolUse.name, toolUse.input);
    success = result.success;
    output = result.success 
      ? (result.output || 'Success') 
      : `Error: ${result.error || 'Unknown error'}`;
    
    // Track files touched by this tool
    filesTouched = extractFilesTouched(toolUse.name, toolUse.input);
    
    // Log to memory manager
    if (memoryManager) {
      memoryManager.addToolExecution({
        id: toolUse.id,
        toolName: toolUse.name,
        input: toolUse.input,
        output: output.substring(0, 500), // Truncate for memory efficiency
        timestamp: Date.now(),
        success,
        filesTouched,
        durationMs: Date.now() - startTime
      });
      
      // Log file access for file operation tools
      logFileAccess(toolUse.name, toolUse.input, success);
    }
    
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: output
    };
  } catch (error: any) {
    output = `Error: ${error.message}`;
    
    // Log failed execution
    if (memoryManager) {
      memoryManager.addToolExecution({
        id: toolUse.id,
        toolName: toolUse.name,
        input: toolUse.input,
        output: error.message,
        timestamp: Date.now(),
        success: false,
        filesTouched,
        durationMs: Date.now() - startTime
      });
    }
    
    throw error;
  }
}

function extractFilesTouched(toolName: string, input: any): string[] {
  const files: string[] = [];
  
  switch (toolName) {
    case 'read_file':
    case 'write_file':
    case 'create_file':
    case 'edit_file':
      if (input.path) files.push(input.path);
      break;
    case 'list_files':
      if (input.path) files.push(input.path);
      break;
    case 'propose_file_changes':
      if (input.path) files.push(input.path);
      break;
  }
  
  return files;
}

function logFileAccess(toolName: string, input: any, success: boolean) {
  if (!memoryManager || !success) return;
  
  let operation: 'read' | 'write' | 'create' | 'delete' | null = null;
  let path: string | null = null;
  
  switch (toolName) {
    case 'read_file':
      operation = 'read';
      path = input.path;
      break;
    case 'write_file':
    case 'edit_file':
      operation = 'write';
      path = input.path;
      break;
    case 'create_file':
      operation = 'create';
      path = input.path;
      break;
  }
  
  if (operation && path) {
    memoryManager.addFileAccess({
      path,
      operation,
      timestamp: Date.now(),
      mode: currentMode
    });
  }
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
    // Check if this is an MCP tool
    if (toolName.startsWith('mcp_') && mcpToolRegistry) {
      try {
        const result = await mcpToolRegistry.executeTool(toolName, input);
        
        // Extract text content from MCP result
        const textContent = result.content
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n') || '';

        return {
          success: !result.isError,
          output: textContent || JSON.stringify(result)
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    }
    
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
      
      case 'create_file': {
        const result = await handleCreateFile(input);
        return {
          success: result.success,
          output: result.message,
          error: result.error,
        };
      }
      
      case 'edit_file': {
        const result = await handleEditFile(input);
        
        // If approval is required, return full result as JSON
        if (result.requiresApproval) {
          return {
            success: result.success,
            output: JSON.stringify({
              requiresApproval: result.requiresApproval,
              diff: result.diff,
              pendingChanges: result.pendingChanges
            })
          };
        }
        
        // No changes or error
        return {
          success: result.success,
          output: result.message,
          error: result.error,
        };
      }
      
      case 'write_file': {
        const result = await handleWriteFile(input);
        
        // If approval is required, return full result as JSON
        if (result.requiresApproval) {
          return {
            success: result.success,
            output: JSON.stringify({
              requiresApproval: result.requiresApproval,
              diff: result.diff,
              pendingChanges: result.pendingChanges
            })
          };
        }
        
        // Normal file write (new file or no changes)
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

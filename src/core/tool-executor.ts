import { handleListFiles } from '../tools/handlers/list-files.js';
import { handleSearchFiles } from '../tools/handlers/search-files.js';
import { handleGrepCodebase } from '../tools/handlers/grep-codebase.js';
import { handleReadFile } from '../tools/handlers/read-file.js';
import { handleWriteFile } from '../tools/handlers/write-file.js';
import { handleExecuteCommand } from '../tools/execute-command.js';

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

export const AVAILABLE_TOOLS = [
  'list_files',
  'search_files',
  'grep_codebase',
  'read_file',
  'write_file',
  'execute_command'
] as const;

export const AVAILABLE_AGENTS = [
  'terminus',
  'environment',
  'prediction',
  'intelligence',
  'synthesis',
  'execution'
] as const;

type ToolName = typeof AVAILABLE_TOOLS[number];

// Parse tool call from user input
// Formats: "tool_name arg1 arg2" or "tool_name(arg1, arg2)"
export function parseToolCall(input: string): { toolName: ToolName; args: string } | null {
  const match = input.match(/^(\w+)\s+(.+)$/);
  if (!match) return null;
  
  const toolName = match[1];
  if (!AVAILABLE_TOOLS.includes(toolName as any)) return null;
  
  return { toolName: toolName as ToolName, args: match[2] };
}

// Parse agent invocation from user input
// Format: "@agentname task description"
export function parseAgentInvocation(input: string): { agentName: string; task: string } | null {
  const match = input.match(/^@(\w+)\s+(.+)$/);
  if (!match) return null;
  
  const agentName = match[1];
  if (!AVAILABLE_AGENTS.includes(agentName as any)) return null;
  
  return { agentName, task: match[2] };
}

// Execute tool directly
export async function executeTool(toolName: ToolName, argsString: string): Promise<ToolExecutionResult> {
  try {
    let result: any;
    
    switch (toolName) {
      case 'list_files': {
        const path = argsString.trim() || '.';
        result = await handleListFiles({ path });
        break;
      }
      
      case 'search_files': {
        const pattern = argsString.trim();
        if (!pattern) throw new Error('search_files requires a pattern argument');
        result = await handleSearchFiles({ pattern });
        break;
      }
      
      case 'grep_codebase': {
        const pattern = argsString.trim();
        if (!pattern) throw new Error('grep_codebase requires a pattern argument');
        result = await handleGrepCodebase({ pattern });
        break;
      }
      
      case 'read_file': {
        const path = argsString.trim();
        if (!path) throw new Error('read_file requires a path argument');
        const fileResult = await handleReadFile({ path });
        result = fileResult.content || fileResult.error;
        break;
      }
      
      case 'write_file': {
        // Parse "path content" - content can be multiline
        const firstSpaceIndex = argsString.indexOf(' ');
        if (firstSpaceIndex === -1) throw new Error('write_file requires both path and content');
        
        const path = argsString.slice(0, firstSpaceIndex).trim();
        const content = argsString.slice(firstSpaceIndex + 1);
        
        result = await handleWriteFile({ path, content });
        break;
      }
      
      case 'execute_command': {
        const command = argsString.trim();
        if (!command) throw new Error('execute_command requires a command argument');
        result = await handleExecuteCommand({ command });
        break;
      }
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
    
    return {
      success: true,
      output: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    };
  } catch (error: any) {
    return {
      success: false,
      output: '',
      error: error.message || String(error)
    };
  }
}

// Check if input looks like a tool call
export function isToolCall(input: string): boolean {
  return parseToolCall(input) !== null;
}

// Check if input is an agent invocation
export function isAgentInvocation(input: string): boolean {
  return parseAgentInvocation(input) !== null;
}

// Get tool suggestions for autocomplete
export function getToolSuggestions(prefix: string): string[] {
  return AVAILABLE_TOOLS.filter(tool => tool.startsWith(prefix));
}

// Get agent suggestions for autocomplete
export function getAgentSuggestions(prefix: string): string[] {
  return AVAILABLE_AGENTS.filter(agent => agent.startsWith(prefix)).map(a => `@${a}`);
}

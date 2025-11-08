import { z } from 'zod';

export const executeCommandSchema = z.object({
  command: z.string({
    required_error: 'command parameter is required. Example: {"command": "npm test"}',
    invalid_type_error: 'command must be a string'
  }).min(1, 'command cannot be empty. Example: {"command": "npm test"}'),
});

export const readFileSchema = z.object({
  path: z.string({
    required_error: 'path parameter is required. Example: {"path": "package.json"}',
    invalid_type_error: 'path must be a string'
  }).min(1, 'path cannot be empty. Example: {"path": "package.json"}'),
});

export const createFileSchema = z.object({
  path: z.string({
    required_error: 'path parameter is required. Example: {"path": "newfile.txt"}',
    invalid_type_error: 'path must be a string'
  }).min(1, 'path cannot be empty'),
  content: z.string({
    required_error: 'content parameter is required',
    invalid_type_error: 'content must be a string'
  }),
});

export const editFileSchema = z.object({
  path: z.string({
    required_error: 'path parameter is required. Example: {"path": "existing.txt"}',
    invalid_type_error: 'path must be a string'
  }).min(1, 'path cannot be empty'),
  content: z.string({
    required_error: 'content parameter is required',
    invalid_type_error: 'content must be a string'
  }),
});

export const writeFileSchema = z.object({
  path: z.string({
    required_error: 'path parameter is required. Example: {"path": "test.txt"}',
    invalid_type_error: 'path must be a string'
  }).min(1, 'path cannot be empty'),
  content: z.string({
    required_error: 'content parameter is required',
    invalid_type_error: 'content must be a string'
  }),
});

export const listFilesSchema = z.object({
  path: z.string().default('.'),
});

export const searchFilesSchema = z.object({
  pattern: z.string({
    required_error: 'pattern parameter is required. Example: {"pattern": "**/*.ts"}',
    invalid_type_error: 'pattern must be a string'
  }).min(1, 'pattern cannot be empty'),
  directory: z.string().optional(),
});

export const grepCodebaseSchema = z.object({
  pattern: z.string({
    required_error: 'pattern parameter is required. Example: {"pattern": "function myFunc"}',
    invalid_type_error: 'pattern must be a string'
  }).min(1, 'pattern cannot be empty'),
  flags: z.string().optional(),
  maxResults: z.number().int().positive().default(15),
});

export const dockerExecuteSchema = z.object({
  container: z.string({
    required_error: 'container parameter is required',
    invalid_type_error: 'container must be a string'
  }).min(1, 'container cannot be empty'),
  command: z.string({
    required_error: 'command parameter is required',
    invalid_type_error: 'command must be a string'
  }).min(1, 'command cannot be empty'),
});

export const taskCompleteSchema = z.object({
  summary: z.string({
    required_error: 'summary parameter is required',
    invalid_type_error: 'summary must be a string'
  }).min(1, 'summary cannot be empty'),
  status: z.enum(['success', 'partial', 'failed']).optional(),
});

export type ToolSchemas = {
  execute_command: typeof executeCommandSchema;
  read_file: typeof readFileSchema;
  create_file: typeof createFileSchema;
  edit_file: typeof editFileSchema;
  write_file: typeof writeFileSchema;
  list_files: typeof listFilesSchema;
  search_files: typeof searchFilesSchema;
  grep_codebase: typeof grepCodebaseSchema;
  docker_execute: typeof dockerExecuteSchema;
  task_complete: typeof taskCompleteSchema;
};

export const toolSchemas: ToolSchemas = {
  execute_command: executeCommandSchema,
  read_file: readFileSchema,
  create_file: createFileSchema,
  edit_file: editFileSchema,
  write_file: writeFileSchema,
  list_files: listFilesSchema,
  search_files: searchFilesSchema,
  grep_codebase: grepCodebaseSchema,
  docker_execute: dockerExecuteSchema,
  task_complete: taskCompleteSchema,
};

export type ToolName = keyof ToolSchemas;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: any;
}

/**
 * Normalize parameter names to handle common variations
 * Supports: path/file_path/filePath/filepath synonyms
 */
function normalizeToolParams(toolName: string, params: any): any {
  if (!params || typeof params !== 'object') {
    return params;
  }
  
  const normalized = { ...params };
  
  // Handle path parameter synonyms for file-related tools
  const fileTools = ['read_file', 'write_file', 'create_file', 'edit_file', 'list_files'];
  if (fileTools.includes(toolName)) {
    if (!normalized.path && (normalized.file_path || normalized.filePath || normalized.filepath)) {
      normalized.path = normalized.file_path || normalized.filePath || normalized.filepath;
      // Clean up alternate names
      delete normalized.file_path;
      delete normalized.filePath;
      delete normalized.filepath;
    }
  }
  
  return normalized;
}

export function validateToolCall(
  toolName: string,
  input: any
): ValidationResult {
  // MCP tools are dynamically registered - skip schema validation
  // They'll be validated by the MCP server itself
  if (toolName.startsWith('mcp_')) {
    return {
      valid: true,
      data: input // Pass through input as-is
    };
  }
  
  const schema = toolSchemas[toolName as ToolName];
  if (!schema) {
    return {
      valid: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  // Normalize parameters to handle common variations
  const normalizedInput = normalizeToolParams(toolName, input || {});
  
  // Let Zod handle all validation including empty objects
  // Zod will apply defaults for optional params and validate required fields
  const result = schema.safeParse(normalizedInput);
  
  if (!result.success) {
    const errors = result.error.errors
      .map((err) => {
        const path = err.path.join('.');
        return `${path ? path + ': ' : ''}${err.message}`;
      })
      .join('; ');
    return {
      valid: false,
      error: `Validation failed for ${toolName}: ${errors}`,
    };
  }

  return {
    valid: true,
    data: result.data,
  };
}

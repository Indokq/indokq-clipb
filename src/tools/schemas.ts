import { z } from 'zod';

export const executeCommandSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
});

export const readFileSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
});

export const writeFileSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  content: z.string(),
});

export const listFilesSchema = z.object({
  path: z.string().default('.'),
});

export const searchFilesSchema = z.object({
  pattern: z.string().min(1, 'Pattern cannot be empty'),
  directory: z.string().optional(),
});

export const grepCodebaseSchema = z.object({
  pattern: z.string().min(1, 'Pattern cannot be empty'),
  flags: z.string().optional(),
  maxResults: z.number().int().positive().default(15),
});

export const dockerExecuteSchema = z.object({
  container: z.string().min(1, 'Container cannot be empty'),
  command: z.string().min(1, 'Command cannot be empty'),
});

export const taskCompleteSchema = z.object({
  summary: z.string().min(1, 'Summary cannot be empty'),
  status: z.enum(['success', 'partial', 'failed']).optional(),
});

export type ToolSchemas = {
  execute_command: typeof executeCommandSchema;
  read_file: typeof readFileSchema;
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

export function validateToolCall(
  toolName: string,
  input: any
): ValidationResult {
  if (!input || (typeof input === 'object' && Object.keys(input).length === 0)) {
    return {
      valid: false,
      error: 'Empty tool input',
    };
  }

  const schema = toolSchemas[toolName as ToolName];
  if (!schema) {
    return {
      valid: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    return {
      valid: false,
      error: `Validation failed: ${errors}`,
    };
  }

  return {
    valid: true,
    data: result.data,
  };
}

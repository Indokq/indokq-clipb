import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Import to access memory manager
let memoryManagerRef: any = null;
let currentModeRef: string = 'normal';

export function setCommandMemoryManager(manager: any, mode: string) {
  memoryManagerRef = manager;
  currentModeRef = mode;
}

export interface ExecuteCommandInput {
  command: string;
  timeout?: number;
}

export interface ExecuteCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export async function handleExecuteCommand(input: ExecuteCommandInput): Promise<{ success: boolean; output?: string; error?: string }> {
  const { command, timeout = 30000 } = input;

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const output = [stdout, stderr].filter(Boolean).join('\n');
    
    // Log command execution to memory
    if (memoryManagerRef) {
      memoryManagerRef.addCommandExecution({
        command,
        output: output.substring(0, 1000), // Truncate for memory
        exitCode: 0,
        timestamp: Date.now(),
        mode: currentModeRef
      });
    }
    
    return {
      success: true,
      output: output || 'Command executed successfully (no output)'
    };
  } catch (error: any) {
    const output = [error.stdout, error.stderr].filter(Boolean).join('\n');
    
    // Log failed command
    if (memoryManagerRef) {
      memoryManagerRef.addCommandExecution({
        command,
        output: output.substring(0, 1000),
        exitCode: error.code || 1,
        timestamp: Date.now(),
        mode: currentModeRef
      });
    }
    
    return {
      success: false,
      output,
      error: error.message
    };
  }
}

// Legacy export for backward compatibility
export async function executeCommand(input: ExecuteCommandInput): Promise<ExecuteCommandResult> {
  const result = await handleExecuteCommand(input);
  return {
    stdout: result.output || '',
    stderr: result.error || '',
    exitCode: result.success ? 0 : 1,
    error: result.error
  };
}

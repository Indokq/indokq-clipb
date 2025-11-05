import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DockerExecuteInput {
  image?: string;
  command: string;
  timeout?: number;
}

export interface DockerExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export async function dockerExecute(input: DockerExecuteInput): Promise<DockerExecuteResult> {
  const { image = 'ubuntu:latest', command, timeout = 30000 } = input;

  // Check if Docker is available
  try {
    await execAsync('docker --version', { timeout: 5000 });
  } catch (error) {
    return {
      stdout: '',
      stderr: 'Docker is not available on this system',
      exitCode: 127,
      error: 'Docker not found'
    };
  }

  // Execute command in Docker container
  const dockerCommand = `docker run --rm ${image} /bin/sh -c "${command.replace(/"/g, '\\"')}"`;

  try {
    const { stdout, stderr } = await execAsync(dockerCommand, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: 0
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      error: error.message
    };
  }
}

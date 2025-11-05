import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface ReadFileInput {
  path: string;
}

export interface WriteFileInput {
  path: string;
  content: string;
}

export async function readFileContents(input: ReadFileInput): Promise<string> {
  try {
    const content = await readFile(input.path, 'utf-8');
    return content;
  } catch (error: any) {
    throw new Error(`Failed to read file ${input.path}: ${error.message}`);
  }
}

export async function writeFileContents(input: WriteFileInput): Promise<string> {
  try {
    // Ensure directory exists
    const dir = dirname(input.path);
    await mkdir(dir, { recursive: true });

    await writeFile(input.path, input.content, 'utf-8');
    return `Successfully wrote ${input.content.length} bytes to ${input.path}`;
  } catch (error: any) {
    throw new Error(`Failed to write file ${input.path}: ${error.message}`);
  }
}

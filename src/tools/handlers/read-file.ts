import * as fs from 'fs';
import * as path from 'path';

export interface ReadFileInput {
  path: string;
}

export interface ReadFileOutput {
  success: boolean;
  content?: string;
  error?: string;
}

export async function handleReadFile(
  input: ReadFileInput
): Promise<ReadFileOutput> {
  try {
    const targetPath = path.resolve(input.path);
    
    if (!fs.existsSync(targetPath)) {
      return {
        success: false,
        error: `File does not exist: ${targetPath}`,
      };
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: `Path is not a file: ${targetPath}`,
      };
    }

    const content = fs.readFileSync(targetPath, 'utf-8');

    return {
      success: true,
      content,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

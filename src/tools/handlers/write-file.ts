import * as fs from 'fs';
import * as path from 'path';

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface WriteFileOutput {
  success: boolean;
  message?: string;
  error?: string;
}

export async function handleWriteFile(
  input: WriteFileInput
): Promise<WriteFileOutput> {
  try {
    const targetPath = path.resolve(input.path);
    const dir = path.dirname(targetPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, input.content, 'utf-8');

    return {
      success: true,
      message: `File written successfully: ${targetPath}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

import * as fs from 'fs';
import * as path from 'path';

export interface CreateFileInput {
  path: string;
  content: string;
}

export interface CreateFileOutput {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Create a new file with the specified content.
 * Fails if the file already exists.
 */
export async function handleCreateFile(
  input: CreateFileInput
): Promise<CreateFileOutput> {
  try {
    const targetPath = path.resolve(input.path);
    
    // Fail if file already exists
    if (fs.existsSync(targetPath)) {
      return {
        success: false,
        error: `File already exists: ${targetPath}. Use edit_file to modify it.`
      };
    }
    
    // Create directory if it doesn't exist
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the new file
    fs.writeFileSync(targetPath, input.content, 'utf-8');
    
    return {
      success: true,
      message: `File created: ${targetPath}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

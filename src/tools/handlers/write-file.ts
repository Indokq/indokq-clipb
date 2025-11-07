import * as fs from 'fs';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface WriteFileOutput {
  success: boolean;
  message?: string;
  error?: string;
  requiresApproval?: boolean;
  diff?: string;
  pendingChanges?: {
    path: string;
    oldContent: string;
    newContent: string;
  };
}

export async function handleWriteFile(
  input: WriteFileInput
): Promise<WriteFileOutput> {
  try {
    const targetPath = path.resolve(input.path);
    const dir = path.dirname(targetPath);
    
    // Check if file exists
    const fileExists = fs.existsSync(targetPath);
    
    // Read existing content if file exists
    const oldContent = fileExists ? fs.readFileSync(targetPath, 'utf-8') : '';
    
    // Check if content is actually changing
    if (fileExists && oldContent === input.content) {
      return {
        success: true,
        message: `No changes needed for: ${targetPath}`,
      };
    }
    
    // For existing files with changes, generate diff and request approval
    if (fileExists) {
      const diff = createTwoFilesPatch(
        input.path,
        input.path,
        oldContent,
        input.content,
        'original',
        'modified'
      );
      
      return {
        success: true,
        requiresApproval: true,
        diff: diff,
        pendingChanges: {
          path: targetPath,
          oldContent,
          newContent: input.content
        }
      };
    }
    
    // For new files, write directly without approval
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(targetPath, input.content, 'utf-8');

    return {
      success: true,
      message: `New file created: ${targetPath}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Apply pending file changes after user approval
 */
export function applyWriteFileChanges(pendingChanges: {
  path: string;
  newContent: string;
}): { success: boolean; error?: string } {
  try {
    const { path: targetPath, newContent } = pendingChanges;
    const dir = path.dirname(targetPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(targetPath, newContent, 'utf-8');
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

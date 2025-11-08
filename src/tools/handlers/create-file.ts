import * as fs from 'fs';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';

export interface CreateFileInput {
  path: string;
  content: string;
}

export interface CreateFileOutput {
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
    
    // Generate diff showing full new content
    const diff = createTwoFilesPatch(
      input.path,
      input.path,
      '', // Empty old content (new file)
      input.content,
      'original (file does not exist)',
      'new file'
    );
    
    return {
      success: true,
      requiresApproval: true,
      diff: diff,
      pendingChanges: {
        path: targetPath,
        oldContent: '',
        newContent: input.content
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Apply pending file creation after user approval
 */
export function applyCreateFileChanges(pendingChanges: {
  path: string;
  newContent: string;
}): { success: boolean; error?: string } {
  try {
    const { path: targetPath, newContent } = pendingChanges;
    
    // Create directory if it doesn't exist
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the new file
    fs.writeFileSync(targetPath, newContent, 'utf-8');
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

import * as fs from 'fs';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';

export interface EditFileInput {
  path: string;
  content: string;
}

export interface EditFileOutput {
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
 * Edit an existing file with diff preview and approval workflow.
 * Fails if the file does not exist.
 */
export async function handleEditFile(
  input: EditFileInput
): Promise<EditFileOutput> {
  try {
    const targetPath = path.resolve(input.path);
    
    // Fail if file doesn't exist
    if (!fs.existsSync(targetPath)) {
      return {
        success: false,
        error: `File not found: ${targetPath}. Use create_file to create it.`
      };
    }
    
    // Check if it's a file (not a directory)
    const stats = fs.statSync(targetPath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: `Path is not a file: ${targetPath}`
      };
    }
    
    // Read existing content
    const oldContent = fs.readFileSync(targetPath, 'utf-8');
    
    // Check if content is actually changing
    if (oldContent === input.content) {
      return {
        success: true,
        message: `No changes needed for: ${targetPath}`
      };
    }
    
    // Generate diff and request approval
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
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Apply pending file changes after user approval
 */
export function applyEditFileChanges(pendingChanges: {
  path: string;
  newContent: string;
}): { success: boolean; error?: string } {
  try {
    const { path: targetPath, newContent } = pendingChanges;
    
    fs.writeFileSync(targetPath, newContent, 'utf-8');
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

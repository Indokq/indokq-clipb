import { readFileSync, existsSync, writeFileSync } from 'fs';
import { createTwoFilesPatch } from 'diff';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

export interface FileChange {
  search: string;
  replace: string;
}

export interface ProposeChangesInput {
  path: string;
  changes: FileChange[];
  description?: string;
}

export interface ProposeChangesResult {
  success: boolean;
  diffPreview?: string;
  pendingChanges?: {
    path: string;
    oldContent: string;
    newContent: string;
    description?: string;
  };
  error?: string;
}

/**
 * Propose file changes and generate a diff preview.
 * Does NOT apply changes immediately - requires user approval.
 */
export async function handleProposeFileChanges(
  input: ProposeChangesInput
): Promise<ProposeChangesResult> {
  try {
    const { path, changes, description } = input;

    // Read existing file or use empty content for new files
    const fileExists = existsSync(path);
    const oldContent = fileExists ? readFileSync(path, 'utf-8') : '';
    
    // Apply all changes to generate new content
    let newContent = oldContent;
    let appliedCount = 0;
    const failures: string[] = [];

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      
      if (newContent.includes(change.search)) {
        // Replace only the first occurrence to maintain predictability
        newContent = newContent.replace(change.search, change.replace);
        appliedCount++;
      } else {
        failures.push(`Change ${i + 1}: Search pattern not found`);
      }
    }

    // If no changes were applied, return error
    if (appliedCount === 0 && changes.length > 0) {
      return {
        success: false,
        error: `No changes could be applied. ${failures.join('; ')}`
      };
    }

    // Generate unified diff
    const diff = createTwoFilesPatch(
      path,
      path,
      oldContent,
      newContent,
      'original',
      'modified'
    );

    // Store pending changes for later approval
    return {
      success: true,
      diffPreview: diff,
      pendingChanges: {
        path,
        oldContent,
        newContent,
        description
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
 * Apply previously approved changes
 */
export function applyPendingChanges(pendingChanges: {
  path: string;
  oldContent: string;
  newContent: string;
}): { success: boolean; error?: string } {
  try {
    const { path, newContent } = pendingChanges;
    
    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write the new content
    writeFileSync(path, newContent, 'utf-8');

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

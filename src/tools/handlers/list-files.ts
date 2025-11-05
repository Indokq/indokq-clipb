import * as fs from 'fs';
import * as path from 'path';

export interface ListFilesInput {
  path: string;
}

export interface ListFilesOutput {
  success: boolean;
  result?: string;
  error?: string;
}

function buildTree(
  dir: string,
  prefix: string = '',
  isLast: boolean = true
): string {
  try {
    const stats = fs.statSync(dir);
    const name = path.basename(dir);
    
    if (!stats.isDirectory()) {
      return '';
    }

    let output = '';
    const entries = fs.readdirSync(dir);
    const filteredEntries = entries.filter(
      (entry) => !entry.startsWith('.') && entry !== 'node_modules'
    );

    filteredEntries.forEach((entry, index) => {
      const fullPath = path.join(dir, entry);
      const isLastEntry = index === filteredEntries.length - 1;
      const connector = isLastEntry ? '└─ ' : '├─ ';
      const extension = isLastEntry ? '    ' : '│   ';

      try {
        const entryStats = fs.statSync(fullPath);
        
        if (entryStats.isDirectory()) {
          output += `${prefix}${connector}${entry}/\n`;
          output += buildTree(fullPath, prefix + extension, isLastEntry);
        } else {
          output += `${prefix}${connector}${entry}\n`;
        }
      } catch (err) {
        // Skip inaccessible files
      }
    });

    return output;
  } catch (error: any) {
    return `Error: ${error.message}\n`;
  }
}

export async function handleListFiles(
  input: ListFilesInput
): Promise<ListFilesOutput> {
  try {
    const targetPath = path.resolve(input.path);
    
    if (!fs.existsSync(targetPath)) {
      return {
        success: false,
        error: `Path does not exist: ${targetPath}`,
      };
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${targetPath}`,
      };
    }

    const tree = buildTree(targetPath);
    const result = `${path.basename(targetPath)}/\n${tree}`;

    return {
      success: true,
      result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

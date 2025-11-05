import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

export interface GrepCodebaseInput {
  pattern: string;
  flags?: string;
  maxResults?: number;
}

export interface GrepCodebaseOutput {
  success: boolean;
  matches?: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  error?: string;
  truncated?: boolean;
}

export async function handleGrepCodebase(
  input: GrepCodebaseInput
): Promise<GrepCodebaseOutput> {
  try {
    const maxResults = input.maxResults ?? 15;
    const flags = input.flags ?? '';
    const caseInsensitive = flags.includes('i');
    
    let regex: RegExp;
    try {
      regex = new RegExp(input.pattern, caseInsensitive ? 'i' : '');
    } catch (err: any) {
      return {
        success: false,
        error: `Invalid regex pattern: ${err.message}`,
      };
    }

    const files = await fg('**/*', {
      cwd: process.cwd(),
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.log'],
      dot: false,
      onlyFiles: true,
    });

    const matches: Array<{ file: string; line: number; content: string }> = [];
    let totalMatches = 0;

    for (const file of files) {
      if (totalMatches >= maxResults * 20) break; // Global limit

      const fullPath = path.resolve(file);
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            if (matches.length < maxResults) {
              matches.push({
                file: file,
                line: i + 1,
                content: lines[i].trim(),
              });
            }
            totalMatches++;
          }
        }
      } catch (err) {
        // Skip binary or inaccessible files
        continue;
      }
    }

    return {
      success: true,
      matches,
      truncated: totalMatches > matches.length,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

import fg from 'fast-glob';
import * as path from 'path';

export interface SearchFilesInput {
  pattern: string;
  directory?: string;
}

export interface SearchFilesOutput {
  success: boolean;
  files?: string[];
  error?: string;
}

export async function handleSearchFiles(
  input: SearchFilesInput
): Promise<SearchFilesOutput> {
  try {
    const baseDir = input.directory ? path.resolve(input.directory) : process.cwd();
    
    const files = await fg(input.pattern, {
      cwd: baseDir,
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      dot: false,
    });

    return {
      success: true,
      files: files.map((file) => path.join(baseDir, file)),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

export interface FileContext {
  path: string;
  content: string;
  isImage?: boolean;           // Flag for image files
  base64Data?: string;         // Base64 encoded image data
  mediaType?: string;          // image/png, image/jpeg, etc.
}

// Image file constants and utilities
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit (Claude's max)

export function isImageFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

export function getImageMediaType(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.bmp': return 'image/bmp';
    default: return 'image/png';
  }
}

// Cache for workspace files to avoid repeated scans
let cachedFiles: string[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 30000; // 30 seconds

export interface ParsedInput {
  text: string;
  mentions: string[];
}

/**
 * Parse @mentions from user input
 * Example: "@app.tsx how does it work?" -> { text: "how does it work?", mentions: ["app.tsx"] }
 */
export function parseFileMentions(input: string): ParsedInput {
  const mentionRegex = /@([\w./\\-]+)/g;  // Hyphen at end to avoid range issue
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionRegex.exec(input)) !== null) {
    mentions.push(match[1]);
  }
  
  // Remove @mentions from text
  const text = input.replace(mentionRegex, '').trim();
  
  return { text, mentions };
}

/**
 * Resolve file mentions to actual file paths and read their content
 */
export async function resolveFileMentions(
  mentions: string[],
  workingDir: string = process.cwd()
): Promise<{ contexts: FileContext[], errors: string[] }> {
  const contexts: FileContext[] = [];
  const errors: string[] = [];
  const MAX_FILE_SIZE = 100000; // 100KB limit to prevent huge files
  
  for (const mention of mentions) {
    try {
      // Try exact path first
      const exactPath = path.resolve(workingDir, mention);
      if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
        const stats = fs.statSync(exactPath);
        const relativePath = path.relative(workingDir, exactPath);
        
        // Handle images
        if (isImageFile(exactPath)) {
          if (stats.size > MAX_IMAGE_SIZE) {
            errors.push(`⚠️  ${mention}: Image too large (${Math.round(stats.size / (1024 * 1024))}MB, max 5MB)`);
            continue;
          }
          
          const base64Data = fs.readFileSync(exactPath, 'base64');
          contexts.push({
            path: relativePath,
            content: '', // Empty for images
            isImage: true,
            base64Data,
            mediaType: getImageMediaType(exactPath)
          });
          continue;
        }
        
        // Handle text files
        if (stats.size > MAX_FILE_SIZE) {
          errors.push(`⚠️  ${mention}: File too large (${Math.round(stats.size / 1024)}KB)`);
          continue;
        }
        
        const content = fs.readFileSync(exactPath, 'utf-8');
        contexts.push({ 
          path: relativePath, 
          content 
        });
        continue;
      }
      
      // Search for matching files using glob
      const pattern = `**/*${mention}*`;
      const matches = await fg(pattern, {
        cwd: workingDir,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
        onlyFiles: true,
        absolute: false
      });
      
      if (matches.length === 0) {
        errors.push(`${mention}: File not found`);
        continue;
      }
      
      // Pick the best match (shortest path = closest to root)
      const bestMatch = matches.sort((a, b) => a.length - b.length)[0];
      const fullPath = path.resolve(workingDir, bestMatch);
      const stats = fs.statSync(fullPath);
      
      // Handle images
      if (isImageFile(fullPath)) {
        if (stats.size > MAX_IMAGE_SIZE) {
          errors.push(`${mention}: Image too large (${Math.round(stats.size / (1024 * 1024))}MB, max 5MB)`);
          continue;
        }
        
        const base64Data = fs.readFileSync(fullPath, 'base64');
        contexts.push({
          path: bestMatch,
          content: '', // Empty for images
          isImage: true,
          base64Data,
          mediaType: getImageMediaType(fullPath)
        });
        continue;
      }
      
      // Handle text files
      if (stats.size > MAX_FILE_SIZE) {
        errors.push(`${mention}: File too large (${Math.round(stats.size / 1024)}KB)`);
        continue;
      }
      
      const content = fs.readFileSync(fullPath, 'utf-8');
      contexts.push({ 
        path: bestMatch, 
        content 
      });
      
    } catch (error: any) {
      errors.push(`${mention}: ${error.message}`);
    }
  }
  
  return { contexts, errors };
}

/**
 * Build a contextual prompt by appending file contexts (text files only)
 */
export function buildContextualPrompt(
  userInput: string,
  fileContexts: FileContext[]
): string {
  if (fileContexts.length === 0) return userInput;
  
  let prompt = userInput + '\n\n';
  prompt += '## File Context\n\n';
  prompt += 'The following files were attached for context:\n\n';
  
  for (const ctx of fileContexts) {
    if (!ctx.isImage) {
      prompt += `### ${ctx.path}\n\`\`\`\n${ctx.content}\n\`\`\`\n\n`;
    }
  }
  
  return prompt;
}

/**
 * Build multimodal content blocks when images are attached
 * Returns either a string (text-only) or array of content blocks (with images)
 */
export function buildMultimodalContent(
  userText: string,
  fileContexts: FileContext[]
): string | any[] {
  const hasImages = fileContexts.some(f => f.isImage);
  
  if (!hasImages) {
    // Text-only: use existing buildContextualPrompt
    return buildContextualPrompt(userText, fileContexts);
  }
  
  // Build content blocks array for Claude Vision API
  const contentBlocks: any[] = [];
  
  // Add images first
  for (const ctx of fileContexts) {
    if (ctx.isImage) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: ctx.mediaType,
          data: ctx.base64Data
        }
      });
    }
  }
  
  // Add text content (including text file contexts)
  let textContent = userText;
  const textFiles = fileContexts.filter(f => !f.isImage);
  if (textFiles.length > 0) {
    textContent = buildContextualPrompt(userText, textFiles);
  }
  
  contentBlocks.push({
    type: "text",
    text: textContent
  });
  
  return contentBlocks;
}

/**
 * Get all workspace files (cached for performance)
 */
export async function getWorkspaceFiles(
  workingDir: string = process.cwd()
): Promise<string[]> {
  const now = Date.now();
  
  // Return cached files if still valid
  if (cachedFiles && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedFiles;
  }
  
  // Scan workspace
  const files = await fg('**/*', {
    cwd: workingDir,
    ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
    onlyFiles: true,
    deep: 6,
    suppressErrors: true
  });
  
  // Update cache
  cachedFiles = files.sort();
  cacheTimestamp = now;
  
  return cachedFiles;
}

/**
 * Filter files by query string (fuzzy matching)
 */
export function filterFilesByQuery(files: string[], query: string): string[] {
  if (!query) return files.slice(0, 50);
  
  const lowerQuery = query.toLowerCase();
  
  // Score each file
  const scored = files.map(file => {
    const lowerFile = file.toLowerCase();
    const basename = path.basename(file).toLowerCase();
    
    // Exact basename match = highest priority
    if (basename === lowerQuery) return { file, score: 1000 };
    if (basename.startsWith(lowerQuery)) return { file, score: 500 };
    
    // Contains in basename
    if (basename.includes(lowerQuery)) return { file, score: 100 };
    
    // Contains in full path
    if (lowerFile.includes(lowerQuery)) return { file, score: 10 };
    
    return { file, score: 0 };
  });
  
  // Filter and sort by score
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.file)
    .slice(0, 20); // Top 20 matches
}

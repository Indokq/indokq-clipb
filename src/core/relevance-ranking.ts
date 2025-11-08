import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceScanner, type WorkspaceCache, type FileTreeNode } from './workspace-scanner.js';
import { ConversationMemoryManager } from './conversation-memory.js';

export interface RankedFile {
  path: string;
  score: number;
  matchReasons: string[];
}

export interface FileSnippet {
  file: string;
  lines: [number, number];
  content?: string;
}

export interface ContextSelection {
  files: string[];
  snippets: FileSnippet[];
  estimatedTokens: number;
}

export class RelevanceRanker {
  constructor(
    private workspace: WorkspaceScanner,
    private memory: ConversationMemoryManager
  ) {}
  
  /**
   * Rank files by relevance to query
   */
  rankFiles(query: string, maxResults: number = 10): RankedFile[] {
    const cache = this.workspace.getCache();
    if (!cache) return [];
    
    const scores = new Map<string, { score: number; reasons: string[] }>();
    const queryTokens = this.tokenize(query);
    
    // Score all files
    for (const node of this.flattenFileTree(cache.fileTree)) {
      if (node.type !== 'file') continue;
      
      let score = 0;
      const reasons: string[] = [];
      
      // 1. File name match (40 points)
      if (this.matchesFileName(node.name, queryTokens)) {
        score += 40;
        reasons.push('filename match');
      }
      
      // 2. Keyword match (20 points per keyword)
      const keywordMatches = this.findKeywordMatches(node.path, queryTokens, cache);
      score += keywordMatches.length * 20;
      if (keywordMatches.length > 0) {
        reasons.push(`${keywordMatches.length} keyword matches`);
      }
      
      // 3. Recently accessed (30 points)
      if (this.memory.getRecentlyAccessedFiles(10).includes(node.path)) {
        score += 30;
        reasons.push('recently accessed');
      }
      
      // 4. Extension match (15 points)
      if (this.matchesExtension(node.extension, query)) {
        score += 15;
        reasons.push('extension match');
      }
      
      // 5. TODO/FIXME relevance (10 points)
      if (this.hasTodoMatch(node.path, queryTokens, cache)) {
        score += 10;
        reasons.push('has relevant TODO');
      }
      
      // 6. Directory relevance (5 points)
      if (this.matchesDirectory(node.path, queryTokens)) {
        score += 5;
        reasons.push('directory match');
      }
      
      if (score > 0) {
        scores.set(node.path, { score, reasons });
      }
    }
    
    // Sort by score and return top N
    return Array.from(scores.entries())
      .map(([path, { score, reasons }]) => ({ path, score, matchReasons: reasons }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
  
  /**
   * Select context within token budget
   */
  selectContext(query: string, maxTokens: number): ContextSelection {
    const rankedFiles = this.rankFiles(query, 20);
    const selection: ContextSelection = {
      files: [],
      snippets: [],
      estimatedTokens: 0
    };
    
    // Allocate tokens to top files
    for (const file of rankedFiles) {
      const fileTokens = this.estimateFileTokens(file.path);
      
      if (selection.estimatedTokens + fileTokens <= maxTokens) {
        // Include full file if it fits
        selection.files.push(file.path);
        selection.estimatedTokens += fileTokens;
      } else if (selection.estimatedTokens + 200 <= maxTokens) {
        // Include snippet only
        const snippet = this.extractRelevantSnippet(file.path, query);
        if (snippet) {
          selection.snippets.push(snippet);
          selection.estimatedTokens += 200;
        }
      } else {
        break; // Budget exhausted
      }
    }
    
    return selection;
  }
  
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .split(/\W+/)
      .filter(t => t.length > 2);
  }
  
  private flattenFileTree(nodes: FileTreeNode[]): FileTreeNode[] {
    const result: FileTreeNode[] = [];
    
    for (const node of nodes) {
      result.push(node);
      if (node.children) {
        result.push(...this.flattenFileTree(node.children));
      }
    }
    
    return result;
  }
  
  private matchesFileName(filename: string, tokens: string[]): boolean {
    const lowerName = filename.toLowerCase();
    return tokens.some(token => lowerName.includes(token));
  }
  
  private findKeywordMatches(filePath: string, tokens: string[], cache: WorkspaceCache): string[] {
    const matches: string[] = [];
    
    for (const token of tokens) {
      const files = cache.keywords.get(token);
      if (files && files.includes(filePath)) {
        matches.push(token);
      }
    }
    
    return matches;
  }
  
  private matchesExtension(extension: string | undefined, query: string): boolean {
    if (!extension) return false;
    
    const queryLower = query.toLowerCase();
    const ext = extension.toLowerCase();
    
    // Check for explicit mentions of extensions or languages
    const extensionMap: Record<string, string[]> = {
      '.ts': ['typescript', '.ts', 'ts'],
      '.tsx': ['typescript', 'react', '.tsx', 'tsx'],
      '.js': ['javascript', '.js', 'js'],
      '.jsx': ['javascript', 'react', '.jsx', 'jsx'],
      '.py': ['python', '.py', 'py'],
      '.rs': ['rust', '.rs', 'rs'],
      '.go': ['go', '.go', 'golang']
    };
    
    const keywords = extensionMap[ext] || [];
    return keywords.some(kw => queryLower.includes(kw));
  }
  
  private hasTodoMatch(filePath: string, tokens: string[], cache: WorkspaceCache): boolean {
    const todos = [...cache.todos, ...cache.fixmes].filter(t => t.file === filePath);
    
    for (const todo of todos) {
      const todoText = todo.text.toLowerCase();
      if (tokens.some(token => todoText.includes(token))) {
        return true;
      }
    }
    
    return false;
  }
  
  private matchesDirectory(filePath: string, tokens: string[]): boolean {
    const dirParts = path.dirname(filePath).toLowerCase().split(path.sep);
    return tokens.some(token => dirParts.some(part => part.includes(token)));
  }
  
  private estimateFileTokens(filePath: string): number {
    try {
      // Try to get from workspace root
      const cache = this.workspace.getCache();
      if (!cache) return 500; // Default estimate
      
      const fullPath = path.join(cache.rootPath, filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Rough estimate: 1 token ≈ 4 characters
      return Math.ceil(content.length / 4);
    } catch {
      return 500; // Default estimate if can't read
    }
  }
  
  private extractRelevantSnippet(filePath: string, query: string): FileSnippet | null {
    try {
      const cache = this.workspace.getCache();
      if (!cache) return null;
      
      const fullPath = path.join(cache.rootPath, filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const tokens = this.tokenize(query);
      
      // Find line with best keyword match
      let bestLine = 0;
      let bestScore = 0;
      
      lines.forEach((line, index) => {
        const lineLower = line.toLowerCase();
        const score = tokens.filter(token => lineLower.includes(token)).length;
        if (score > bestScore) {
          bestScore = score;
          bestLine = index;
        }
      });
      
      // Extract 10 lines around best match
      const start = Math.max(0, bestLine - 5);
      const end = Math.min(lines.length, bestLine + 5);
      const snippetLines = lines.slice(start, end);
      
      return {
        file: filePath,
        lines: [start + 1, end],
        content: snippetLines.join('\n')
      };
    } catch {
      return null;
    }
  }
}

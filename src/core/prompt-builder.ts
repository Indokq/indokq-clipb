import * as fs from 'fs';
import * as path from 'path';
import { ConversationMemoryManager } from './conversation-memory.js';
import { WorkspaceScanner } from './workspace-scanner.js';
import { RelevanceRanker } from './relevance-ranking.js';
import type { AppMode } from './types.js';

export interface PromptOptions {
  includeWorkspaceOverview?: boolean;
  includeRelevantFiles?: boolean;
  includeSessionSummary?: boolean;
  includeToolHistory?: boolean;
  includeCommandHistory?: boolean;
  mode?: AppMode;
  maxContextTokens?: number;
}

export interface SystemPromptPart {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface ContextMetadata {
  files: string[];
  tools: string[];
  memoryBlocks: string[];
}

export interface StructuredPrompt {
  system: SystemPromptPart[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  estimatedTokens: number;
  contextUsed: ContextMetadata;
}

export class AugmentedPromptBuilder {
  constructor(
    private memory: ConversationMemoryManager,
    private workspace: WorkspaceScanner,
    private ranker: RelevanceRanker
  ) {}
  
  /**
   * Build context-aware prompt for any mode
   */
  async buildPrompt(
    userQuery: string,
    baseSystemPrompt: string,
    options: PromptOptions = {}
  ): Promise<StructuredPrompt> {
    const sections: SystemPromptPart[] = [];
    let tokenCount = 0;
    const maxTokens = options.maxContextTokens || 4000;
    
    // 1. Base system prompt (always cached)
    sections.push({
      type: 'text',
      text: baseSystemPrompt,
      cache_control: { type: 'ephemeral' }
    });
    tokenCount += this.estimateTokens(baseSystemPrompt);
    
    // 2. Workspace overview (if enabled and cache exists)
    if (options.includeWorkspaceOverview && this.workspace.getCache()) {
      const overview = this.buildWorkspaceOverview();
      if (tokenCount + this.estimateTokens(overview) <= maxTokens) {
        sections.push({
          type: 'text',
          text: overview,
          cache_control: { type: 'ephemeral' }
        });
        tokenCount += this.estimateTokens(overview);
      }
    }
    
    // 3. Session context (if enabled)
    if (options.includeSessionSummary) {
      const sessionCtx = this.buildSessionContext(options.mode || 'normal');
      if (tokenCount + this.estimateTokens(sessionCtx) <= maxTokens) {
        sections.push({
          type: 'text',
          text: sessionCtx,
          cache_control: { type: 'ephemeral' }
        });
        tokenCount += this.estimateTokens(sessionCtx);
      }
    }
    
    // 4. Relevant files (if enabled and budget allows)
    if (options.includeRelevantFiles) {
      const remaining = maxTokens - tokenCount;
      if (remaining > 500) {
        const fileContext = await this.buildFileContext(userQuery, remaining);
        sections.push({
          type: 'text',
          text: fileContext,
          cache_control: { type: 'ephemeral' }
        });
        tokenCount += this.estimateTokens(fileContext);
      }
    }
    
    // 5. Tool history (if enabled)
    if (options.includeToolHistory) {
      const toolCtx = this.buildToolContext();
      if (tokenCount + this.estimateTokens(toolCtx) <= maxTokens) {
        sections.push({
          type: 'text',
          text: toolCtx
        });
        tokenCount += this.estimateTokens(toolCtx);
      }
    }
    
    // 6. Command history (if enabled)
    if (options.includeCommandHistory) {
      const cmdCtx = this.buildCommandContext();
      if (tokenCount + this.estimateTokens(cmdCtx) <= maxTokens) {
        sections.push({
          type: 'text',
          text: cmdCtx
        });
        tokenCount += this.estimateTokens(cmdCtx);
      }
    }
    
    return {
      system: sections,
      messages: this.memory.getRecentMessages(),
      estimatedTokens: tokenCount,
      contextUsed: this.buildContextMetadata(sections)
    };
  }
  
  private buildWorkspaceOverview(): string {
    const cache = this.workspace.getCache();
    if (!cache) return '';
    
    const scriptsList = cache.availableScripts 
      ? Object.entries(cache.availableScripts)
          .slice(0, 10)
          .map(([name, cmd]) => `- ${name}: ${cmd}`)
          .join('\n')
      : 'None';
    
    const fileTree = this.workspace.getFormattedFileTree(2);
    
    return `# Workspace Context

**Project Type**: ${cache.projectType}${cache.packageManager ? ` (${cache.packageManager})` : ''}
**Files**: ${cache.fileCount} files, ${cache.directoryCount} directories
**Scanned**: ${new Date(cache.scannedAt).toLocaleString()}

**Project Structure**:
${fileTree}

**Available Scripts**:
${scriptsList}

**TODOs Found**: ${cache.todos.length} items
**FIXMEs Found**: ${cache.fixmes.length} items
`;
  }
  
  private buildSessionContext(mode: AppMode): string {
    const ctx = this.memory.getSessionContext(mode);
    
    const recentFilesText = ctx.recentFiles.length > 0
      ? ctx.recentFiles.map(f => `- ${f}`).join('\n')
      : 'None';
    
    const recentCommandsText = ctx.recentCommands.length > 0
      ? ctx.recentCommands.map(c => `- ${c}`).join('\n')
      : 'None';
    
    const recentToolsText = ctx.recentTools.length > 0
      ? ctx.recentTools.map(t => `- ${t}`).join('\n')
      : 'None';
    
    return `# Session Context

**Recent Files Accessed**:
${recentFilesText}

**Recent Commands**:
${recentCommandsText}

**Recent Tool Uses**:
${recentToolsText}

**Current Directory**: ${ctx.currentDirectory || 'Unknown'}

${ctx.summary ? `**Conversation Summary**:\n${ctx.summary}\n` : ''}`;
  }
  
  private async buildFileContext(query: string, maxTokens: number): Promise<string> {
    const selection = this.ranker.selectContext(query, maxTokens);
    
    let context = '# Relevant Files\n\n';
    
    // Full files
    for (const file of selection.files) {
      try {
        const cache = this.workspace.getCache();
        if (!cache) continue;
        
        const fullPath = path.join(cache.rootPath, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        context += `## ${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      } catch {
        // Skip files that can't be read
      }
    }
    
    // Snippets
    for (const snippet of selection.snippets) {
      context += `## ${snippet.file} (lines ${snippet.lines[0]}-${snippet.lines[1]})\n`;
      if (snippet.content) {
        context += `\`\`\`\n${snippet.content}\n\`\`\`\n\n`;
      }
    }
    
    if (selection.files.length === 0 && selection.snippets.length === 0) {
      context += 'No relevant files found for this query.\n';
    }
    
    return context;
  }
  
  private buildToolContext(): string {
    const recentTools = this.memory.getRecentTools(5);
    
    if (recentTools.length === 0) {
      return '';
    }
    
    return `# Recent Tool Executions

${recentTools.map(tool => {
  const time = new Date(tool.timestamp).toLocaleTimeString();
  const statusIcon = tool.success ? '✓' : '✗';
  const inputStr = JSON.stringify(tool.input, null, 2);
  const outputPreview = tool.output.substring(0, 200);
  
  return `**${tool.toolName}** (${time}) ${statusIcon}
Input: ${inputStr}
Output: ${outputPreview}${tool.output.length > 200 ? '...' : ''}
Duration: ${tool.durationMs}ms
`;
}).join('\n')}`;
  }
  
  private buildCommandContext(): string {
    const recentCommands = this.memory.getRecentCommands(5);
    
    if (recentCommands.length === 0) {
      return '';
    }
    
    return `# Recent Command Executions

${recentCommands.map(cmd => {
  const time = new Date(cmd.timestamp).toLocaleTimeString();
  const statusIcon = cmd.exitCode === 0 ? '✓' : '✗';
  const outputPreview = cmd.output.substring(0, 200);
  
  return `**${cmd.command}** (${time}) ${statusIcon}
Exit Code: ${cmd.exitCode}
Output: ${outputPreview}${cmd.output.length > 200 ? '...' : ''}
`;
}).join('\n')}`;
  }
  
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
  
  private buildContextMetadata(sections: SystemPromptPart[]): ContextMetadata {
    const files: string[] = [];
    const tools = this.memory.getRecentTools(10).map(t => t.toolName);
    const memoryBlocks = sections.map(s => {
      if (s.text.startsWith('# Workspace Context')) return 'workspace';
      if (s.text.startsWith('# Session Context')) return 'session';
      if (s.text.startsWith('# Relevant Files')) return 'files';
      if (s.text.startsWith('# Recent Tool Executions')) return 'tools';
      if (s.text.startsWith('# Recent Command Executions')) return 'commands';
      return 'system';
    });
    
    // Extract file paths from sections
    for (const section of sections) {
      const fileMatches = section.text.match(/## (.+\.(?:ts|tsx|js|jsx|py|rs|go))/g);
      if (fileMatches) {
        files.push(...fileMatches.map(m => m.replace('## ', '')));
      }
    }
    
    return { files, tools, memoryBlocks };
  }
}

import { Message, UserMessage, AssistantMessage, AppMode } from './types.js';
import { claudeClient } from './models/claude-client.js';

export interface ToolExecution {
  id: string;
  toolName: string;
  input: any;
  output: string;
  timestamp: number;
  success: boolean;
  filesTouched?: string[];
  durationMs: number;
}

export interface FileAccess {
  path: string;
  operation: 'read' | 'write' | 'create' | 'delete';
  timestamp: number;
  mode: AppMode;
}

export interface CommandExecution {
  command: string;
  output: string;
  exitCode: number;
  timestamp: number;
  mode: AppMode;
}

export interface SessionContext {
  summary: string;
  recentFiles: string[];
  recentCommands: string[];
  recentTools: string[];
  currentDirectory?: string;
  estimatedTokens: number;
}

export interface ConversationMemory {
  recentHistory: Message[]; // Last 10 messages
  summary: string; // LLM-generated summary of older context
  keyDecisions: string[]; // Important choices made
  unresolvedIssues: string[]; // Pending problems
  lastSummaryTimestamp: number;
  
  // NEW: Enhanced context tracking
  toolHistory: ToolExecution[];
  fileAccessLog: FileAccess[];
  commandHistory: CommandExecution[];
  currentWorkingDirectory?: string;
}

export class ConversationMemoryManager {
  private memory: ConversationMemory = {
    recentHistory: [],
    summary: '',
    keyDecisions: [],
    unresolvedIssues: [],
    lastSummaryTimestamp: Date.now(),
    toolHistory: [],
    fileAccessLog: [],
    commandHistory: [],
    currentWorkingDirectory: process.cwd()
  };

  private readonly HISTORY_LIMIT = 10;
  private readonly SUMMARY_THRESHOLD = 20; // Summarize after 20 messages
  private readonly SUMMARY_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly TOOL_HISTORY_LIMIT = 50;
  private readonly FILE_LOG_LIMIT = 100;
  private readonly COMMAND_HISTORY_LIMIT = 50;

  /**
   * Add a message to memory
   */
  addMessage(message: Message) {
    this.memory.recentHistory.push(message);

    // Check if we need to compress
    if (this.shouldCompress()) {
      this.compressHistory();
    }
  }

  /**
   * Get context to send to Claude
   */
  getContext(): string {
    let context = '';

    if (this.memory.summary) {
      context += `## Previous Conversation Summary\n${this.memory.summary}\n\n`;
    }

    if (this.memory.keyDecisions.length > 0) {
      context += `## Key Decisions Made\n${this.memory.keyDecisions.map(d => `- ${d}`).join('\n')}\n\n`;
    }

    if (this.memory.unresolvedIssues.length > 0) {
      context += `## Unresolved Issues\n${this.memory.unresolvedIssues.map(i => `- ${i}`).join('\n')}\n\n`;
    }

    return context;
  }

  /**
   * Get recent history as Claude messages
   */
  getRecentMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.memory.recentHistory
      .filter(m => m.type === 'user' || m.type === 'assistant')
      .map(m => ({
        role: m.type as 'user' | 'assistant',
        content: m.type === 'user' ? (m as UserMessage).content : (m as AssistantMessage).content
      }));
  }

  /**
   * Clear all memory (e.g., /clear command)
   */
  clear() {
    this.memory = {
      recentHistory: [],
      summary: '',
      keyDecisions: [],
      unresolvedIssues: [],
      lastSummaryTimestamp: Date.now(),
      toolHistory: [],
      fileAccessLog: [],
      commandHistory: [],
      currentWorkingDirectory: process.cwd()
    };
  }

  /**
   * Add tool execution to history
   */
  addToolExecution(tool: ToolExecution) {
    this.memory.toolHistory.push(tool);
    
    // Keep only recent tools
    if (this.memory.toolHistory.length > this.TOOL_HISTORY_LIMIT) {
      this.memory.toolHistory = this.memory.toolHistory.slice(-this.TOOL_HISTORY_LIMIT);
    }
  }

  /**
   * Get recent tool executions
   */
  getRecentTools(limit: number = 10): ToolExecution[] {
    return this.memory.toolHistory.slice(-limit);
  }

  /**
   * Get tool executions by name
   */
  getToolsByName(toolName: string): ToolExecution[] {
    return this.memory.toolHistory.filter(t => t.toolName === toolName);
  }

  /**
   * Add file access to log
   */
  addFileAccess(access: FileAccess) {
    this.memory.fileAccessLog.push(access);
    
    // Keep only recent accesses
    if (this.memory.fileAccessLog.length > this.FILE_LOG_LIMIT) {
      this.memory.fileAccessLog = this.memory.fileAccessLog.slice(-this.FILE_LOG_LIMIT);
    }
  }

  /**
   * Get recently accessed files
   */
  getRecentlyAccessedFiles(limit: number = 10): string[] {
    const recentAccesses = this.memory.fileAccessLog.slice(-limit * 2); // Get more to dedupe
    const uniquePaths = new Set<string>();
    const result: string[] = [];
    
    // Reverse to get most recent first, dedupe
    for (let i = recentAccesses.length - 1; i >= 0 && result.length < limit; i--) {
      const path = recentAccesses[i].path;
      if (!uniquePaths.has(path)) {
        uniquePaths.add(path);
        result.push(path);
      }
    }
    
    return result;
  }

  /**
   * Get file access history for specific path
   */
  getFileHistory(path: string): FileAccess[] {
    return this.memory.fileAccessLog.filter(a => a.path === path);
  }

  /**
   * Add command execution to history
   */
  addCommandExecution(cmd: CommandExecution) {
    this.memory.commandHistory.push(cmd);
    
    // Keep only recent commands
    if (this.memory.commandHistory.length > this.COMMAND_HISTORY_LIMIT) {
      this.memory.commandHistory = this.memory.commandHistory.slice(-this.COMMAND_HISTORY_LIMIT);
    }
  }

  /**
   * Get recent command executions
   */
  getRecentCommands(limit: number = 10): CommandExecution[] {
    return this.memory.commandHistory.slice(-limit);
  }

  /**
   * Get cached command output if available and fresh
   */
  getCachedCommandOutput(command: string, maxAgeMs: number = 60000): string | null {
    const recent = this.memory.commandHistory
      .filter(c => c.command === command && Date.now() - c.timestamp < maxAgeMs)
      .slice(-1);
    
    return recent.length > 0 ? recent[0].output : null;
  }

  /**
   * Set current working directory
   */
  setCurrentDirectory(dir: string) {
    this.memory.currentWorkingDirectory = dir;
  }

  /**
   * Get session context for prompt building
   */
  getSessionContext(mode: AppMode): SessionContext {
    const recentFiles = this.getRecentlyAccessedFiles(10);
    const recentCommands = this.getRecentCommands(5).map(c => c.command);
    const recentTools = this.getRecentTools(5).map(t => `${t.toolName}(${t.success ? '✓' : '✗'})`);
    
    // Estimate tokens (rough: 4 chars per token)
    const summaryTokens = Math.ceil(this.memory.summary.length / 4);
    const filesTokens = Math.ceil(recentFiles.join('').length / 4);
    const commandsTokens = Math.ceil(recentCommands.join('').length / 4);
    const toolsTokens = Math.ceil(recentTools.join('').length / 4);
    
    return {
      summary: this.memory.summary,
      recentFiles,
      recentCommands,
      recentTools,
      currentDirectory: this.memory.currentWorkingDirectory,
      estimatedTokens: summaryTokens + filesTokens + commandsTokens + toolsTokens
    };
  }

  /**
   * Get memory stats for debugging
   */
  getStats() {
    return {
      recentHistoryCount: this.memory.recentHistory.length,
      hasSummary: !!this.memory.summary,
      keyDecisionsCount: this.memory.keyDecisions.length,
      unresolvedIssuesCount: this.memory.unresolvedIssues.length
    };
  }

  private shouldCompress(): boolean {
    const messageCount = this.memory.recentHistory.length;
    const timeSinceLastSummary = Date.now() - this.memory.lastSummaryTimestamp;

    return (
      messageCount >= this.SUMMARY_THRESHOLD ||
      (messageCount > this.HISTORY_LIMIT && timeSinceLastSummary > this.SUMMARY_INTERVAL)
    );
  }

  private async compressHistory() {
    // Extract messages to summarize (all except last 10)
    const messagesToCompress = this.memory.recentHistory.slice(
      0,
      -this.HISTORY_LIMIT
    );

    if (messagesToCompress.length === 0) return;

    // Build text to summarize
    const conversationText = messagesToCompress
      .filter(m => m.type === 'user' || m.type === 'assistant')
      .map(m => {
        if (m.type === 'user') return `User: ${(m as UserMessage).content}`;
        if (m.type === 'assistant') return `Assistant: ${(m as AssistantMessage).content}`;
        return '';
      })
      .join('\n\n');

    // Ask Claude to summarize
    try {
      const response = await claudeClient.sendMessage({
        system: `You are a conversation summarizer. Extract:
1. A concise summary of what was discussed
2. Key decisions made (list format)
3. Any unresolved issues or pending tasks (list format)

Format your response as JSON:
{
  "summary": "...",
  "keyDecisions": ["...", "..."],
  "unresolvedIssues": ["...", "..."]
}`,
        messages: [
          {
            role: 'user',
            content: `Summarize this conversation:\n\n${conversationText}`
          }
        ],
        max_tokens: 1024
      });

      // Parse Claude's response
      const content = response.content[0]?.text || '{}';
      const parsed = JSON.parse(content);

      // Update memory
      this.memory.summary = parsed.summary || '';
      this.memory.keyDecisions = parsed.keyDecisions || [];
      this.memory.unresolvedIssues = parsed.unresolvedIssues || [];
      this.memory.lastSummaryTimestamp = Date.now();

      // Keep only recent history
      this.memory.recentHistory = this.memory.recentHistory.slice(-this.HISTORY_LIMIT);

    } catch (error) {
      console.error('Failed to compress conversation history:', error);
      // Fallback: just truncate without summarizing
      this.memory.recentHistory = this.memory.recentHistory.slice(-this.HISTORY_LIMIT);
    }
  }
}

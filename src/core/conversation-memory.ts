import { Message, UserMessage, AssistantMessage } from './types.js';
import { claudeClient } from './models/claude-client.js';

export interface ConversationMemory {
  recentHistory: Message[]; // Last 10 messages
  summary: string; // LLM-generated summary of older context
  keyDecisions: string[]; // Important choices made
  unresolvedIssues: string[]; // Pending problems
  lastSummaryTimestamp: number;
}

export class ConversationMemoryManager {
  private memory: ConversationMemory = {
    recentHistory: [],
    summary: '',
    keyDecisions: [],
    unresolvedIssues: [],
    lastSummaryTimestamp: Date.now()
  };

  private readonly HISTORY_LIMIT = 10;
  private readonly SUMMARY_THRESHOLD = 20; // Summarize after 20 messages
  private readonly SUMMARY_INTERVAL = 5 * 60 * 1000; // 5 minutes

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
      lastSummaryTimestamp: Date.now()
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

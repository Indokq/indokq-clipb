import axios, { type AxiosInstance } from 'axios';
import { config } from '../../config/env.js';

export interface ClaudeStreamChunk {
  type: string;
  delta?: any;
  content_block?: any;
  message?: any;
  index?: number;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

export interface StreamOptions {
  system: string | any[];
  messages: ClaudeMessage[];
  tools?: any[];
  max_tokens?: number;
  enableWebSearch?: boolean;
  signal?: AbortSignal;
}

export class ClaudeClient {
  // No constructor - create axios client fresh on each request
  // This ensures API key is always read from latest .env file

  async *streamMessage(options: StreamOptions): AsyncGenerator<ClaudeStreamChunk> {
    const {
      system,
      messages,
      tools,
      max_tokens = 8192,
      signal,
    } = options;

    // Create client with fresh config on each request
    const client = axios.create({
      baseURL: config.ANTHROPIC_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': config.ANTHROPIC_API_KEY,
        ...(config.ANTHROPIC_AUTH_TOKEN && {
          'Authorization': `Bearer ${config.ANTHROPIC_AUTH_TOKEN}`
        })
      },
      timeout: 120000
    });

    // Inject system prompt into first user message if provided
    const messagesWithSystem = system ? [
      {
        role: 'user',
        content: (() => {
          const firstContent = messages[0].content;
          
          // If content is a string (text-only)
          if (typeof firstContent === 'string') {
            return `SYSTEM INSTRUCTIONS:\n${typeof system === 'string' ? system : JSON.stringify(system)}\n\n---\n\n${firstContent}`;
          }
          
          // If content is an array (multimodal with images)
          if (Array.isArray(firstContent)) {
            // DON'T inject system prompt for multimodal messages
            // The API works better without it when images are present
            return firstContent;
          }
          
          // Fallback: return as-is
          return firstContent;
        })()
      },
      ...messages.slice(1).map(m => ({ role: m.role, content: m.content }))
    ] : messages.map(m => ({ role: m.role, content: m.content }));

    const payload = {
      model: config.MODEL_NAME,
      max_tokens,
      // system parameter removed - injected into first message instead
      messages: messagesWithSystem,
      ...(tools && tools.length > 0 && { tools }),
      stream: true
    };

    try {
      const url = `${config.ANTHROPIC_BASE_URL}/v1/messages`;

      // Use native fetch for better streaming support
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': config.ANTHROPIC_API_KEY,
          ...(config.ANTHROPIC_AUTH_TOKEN && {
            'Authorization': `Bearer ${config.ANTHROPIC_AUTH_TOKEN}`
          })
        },
        body: JSON.stringify(payload),
        ...(signal && { signal })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API Error: ${response.status} - ${errorText}`);
      }

      // Parse SSE stream with native fetch
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6).trim();
            
            // Skip [DONE] marker and empty data
            if (data === '[DONE]' || !data) continue;
            
            try {
              const parsed = JSON.parse(data);
              yield parsed as ClaudeStreamChunk;
            } catch (e) {
              // Silently skip unparseable chunks
            }
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Streaming Error: ${error.message}`);
    }
  }

  async sendMessage(options: StreamOptions): Promise<any> {
    const {
      system,
      messages,
      tools,
      max_tokens = 4096,
    } = options;

    // Create client with fresh config
    const client = axios.create({
      baseURL: config.ANTHROPIC_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': config.ANTHROPIC_API_KEY,
        ...(config.ANTHROPIC_AUTH_TOKEN && {
          'Authorization': `Bearer ${config.ANTHROPIC_AUTH_TOKEN}`
        })
      },
      timeout: 120000
    });

    // Inject system prompt into first user message if provided
    const messagesWithSystem = system ? [
      {
        role: 'user',
        content: (() => {
          const firstContent = messages[0].content;
          
          // If content is a string (text-only)
          if (typeof firstContent === 'string') {
            return `SYSTEM INSTRUCTIONS:\n${typeof system === 'string' ? system : JSON.stringify(system)}\n\n---\n\n${firstContent}`;
          }
          
          // If content is an array (multimodal with images)
          if (Array.isArray(firstContent)) {
            // DON'T inject system prompt for multimodal messages
            // The API works better without it when images are present
            return firstContent;
          }
          
          // Fallback: return as-is
          return firstContent;
        })()
      },
      ...messages.slice(1).map(m => ({ role: m.role, content: m.content }))
    ] : messages.map(m => ({ role: m.role, content: m.content }));

    const payload = {
      model: config.MODEL_NAME,
      max_tokens,
      // system parameter removed - injected into first message instead
      messages: messagesWithSystem,
      ...(tools && tools.length > 0 && { tools }),
      stream: false
    };

    try {
      const response = await client.post('/v1/messages', payload);
      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new Error(`Anthropic API Error: ${error.response?.status || 'Unknown'} - ${errorMsg}`);
      }
      throw error;
    }
  }
}

export const claudeClient = new ClaudeClient();

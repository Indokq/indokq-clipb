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
  model?: string; // Override default model
  enableWebSearch?: boolean; // Legacy: auto-generates web_search tool
  betaFeatures?: string[]; // Beta feature headers (e.g., ['web-fetch-2025-09-10'])
  signal?: AbortSignal;
}

// Helper: Build web_search tool definition
export function buildWebSearchTool(options?: {
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  userLocation?: {
    type: 'approximate';
    city: string;
    region: string;
    country: string;
    timezone: string;
  };
}): any {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    ...(options?.maxUses && { max_uses: options.maxUses }),
    ...(options?.allowedDomains && { allowed_domains: options.allowedDomains }),
    ...(options?.blockedDomains && { blocked_domains: options.blockedDomains }),
    ...(options?.userLocation && { user_location: options.userLocation }),
  };
}

// Helper: Build web_fetch tool definition
export function buildWebFetchTool(options?: {
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  citations?: boolean;
  maxContentTokens?: number;
}): any {
  return {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
    ...(options?.maxUses && { max_uses: options.maxUses }),
    ...(options?.allowedDomains && { allowed_domains: options.allowedDomains }),
    ...(options?.blockedDomains && { blocked_domains: options.blockedDomains }),
    ...(options?.citations !== undefined && { citations: { enabled: options.citations } }),
    ...(options?.maxContentTokens && { max_content_tokens: options.maxContentTokens }),
  };
}

export class ClaudeClient {
  // No constructor - create axios client fresh on each request
  // This ensures API key is always read from latest .env file

  async *streamMessage(options: StreamOptions): AsyncGenerator<ClaudeStreamChunk> {
    const {
      system,
      messages,
      tools = [],
      max_tokens = 8192,
      model = config.MODEL_NAME,
      enableWebSearch = false,
      betaFeatures = [],
      signal,
    } = options;

    // Backward compatibility: auto-generate web_search tool if enableWebSearch is true
    const finalTools = [...tools];
    if (enableWebSearch && !tools.some(t => t.name === 'web_search')) {
      const allowedDomains = config.WEB_SEARCH_ALLOWED_DOMAINS
        ? config.WEB_SEARCH_ALLOWED_DOMAINS.split(',').map(d => d.trim()).filter(Boolean)
        : undefined;
      
      finalTools.push(buildWebSearchTool({
        maxUses: config.WEB_SEARCH_MAX_USES,
        ...(allowedDomains && allowedDomains.length > 0 && { allowedDomains })
      }));
    }

    // Auto-detect beta features from tools
    const finalBetaFeatures = [...betaFeatures];
    if (finalTools.some(t => t.type === 'web_fetch_20250910') && !finalBetaFeatures.includes('web-fetch-2025-09-10')) {
      finalBetaFeatures.push('web-fetch-2025-09-10');
    }

    // Create client with fresh config on each request
    const client = axios.create({
      baseURL: config.ANTHROPIC_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': config.ANTHROPIC_API_KEY,
        ...(config.ANTHROPIC_AUTH_TOKEN && {
          'Authorization': `Bearer ${config.ANTHROPIC_AUTH_TOKEN}`
        }),
        ...(finalBetaFeatures.length > 0 && {
          'anthropic-beta': finalBetaFeatures.join(',')
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
      model,
      max_tokens,
      // system parameter removed - injected into first message instead
      messages: messagesWithSystem,
      ...(finalTools.length > 0 && { tools: finalTools }),
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
          }),
          ...(finalBetaFeatures.length > 0 && {
            'anthropic-beta': finalBetaFeatures.join(',')
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
      tools = [],
      max_tokens = 4096,
      model = config.MODEL_NAME,
      enableWebSearch = false,
      betaFeatures = [],
    } = options;

    // Backward compatibility: auto-generate web_search tool if enableWebSearch is true
    const finalTools = [...tools];
    if (enableWebSearch && !tools.some(t => t.name === 'web_search')) {
      const allowedDomains = config.WEB_SEARCH_ALLOWED_DOMAINS
        ? config.WEB_SEARCH_ALLOWED_DOMAINS.split(',').map(d => d.trim()).filter(Boolean)
        : undefined;
      
      finalTools.push(buildWebSearchTool({
        maxUses: config.WEB_SEARCH_MAX_USES,
        ...(allowedDomains && allowedDomains.length > 0 && { allowedDomains })
      }));
    }

    // Auto-detect beta features from tools
    const finalBetaFeatures = [...betaFeatures];
    if (finalTools.some(t => t.type === 'web_fetch_20250910') && !finalBetaFeatures.includes('web-fetch-2025-09-10')) {
      finalBetaFeatures.push('web-fetch-2025-09-10');
    }

    // Create client with fresh config
    const client = axios.create({
      baseURL: config.ANTHROPIC_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': config.ANTHROPIC_API_KEY,
        ...(config.ANTHROPIC_AUTH_TOKEN && {
          'Authorization': `Bearer ${config.ANTHROPIC_AUTH_TOKEN}`
        }),
        ...(finalBetaFeatures.length > 0 && {
          'anthropic-beta': finalBetaFeatures.join(',')
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
      model,
      max_tokens,
      // system parameter removed - injected into first message instead
      messages: messagesWithSystem,
      ...(finalTools.length > 0 && { tools: finalTools }),
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

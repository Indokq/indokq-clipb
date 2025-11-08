import { z } from 'zod';

// Note: dotenv.config() is called in src/index.ts (the entry point)
// This ensures .env is loaded at runtime, not at build time

const envSchema = z.object({
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.codemirror.codes'),
  ANTHROPIC_API_KEY: z.string(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  MODEL_NAME: z.string().default('claude-sonnet-4-5-20250929'),
  MAX_SEARCH_ROUNDS: z.coerce.number().default(3),
  EXECUTION_TIMEOUT: z.coerce.number().default(30000),
  ENABLE_CACHING: z.coerce.boolean().default(true),
  ENABLE_WEB_SEARCH: z.coerce.boolean().default(true), // Legacy: auto-enables web_search tool
  WEB_SEARCH_MAX_USES: z.coerce.number().default(5),
  WEB_SEARCH_ALLOWED_DOMAINS: z.string().default(''), // Comma-separated
  WEB_FETCH_ENABLED: z.coerce.boolean().default(false), // Off by default (security)
  WEB_FETCH_MAX_USES: z.coerce.number().default(10),
  WEB_FETCH_ALLOWED_DOMAINS: z.string().default(''), // Comma-separated
  WEB_FETCH_MAX_TOKENS: z.coerce.number().default(100000),
  TUI_THEME: z.enum(['dark', 'light']).default('dark'),
  LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).default('info'),
  
  // Context Management System
  WORKSPACE_SCAN_ON_STARTUP: z.coerce.boolean().default(true),
  MAX_CONTEXT_TOKENS: z.coerce.number().default(4000),
  CACHE_WORKSPACE_METADATA: z.coerce.boolean().default(true),
  WORKSPACE_CACHE_TTL_HOURS: z.coerce.number().default(1),
  SESSION_CONTEXT_ENABLED: z.coerce.boolean().default(true),
  RELEVANCE_RANKING_ENABLED: z.coerce.boolean().default(true),
  
  // MCP (Model Context Protocol) Server Configuration
  MCP_SERVERS: z.string().default('[]'), // JSON array of server configs
  MCP_AUTO_CONNECT_ON_STARTUP: z.coerce.boolean().default(true),
  MCP_TOOL_TIMEOUT_MS: z.coerce.number().default(30000),
  
  // Tool Approval Level
  // 0 = OFF: All tools require approval
  // 1 = LOW: Only modifications require approval (read-only auto-allowed)
  // 2 = MEDIUM: Read-only + safe/reversible commands auto-allowed (DEFAULT)
  // 3 = HIGH: All tools auto-allowed (no approval)
  TOOL_APPROVAL_LEVEL: z.coerce.number().min(0).max(3).default(2),
});

export type Config = z.infer<typeof envSchema>;

// Function that reads fresh config from process.env every time
function getConfig(): Config {
  const parsed = envSchema.parse(process.env);
  
  // Remove trailing slash if present
  if (parsed.ANTHROPIC_BASE_URL.endsWith('/')) {
    parsed.ANTHROPIC_BASE_URL = parsed.ANTHROPIC_BASE_URL.slice(0, -1);
  }
  
  return parsed;
}

// Proxy object that reads fresh config on every property access
// This ensures API keys are always current after .env changes
export const config = new Proxy({} as Config, {
  get(_target, prop: string) {
    return getConfig()[prop as keyof Config];
  }
});

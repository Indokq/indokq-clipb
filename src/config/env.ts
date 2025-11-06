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
  ENABLE_WEB_SEARCH: z.coerce.boolean().default(true),
  TUI_THEME: z.enum(['dark', 'light']).default('dark'),
  LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).default('info'),
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

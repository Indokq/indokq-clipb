import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

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

export const config = envSchema.parse(process.env);

// Remove trailing slash if present
if (config.ANTHROPIC_BASE_URL.endsWith('/')) {
  config.ANTHROPIC_BASE_URL = config.ANTHROPIC_BASE_URL.slice(0, -1);
}

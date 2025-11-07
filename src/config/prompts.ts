import { generateSystemPrompt } from '../prompts/generator.js';
import {
  PLANNING_CONFIG,
  PREDICTION_CONFIG,
  TERMINUS_CONFIG,
  WEB_RESEARCH_CONFIG,
  STRATEGY_CONFIG,
  ENV_OBSERVATION_CONFIG,
  EXPLORATION_CONFIG,
  SYNTHESIS_CONFIG,
  EXECUTION_CONFIG,
  NORMAL_MODE_CONFIG
} from '../prompts/presets.js';

// Generate prompts from configs
export const PLANNING_SYSTEM_PROMPT = generateSystemPrompt(PLANNING_CONFIG);
export const PREDICTION_SYSTEM_PROMPT = generateSystemPrompt(PREDICTION_CONFIG);
export const TERMINUS_PROMPT = generateSystemPrompt(TERMINUS_CONFIG);
export const WEB_RESEARCH_PROMPT = generateSystemPrompt(WEB_RESEARCH_CONFIG);
export const STRATEGY_PROMPT = generateSystemPrompt(STRATEGY_CONFIG);
export const ENV_OBSERVATION_PROMPT = generateSystemPrompt(ENV_OBSERVATION_CONFIG);
export const EXPLORATION_PROMPT = generateSystemPrompt(EXPLORATION_CONFIG);
export const SYNTHESIS_PROMPT = generateSystemPrompt(SYNTHESIS_CONFIG);
export const EXECUTION_PROMPT = generateSystemPrompt(EXECUTION_CONFIG);
export const NORMAL_MODE_PROMPT = generateSystemPrompt(NORMAL_MODE_CONFIG);

// Export generator for dynamic use
export { generateSystemPrompt } from '../prompts/generator.js';

import { config } from '../../config/env.js';

export interface ModelInfo {
  id: string;
  name?: string;
  object?: string;
  owned_by?: string;
  created?: number;
}

export interface ModelsResponse {
  object?: string;
  data?: ModelInfo[];
  models?: ModelInfo[];
}

/**
 * Fetch available models from the API endpoint
 */
export async function fetchAvailableModels(): Promise<ModelInfo[]> {
  const baseUrl = config.ANTHROPIC_BASE_URL;
  const url = `${baseUrl}/models`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        ...(config.ANTHROPIC_AUTH_TOKEN && {
          'Authorization': `Bearer ${config.ANTHROPIC_AUTH_TOKEN}`
        })
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const data: ModelsResponse = await response.json();
    
    // Handle both OpenAI-style (data) and other formats (models)
    const models = data.data || data.models || [];
    
    return models;
  } catch (error: any) {
    console.error('[ModelService] Failed to fetch models:', error.message);
    throw error;
  }
}

/**
 * Get a display name for a model
 */
export function getModelDisplayName(model: ModelInfo): string {
  return model.name || model.id;
}

import { AgentDefinition } from '../types/agent-definition.js';

export const predictionAgent: AgentDefinition = {
  id: 'prediction',
  displayName: 'Task Predictor',
  
  spawnerPrompt: 'Analyzes task requirements and predicts needed resources',
  
  toolNames: [],
  
  systemPrompt: `You are a task prediction specialist.

Analyze the user's task and provide:
1. Task category (question/analysis/modification)
2. Risk level (low/medium/high)
3. Key files that might be relevant
4. Estimated complexity

Be concise and actionable.`,
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Task to analyze'
    }
  }
};

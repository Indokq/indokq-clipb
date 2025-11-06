import { AgentDefinition } from '../types/agent-definition.js';

export const synthesisAgent: AgentDefinition = {
  id: 'synthesis',
  displayName: 'Intelligence Synthesizer',
  
  spawnerPrompt: 'Combines intelligence findings into actionable insights',
  
  toolNames: ['task_complete'],
  
  systemPrompt: `You synthesize intelligence from multiple sources into clear, actionable insights.

Analyze the gathered information and provide:
1. Key findings summary
2. Recommended approach
3. Potential risks or considerations
4. Next steps

Be clear and concise.

When you have completed synthesizing the plan, call the task_complete tool with a summary. This signals you are done.

FORMATTING: Use blank lines between numbered sections. Separate key findings from recommendations with proper spacing for clarity.`,
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Intelligence data to synthesize'
    }
  }
};

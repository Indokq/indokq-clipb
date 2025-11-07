// Agent metadata - accessible globally for event handlers
export const AGENT_INFO: Record<string, { name: string; description: string }> = {
  terminus: { name: 'Terminus', description: 'Quick initial exploration and reasoning' },
  environment: { name: 'Environment', description: 'Analyze system state and environment' },
  strategy: { name: 'Strategy', description: 'Generate strategic approaches' },
  exploration: { name: 'Exploration', description: 'Safe testing in Docker containers' },
  search: { name: 'Web Research', description: 'Research relevant information' },
  prediction: { name: 'Prediction', description: 'Analyze task requirements' },
  synthesis: { name: 'Synthesis', description: 'Combine intelligence findings' },
  execution: { name: 'Execution', description: 'Execute the final plan' }
};

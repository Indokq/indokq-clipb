export interface AgentDefinition {
  id: string;
  displayName: string;
  systemPrompt: string;
  toolNames: string[];
  inputSchema: {
    prompt: {
      type: 'string';
      description: string;
    };
  };
  spawnerPrompt?: string;
  spawnableAgents?: string[];
}

export interface AgentSpawnRequest {
  agent_type: string;
  prompt: string;
}

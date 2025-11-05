export interface AgentDefinition {
    id: string;
    displayName: string;
    model: string;
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
//# sourceMappingURL=agent-definition.d.ts.map
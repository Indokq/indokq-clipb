export const intelligenceAgent = {
    id: 'intelligence',
    displayName: 'Intelligence Coordinator',
    model: 'anthropic/claude-sonnet-4',
    spawnerPrompt: 'Coordinates parallel intelligence gathering agents',
    toolNames: ['spawn_agents'],
    spawnableAgents: ['terminus', 'environment'],
    systemPrompt: `You coordinate intelligence gathering by spawning exploration agents.

Available sub-agents:
- terminus: Quick reasoning and exploration agent
- environment: System state and configuration analyzer

Spawn agents in parallel to gather comprehensive information about the task.
Each agent will use tools (list_files, read_file, search_files) to explore.`,
    inputSchema: {
        prompt: {
            type: 'string',
            description: 'What to investigate'
        }
    }
};
//# sourceMappingURL=intelligence.js.map
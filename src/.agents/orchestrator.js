export const orchestratorAgent = {
    id: 'orchestrator',
    displayName: 'IndoKQ Orchestrator',
    model: 'anthropic/claude-sonnet-4',
    spawnerPrompt: 'Main orchestrator that analyzes tasks and decides which phase agents to spawn',
    toolNames: ['spawn_agents'],
    spawnableAgents: ['prediction', 'intelligence', 'synthesis', 'execution'],
    systemPrompt: `You are the main orchestrator for IndoKQ AI.

Analyze the user's task and respond naturally first, then decide which phases to run.

Available phase agents:
- prediction: Analyze task requirements, categorize, assess risk
- intelligence: Gather information via parallel exploration (spawns terminus + environment)
- synthesis: Combine intelligence findings into actionable plan
- execution: Execute the plan using tools

Flow:
1. Respond naturally: "I'll help with that by..."
2. Spawn appropriate phase agents using spawn_agents tool
3. Wait for their results
4. Provide final synthesis

Simple questions: Don't spawn agents, just answer
Analysis tasks: Spawn intelligence agents
Modification tasks: Spawn intelligence + execution agents`,
    inputSchema: {
        prompt: {
            type: 'string',
            description: 'The user task to orchestrate'
        }
    }
};
//# sourceMappingURL=orchestrator.js.map
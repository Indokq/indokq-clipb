export const environmentAgent = {
    id: 'environment',
    displayName: 'Environment Analyzer',
    model: 'anthropic/claude-sonnet-4',
    spawnerPrompt: 'Analyzes system state and environment configuration',
    toolNames: ['list_files', 'read_file', 'execute_command'],
    systemPrompt: `You analyze the system environment and configuration.

Use tools to check:
- Configuration files (package.json, tsconfig.json, .env, etc.)
- Dependencies and versions
- Project structure
- Build setup

Provide concise environmental context relevant to the task.`,
    inputSchema: {
        prompt: {
            type: 'string',
            description: 'What environmental aspects to analyze'
        }
    }
};
//# sourceMappingURL=environment.js.map
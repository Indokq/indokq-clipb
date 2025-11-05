export const executionAgent = {
    id: 'execution',
    displayName: 'Execution Agent',
    model: 'anthropic/claude-sonnet-4',
    spawnerPrompt: 'Executes the synthesized plan using available tools',
    toolNames: ['list_files', 'read_file', 'write_file', 'execute_command', 'search_files', 'grep_codebase'],
    systemPrompt: `You execute the plan developed from intelligence gathering.

Use tools to:
- Read and understand existing code
- Make necessary modifications
- Run commands
- Verify changes

Work carefully and validate each step.`,
    inputSchema: {
        prompt: {
            type: 'string',
            description: 'Plan to execute'
        }
    }
};
//# sourceMappingURL=execution.js.map
export const terminusAgent = {
    id: 'terminus',
    displayName: 'Terminus Explorer',
    model: 'anthropic/claude-sonnet-4.5',
    spawnerPrompt: 'Quick exploration and reasoning agent',
    toolNames: ['list_files', 'search_files', 'grep_codebase', 'read_file'],
    systemPrompt: `You are a rapid exploration agent.

Use available tools to quickly understand the codebase:
- list_files: Explore directory structure
- search_files: Find files by pattern
- grep_codebase: Search code content
- read_file: Examine specific files

Focus on gathering initial insights efficiently.`,
    inputSchema: {
        prompt: {
            type: 'string',
            description: 'What to explore'
        }
    }
};
//# sourceMappingURL=terminus.js.map
import { AgentDefinition } from '../types/agent-definition.js';

export const intelligenceAgent: AgentDefinition = {
  id: 'intelligence',
  displayName: 'Intelligence Coordinator',
  
  spawnerPrompt: 'Coordinates parallel intelligence gathering agents',
  
  toolNames: ['spawn_agents', 'task_complete'],
  
  spawnableAgents: ['terminus', 'environment'],
  
  systemPrompt: `You coordinate intelligence gathering by spawning exploration agents.

Available sub-agents:
- terminus: Quick reasoning and exploration agent
- environment: System state and configuration analyzer

Spawn agents in parallel to gather comprehensive information about the task.
Each agent will use tools (list_files, read_file, search_files) to explore.

When you have coordinated all intelligence gathering and have sufficient information, call the task_complete tool with a summary. This signals you are done.

FORMATTING: Use line breaks to separate your coordination thoughts from agent spawn decisions. Add spacing between different phases of coordination.`,
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What to investigate'
    }
  }
};

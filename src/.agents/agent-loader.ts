import { AgentDefinition } from './types/agent-definition.js';
import { orchestratorAgent } from './orchestrator.js';
import { predictionAgent } from './phases/prediction.js';
import { intelligenceAgent } from './phases/intelligence.js';
import { terminusAgent } from './phases/terminus.js';
import { environmentAgent } from './phases/environment.js';
import { synthesisAgent } from './phases/synthesis.js';
import { executionAgent } from './phases/execution.js';

const agentRegistry: Record<string, AgentDefinition> = {
  'orchestrator': orchestratorAgent,
  'prediction': predictionAgent,
  'intelligence': intelligenceAgent,
  'terminus': terminusAgent,
  'environment': environmentAgent,
  'synthesis': synthesisAgent,
  'execution': executionAgent
};

export function loadAgent(agentId: string): AgentDefinition {
  const agent = agentRegistry[agentId];
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  return agent;
}

export function listAgents(): AgentDefinition[] {
  return Object.values(agentRegistry);
}

/**
 * AI Prompts Generator
 * 
 * Contains prompt templates and utilities for formatting prompts 
 * for different AI tasks and scenarios.
 */

export interface PromptConfig {
  role: string;
  objective: string;
  tools?: string[];
  constraints?: string[];
  guidelines?: string[];
  examples?: Array<{name: string, description: string}>;
  formatting?: boolean;
  additionalContext?: string;
}

export function generateSystemPrompt(config: PromptConfig): string {
  const sections: string[] = [];
  
  // Role and objective
  sections.push(config.role);
  if (config.objective) {
    sections.push('');
    sections.push(config.objective);
  }
  
  // Tools section
  if (config.tools?.length) {
    sections.push('');
    sections.push('Available tools:');
    config.tools.forEach(tool => {
      sections.push(`- ${tool}: ${getToolDescription(tool)}`);
    });
  }
  
  // Additional context
  if (config.additionalContext) {
    sections.push('');
    sections.push(config.additionalContext);
  }
  
  // Constraints
  if (config.constraints?.length) {
    sections.push('');
    sections.push('IMPORTANT RULES:');
    config.constraints.forEach(rule => {
      sections.push(`- ${rule}`);
    });
  }
  
  // Guidelines
  if (config.guidelines?.length) {
    sections.push('');
    sections.push('Guidelines:');
    config.guidelines.forEach((guideline, i) => {
      sections.push(`${i + 1}. ${guideline}`);
    });
  }
  
  // Examples
  if (config.examples?.length) {
    sections.push('');
    sections.push('Examples:');
    config.examples.forEach(ex => {
      sections.push(`- ${ex.name}: ${ex.description}`);
    });
  }
  
  // Formatting reminder
  if (config.formatting) {
    sections.push('');
    sections.push('FORMATTING: Use line breaks to separate different sections. Add spacing between actions for readability.');
  }
  
  return sections.join('\n');
}

function getToolDescription(tool: string): string {
  const descriptions: Record<string, string> = {
    'list_files': 'List directory contents',
    'read_file': 'Read file contents',
    'write_file': 'Write/create files',
    'search_files': 'Find files by pattern',
    'grep_codebase': 'Search code for patterns',
    'execute_command': 'Run shell commands',
    'docker_execute': 'Run commands in Docker',
    'spawn_agents': 'Spawn sub-agents for parallel work',
    'task_complete': 'Signal task completion',
    'propose_file_changes': 'Propose file changes with diff preview'
  };
  
  return descriptions[tool] || tool;
}

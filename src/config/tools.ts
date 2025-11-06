export const executeCommandTool = {
  name: 'execute_command',
  description: 'Execute a shell command on the local system. Returns stdout, stderr, and exit code.',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)'
      }
    },
    required: ['command']
  }
};

export const readFileTool = {
  name: 'read_file',
  description: 'Read the contents of a file from the filesystem.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read'
      }
    },
    required: ['path']
  }
};

export const writeFileTool = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      }
    },
    required: ['path', 'content']
  }
};

export const dockerExecuteTool = {
  name: 'docker_execute',
  description: 'Execute a command in a Docker container for safe exploration and testing.',
  input_schema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Docker image to use (default: ubuntu:latest)'
      },
      command: {
        type: 'string',
        description: 'Command to execute in the container'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)'
      }
    },
    required: ['command']
  }
};

export const listFilesTool = {
  name: 'list_files',
  description: 'List files and directories in a tree structure. Prefer this over ls/dir commands.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (default: current directory)'
      }
    },
    required: []
  }
};

export const searchFilesTool = {
  name: 'search_files',
  description: 'Search for files matching a glob pattern (e.g., "**/*.ts"). Useful for finding files by name or extension.',
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files (e.g., "**/*.ts")'
      },
      directory: {
        type: 'string',
        description: 'Directory to search in (optional)'
      }
    },
    required: ['pattern']
  }
};

export const grepCodebaseTool = {
  name: 'grep_codebase',
  description: 'Search for text patterns in code files using regex. Returns matching lines with file paths and line numbers.',
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for'
      },
      flags: {
        type: 'string',
        description: 'Regex flags (e.g., "i" for case-insensitive)'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 15)'
      }
    },
    required: ['pattern']
  }
};

export const spawnAgentsTool = {
  name: 'spawn_agents',
  description: 'Spawn one or more phase agents to help accomplish the task. Use this to delegate work to specialized agents.',
  input_schema: {
    type: 'object',
    properties: {
      agents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agent_type: { 
              type: 'string', 
              description: 'Agent ID to spawn: prediction, intelligence, terminus, environment, synthesis, execution'
            },
            prompt: { 
              type: 'string', 
              description: 'Specific task/question for this agent' 
            }
          },
          required: ['agent_type', 'prompt']
        },
        description: 'Array of agents to spawn with their prompts'
      }
    },
    required: ['agents']
  }
};

export const taskCompleteTool = {
  name: 'task_complete',
  description: 'Signal that you have completed your assigned task. Use this when you have finished all work and are ready to hand back control. This prevents unnecessary looping.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A brief summary of what was accomplished'
      },
      status: {
        type: 'string',
        enum: ['success', 'partial', 'failed'],
        description: 'The completion status of the task (default: success)'
      }
    },
    required: ['summary']
  }
};

export const proposeFileChangesTool = {
  name: 'propose_file_changes',
  description: 'Propose changes to a file with diff preview. Changes are NOT applied immediately - user must approve. Use this instead of write_file for safer modifications.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to modify'
      },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'The exact text to find and replace'
            },
            replace: {
              type: 'string',
              description: 'The new text to replace with'
            }
          },
          required: ['search', 'replace']
        },
        description: 'Array of search/replace operations to apply'
      },
      description: {
        type: 'string',
        description: 'Brief description of what these changes accomplish'
      }
    },
    required: ['path', 'changes']
  }
};

export const allTools = [
  listFilesTool,
  searchFilesTool,
  grepCodebaseTool,
  readFileTool,
  writeFileTool,
  executeCommandTool,
  dockerExecuteTool,
  taskCompleteTool
];

// Tools available in agent mode (no spawn_agents)
export const agentModeTools = [
  listFilesTool,
  searchFilesTool,
  grepCodebaseTool,
  readFileTool,
  writeFileTool,
  executeCommandTool,
  dockerExecuteTool
];

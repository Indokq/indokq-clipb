export const executeCommandTool = {
  name: 'execute_command',
  description: `Execute a shell command on the local system. Returns stdout, stderr, and exit code. Use for running tests, builds, git commands, etc.

Examples:
- Run tests: {"command": "npm test"}
- Check git status: {"command": "git status"}
- Build project: {"command": "npm run build"}
- Type check: {"command": "npm run type-check"}
- List files (when list_files not suitable): {"command": "ls -la"}`,
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute as a complete string. Examples: "npm test", "git status", "python main.py"'
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
  description: `Read the contents of a file from the filesystem. Use this to examine source code, configuration files, documentation, etc.

Examples:
- Read package.json: {"path": "package.json"}
- Read source file: {"path": "src/index.ts"}
- Read README: {"path": "README.md"}
- Read config: {"path": "tsconfig.json"}`,
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read (relative to project root). Examples: "package.json", "src/index.ts", "README.md"'
      }
    },
    required: ['path']
  }
};

export const createFileTool = {
  name: 'create_file',
  description: `Create a new file with the specified content. Fails if file already exists.

Examples:
- Create new file: {"path": "hello.txt", "content": "Hello World"}
- Create with directory: {"path": "src/utils/helper.ts", "content": "export const helper = () => {}"}

Use edit_file to modify existing files.`,
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the new file to create'
      },
      content: {
        type: 'string',
        description: 'Content for the new file'
      }
    },
    required: ['path', 'content']
  }
};

export const editFileTool = {
  name: 'edit_file',
  description: `Edit an existing file. Shows a diff preview and requires user approval before applying changes. Fails if file does not exist.

Examples:
- Edit existing file: {"path": "hello.txt", "content": "Hello World Updated"}
- Modify source file: {"path": "src/index.ts", "content": "// updated code"}

Use create_file to create new files.`,
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the existing file to edit'
      },
      content: {
        type: 'string',
        description: 'New content for the file'
      }
    },
    required: ['path', 'content']
  }
};

export const writeFileTool = {
  name: 'write_file',
  description: '[DEPRECATED] Use create_file for new files or edit_file for modifications. This tool automatically detects file existence and routes accordingly.',
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
  description: `List files and directories in a tree structure. Use this to explore project structure.

Examples:
- To see current directory: {"path": "."}
- To see src folder: {"path": "src"}
- To see specific subdirectory: {"path": "src/components"}

Prefer this over ls/dir commands for better formatted output.`,
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list. Use "." for current directory, or provide relative path like "src" or "src/components". Defaults to current directory if not provided.'
      }
    },
    required: []
  }
};

export const searchFilesTool = {
  name: 'search_files',
  description: `Search for files matching a glob pattern. Useful for finding files by name or extension.

Examples:
- Find all TypeScript files: {"pattern": "**/*.ts"}
- Find all test files: {"pattern": "**/*.test.ts"}
- Find specific file: {"pattern": "**/package.json"}
- Find in directory: {"pattern": "*.ts", "directory": "src"}
- Find React components: {"pattern": "**/*.tsx"}`,
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files. Use ** for recursive search. Examples: "**/*.ts", "**/*.test.js", "**/README.md"'
      },
      directory: {
        type: 'string',
        description: 'Directory to search in (optional). If not provided, searches from project root.'
      }
    },
    required: ['pattern']
  }
};

export const grepCodebaseTool = {
  name: 'grep_codebase',
  description: `Search for text patterns in code files using regex. Returns matching lines with file paths and line numbers. Perfect for finding function definitions, class names, import statements, etc.

Examples:
- Find function: {"pattern": "function handleToolCall"}
- Find class: {"pattern": "class Orchestrator"}
- Find imports: {"pattern": "import.*react", "flags": "i"}
- Case-insensitive: {"pattern": "TODO", "flags": "i"}
- Find export: {"pattern": "export const.*Tool"}`,
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for. Examples: "function myFunc", "class\\\\s+\\\\w+", "import.*Component"'
      },
      flags: {
        type: 'string',
        description: 'Regex flags: "i" for case-insensitive, "m" for multiline, "g" for global'
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
  createFileTool,
  editFileTool,
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
  createFileTool,
  editFileTool,
  writeFileTool,
  executeCommandTool,
  dockerExecuteTool
];

import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext.js';
import { useMessages } from './useMessages.js';
import { FileContext } from '../../core/types.js';
import { parseFileMentions, resolveFileMentions, buildContextualPrompt, buildMultimodalContent } from '../../tools/file-context.js';
import { generateWorkspaceSummary } from '../../tools/codebase-summary.js';
import { parseAgentInvocation } from '../../core/tool-executor.js';
import path from 'path';

export const useModeHandler = (
  executeWithTools: (task: string, fileContexts: FileContext[]) => Promise<void>,
  executeAgentDirectly: (agentName: string, task: string, fileContexts: FileContext[]) => Promise<void>,
  executeInExecutionMode: (task: string, isFirstMessage?: boolean) => Promise<void>
) => {
  const {
    mode,
    setMode,
    setMessages,
    setAttachedFiles,
    attachedFiles,
    conversationHistoryRef,
    memoryManagerRef,
    workspaceContextAddedRef,
    streamMessageIdsRef,
    approvalManagerRef,
    setApprovalLevel,
    setShowMCPMenu,
    setMCPView,
  } = useAppContext();

  const { addMessage } = useMessages();

  const handleUserInput = useCallback(async (input: string) => {
    // Detect drag-dropped image paths (Windows: C:\path\file.png, Unix: /path/file.png)
    const imagePathPattern = /(?:[A-Z]:\\[\w\s\-().\\/]+|\/[\w\s\-().\\/]+)\.(png|jpg|jpeg|gif|webp|bmp)/gi;
    const imagePaths = input.match(imagePathPattern);
    
    // Auto-attach detected image paths
    if (imagePaths && imagePaths.length > 0) {
      for (const imagePath of imagePaths) {
        const { contexts, errors } = await resolveFileMentions([imagePath.trim()], process.cwd());
        if (contexts.length > 0) {
          setAttachedFiles(prev => [...prev, ...contexts]);
          addMessage({
            type: 'system',
            content: `🖼️ Image auto-attached: ${path.basename(imagePath)}`,
            color: 'cyan'
          });
          // Remove the path from input
          input = input.replace(imagePath, '').trim();
        }
        for (const error of errors) {
          addMessage({
            type: 'system',
            content: error,
            color: 'yellow'
          });
        }
      }
    }
    
    // Parse @mentions for file context
    const { text: cleanedInput, mentions } = parseFileMentions(input);
    
    // Resolve file mentions if any
    let fileContexts: FileContext[] = [];
    if (mentions.length > 0) {
      const { contexts, errors } = await resolveFileMentions(mentions, process.cwd());
      fileContexts = contexts;
      
      // Show errors for failed mentions
      for (const error of errors) {
        addMessage({
          type: 'system',
          content: error,
          color: 'yellow'
        });
      }
    }
    
    // Merge with already-attached files from state (Alt+V clipboard images, etc.)
    fileContexts = [...attachedFiles, ...fileContexts];
    
    // Set attached files (shown above input)
    if (fileContexts.length > 0) {
      setAttachedFiles(fileContexts);
    }
    
    // Use cleaned input (without @mentions)
    const finalInput = cleanedInput || input;
    
    // Help command
    if (finalInput === '/help' || finalInput === 'help') {
      addMessage({
        type: 'system',
        content: `
Commands:
/help ............... Display help information
/plan or /spec ...... Switch to specification mode
/exec <task> ........ Execute task in execution mode
/normal ............. Switch to normal mode
/mcp ................ MCP server management
/approval [0-3] ..... View/set tool approval level
/clear .............. Clear conversation history
/context reset ...... Reset workspace context
/context show ....... Show current workspace context
/exit ............... Quit indokq CLI

Normal Mode (default - current: ${mode}):
- Talk naturally and Claude will use tools to help you
- Example: "create a hello.txt file"
- Example: "analyze the codebase structure"
- Quick tasks and exploratory work

Specification Mode:
- Describe features in simple terms (4-6 sentences)
- indokq generates detailed spec with implementation plan
- Review and approve before any code changes
- Automatic safety checks and verification
- Example: "Add MCP server connection with UI management"

Execution Mode:
- Full AI agent with multi-phase intelligence system
- Parallel intelligence streams (terminus, web research, strategy, etc.)
- Automated task execution
- Example: /exec "refactor the authentication system"

Keyboard Shortcuts:
Shift+Tab ........... Cycle modes (normal → spec → execution)
Alt+V ............... Paste clipboard image
Ctrl+O .............. Toggle verbose output
Ctrl+T .............. Cycle approval level (OFF→LOW→MEDIUM→HIGH)
ESC ................. Cancel operation / Close menus

File & Image Attachment:
@filename ........... Attach files to your query
                      Example: @app.tsx how does this work?
Alt+V ............... Paste image from clipboard (screenshots)
Drag & Drop ......... Drag image files into terminal

Explicit agent invocation:
  @terminus <task> ....... Quick exploration agent
  @environment <task> .... System state analyzer
  @intelligence <task> ... Meta-agent coordinator
  (and more agents available...)

Supported images: .png, .jpg, .jpeg, .gif, .webp, .bmp

Current mode: ${mode}
        `
      });
      setAttachedFiles([]);
      return;
    }

    // Clear command
    if (finalInput === '/clear') {
      setMessages([]);
      conversationHistoryRef.current = [];
      memoryManagerRef.current.clear();
      setAttachedFiles([]);
      workspaceContextAddedRef.current = false;
      return;
    }
    
    // MCP command
    if (finalInput === '/mcp') {
      setShowMCPMenu(true);
      setMCPView('main');
      return;
    }
    
    // Approval level command
    if (finalInput.startsWith('/approval')) {
      const args = finalInput.split(/\s+/);
      if (args.length === 1) {
        // Show current level
        const currentLevel = approvalManagerRef.current.getLevel();
        const levelName = approvalManagerRef.current.getLevelName();
        addMessage({
          type: 'system',
          content: `Current approval level: ${currentLevel} (${levelName})

Approval Levels:
  0 (OFF)    - All tools require approval
  1 (LOW)    - Only modifications require approval (read-only auto-allowed)
  2 (MEDIUM) - Reversible operations auto-allowed: reads, file edits, safe commands
               Dangerous/irreversible require approval: rm -rf, git push, sudo, docker, MCP
  3 (HIGH)   - All tools auto-allowed (full automation)

To change level: /approval [0-3]
Example: /approval 1`,
          color: 'cyan'
        });
      } else {
        const newLevel = parseInt(args[1]);
        if (isNaN(newLevel) || newLevel < 0 || newLevel > 3) {
          addMessage({
            type: 'system',
            content: '❌ Invalid approval level. Must be 0, 1, 2, or 3.',
            color: 'red'
          });
        } else {
          approvalManagerRef.current.updateLevel(newLevel as any);
          setApprovalLevel(newLevel as any);
          const levelName = approvalManagerRef.current.getLevelName();
          addMessage({
            type: 'system',
            content: `✓ Approval level set to ${newLevel} (${levelName})`,
            color: 'green'
          });
        }
      }
      return;
    }
    
    // Context command
    if (finalInput === '/context reset') {
      workspaceContextAddedRef.current = false;
      addMessage({
        type: 'system',
        content: '✓ Context reset'
      });
      return;
    }
    
    if (finalInput === '/context show') {
      generateWorkspaceSummary(process.cwd()).then(summary => {
        addMessage({
          type: 'system',
          content: summary
        });
      });
      return;
    }

    // Normal command - switch to normal mode
    if (finalInput === '/normal') {
      setMode('normal');
      return;
    }
    
    // Plan/Spec command - switch to specification mode
    if (finalInput.startsWith('/plan') || finalInput.startsWith('/spec')) {
      const message = finalInput.startsWith('/plan') 
        ? finalInput.slice(5).trim() 
        : finalInput.slice(5).trim();
      
      // Always switch to planning mode
      setMode('planning');
      
      if (message) {
        // User provided message - process it
        handleUserInput(message);
      }
      return;
    }
    
    // Exec command - switch to execution mode
    if (finalInput.startsWith('/exec')) {
      const task = finalInput.slice(5).trim();
      
      // Always switch to execution mode
      setMode('execution');
      streamMessageIdsRef.current = {};
      
      if (task) {
        // User provided task - execute it
        const contextualTask = fileContexts.length > 0 
          ? buildContextualPrompt(task, fileContexts)
          : task;
        executeInExecutionMode(contextualTask, true);
        setAttachedFiles([]);
      }
      return;
    }

    // Exit command
    if (finalInput === '/exit') {
      process.exit(0);
    }

    // Build user message with inline image indicators
    let userMessage = finalInput;
    if (fileContexts.length > 0) {
      const imageCount = fileContexts.filter(f => f.isImage).length;
      if (imageCount > 0) {
        const imageIndicators = fileContexts
          .filter(f => f.isImage)
          .map((_, idx) => `[image#${idx + 1}]`)
          .join(' ');
        userMessage = `${imageIndicators} ${finalInput}`;
      }
    }
    
    // Add user message to stream
    addMessage({
      type: 'user',
      content: userMessage,
      icon: '💬',
      color: 'green'
    });

    if (mode === 'normal') {
      // Normal mode - Claude can call tools naturally, but can't spawn agents
      // Users explicitly spawn agents with @agentname
      
      // Check for explicit agent invocation (@agentname task)
      const agentInvocation = parseAgentInvocation(finalInput);
      if (agentInvocation) {
        // User explicitly spawned agent - execute it directly
        executeAgentDirectly(agentInvocation.agentName, agentInvocation.task, fileContexts);
        setAttachedFiles([]);
        return;
      }
      
      // Regular natural language - let Claude handle with tools (no spawn_agents)
      executeWithTools(finalInput, fileContexts);
      setAttachedFiles([]);
      return;
    }

    if (mode === 'planning') {
      // Planning mode will be handled by the planning mode hook
      // For now, we'll just add the message and let the planning mode hook handle it
      setAttachedFiles([]);
      return;
    }

    // Execution mode - subsequent messages in conversation
    executeInExecutionMode(finalInput, false);
    setAttachedFiles([]);
  }, [mode, setMode, addMessage, setMessages, setAttachedFiles, attachedFiles, 
      conversationHistoryRef, memoryManagerRef, workspaceContextAddedRef, 
      streamMessageIdsRef, approvalManagerRef, setApprovalLevel, 
      setShowMCPMenu, setMCPView, executeWithTools, executeAgentDirectly, executeInExecutionMode]);

  return { handleUserInput };
};

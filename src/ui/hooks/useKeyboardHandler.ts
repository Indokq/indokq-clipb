import { useInput } from 'ink';
import { useAppContext, SLASH_COMMAND_OPTIONS } from '../context/AppContext.js';
import { useMessages } from './useMessages.js';
import { useInputHandlers } from './useInputHandlers.js';
import { getClipboardImage } from '../../tools/clipboard-image.js';
import { resolveFileMentions, parseFileMentions, buildContextualPrompt, buildMultimodalContent } from '../../tools/file-context.js';
import { generateWorkspaceSummary } from '../../tools/codebase-summary.js';
import { parseAgentInvocation } from '../../core/tool-executor.js';
import { FileContext } from '../../core/types.js';
import path from 'path';

interface UseKeyboardHandlerProps {
  executeWithTools: (task: string, fileContexts: FileContext[]) => Promise<void>;
  executeAgentDirectly: (agentName: string, task: string, fileContexts: FileContext[]) => Promise<void>;
  executeInExecutionMode: (task: string, isFirstMessage?: boolean) => Promise<void>;
  executePlanningMode: (input: string, fileContexts: FileContext[]) => Promise<void>;
  handleAutocompleteFilter: (input: string) => Promise<void>;
  handleAutocompleteOpen: () => Promise<void>;
  filterSlashCommands: (input: string) => void;
}

export const useKeyboardHandler = (props: UseKeyboardHandlerProps) => {
  const {
    executeWithTools,
    executeAgentDirectly,
    executeInExecutionMode,
    executePlanningMode,
    handleAutocompleteFilter,
    handleAutocompleteOpen,
    filterSlashCommands,
  } = props;

  const ctx = useAppContext();
  const { addMessage, clearMessages } = useMessages();

  const handleStop = () => {
    if (ctx.isRunning || ctx.isStreaming) {
      if (ctx.orchestratorRef.current) {
        ctx.orchestratorRef.current.abort();
      }
      
      if (ctx.abortControllerRef.current) {
        ctx.abortControllerRef.current.abort();
      }
      
      ctx.setIsRunning(false);
      ctx.setIsStreaming(false);
      ctx.setShowStatus(false);
      ctx.setCurrentStatus('');
      ctx.setMessageQueue([]);
      
      addMessage({
        type: 'system',
        content: 'Execution stopped by user (ESC)',
        color: 'red'
      });
    }
  };

  const handleUserInput = async (input: string) => {
    // Parse @mentions for file context
    const { text: cleanedInput, mentions } = parseFileMentions(input);
    
    let fileContexts: FileContext[] = [];
    if (mentions.length > 0) {
      const { contexts, errors } = await resolveFileMentions(mentions, process.cwd());
      fileContexts = contexts;
      for (const error of errors) {
        addMessage({ type: 'system', content: error, color: 'yellow' });
      }
    }
    
    fileContexts = [...ctx.attachedFiles, ...fileContexts];
    const finalInput = cleanedInput || input;

    // Handle commands
    if (finalInput === '/help' || finalInput === 'help') {
      addMessage({
        type: 'system',
        content: `Commands: /help, /plan, /exec, /normal, /mcp, /approval, /clear, /context, /exit
Shortcuts: Shift+Tab (cycle modes), Alt+V (paste image), Ctrl+O (verbose), Ctrl+T (approval), ESC (stop)`
      });
      ctx.setAttachedFiles([]);
      return;
    }

    if (finalInput === '/clear') {
      clearMessages();
      ctx.conversationHistoryRef.current = [];
      ctx.memoryManagerRef.current.clear();
      ctx.setAttachedFiles([]);
      ctx.workspaceContextAddedRef.current = false;
      return;
    }
    
    if (finalInput === '/mcp') {
      ctx.setShowMCPMenu(true);
      ctx.setMCPView('main');
      return;
    }
    
    if (finalInput === '/models') {
      ctx.setShowModelPicker(true);
      return;
    }
    
    if (finalInput === '/normal') {
      ctx.setMode('normal');
      return;
    }
    
    if (finalInput.startsWith('/plan') || finalInput.startsWith('/spec')) {
      ctx.setMode('planning');
      const message = finalInput.slice(5).trim();
      if (message) {
        await handleUserInput(message);
      }
      return;
    }
    
    if (finalInput.startsWith('/exec')) {
      ctx.setMode('execution');
      ctx.streamMessageIdsRef.current = {};
      const task = finalInput.slice(5).trim();
      if (task) {
        const contextualTask = fileContexts.length > 0 
          ? buildContextualPrompt(task, fileContexts)
          : task;
        executeInExecutionMode(contextualTask, true);
        ctx.setAttachedFiles([]);
      }
      return;
    }

    if (finalInput === '/exit') {
      process.exit(0);
    }

    // Add user message
    let userMessage = finalInput;
    if (fileContexts.length > 0) {
      const imageCount = fileContexts.filter(f => f.isImage).length;
      if (imageCount > 0) {
        const imageIndicators = fileContexts.filter(f => f.isImage).map((_, idx) => `[image#${idx + 1}]`).join(' ');
        userMessage = `${imageIndicators} ${finalInput}`;
      }
    }
    
    addMessage({ type: 'user', content: userMessage, icon: '💬', color: 'green' });

    if (ctx.mode === 'normal') {
      const agentInvocation = parseAgentInvocation(finalInput);
      if (agentInvocation) {
        executeAgentDirectly(agentInvocation.agentName, agentInvocation.task, fileContexts);
      } else {
        executeWithTools(finalInput, fileContexts);
      }
      ctx.setAttachedFiles([]);
      return;
    }

    if (ctx.mode === 'planning') {
      executePlanningMode(finalInput, fileContexts);
      ctx.setAttachedFiles([]);
      return;
    }

    executeInExecutionMode(finalInput, false);
    ctx.setAttachedFiles([]);
  };

  useInput((inputChar, key) => {
    // Model picker blocks all input except ESC
    if (ctx.showModelPicker) {
      if (key.escape) {
        ctx.setShowModelPicker(false);
      }
      return;
    }
    
    // MCP menu blocks all input except ESC
    if (ctx.showMCPMenu) {
      if (key.escape) {
        ctx.setShowMCPMenu(false);
        ctx.setMCPView('main');
      }
      return;
    }
    
    // Let SelectInput handle navigation
    if ((ctx.showAutocomplete || ctx.showSlashCommands) && 
        (key.return || key.upArrow || key.downArrow || key.tab)) {
      return;
    }
    
    // Alt+V to paste clipboard image
    if (key.meta && inputChar === 'v') {
      (async () => {
        const imagePath = await getClipboardImage();
        if (imagePath) {
          const { contexts, errors } = await resolveFileMentions([imagePath], process.cwd());
          if (contexts.length > 0) {
            ctx.setAttachedFiles(prev => [...prev, ...contexts]);
          }
          for (const error of errors) {
            addMessage({ type: 'system', content: error, color: 'yellow' });
          }
        } else {
          addMessage({ type: 'system', content: '⚠️ No image in clipboard', color: 'yellow' });
        }
      })();
      return;
    }
    
    // Ctrl+O to toggle verbose
    if (key.ctrl && inputChar === 'o') {
      ctx.setShowVerbose(prev => !prev);
      return;
    }
    
    // Ctrl+T to cycle approval levels
    if (key.ctrl && inputChar === 't') {
      const currentLevel = ctx.approvalManagerRef.current.getLevel();
      const nextLevel = ((currentLevel + 1) % 4) as any;
      ctx.approvalManagerRef.current.updateLevel(nextLevel);
      ctx.setApprovalLevel(nextLevel);
      return;
    }
    
    // Shift+Tab to cycle modes
    if (key.tab && key.shift) {
      if (ctx.showAutocomplete || ctx.showSlashCommands) return;
      
      if (ctx.mode === 'normal') {
        ctx.setMode('planning');
      } else if (ctx.mode === 'planning') {
        ctx.setMode('execution');
        ctx.streamMessageIdsRef.current = {};
      } else {
        ctx.setMode('normal');
      }
      return;
    }
    
    // ESC to stop or close menus
    if (key.escape) {
      if (ctx.showSlashCommands) {
        ctx.setShowSlashCommands(false);
        return;
      }
      
      if (ctx.showAutocomplete && !ctx.isRunning && !ctx.isStreaming) {
        ctx.setShowAutocomplete(false);
        return;
      }
      
      if (ctx.isRunning || ctx.isStreaming) {
        handleStop();
        return;
      }
    }

    // Handle diff approval
    if (ctx.showDiffApproval && ctx.pendingDiff) {
      if (inputChar === 'a') {
        if (ctx.orchestratorRef.current) {
          ctx.orchestratorRef.current.resolveApproval('approve');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('approve');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({ type: 'system', content: `✅ Approving changes to ${ctx.pendingDiff.path}`, color: 'green' });
        ctx.setShowDiffApproval(false);
        ctx.setPendingDiff(null);
        return;
      } else if (inputChar === 'r' || key.escape) {
        if (ctx.orchestratorRef.current) {
          ctx.orchestratorRef.current.resolveApproval('reject');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('reject');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({ type: 'system', content: '❌ Changes rejected', color: 'yellow' });
        ctx.setShowDiffApproval(false);
        ctx.setPendingDiff(null);
        return;
      }
    }

    // Handle slash command input
    if (ctx.showSlashCommands) {
      if (key.backspace || key.delete) {
        ctx.setInput(prev => {
          const newInput = prev.slice(0, -1);
          ctx.setCursorPosition(newInput.length);
          if (!newInput.startsWith('/')) {
            ctx.setShowSlashCommands(false);
            ctx.setFilteredSlashCommands(SLASH_COMMAND_OPTIONS);
          } else {
            filterSlashCommands(newInput);
          }
          return newInput;
        });
        return;
      }
      
      if (!key.ctrl && !key.meta && !key.shift && inputChar) {
        ctx.setInput(prev => {
          const newInput = prev + inputChar;
          ctx.setCursorPosition(newInput.length);
          filterSlashCommands(newInput);
          return newInput;
        });
        return;
      }
      return;
    }

    // Handle autocomplete input
    if (ctx.showAutocomplete) {
      if (key.backspace || key.delete) {
        ctx.setInput(prev => {
          const newInput = prev.slice(0, -1);
          ctx.setCursorPosition(newInput.length);
          if (!newInput.includes('@')) {
            ctx.setShowAutocomplete(false);
            ctx.setAutocompleteOptions([]);
          } else {
            handleAutocompleteFilter(newInput);
          }
          return newInput;
        });
        return;
      }
      
      if (!key.ctrl && !key.meta && !key.shift && inputChar) {
        ctx.setInput(prev => {
          const newInput = prev + inputChar;
          ctx.setCursorPosition(newInput.length);
          handleAutocompleteFilter(newInput);
          return newInput;
        });
        return;
      }
      return;
    }

    // Don't accept input while showing diff approval
    if (ctx.showDiffApproval) return;

    // Handle text input
    if (key.return && ctx.input.trim()) {
      if (ctx.isRunning || ctx.isStreaming) {
        ctx.setMessageQueue(prev => [...prev, ctx.input.trim()]);
        ctx.setInput('');
        ctx.setAttachedFiles([]);
        return;
      }
      
      handleUserInput(ctx.input);
      ctx.setInput('');
      ctx.setCursorPosition(0);
    } else if (key.backspace || key.delete) {
      ctx.setInput(prev => {
        const newInput = prev.slice(0, -1);
        ctx.setCursorPosition(newInput.length);
        return newInput;
      });
    } else if (!key.ctrl && !key.meta && !key.shift && inputChar) {
      ctx.setInput(prev => {
        const newInput = prev + inputChar;
        
        if (inputChar === '@') {
          ctx.setAtPosition(newInput.length - 1);
          handleAutocompleteOpen();
        }
        
        if (inputChar === '/' && newInput === '/') {
          ctx.setShowSlashCommands(true);
          ctx.setFilteredSlashCommands(SLASH_COMMAND_OPTIONS);
        }
        
        ctx.setCursorPosition(newInput.length);
        return newInput;
      });
    }
  });
};

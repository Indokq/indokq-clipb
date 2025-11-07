import { MutableRefObject } from 'react';
import { AppMode, FileContext } from '../../core/types.js';
import { ConversationMemoryManager } from '../../core/conversation-memory.js';
import { generateWorkspaceSummary } from '../../tools/codebase-summary.js';
import { parseFileMentions, resolveFileMentions } from '../../tools/file-context.js';
import { parseAgentInvocation } from '../../core/tool-executor.js';
import { getClipboardImage } from '../../tools/clipboard-image.js';
import { HELP_TEXT } from '../utils/constants.js';
import path from 'path';

interface UseCommandHandlersProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  addMessage: (msg: any) => void;
  clearMessages: () => void;
  setAttachedFiles: (files: FileContext[] | ((prev: FileContext[]) => FileContext[])) => void;
  attachedFiles: FileContext[];
  planningHistoryRef: MutableRefObject<Array<{ role: 'user' | 'assistant', content: any }>>;
  executionHistoryRef: MutableRefObject<Array<{ role: 'user' | 'assistant', content: any }>>;
  workspaceContextAddedRef: MutableRefObject<boolean>;
  memoryManagerRef: MutableRefObject<ConversationMemoryManager>;
  streamMessageIdsRef: MutableRefObject<Record<string, number>>;
}

export const useCommandHandlers = (props: UseCommandHandlersProps) => {
  const {
    mode,
    setMode,
    addMessage,
    clearMessages,
    setAttachedFiles,
    attachedFiles,
    planningHistoryRef,
    executionHistoryRef,
    workspaceContextAddedRef,
    memoryManagerRef,
    streamMessageIdsRef
  } = props;

  const handleHelpCommand = () => {
    addMessage({
      type: 'system',
      content: HELP_TEXT(mode)
    });
    setAttachedFiles([]);
  };

  const handleClearCommand = () => {
    clearMessages();
    planningHistoryRef.current = [];
    executionHistoryRef.current = [];
    memoryManagerRef.current.clear();
    setAttachedFiles([]);
    workspaceContextAddedRef.current = false;
  };

  const handleContextResetCommand = () => {
    workspaceContextAddedRef.current = false;
    addMessage({
      type: 'system',
      content: '✓ Context reset'
    });
  };

  const handleContextShowCommand = async () => {
    const summary = await generateWorkspaceSummary(process.cwd());
    addMessage({
      type: 'system',
      content: summary
    });
  };

  const handleNormalCommand = () => {
    setMode('normal');
    addMessage({
      type: 'system',
      content: '✓ Switched to normal mode'
    });
  };

  const handlePlanCommand = (message: string, handleUserInput: (input: string) => void) => {
    setMode('planning');
    
    if (planningHistoryRef.current.length === 0) {
      planningHistoryRef.current = [];
    }
    
    if (message) {
      handleUserInput(message);
    } else {
      addMessage({
        type: 'system',
        content: '✓ Switched to planning mode. Ask me anything or describe what you want to build.',
        color: 'cyan'
      });
    }
  };

  const handleExecCommand = (
    task: string,
    fileContexts: FileContext[],
    executeInExecutionMode: (task: string, isFirst: boolean) => void
  ) => {
    setMode('execution');
    executionHistoryRef.current = [];
    streamMessageIdsRef.current = {};
    
    if (task) {
      executeInExecutionMode(task, true);
      setAttachedFiles([]);
    } else {
      addMessage({
        type: 'system',
        content: '✓ Switched to execution mode. Give me a task to execute.',
        color: 'cyan'
      });
    }
  };

  const handleExitCommand = () => {
    process.exit(0);
  };

  const handleClipboardImage = async () => {
    const imagePath = await getClipboardImage();
    
    if (imagePath) {
      const { contexts, errors } = await resolveFileMentions([imagePath], process.cwd());
      
      if (contexts.length > 0) {
        setAttachedFiles(prev => [...prev, ...contexts]);
      }
      
      for (const error of errors) {
        addMessage({
          type: 'system',
          content: error,
          color: 'yellow'
        });
      }
    } else {
      addMessage({
        type: 'system',
        content: '⚠️ No image in clipboard',
        color: 'yellow'
      });
    }
  };

  const handleDraggedImages = async (input: string): Promise<string> => {
    const imagePathPattern = /(?:[A-Z]:\\[\w\s\-().\\/]+|\/[\w\s\-().\\/]+)\.(png|jpg|jpeg|gif|webp|bmp)/gi;
    const imagePaths = input.match(imagePathPattern);
    let cleanedInput = input;
    
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
          cleanedInput = cleanedInput.replace(imagePath, '').trim();
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
    
    return cleanedInput;
  };

  return {
    handleHelpCommand,
    handleClearCommand,
    handleContextResetCommand,
    handleContextShowCommand,
    handleNormalCommand,
    handlePlanCommand,
    handleExecCommand,
    handleExitCommand,
    handleClipboardImage,
    handleDraggedImages
  };
};

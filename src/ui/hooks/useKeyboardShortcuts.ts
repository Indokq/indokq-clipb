import { useInput } from 'ink';
import { MutableRefObject } from 'react';
import { AppMode, PendingDiff } from '../../core/types.js';
import { Orchestrator } from '../../core/orchestrator.js';

interface UseKeyboardShortcutsProps {
  // State
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  input: string;
  setInput: (value: string | ((prev: string) => string)) => void;
  cursorPosition: number;
  setCursorPosition: (value: number | ((prev: number) => number)) => void;
  isRunning: boolean;
  isStreaming: boolean;
  showDiffApproval: boolean;
  pendingDiff: PendingDiff | null;
  showAutocomplete: boolean;
  setShowAutocomplete: (value: boolean) => void;
  showSlashCommands: boolean;
  setShowSlashCommands: (value: boolean) => void;
  setShowVerbose: (updater: (prev: boolean) => boolean) => void;
  setAttachedFiles: (files: any[] | ((prev: any[]) => any[])) => void;
  setMessageQueue: (updater: (prev: string[]) => string[]) => void;
  setPendingDiff: (diff: PendingDiff | null) => void;
  setShowDiffApproval: (value: boolean) => void;
  
  // Functions
  addMessage: (msg: any) => void;
  handleUserInput: (input: string) => void;
  handleStop: () => void;
  handleClipboardImage: () => void;
  handleAutocompleteOpen: () => void;
  handleAutocompleteFilter: (input: string) => void;
  filterSlashCommands: (input: string) => void;
  
  // Refs
  orchestratorRef: MutableRefObject<Orchestrator | null>;
  conversationHistoryRef: MutableRefObject<Array<{ role: 'user' | 'assistant', content: any, mode?: string }>>;
  streamMessageIdsRef: MutableRefObject<Record<string, number>>;
  
  // Autocomplete options
  slashCommandOptions: { label: string; value: string }[];
  setFilteredSlashCommands: (options: { label: string; value: string }[]) => void;
  setAutocompleteOptions: (options: { label: string; value: string }[]) => void;
  setAtPosition: (pos: number) => void;
}

export const useKeyboardShortcuts = (props: UseKeyboardShortcutsProps) => {
  const {
    mode,
    setMode,
    input,
    setInput,
    cursorPosition,
    setCursorPosition,
    isRunning,
    isStreaming,
    showDiffApproval,
    pendingDiff,
    showAutocomplete,
    setShowAutocomplete,
    showSlashCommands,
    setShowSlashCommands,
    setShowVerbose,
    setAttachedFiles,
    setMessageQueue,
    setPendingDiff,
    setShowDiffApproval,
    addMessage,
    handleUserInput,
    handleStop,
    handleClipboardImage,
    handleAutocompleteOpen,
    handleAutocompleteFilter,
    filterSlashCommands,
    orchestratorRef,
    conversationHistoryRef,
    streamMessageIdsRef,
    slashCommandOptions,
    setFilteredSlashCommands,
    setAutocompleteOptions,
    setAtPosition
  } = props;

  useInput((inputChar, key) => {
    // While SelectInput is active (autocomplete/slash commands),
    // let it handle navigation keys to prevent interference
    if ((showAutocomplete || showSlashCommands) && 
        (key.return || key.upArrow || key.downArrow || key.tab)) {
      return;
    }
    
    // Alt+V to paste clipboard image
    if (key.meta && inputChar === 'v') {
      handleClipboardImage();
      return;
    }
    
    // Ctrl+O to toggle verbose output
    if (key.ctrl && inputChar === 'o') {
      setShowVerbose(prev => !prev);
      return;
    }
    
    // Shift+Tab to cycle modes
    if (key.tab && key.shift) {
      if (showAutocomplete || showSlashCommands) {
        return;
      }
      
      // Cycle: normal → planning → execution → normal
      // NOTE: No longer clearing conversation history - context preserved across modes
      if (mode === 'normal') {
        setMode('planning');
      } else if (mode === 'planning') {
        setMode('execution');
        streamMessageIdsRef.current = {};
      } else {
        setMode('normal');
      }
      return;
    }
    
    // ESC to stop execution or streaming
    if (key.escape) {
      if (showSlashCommands) {
        setShowSlashCommands(false);
        return;
      }
      
      if (showAutocomplete && !isRunning && !isStreaming) {
        setShowAutocomplete(false);
        return;
      }
      
      if (isRunning || isStreaming) {
        handleStop();
        setMessageQueue(() => []);
        return;
      }
    }

    // Handle diff approval
    if (showDiffApproval && pendingDiff) {
      if (inputChar === 'a') {
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('approve');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('approve');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({
          type: 'system',
          content: `✅ Approving changes to ${pendingDiff.path}`,
          color: 'green'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (inputChar === 'r') {
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('reject');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('reject');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({
          type: 'system',
          content: `❌ Changes rejected`,
          color: 'yellow'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (inputChar === 'e') {
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('edit');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('edit');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({
          type: 'system',
          content: `📝 Manual edit requested (feature coming soon)`,
          color: 'cyan'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      } else if (key.escape) {
        if (orchestratorRef.current) {
          orchestratorRef.current.resolveApproval('reject');
        } else if ((globalThis as any).__pendingApprovalResolver) {
          (globalThis as any).__pendingApprovalResolver('reject');
          delete (globalThis as any).__pendingApprovalResolver;
        }
        addMessage({
          type: 'system',
          content: `❌ Changes rejected`,
          color: 'yellow'
        });
        setShowDiffApproval(false);
        setPendingDiff(null);
        return;
      }
    }

    // Handle slash command navigation
    if (showSlashCommands) {
      if (key.backspace || key.delete) {
        setInput(prev => {
          const newInput = prev.slice(0, -1);
          if (!newInput.startsWith('/')) {
            setShowSlashCommands(false);
            setFilteredSlashCommands(slashCommandOptions);
          } else {
            filterSlashCommands(newInput);
          }
          return newInput;
        });
        setCursorPosition(prev => Math.max(0, prev - 1));
        return;
      }
      
      if (!key.ctrl && !key.meta && !key.shift && inputChar) {
        setInput(prev => {
          const newInput = prev + inputChar;
          filterSlashCommands(newInput);
          return newInput;
        });
        setCursorPosition(prev => prev + 1);
        return;
      }
      
      if (key.upArrow || key.downArrow || key.return) {
        return;
      }
    }

    // Handle autocomplete navigation
    if (showAutocomplete) {
      if (key.backspace || key.delete) {
        setInput(prev => {
          const newInput = prev.slice(0, -1);
          if (!newInput.includes('@')) {
            setShowAutocomplete(false);
            setAutocompleteOptions([]);
          } else {
            handleAutocompleteFilter(newInput);
          }
          return newInput;
        });
        setCursorPosition(prev => Math.max(0, prev - 1));
        return;
      }
      
      if (!key.ctrl && !key.meta && !key.shift && inputChar) {
        setInput(prev => {
          const newInput = prev + inputChar;
          handleAutocompleteFilter(newInput);
          return newInput;
        });
        setCursorPosition(prev => prev + 1);
        return;
      }
      
      if (key.upArrow || key.downArrow || key.return) {
        return;
      }
    }

    // Don't accept input while showing diff approval
    if (showDiffApproval) return;

    // Handle text input
    if (key.return && input.trim()) {
      if (isRunning || isStreaming) {
        setMessageQueue(prev => [...prev, input.trim()]);
        setInput('');
        setCursorPosition(0);
        setAttachedFiles([]);
        return;
      }
      
      handleUserInput(input);
      setInput('');
      setCursorPosition(0);
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      setCursorPosition(prev => Math.max(0, prev - 1));
    } else if (!key.ctrl && !key.meta && !key.shift && inputChar) {
      setInput(prev => {
        const newInput = prev + inputChar;
        
        if (inputChar === '@') {
          setAtPosition(newInput.length - 1);
          handleAutocompleteOpen();
        }
        
        if (inputChar === '/' && newInput === '/') {
          setShowSlashCommands(true);
          setFilteredSlashCommands(slashCommandOptions);
        }
        
        return newInput;
      });
      setCursorPosition(prev => prev + 1);
    }
  });
};

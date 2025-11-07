import { useState, useRef } from 'react';
import { AppMode, PendingDiff } from '../../core/types.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { ConversationMemoryManager } from '../../core/conversation-memory.js';

export const useAppState = (initialTask?: string) => {
  // Mode and task state
  const [mode, setMode] = useState<AppMode>('normal');
  const [isRunning, setIsRunning] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>(initialTask || '');
  
  // Status tracking
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [showStatus, setShowStatus] = useState(false);
  const hasReceivedFirstChunkRef = useRef(false);
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Diff approval state
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);
  const [showDiffApproval, setShowDiffApproval] = useState(false);
  
  // Verbose mode state (Ctrl+O to toggle)
  const [showVerbose, setShowVerbose] = useState(false);
  
  // Message queue for typing during streaming
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  
  // Orchestrator reference for approval callbacks
  const orchestratorRef = useRef<Orchestrator | null>(null);
  
  // Conversation memory manager
  const memoryManagerRef = useRef<ConversationMemoryManager>(new ConversationMemoryManager());
  
  // Track separate messages for each intelligence stream
  const streamMessageIdsRef = useRef<Record<string, number>>({});
  
  // Planning history for multi-turn conversations
  const planningHistoryRef = useRef<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  
  // Track if workspace context has been added
  const workspaceContextAddedRef = useRef(false);
  
  // Execution history for multi-turn conversations in execution mode
  const executionHistoryRef = useRef<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  return {
    mode,
    setMode,
    isRunning,
    setIsRunning,
    currentTask,
    setCurrentTask,
    currentStatus,
    setCurrentStatus,
    showStatus,
    setShowStatus,
    hasReceivedFirstChunkRef,
    isStreaming,
    setIsStreaming,
    pendingDiff,
    setPendingDiff,
    showDiffApproval,
    setShowDiffApproval,
    showVerbose,
    setShowVerbose,
    messageQueue,
    setMessageQueue,
    orchestratorRef,
    memoryManagerRef,
    streamMessageIdsRef,
    planningHistoryRef,
    workspaceContextAddedRef,
    executionHistoryRef,
    abortControllerRef
  };
};

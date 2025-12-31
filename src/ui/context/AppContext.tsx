import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { AppMode, Message, PendingDiff, FileContext } from '../../core/types.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { ConversationMemoryManager } from '../../core/conversation-memory.js';
import { ApprovalManager, type ApprovalLevel } from '../../tools/approval-manager.js';
import { WorkspaceScanner } from '../../core/workspace-scanner.js';
import { RelevanceRanker } from '../../core/relevance-ranking.js';
import { AugmentedPromptBuilder } from '../../core/prompt-builder.js';
import { config } from '../../config/env.js';

// Slash command options
export const SLASH_COMMAND_OPTIONS = [
  { label: '/help - Display help', value: '/help' },
  { label: '/normal - Normal mode (default)', value: '/normal' },
  { label: '/plan or /spec - Specification mode', value: '/plan' },
  { label: '/exec - Execution mode', value: '/exec' },
  { label: '/models - Select AI model', value: '/models' },
  { label: '/mcp - MCP server management', value: '/mcp' },
  { label: '/approval - View/set approval level', value: '/approval' },
  { label: '/clear - Clear history', value: '/clear' },
  { label: '/context reset', value: '/context reset' },
  { label: '/context show', value: '/context show' },
  { label: '/exit - Quit', value: '/exit' }
];

export interface AppState {
  // Mode and task
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  approvalLevel: ApprovalLevel;
  setApprovalLevel: (level: ApprovalLevel) => void;
  
  // Messages
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  verboseMessages: Message[];
  setVerboseMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  
  // Running state
  isRunning: boolean;
  setIsRunning: (value: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (value: boolean) => void;
  currentTask: string;
  setCurrentTask: (task: string) => void;
  
  // Status
  currentStatus: string;
  setCurrentStatus: (status: string) => void;
  showStatus: boolean;
  setShowStatus: (show: boolean) => void;
  spinnerFrame: number;
  setSpinnerFrame: React.Dispatch<React.SetStateAction<number>>;
  
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  inputKey: number;
  setInputKey: React.Dispatch<React.SetStateAction<number>>;
  cursorPosition: number;
  setCursorPosition: (pos: number) => void;
  
  // File context
  attachedFiles: FileContext[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<FileContext[]>>;
  
  // Verbose mode
  showVerbose: boolean;
  setShowVerbose: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Message queue
  messageQueue: string[];
  setMessageQueue: React.Dispatch<React.SetStateAction<string[]>>;
  
  // Autocomplete
  showAutocomplete: boolean;
  setShowAutocomplete: (show: boolean) => void;
  autocompleteOptions: { label: string; value: string }[];
  setAutocompleteOptions: (options: { label: string; value: string }[]) => void;
  atPosition: number;
  setAtPosition: (pos: number) => void;
  
  // Slash commands
  showSlashCommands: boolean;
  setShowSlashCommands: (show: boolean) => void;
  filteredSlashCommands: { label: string; value: string }[];
  setFilteredSlashCommands: (commands: { label: string; value: string }[]) => void;
  
  // MCP
  showMCPMenu: boolean;
  setShowMCPMenu: (show: boolean) => void;
  mcpView: 'main' | 'list' | 'add' | 'details';
  setMCPView: (view: 'main' | 'list' | 'add' | 'details') => void;
  selectedServerId: string | null;
  setSelectedServerId: (id: string | null) => void;
  
  // Diff approval
  pendingDiff: PendingDiff | null;
  setPendingDiff: (diff: PendingDiff | null) => void;
  showDiffApproval: boolean;
  setShowDiffApproval: (show: boolean) => void;
  
  // Model selection
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  showModelPicker: boolean;
  setShowModelPicker: (show: boolean) => void;
  
  // Refs
  orchestratorRef: React.MutableRefObject<Orchestrator | null>;
  memoryManagerRef: React.MutableRefObject<ConversationMemoryManager>;
  approvalManagerRef: React.MutableRefObject<ApprovalManager>;
  workspaceScannerRef: React.MutableRefObject<WorkspaceScanner>;
  relevanceRankerRef: React.MutableRefObject<RelevanceRanker>;
  promptBuilderRef: React.MutableRefObject<AugmentedPromptBuilder>;
  conversationHistoryRef: React.MutableRefObject<Array<{ role: 'user' | 'assistant'; content: any; mode?: AppMode }>>;
  streamMessageIdsRef: React.MutableRefObject<Record<string, number>>;
  messageCounterRef: React.MutableRefObject<number>;
  streamingMessageIdRef: React.MutableRefObject<number | null>;
  hasReceivedFirstChunkRef: React.MutableRefObject<boolean>;
  workspaceContextAddedRef: React.MutableRefObject<boolean>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

const AppContext = createContext<AppState | null>(null);

export const useAppContext = (): AppState => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
  initialTask?: string;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, initialTask }) => {
  // Mode and task
  const [mode, setMode] = useState<AppMode>('normal');
  const [approvalLevel, setApprovalLevel] = useState<ApprovalLevel>(
    config.TOOL_APPROVAL_LEVEL as ApprovalLevel
  );
  
  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [verboseMessages, setVerboseMessages] = useState<Message[]>([]);
  
  // Running state
  const [isRunning, setIsRunning] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>(initialTask || '');
  
  // Status
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [showStatus, setShowStatus] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  
  // Input state
  const [input, setInput] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  
  // File context
  const [attachedFiles, setAttachedFiles] = useState<FileContext[]>([]);
  
  // Verbose mode
  const [showVerbose, setShowVerbose] = useState(false);
  
  // Message queue
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  
  // Autocomplete
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<{ label: string; value: string }[]>([]);
  const [atPosition, setAtPosition] = useState<number>(-1);
  
  // Slash commands
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [filteredSlashCommands, setFilteredSlashCommands] = useState(SLASH_COMMAND_OPTIONS);
  
  // MCP
  const [showMCPMenu, setShowMCPMenu] = useState(false);
  const [mcpView, setMCPView] = useState<'main' | 'list' | 'add' | 'details'>('main');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  
  // Diff approval
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);
  const [showDiffApproval, setShowDiffApproval] = useState(false);
  
  // Model selection
  const [selectedModel, setSelectedModel] = useState<string>(config.MODEL_NAME);
  const [showModelPicker, setShowModelPicker] = useState(false);
  
  // Refs - Memory manager and related
  const memoryManagerRef = useRef<ConversationMemoryManager>(new ConversationMemoryManager());
  const workspaceScannerRef = useRef<WorkspaceScanner>(new WorkspaceScanner());
  const relevanceRankerRef = useRef<RelevanceRanker>(
    new RelevanceRanker(workspaceScannerRef.current, memoryManagerRef.current)
  );
  const promptBuilderRef = useRef<AugmentedPromptBuilder>(
    new AugmentedPromptBuilder(
      memoryManagerRef.current,
      workspaceScannerRef.current,
      relevanceRankerRef.current
    )
  );
  const approvalManagerRef = useRef<ApprovalManager>(
    new ApprovalManager(config.TOOL_APPROVAL_LEVEL as ApprovalLevel)
  );
  
  // Refs - Orchestrator and conversation
  const orchestratorRef = useRef<Orchestrator | null>(null);
  const conversationHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: any; mode?: AppMode }>>([]);
  
  // Refs - Streaming
  const streamMessageIdsRef = useRef<Record<string, number>>({});
  const messageCounterRef = useRef<number>(0);
  const streamingMessageIdRef = useRef<number | null>(null);
  const hasReceivedFirstChunkRef = useRef(false);
  
  // Refs - Other
  const workspaceContextAddedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const value: AppState = {
    mode,
    setMode,
    approvalLevel,
    setApprovalLevel,
    messages,
    setMessages,
    verboseMessages,
    setVerboseMessages,
    isRunning,
    setIsRunning,
    isStreaming,
    setIsStreaming,
    currentTask,
    setCurrentTask,
    currentStatus,
    setCurrentStatus,
    showStatus,
    setShowStatus,
    spinnerFrame,
    setSpinnerFrame,
    input,
    setInput,
    inputKey,
    setInputKey,
    cursorPosition,
    setCursorPosition,
    attachedFiles,
    setAttachedFiles,
    showVerbose,
    setShowVerbose,
    messageQueue,
    setMessageQueue,
    showAutocomplete,
    setShowAutocomplete,
    autocompleteOptions,
    setAutocompleteOptions,
    atPosition,
    setAtPosition,
    showSlashCommands,
    setShowSlashCommands,
    filteredSlashCommands,
    setFilteredSlashCommands,
    showMCPMenu,
    setShowMCPMenu,
    mcpView,
    setMCPView,
    selectedServerId,
    setSelectedServerId,
    pendingDiff,
    setPendingDiff,
    showDiffApproval,
    setShowDiffApproval,
    selectedModel,
    setSelectedModel,
    showModelPicker,
    setShowModelPicker,
    orchestratorRef,
    memoryManagerRef,
    approvalManagerRef,
    workspaceScannerRef,
    relevanceRankerRef,
    promptBuilderRef,
    conversationHistoryRef,
    streamMessageIdsRef,
    messageCounterRef,
    streamingMessageIdRef,
    hasReceivedFirstChunkRef,
    workspaceContextAddedRef,
    abortControllerRef,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

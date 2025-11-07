export type Phase = 'prediction' | 'intelligence' | 'synthesis' | 'execution' | 'complete';

export type PhaseStatus = 'pending' | 'in_progress' | 'complete' | 'error';

export type AppMode = 'planning' | 'execution' | 'normal';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Base message properties
interface BaseMessage {
  timestamp: number;
  id: string; // For React keys and referencing
}

// Discriminated union for different message types
export type Message =
  | UserMessage
  | AssistantMessage
  | ThinkingMessage
  | ToolPlanMessage
  | CodeBlockMessage
  | DiffMessage
  | WarningMessage
  | SuccessMessage
  | ErrorMessage
  | SystemMessage
  | ToolMessage
  | LogMessage;

// Individual message types
export interface UserMessage extends BaseMessage {
  type: 'user';
  content: string;
  fileContexts?: FileContext[];
}

export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  content: string;
}

export interface ThinkingMessage extends BaseMessage {
  type: 'thinking';
  content: string;
  collapsed?: boolean;
}

export interface ToolPlanMessage extends BaseMessage {
  type: 'tool_plan';
  tools: string[];
  reason: string;
}

export interface CodeBlockMessage extends BaseMessage {
  type: 'code_block';
  language: string;
  code: string;
  file?: string;
  lineStart?: number;
}

export interface DiffMessage extends BaseMessage {
  type: 'diff';
  diff: string;
  file: string;
  approved?: boolean;
  description?: string;
}

export interface WarningMessage extends BaseMessage {
  type: 'warning';
  content: string;
  severity: 'low' | 'high';
}

export interface SuccessMessage extends BaseMessage {
  type: 'success';
  content: string;
  icon?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  content: string;
  recoverable: boolean;
  stack?: string;
}

// Legacy types (keep for backwards compat)
export interface SystemMessage extends BaseMessage {
  type: 'system';
  content: string;
  color?: string;
  icon?: string;
}

export interface ToolMessage extends BaseMessage {
  type: 'tool';
  content: string;
  color?: string;
  icon?: string;
}

export interface LogMessage extends BaseMessage {
  type: 'log';
  content: string;
  color?: string;
  icon?: string;
}

export interface TaskPrediction {
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  keyFiles: string[];
  needsMultimodal: boolean;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
}

export interface IntelligenceResult {
  terminus?: string;
  webResearch?: string;
  strategy?: string;
  environment?: string;
  exploration?: string;
}

export interface WebSearch {
  query: string;
  status: 'searching' | 'complete' | 'error';
  sources?: Array<{ title: string; url: string }>;
  timestamp: number;
}

export interface PhaseState {
  terminus: { status: PhaseStatus; text: string };
  search: { status: PhaseStatus; text: string; searches?: WebSearch[] };
  strategy: { status: PhaseStatus; text: string };
  environment: { status: PhaseStatus; text: string };
  exploration: { status: PhaseStatus; text: string };
}

export interface PendingDiff {
  path: string;
  oldContent: string;
  newContent: string;
  description?: string;
  diff: string;
}

export interface FileContext {
  path: string;
  content: string;
  isImage?: boolean;
  base64Data?: string;
  mediaType?: string;
}

export interface AgentTreeNode {
  id: string;
  type: 'agent' | 'tool' | 'result';
  name: string;
  description?: string;
  status: 'running' | 'complete' | 'error';
  children: AgentTreeNode[];
  result?: string;
  timestamp: number;
}

export type OrchestratorEvent =
  | { type: 'phase_change'; phase: Phase }
  | { type: 'text_chunk'; streamId: string; chunk: string }
  | { type: 'tool_requested'; streamId: string; toolName: string; input: any }
  | { type: 'tool_result'; streamId: string; toolName: string; result: string }
  | { type: 'tool_error'; streamId: string; toolName: string; error: string }
  | { type: 'web_search'; search: WebSearch }
  | { type: 'system'; content: string }
  | { type: 'complete'; result: string }
  | { type: 'error'; error: Error }
  | { type: 'diff_approval_needed'; pendingDiff: PendingDiff };

export interface OrchestratorCallbacks {
  onEvent?: (event: OrchestratorEvent) => void;
  
  // Legacy callbacks (deprecated, use onEvent instead)
  onPhaseChange?: (phase: Phase) => void;
  onStreamUpdate?: (streamId: string, chunk: string) => void;
  onWebSearch?: (search: WebSearch) => void;
  onToolCall?: (toolName: string, input: any) => void;
  onComplete?: (result: string) => void;
  onError?: (error: Error) => void;
}

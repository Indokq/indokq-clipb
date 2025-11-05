export type Phase = 'prediction' | 'intelligence' | 'synthesis' | 'execution' | 'complete';

export type PhaseStatus = 'pending' | 'in_progress' | 'complete' | 'error';

export type AppMode = 'planning' | 'execution';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Message {
  type: 'user' | 'assistant' | 'system' | 'tool' | 'log';
  content: string;
  timestamp: number;
  icon?: string;
  color?: string;
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

export type OrchestratorEvent =
  | { type: 'phase_change'; phase: Phase }
  | { type: 'text_chunk'; streamId: string; chunk: string }
  | { type: 'tool_requested'; streamId: string; toolName: string; input: any }
  | { type: 'tool_result'; streamId: string; toolName: string; result: string }
  | { type: 'tool_error'; streamId: string; toolName: string; error: string }
  | { type: 'web_search'; search: WebSearch }
  | { type: 'system'; content: string }
  | { type: 'complete'; result: string }
  | { type: 'error'; error: Error };

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

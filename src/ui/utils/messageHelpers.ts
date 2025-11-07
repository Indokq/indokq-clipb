import { SystemMessage, ToolMessage, AssistantMessage } from '../../core/types.js';

// Helper functions for creating typed messages
export const createSystemMessage = (content: string, color?: string, icon?: string): Omit<SystemMessage, 'timestamp' | 'id'> => ({
  type: 'system',
  content,
  color,
  icon
});

export const createToolMessage = (content: string, color?: string, icon?: string): Omit<ToolMessage, 'timestamp' | 'id'> => ({
  type: 'tool',
  content,
  color,
  icon
});

export const createAssistantMessage = (content: string): Omit<AssistantMessage, 'timestamp' | 'id'> => ({
  type: 'assistant',
  content
});

// Process chunk content to add spacing at sentence boundaries
export const processChunk = (chunk: string): string => {
  // Find sentence boundaries within chunk: [.!?:] followed by capital letter (no space)
  // Exclude cases like: URLs (://) and markdown bold (**text**)
  return chunk.replace(/([.!?:])(?!\/)(?!\*)([A-Z])/g, '$1\n\n$2');
};

// Smart concatenation with automatic spacing
export const smartConcat = (existing: string, newChunk: string): string => {
  if (!existing) return processChunk(newChunk);
  if (!newChunk) return existing;
  
  // Step 1: Process the chunk itself to add spacing within it
  const processedChunk = processChunk(newChunk);
  
  // Step 2: Check boundary between existing and new chunk
  const sentenceEnd = /[.!?:]\s*$/;
  const startsWithCapital = /^[A-Z]/;
  
  // If existing ends with punctuation and new chunk starts with capital
  if (sentenceEnd.test(existing) && startsWithCapital.test(processedChunk)) {
    // Don't add spacing if there's already whitespace
    if (existing.endsWith('\n') || existing.endsWith(' ')) {
      return existing + processedChunk;
    }
    return existing + '\n\n' + processedChunk;
  }
  
  return existing + processedChunk;
};

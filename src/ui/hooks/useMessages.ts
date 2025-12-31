import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext.js';

// Process chunk content to add spacing at sentence boundaries
const processChunk = (chunk: string): string => {
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

export const useMessages = () => {
  const {
    setMessages,
    setVerboseMessages,
    messageCounterRef,
    streamingMessageIdRef,
  } = useAppContext();

  // Helper to add messages
  const addMessage = useCallback((msg: any) => {
    const msgId = ++messageCounterRef.current;
    setMessages(prev => [...prev, {
      ...msg,
      timestamp: msgId,
      id: `msg-${msgId}-${Date.now()}`
    }]);
  }, [setMessages, messageCounterRef]);
  
  // Helper to add verbose messages (hidden by default, shown with Ctrl+O)
  const addVerboseMessage = useCallback((msg: any) => {
    const msgId = ++messageCounterRef.current;
    setVerboseMessages(prev => [...prev, {
      ...msg,
      timestamp: msgId,
      id: `verbose-${msgId}-${Date.now()}`
    }]);
  }, [setVerboseMessages, messageCounterRef]);

  // Direct stream update without throttling
  const handleStreamChunk = useCallback((chunk: string) => {
    if (streamingMessageIdRef.current !== null) {
      // Update existing streaming message
      setMessages(prev =>
        prev.map(m => {
          if (m.timestamp === streamingMessageIdRef.current) {
            // Only update if message has content property
            if ('content' in m && typeof m.content === 'string') {
              return { ...m, content: smartConcat(m.content, chunk) };
            }
          }
          return m;
        })
      );
    } else {
      // Create new streaming message
      messageCounterRef.current += 1;
      const msgId = messageCounterRef.current;
      streamingMessageIdRef.current = msgId;
      setMessages(prev => [...prev, {
        type: 'assistant',
        content: chunk,
        timestamp: msgId,
        id: `stream-${msgId}-${Date.now()}`
      } as any]);
    }
  }, [setMessages, messageCounterRef, streamingMessageIdRef]);

  // Reset streaming message ID
  const resetStreamingMessageId = useCallback(() => {
    streamingMessageIdRef.current = null;
  }, [streamingMessageIdRef]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setVerboseMessages([]);
  }, [setMessages, setVerboseMessages]);

  return {
    addMessage,
    addVerboseMessage,
    handleStreamChunk,
    resetStreamingMessageId,
    clearMessages,
    smartConcat,
  };
};

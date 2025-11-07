import { useState, useRef } from 'react';
import { Message } from '../../core/types.js';
import { smartConcat } from '../utils/messageHelpers.js';

export const useMessageStream = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [verboseMessages, setVerboseMessages] = useState<Message[]>([]);
  const streamingMessageIdRef = useRef<number | null>(null);
  const messageCounterRef = useRef<number>(0);

  // Helper to add messages  
  const addMessage = (msg: any) => {
    const msgId = ++messageCounterRef.current;
    setMessages(prev => [...prev, { 
      ...msg, 
      timestamp: msgId,
      id: `msg-${msgId}-${Date.now()}`
    } as Message]);
  };
  
  // Helper to add verbose messages (hidden by default, shown with Ctrl+O)
  const addVerboseMessage = (msg: any) => {
    const msgId = ++messageCounterRef.current;
    setVerboseMessages(prev => [...prev, { 
      ...msg, 
      timestamp: msgId,
      id: `verbose-${msgId}-${Date.now()}`
    } as Message]);
  };

  // Direct stream update without throttling
  const handleStreamChunk = (chunk: string) => {
    if (streamingMessageIdRef.current !== null) {
      // Update existing streaming message
      setMessages(prev =>
        prev.map(m => {
          if (m.timestamp === streamingMessageIdRef.current) {
            if ('content' in m && typeof m.content === 'string') {
              return { ...m, content: smartConcat(m.content, chunk) } as Message;
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
      } as Message]);
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const resetStreamingMessageId = () => {
    streamingMessageIdRef.current = null;
  };

  return {
    messages,
    verboseMessages,
    addMessage,
    addVerboseMessage,
    handleStreamChunk,
    clearMessages,
    resetStreamingMessageId,
    streamingMessageIdRef,
    messageCounterRef
  };
};

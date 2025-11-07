import { useRef } from 'react';
import { Orchestrator } from '../../core/orchestrator.js';

interface UseAbortHandlerProps {
  isRunning: boolean;
  isStreaming: boolean;
  setIsRunning: (value: boolean) => void;
  setIsStreaming: (value: boolean) => void;
  setShowStatus: (value: boolean) => void;
  setCurrentStatus: (value: string) => void;
  setMessageQueue: (value: string[]) => void;
  addMessage: (msg: any) => void;
  orchestratorRef: React.MutableRefObject<Orchestrator | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

export const useAbortHandler = (props: UseAbortHandlerProps) => {
  const {
    isRunning,
    isStreaming,
    setIsRunning,
    setIsStreaming,
    setShowStatus,
    setCurrentStatus,
    setMessageQueue,
    addMessage,
    orchestratorRef,
    abortControllerRef
  } = props;

  const handleStop = () => {
    if (isRunning || isStreaming) {
      // Abort orchestrator if it exists (execution mode)
      if (orchestratorRef.current) {
        orchestratorRef.current.abort();
      }
      
      // Abort current controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Update UI state
      setIsRunning(false);
      setIsStreaming(false);
      setShowStatus(false);
      setCurrentStatus('');
      
      // Clear message queue
      setMessageQueue([]);
      
      // Single message without icon
      addMessage({
        type: 'system',
        content: 'Execution stopped by user (ESC)',
        color: 'red'
      });
    }
  };

  return { handleStop };
};

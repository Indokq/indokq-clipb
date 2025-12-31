import React from 'react';
import { Box, Text } from 'ink';
import { useAppContext } from '../context/AppContext.js';
import { MessageStream } from './MessageStream.js';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const ChatArea: React.FC = () => {
  const {
    messages,
    verboseMessages,
    showVerbose,
    isRunning,
    showStatus,
    currentStatus,
    spinnerFrame,
  } = useAppContext();

  return (
    <Box flexGrow={1} flexDirection="column" paddingY={1} paddingX={1}>
      <MessageStream messages={messages} />
      
      {/* Verbose output - toggle with Ctrl+O */}
      {showVerbose && verboseMessages.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" marginTop={1} padding={1}>
          <Text color="yellow">--- Verbose Output (Ctrl+O to hide) ---</Text>
          <MessageStream messages={verboseMessages} />
        </Box>
      )}
      
      {/* Hint to show verbose */}
      {!showVerbose && isRunning && (
        <Text color="gray" dimColor>Press Ctrl+O for verbose output</Text>
      )}
      
      {/* Show simple spinner when running */}
      {(isRunning || showStatus) && currentStatus && (
        <Box marginTop={1}>
          <Text color="blue">{spinnerFrames[spinnerFrame]} {currentStatus}</Text>
        </Box>
      )}
    </Box>
  );
};

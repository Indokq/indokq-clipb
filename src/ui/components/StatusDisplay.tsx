import React from 'react';
import { Box, Text } from 'ink';

interface StatusDisplayProps {
  isRunning: boolean;
  showStatus: boolean;
  currentStatus: string;
  spinnerFrame: number;
  showVerbose: boolean;
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const StatusDisplay: React.FC<StatusDisplayProps> = ({
  isRunning,
  showStatus,
  currentStatus,
  spinnerFrame,
  showVerbose
}) => {
  return (
    <>
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
    </>
  );
};

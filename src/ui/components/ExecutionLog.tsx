import React from 'react';
import { Box, Text } from 'ink';

interface ExecutionLogProps {
  logs: string[];
  maxLines?: number;
}

export const ExecutionLog: React.FC<ExecutionLogProps> = ({ logs, maxLines = 20 }) => {
  const displayLogs = logs.slice(-maxLines);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
      <Text bold color="gray">📜 Execution Log</Text>
      <Box flexDirection="column" marginTop={1}>
        {displayLogs.map((log, idx) => (
          <Text key={idx}>{log}</Text>
        ))}
        {displayLogs.length === 0 && (
          <Text color="gray">No logs yet...</Text>
        )}
      </Box>
    </Box>
  );
};

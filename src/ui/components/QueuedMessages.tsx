import React from 'react';
import { Box, Text } from 'ink';

interface QueuedMessagesProps {
  count: number;
}

export const QueuedMessages: React.FC<QueuedMessagesProps> = ({ count }) => {
  if (count === 0) return null;

  return (
    <Box paddingX={1}>
      <Text color="yellow">
        {count} queued
      </Text>
    </Box>
  );
};

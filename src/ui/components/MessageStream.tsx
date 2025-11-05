import React from 'react';
import { Box, Text } from 'ink';
import { Message } from '../../core/types.js';

interface MessageStreamProps {
  messages: Message[];
  maxMessages?: number;
}

export const MessageStream: React.FC<MessageStreamProps> = React.memo(({ 
  messages, 
  maxMessages = 100 
}) => {
  const displayMessages = messages.slice(-maxMessages);

  return (
    <Box flexDirection="column">
      {displayMessages.length === 0 ? (
        <Box>
          <Text dimColor>Start by typing your message below...</Text>
        </Box>
      ) : (
        displayMessages.map((msg) => (
          <Box key={msg.timestamp}>
            <Text color={msg.color}>
              {msg.content}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
});

MessageStream.displayName = 'MessageStream';

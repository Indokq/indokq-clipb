import React from 'react';
import { Box, Text } from 'ink';
import { ChatMessage } from '../../core/types.js';

interface PlanningChatProps {
  messages: ChatMessage[];
  maxMessages?: number;
}

export const PlanningChat: React.FC<PlanningChatProps> = ({ 
  messages, 
  maxMessages = 20 
}) => {
  const displayMessages = messages.slice(-maxMessages);

  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor="cyan" 
      padding={1}
      marginBottom={1}
    >
      <Text bold color="cyan">📋 Planning Chat</Text>
      
      <Box flexDirection="column" marginTop={1}>
        {displayMessages.length === 0 ? (
          <Text color="gray">Start planning by typing your ideas...</Text>
        ) : (
          displayMessages.map((msg, idx) => (
            <Box key={idx} flexDirection="column" marginTop={idx > 0 ? 1 : 0}>
              <Text bold color={msg.role === 'user' ? 'green' : 'cyan'}>
                {msg.role === 'user' ? '💬 You' : '🤖 Claude'}:
              </Text>
              <Text>{msg.content}</Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

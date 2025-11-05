import React from 'react';
import { Box, Text } from 'ink';

interface StreamingTextProps {
  text: string;
  isComplete: boolean;
  color?: string;
}

export const StreamingText: React.FC<StreamingTextProps> = ({ 
  text, 
  isComplete, 
  color = 'white' 
}) => {
  return (
    <Box>
      <Text color={color as any}>{text}</Text>
      {!isComplete && <Text color="cyan"> ▌</Text>}
    </Box>
  );
};

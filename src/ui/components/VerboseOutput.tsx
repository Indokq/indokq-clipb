import React from 'react';
import { Box, Text } from 'ink';
import { Message } from '../../core/types.js';
import { MessageStream } from './MessageStream.js';

interface VerboseOutputProps {
  showVerbose: boolean;
  verboseMessages: Message[];
}

export const VerboseOutput: React.FC<VerboseOutputProps> = ({
  showVerbose,
  verboseMessages
}) => {
  if (!showVerbose || verboseMessages.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" marginTop={1} padding={1}>
      <Text color="yellow">--- Verbose Output (Ctrl+O to hide) ---</Text>
      <MessageStream messages={verboseMessages} />
    </Box>
  );
};

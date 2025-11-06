import React from 'react';
import { Box, Text } from 'ink';

interface ApprovalPromptProps {
  message?: string;
  showSplitOption?: boolean;
}

/**
 * Interactive approval prompt for diff changes
 */
export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({ 
  message = 'Apply changes?',
  showSplitOption = false 
}) => {
  const options = showSplitOption
    ? '[a]pply / [r]eject / [e]dit / [s]plit'
    : '[a]pply / [r]eject / [e]dit';
    
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Box borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text bold color="yellow">
          {message} {options}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          • Press 'a' to apply changes
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          • Press 'r' to reject changes
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          • Press 'e' to edit manually
        </Text>
      </Box>
      {showSplitOption && (
        <Box>
          <Text dimColor>
            • Press 's' to split into separate changes
          </Text>
        </Box>
      )}
    </Box>
  );
};

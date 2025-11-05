import React from 'react';
import { Box, Text } from 'ink';
import { AppMode } from '../../core/types.js';

interface ModeIndicatorProps {
  mode: AppMode;
}

export const ModeIndicator: React.FC<ModeIndicatorProps> = ({ mode }) => {
  const config = {
    planning: { 
      icon: '📋', 
      label: 'PLANNING', 
      color: 'cyan',
      description: 'Chat and plan your task'
    },
    execution: { 
      icon: '⚡', 
      label: 'EXECUTION', 
      color: 'yellow',
      description: 'Agent executes the task'
    }
  };
  
  const { icon, label, color, description } = config[mode];
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color as any} padding={1}>
      <Box>
        <Text bold color={color as any}>
          Mode: {icon} {label}
        </Text>
        <Box marginLeft={2}>
          <Text color="gray">
            (Shift+Tab to switch)
          </Text>
        </Box>
      </Box>
      <Text color="gray">{description}</Text>
    </Box>
  );
};

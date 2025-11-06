import React from 'react';
import { Box, Text } from 'ink';

interface DiffViewerProps {
  diff: string;
  filepath: string;
}

/**
 * Display a unified diff with syntax highlighting
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, filepath }) => {
  const lines = diff.split('\n');
  
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">File: {filepath}</Text>
      </Box>
      
      <Box flexDirection="column" marginTop={1}>
        {lines.map((line, idx) => {
          // Skip diff header lines (first 4 lines)
          if (idx < 4) return null;
          
          let color: string | undefined;
          let prefix = '';
          
          if (line.startsWith('+')) {
            color = 'green';
            prefix = '+ ';
          } else if (line.startsWith('-')) {
            color = 'red';
            prefix = '- ';
          } else if (line.startsWith('@@')) {
            color = 'cyan';
            prefix = '@ ';
          } else {
            color = 'gray';
            prefix = '  ';
          }
          
          return (
            <Box key={idx}>
              <Text color={color}>{prefix}{line.substring(1)}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

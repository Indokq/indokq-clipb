import React from 'react';
import { Box, Text } from 'ink';
import { parseDiffToLines } from '../utils/parse-diff-lines.js';

interface TruncatedDiffProps {
  diff: string;
  maxLines?: number; // Show first 1/4 if longer than this
}

export const TruncatedDiff: React.FC<TruncatedDiffProps> = ({ 
  diff, 
  maxLines = 20
}) => {
  const { lines } = parseDiffToLines(diff);
  
  const shouldTruncate = lines.length > maxLines;
  const displayLines = shouldTruncate ? lines.slice(0, Math.floor(maxLines / 4)) : lines;
  const hiddenCount = lines.length - displayLines.length;
  
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray">
      {displayLines.map((line, idx) => {
        const oldNum = line.oldLineNumber?.toString().padStart(4, ' ') || '    ';
        const newNum = line.newLineNumber?.toString().padStart(4, ' ') || '    ';
        
        let contentColor: string;
        let prefix = '  ';
        
        switch (line.type) {
          case 'added':
            contentColor = 'green';
            prefix = '+ ';
            break;
          case 'removed':
            contentColor = 'red';
            prefix = '- ';
            break;
          default:
            contentColor = 'white';
            prefix = '  ';
        }
        
        return (
          <Box key={idx}>
            <Text color="gray" dimColor>{oldNum}</Text>
            <Text color="gray"> | </Text>
            <Text color="gray" dimColor>{newNum}</Text>
            <Text> </Text>
            <Text color={contentColor}>{prefix}{line.content}</Text>
          </Box>
        );
      })}
      
      {shouldTruncate && (
        <Box marginTop={1} paddingX={1}>
          <Text color="yellow">... {hiddenCount} more lines (Ctrl+O for verbose output)</Text>
        </Box>
      )}
    </Box>
  );
};

import React from 'react';
import { Box, Text } from 'ink';
import { parseDiffToLines } from '../utils/parse-diff-lines.js';

interface DiffViewerProps {
  diff: string;
  filepath: string;
}

/**
 * Display a unified diff with line numbers and syntax highlighting
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, filepath }) => {
  const { lines, stats } = parseDiffToLines(diff);
  
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* File header with EDIT badge */}
      <Box marginBottom={1}>
        <Text backgroundColor="yellow" color="black" bold> EDIT </Text>
        <Text> ({filepath})</Text>
      </Box>
      
      {/* Summary */}
      <Box marginBottom={1}>
        <Text color="green">✓ Succeeded. File edited. </Text>
        {stats.addedLines > 0 && (
          <Text color="green">(+{stats.addedLines} added) </Text>
        )}
        {stats.removedLines > 0 && (
          <Text color="red">(-{stats.removedLines} removed)</Text>
        )}
      </Box>
      
      {/* Diff content with line numbers */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray">
        {lines.map((line, idx) => {
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
              <Text color={contentColor}>
                {prefix}{line.content}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

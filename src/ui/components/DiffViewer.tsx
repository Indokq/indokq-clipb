import React from 'react';
import { Box } from 'ink';
import { parseDiffToLines } from '../utils/parse-diff-lines.js';
import { ToolBadge } from './ToolBadge.js';
import { TruncatedDiff } from './TruncatedDiff.js';

interface DiffViewerProps {
  diff: string;
  filepath: string;
}

/**
 * Display a unified diff with line numbers, badges, and truncation for long diffs
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, filepath }) => {
  const { stats } = parseDiffToLines(diff);
  
  const message = `Succeeded. File edited. ${stats.addedLines > 0 ? `(+${stats.addedLines} added) ` : ''}${stats.removedLines > 0 ? `(-${stats.removedLines} removed)` : ''}`.trim();
  
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <ToolBadge 
        toolName="edit_file" 
        filepath={filepath}
        success={true}
        message={message}
      />
      
      <TruncatedDiff diff={diff} maxLines={20} />
    </Box>
  );
};

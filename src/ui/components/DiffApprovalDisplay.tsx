import React from 'react';
import { Box } from 'ink';
import { PendingDiff } from '../../core/types.js';
import { DiffViewer } from './DiffViewer.js';
import { ApprovalPrompt } from './ApprovalPrompt.js';

interface DiffApprovalDisplayProps {
  showDiffApproval: boolean;
  pendingDiff: PendingDiff | null;
}

export const DiffApprovalDisplay: React.FC<DiffApprovalDisplayProps> = ({
  showDiffApproval,
  pendingDiff
}) => {
  if (!showDiffApproval || !pendingDiff) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <DiffViewer diff={pendingDiff.diff} filepath={pendingDiff.path} />
      <ApprovalPrompt message="Apply these changes?" />
    </Box>
  );
};

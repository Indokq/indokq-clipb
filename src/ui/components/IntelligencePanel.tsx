import React from 'react';
import { Box, Text } from 'ink';
import { PhaseState } from '../../core/types.js';

interface IntelligencePanelProps {
  phases: PhaseState;
}

const PhaseItem: React.FC<{
  name: string;
  status: string;
  icon: string;
}> = ({ name, status, icon }) => {
  const statusIcon = 
    status === 'complete' ? '✓' : 
    status === 'in_progress' ? '⟳' : 
    status === 'error' ? '✗' : '⧗';
  
  const color = 
    status === 'complete' ? 'green' : 
    status === 'in_progress' ? 'yellow' : 
    status === 'error' ? 'red' : 'gray';

  return (
    <Box>
      <Text color={color as any}>{statusIcon} {icon} {name}</Text>
    </Box>
  );
};

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({ phases }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">🔍 Intelligence Gathering (Parallel)</Text>
      <Box marginTop={1}>
        <Box flexDirection="column" width="50%">
          <PhaseItem name="Terminus" status={phases.terminus.status} icon="⚡" />
          <PhaseItem name="Strategy" status={phases.strategy.status} icon="🧠" />
          <PhaseItem name="Environment" status={phases.environment.status} icon="🖥️" />
        </Box>
        <Box flexDirection="column" width="50%">
          <PhaseItem name="Web Research" status={phases.search.status} icon="🌐" />
          <PhaseItem name="Exploration" status={phases.exploration.status} icon="🐳" />
        </Box>
      </Box>
    </Box>
  );
};

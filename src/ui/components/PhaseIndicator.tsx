import React from 'react';
import { Box, Text } from 'ink';
import { Phase } from '../../core/types.js';

interface PhaseIndicatorProps {
  currentPhase: Phase;
}

const phases: { id: Phase; label: string; icon: string }[] = [
  { id: 'prediction', label: 'Prediction', icon: '🔮' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
  { id: 'synthesis', label: 'Synthesis', icon: '⚡' },
  { id: 'execution', label: 'Execution', icon: '🚀' },
  { id: 'complete', label: 'Complete', icon: '✅' }
];

export const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({ currentPhase }) => {
  const currentIndex = phases.findIndex(p => p.id === currentPhase);

  return (
    <Box>
      {phases.map((phase, index) => {
        const isActive = index === currentIndex;
        const isPast = index < currentIndex;
        const color = isActive ? 'cyan' : isPast ? 'green' : 'gray';

        return (
          <Text key={phase.id} color={color} bold={isActive}>
            {phase.icon} {phase.label}
            {index < phases.length - 1 && <Text color="gray"> → </Text>}
          </Text>
        );
      })}
    </Box>
  );
};

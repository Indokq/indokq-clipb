import React from 'react';
import { Box } from 'ink';
import SelectInput from 'ink-select-input';

interface SlashCommandDropdownProps {
  show: boolean;
  options: { label: string; value: string }[];
  onSelect: (item: { label: string; value: string }) => void;
  limit?: number;
}

export const SlashCommandDropdown: React.FC<SlashCommandDropdownProps> = ({
  show,
  options,
  onSelect,
  limit = 8
}) => {
  if (!show || options.length === 0) return null;

  return (
    <Box paddingX={1} borderStyle="round" borderColor="yellow" flexDirection="column">
      <SelectInput
        items={options}
        onSelect={onSelect}
        limit={limit}
      />
    </Box>
  );
};

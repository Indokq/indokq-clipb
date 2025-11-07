import React from 'react';
import { Box } from 'ink';
import SelectInput from 'ink-select-input';

interface AutocompleteDropdownProps {
  show: boolean;
  options: { label: string; value: string }[];
  onSelect: (item: { label: string; value: string }) => void;
  limit?: number;
}

export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  show,
  options,
  onSelect,
  limit = 8
}) => {
  if (!show || options.length === 0) return null;

  return (
    <Box paddingX={1} borderStyle="round" borderColor="cyan" flexDirection="column">
      <SelectInput
        items={options}
        onSelect={onSelect}
        limit={limit}
      />
    </Box>
  );
};

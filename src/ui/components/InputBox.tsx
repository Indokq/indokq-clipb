import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputBoxProps {
  onSubmit: (input: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({ 
  onSubmit, 
  placeholder = 'Type your command and press Enter...',
  disabled = false 
}) => {
  const [input, setInput] = useState('');

  useInput((inputChar, key) => {
    if (disabled) return;

    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput('');
      }
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && inputChar) {
      setInput(prev => prev + inputChar);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={disabled ? 'gray' : 'green'} padding={1}>
      <Text bold color={disabled ? 'gray' : 'green'}>💬 Input</Text>
      <Box marginTop={1}>
        {input.length > 0 ? (
          <Text>
            <Text color="green">&gt; </Text>
            <Text>{input}</Text>
            <Text color="cyan">▌</Text>
          </Text>
        ) : (
          <Text color="gray">
            <Text color="green">&gt; </Text>
            {placeholder}
          </Text>
        )}
      </Box>
      {disabled ? (
        <Box marginTop={1}>
          <Text color="yellow">⚠ Agent is processing. Press ESC to stop.</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="gray">💡 Tip: Press ESC anytime to stop execution</Text>
        </Box>
      )}
    </Box>
  );
};

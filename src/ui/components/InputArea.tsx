import React from 'react';
import { Box, Text } from 'ink';
import { AppMode, FileContext } from '../../core/types.js';

interface InputAreaProps {
  input: string;
  cursorPosition: number;
  mode: AppMode;
  folderName: string;
  attachedFiles: FileContext[];
  inputKey: number;
}

export const InputArea: React.FC<InputAreaProps> = ({
  input,
  cursorPosition,
  mode,
  folderName,
  attachedFiles,
  inputKey
}) => {
  // Validate cursor position
  const validCursorPos = Math.max(0, Math.min(cursorPosition, input.length));
  
  // Handle empty input
  if (!input) {
    return (
      <Box flexDirection="column">
        <Box key={inputKey} paddingX={1} flexDirection="row">
          <Text color={mode === 'normal' ? 'cyan' : mode === 'planning' ? 'yellow' : 'green'}>
            {folderName} ({mode}) &gt;{' '}
          </Text>
          {attachedFiles.length > 0 && (
            <Text color="gray">
              {attachedFiles.filter(f => f.isImage).map((_, idx) => `[image#${idx + 1}]`).join(' ')}{' '}
            </Text>
          )}
          <Text inverse> </Text>
        </Box>
      </Box>
    );
  }
  
  const lines = input.split('\n');
  let charCount = 0;
  let cursorLine = 0;
  let cursorCol = 0;

  // Find which line the cursor is on
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= validCursorPos) {
      cursorLine = i;
      cursorCol = validCursorPos - charCount;
      break;
    }
    charCount += lines[i].length + 1; // +1 for \n
  }
  
  // Handle cursor at very end (after last newline)
  if (validCursorPos >= input.length) {
    cursorLine = lines.length - 1;
    cursorCol = lines[cursorLine].length;
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, idx) => (
        <Box key={`${inputKey}-${idx}`} paddingX={1} flexDirection="row">
          {idx === 0 && (
            <>
              <Text color={mode === 'normal' ? 'cyan' : mode === 'planning' ? 'yellow' : 'green'}>
                {folderName} ({mode}) &gt;{' '}
              </Text>
              {attachedFiles.length > 0 && (
                <Text color="gray">
                  {attachedFiles.filter(f => f.isImage).map((_, idx) => `[image#${idx + 1}]`).join(' ')}{' '}
                </Text>
              )}
            </>
          )}
          {idx > 0 && <Text>  </Text>}
          <Text>{idx === cursorLine ? line.slice(0, cursorCol) : line}</Text>
          {idx === cursorLine && <Text inverse> </Text>}
          {idx === cursorLine && <Text>{line.slice(cursorCol)}</Text>}
        </Box>
      ))}
    </Box>
  );
};

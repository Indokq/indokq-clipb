import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { useAppContext } from '../context/AppContext.js';
import path from 'path';

interface InputSectionProps {
  onFileSelect: (item: { label: string; value: string }) => void;
  onSlashCommandSelect: (item: { label: string; value: string }) => void;
}

export const InputSection: React.FC<InputSectionProps> = ({
  onFileSelect,
  onSlashCommandSelect,
}) => {
  const {
    input,
    inputKey,
    cursorPosition,
    mode,
    attachedFiles,
    showAutocomplete,
    autocompleteOptions,
    showSlashCommands,
    filteredSlashCommands,
    approvalLevel,
    approvalManagerRef,
  } = useAppContext();

  const folderName = path.basename(process.cwd());
  
  // Validate cursor position
  const validCursorPos = Math.max(0, Math.min(cursorPosition, input.length));
  
  const colors: Record<number, string> = {
    0: 'red',     // OFF
    1: 'yellow',  // LOW
    2: 'cyan',    // MEDIUM
    3: 'green'    // HIGH
  };

  // Render input prompt
  const renderInput = () => {
    if (!input) {
      return (
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

    return lines.map((line, idx) => (
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
    ));
  };

  return (
    <Box flexDirection="column">
      {/* Input prompt */}
      <Box flexDirection="column">
        {renderInput()}
      </Box>

      {/* Approval level indicator */}
      <Box paddingX={1}>
        {(() => {
          const levelName = approvalManagerRef.current.getLevelName();
          
          return (
            <Text dimColor>
              Approval: <Text color={colors[approvalLevel]}>{levelName}</Text> | Use /approval to change
            </Text>
          );
        })()}
      </Box>

      {/* Slash command dropdown - appears BELOW input */}
      {showSlashCommands && filteredSlashCommands.length > 0 && (
        <Box paddingX={1} borderStyle="round" borderColor="yellow" flexDirection="column">
          <SelectInput
            items={filteredSlashCommands}
            onSelect={onSlashCommandSelect}
            limit={8}
          />
        </Box>
      )}

      {/* Autocomplete dropdown - appears BELOW input */}
      {showAutocomplete && autocompleteOptions.length > 0 && (
        <Box paddingX={1} borderStyle="round" borderColor="cyan" flexDirection="column">
          <SelectInput
            items={autocompleteOptions}
            onSelect={onFileSelect}
            limit={8}
          />
        </Box>
      )}
    </Box>
  );
};

import { useCallback } from 'react';
import { useAppContext, SLASH_COMMAND_OPTIONS } from '../context/AppContext.js';
import { getWorkspaceFiles, filterFilesByQuery } from '../../tools/file-context.js';

export const useInputHandlers = () => {
  const {
    input,
    setInput,
    setCursorPosition,
    setInputKey,
    setShowAutocomplete,
    setAutocompleteOptions,
    setAtPosition,
    setShowSlashCommands,
    setFilteredSlashCommands,
  } = useAppContext();

  // Open autocomplete and load files
  const handleAutocompleteOpen = useCallback(async () => {
    try {
      const files = await getWorkspaceFiles(process.cwd());
      const options = files.slice(0, 50).map(f => ({
        label: f,
        value: f
      }));
      setAutocompleteOptions(options);
      setShowAutocomplete(true);
    } catch (error) {
      // Silent fail - just don't show autocomplete
      console.error('Failed to load files:', error);
    }
  }, [setAutocompleteOptions, setShowAutocomplete]);

  // Filter autocomplete based on current query
  const handleAutocompleteFilter = useCallback(async (currentInput: string) => {
    // Extract text after last @
    const match = currentInput.match(/@([\w.-/\\]*)$/);
    if (!match) {
      setShowAutocomplete(false);
      return;
    }
    
    const query = match[1];
    const files = await getWorkspaceFiles(process.cwd());
    const filtered = filterFilesByQuery(files, query);
    const options = filtered.map(f => ({
      label: f,
      value: f
    }));
    
    setAutocompleteOptions(options);
  }, [setShowAutocomplete, setAutocompleteOptions]);

  // Handle file selection from autocomplete
  const handleFileSelect = useCallback((item: { label: string; value: string }) => {
    // Find the last @ position to properly replace the mention
    const lastAtIndex = input.lastIndexOf('@');
    
    let newInput: string;
    if (lastAtIndex === -1) {
      // No @ found (shouldn't happen), just append
      newInput = input + '@' + item.value + ' ';
    } else {
      // Replace from @ onwards with the selected file
      newInput = input.substring(0, lastAtIndex) + '@' + item.value + ' ';
    }
    
    // Close autocomplete immediately
    setShowAutocomplete(false);
    setAutocompleteOptions([]);
    setAtPosition(-1);
    
    // Update input with small delay to ensure clean state and force re-render
    setTimeout(() => {
      setInput(newInput);
      setCursorPosition(newInput.length);
      setInputKey(k => k + 1); // Force input Box re-mount
    }, 10);
  }, [input, setShowAutocomplete, setAutocompleteOptions, setAtPosition, setInput, setCursorPosition, setInputKey]);

  // Handle slash command selection
  const handleSlashCommandSelect = useCallback((item: { label: string; value: string }) => {
    const newInput = item.value + ' ';
    setInput(newInput);
    setCursorPosition(newInput.length);
    setShowSlashCommands(false);
    setFilteredSlashCommands(SLASH_COMMAND_OPTIONS);
  }, [setInput, setCursorPosition, setShowSlashCommands, setFilteredSlashCommands]);

  // Filter slash commands based on current input
  const filterSlashCommands = useCallback((currentInput: string) => {
    const query = currentInput.toLowerCase();
    const filtered = SLASH_COMMAND_OPTIONS.filter(cmd =>
      cmd.value.toLowerCase().startsWith(query)
    );
    setFilteredSlashCommands(filtered);
    
    // Close if no matches
    if (filtered.length === 0) {
      setShowSlashCommands(false);
    }
  }, [setFilteredSlashCommands, setShowSlashCommands]);

  // Handle input character
  const handleInputChar = useCallback((char: string) => {
    setInput(prev => {
      const newInput = prev + char;
      
      // Trigger autocomplete on @
      if (char === '@') {
        setAtPosition(newInput.length - 1);
        handleAutocompleteOpen();
      }
      
      // Trigger slash commands on /
      if (char === '/' && newInput === '/') {
        setShowSlashCommands(true);
        setFilteredSlashCommands(SLASH_COMMAND_OPTIONS);
      }
      
      setCursorPosition(newInput.length);
      return newInput;
    });
  }, [setInput, setCursorPosition, setAtPosition, handleAutocompleteOpen, setShowSlashCommands, setFilteredSlashCommands]);

  // Handle backspace
  const handleBackspace = useCallback(() => {
    setInput(prev => {
      const newInput = prev.slice(0, -1);
      setCursorPosition(newInput.length);
      return newInput;
    });
  }, [setInput, setCursorPosition]);

  // Clear input
  const clearInput = useCallback(() => {
    setInput('');
    setCursorPosition(0);
  }, [setInput, setCursorPosition]);

  return {
    handleAutocompleteOpen,
    handleAutocompleteFilter,
    handleFileSelect,
    handleSlashCommandSelect,
    filterSlashCommands,
    handleInputChar,
    handleBackspace,
    clearInput,
  };
};

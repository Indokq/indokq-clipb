import { useState, useRef } from 'react';
import { FileContext } from '../../core/types.js';
import { getWorkspaceFiles, filterFilesByQuery } from '../../tools/file-context.js';

export const useInputHandling = () => {
  const [input, setInput] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<FileContext[]>([]);
  
  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<{label: string, value: string}[]>([]);
  const [atPosition, setAtPosition] = useState<number>(-1);
  
  // Slash command autocomplete state
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const slashCommandOptions = [
    { label: '/help - Display help', value: '/help' },
    { label: '/normal - Switch to normal mode', value: '/normal' },
    { label: '/plan - Switch to planning mode', value: '/plan' },
    { label: '/exec - Switch to execution mode', value: '/exec' },
    { label: '/clear - Clear history', value: '/clear' },
    { label: '/context reset', value: '/context reset' },
    { label: '/context show', value: '/context show' },
    { label: '/exit - Quit', value: '/exit' }
  ];
  const [filteredSlashCommands, setFilteredSlashCommands] = useState(slashCommandOptions);

  // Open autocomplete and load files
  const handleAutocompleteOpen = async () => {
    try {
      const files = await getWorkspaceFiles(process.cwd());
      const options = files.slice(0, 50).map(f => ({
        label: f,
        value: f
      }));
      setAutocompleteOptions(options);
      setShowAutocomplete(true);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  // Filter autocomplete based on current query
  const handleAutocompleteFilter = async (currentInput: string) => {
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
  };

  // Handle file selection from autocomplete
  const handleFileSelect = (item: {label: string, value: string}) => {
    const lastAtIndex = input.lastIndexOf('@');
    
    let newInput: string;
    if (lastAtIndex === -1) {
      newInput = input + '@' + item.value + ' ';
    } else {
      newInput = input.substring(0, lastAtIndex) + '@' + item.value + ' ';
    }
    
    setShowAutocomplete(false);
    setAutocompleteOptions([]);
    setAtPosition(-1);
    
    setTimeout(() => {
      setInput(newInput);
      setCursorPosition(newInput.length);
      setInputKey(k => k + 1);
    }, 10);
  };
  
  // Handle slash command selection
  const handleSlashCommandSelect = (item: {label: string, value: string}) => {
    const newInput = item.value + ' ';
    setInput(newInput);
    setCursorPosition(newInput.length);
    setShowSlashCommands(false);
    setFilteredSlashCommands(slashCommandOptions);
  };
  
  // Filter slash commands based on current input
  const filterSlashCommands = (currentInput: string) => {
    const query = currentInput.toLowerCase();
    const filtered = slashCommandOptions.filter(cmd => 
      cmd.value.toLowerCase().startsWith(query)
    );
    setFilteredSlashCommands(filtered);
    
    if (filtered.length === 0) {
      setShowSlashCommands(false);
    }
  };

  return {
    input,
    setInput,
    inputKey,
    setInputKey,
    cursorPosition,
    setCursorPosition,
    attachedFiles,
    setAttachedFiles,
    showAutocomplete,
    setShowAutocomplete,
    autocompleteOptions,
    setAutocompleteOptions,
    atPosition,
    setAtPosition,
    showSlashCommands,
    setShowSlashCommands,
    slashCommandOptions,
    filteredSlashCommands,
    setFilteredSlashCommands,
    handleAutocompleteOpen,
    handleAutocompleteFilter,
    handleFileSelect,
    handleSlashCommandSelect,
    filterSlashCommands
  };
};

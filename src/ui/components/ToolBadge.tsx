import React from 'react';
import { Box, Text } from 'ink';

interface ToolBadgeProps {
  toolName: string;
  filepath?: string;
  success?: boolean;
  message?: string;
}

const TOOL_STYLES: Record<string, { label: string }> = {
  edit_file: { label: 'EDIT' },
  create_file: { label: 'CREATE' },
  write_file: { label: 'WRITE' },
  read_file: { label: 'READ' },
  execute_command: { label: 'EXECUTE' },
  search_files: { label: 'SEARCH' },
  grep_codebase: { label: 'GREP' },
  list_files: { label: 'LIST' },
  docker_execute: { label: 'DOCKER' },
};

export const ToolBadge: React.FC<ToolBadgeProps> = ({ 
  toolName, 
  filepath, 
  success = true,
  message 
}) => {
  // Handle MCP tools
  let displayLabel = toolName;
  
  if (toolName.startsWith('mcp_')) {
    const parts = toolName.split('_');
    displayLabel = parts[1]?.toUpperCase() || 'MCP';
  } else {
    displayLabel = TOOL_STYLES[toolName]?.label || 'TOOL';
  }
  
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        {/* Uniform orange background for all tools */}
        <Text backgroundColor="yellow" color="black" bold> {displayLabel} </Text>
        {filepath && <Text> ({filepath})</Text>}
      </Box>
      {message && (
        <Box marginTop={1}>
          {/* Tree connector showing this message belongs to the tool above */}
          <Text color="gray">↳ {message}</Text>
        </Box>
      )}
    </Box>
  );
};

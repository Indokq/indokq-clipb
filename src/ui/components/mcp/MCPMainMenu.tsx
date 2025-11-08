import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { MCPManager } from '../../../core/mcp/mcp-manager.js';

interface MCPMainMenuProps {
  manager: MCPManager;
  onSelect: (view: 'list' | 'add' | 'back') => void;
}

export const MCPMainMenu: React.FC<MCPMainMenuProps> = ({ manager, onSelect }) => {
  const [connectedCount, setConnectedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCount = async () => {
      try {
        const servers = await manager.getConnectedServers();
        setConnectedCount(servers.filter(s => s.connected).length);
      } catch (error) {
        console.error('Failed to load server count:', error);
      }
      setLoading(false);
    };
    
    loadCount();
  }, [manager]);

  const items = [
    {
      label: loading ? 'View Connected Servers (loading...)' : `View Connected Servers (${connectedCount} active)`,
      value: 'list'
    },
    {
      label: 'Add New Server',
      value: 'add'
    },
    {
      label: 'Back',
      value: 'back'
    }
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ═══ MCP Server Management ═══
        </Text>
      </Box>
      
      <SelectInput
        items={items}
        onSelect={(item) => onSelect(item.value as any)}
      />
    </Box>
  );
};

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { MCPManager } from '../../../core/mcp/mcp-manager.js';
import { MCPServerStatus } from '../../../core/mcp/types.js';

interface MCPServerListProps {
  manager: MCPManager;
  onSelectServer: (serverId: string) => void;
  onBack: () => void;
  onAdd: () => void;
}

export const MCPServerList: React.FC<MCPServerListProps> = ({
  manager,
  onSelectServer,
  onBack,
  onAdd
}) => {
  const [servers, setServers] = useState<MCPServerStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadServers = async () => {
      setLoading(true);
      try {
        const serverList = await manager.getConnectedServers();
        setServers(serverList);
      } catch (error: any) {
        console.error('Failed to load servers:', error.message);
      }
      setLoading(false);
    };

    loadServers();
  }, [manager]);

  if (loading) {
    return (
      <Box padding={1}>
        <Text>Loading servers...</Text>
      </Box>
    );
  }

  const items = [
    ...servers.map(server => ({
      label: `${server.connected ? '✓' : '✗'} ${server.name} (${server.transport})`,
      value: server.id,
      server
    })),
    { label: '──────────────', value: 'separator', disabled: true },
    { label: '[A] Add Server', value: 'add' },
    { label: '[B] Back', value: 'back' }
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ═══ Connected MCP Servers ═══
        </Text>
      </Box>

      {servers.length === 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>No MCP servers configured.</Text>
          <Text dimColor>Use "Add Server" to connect to an MCP server.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          {servers.map(server => (
            <Box key={server.id} flexDirection="column" marginBottom={1}>
              <Text>
                {server.connected ? (
                  <Text color="green">✓</Text>
                ) : (
                  <Text color="red">✗</Text>
                )}{' '}
                <Text bold>{server.name}</Text>
                <Text dimColor> ({server.transport})</Text>
              </Text>
              <Text dimColor>  Tools: {server.toolCount} | Resources: {server.resourceCount}</Text>
              {server.error && (
                <Text color="red">  Error: {server.error}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Box marginBottom={1}>
        <Text dimColor>
          Select a server to view details, or choose an option below:
        </Text>
      </Box>

      <SelectInput
        items={items.filter((item: any) => !item.disabled)}
        onSelect={(item) => {
          if (item.value === 'add') {
            onAdd();
          } else if (item.value === 'back') {
            onBack();
          } else if (item.value !== 'separator') {
            onSelectServer(item.value);
          }
        }}
      />
    </Box>
  );
};

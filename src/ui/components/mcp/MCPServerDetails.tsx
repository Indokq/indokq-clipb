import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { MCPManager } from '../../../core/mcp/mcp-manager.js';
import { MCPServerStatus, MCPTool, MCPResource } from '../../../core/mcp/types.js';

interface MCPServerDetailsProps {
  manager: MCPManager;
  serverId: string;
  onBack: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}

export const MCPServerDetails: React.FC<MCPServerDetailsProps> = ({
  manager,
  serverId,
  onBack,
  onDisconnect,
  onRemove
}) => {
  const [server, setServer] = useState<MCPServerStatus | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [resources, setResources] = useState<MCPResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      try {
        const servers = await manager.getConnectedServers();
        const foundServer = servers.find(s => s.id === serverId);
        
        if (foundServer) {
          setServer(foundServer);

          if (foundServer.connected) {
            // Fetch tools and resources
            try {
              const serverTools = await manager.getServerTools(foundServer.name);
              setTools(serverTools);
            } catch (error) {
              console.error('Failed to fetch tools:', error);
            }

            try {
              const serverResources = await manager.getServerResources(foundServer.name);
              setResources(serverResources);
            } catch (error) {
              console.error('Failed to fetch resources:', error);
            }
          }
        }
      } catch (error: any) {
        console.error('Failed to load server details:', error.message);
      }
      setLoading(false);
    };

    loadDetails();
  }, [manager, serverId]);

  if (loading) {
    return (
      <Box padding={1}>
        <Text>Loading server details...</Text>
      </Box>
    );
  }

  if (!server) {
    return (
      <Box padding={1}>
        <Text color="red">Server not found</Text>
      </Box>
    );
  }

  const items = [
    ...(server.connected ? [{ label: 'Disconnect', value: 'disconnect' }] : []),
    { label: 'Remove Server', value: 'remove' },
    { label: 'Back', value: 'back' }
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ═══ Server: {server.name} ═══
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Status:{' '}
          {server.connected ? (
            <Text color="green">✓ Connected</Text>
          ) : (
            <Text color="red">✗ Disconnected</Text>
          )}
        </Text>
        <Text>Transport: {server.transport}</Text>
        
        {server.transport === 'stdio' && server.config.command && (
          <Text dimColor>
            Command: {server.config.command}{' '}
            {server.config.args?.join(' ')}
          </Text>
        )}
        
        {server.transport === 'sse' && server.config.url && (
          <Text dimColor>URL: {server.config.url}</Text>
        )}

        {server.error && (
          <Text color="red">Error: {server.error}</Text>
        )}
      </Box>

      {server.connected && tools.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Available Tools ({tools.length}):</Text>
          {tools.slice(0, 10).map(tool => (
            <Text key={tool.name} dimColor>
              • {tool.name}
              {tool.description && ` - ${tool.description}`}
            </Text>
          ))}
          {tools.length > 10 && (
            <Text dimColor>  ... and {tools.length - 10} more</Text>
          )}
        </Box>
      )}

      {server.connected && resources.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Resources ({resources.length}):</Text>
          {resources.slice(0, 5).map(resource => (
            <Text key={resource.uri} dimColor>
              • {resource.uri}
              {resource.description && ` - ${resource.description}`}
            </Text>
          ))}
          {resources.length > 5 && (
            <Text dimColor>  ... and {resources.length - 5} more</Text>
          )}
        </Box>
      )}

      <Box marginBottom={1}>
        <Text dimColor>Select an action:</Text>
      </Box>

      <SelectInput
        items={items}
        onSelect={(item) => {
          switch (item.value) {
            case 'disconnect':
              onDisconnect();
              break;
            case 'remove':
              onRemove();
              break;
            case 'back':
              onBack();
              break;
          }
        }}
      />
    </Box>
  );
};

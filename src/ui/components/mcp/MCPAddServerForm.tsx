import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { MCPManager } from '../../../core/mcp/mcp-manager.js';

interface MCPAddServerFormProps {
  manager: MCPManager;
  onSuccess: () => void;
  onCancel: () => void;
}

type FormStep = 'transport' | 'stdio-form' | 'http-form' | 'saving';

export const MCPAddServerForm: React.FC<MCPAddServerFormProps> = ({
  manager,
  onSuccess,
  onCancel
}) => {
  const [step, setStep] = useState<FormStep>('transport');
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
  
  // Form fields
  const [name, setName] = useState('');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('http://localhost:3000/sse');
  const [autoConnect, setAutoConnect] = useState(true);
  const [currentField, setCurrentField] = useState<'name' | 'command' | 'args' | 'url'>('name');
  const [error, setError] = useState<string>('');
  
  // Handle ESC key to cancel form
  useInput((input, key) => {
    if (key.escape && (step === 'stdio-form' || step === 'http-form')) {
      onCancel();
    }
  });

  if (step === 'transport') {
    const items = [
      { label: 'Stdio (Local Process)', value: 'stdio' },
      { label: 'HTTP (Remote Server - Modern)', value: 'http' },
      { label: 'SSE (Remote Server - Legacy)', value: 'sse' },
      { label: 'Cancel', value: 'cancel' }
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ═══ Add MCP Server - Select Transport ═══
          </Text>
        </Box>
        
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'cancel') {
              onCancel();
            } else {
              setTransport(item.value as 'stdio' | 'http' | 'sse');
              setStep(item.value === 'stdio' ? 'stdio-form' : 'http-form');
            }
          }}
        />
      </Box>
    );
  }

  if (step === 'saving') {
    return (
      <Box padding={1}>
        <Text>Saving and connecting to server...</Text>
      </Box>
    );
  }

  const handleSubmit = async () => {
    setError('');

    // Validation
    if (!name.trim()) {
      setError('Server name is required');
      return;
    }

    if (transport === 'stdio' && !command.trim()) {
      setError('Command is required for stdio transport');
      return;
    }

    if (transport === 'sse' && !url.trim()) {
      setError('URL is required for SSE transport');
      return;
    }

    setStep('saving');

    try {
      const config = transport === 'stdio' ? {
        name: name.trim(),
        transport: 'stdio' as const,
        command: command.trim(),
        args: args.trim() ? args.trim().split(' ').filter(Boolean) : [],
        enabled: true,
        autoConnect
      } : {
        name: name.trim(),
        transport: transport as 'http' | 'sse',
        url: url.trim(),
        enabled: true,
        autoConnect
      };

      await manager.addServer(config);
      onSuccess();
    } catch (error: any) {
      setError(error.message);
      setStep(transport === 'stdio' ? 'stdio-form' : 'http-form');
    }
  };

  // Stdio form
  if (step === 'stdio-form') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ═══ Add MCP Server (Stdio) ═══
          </Text>
        </Box>

        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginBottom={1}>
          <Text>
            Server Name:{' '}
            {currentField === 'name' ? (
              <TextInput
                value={name}
                onChange={setName}
                onSubmit={() => setCurrentField('command')}
              />
            ) : (
              <Text>{name || '(empty)'}</Text>
            )}
          </Text>

          <Text>
            Command:{' '}
            {currentField === 'command' ? (
              <TextInput
                value={command}
                onChange={setCommand}
                onSubmit={() => setCurrentField('args')}
              />
            ) : (
              <Text>{command}</Text>
            )}
          </Text>

          <Text>
            Arguments:{' '}
            {currentField === 'args' ? (
              <TextInput
                value={args}
                onChange={setArgs}
                onSubmit={handleSubmit}
              />
            ) : (
              <Text>{args || '(none)'}</Text>
            )}
          </Text>

          <Text>
            Auto-connect: {autoConnect ? '☑' : '☐'} Yes
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text dimColor>Press Enter to move to next field</Text>
          <Text dimColor>Press Escape to cancel</Text>
          {currentField === 'args' && (
            <Text color="green">Press Enter to save and connect</Text>
          )}
        </Box>
      </Box>
    );
  }

  // HTTP/SSE form
  if (step === 'http-form') {
    const transportLabel = transport === 'http' ? 'HTTP' : 'SSE';
    
    return (
      <Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ═══ Add MCP Server ({transportLabel}) ═══
          </Text>
        </Box>

        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginBottom={1}>
          <Text>
            Server Name:{' '}
            {currentField === 'name' ? (
              <TextInput
                value={name}
                onChange={setName}
                onSubmit={() => setCurrentField('url')}
              />
            ) : (
              <Text>{name || '(empty)'}</Text>
            )}
          </Text>

          <Text>
            URL:{' '}
            {currentField === 'url' ? (
              <TextInput
                value={url}
                onChange={setUrl}
                onSubmit={handleSubmit}
              />
            ) : (
              <Text>{url}</Text>
            )}
          </Text>

          <Text>
            Auto-connect: {autoConnect ? '☑' : '☐'} Yes
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text dimColor>Press Enter to move to next field</Text>
          <Text dimColor>Press Escape to cancel</Text>
          {currentField === 'url' && (
            <Text color="green">Press Enter to save and connect</Text>
          )}
        </Box>
        
        {transport === 'http' && (
          <Box marginTop={1}>
            <Text dimColor>
              Note: Will try StreamableHTTP first, then fall back to SSE
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  return null;
};

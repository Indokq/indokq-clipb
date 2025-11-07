import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { Message } from '../../core/types.js';

interface StructuredMessageProps {
  message: Message;
}

export const StructuredMessage: React.FC<StructuredMessageProps> = ({ message }) => {
  const [collapsed, setCollapsed] = useState(
    message.type === 'thinking' ? message.collapsed ?? true : false
  );

  switch (message.type) {
    case 'user':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">You:</Text>
          <Text>{message.content}</Text>
          {message.fileContexts && message.fileContexts.length > 0 && (
            <Text dimColor>📎 {message.fileContexts.length} file(s) attached</Text>
          )}
        </Box>
      );

    case 'assistant':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">Assistant:</Text>
          <Text>{message.content}</Text>
        </Box>
      );

    case 'thinking':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>
            💭 Thinking {collapsed ? '(collapsed)' : ''}
          </Text>
          {!collapsed && (
            <Box paddingLeft={2}>
              <Text dimColor>{message.content}</Text>
            </Box>
          )}
        </Box>
      );

    case 'tool_plan':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="blue">📋 Plan:</Text>
          <Box paddingLeft={2} flexDirection="column">
            <Text>{message.reason}</Text>
            <Text dimColor>Tools: {message.tools.join(', ')}</Text>
          </Box>
        </Box>
      );

    case 'code_block':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta">
            💻 Code{message.file ? `: ${message.file}` : ''}
          </Text>
          <Box paddingLeft={2} borderStyle="single" borderColor="gray">
            <Text>{message.code}</Text>
          </Box>
        </Box>
      );

    case 'diff':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow">
            📝 Diff: {message.file}
            {message.approved !== undefined && (
              <Text color={message.approved ? 'green' : 'red'}>
                {' '}[{message.approved ? 'Approved' : 'Rejected'}]
              </Text>
            )}
          </Text>
          {message.description && <Text dimColor>{message.description}</Text>}
          <Box paddingLeft={2}>
            <Text>{message.diff}</Text>
          </Box>
        </Box>
      );

    case 'warning':
      const warningColor = message.severity === 'high' ? 'red' : 'yellow';
      return (
        <Box marginBottom={1}>
          <Text color={warningColor}>
            ⚠️  {message.content}
          </Text>
        </Box>
      );

    case 'success':
      return (
        <Box marginBottom={1}>
          <Text color="green">
            {message.icon || '✅'} {message.content}
          </Text>
        </Box>
      );

    case 'error':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">
            ❌ {message.content}
          </Text>
          {!message.recoverable && (
            <Text color="red" dimColor>
              (Non-recoverable error)
            </Text>
          )}
        </Box>
      );

    case 'system':
    case 'tool':
    case 'log':
      return (
        <Box marginBottom={1}>
          <Text color={message.color || 'gray'}>
            {message.icon} {message.content}
          </Text>
        </Box>
      );

    default:
      // This should never happen with exhaustive type checking
      const _exhaustive: never = message;
      return <Text>Unknown message type</Text>;
  }
};

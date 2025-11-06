import React from 'react';
import { Box, Text } from 'ink';
import { AgentTreeNode } from '../../core/types.js';

interface AgentTreeViewProps {
  tree: AgentTreeNode;
}

export const AgentTreeView: React.FC<AgentTreeViewProps> = ({ tree }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="cyan">
        @indokq/{tree.name}@1.0.0:
      </Text>
      {tree.description && (
        <Text color="gray">{tree.description}</Text>
      )}
      <Box flexDirection="column" marginTop={0}>
        {tree.children.map((child, idx) => (
          <ToolNode key={child.id} node={child} isLast={idx === tree.children.length - 1} />
        ))}
      </Box>
      {tree.status === 'complete' && (
        <Text color="green" dimColor>
          ✓ Complete
        </Text>
      )}
    </Box>
  );
};

interface ToolNodeProps {
  node: AgentTreeNode;
  isLast: boolean;
  indent?: number;
}

const ToolNode: React.FC<ToolNodeProps> = ({ node, isLast, indent = 0 }) => {
  const prefix = indent > 0 ? (isLast ? '  └─ ' : '  ├─ ') : '└─ ';
  const statusIcon = node.status === 'running' ? '⏳' : node.status === 'complete' ? '✓' : '✗';
  
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={node.status === 'error' ? 'red' : 'cyan'}>
          {prefix}{statusIcon} {node.name}
        </Text>
      </Box>
      {node.result && (
        <Box marginLeft={indent + 4}>
          <Text color="gray" dimColor>
            └─ {node.result.length > 80 ? node.result.substring(0, 80) + '...' : node.result}
          </Text>
        </Box>
      )}
      {node.children.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {node.children.map((child, idx) => (
            <ToolNode 
              key={child.id} 
              node={child} 
              isLast={idx === node.children.length - 1}
              indent={indent + 2}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

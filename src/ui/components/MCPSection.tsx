import React from 'react';
import { Box } from 'ink';
import { useAppContext } from '../context/AppContext.js';
import { DiffViewer } from './DiffViewer.js';
import { ApprovalPrompt } from './ApprovalPrompt.js';
import { MCPMainMenu } from './mcp/MCPMainMenu.js';
import { MCPServerList } from './mcp/MCPServerList.js';
import { MCPAddServerForm } from './mcp/MCPAddServerForm.js';
import { MCPServerDetails } from './mcp/MCPServerDetails.js';
import { useMessages } from '../hooks/useMessages.js';

interface MCPSectionProps {
  onAddSuccess: () => void;
}

export const MCPSection: React.FC<MCPSectionProps> = ({ onAddSuccess }) => {
  const {
    showMCPMenu,
    setShowMCPMenu,
    mcpView,
    setMCPView,
    selectedServerId,
    setSelectedServerId,
    orchestratorRef,
  } = useAppContext();

  const { addMessage } = useMessages();

  if (!showMCPMenu) return null;

  return (
    <Box flexDirection="column">
      {mcpView === 'main' && (
        <MCPMainMenu
          manager={orchestratorRef.current?.getMCPManager()!}
          onSelect={(view) => {
            if (view === 'back') {
              setShowMCPMenu(false);
            } else {
              setMCPView(view);
            }
          }}
        />
      )}
      {mcpView === 'list' && (
        <MCPServerList
          manager={orchestratorRef.current?.getMCPManager()!}
          onSelectServer={(serverId) => {
            setSelectedServerId(serverId);
            setMCPView('details');
          }}
          onBack={() => setMCPView('main')}
          onAdd={() => setMCPView('add')}
        />
      )}
      {mcpView === 'add' && (
        <MCPAddServerForm
          manager={orchestratorRef.current?.getMCPManager()!}
          onSuccess={() => {
            setMCPView('list');
            onAddSuccess();
          }}
          onCancel={() => setMCPView('main')}
        />
      )}
      {mcpView === 'details' && selectedServerId && (
        <MCPServerDetails
          manager={orchestratorRef.current?.getMCPManager()!}
          serverId={selectedServerId}
          onBack={() => setMCPView('list')}
          onDisconnect={async () => {
            try {
              const servers = await orchestratorRef.current?.getMCPManager().getConnectedServers();
              const server = servers?.find(s => s.id === selectedServerId);
              if (server) {
                await orchestratorRef.current?.getMCPManager().disconnectServer(server.name);
                addMessage({
                  type: 'system',
                  content: `✓ Disconnected from ${server.name}`,
                  color: 'green'
                });
              }
              setMCPView('list');
            } catch (error: any) {
              addMessage({
                type: 'system',
                content: `✗ Error: ${error.message}`,
                color: 'red'
              });
            }
          }}
          onRemove={async () => {
            try {
              await orchestratorRef.current?.getMCPManager().removeServer(selectedServerId);
              addMessage({
                type: 'system',
                content: '✓ Server removed successfully',
                color: 'green'
              });
              setMCPView('list');
            } catch (error: any) {
              addMessage({
                type: 'system',
                content: `✗ Error: ${error.message}`,
                color: 'red'
              });
            }
          }}
        />
      )}
    </Box>
  );
};

export const DiffApprovalSection: React.FC = () => {
  const { showDiffApproval, pendingDiff } = useAppContext();

  if (!showDiffApproval || !pendingDiff) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <DiffViewer diff={pendingDiff.diff} filepath={pendingDiff.path} />
      <ApprovalPrompt message="Apply these changes?" />
    </Box>
  );
};

export const QueueIndicator: React.FC = () => {
  const { messageQueue } = useAppContext();

  if (messageQueue.length === 0) return null;

  return (
    <Box paddingX={1}>
      <Text color="yellow">
        {messageQueue.length} queued
      </Text>
    </Box>
  );
};

// Need to import Text
import { Text } from 'ink';

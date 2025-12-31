import React, { useEffect } from 'react';
import { Box, useInput } from 'ink';
import { AppProvider, useAppContext, SLASH_COMMAND_OPTIONS } from './context/AppContext.js';
import { useInitialization } from './hooks/useInitialization.js';
import { useMessages } from './hooks/useMessages.js';
import { useInputHandlers } from './hooks/useInputHandlers.js';
import { ChatArea } from './components/ChatArea.js';
import { InputSection } from './components/InputSection.js';
import { MCPSection, DiffApprovalSection, QueueIndicator } from './components/MCPSection.js';
import { ModelPicker } from './components/ModelPicker.js';
import { useNormalModeExecution } from './hooks/useNormalModeExecution.js';
import { usePlanningModeExecution } from './hooks/usePlanningModeExecution.js';
import { useExecutionModeExecution } from './hooks/useExecutionModeExecution.js';
import { useKeyboardHandler } from './hooks/useKeyboardHandler.js';

interface AppContentProps {
  initialTask?: string;
}

const AppContent: React.FC<AppContentProps> = ({ initialTask }) => {
  const ctx = useAppContext();
  const { addMessage } = useMessages();
  const {
    handleFileSelect,
    handleSlashCommandSelect,
    handleAutocompleteFilter,
    handleAutocompleteOpen,
    filterSlashCommands,
  } = useInputHandlers();
  
  // Initialize MCP, workspace scanner, etc.
  useInitialization();
  
  // Mode execution hooks
  const { executeWithTools, executeAgentDirectly } = useNormalModeExecution();
  const { executePlanningMode } = usePlanningModeExecution();
  const { executeInExecutionMode } = useExecutionModeExecution();
  
  // Keyboard handler
  useKeyboardHandler({
    executeWithTools,
    executeAgentDirectly,
    executeInExecutionMode,
    executePlanningMode,
    handleAutocompleteFilter,
    handleAutocompleteOpen,
    filterSlashCommands,
  });

  // Spinner animation
  useEffect(() => {
    if (!ctx.isRunning && !ctx.isStreaming && !ctx.showStatus) return;
    
    const interval = setInterval(() => {
      ctx.setSpinnerFrame((prev: number) => (prev + 1) % 10);
    }, 80);
    
    return () => clearInterval(interval);
  }, [ctx.isRunning, ctx.isStreaming, ctx.showStatus]);

  return (
    <Box flexDirection="column" height="100%">
      {/* Main Chat Area */}
      <ChatArea />
      
      {/* Diff Approval */}
      <DiffApprovalSection />
      
      {/* Queued Messages */}
      <QueueIndicator />
      
      {/* MCP Menu */}
      <MCPSection onAddSuccess={() => {
        addMessage({
          type: 'system',
          content: '✓ MCP server added successfully!',
          color: 'green'
        });
      }} />
      
      {/* Model Picker */}
      {ctx.showModelPicker && (
        <ModelPicker
          currentModel={ctx.selectedModel}
          onSelect={(modelId) => {
            ctx.setSelectedModel(modelId);
            ctx.setShowModelPicker(false);
            addMessage({
              type: 'system',
              content: `✓ Model switched to: ${modelId}`,
              color: 'green'
            });
          }}
          onCancel={() => ctx.setShowModelPicker(false)}
        />
      )}
      
      {/* Input Section */}
      <InputSection
        onFileSelect={handleFileSelect}
        onSlashCommandSelect={handleSlashCommandSelect}
      />
    </Box>
  );
};

interface AppProps {
  initialTask?: string;
}

export const App: React.FC<AppProps> = ({ initialTask }) => {
  return (
    <AppProvider initialTask={initialTask}>
      <AppContent initialTask={initialTask} />
    </AppProvider>
  );
};

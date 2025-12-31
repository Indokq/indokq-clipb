import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { fetchAvailableModels, ModelInfo, getModelDisplayName } from '../../core/models/model-service.js';

interface ModelPickerProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const ModelPicker: React.FC<ModelPickerProps> = ({
  currentModel,
  onSelect,
  onCancel,
}) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Spinner animation
  useEffect(() => {
    if (!loading) return;
    
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % 10);
    }, 80);
    
    return () => clearInterval(interval);
  }, [loading]);

  // Fetch models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedModels = await fetchAvailableModels();
        setModels(fetchedModels);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch models');
      } finally {
        setLoading(false);
      }
    };

    loadModels();
  }, []);

  // Handle keyboard for ESC
  // Note: ESC is handled by parent component through onCancel

  if (loading) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
        <Text bold color="cyan">Model Selection</Text>
        <Box marginTop={1}>
          <Text color="blue">{spinnerFrames[spinnerFrame]} Loading available models...</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="red" padding={1}>
        <Text bold color="red">Model Selection - Error</Text>
        <Box marginTop={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press ESC to close</Text>
        </Box>
      </Box>
    );
  }

  if (models.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
        <Text bold color="yellow">Model Selection</Text>
        <Box marginTop={1}>
          <Text color="yellow">No models available</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press ESC to close</Text>
        </Box>
      </Box>
    );
  }

  // Build items for SelectInput
  const items = models.map(model => ({
    label: `${getModelDisplayName(model)}${model.id === currentModel ? ' (current)' : ''}`,
    value: model.id,
  }));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">Select Model</Text>
      <Box marginTop={1}>
        <Text dimColor>Current: {currentModel}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <SelectInput
          items={items}
          onSelect={(item) => onSelect(item.value)}
          limit={10}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ Navigate | Enter Select | ESC Cancel</Text>
      </Box>
    </Box>
  );
};

import React from 'react';
import { Box, Text } from 'ink';
import { WebSearch } from '../../core/types.js';

interface WebSearchViewerProps {
  searches: WebSearch[];
}

export const WebSearchViewer: React.FC<WebSearchViewerProps> = ({ searches }) => {
  if (searches.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      {searches.map((search, idx) => (
        <Box key={idx} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="yellow">Query {idx + 1}: "{search.query}"</Text>
          </Box>
          
          {search.status === 'searching' && (
            <Text color="gray">  ⟳ Searching...</Text>
          )}
          
          {search.status === 'complete' && search.sources && (
            <Text color="green">  ✓ Found {search.sources.length} sources</Text>
          )}
          
          {search.status === 'error' && (
            <Text color="red">  ✗ Search failed</Text>
          )}
        </Box>
      ))}
    </Box>
  );
};

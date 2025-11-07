# Tool Parameters Bug Fix

## Problem Summary
The model's tool calls were reaching the dispatcher with empty `{}` parameters, even though Claude was generating valid tool calls with proper parameters.

## Root Cause
In `src/ui/app.tsx`, the `executeWithTools` function was capturing tool_use blocks from `content_block_start` events but **never accumulated the JSON input** that arrives incrementally in `content_block_delta` events with `delta.type === 'input_json_delta'`.

### Before (Broken)
```typescript
// Only captured initial block with empty input
if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
  toolUses.push(chunk.content_block);  // input was {} here!
}
```

### After (Fixed)
```typescript
// Initialize with buffer
if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
  toolUses.push({
    ...chunk.content_block,
    input: {},
    _inputBuffer: '',
    _correlationId: correlationId
  });
}

// Accumulate JSON deltas
if (chunk.type === 'content_block_delta') {
  if (lastToolUse && chunk.delta?.type === 'input_json_delta') {
    lastToolUse._inputBuffer += chunk.delta.partial_json;
  }
}

// Parse accumulated JSON
if (chunk.type === 'content_block_stop') {
  if (lastToolUse && lastToolUse._inputBuffer) {
    lastToolUse.input = JSON.parse(lastToolUse._inputBuffer);
  }
}
```

## Changes Made

### 1. Fixed Stream Processing (`src/ui/app.tsx`)
- Added `_inputBuffer` to accumulate JSON incrementally
- Added handlers for `content_block_delta` with `input_json_delta` type
- Added `content_block_stop` handler to parse complete JSON
- Added correlation IDs for tracking tool calls through their lifecycle
- Cleaned up internal tracking fields before validation

### 2. Parameter Normalization (`src/tools/schemas.ts`)
- Added `normalizeToolParams` function to handle common parameter name variations
- Supports `path`/`file_path`/`filePath`/`filepath` synonyms for file-related tools
- Applied before Zod validation to maximize compatibility

### 3. Enhanced Validation Messages (`src/tools/schemas.ts`)
- Improved error messages to include tool name
- Better formatting for multiple validation errors
- Clearer path handling in error messages

### 4. Prompt Hardening (`src/prompts/presets.ts`)
- Added explicit constraints to NORMAL_MODE_CONFIG:
  - Must provide all required parameters
  - Never call tools with empty `{}` input
  - Review tool descriptions before calling
  - Check input_schema for required fields

## Testing

```bash
npm run type-check  # ✓ Passed
npm run build       # ✓ Passed
```

## Expected Behavior

1. **Tool Input Accumulation**: Parameters arrive correctly from streaming API
2. **Parameter Synonyms**: Common variations like `file_path` → `path` are normalized
3. **Clear Errors**: Validation failures show tool name and specific missing parameters
4. **Correlation Tracking**: Each tool call gets a correlation ID for debugging
5. **Circuit Breaker**: After 3 validation failures, execution stops to prevent infinite loops

## Error Logging

Only critical errors are logged:
```
[abc123ef] Failed to parse tool input JSON: {...corrupted json...}
```

All debug logging has been removed for production use.

## Reference Implementation

The fix follows the same pattern used in `src/core/orchestrator.ts` (lines 142-177) which was already correctly handling tool input accumulation.

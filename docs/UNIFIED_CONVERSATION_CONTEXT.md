# Unified Conversation Context Implementation

## Overview

Fixed the issue where conversation context was not preserved when switching between modes (normal, planning, execution). Previously, each mode maintained separate conversation histories, causing context loss during mode transitions.

## Problem

The application had three separate history refs:
- **Normal Mode**: Used `executionHistoryRef`
- **Planning Mode**: Used `planningHistoryRef`
- **Execution Mode**: Used `executionHistoryRef` (shared with normal)

### Issues Identified

1. **History cleared on mode switch** - Switching to execution mode wiped `executionHistoryRef`
2. **Planning context only transferred once** - Only on first execution message
3. **No bidirectional context sharing** - Context lost when returning to normal mode from planning

## Solution

Implemented a **unified conversation history** shared across all modes using a single `conversationHistoryRef`.

### Changes Made

#### 1. Added Unified History Ref (`src/ui/hooks/useAppState.ts`)

```typescript
// UNIFIED conversation history across all modes
const conversationHistoryRef = useRef<Array<{ 
  role: 'user' | 'assistant', 
  content: any, 
  mode?: AppMode  // Track which mode generated each message
}>>([]);
```

- Tracks all conversation messages with their originating mode
- Legacy refs kept for backward compatibility but not used

#### 2. Updated Normal Mode (`src/ui/hooks/useNormalMode.ts`)

- Reads from unified `conversationHistoryRef`
- Writes user/assistant messages with `mode: 'normal'`
- Preserves full conversation context across turns

#### 3. Updated Planning Mode (`src/ui/hooks/usePlanningMode.ts`)

- Reads from unified `conversationHistoryRef`
- Filters for planning messages to check if workspace context needed
- Writes messages with `mode: 'planning'`
- Maintains local `conversationMessages` array for multi-turn loop

#### 4. Updated Execution Mode (`src/ui/hooks/useExecutionMode.ts`)

- Reads from unified `conversationHistoryRef`
- On first execution, filters planning messages and adds as context prefix
- Writes messages with `mode: 'execution'`
- No longer clears history on entry

#### 5. Removed History Clearing (`src/ui/hooks/useKeyboardShortcuts.ts`)

**Before:**
```typescript
setMode('execution');
executionHistoryRef.current = [];  // ❌ Cleared context!
```

**After:**
```typescript
setMode('execution');
// ✅ Context preserved - no clearing
```

Updated mode switch messages to indicate context preservation:
- "✓ Switched to planning mode (conversation context preserved)"
- "✓ Switched to execution mode (conversation context preserved)"
- "✓ Switched to normal mode (conversation context preserved)"

#### 6. Updated Command Handlers (`src/ui/hooks/useCommandHandlers.ts`)

- `/clear` command now clears unified history
- Mode switch commands no longer clear history
- Updated success messages to indicate context preservation

## Benefits

1. **True conversation continuity** - All context preserved across mode switches
2. **Simpler architecture** - Single source of truth for conversation history
3. **Better UX** - Users can freely switch modes without losing context
4. **Mode tracking** - Optional mode field allows filtering by originating mode

## Testing

Type-check passed successfully:
```bash
npm run type-check  # ✅ No errors
```

### Manual Testing Scenarios

1. **Normal → Planning → Normal**
   - Start conversation in normal mode
   - Switch to planning mode
   - Verify previous context is visible
   - Switch back to normal
   - Verify full conversation history maintained

2. **Normal → Execution → Normal**
   - Have conversation in normal mode
   - Switch to execution mode
   - Verify context preserved
   - Return to normal mode
   - Continue conversation seamlessly

3. **Planning → Execution → Normal**
   - Plan a feature in planning mode
   - Switch to execution mode
   - Verify planning context appears in first execution message
   - Return to normal mode
   - Verify all history maintained

4. **Clear Command**
   - Build up conversation across modes
   - Run `/clear`
   - Verify all history cleared (unified across modes)

## Files Modified

- `src/ui/hooks/useAppState.ts` - Added conversationHistoryRef
- `src/ui/hooks/useNormalMode.ts` - Use unified history
- `src/ui/hooks/usePlanningMode.ts` - Use unified history
- `src/ui/hooks/useExecutionMode.ts` - Use unified history
- `src/ui/hooks/useKeyboardShortcuts.ts` - Remove history clearing
- `src/ui/hooks/useCommandHandlers.ts` - Update clear command

## Backward Compatibility

Legacy refs (`planningHistoryRef`, `executionHistoryRef`) maintained in `useAppState.ts` for backward compatibility, but no longer used by the application. Can be removed in future cleanup.

## Future Enhancements

1. **Context window management** - Implement sliding window or summarization for very long conversations
2. **Mode-specific context filtering** - Option to show/hide messages from specific modes
3. **Conversation export** - Allow users to export full conversation with mode annotations
4. **Context visualization** - UI indicator showing which mode each message originated from

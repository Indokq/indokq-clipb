# Diff UI for File Operations - Complete ✅

## Overview
Implemented visual diff preview for `write_file` operations, showing line-by-line changes with approval workflow.

## How It Works

### 1. New File Creation
- **No diff shown** - files created directly
- Output: `New file created: path/to/file`

### 2. File Modification
- **Diff shown with approval required**
- Visual display:
  ```
   EDIT  (filename.txt)
  ✓ Succeeded. File edited. (+2 added) (-1 removed)
  
  ┌────────────────────────────────────────┐
  │    1 |    1   - Old line              │
  │      |    2   + New line 1            │
  │      |    3   + New line 2            │
  └────────────────────────────────────────┘
  
  [a]pprove [r]eject [e]dit [ESC] cancel
  ```

### 3. No Changes Needed
- **Skipped** if content is identical
- Output: `No changes needed for: path/to/file`

## Files Modified

1. ✅ `src/ui/utils/parse-diff-lines.ts` - Created diff parser
2. ✅ `src/ui/components/DiffViewer.tsx` - Enhanced with line numbers
3. ✅ `src/tools/handlers/write-file.ts` - Added diff generation
4. ✅ `src/tools/index.ts` - Pass through approval data
5. ✅ `src/ui/app.tsx` - Handle approval workflow

## Testing

Try these commands in the CLI:

```bash
# Create a new file (no diff)
create a file called test.txt with "Hello"

# Edit existing file (shows diff)
edit test.txt to say "Hello World"

# Edit again (shows diff)
change test.txt content to "Goodbye World"
```

## User Actions

When diff is shown:
- **Press 'a'** → Approve and apply changes
- **Press 'r'** → Reject changes
- **Press 'e'** → Request manual edit (future)
- **Press ESC** → Cancel (reject)

## Technical Details

**Diff Format:**
- Line numbers: `old | new`
- Green lines: Additions (`+`)
- Red lines: Deletions (`-`)
- White lines: Unchanged context
- Stats: Shows count of additions/removals

**Approval Flow:**
1. `write_file` detects existing file
2. Generates unified diff
3. Returns `requiresApproval: true`
4. UI displays diff with DiffViewer
5. User approves/rejects
6. Changes applied or discarded

## Build Status
✅ TypeScript compilation successful
✅ All dependencies satisfied
✅ Node.js compatibility fixed (globalThis instead of window)

## Bug Fixes
- Fixed `ReferenceError: window is not defined` by using `globalThis` for cross-environment compatibility

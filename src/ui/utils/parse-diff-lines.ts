import parseDiff from 'parse-diff';

export interface DiffLine {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  type: 'added' | 'removed' | 'unchanged' | 'context';
  content: string;
}

export interface DiffStats {
  addedLines: number;
  removedLines: number;
  changedLines: number;
}

/**
 * Parse a unified diff string into structured lines with line numbers
 */
export function parseDiffToLines(unifiedDiff: string): { lines: DiffLine[]; stats: DiffStats } {
  const lines: DiffLine[] = [];
  const stats: DiffStats = {
    addedLines: 0,
    removedLines: 0,
    changedLines: 0
  };
  
  try {
    const parsed = parseDiff(unifiedDiff);
    
    if (parsed.length === 0) {
      return { lines, stats };
    }
    
    const file = parsed[0];
    
    for (const chunk of file.chunks) {
      let oldLine = chunk.oldStart;
      let newLine = chunk.newStart;
      
      for (const change of chunk.changes) {
        if (change.type === 'add') {
          lines.push({
            oldLineNumber: null,
            newLineNumber: newLine++,
            type: 'added',
            content: change.content
          });
          stats.addedLines++;
        } else if (change.type === 'del') {
          lines.push({
            oldLineNumber: oldLine++,
            newLineNumber: null,
            type: 'removed',
            content: change.content
          });
          stats.removedLines++;
        } else {
          // Normal/context line
          lines.push({
            oldLineNumber: oldLine++,
            newLineNumber: newLine++,
            type: 'unchanged',
            content: change.content
          });
        }
      }
    }
    
    stats.changedLines = stats.addedLines + stats.removedLines;
  } catch (error) {
    // If parsing fails, return empty
    console.error('Failed to parse diff:', error);
  }
  
  return { lines, stats };
}

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Generate a workspace summary for better context awareness
 */
export async function generateWorkspaceSummary(workingDir: string = process.cwd()): Promise<string> {
  let summary = '# Workspace Context\n\n';
  
  // Working directory
  summary += `**Current directory:** \`${path.basename(workingDir)}\`\n\n`;
  
  // Git info
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: workingDir })
      .toString().trim();
    summary += `**Git branch:** \`${branch}\`\n\n`;
    
    // Recent modified files
    const recentFiles = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || echo ""', { cwd: workingDir })
      .toString().trim().split('\n').filter(Boolean);
    
    if (recentFiles.length > 0) {
      summary += `**Recently modified:** ${recentFiles.slice(0, 5).join(', ')}\n\n`;
    }
  } catch (e) {
    // Not a git repo or git not available
  }
  
  // Package manager detection
  if (fs.existsSync(path.join(workingDir, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(workingDir, 'package.json'), 'utf-8'));
      summary += `**Project:** ${pkg.name || 'Unknown'}\n`;
      if (pkg.description) summary += `**Description:** ${pkg.description}\n`;
      summary += '\n';
      
      // Key dependencies
      const deps = pkg.dependencies || {};
      const keyDeps = Object.keys(deps).slice(0, 5);
      if (keyDeps.length > 0) {
        summary += `**Key dependencies:** ${keyDeps.join(', ')}\n\n`;
      }
    } catch (e) {
      // Invalid package.json
    }
  }
  
  // Project structure
  summary += '## Project Structure\n\n';
  const dirs = fs.readdirSync(workingDir)
    .filter(f => {
      try {
        return fs.statSync(path.join(workingDir, f)).isDirectory() && 
               !f.startsWith('.') && 
               f !== 'node_modules';
      } catch {
        return false;
      }
    });
  
  dirs.forEach(dir => {
    summary += `- \`${dir}/\`\n`;
  });
  
  return summary;
}

/**
 * Extract files mentioned in conversation history
 */
export function extractFilesFromHistory(messages: Array<{role: string, content: string}>): string[] {
  const files = new Set<string>();
  const filePattern = /(?:^|\s)([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)(?:\s|$|,|\))/g;
  
  messages.forEach(msg => {
    let match;
    while ((match = filePattern.exec(msg.content)) !== null) {
      files.add(match[1]);
    }
  });
  
  return Array.from(files);
}

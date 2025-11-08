export type ApprovalLevel = 0 | 1 | 2 | 3;

export interface ApprovalDecision {
  requiresApproval: boolean;
  reason?: string;
}

// Tool categories
const READ_ONLY_TOOLS = ['read_file', 'list_files', 'search_files', 'grep_codebase'];
const FILE_MODIFICATION_TOOLS = ['edit_file', 'write_file', 'create_file'];

// Safe command patterns for MEDIUM level
const SAFE_COMMAND_PATTERNS = [
  /^git (status|log|diff|show|branch|remote)/, // Read-only git
  /^npm (run )?(test|build|type-check|lint)/, // Safe build/test
  /^(ls|cat|head|tail|grep|find|which|pwd|echo)/, // Safe shell
  /^(python|node|cargo|go|rustc|tsc) --version/, // Version checks
  /^node_modules\/\.bin\//, // Local binaries
];

const DANGEROUS_COMMAND_PATTERNS = [
  /rm -rf/, // Destructive delete
  /git push/, // Remote modification
  /npm install/, // Package installation
  /sudo/, // Elevated privileges
  />\s*\/dev\//, // Writing to devices
  /mkfs/, // Format filesystem
  /dd if=/, // Disk operations
];

export class ApprovalManager {
  constructor(private level: ApprovalLevel) {}
  
  shouldApprove(toolName: string, input: any): ApprovalDecision {
    // Level 3: HIGH - never require approval
    if (this.level === 3) {
      return { requiresApproval: false };
    }
    
    // Level 0: OFF - always require approval
    if (this.level === 0) {
      return { requiresApproval: true, reason: 'Approval level set to OFF (all tools require approval)' };
    }
    
    // Level 1: LOW - only read-only tools auto-allowed
    if (this.level === 1) {
      if (READ_ONLY_TOOLS.includes(toolName)) {
        return { requiresApproval: false };
      }
      return { requiresApproval: true, reason: 'Tool modifies state' };
    }
    
    // Level 2: MEDIUM - read-only + safe/reversible commands
    if (this.level === 2) {
      // Read-only tools always allowed
      if (READ_ONLY_TOOLS.includes(toolName)) {
        return { requiresApproval: false };
      }
      
      // File modifications are reversible - allow them
      if (FILE_MODIFICATION_TOOLS.includes(toolName)) {
        return { requiresApproval: false };
      }
      
      // Execute_command: check if safe
      if (toolName === 'execute_command') {
        const command = input.command || '';
        
        // Check dangerous patterns first
        if (DANGEROUS_COMMAND_PATTERNS.some(p => p.test(command))) {
          return { requiresApproval: true, reason: 'Dangerous command detected' };
        }
        
        // Check safe patterns
        if (SAFE_COMMAND_PATTERNS.some(p => p.test(command))) {
          return { requiresApproval: false };
        }
        
        // Unknown command - require approval
        return { requiresApproval: true, reason: 'Command safety unknown' };
      }
      
      // Docker and MCP tools are external modifications - require approval
      if (toolName === 'docker_execute' || toolName.startsWith('mcp_')) {
        return { requiresApproval: true, reason: 'External system modification' };
      }
      
      return { requiresApproval: false };
    }
    
    return { requiresApproval: true };
  }
  
  updateLevel(newLevel: ApprovalLevel): void {
    this.level = newLevel;
  }
  
  getLevel(): ApprovalLevel {
    return this.level;
  }
  
  getLevelName(): string {
    switch (this.level) {
      case 0: return 'OFF';
      case 1: return 'LOW';
      case 2: return 'MEDIUM';
      case 3: return 'HIGH';
      default: return 'UNKNOWN';
    }
  }
}

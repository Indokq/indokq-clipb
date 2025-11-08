import { MCPManager } from '../core/mcp/mcp-manager.js';
import { MCPTool } from '../core/mcp/types.js';

export class MCPToolRegistry {
  private manager: MCPManager;
  private cachedTools: Map<string, MCPTool[]> = new Map();

  constructor(manager: MCPManager) {
    this.manager = manager;
  }

  /**
   * Convert MCP tool to Claude tool definition format
   */
  convertToClaudeTool(mcpTool: MCPTool): any {
    return {
      name: `mcp_${mcpTool.serverName}_${mcpTool.name}`,
      description: mcpTool.description || `Tool from MCP server '${mcpTool.serverName}'`,
      input_schema: mcpTool.inputSchema
    };
  }

  /**
   * Get all MCP tools as Claude-compatible tool definitions
   */
  async getAllClaudeTools(): Promise<any[]> {
    const servers = await this.manager.getConnectedServers();
    const tools: any[] = [];

    // Fetch tools from each connected server
    for (const server of servers) {
      if (!server.connected) continue;

      try {
        // Check cache first
        let serverTools = this.cachedTools.get(server.name);
        
        if (!serverTools) {
          // Fetch and cache
          serverTools = await this.manager.getServerTools(server.name);
          this.cachedTools.set(server.name, serverTools);
        }

        // Convert to Claude format
        for (const tool of serverTools) {
          tools.push(this.convertToClaudeTool(tool));
        }
      } catch (error: any) {
        console.error(`Failed to get tools from '${server.name}':`, error.message);
      }
    }

    return tools;
  }

  /**
   * Execute an MCP tool call
   * Tool name format: mcp_{serverName}_{toolName}
   */
  async executeTool(toolName: string, input: any): Promise<any> {
    // Parse tool name: mcp_{serverName}_{toolName}
    const match = toolName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match) {
      throw new Error(`Invalid MCP tool name format: ${toolName}`);
    }

    const [, serverName, actualToolName] = match;

    // Check if server is connected
    if (!this.manager.isConnected(serverName)) {
      throw new Error(`MCP server '${serverName}' is not connected`);
    }

    try {
      const result = await this.manager.executeToolCall(
        serverName,
        actualToolName,
        input
      );

      return result;
    } catch (error: any) {
      throw new Error(`MCP tool execution failed: ${error.message}`);
    }
  }

  /**
   * Clear cached tools (call when servers reconnect)
   */
  clearCache(serverName?: string): void {
    if (serverName) {
      this.cachedTools.delete(serverName);
    } else {
      this.cachedTools.clear();
    }
  }

  /**
   * Check if a tool name is an MCP tool
   */
  static isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp_');
  }
}

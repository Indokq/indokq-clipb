import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { MCPServerConfig, MCPTool, MCPResource } from './types.js';

export class MCPClient {
  private client: Client;
  private transport?: Transport;
  private config: MCPServerConfig;
  private _connected: boolean = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.client = new Client({
      name: 'indokq-cli',
      version: '1.0.0'
    });
  }

  async connect(): Promise<void> {
    try {
      // Create appropriate transport
      if (this.config.transport === 'stdio') {
        if (!this.config.command) {
          throw new Error('Stdio transport requires command');
        }

        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args || [],
          env: this.config.env
        });
        
        await this.client.connect(this.transport);
        this._connected = true;
        
      } else if (this.config.transport === 'http') {
        // Modern StreamableHTTP with SSE fallback
        if (!this.config.url) {
          throw new Error('HTTP transport requires URL');
        }

        const baseUrl = new URL(this.config.url);
        
        // Try StreamableHTTP first (modern)
        try {
          this.transport = new StreamableHTTPClientTransport(baseUrl);
          await this.client.connect(this.transport);
          this._connected = true;
          console.error(`[MCP] Connected to ${this.config.name} using StreamableHTTP`);
        } catch (error: any) {
          // Fall back to SSE for backward compatibility
          console.error(`[MCP] StreamableHTTP failed for ${this.config.name}, trying SSE fallback...`);
          
          this.transport = new SSEClientTransport(baseUrl);
          await this.client.connect(this.transport);
          this._connected = true;
          console.error(`[MCP] Connected to ${this.config.name} using SSE (fallback)`);
        }
        
      } else if (this.config.transport === 'sse') {
        // Legacy SSE-only mode (for explicit use)
        if (!this.config.url) {
          throw new Error('SSE transport requires URL');
        }

        this.transport = new SSEClientTransport(new URL(this.config.url));
        await this.client.connect(this.transport);
        this._connected = true;
        
      } else {
        throw new Error(`Unknown transport type: ${this.config.transport}`);
      }
    } catch (error: any) {
      this._connected = false;
      throw new Error(`Failed to connect to MCP server '${this.config.name}': ${error.message}`);
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this._connected) {
      throw new Error('Client is not connected');
    }

    try {
      const result = await this.client.listTools();
      
      // Convert to our format
      return result.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as any,
        serverName: this.config.name
      }));
    } catch (error: any) {
      throw new Error(`Failed to list tools: ${error.message}`);
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this._connected) {
      throw new Error('Client is not connected');
    }

    try {
      const result = await this.client.callTool({
        name,
        arguments: args
      });

      return result;
    } catch (error: any) {
      throw new Error(`Failed to call tool '${name}': ${error.message}`);
    }
  }

  async listResources(): Promise<MCPResource[]> {
    if (!this._connected) {
      throw new Error('Client is not connected');
    }

    try {
      const result = await this.client.listResources();
      
      // Convert to our format
      return result.resources.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType
      }));
    } catch (error: any) {
      throw new Error(`Failed to list resources: ${error.message}`);
    }
  }

  async readResource(uri: string): Promise<string> {
    if (!this._connected) {
      throw new Error('Client is not connected');
    }

    try {
      const result = await this.client.readResource({ uri });
      
      // Extract text from contents
      const textContent = result.contents
        .filter((c: any) => c.text)
        .map((c: any) => c.text)
        .join('\n');

      return textContent;
    } catch (error: any) {
      throw new Error(`Failed to read resource '${uri}': ${error.message}`);
    }
  }

  async close(): Promise<void> {
    if (this._connected && this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore close errors
      }
      this._connected = false;
    }
  }

  get connected(): boolean {
    return this._connected;
  }

  getConfig(): MCPServerConfig {
    return this.config;
  }
}

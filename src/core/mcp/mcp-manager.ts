import { MCPClient } from './mcp-client.js';
import { MCPStorage } from './mcp-storage.js';
import { MCPServerConfig, MCPServerStatus, MCPTool, MCPResource } from './types.js';
import { config } from '../../config/env.js';

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private storage: MCPStorage;
  private systemConfigs: MCPServerConfig[] = [];
  private userConfigs: MCPServerConfig[] = [];

  constructor() {
    this.storage = new MCPStorage();
  }

  async loadFromStorage(): Promise<void> {
    // Load system configs from environment
    try {
      const mcpServersEnv = config.MCP_SERVERS || '[]';
      const parsed = JSON.parse(mcpServersEnv);
      
      this.systemConfigs = Array.isArray(parsed) ? parsed.map((cfg: any, index: number) => ({
        id: `system-${index}`,
        name: cfg.name || `server-${index}`,
        transport: cfg.transport || 'stdio',
        command: cfg.command,
        args: cfg.args,
        env: cfg.env,
        url: cfg.url,
        enabled: cfg.enabled !== false,
        autoConnect: cfg.autoConnect !== false,
        addedBy: 'system' as const,
        addedAt: new Date().toISOString()
      })) : [];
    } catch (error: any) {
      console.error('Failed to parse MCP_SERVERS environment variable:', error.message);
      this.systemConfigs = [];
    }

    // Load user configs from storage
    try {
      this.userConfigs = await this.storage.load();
    } catch (error: any) {
      console.error('Failed to load user MCP servers:', error.message);
      this.userConfigs = [];
    }
  }

  async saveToStorage(): Promise<void> {
    try {
      await this.storage.save(this.userConfigs);
    } catch (error: any) {
      throw new Error(`Failed to save MCP servers: ${error.message}`);
    }
  }

  getAllConfigs(): MCPServerConfig[] {
    // User configs override system configs with the same name
    const allConfigs = [...this.systemConfigs];
    
    for (const userConfig of this.userConfigs) {
      const systemIndex = allConfigs.findIndex(c => c.name === userConfig.name);
      if (systemIndex >= 0) {
        // Override system config
        allConfigs[systemIndex] = userConfig;
      } else {
        // Add new user config
        allConfigs.push(userConfig);
      }
    }
    
    return allConfigs.filter(c => c.enabled);
  }

  async connectServer(config: MCPServerConfig): Promise<void> {
    // Check if already connected
    if (this.clients.has(config.name)) {
      throw new Error(`Server '${config.name}' is already connected`);
    }

    const client = new MCPClient(config);
    
    try {
      await client.connect();
      this.clients.set(config.name, client);
    } catch (error: any) {
      throw new Error(`Failed to connect to '${config.name}': ${error.message}`);
    }
  }

  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server '${name}' is not connected`);
    }

    await client.close();
    this.clients.delete(name);
  }

  async connectAll(): Promise<void> {
    const configs = this.getAllConfigs().filter(c => c.autoConnect);
    
    const results = await Promise.allSettled(
      configs.map(config => this.connectServer(config))
    );

    // Log connection results
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Failed to connect to '${configs[index].name}':`, result.reason);
      }
    });
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map(name =>
      this.disconnectServer(name).catch(err => {
        console.error(`Failed to disconnect '${name}':`, err);
      })
    );

    await Promise.all(disconnectPromises);
  }

  async getConnectedServers(): Promise<MCPServerStatus[]> {
    const configs = this.getAllConfigs();
    
    const statusPromises = configs.map(async config => {
      const client = this.clients.get(config.name);
      const connected = client?.connected || false;

      let tools: MCPTool[] = [];
      let resources: MCPResource[] = [];
      let error: string | undefined;

      // Fetch tools and resources if connected
      if (connected && client) {
        try {
          tools = await client.listTools();
        } catch (err: any) {
          error = `Failed to list tools: ${err.message}`;
          console.error(`[MCP] ${error}`);
        }

        try {
          resources = await client.listResources();
        } catch (err: any) {
          // Resources are optional - many servers don't support them
          // Only log if it's NOT a "method not found" error
          const isMethodNotFound = err.message?.includes('-32601') || err.message?.includes('Method not found');
          if (!isMethodNotFound) {
            console.error(`[MCP] Failed to list resources from ${config.name}:`, err.message);
          }
        }
      }

      return {
        id: config.id,
        name: config.name,
        connected,
        toolCount: tools.length,
        resourceCount: resources.length,
        transport: config.transport,
        config,
        tools,
        resources,
        error
      };
    });

    return await Promise.all(statusPromises);
  }

  async getServerTools(name: string): Promise<MCPTool[]> {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server '${name}' is not connected`);
    }

    return await client.listTools();
  }

  async getServerResources(name: string): Promise<MCPResource[]> {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server '${name}' is not connected`);
    }

    return await client.listResources();
  }

  async executeToolCall(serverName: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server '${serverName}' is not connected`);
    }

    return await client.callTool(toolName, args);
  }

  async addServer(config: Omit<MCPServerConfig, 'id' | 'addedBy' | 'addedAt'>): Promise<MCPServerConfig> {
    const fullConfig: MCPServerConfig = {
      ...config,
      id: `user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      addedBy: 'user',
      addedAt: new Date().toISOString()
    };

    await this.storage.addServer(fullConfig);
    this.userConfigs.push(fullConfig);

    // Auto-connect if requested
    if (fullConfig.autoConnect) {
      try {
        await this.connectServer(fullConfig);
      } catch (error: any) {
        console.error(`Failed to auto-connect '${fullConfig.name}':`, error.message);
      }
    }

    return fullConfig;
  }

  async removeServer(id: string): Promise<void> {
    // Find the config
    const config = this.userConfigs.find(c => c.id === id);
    if (!config) {
      throw new Error(`Server with id '${id}' not found`);
    }

    // Disconnect if connected
    if (this.clients.has(config.name)) {
      await this.disconnectServer(config.name);
    }

    // Remove from storage
    await this.storage.removeServer(id);
    
    // Remove from memory
    this.userConfigs = this.userConfigs.filter(c => c.id !== id);
  }

  isConnected(name: string): boolean {
    const client = this.clients.get(name);
    return client?.connected || false;
  }
}

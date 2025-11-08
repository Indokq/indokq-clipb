import fs from 'fs/promises';
import path from 'path';
import { MCPServerConfig, MCPStorageData } from './types.js';

export class MCPStorage {
  private storagePath: string;

  constructor(workingDir: string = process.cwd()) {
    const indokqDir = path.join(workingDir, '.indokq');
    this.storagePath = path.join(indokqDir, 'mcp-servers.json');
  }

  async load(): Promise<MCPServerConfig[]> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const parsed: MCPStorageData = JSON.parse(data);
      return parsed.servers || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  async save(servers: MCPServerConfig[]): Promise<void> {
    const data: MCPStorageData = {
      version: '1.0.0',
      servers
    };

    // Ensure .indokq directory exists
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      this.storagePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  async addServer(config: MCPServerConfig): Promise<void> {
    const servers = await this.load();
    
    // Check for duplicate names
    if (servers.some(s => s.name === config.name)) {
      throw new Error(`Server with name '${config.name}' already exists`);
    }

    servers.push(config);
    await this.save(servers);
  }

  async removeServer(id: string): Promise<void> {
    const servers = await this.load();
    const filtered = servers.filter(s => s.id !== id);
    await this.save(filtered);
  }

  async updateServer(id: string, updates: Partial<MCPServerConfig>): Promise<void> {
    const servers = await this.load();
    const index = servers.findIndex(s => s.id === id);
    
    if (index === -1) {
      throw new Error(`Server with id '${id}' not found`);
    }

    servers[index] = { ...servers[index], ...updates };
    await this.save(servers);
  }
}

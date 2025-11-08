export interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  
  // For stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  
  // For HTTP/SSE transport
  url?: string;
  
  // Metadata
  enabled: boolean;
  autoConnect: boolean;
  addedBy: 'system' | 'user';
  addedAt: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  serverName: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPServerStatus {
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  resourceCount: number;
  transport: 'stdio' | 'http' | 'sse';
  config: MCPServerConfig;
  tools?: MCPTool[];
  resources?: MCPResource[];
  error?: string;
}

export interface MCPStorageData {
  version: string;
  servers: MCPServerConfig[];
}

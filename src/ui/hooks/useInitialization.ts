import { useEffect } from 'react';
import { useAppContext } from '../context/AppContext.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { setMemoryManager, setCurrentMode, setMCPToolRegistry } from '../../tools/index.js';
import { setCommandMemoryManager } from '../../tools/execute-command.js';
import { config } from '../../config/env.js';

export const useInitialization = () => {
  const {
    mode,
    orchestratorRef,
    memoryManagerRef,
    workspaceScannerRef,
  } = useAppContext();

  // Initialize context management system
  useEffect(() => {
    // Set memory manager for tool tracking
    setMemoryManager(memoryManagerRef.current);
    setCommandMemoryManager(memoryManagerRef.current, mode);
    
    // Initialize MCP manager
    const initMCP = async () => {
      try {
        // Create orchestrator (which creates MCP manager)
        const orch = new Orchestrator();
        orchestratorRef.current = orch;
        
        // Initialize MCP
        const mcpManager = orch.getMCPManager();
        await mcpManager.loadFromStorage();
        
        // Auto-connect if enabled
        if (config.MCP_AUTO_CONNECT_ON_STARTUP) {
          await mcpManager.connectAll();
        }
        
        // Set MCP tool registry for tool handler
        const { MCPToolRegistry } = await import('../../tools/mcp-tools.js');
        const mcpToolRegistry = new MCPToolRegistry(mcpManager);
        setMCPToolRegistry(mcpToolRegistry);
        
        console.error('[MCP] Initialized successfully');
      } catch (error) {
        console.error('[MCP] Failed to initialize:', error);
      }
    };
    
    initMCP();
    
    // Scan workspace on startup (async, doesn't block)
    if (config.WORKSPACE_SCAN_ON_STARTUP) {
      workspaceScannerRef.current.scan(process.cwd()).catch(err => {
        console.error('Failed to scan workspace:', err);
      });
    }
  }, []);
  
  // Update mode in tools when mode changes
  useEffect(() => {
    setCurrentMode(mode);
    setCommandMemoryManager(memoryManagerRef.current, mode);
  }, [mode]);
};

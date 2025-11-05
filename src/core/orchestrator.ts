import { claudeClient } from './models/claude-client.js';
import { handleToolCall, ToolUse } from '../tools/index.js';
import { validateToolCall } from '../tools/index.js';
import { 
  PREDICTION_SYSTEM_PROMPT, 
  TERMINUS_PROMPT, 
  WEB_RESEARCH_PROMPT,
  STRATEGY_PROMPT,
  ENV_OBSERVATION_PROMPT,
  EXPLORATION_PROMPT,
  SYNTHESIS_PROMPT,
  EXECUTION_PROMPT
} from '../config/prompts.js';
import { 
  executeCommandTool, 
  readFileTool, 
  writeFileTool,
  listFilesTool,
  searchFilesTool,
  grepCodebaseTool,
  dockerExecuteTool,
  spawnAgentsTool
} from '../config/tools.js';
import { loadAgent } from '../.agents/agent-loader.js';
import type { AgentDefinition, AgentSpawnRequest } from '../.agents/types/agent-definition.js';
import { 
  Phase, 
  TaskPrediction, 
  IntelligenceResult, 
  OrchestratorCallbacks,
  WebSearch 
} from './types.js';

export class Orchestrator {
  private callbacks: OrchestratorCallbacks;

  constructor(callbacks: OrchestratorCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async executeTask(task: string): Promise<string> {
    try {
      // Load orchestrator agent
      const orchestrator = loadAgent('orchestrator');
      
      const conversationHistory: any[] = [
        { role: 'user', content: task }
      ];
      
      let finalResult = '';
      
      // Main orchestration loop - model decides what to do
      while (true) {
        const stream = claudeClient.streamMessage({
          system: orchestrator.systemPrompt,
          messages: conversationHistory,
          tools: [spawnAgentsTool],
          max_tokens: 8192
        });
        
        let assistantMessage: any = { role: 'assistant', content: [] };
        let hasToolCalls = false;
        
        // Stream orchestrator's response
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_start') {
            if (chunk.content_block?.type === 'text') {
              assistantMessage.content.push({ type: 'text', text: '' });
            } else if (chunk.content_block?.type === 'tool_use') {
              assistantMessage.content.push({
                type: 'tool_use',
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                input: {},
                _inputBuffer: ''
              });
              hasToolCalls = true;
            }
          }
          
          if (chunk.type === 'content_block_delta') {
            // SAFETY: Ensure content array has at least one text block
            if (assistantMessage.content.length === 0) {
              assistantMessage.content.push({ type: 'text', text: '' });
            }
            
            const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
            if (lastContent && lastContent.type === 'text' && chunk.delta?.text) {
              lastContent.text += chunk.delta.text;
              finalResult += chunk.delta.text;
              // Stream to UI
              this.callbacks.onEvent?.({ 
                type: 'text_chunk', 
                streamId: 'orchestrator', 
                chunk: chunk.delta.text 
              });
            }
            if (lastContent && lastContent.type === 'tool_use') {
              if (chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
                lastContent._inputBuffer = (lastContent._inputBuffer || '') + chunk.delta.partial_json;
              }
            }
          }
          
          if (chunk.type === 'content_block_stop') {
            const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
            if (lastContent && lastContent.type === 'tool_use' && lastContent._inputBuffer) {
              try {
                lastContent.input = JSON.parse(lastContent._inputBuffer);
                delete lastContent._inputBuffer;
              } catch (e) {
                // Invalid JSON
              }
            }
          }
        }
        
        conversationHistory.push(assistantMessage);
        
        // If no tools called, model is done
        if (!hasToolCalls) {
          break;
        }
        
        // Execute spawn_agents tool
        const toolResults: any[] = [];
        for (const content of assistantMessage.content) {
          if (content.type === 'tool_use' && content.name === 'spawn_agents') {
            const result = await this.handleSpawnAgents(content.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: content.id,
              content: result
            });
          }
        }
        
        // Feed results back to model
        conversationHistory.push({
          role: 'user',
          content: toolResults
        });
      }
      
      this.callbacks.onEvent?.({ type: 'phase_change', phase: 'complete' });
      this.callbacks.onEvent?.({ type: 'complete', result: finalResult });
      
      return finalResult;
    } catch (error: any) {
      this.callbacks.onEvent?.({ type: 'error', error });
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  private async handleSpawnAgents(input: { agents: AgentSpawnRequest[] }): Promise<string> {
    const results: any[] = [];
    
    // Show [Spawn Agents] marker
    this.callbacks.onEvent?.({ type: 'phase_change', phase: 'intelligence' });
    
    for (const agentRequest of input.agents) {
      try {
        const agent = loadAgent(agentRequest.agent_type);
        
        // Show agent spawn announcement
        this.callbacks.onEvent?.({
          type: 'system',
          content: `\n@indokq/${agent.id}@1.0.0:\n${agent.spawnerPrompt || agent.displayName}`
        });
        
        // Execute agent
        const result = await this.executeAgent(agent, agentRequest.prompt);
        
        results.push({
          agent_type: agentRequest.agent_type,
          result: result
        });
        
        // Show completion
        const completionId = Math.random().toString(36).substring(2, 12).toUpperCase();
        this.callbacks.onEvent?.({
          type: 'system',
          content: `----------- Done the ${agent.displayName} (${completionId}) -----------`
        });
      } catch (error: any) {
        results.push({
          agent_type: agentRequest.agent_type,
          error: error.message
        });
      }
    }
    
    return JSON.stringify(results, null, 2);
  }

  private async executeAgent(agent: AgentDefinition, prompt: string): Promise<string> {
    const conversationHistory: any[] = [
      { role: 'user', content: prompt }
    ];
    
    // Map agent toolNames to actual tool objects
    const tools = this.getToolsForAgent(agent.toolNames);
    
    let accumulated = '';
    
    // Agent's own tool loop
    while (true) {
      const stream = claudeClient.streamMessage({
        system: agent.systemPrompt,
        messages: conversationHistory,
        tools: tools,
        max_tokens: 8192
      });
      
      let assistantMessage: any = { role: 'assistant', content: [] };
      let hasToolCalls = false;
      
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'text') {
            assistantMessage.content.push({ type: 'text', text: '' });
          } else if (chunk.content_block?.type === 'tool_use') {
            assistantMessage.content.push({
              type: 'tool_use',
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              input: {},
              _inputBuffer: ''
            });
            hasToolCalls = true;
          }
        }
        
        if (chunk.type === 'content_block_delta') {
          // SAFETY: Ensure content array has at least one text block
          if (assistantMessage.content.length === 0) {
            assistantMessage.content.push({ type: 'text', text: '' });
          }
          
          const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
          if (lastContent && lastContent.type === 'text' && chunk.delta?.text) {
            lastContent.text += chunk.delta.text;
            accumulated += chunk.delta.text;
            // Stream agent output
            this.callbacks.onEvent?.({ 
              type: 'text_chunk', 
              streamId: agent.id, 
              chunk: chunk.delta.text 
            });
          }
          if (lastContent && lastContent.type === 'tool_use') {
            if (chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
              lastContent._inputBuffer = (lastContent._inputBuffer || '') + chunk.delta.partial_json;
            }
          }
        }
        
        if (chunk.type === 'content_block_stop') {
          const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
          if (lastContent && lastContent.type === 'tool_use' && lastContent._inputBuffer) {
            try {
              lastContent.input = JSON.parse(lastContent._inputBuffer);
              delete lastContent._inputBuffer;
            } catch (e) {
              // Invalid JSON
            }
          }
        }
      }
      
      conversationHistory.push(assistantMessage);
      
      if (!hasToolCalls) break;
      
      // Execute tools
      const toolResults: any[] = [];
      for (const content of assistantMessage.content) {
        if (content.type === 'tool_use') {
          // Handle nested spawn_agents for intelligence agent
          if (content.name === 'spawn_agents') {
            const result = await this.handleSpawnAgents(content.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: content.id,
              content: result
            });
          } else {
            // Regular tool execution
            try {
              const result = await handleToolCall(content);
              toolResults.push(result);
            } catch (error: any) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: content.id,
                content: `Error: ${error.message}`,
                is_error: true
              });
            }
          }
        }
      }
      
      conversationHistory.push({
        role: 'user',
        content: toolResults
      });
    }
    
    return accumulated;
  }

  private getToolsForAgent(toolNames: string[]): any[] {
    const toolMap: Record<string, any> = {
      'list_files': listFilesTool,
      'read_file': readFileTool,
      'write_file': writeFileTool,
      'execute_command': executeCommandTool,
      'search_files': searchFilesTool,
      'grep_codebase': grepCodebaseTool,
      'docker_execute': dockerExecuteTool,
      'spawn_agents': spawnAgentsTool
    };
    
    return toolNames.map(name => toolMap[name]).filter(Boolean);
  }

  private async predictionPhase(task: string): Promise<TaskPrediction> {
    let accumulated = '';

    const stream = claudeClient.streamMessage({
      system: PREDICTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: task }],
      enableWebSearch: false,
      max_tokens: 1024
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        accumulated += chunk.delta.text;
        this.callbacks.onStreamUpdate?.('prediction', chunk.delta.text);
      }
    }

    // Parse JSON from response
    try {
      const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Fallback to default prediction
    }

    return {
      category: 'general',
      riskLevel: 'medium',
      keyFiles: [],
      needsMultimodal: false,
      estimatedComplexity: 'moderate'
    };
  }

  private async intelligencePhase(
    task: string, 
    prediction: TaskPrediction
  ): Promise<IntelligenceResult> {
    const results: IntelligenceResult = {};

    // Run all 5 intelligence streams in parallel
    await Promise.all([
      this.terminusStream(task, prediction).then(r => results.terminus = r),
      this.webResearchStream(task, prediction).then(r => results.webResearch = r),
      this.strategyStream(task, prediction).then(r => results.strategy = r),
      this.environmentStream(task, prediction).then(r => results.environment = r),
      this.explorationStream(task, prediction).then(r => results.exploration = r)
    ]);

    return results;
  }

  private async terminusStream(task: string, prediction: TaskPrediction): Promise<string> {
    let accumulated = '';
    let conversationHistory: any[] = [{ role: 'user', content: task }];
    let consecutiveValidationFailures = 0;
    const MAX_VALIDATION_FAILURES = 3;
    let isFirstCall = true;

    // Tool loop - continue until no more tools requested
    while (consecutiveValidationFailures < MAX_VALIDATION_FAILURES) {
      let assistantMessage: any = { role: 'assistant', content: [] };
      let hasToolUse = false;

      const stream = claudeClient.streamMessage({
        system: isFirstCall ? TERMINUS_PROMPT : undefined,
        messages: conversationHistory,
        tools: [listFilesTool, searchFilesTool, grepCodebaseTool, readFileTool, executeCommandTool],
        enableWebSearch: false
      });

      isFirstCall = false;

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          accumulated += chunk.delta.text;
          // Emit text chunk event
          this.callbacks.onEvent?.({ type: 'text_chunk', streamId: 'terminus', chunk: chunk.delta.text });
          this.callbacks.onStreamUpdate?.('terminus', chunk.delta.text);
        }

        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'text') {
            assistantMessage.content.push({ type: 'text', text: '' });
          } else if (chunk.content_block?.type === 'tool_use') {
            // Initialize tool_use with empty input and a buffer for accumulating JSON
            assistantMessage.content.push({
              type: 'tool_use',
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              input: {},
              _inputBuffer: ''
            });
            hasToolUse = true;
          }
        }

        if (chunk.type === 'content_block_delta') {
          const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
          if (lastContent && lastContent.type === 'text' && chunk.delta?.text) {
            lastContent.text += chunk.delta.text;
          }
          // Accumulate tool input JSON deltas
          if (lastContent && lastContent.type === 'tool_use') {
            if (chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
              lastContent._inputBuffer = (lastContent._inputBuffer || '') + chunk.delta.partial_json;
            }
          }
        }

        // Parse accumulated tool input when the block stops
        if (chunk.type === 'content_block_stop') {
          const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
          if (lastContent && lastContent.type === 'tool_use' && lastContent._inputBuffer) {
            try {
              lastContent.input = JSON.parse(lastContent._inputBuffer);
              delete lastContent._inputBuffer;
            } catch (e) {
              // Silent fail - invalid JSON
            }
          }
        }
      }

      conversationHistory.push(assistantMessage);

      // If no tools, we're done
      if (!hasToolUse) break;

      // Circuit breaker: Track validation failures
      let failedCount = 0;
      let totalCount = 0;

      // Execute tools and emit events
      const toolResults: any[] = [];
      for (const content of assistantMessage.content) {
        if (content.type === 'tool_use') {
          totalCount++;
          
          // Validate tool call first
          const validation = validateToolCall(content.name, content.input);
          
          if (!validation.valid) {
            failedCount++;
            
            // Emit error event for invalid tool
            this.callbacks.onEvent?.({
              type: 'tool_error',
              streamId: 'terminus',
              toolName: content.name,
              error: validation.error || 'Unknown validation error'
            });
            
            // Add error result to conversation
            toolResults.push({
              type: 'tool_result',
              tool_use_id: content.id,
              content: `Error: ${validation.error}`
            });
            continue;
          }

          // Emit tool requested event
          this.callbacks.onEvent?.({
            type: 'tool_requested',
            streamId: 'terminus',
            toolName: content.name,
            input: validation.data
          });

          // Execute tool with validated input
          const result = await handleToolCall({ ...content, input: validation.data });
          
          // Emit tool result event
          this.callbacks.onEvent?.({
            type: 'tool_result',
            streamId: 'terminus',
            toolName: content.name,
            result: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
          });

          toolResults.push(result);
        }
      }

      // Circuit breaker: If ALL tools failed validation, stop the loop
      if (totalCount > 0 && failedCount === totalCount) {
        consecutiveValidationFailures++;
        
        if (consecutiveValidationFailures >= MAX_VALIDATION_FAILURES) {
          this.callbacks.onEvent?.({
            type: 'text_chunk',
            streamId: 'terminus',
            chunk: '\n\n⚠️ Warning: API is sending malformed tool requests. Stopping tool execution.'
          });
        }
        
        break; // Don't send errors back to API
      }

      // Reset counter on successful tool execution
      consecutiveValidationFailures = 0;

      // Add tool results to conversation
      conversationHistory.push({
        role: 'user',
        content: toolResults
      });

      // Truncate conversation history to prevent token explosion
      // Keep: original task + last 4 messages (2 turns)
      if (conversationHistory.length > 5) {
        conversationHistory = [
          conversationHistory[0], // Original user task
          ...conversationHistory.slice(-4) // Last 4 messages
        ];
      }
    }

    return accumulated;
  }

  private async webResearchStream(task: string, prediction: TaskPrediction): Promise<string> {
    let accumulated = '';
    const searches: WebSearch[] = [];

    const stream = claudeClient.streamMessage({
      system: WEB_RESEARCH_PROMPT,
      messages: [{ role: 'user', content: task }],
      enableWebSearch: true,
      max_tokens: 4096
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        accumulated += chunk.delta.text;
        this.callbacks.onStreamUpdate?.('search', chunk.delta.text);
      }

      // Track web searches
      if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'web_search') {
        const search: WebSearch = {
          query: chunk.content_block.query || 'Unknown',
          status: 'searching',
          timestamp: Date.now()
        };
        searches.push(search);
        this.callbacks.onWebSearch?.(search);
      }

      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'web_search_result') {
        if (searches.length > 0) {
          searches[searches.length - 1].status = 'complete';
          searches[searches.length - 1].sources = chunk.delta.sources || [];
          this.callbacks.onWebSearch?.(searches[searches.length - 1]);
        }
      }
    }

    return accumulated;
  }

  private async strategyStream(task: string, prediction: TaskPrediction): Promise<string> {
    let accumulated = '';

    const stream = claudeClient.streamMessage({
      system: STRATEGY_PROMPT,
      messages: [{ role: 'user', content: task }],
      enableWebSearch: false
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        accumulated += chunk.delta.text;
        this.callbacks.onStreamUpdate?.('strategy', chunk.delta.text);
      }
    }

    return accumulated;
  }

  private async environmentStream(task: string, prediction: TaskPrediction): Promise<string> {
    let accumulated = '';
    let conversationHistory: any[] = [{ role: 'user', content: task }];
    let consecutiveValidationFailures = 0;
    const MAX_VALIDATION_FAILURES = 3;
    let isFirstCall = true;

    // Tool loop
    while (consecutiveValidationFailures < MAX_VALIDATION_FAILURES) {
      let assistantMessage: any = { role: 'assistant', content: [] };
      let hasToolUse = false;

      const stream = claudeClient.streamMessage({
        system: isFirstCall ? ENV_OBSERVATION_PROMPT + `\nKey files: ${prediction.keyFiles.join(', ')}` : undefined,
        messages: conversationHistory,
        tools: [listFilesTool, searchFilesTool, grepCodebaseTool, readFileTool, executeCommandTool],
        enableWebSearch: false
      });

      isFirstCall = false;

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          accumulated += chunk.delta.text;
          this.callbacks.onEvent?.({ type: 'text_chunk', streamId: 'environment', chunk: chunk.delta.text });
          this.callbacks.onStreamUpdate?.('environment', chunk.delta.text);
        }

        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'text') {
            assistantMessage.content.push({ type: 'text', text: '' });
          } else if (chunk.content_block?.type === 'tool_use') {
            // Initialize tool_use with empty input and a buffer for accumulating JSON
            assistantMessage.content.push({
              type: 'tool_use',
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              input: {},
              _inputBuffer: ''
            });
            hasToolUse = true;
          }
        }

        if (chunk.type === 'content_block_delta') {
          const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
          if (lastContent && lastContent.type === 'text' && chunk.delta?.text) {
            lastContent.text += chunk.delta.text;
          }
          // Accumulate tool input JSON deltas
          if (lastContent && lastContent.type === 'tool_use') {
            if (chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
              lastContent._inputBuffer = (lastContent._inputBuffer || '') + chunk.delta.partial_json;
            }
          }
        }

        // Parse accumulated tool input when the block stops
        if (chunk.type === 'content_block_stop') {
          const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
          if (lastContent && lastContent.type === 'tool_use' && lastContent._inputBuffer) {
            try {
              lastContent.input = JSON.parse(lastContent._inputBuffer);
              delete lastContent._inputBuffer;
            } catch (e) {
              // Silent fail - invalid JSON
            }
          }
        }
      }

      conversationHistory.push(assistantMessage);
      if (!hasToolUse) break;

      // Circuit breaker: Track validation failures
      let failedCount = 0;
      let totalCount = 0;

      // Execute tools
      const toolResults: any[] = [];
      for (const content of assistantMessage.content) {
        if (content.type === 'tool_use') {
          totalCount++;
          
          // Validate tool call first
          const validation = validateToolCall(content.name, content.input);
          
          if (!validation.valid) {
            failedCount++;
            
            // Emit error event for invalid tool
            this.callbacks.onEvent?.({
              type: 'tool_error',
              streamId: 'environment',
              toolName: content.name,
              error: validation.error || 'Unknown validation error'
            });
            
            // Add error result to conversation
            toolResults.push({
              type: 'tool_result',
              tool_use_id: content.id,
              content: `Error: ${validation.error}`
            });
            continue;
          }

          this.callbacks.onEvent?.({
            type: 'tool_requested',
            streamId: 'environment',
            toolName: content.name,
            input: validation.data
          });

          const result = await handleToolCall({ ...content, input: validation.data });
          
          this.callbacks.onEvent?.({
            type: 'tool_result',
            streamId: 'environment',
            toolName: content.name,
            result: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
          });

          toolResults.push(result);
        }
      }

      // Circuit breaker: If ALL tools failed validation, stop the loop
      if (totalCount > 0 && failedCount === totalCount) {
        consecutiveValidationFailures++;
        
        if (consecutiveValidationFailures >= MAX_VALIDATION_FAILURES) {
          this.callbacks.onEvent?.({
            type: 'text_chunk',
            streamId: 'environment',
            chunk: '\n\n⚠️ Warning: API is sending malformed tool requests. Stopping tool execution.'
          });
        }
        
        break; // Don't send errors back to API
      }

      // Reset counter on successful tool execution
      consecutiveValidationFailures = 0;

      conversationHistory.push({ role: 'user', content: toolResults });

      // Truncate conversation history to prevent token explosion
      // Keep: original task + last 4 messages (2 turns)
      if (conversationHistory.length > 5) {
        conversationHistory = [
          conversationHistory[0], // Original user task
          ...conversationHistory.slice(-4) // Last 4 messages
        ];
      }
    }

    return accumulated;
  }

  private async explorationStream(task: string, prediction: TaskPrediction): Promise<string> {
    let accumulated = '';

    const stream = claudeClient.streamMessage({
      system: EXPLORATION_PROMPT,
      messages: [{ role: 'user', content: task }],
      tools: [dockerExecuteTool],
      enableWebSearch: false
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        accumulated += chunk.delta.text;
        this.callbacks.onStreamUpdate?.('exploration', chunk.delta.text);
      }

      if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
        const toolUse = chunk.content_block as ToolUse;
        this.callbacks.onToolCall?.(toolUse.name, toolUse.input);
      }
    }

    return accumulated;
  }

  private async synthesisPhase(task: string, intelligence: IntelligenceResult): Promise<string> {
    let accumulated = '';

    const cachedContext = [
      { type: 'text', text: SYNTHESIS_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `# Terminus Results\n${intelligence.terminus}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `# Web Research\n${intelligence.webResearch}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `# Strategy\n${intelligence.strategy}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `# Environment\n${intelligence.environment}`, cache_control: { type: 'ephemeral' } }
    ];

    const stream = claudeClient.streamMessage({
      system: cachedContext,
      messages: [{ role: 'user', content: `Task: ${task}\n\nSynthesize the optimal execution approach.` }],
      enableWebSearch: false,
      max_tokens: 4096
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        accumulated += chunk.delta.text;
        this.callbacks.onStreamUpdate?.('synthesis', chunk.delta.text);
      }
    }

    return accumulated;
  }

  private async executionPhase(task: string, synthesis: string): Promise<string> {
    let accumulated = '';
    let conversationHistory: any[] = [
      { role: 'user', content: `${task}\n\n# Execution Context\n${synthesis}` }
    ];
    let isFirstCall = true;

    while (true) {
      const stream = claudeClient.streamMessage({
        system: isFirstCall ? EXECUTION_PROMPT : undefined,
        messages: conversationHistory,
        tools: [listFilesTool, searchFilesTool, grepCodebaseTool, readFileTool, writeFileTool, executeCommandTool, dockerExecuteTool],
        enableWebSearch: true,
        max_tokens: 8192
      });

      isFirstCall = false;

      let assistantMessage: any = { role: 'assistant', content: [] };
      let needsContinuation = false;

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'text') {
            assistantMessage.content.push({ type: 'text', text: '' });
          } else if (chunk.content_block?.type === 'tool_use') {
            assistantMessage.content.push(chunk.content_block);
            this.callbacks.onToolCall?.(chunk.content_block.name, chunk.content_block.input);
          }
        }

        if (chunk.type === 'content_block_delta') {
          if (chunk.delta?.text) {
            const lastContent = assistantMessage.content[assistantMessage.content.length - 1];
            if (lastContent && lastContent.type === 'text') {
              lastContent.text += chunk.delta.text;
            }
            accumulated += chunk.delta.text;
            this.callbacks.onStreamUpdate?.('execution', chunk.delta.text);
          }
        }

        if (chunk.type === 'message_stop') {
          const stopReason = chunk.message?.stop_reason;
          if (stopReason === 'tool_use') {
            needsContinuation = true;
          }
        }
      }

      conversationHistory.push(assistantMessage);

      // Execute tools if needed
      if (needsContinuation) {
        const toolResults: any[] = [];
        
        for (const content of assistantMessage.content) {
          if (content.type === 'tool_use') {
            // Validate tool call first
            const validation = validateToolCall(content.name, content.input);
            
            if (!validation.valid) {
              // Add error result to conversation
              toolResults.push({
                type: 'tool_result',
                tool_use_id: content.id,
                content: `Error: ${validation.error}`
              });
              continue;
            }

            const result = await handleToolCall({ ...content, input: validation.data });
            toolResults.push(result);
          }
        }

        conversationHistory.push({
          role: 'user',
          content: toolResults
        });

        // Truncate conversation history to prevent token explosion
        // Keep: original task + synthesis context + last 4 messages
        if (conversationHistory.length > 6) {
          conversationHistory = [
            conversationHistory[0], // Original user task
            conversationHistory[1], // Synthesis context
            ...conversationHistory.slice(-4) // Last 4 messages
          ];
        }
      } else {
        break;
      }
    }

    return accumulated;
  }
}

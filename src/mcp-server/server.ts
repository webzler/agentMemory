#!/usr/bin/env node

import { StorageManager } from './storage';
import { CacheManager } from './cache';
import { MCPTools } from './tools';
import { SocketBridge } from './socket-bridge';
import { MemoryBankSync } from './memory-bank-sync';
import { AgentConfig } from './agent-config';
import { StandaloneDashboard } from '../standalone-dashboard';

interface MCPRequest {
    jsonrpc: string;
    id?: string | number;
    method: string;
    params?: any;
}

interface MCPResponse {
    jsonrpc: string;
    id?: string | number;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Parse CLI arguments.
 * Supported:
 *   node server.js <projectId> <workspacePath> [--agents=kilocode,opencode]
 */
function parseArgs(): { projectId: string; workspacePath: string; agentsArg?: string } {
    const args = process.argv.slice(2);
    let projectId = 'default-project';
    let workspacePath = process.cwd();
    let agentsArg: string | undefined;

    for (const arg of args) {
        if (arg.startsWith('--agents=')) {
            agentsArg = arg.split('=')[1];
        } else if (arg.startsWith('--agents')) {
            // Handle --agents val (next arg) could be done but keep simple
            const eqIdx = arg.indexOf('=');
            if (eqIdx !== -1) {
                agentsArg = arg.substring(eqIdx + 1);
            }
        } else if (!projectId || projectId === 'default-project') {
            // First positional = projectId
            if (projectId === 'default-project' && arg !== workspacePath) {
                projectId = arg;
            }
        } else {
            // Second positional = workspacePath
            workspacePath = arg;
        }
    }

    // More robust positional parsing
    const positional = args.filter(a => !a.startsWith('--'));
    if (positional.length >= 1) projectId = positional[0];
    if (positional.length >= 2) workspacePath = positional[1];

    return { projectId, workspacePath, agentsArg };
}

/**
 * Simple MCP Server using stdio transport
 * This server implements the Model Context Protocol for memory tools
 */
class MCPServer {
    private storage: StorageManager;
    private cache: CacheManager;
    private tools: MCPTools;
    private projectId: string;
    private syncEngine: MemoryBankSync;
    private workspacePath: string;

    constructor(projectId: string, workspacePath: string) {
        this.projectId = projectId;
        this.workspacePath = workspacePath;

        // Use absolute path based on workspace
        const storagePath = workspacePath + '/.agentMemory';
        this.storage = new StorageManager(storagePath);

        this.cache = new CacheManager({
            maxSize: 10000,
            ttl: 3600000 // 1 hour
        });

        // Initialize sync engine
        this.syncEngine = new MemoryBankSync(workspacePath);
        this.tools = new MCPTools(this.storage, this.cache, this.syncEngine, workspacePath);

        console.error(`[MCP Server] Initialized for project: ${projectId}`);
        console.error(`[MCP Server] Workspace path: ${workspacePath}`);
        console.error(`[MCP Server] Storage path: ${storagePath}`);
    }

    /**
     * Public accessor for the tools instance (used for initialization with agents arg)
     */
    public getTools(): MCPTools {
        return this.tools;
    }

    /**
     * Handle incoming MCP request (public for socket bridge)
     */
    public async handleRequest(request: MCPRequest): Promise<MCPResponse | null> {
        const { method, params, id } = request;

        // JSON-RPC: If no ID, this is a notification - don't send a response
        if (id === undefined || id === null) {
            console.error(`[MCP Server] Received notification (no response needed): ${method}`);
            return null;
        }

        try {
            switch (method) {
                case 'tools/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            tools: MCPTools.listTools()
                        }
                    };

                case 'tools/call': {
                    const { name, arguments: args } = params;

                    // Add projectId to arguments
                    const toolArgs = { ...args, projectId: this.projectId };

                    // Call the appropriate tool
                    let result;
                    switch (name) {
                        case 'memory_write':
                            result = await this.tools.memory_write(toolArgs);
                            break;
                        case 'memory_read':
                            result = await this.tools.memory_read(toolArgs);
                            break;
                        case 'memory_search':
                            result = await this.tools.memory_search(toolArgs);
                            break;
                        case 'memory_list':
                            result = await this.tools.memory_list(toolArgs);
                            break;
                        case 'memory_update':
                            result = await this.tools.memory_update(toolArgs);
                            break;
                        case 'project_init':
                            result = await this.tools.project_init(toolArgs);
                            break;
                        case 'configure_agents':
                            result = await this.tools.configure_agents(toolArgs);
                            break;
                        case 'memory_stats':
                            result = await this.tools.memory_stats(toolArgs);
                            break;
                        default:
                            throw new Error(`Unknown tool: ${name}`);
                    }

                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }
                            ]
                        }
                    };
                }

                case 'initialize':
                    // Initialize the project
                    await this.tools.project_init({ projectId: this.projectId });
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {}
                            },
                            serverInfo: {
                                name: 'agentMemory-mcp-server',
                                version: '0.1.0'
                            }
                        }
                    };

                case 'ping':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {}
                    };

                default:
                    throw new Error(`Unknown method: ${method}`);
            }
        } catch (error: any) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: error.message,
                    data: error.stack
                }
            };
        }
    }

    /**
     * Start the server with stdio transport
     */
    start() {
        console.error('[MCP Server] Starting stdio transport...');

        let buffer = '';

        process.stdin.on('data', async (chunk) => {
            buffer += chunk.toString();

            // Process complete JSON-RPC messages (newline-delimited)
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const request = JSON.parse(line) as MCPRequest;
                    console.error(`[MCP Server] Received: ${request.method}`);

                    const response = await this.handleRequest(request);

                    // Only send response if not null (notifications don't get responses)
                    if (response !== null) {
                        process.stdout.write(JSON.stringify(response) + '\n');
                    }
                } catch (error: any) {
                    console.error(`[MCP Server] Error processing message:`, error);

                    // Send error response
                    const errorResponse: MCPResponse = {
                        jsonrpc: '2.0',
                        error: {
                            code: -32700,
                            message: 'Parse error',
                            data: error.message
                        }
                    };
                    process.stdout.write(JSON.stringify(errorResponse) + '\n');
                }
            }
        });

        process.stdin.on('end', () => {
            console.error('[MCP Server] stdin closed, shutting down...');
            process.exit(0);
        });

        console.error('[MCP Server] Ready and listening on stdio');
    }
}

// Main entry point
const { projectId, workspacePath, agentsArg } = parseArgs();

const server = new MCPServer(projectId, workspacePath);

// If --agents was passed, write to config immediately before starting
if (agentsArg) {
    const agentConfig = new AgentConfig(workspacePath);
    if (!agentConfig.exists()) {
        server.getTools().configure_agents({ projectId, agents: agentsArg }).then(() => {
            console.error(`[MCP Server] Pre-configured agents from CLI: ${agentsArg}`);
        }).catch(err => {
            console.error(`[MCP Server] Failed to pre-configure agents: ${err}`);
        });
    }
}

server.start();

// Also start Unix socket bridge for KiloCode
const socketBridge = new SocketBridge(projectId);
socketBridge.start((req) => server.handleRequest(req));

// Start Dashboard
const dashboard = new StandaloneDashboard(workspacePath);
dashboard.start();

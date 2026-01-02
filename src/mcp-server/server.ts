#!/usr/bin/env node

import { StorageManager } from './storage';
import { CacheManager } from './cache';
import { MCPTools } from './tools';
import { SocketBridge } from './socket-bridge';
import { MemoryBankSync } from './memory-bank-sync';

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
 * Simple MCP Server using stdio transport
 * This server implements the Model Context Protocol for memory tools
 */
class MCPServer {
    private storage: StorageManager;
    private cache: CacheManager;
    private tools: MCPTools;
    private projectId: string;
    private syncEngine: MemoryBankSync;

    constructor(projectId: string, workspacePath: string) {
        this.projectId = projectId;

        // Use absolute path based on workspace
        const storagePath = workspacePath + '/.agentMemory';
        this.storage = new StorageManager(storagePath);

        this.cache = new CacheManager({
            maxSize: 10000,
            ttl: 3600000 // 1 hour
        });

        // Initialize sync engine
        this.syncEngine = new MemoryBankSync(workspacePath);
        this.tools = new MCPTools(this.storage, this.cache, this.syncEngine);

        console.error(`[MCP Server] Initialized for project: ${projectId}`);
        console.error(`[MCP Server] Workspace path: ${workspacePath}`);
        console.error(`[MCP Server] Storage path: ${storagePath}`);
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
const projectId = process.argv[2] || 'default-project';
const workspacePath = process.argv[3] || process.cwd();

const server = new MCPServer(projectId, workspacePath);
server.start();

// Also start Unix socket bridge for KiloCode
const socketBridge = new SocketBridge(projectId);
socketBridge.start((req) => server.handleRequest(req));

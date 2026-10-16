#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { MemoryStore } from './memory-store';
import { MCPTools, ToolInputError } from './tools';
import { SocketBridge } from './socket-bridge';
import { resolveWorkspace, ResolvedWorkspace, WorkspaceHints } from './workspace';

export interface MCPRequest {
    jsonrpc: string;
    id?: string | number | null;
    method: string;
    params?: any;
}

export interface MCPResponse {
    jsonrpc: string;
    id?: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

interface ServerOptions {
    /** Default `createdBy` for memory_write, e.g. "cline". */
    agentName?: string;
    /** Called once a workspace has been resolved (and again if it changes). */
    onWorkspace?: (workspace: ResolvedWorkspace) => void;
}

interface WorkspaceContext {
    workspace: ResolvedWorkspace;
    tools: MCPTools;
}

const SERVER_VERSION = readPackageVersion();

/**
 * Simple MCP Server using stdio transport
 * This server implements the Model Context Protocol for memory tools
 */
export class MCPServer {
    private context?: WorkspaceContext;
    private resolving?: Promise<WorkspaceContext>;

    constructor(private hints: WorkspaceHints, private options: ServerOptions = {}) { }

    /**
     * Handle incoming MCP request (public for socket bridge)
     */
    public async handleRequest(request: MCPRequest): Promise<MCPResponse | null> {
        const { method, params, id } = request;

        // JSON-RPC: If no ID, this is a notification - don't send a response
        if (id === undefined || id === null) {
            return null;
        }

        try {
            switch (method) {
                case 'initialize':
                    this.warmUp();
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
                                version: SERVER_VERSION
                            }
                        }
                    };

                case 'tools/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            tools: MCPTools.listTools()
                        }
                    };

                case 'tools/call': {
                    const { name, arguments: args } = params ?? {};
                    const { tools } = await this.getContext();
                    const result = await tools.call(name, args ?? {});

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

                case 'ping':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {}
                    };

                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Unknown method: ${method}` }
                    };
            }
        } catch (error: any) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: error instanceof ToolInputError ? -32602 : -32603,
                    message: error.message,
                    data: error instanceof ToolInputError ? undefined : error.stack
                }
            };
        }
    }

    /**
     * The workspace is resolved on first use rather than at startup: an agent
     * may start this server before the agentMemory extension in the same
     * window has registered its workspace. A guess from the cwd is re-checked
     * on every call.
     */
    private getContext(): Promise<WorkspaceContext> {
        if (this.context && this.context.workspace.source !== 'cwd') {
            return Promise.resolve(this.context);
        }
        if (!this.resolving) {
            this.resolving = this.resolveContext().finally(() => {
                this.resolving = undefined;
            });
        }
        return this.resolving;
    }

    private async resolveContext(): Promise<WorkspaceContext> {
        const workspace = await resolveWorkspace(this.hints);
        if (!workspace) {
            throw new Error(
                'agentMemory could not tell which project this MCP server belongs to. ' +
                'Open the project in VS Code with the agentMemory extension enabled, ' +
                'or start the server with --workspace <path>.'
            );
        }

        if (this.context && this.context.workspace.path === workspace.path) {
            this.context.workspace = workspace;
            return this.context;
        }

        const store = new MemoryStore(workspace.path);
        const tools = new MCPTools(store, {
            projectId: path.basename(workspace.path),
            defaultCreatedBy: this.options.agentName
        });
        this.context = { workspace, tools };
        console.error(`[MCP Server] Workspace: ${workspace.path} (from ${workspace.source})`);
        this.options.onWorkspace?.(workspace);
        return this.context;
    }

    /** Create storage and run the legacy migration early, unless the workspace is only a guess. */
    private warmUp(): void {
        resolveWorkspace(this.hints)
            .then(workspace => {
                if (!workspace || workspace.source === 'cwd') return;
                return this.getContext().then(({ tools }) => tools.project_init({}));
            })
            .catch(error => console.error(`[MCP Server] Startup initialization failed: ${error.message}`));
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

                let request: MCPRequest;
                try {
                    request = JSON.parse(line) as MCPRequest;
                } catch (error: any) {
                    console.error(`[MCP Server] Error parsing message:`, error);
                    const errorResponse: MCPResponse = {
                        jsonrpc: '2.0',
                        id: null,
                        error: {
                            code: -32700,
                            message: 'Parse error',
                            data: error.message
                        }
                    };
                    process.stdout.write(JSON.stringify(errorResponse) + '\n');
                    continue;
                }

                console.error(`[MCP Server] Received: ${request.method}`);
                const response = await this.handleRequest(request);

                // Only send response if not null (notifications don't get responses)
                if (response !== null) {
                    process.stdout.write(JSON.stringify(response) + '\n');
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

/**
 * Command line:
 *   server.js --workspace <path>       serve one project (the extension's own server)
 *   server.js --hosts-dir <dir>        find the project via the extension host registry (agent configs)
 *   server.js <projectId> <workspace>  legacy form, still accepted
 * AGENTMEMORY_WORKSPACE and AGENTMEMORY_AGENT can be set in the environment instead.
 */
export function parseCommandLine(argv: string[], env: NodeJS.ProcessEnv = process.env): {
    hints: WorkspaceHints;
    agentName?: string;
} {
    let workspace: string | undefined;
    let hostsDir: string | undefined;
    let agentName: string | undefined;
    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--workspace') workspace = argv[++i];
        else if (arg === '--hosts-dir') hostsDir = argv[++i];
        else if (arg === '--agent') agentName = argv[++i];
        else positional.push(arg);
    }

    return {
        hints: {
            explicit: workspace || positional[1] || env.AGENTMEMORY_WORKSPACE || undefined,
            hostsDir,
            parentPid: process.ppid,
            cwd: process.cwd()
        },
        agentName: agentName || env.AGENTMEMORY_AGENT || undefined
    };
}

function readPackageVersion(): string {
    try {
        const packageJson = path.join(__dirname, '..', '..', 'package.json');
        return JSON.parse(fs.readFileSync(packageJson, 'utf8')).version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

function main(): void {
    const { hints, agentName } = parseCommandLine(process.argv.slice(2));

    // Unix socket bridge for clients that connect over a socket (not on Windows)
    let socketBridge: SocketBridge | undefined;

    const server = new MCPServer(hints, {
        agentName,
        onWorkspace: workspace => {
            if (socketBridge || workspace.source === 'cwd' || !SocketBridge.isSupported()) return;
            socketBridge = new SocketBridge(workspace.path);
            socketBridge.start(request => server.handleRequest(request))
                .catch(error => console.error(`[Socket Bridge] Failed to start: ${error.message}`));
        }
    });
    server.start();
}

if (require.main === module) {
    main();
}

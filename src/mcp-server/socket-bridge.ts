import * as net from 'net';
import * as fs from 'fs';

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
 * Unix Socket Server - bridges mezi KiloCode and stdio MCP server
 * This allows KiloCode to connect via socket while our server uses stdio
 */
export class SocketBridge {
    private socketPath: string;
    private server: net.Server | null = null;

    constructor(projectId: string) {
        this.socketPath = `/tmp/mcp-memory-${projectId}.sock`;
    }

    start(handleRequest: (req: MCPRequest) => Promise<MCPResponse | null>) {
        // Remove existing socket if it exists
        if (fs.existsSync(this.socketPath)) {
            fs.unlinkSync(this.socketPath);
        }

        this.server = net.createServer((socket) => {
            console.error(`[Socket Bridge] Client connected`);

            let buffer = '';

            socket.on('data', async (chunk: Buffer) => {
                buffer += chunk.toString();

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const request = JSON.parse(line) as MCPRequest;
                        console.error(`[Socket Bridge] ${request.method}`);

                        const response = await handleRequest(request);
                        socket.write(JSON.stringify(response) + '\n');
                    } catch (error: any) {
                        console.error(`[Socket Bridge] Error:`, error);
                        socket.write(JSON.stringify({
                            jsonrpc: '2.0',
                            error: { code: -32700, message: 'Parse error', data: error.message }
                        }) + '\n');
                    }
                }
            });

            socket.on('end', () => {
                console.error(`[Socket Bridge] Client disconnected`);
            });

            socket.on('error', (err) => {
                console.error(`[Socket Bridge] Socket error:`, err);
            });
        });

        this.server.listen(this.socketPath, () => {
            console.error(`[Socket Bridge] Listening at ${this.socketPath}`);
        });

        this.server.on('error', (err) => {
            console.error(`[Socket Bridge] Server error:`, err);
        });

        // Cleanup on exit
        process.on('exit', () => {
            this.cleanup();
        });

        process.on('SIGINT', () => {
            this.cleanup();
            process.exit(0);
        });
    }

    private cleanup() {
        if (fs.existsSync(this.socketPath)) {
            fs.unlinkSync(this.socketPath);
        }
    }
}

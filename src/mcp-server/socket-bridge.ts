import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import type { MCPRequest, MCPResponse } from './server';

/**
 * Unix Socket Server - bridges KiloCode and the stdio MCP server
 * This allows KiloCode to connect via socket while our server uses stdio
 *
 * One socket per workspace (named after a hash of its full path). Several
 * server processes may serve the same workspace; the first one to bind the
 * socket keeps it and the others leave it alone.
 */
export class SocketBridge {
    readonly socketPath: string;
    private server: net.Server | null = null;
    private listening = false;

    constructor(workspacePath: string) {
        this.socketPath = SocketBridge.socketPathFor(workspacePath);
    }

    /** Named pipes on Windows work differently; the bridge is Unix-only. */
    static isSupported(): boolean {
        return process.platform !== 'win32';
    }

    static socketPathFor(workspacePath: string): string {
        const hash = crypto.createHash('sha256').update(path.resolve(workspacePath)).digest('hex').slice(0, 16);
        return path.join(os.tmpdir(), `agentmemory-${hash}.sock`);
    }

    async start(handleRequest: (req: MCPRequest) => Promise<MCPResponse | null>): Promise<void> {
        if (!SocketBridge.isSupported()) return;

        if (await this.isServedElsewhere()) {
            console.error(`[Socket Bridge] ${this.socketPath} is already served by another process`);
            return;
        }
        // Left behind by a process that died; nobody is listening on it.
        fs.rmSync(this.socketPath, { force: true });

        this.server = net.createServer((socket) => {
            console.error(`[Socket Bridge] Client connected`);

            let buffer = '';

            socket.on('data', async (chunk: Buffer) => {
                buffer += chunk.toString();

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;

                    let request: MCPRequest;
                    try {
                        request = JSON.parse(line) as MCPRequest;
                    } catch (error: any) {
                        console.error(`[Socket Bridge] Error:`, error);
                        socket.write(JSON.stringify({
                            jsonrpc: '2.0',
                            id: null,
                            error: { code: -32700, message: 'Parse error', data: error.message }
                        }) + '\n');
                        continue;
                    }

                    console.error(`[Socket Bridge] ${request.method}`);
                    const response = await handleRequest(request);
                    // Notifications get no response
                    if (response !== null) {
                        socket.write(JSON.stringify(response) + '\n');
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

        this.server.on('error', (err) => {
            console.error(`[Socket Bridge] Server error:`, err);
        });

        this.server.listen(this.socketPath, () => {
            this.listening = true;
            console.error(`[Socket Bridge] Listening at ${this.socketPath}`);
        });

        // Cleanup on exit
        process.on('exit', () => this.cleanup());
        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.once(signal, () => {
                this.cleanup();
                process.exit(0);
            });
        }
    }

    private isServedElsewhere(): Promise<boolean> {
        return new Promise(resolve => {
            const probe = net.connect(this.socketPath);
            probe.once('connect', () => {
                probe.destroy();
                resolve(true);
            });
            probe.once('error', () => resolve(false));
        });
    }

    private cleanup() {
        if (!this.listening) return;
        this.listening = false;
        this.server?.close();
        fs.rmSync(this.socketPath, { force: true });
    }
}

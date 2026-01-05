import { ChildProcess } from 'child_process';

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

/**
 * MCP Client for communicating with the MCP server process
 * Handles JSON-RPC communication via stdio
 */
export class MCPClient {
    private mcpProcess: ChildProcess;
    private requestId = 0;
    private pendingRequests = new Map<number, PendingRequest>();
    private buffer = '';

    constructor(mcpProcess: ChildProcess) {
        this.mcpProcess = mcpProcess;
        this.setupStdioHandlers();
    }

    /**
     * Call an MCP tool on the server
     * @param toolName - Name of the MCP tool to call
     * @param params - Parameters to pass to the tool
     * @returns Promise resolving to the tool result
     */
    async call(toolName: string, params: any): Promise<any> {
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: params
            },
            id
        };

        return new Promise((resolve, reject) => {
            // Store pending request
            this.pendingRequests.set(id, { resolve, reject });

            // Send request to MCP server
            try {
                this.mcpProcess.stdin?.write(JSON.stringify(request) + '\n');
            } catch (error: any) {
                this.pendingRequests.delete(id);
                reject(new Error(`Failed to write to MCP server: ${error.message}`));
                return;
            }

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP request timeout for tool: ${toolName}`));
                }
            }, 10000);
        });
    }

    /**
     * Ping the MCP server to check if it's alive
     */
    async ping(): Promise<boolean> {
        try {
            const id = ++this.requestId;
            const request = {
                jsonrpc: '2.0',
                method: 'ping',
                id
            };

            return new Promise((resolve, reject) => {
                this.pendingRequests.set(id, {
                    resolve: () => resolve(true),
                    reject: () => resolve(false)
                });

                this.mcpProcess.stdin?.write(JSON.stringify(request) + '\n');

                setTimeout(() => {
                    if (this.pendingRequests.has(id)) {
                        this.pendingRequests.delete(id);
                        resolve(false);
                    }
                }, 2000);
            });
        } catch {
            return false;
        }
    }

    /**
     * Set up stdout/stderr handlers for the MCP server process
     */
    private setupStdioHandlers(): void {
        // Handle stdout (JSON-RPC responses)
        this.mcpProcess.stdout?.on('data', (chunk) => {
            this.buffer += chunk.toString();

            // Process complete JSON-RPC messages (newline-delimited)
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const response = JSON.parse(line);
                    this.handleResponse(response);
                } catch (error) {
                    console.error('[MCPClient] Failed to parse response:', line, error);
                }
            }
        });

        // Handle stderr (server logs)
        this.mcpProcess.stderr?.on('data', (chunk) => {
            const message = chunk.toString().trim();
            if (message) {
                console.log(`[MCP Server] ${message}`);
            }
        });

        // Handle process errors
        this.mcpProcess.on('error', (error) => {
            console.error('[MCPClient] MCP server process error:', error);
            this.rejectAllPending(new Error(`MCP server error: ${error.message}`));
        });

        // Handle process exit
        this.mcpProcess.on('exit', (code) => {
            console.error(`[MCPClient] MCP server exited with code ${code}`);
            this.rejectAllPending(new Error(`MCP server exited with code ${code}`));
        });
    }

    /**
     * Handle a JSON-RPC response from the server
     */
    private handleResponse(response: any): void {
        const { id, result, error } = response;

        const pending = this.pendingRequests.get(id);
        if (!pending) {
            console.warn('[MCPClient] Received response for unknown request ID:', id);
            return;
        }

        this.pendingRequests.delete(id);

        if (error) {
            pending.reject(new Error(error.message || 'MCP server error'));
            return;
        }

        // Extract text content from MCP response format
        // MCP tools return { content: [{ type: 'text', text: '...' }] }
        if (result?.content && Array.isArray(result.content)) {
            const textContent = result.content.find((c: any) => c.type === 'text');
            if (textContent?.text) {
                try {
                    // Parse the text content (it's JSON-encoded)
                    const parsed = JSON.parse(textContent.text);
                    pending.resolve(parsed);
                    return;
                } catch {
                    // If not valid JSON, return as-is
                    pending.resolve(textContent.text);
                    return;
                }
            }
        }

        // Fallback: return result as-is
        pending.resolve(result);
    }

    /**
     * Reject all pending requests (used on server error/exit)
     */
    private rejectAllPending(error: Error): void {
        for (const [id, pending] of this.pendingRequests.entries()) {
            pending.reject(error);
            this.pendingRequests.delete(id);
        }
    }
}

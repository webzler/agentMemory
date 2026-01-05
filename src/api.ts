/**
 * Public API for agentMemory extension
 * Allows other VS Code extensions to integrate with the memory bank
 * 
 * SECURITY: Extensions can only access their own memories by default.
 * Cross-extension access requires explicit user permission.
 */

import { SecurityManager } from './security';
import { MCPClient } from './mcp-client';
import { RateLimiter } from './rate-limiter';

export interface MemoryOptions {
    type: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision';
    tags?: string[];
    relationships?: {
        dependsOn?: string[];
        implements?: string[];
    };
    metadata?: {
        createdBy?: string;
        [key: string]: any;
    };
}

export interface Memory {
    id: string;
    projectId: string;
    key: string;
    type: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision';
    content: string;
    tags: string[];
    relationships: {
        dependsOn: string[];
        implements: string[];
    };
    metadata: {
        accessCount: number;
        createdBy: string;
        [key: string]: any;
    };
    createdAt: number;
    updatedAt: number;
}

export interface SearchOptions {
    query?: string;
    tags?: string[];
    type?: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision';
    limit?: number;
    onlyOwn?: boolean; // Only return memories created by this extension
}

export interface MemoryEvent {
    action: 'write' | 'read' | 'update' | 'delete';
    key: string;
    agent: string;
    timestamp: number;
}

export type MemoryEventCallback = (event: MemoryEvent) => void;

/**
 * agentMemory Extension API
 * 
 * @example
 * ```typescript
 * import * as vscode from 'vscode';
 * 
 * const agentMemory = vscode.extensions.getExtension('your-publisher.agentmemory');
 * if (agentMemory) {
 *     const api = agentMemory.exports as MemoryAPI;
 *     
 *     // Write a memory
 *     await api.write('my-feature-key', 'Feature description...', {
 *         type: 'feature',
 *         tags: ['api', 'backend']
 *     });
 *     
 *     // Read a memory
 *     const memory = await api.read('my-feature-key');
 *     console.log(memory?.content);
 *     
 *     // Search memories
 *     const results = await api.search({ query: 'api', limit: 5 });
 * }
 * ```
 */
export class MemoryAPI {
    private eventListeners: Set<MemoryEventCallback> = new Set();
    private rateLimiter: RateLimiter;

    constructor(
        private extensionId: string,
        private projectId: string,
        private securityManager: SecurityManager,
        private mcpClient: MCPClient | null  // MCP client for server communication
    ) {
        // Initialize rate limiter: 100 requests per minute
        this.rateLimiter = new RateLimiter({
            maxRequests: 100,
            windowMs: 60000
        });
    }

    /**
     * Write a new memory to the memory bank
     * 
     * @param key - Unique identifier for the memory
     * @param content - Memory content (supports Markdown)
     * @param options - Memory options (type, tags, relationships)
     * @returns Promise resolving to the memory ID
     */
    async write(key: string, content: string, options: MemoryOptions): Promise<string> {
        // Check rate limit
        this.checkRateLimit();

        const createdBy = options.metadata?.createdBy || this.extensionId;

        // Security check: Can this extension write?
        const permission = await this.securityManager.checkPermission(
            this.extensionId,
            'write',
            key,
            createdBy
        );

        if (!permission.allowed) {
            throw new Error(`Permission denied: ${permission.reason}`);
        }

        const params = {
            projectId: this.projectId,
            key,
            content,
            type: options.type,
            tags: options.tags || [],
            relationships: options.relationships || { dependsOn: [], implements: [] },
            createdBy
        };

        // Call MCP server's memory_write tool
        const result = await this.callMCPTool('memory_write', params);

        // Emit event
        this.emitEvent({
            action: 'write',
            key,
            agent: createdBy,
            timestamp: Date.now()
        });

        return result.id;
    }

    /**
     * Read a memory by key
     * 
     * @param key - Memory key to read
     * @returns Promise resolving to the memory, or null if not found
     */
    async read(key: string): Promise<Memory | null> {
        // Check rate limit
        this.checkRateLimit();

        const params = {
            projectId: this.projectId,
            key
        };

        const result = await this.callMCPTool('memory_read', params) as Memory | null;

        if (result) {
            // Security check: Can this extension read this memory?
            const permission = await this.securityManager.checkPermission(
                this.extensionId,
                'read',
                key,
                result.metadata.createdBy
            );

            if (!permission.allowed) {
                throw new Error(`Permission denied: ${permission.reason}`);
            }

            // Emit event
            this.emitEvent({
                action: 'read',
                key,
                agent: this.extensionId,
                timestamp: Date.now()
            });
        }

        return result;
    }

    /**
     * Search memories by query, tags, or type
     * 
     * @param options - Search options
     * @returns Promise resolving to array of matching memories
     */
    async search(options: SearchOptions = {}): Promise<Memory[]> {
        // Check rate limit
        this.checkRateLimit();

        const params = {
            projectId: this.projectId,
            query: options.query,
            tags: options.tags,
            type: options.type,
            limit: options.limit || 10
        };

        const results = await this.callMCPTool('memory_search', params) as Memory[];

        // Security filter: Only return memories this extension can access
        const filteredResults: Memory[] = [];
        for (const memory of results) {
            // If onlyOwn flag is set, only include own memories
            if (options.onlyOwn && memory.metadata.createdBy !== this.extensionId) {
                continue;
            }

            const permission = await this.securityManager.checkPermission(
                this.extensionId,
                'read',
                memory.key,
                memory.metadata.createdBy
            );

            if (permission.allowed) {
                filteredResults.push(memory);
            }
        }

        return filteredResults;
    }

    /**
     * List all memories, optionally filtered by type
     * 
     * @param type - Optional memory type filter
     * @returns Promise resolving to array of memories
     */
    async list(type?: string): Promise<Memory[]> {
        const params = {
            projectId: this.projectId,
            type
        };

        return await this.callMCPTool('memory_list', params);
    }

    /**
     * Update an existing memory
     * 
     * @param key - Memory key to update
     * @param updates - Partial updates to apply
     * @returns Promise resolving to updated memory, or null if not found
     */
    async update(key: string, updates: Partial<Pick<Memory, 'content' | 'tags' | 'relationships'>>): Promise<Memory | null> {
        const params = {
            projectId: this.projectId,
            key,
            ...updates
        };

        const result = await this.callMCPTool('memory_update', params);

        if (result.success) {
            // Emit event
            this.emitEvent({
                action: 'update',
                key,
                agent: 'external-plugin',
                timestamp: Date.now()
            });
        }

        return result.memory;
    }

    /**
     * Subscribe to memory events (write, read, update)
     * 
     * @param callback - Function to call when events occur
     * @returns Unsubscribe function
     */
    subscribe(callback: MemoryEventCallback): () => void {
        this.eventListeners.add(callback);

        // Return unsubscribe function
        return () => {
            this.eventListeners.delete(callback);
        };
    }

    /**
     * Get statistics about memory usage
     * 
     * @returns Promise resolving to statistics object
     */
    async getStats(): Promise<any> {
        const params = {
            projectId: this.projectId
        };

        return await this.callMCPTool('memory_stats', params);
    }

    /**
     * Internal: Check rate limit and throw if exceeded
     */
    private checkRateLimit(): void {
        if (!this.rateLimiter.checkLimit(this.extensionId)) {
            const usage = this.rateLimiter.getUsage(this.extensionId);
            const resetInSeconds = Math.ceil(usage.resetIn / 1000);
            throw new Error(
                `Rate limit exceeded for extension '${this.extensionId}'. ` +
                `Limit: ${usage.limit} requests per minute. ` +
                `Current: ${usage.current}/${usage.limit}. ` +
                `Resets in ${resetInSeconds} seconds.`
            );
        }
    }

    /**
     * Internal: Call MCP tool
     */
    private async callMCPTool(toolName: string, params: any): Promise<any> {
        if (!this.mcpClient) {
            throw new Error('MCP client not initialized. Cannot call tools without server connection.');
        }

        try {
            const result = await this.mcpClient.call(toolName, params);
            return result;
        } catch (error: any) {
            console.error(`[MemoryAPI] Error calling ${toolName}:`, error);
            throw new Error(`Failed to call MCP tool ${toolName}: ${error.message}`);
        }
    }

    /**
     * Internal: Emit event to subscribers
     */
    private emitEvent(event: MemoryEvent): void {
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('[MemoryAPI] Error in event listener:', error);
            }
        }
    }
}

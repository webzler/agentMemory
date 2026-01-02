/**
 * Public API for agentMemory extension
 * Allows other VS Code extensions to integrate with the memory bank
 * 
 * SECURITY: Extensions can only access their own memories by default.
 * Cross-extension access requires explicit user permission.
 */

import { SecurityManager } from './security';

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

    constructor(
        private extensionId: string,
        private projectId: string,
        private securityManager: SecurityManager,
        private mcpClient: any // Reference to MCP client/server
    ) { }

    /**
     * Write a new memory to the memory bank
     * 
     * @param key - Unique identifier for the memory
     * @param content - Memory content (supports Markdown)
     * @param options - Memory options (type, tags, relationships)
     * @returns Promise resolving to the memory ID
     */
    async write(key: string, content: string, options: MemoryOptions): Promise<string> {
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
     * Internal: Call MCP tool
     */
    private async callMCPTool(toolName: string, params: any): Promise<any> {
        // This will be implemented to communicate with the MCP server
        // For now, return a placeholder
        console.log(`[MemoryAPI] Calling tool: ${toolName}`, params);

        // TODO: Implement actual MCP communication
        // This could use:
        // 1. Direct function calls to storage layer
        // 2. Message passing to MCP server process
        // 3. HTTP/socket communication

        return null;
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

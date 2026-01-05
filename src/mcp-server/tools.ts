import { StorageManager } from './storage';
import { CacheManager } from './cache';
import { MemoryBankSync } from './memory-bank-sync';
import { v4 as uuidv4 } from 'uuid';
import { MemoryWriteParamsSchema, MemorySearchParamsSchema, MemoryReadParamsSchema, MemoryUpdateParamsSchema } from './schemas';

interface Memory {
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
        sourceFile?: string; // Match MemoryBankSync interface
    };
    createdAt: number;
    updatedAt: number;
}

interface ToolCallParams {
    projectId: string;
    [key: string]: any;
}

export class MCPTools {
    private storage: StorageManager;
    private cache: CacheManager;
    private syncEngine?: MemoryBankSync;

    constructor(storage: StorageManager, cache: CacheManager, syncEngine?: MemoryBankSync) {
        this.storage = storage;
        this.cache = cache;
        this.syncEngine = syncEngine;
    }

    /**
     * Tool 1: memory_write - Store new memory
     */
    async memory_write(params: ToolCallParams): Promise<{ success: boolean; id: string }> {
        const { projectId, key, type, content, tags = [], relationships = { dependsOn: [], implements: [] }, createdBy = 'agent' } = params;

        const memory: Memory = {
            id: uuidv4(),
            projectId,
            key,
            type,
            content,
            tags,
            relationships,
            metadata: {
                accessCount: 0,
                createdBy
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.storage.write(projectId, memory);

        // Update cache
        const cacheKey = `${projectId}:${key}`;
        this.cache.set(cacheKey, memory);

        // Sync to agent markdown files (async, no await)
        if (this.syncEngine) {
            this.syncEngine.exportToAgents(memory).catch(err => {
                console.error('[MCPTools] Failed to sync to markdown:', err);
            });
        }

        return { success: true, id: memory.id };
    }

    /**
     * Tool 2: memory_read - Get exact key (2μs target)
     */
    async memory_read(params: ToolCallParams): Promise<Memory | null> {
        const { projectId, key } = params;
        const cacheKey = `${projectId}:${key}`;

        // Try cache first
        const cached = this.cache.get<Memory>(cacheKey);
        if (cached) {
            return cached;
        }

        // Fallback to storage
        const memory = await this.storage.read(projectId, key);
        if (memory) {
            this.cache.set(cacheKey, memory);
        }

        return memory;
    }

    /**
     * Tool 3: memory_search - Keyword/tag search (100μs target)
     */
    async memory_search(params: ToolCallParams): Promise<Memory[]> {
        const { projectId, query, tags, type, limit = 10 } = params;

        const results = await this.storage.search(projectId, query, tags, type);

        // Sort by relevance (access count and recency)
        results.sort((a, b) => {
            const scoreA = a.metadata.accessCount * 0.5 + (Date.now() - a.updatedAt) * -0.0001;
            const scoreB = b.metadata.accessCount * 0.5 + (Date.now() - b.updatedAt) * -0.0001;
            return scoreB - scoreA;
        });

        return results.slice(0, limit);
    }

    /**
     * Tool 4: memory_list - List by type (50μs target)
     */
    async memory_list(params: ToolCallParams): Promise<Memory[]> {
        const { projectId, type } = params;
        return this.storage.list(projectId, type);
    }

    /**
     * Tool 5: memory_update - Append to existing (200μs target)
     */
    async memory_update(params: ToolCallParams): Promise<{ success: boolean; memory: Memory | null }> {
        const { projectId, key, content, tags, relationships } = params;

        const updates: Partial<Memory> = {};
        if (content !== undefined) updates.content = content;
        if (tags !== undefined) updates.tags = tags;
        if (relationships !== undefined) updates.relationships = relationships;

        const updated = await this.storage.update(projectId, key, updates);

        if (updated) {
            // Update cache
            const cacheKey = `${projectId}:${key}`;
            this.cache.set(cacheKey, updated);
        }

        return { success: !!updated, memory: updated };
    }

    /**
     * Tool 6: project_init - Auto-detect workspace (10μs target)
     */
    async project_init(params: ToolCallParams): Promise<{ success: boolean; projectId: string }> {
        const { projectId } = params;
        await this.storage.initProject(projectId);
        return { success: true, projectId };
    }

    /**
     * Tool 7: memory_stats - Usage analytics (20μs target)
     */
    async memory_stats(params: ToolCallParams): Promise<any> {
        const { projectId } = params;
        const stats = await this.storage.getStats(projectId);
        const cacheStats = this.cache.getStats();

        // Add sync status if available
        const syncStatus = this.syncEngine ? {
            enabled: true,
            agents: ['kilocode', 'cline', 'roocode']
        } : { enabled: false };

        return {
            ...stats,
            cache: cacheStats,
            sync: syncStatus
        };
    }

    /**
     * List all available tools
     */
    static listTools() {
        return [
            {
                name: 'memory_write',
                description: 'Store new memory in the memory bank',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string', description: 'Project identifier' },
                        key: { type: 'string', description: 'Unique memory key' },
                        type: { type: 'string', enum: ['architecture', 'pattern', 'feature', 'api', 'bug', 'decision'] },
                        content: { type: 'string', description: 'Memory content (markdown supported)' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
                        relationships: { type: 'object', description: 'Dependencies and implementations' }
                    },
                    required: ['projectId', 'key', 'type', 'content']
                }
            },
            {
                name: 'memory_read',
                description: 'Read memory by exact key',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        key: { type: 'string' }
                    },
                    required: ['projectId', 'key']
                }
            },
            {
                name: 'memory_search',
                description: 'Search memories by keyword, tags, or type',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        query: { type: 'string', description: 'Search query' },
                        tags: { type: 'array', items: { type: 'string' } },
                        type: { type: 'string', enum: ['architecture', 'pattern', 'feature', 'api', 'bug', 'decision'] },
                        limit: { type: 'number', default: 10 }
                    },
                    required: ['projectId']
                }
            },
            {
                name: 'memory_list',
                description: 'List all memories of a specific type',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        type: { type: 'string', enum: ['architecture', 'pattern', 'feature', 'api', 'bug', 'decision'] }
                    },
                    required: ['projectId']
                }
            },
            {
                name: 'memory_update',
                description: 'Update existing memory',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        key: { type: 'string' },
                        content: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } },
                        relationships: { type: 'object' }
                    },
                    required: ['projectId', 'key']
                }
            },
            {
                name: 'project_init',
                description: 'Initialize project storage',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' }
                    },
                    required: ['projectId']
                }
            },
            {
                name: 'memory_stats',
                description: 'Get storage and cache statistics',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' }
                    },
                    required: ['projectId']
                }
            }
        ];
    }
}

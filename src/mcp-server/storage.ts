import Keyv from 'keyv';
import KeyvFile from 'keyv-file';
import * as path from 'path';
import *  as fs from 'fs/promises';
import { MemorySchema } from './schemas';

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
    };
    createdAt: number;
    updatedAt: number;
}

export class StorageManager {
    private stores: Map<string, Keyv> = new Map();
    private baseDataPath: string;

    constructor(baseDataPath: string = './.agentMemory') {
        this.baseDataPath = baseDataPath;
    }

    /**
     * Get or create a Keyv store for a specific project
     */
    private async getStore(projectId: string): Promise<Keyv> {
        if (!this.stores.has(projectId)) {
            // Use baseDataPath directly without nested projectId folder
            const projectPath = this.baseDataPath;

            // Ensure directory exists
            await fs.mkdir(projectPath, { recursive: true });

            // Create Keyv instance with file-based storage
            const store = new Keyv({
                store: new KeyvFile({
                    filename: path.join(projectPath, 'data.json'),
                    encode: (data) => JSON.stringify(data, null, 2)
                }),
                namespace: projectId
            });

            this.stores.set(projectId, store);
        }

        return this.stores.get(projectId)!;
    }

    /**
     * Initialize project storage
     */
    async initProject(projectId: string): Promise<void> {
        await this.getStore(projectId);
        console.error(`Storage initialized for project: ${projectId}`);
    }

    /**
     * Write a memory to storage
     */
    async write(projectId: string, memory: Memory): Promise<void> {
        // Validate memory object using Zod schema
        try {
            MemorySchema.parse(memory);
        } catch (error: any) {
            const errorMessage = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || error.message;
            throw new Error(`Invalid memory object: ${errorMessage}`);
        }

        const store = await this.getStore(projectId);

        // Update the index
        const indexKey = `_index_${projectId}`;
        const keysData = await store.get(indexKey);
        const keys: string[] = keysData || [];

        if (!keys.includes(memory.key)) {
            keys.push(memory.key);
            await store.set(indexKey, keys);
        }

        // Write the memory
        await store.set(memory.key, memory);
    }

    /**
     * Read a memory by key
     */
    async read(projectId: string, key: string): Promise<Memory | null> {
        const store = await this.getStore(projectId);
        const memory = await store.get(key);

        if (memory) {
            // Increment access count
            memory.metadata.accessCount = (memory.metadata.accessCount || 0) + 1;
            memory.updatedAt = Date.now();
            await store.set(key, memory);
        }

        return memory || null;
    }

    /**
     * Search memories by query, tags, or type
     */
    async search(projectId: string, query?: string, tags?: string[], type?: string): Promise<Memory[]> {
        const store = await this.getStore(projectId);
        const results: Memory[] = [];

        // Get all keys for this project from the index
        const indexKey = `_index_${projectId}`;
        const keysData = await store.get(indexKey);
        const keys: string[] = keysData || [];

        // Iterate through all keys
        for (const key of keys) {
            const memory = await store.get(key) as Memory;
            if (!memory) continue;

            // Filter by type
            if (type && memory.type !== type) {
                continue;
            }

            // Filter by tags
            if (tags && tags.length > 0) {
                const hasMatchingTag = tags.some(tag => memory.tags.includes(tag));
                if (!hasMatchingTag) {
                    continue;
                }
            }

            // Filter by query (simple text search)
            if (query) {
                const searchText = `${memory.key} ${memory.content} ${memory.tags.join(' ')}`.toLowerCase();
                if (!searchText.includes(query.toLowerCase())) {
                    continue;
                }
            }

            results.push(memory);
        }

        return results;
    }

    /**
     * List all memories of a specific type
     */
    async list(projectId: string, type?: string): Promise<Memory[]> {
        return this.search(projectId, undefined, undefined, type);
    }

    /**
     * Update an existing memory
     */
    async update(projectId: string, key: string, updates: Partial<Memory>): Promise<Memory | null> {
        const store = await this.getStore(projectId);
        const existing = await store.get(key);

        if (!existing) {
            return null;
        }

        const updated = {
            ...existing,
            ...updates,
            updatedAt: Date.now()
        };

        await store.set(key, updated);
        return updated;
    }

    /**
     * Get storage statistics
     */
    async getStats(projectId: string): Promise<{
        totalMemories: number;
        byType: Record<string, number>;
        totalSize: number;
    }> {
        const store = await this.getStore(projectId);
        const memories = await this.list(projectId);

        const byType: Record<string, number> = {};
        for (const memory of memories) {
            byType[memory.type] = (byType[memory.type] || 0) + 1;
        }

        return {
            totalMemories: memories.length,
            byType,
            totalSize: JSON.stringify(memories).length
        };
    }
}

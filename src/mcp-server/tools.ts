import { z } from 'zod';
import { MemoryStore } from './memory-store';
import {
    Memory,
    MemoryDeleteParamsSchema,
    MemoryListParamsSchema,
    MemoryReadParamsSchema,
    MemorySearchParamsSchema,
    MemoryUpdateParamsSchema,
    MemoryWriteParamsSchema,
    NoParamsSchema
} from './schemas';

/** A tool call whose arguments failed validation. */
export class ToolInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ToolInputError';
    }
}

const TOOL_DEFINITIONS = [
    {
        name: 'memory_write',
        description: 'Store a memory in the memory bank. Writing a key that already exists replaces its content and keeps its id and creation time.',
        schema: MemoryWriteParamsSchema
    },
    {
        name: 'memory_read',
        description: 'Read a memory by exact key',
        schema: MemoryReadParamsSchema
    },
    {
        name: 'memory_search',
        description: 'Search memories by keyword, tags, or type',
        schema: MemorySearchParamsSchema
    },
    {
        name: 'memory_list',
        description: 'List all memories, optionally of one type',
        schema: MemoryListParamsSchema
    },
    {
        name: 'memory_update',
        description: 'Change some fields of an existing memory',
        schema: MemoryUpdateParamsSchema
    },
    {
        name: 'memory_delete',
        description: 'Delete a memory by key',
        schema: MemoryDeleteParamsSchema
    },
    {
        name: 'project_init',
        description: 'Initialize project storage',
        schema: NoParamsSchema
    },
    {
        name: 'memory_stats',
        description: 'Get memory counts and storage statistics',
        schema: NoParamsSchema
    }
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]['name'];

export interface MCPToolsOptions {
    /** Reported by project_init; the store itself is per workspace. */
    projectId: string;
    /** Used when memory_write isn't given `createdBy`. */
    defaultCreatedBy?: string;
}

export class MCPTools {
    constructor(private store: MemoryStore, private options: MCPToolsOptions) { }

    /** Validate `args` and run the named tool. */
    async call(name: string, args: unknown): Promise<unknown> {
        switch (name) {
            case 'memory_write': return this.memory_write(args);
            case 'memory_read': return this.memory_read(args);
            case 'memory_search': return this.memory_search(args);
            case 'memory_list': return this.memory_list(args);
            case 'memory_update': return this.memory_update(args);
            case 'memory_delete': return this.memory_delete(args);
            case 'project_init': return this.project_init(args);
            case 'memory_stats': return this.memory_stats(args);
            default: throw new ToolInputError(`Unknown tool: ${name}`);
        }
    }

    /**
     * Tool 1: memory_write - Create or replace a memory
     */
    async memory_write(args: unknown): Promise<{ success: boolean; id: string; created: boolean }> {
        const params = parseArgs('memory_write', MemoryWriteParamsSchema, args);
        const { memory, created } = await this.store.write({
            key: params.key,
            type: params.type,
            content: params.content,
            tags: params.tags,
            relationships: params.relationships,
            createdBy: params.createdBy ?? this.options.defaultCreatedBy ?? 'agent'
        });
        return { success: true, id: memory.id, created };
    }

    /**
     * Tool 2: memory_read - Get exact key
     */
    async memory_read(args: unknown): Promise<Memory | null> {
        const { key } = parseArgs('memory_read', MemoryReadParamsSchema, args);
        return this.store.read(key);
    }

    /**
     * Tool 3: memory_search - Keyword/tag search, most used and most recent first
     */
    async memory_search(args: unknown): Promise<Memory[]> {
        const { query, tags, type, limit } = parseArgs('memory_search', MemorySearchParamsSchema, args);
        const [results, accessStats] = await Promise.all([
            this.store.search({ query, tags, type }),
            this.store.getAccessStats()
        ]);

        const now = Date.now();
        const score = (memory: Memory) =>
            (accessStats[memory.id]?.accessCount ?? 0) * 0.5 - (now - memory.updatedAt) * 0.0001;
        results.sort((a, b) => score(b) - score(a));

        return results.slice(0, limit);
    }

    /**
     * Tool 4: memory_list - List by type
     */
    async memory_list(args: unknown): Promise<Memory[]> {
        const { type } = parseArgs('memory_list', MemoryListParamsSchema, args);
        return this.store.list(type);
    }

    /**
     * Tool 5: memory_update - Change fields of an existing memory
     */
    async memory_update(args: unknown): Promise<{ success: boolean; memory: Memory | null }> {
        const { key, ...patch } = parseArgs('memory_update', MemoryUpdateParamsSchema, args);
        const memory = await this.store.update(key, patch);
        return { success: !!memory, memory };
    }

    /**
     * Tool 6: memory_delete - Remove a memory
     */
    async memory_delete(args: unknown): Promise<{ success: boolean; key: string }> {
        const { key } = parseArgs('memory_delete', MemoryDeleteParamsSchema, args);
        return { success: await this.store.delete(key), key };
    }

    /**
     * Tool 7: project_init - Create storage and import legacy data
     */
    async project_init(args: unknown = {}): Promise<{ success: boolean; projectId: string; memoriesDir: string }> {
        parseArgs('project_init', NoParamsSchema, args);
        await this.store.init();
        return { success: true, projectId: this.options.projectId, memoriesDir: this.store.memoriesDir };
    }

    /**
     * Tool 8: memory_stats - Usage analytics
     */
    async memory_stats(args: unknown = {}): Promise<{
        totalMemories: number;
        byType: Record<string, number>;
        totalSize: number;
        memoriesDir: string;
    }> {
        parseArgs('memory_stats', NoParamsSchema, args);
        return { ...(await this.store.getStats()), memoriesDir: this.store.memoriesDir };
    }

    /**
     * List all available tools, with JSON input schemas derived from the Zod schemas
     */
    static listTools() {
        return TOOL_DEFINITIONS.map(({ name, description, schema }) => {
            const { $schema, ...inputSchema } = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
            return { name, description, inputSchema };
        });
    }
}

function parseArgs<T extends z.ZodType>(tool: string, schema: T, args: unknown): z.infer<T> {
    const result = schema.safeParse(args ?? {});
    if (!result.success) {
        throw new ToolInputError(`Invalid arguments for ${tool}:\n${z.prettifyError(result.error)}`);
    }
    return result.data;
}

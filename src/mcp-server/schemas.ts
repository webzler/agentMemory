import { z } from 'zod';

export const MEMORY_TYPES = ['architecture', 'pattern', 'feature', 'api', 'bug', 'decision'] as const;

export const MemoryTypeSchema = z.enum(MEMORY_TYPES);

/**
 * Memory keys are turned into file names under `.agentMemory/memories/`, so
 * anything that could be read as a path is rejected outright.
 */
export const MemoryKeySchema = z.string()
    .min(1)
    .max(200)
    .refine(key => key.trim().length > 0, { message: 'Key must not be blank' })
    .refine(key => !/[\\/]/.test(key), { message: 'Key must not contain path separators' })
    .refine(key => !key.includes('..'), { message: 'Key must not contain ".."' })
    .refine(key => !/^[a-zA-Z]:/.test(key), { message: 'Key must not start with a drive letter' })
    .refine(key => !/[\u0000-\u001f\u007f]/.test(key), { message: 'Key must not contain control characters' });

export const RelationshipsSchema = z.object({
    dependsOn: z.array(z.string()).default([]),
    implements: z.array(z.string()).default([])
});

/**
 * Zod schema for Memory objects. This is the single source of the `Memory` type.
 *
 * On disk a memory is a markdown file: every field except `content` lives in the
 * YAML frontmatter and `content` is the body.
 */
export const MemorySchema = z.object({
    id: z.string().min(1),
    key: MemoryKeySchema,
    type: MemoryTypeSchema,
    content: z.string(),
    tags: z.array(z.string()).default([]),
    relationships: RelationshipsSchema.default({ dependsOn: [], implements: [] }),
    createdBy: z.string().min(1),
    createdAt: z.number(),
    updatedAt: z.number(),
    sourceFile: z.string().optional()
});

const RelationshipsParamsSchema = z.object({
    dependsOn: z.array(z.string()).optional().describe('Keys of memories this one depends on'),
    implements: z.array(z.string()).optional().describe('Keys of memories this one implements')
});

/**
 * Tool parameter schemas. The server validates every tool call against these
 * and also derives the advertised JSON input schemas from them. Unknown fields
 * (such as a legacy `projectId`) are stripped.
 */
export const MemoryWriteParamsSchema = z.object({
    key: MemoryKeySchema.describe('Unique memory key. Writing an existing key replaces its content.'),
    type: MemoryTypeSchema,
    content: z.string().min(1).describe('Memory content (markdown supported)'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
    relationships: RelationshipsParamsSchema.optional().describe('Dependencies and implementations'),
    createdBy: z.string().min(1).optional().describe('Name of the agent writing the memory')
});

export const MemorySearchParamsSchema = z.object({
    query: z.string().optional().describe('Text to look for in keys, content and tags'),
    tags: z.array(z.string()).optional().describe('Match memories that have any of these tags'),
    type: MemoryTypeSchema.optional(),
    limit: z.number().int().min(1).max(100).default(10)
});

export const MemoryReadParamsSchema = z.object({
    key: MemoryKeySchema
});

export const MemoryListParamsSchema = z.object({
    type: MemoryTypeSchema.optional()
});

export const MemoryUpdateParamsSchema = z.object({
    key: MemoryKeySchema,
    type: MemoryTypeSchema.optional(),
    content: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    relationships: RelationshipsParamsSchema.optional()
});

export const MemoryDeleteParamsSchema = z.object({
    key: MemoryKeySchema
});

export const NoParamsSchema = z.object({});

// Export TypeScript types inferred from schemas
export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type MemoryWriteParams = z.infer<typeof MemoryWriteParamsSchema>;
export type MemorySearchParams = z.infer<typeof MemorySearchParamsSchema>;
export type MemoryReadParams = z.infer<typeof MemoryReadParamsSchema>;
export type MemoryListParams = z.infer<typeof MemoryListParamsSchema>;
export type MemoryUpdateParams = z.infer<typeof MemoryUpdateParamsSchema>;
export type MemoryDeleteParams = z.infer<typeof MemoryDeleteParamsSchema>;

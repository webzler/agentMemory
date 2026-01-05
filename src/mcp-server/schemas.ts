import { z } from 'zod';

/**
 * Zod schema for Memory objects
 * Provides runtime type validation
 */
export const MemorySchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().min(1),
    key: z.string().min(1).max(255),
    type: z.enum(['architecture', 'pattern', 'feature', 'api', 'bug', 'decision']),
    content: z.string(),
    tags: z.array(z.string()).default([]),
    relationships: z.object({
        dependsOn: z.array(z.string()).default([]),
        implements: z.array(z.string()).default([])
    }).default({ dependsOn: [], implements: [] }),
    metadata: z.object({
        accessCount: z.number().default(0),
        createdBy: z.string(),
        sourceFile: z.string().optional()
    }),
    createdAt: z.number(),
    updatedAt: z.number()
});

/**
 * Zod schema for memory_write tool parameters
 */
export const MemoryWriteParamsSchema = z.object({
    projectId: z.string().min(1),
    key: z.string().min(1).max(255),
    content: z.string().min(1),
    type: z.enum(['architecture', 'pattern', 'feature', 'api', 'bug', 'decision']),
    tags: z.array(z.string()).optional(),
    relationships: z.object({
        dependsOn: z.array(z.string()).optional(),
        implements: z.array(z.string()).optional()
    }).optional(),
    createdBy: z.string().min(1)
});

/**
 * Zod schema for memory_search tool parameters
 */
export const MemorySearchParamsSchema = z.object({
    projectId: z.string(),
    query: z.string().optional(),
    tags: z.array(z.string()).optional(),
    type: z.enum(['architecture', 'pattern', 'feature', 'api', 'bug', 'decision']).optional(),
    limit: z.number().min(1).max(100).optional()
});

/**
 * Zod schema for memory_read tool parameters
 */
export const MemoryReadParamsSchema = z.object({
    projectId: z.string(),
    key: z.string().min(1)
});

/**
 * Zod schema for memory_update tool parameters
 */
export const MemoryUpdateParamsSchema = z.object({
    projectId: z.string(),
    key: z.string().min(1),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    relationships: z.object({
        dependsOn: z.array(z.string()).optional(),
        implements: z.array(z.string()).optional()
    }).optional()
});

// Export TypeScript types inferred from schemas
export type Memory = z.infer<typeof MemorySchema>;
export type MemoryWriteParams = z.infer<typeof MemoryWriteParamsSchema>;
export type MemorySearchParams = z.infer<typeof MemorySearchParamsSchema>;
export type MemoryReadParams = z.infer<typeof MemoryReadParamsSchema>;
export type MemoryUpdateParams = z.infer<typeof MemoryUpdateParamsSchema>;

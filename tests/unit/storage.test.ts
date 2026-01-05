import { StorageManager } from '../../src/mcp-server/storage';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('StorageManager', () => {
    let storage: StorageManager;
    const testDataPath = './test-data';
    const projectId = 'test-project';

    beforeEach(async () => {
        storage = new StorageManager(testDataPath);
        await storage.initProject(projectId);
    });

    afterEach(async () => {
        // Clean up test data
        try {
            await fs.rm(testDataPath, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    test('should initialize project storage', async () => {
        await storage.initProject('new-project');
        // Verify directory was created
        const exists = await fs.access(testDataPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
    });

    test('should write and read memory', async () => {
        const memory = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            projectId,
            key: 'test-key',
            type: 'feature' as const,
            content: 'Test content',
            tags: ['test'],
            relationships: { dependsOn: [], implements: [] },
            metadata: { accessCount: 0, createdBy: 'test' },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await storage.write(projectId, memory);
        const result = await storage.read(projectId, 'test-key');

        expect(result).not.toBeNull();
        expect(result?.key).toBe('test-key');
        expect(result?.content).toBe('Test content');
        expect(result?.type).toBe('feature');
    });

    test('should search by query', async () => {
        const memory1 = {
            id: '123e4567-e89b-12d3-a456-426614174001',
            projectId,
            key: 'oauth-impl',
            type: 'architecture' as const,
            content: 'OAuth implementation using Passport.js',
            tags: ['auth', 'security'],
            relationships: { dependsOn: [], implements: [] },
            metadata: { accessCount: 0, createdBy: 'test' },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const memory2 = {
            id: '123e4567-e89b-12d3-a456-426614174002',
            projectId,
            key: 'api-routes',
            type: 'pattern' as const,
            content: 'REST API routes for user management',
            tags: ['api', 'backend'],
            relationships: { dependsOn: [], implements: [] },
            metadata: { accessCount: 0, createdBy: 'test' },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await storage.write(projectId, memory1);
        await storage.write(projectId, memory2);

        // Search by query
        const results = await storage.search(projectId, 'oauth');
        expect(results.length).toBe(1);
        expect(results[0].key).toBe('oauth-impl');

        // Search by tags
        const authResults = await storage.search(projectId, undefined, ['auth']);
        expect(authResults.length).toBe(1);
        expect(authResults[0].tags).toContain('auth');
    });

    test('should update memory', async () => {
        const memory = {
            id: '123e4567-e89b-12d3-a456-426614174003',
            projectId,
            key: 'feature-x',
            type: 'feature' as const,
            content: 'Initial content',
            tags: ['tag1'],
            relationships: { dependsOn: [], implements: [] },
            metadata: { accessCount: 0, createdBy: 'test' },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await storage.write(projectId, memory);

        // Update
        const updated = await storage.update(projectId, 'feature-x', {
            content: 'Updated content',
            tags: ['tag1', 'tag2']
        });

        expect(updated).not.toBeNull();
        expect(updated?.content).toBe('Updated content');
        expect(updated?.tags).toContain('tag2');
    });

    test('should list memories by type', async () => {
        const memories = [
            {
                id: '123e4567-e89b-12d3-a456-426614174004',
                projectId,
                key: 'arch-1',
                type: 'architecture' as const,
                content: 'Architecture 1',
                tags: [],
                relationships: { dependsOn: [], implements: [] },
                metadata: { accessCount: 0, createdBy: 'test' },
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: '123e4567-e89b-12d3-a456-426614174005',
                projectId,
                key: 'pattern-1',
                type: 'pattern' as const,
                content: 'Pattern 1',
                tags: [],
                relationships: { dependsOn: [], implements: [] },
                metadata: { accessCount: 0, createdBy: 'test' },
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        ];

        for (const mem of memories) {
            await storage.write(projectId, mem);
        }

        const archResults = await storage.list(projectId, 'architecture');
        expect(archResults.length).toBe(1);
        expect(archResults[0].type).toBe('architecture');
    });

    test('should return null for non-existent memory', async () => {
        const result = await storage.read(projectId, 'non-existent');
        expect(result).toBeNull();
    });

    test('should get storage stats', async () => {
        const memory = {
            id: '123e4567-e89b-12d3-a456-426614174006',
            projectId,
            key: 'stats-test',
            type: 'feature' as const,
            content: 'Test',
            tags: [],
            relationships: { dependsOn: [], implements: [] },
            metadata: { accessCount: 0, createdBy: 'test' },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await storage.write(projectId, memory);

        const stats = await storage.getStats(projectId);
        expect(stats.totalMemories).toBe(1);
        expect(stats.byType.feature).toBe(1);
        expect(stats.totalSize).toBeGreaterThan(0);
    });
});

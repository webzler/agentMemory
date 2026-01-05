import { StorageManager } from '../../src/mcp-server/storage';
import { CacheManager } from '../../src/mcp-server/cache';
import { MCPTools } from '../../src/mcp-server/tools';
import { MemoryBankSync } from '../../src/mcp-server/memory-bank-sync';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Full Flow Integration Tests', () => {
    const testWorkspace = './test-integration-workspace';
    const projectId = 'integration-test-project';
    let storage: StorageManager;
    let cache: CacheManager;
    let tools: MCPTools;
    let sync: MemoryBankSync;

    beforeAll(async () => {
        // Set up test workspace
        await fs.mkdir(testWorkspace, { recursive: true });

        const storagePath = path.join(testWorkspace, '.agentMemory');
        storage = new StorageManager(storagePath);
        cache = new CacheManager({ maxSize: 100, ttl: 3600000 });
        sync = new MemoryBankSync(testWorkspace, '.agentMemory');
        tools = new MCPTools(storage, cache, sync);

        await storage.initProject(projectId);
    });

    afterAll(async () => {
        // Clean up test workspace
        try {
            await fs.rm(testWorkspace, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Write → Read → Storage Flow', () => {
        test('should write memory via MCP tools and read it back', async () => {
            const writeResult = await tools.memory_write({
                projectId,
                key: 'oauth-implementation',
                type: 'architecture',
                content: '# OAuth Implementation\n\nWe use Passport.js for OAuth authentication.',
                tags: ['auth', 'oauth', 'security'],
                createdBy: 'integration-test'
            });

            expect(writeResult.success).toBe(true);
            expect(writeResult.id).toBeTruthy();

            // Read it back
            const memory = await tools.memory_read({
                projectId,
                key: 'oauth-implementation'
            });

            expect(memory).not.toBeNull();
            expect(memory?.key).toBe('oauth-implementation');
            expect(memory?.type).toBe('architecture');
            expect(memory?.content).toContain('OAuth Implementation');
            expect(memory?.tags).toContain('auth');
            expect(memory?.metadata.createdBy).toBe('integration-test');
        });

        test('should persist to storage', async () => {
            const fromStorage = await storage.read(projectId, 'oauth-implementation');

            expect(fromStorage).not.toBeNull();
            expect(fromStorage?.key).toBe('oauth-implementation');
        });

        test('should be cached after read', async () => {
            // Read should hit cache on second call
            const memory1 = await tools.memory_read({
                projectId,
                key: 'oauth-implementation'
            });

            const memory2 = await tools.memory_read({
                projectId,
                key: 'oauth-implementation'
            });

            expect(memory1).toEqual(memory2);
        });
    });

    describe('Search and List Functionality', () => {
        beforeAll(async () => {
            // Create multiple test memories
            const testMemories = [
                {
                    key: 'api-routes',
                    type: 'pattern' as const,
                    content: '# API Routes\n\nRESTful routing patterns for user management',
                    tags: ['api', 'backend', 'routing']
                },
                {
                    key: 'database-schema',
                    type: 'architecture' as const,
                    content: '# Database Schema\n\nPostgreSQL schema design',
                    tags: ['database', 'postgresql', 'schema']
                },
                {
                    key: 'login-bug-fix',
                    type: 'bug' as const,
                    content: '# Login Bug Fix\n\nFixed session timeout issue',
                    tags: ['bug', 'auth', 'session']
                }
            ];

            for (const mem of testMemories) {
                await tools.memory_write({
                    projectId,
                    ...mem,
                    createdBy: 'integration-test'
                });
            }
        });

        test('should search by query', async () => {
            const results = await tools.memory_search({
                projectId,
                query: 'API'
            });

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);

            const apiMemory = results.find(m => m.key === 'api-routes');
            expect(apiMemory).toBeDefined();
        });

        test('should search by tags', async () => {
            const results = await tools.memory_search({
                projectId,
                tags: ['auth']
            });

            expect(results.length).toBeGreaterThanOrEqual(2); // oauth-implementation + login-bug-fix
            expect(results.some(m => m.key === 'oauth-implementation')).toBe(true);
            expect(results.some(m => m.key === 'login-bug-fix')).toBe(true);
        });

        test('should filter by type', async () => {
            const architectureMemories = await tools.memory_search({
                projectId,
                type: 'architecture'
            });

            expect(architectureMemories.every(m => m.type === 'architecture')).toBe(true);
            expect(architectureMemories.some(m => m.key === 'oauth-implementation')).toBe(true);
        });

        test('should list all memories', async () => {
            const allMemories = await tools.memory_list({
                projectId
            });

            expect(allMemories.length).toBeGreaterThanOrEqual(4); // At least 4 created
        });

        test('should respect search limit', async () => {
            const limitedResults = await tools.memory_search({
                projectId,
                query: '',
                limit: 2
            });

            expect(limitedResults.length).toBeLessThanOrEqual(2);
        });
    });

    describe('Update Functionality', () => {
        test('should update existing memory', async () => {
            const updateResult = await tools.memory_update({
                projectId,
                key: 'oauth-implementation',
                content: '# OAuth Implementation\n\nUpdated: Now using OAuth 2.0 with PKCE',
                tags: ['auth', 'oauth', 'security', 'pkce']
            });

            expect(updateResult.success).toBe(true);
            expect(updateResult.memory).not.toBeNull();
            expect(updateResult.memory?.content).toContain('PKCE');
            expect(updateResult.memory?.tags).toContain('pkce');
        });

        test('updated memory should be retrievable', async () => {
            const memory = await tools.memory_read({
                projectId,
                key: 'oauth-implementation'
            });

            expect(memory?.content).toContain('PKCE');
            expect(memory?.tags).toContain('pkce');
        });
    });

    describe('Statistics', () => {
        test('should return accurate statistics', async () => {
            const stats = await tools.memory_stats({
                projectId
            });

            expect(stats.totalMemories).toBeGreaterThanOrEqual(4);
            expect(stats.byType).toBeDefined();
            expect(stats.byType.architecture).toBeGreaterThanOrEqual(2);
            expect(stats.cache).toBeDefined();
        });
    });

    describe('Concurrent Operations', () => {
        test('should handle concurrent writes', async () => {
            const concurrentWrites = Array.from({ length: 10 }, (_, i) =>
                tools.memory_write({
                    projectId,
                    key: `concurrent-test-${i}`,
                    type: 'feature',
                    content: `# Feature ${i}\n\nTest concurrent write`,
                    tags: ['concurrent', 'test'],
                    createdBy: 'integration-test'
                })
            );

            const results = await Promise.all(concurrentWrites);

            expect(results.every(r => r.success)).toBe(true);
            expect(new Set(results.map(r => r.id)).size).toBe(10); // All unique IDs
        });

        test('all concurrent writes should be stored', async () => {
            const stats = await storage.getStats(projectId);
            expect(stats.totalMemories).toBeGreaterThanOrEqual(14); // 4 + 10
        });
    });

    describe('Error Handling', () => {
        test('should handle reading non-existent memory', async () => {
            const result = await tools.memory_read({
                projectId,
                key: 'non-existent-key'
            });

            expect(result).toBeNull();
        });

        test('should handle updating non-existent memory', async () => {
            const result = await tools.memory_update({
                projectId,
                key: 'non-existent-key',
                content: 'Updated content'
            });

            expect(result.success).toBe(false);
            expect(result.memory).toBeNull();
        });
    });
});

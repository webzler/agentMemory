import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryStore } from '../../src/mcp-server/memory-store';
import { MCPTools, ToolInputError } from '../../src/mcp-server/tools';
import { MCPServer } from '../../src/mcp-server/server';
import { makeTempWorkspace, removeTempWorkspace, silentLog } from '../helpers/temp-workspace';

describe('Full Flow Integration Tests', () => {
    let testWorkspace: string;
    let store: MemoryStore;
    let tools: MCPTools;

    beforeAll(async () => {
        testWorkspace = await makeTempWorkspace();
        store = new MemoryStore(testWorkspace, { log: silentLog });
        tools = new MCPTools(store, { projectId: 'integration-test-project', defaultCreatedBy: 'default-agent' });
        await tools.project_init({});
    });

    afterAll(async () => {
        await removeTempWorkspace(testWorkspace);
    });

    describe('Write → Read → Storage Flow', () => {
        test('should write memory via MCP tools and read it back', async () => {
            const writeResult = await tools.memory_write({
                key: 'oauth-implementation',
                type: 'architecture',
                content: '# OAuth Implementation\n\nWe use Passport.js for OAuth authentication.',
                tags: ['auth', 'oauth', 'security'],
                createdBy: 'integration-test'
            });

            expect(writeResult).toEqual({ success: true, id: expect.any(String), created: true });

            // Read it back
            const memory = await tools.memory_read({ key: 'oauth-implementation' });

            expect(memory).not.toBeNull();
            expect(memory?.id).toBe(writeResult.id);
            expect(memory?.key).toBe('oauth-implementation');
            expect(memory?.type).toBe('architecture');
            expect(memory?.content).toContain('OAuth Implementation');
            expect(memory?.tags).toContain('auth');
            expect(memory?.createdBy).toBe('integration-test');
        });

        test('should persist to a markdown file', async () => {
            const file = await fs.readFile(path.join(testWorkspace, '.agentMemory', 'memories', 'oauth-implementation.md'), 'utf8');
            expect(file).toContain('key: oauth-implementation');
            expect(file).toContain('We use Passport.js for OAuth authentication.');
            expect((await store.get('oauth-implementation'))?.key).toBe('oauth-implementation');
        });

        test('ignores a projectId argument from older clients', async () => {
            const memory = await tools.memory_read({ projectId: 'something-else', key: 'oauth-implementation' });
            expect(memory?.key).toBe('oauth-implementation');
        });

        test('uses the default agent name when createdBy is missing', async () => {
            await tools.memory_write({ key: 'no-author', type: 'feature', content: 'x' });
            expect((await tools.memory_read({ key: 'no-author' }))?.createdBy).toBe('default-agent');
            await tools.memory_delete({ key: 'no-author' });
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
                await tools.memory_write({ ...mem, createdBy: 'integration-test' });
            }
        });

        test('should search by query', async () => {
            const results = await tools.memory_search({ query: 'API' });

            expect(results.length).toBeGreaterThan(0);
            expect(results.find(m => m.key === 'api-routes')).toBeDefined();
        });

        test('should search by tags', async () => {
            const results = await tools.memory_search({ tags: ['auth'] });

            expect(results.map(m => m.key).sort()).toEqual(['login-bug-fix', 'oauth-implementation']);
        });

        test('should filter by type', async () => {
            const architectureMemories = await tools.memory_search({ type: 'architecture' });

            expect(architectureMemories.every(m => m.type === 'architecture')).toBe(true);
            expect(architectureMemories.some(m => m.key === 'oauth-implementation')).toBe(true);
        });

        test('should rank frequently read memories first', async () => {
            await tools.memory_read({ key: 'database-schema' });
            await tools.memory_read({ key: 'database-schema' });
            const results = await tools.memory_search({ type: 'architecture' });
            expect(results[0].key).toBe('database-schema');
        });

        test('should list all memories', async () => {
            const allMemories = await tools.memory_list({});
            expect(allMemories).toHaveLength(4);
        });

        test('should respect search limit', async () => {
            const limitedResults = await tools.memory_search({ query: '', limit: 2 });
            expect(limitedResults).toHaveLength(2);
        });
    });

    describe('Update and Delete', () => {
        test('should update existing memory', async () => {
            const updateResult = await tools.memory_update({
                key: 'oauth-implementation',
                content: '# OAuth Implementation\n\nUpdated: Now using OAuth 2.0 with PKCE',
                tags: ['auth', 'oauth', 'security', 'pkce']
            });

            expect(updateResult.success).toBe(true);
            expect(updateResult.memory?.content).toContain('PKCE');
            expect(updateResult.memory?.tags).toContain('pkce');
        });

        test('updated memory should be retrievable', async () => {
            const memory = await tools.memory_read({ key: 'oauth-implementation' });

            expect(memory?.content).toContain('PKCE');
            expect(memory?.tags).toContain('pkce');
        });

        test('should delete a memory', async () => {
            await tools.memory_write({ key: 'temporary', type: 'feature', content: 'Short-lived' });
            expect(await tools.memory_delete({ key: 'temporary' })).toEqual({ success: true, key: 'temporary' });
            expect(await tools.memory_read({ key: 'temporary' })).toBeNull();
            expect(await tools.memory_delete({ key: 'temporary' })).toEqual({ success: false, key: 'temporary' });
        });
    });

    describe('Statistics', () => {
        test('should return accurate statistics', async () => {
            const stats = await tools.memory_stats({});

            expect(stats.totalMemories).toBe(4);
            expect(stats.byType).toEqual({ architecture: 2, pattern: 1, bug: 1 });
            expect(stats.memoriesDir).toBe(path.join(testWorkspace, '.agentMemory', 'memories'));
        });
    });

    describe('Concurrent Operations', () => {
        test('should handle concurrent writes', async () => {
            const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
                tools.memory_write({
                    key: `concurrent-test-${i}`,
                    type: 'feature',
                    content: `# Feature ${i}\n\nTest concurrent write`,
                    tags: ['concurrent', 'test'],
                    createdBy: 'integration-test'
                })
            ));

            expect(results.every(r => r.success)).toBe(true);
            expect(new Set(results.map(r => r.id)).size).toBe(10); // All unique IDs
        });

        test('all concurrent writes should be stored', async () => {
            const concurrentMemories = await Promise.all(
                Array.from({ length: 10 }, (_, i) => store.get(`concurrent-test-${i}`))
            );

            expect(concurrentMemories.filter(m => m !== null)).toHaveLength(10);
            expect((await store.getStats()).totalMemories).toBe(14);
        });
    });

    describe('Error Handling', () => {
        test('should handle reading non-existent memory', async () => {
            expect(await tools.memory_read({ key: 'non-existent-key' })).toBeNull();
        });

        test('should handle updating non-existent memory', async () => {
            const result = await tools.memory_update({ key: 'non-existent-key', content: 'Updated content' });

            expect(result.success).toBe(false);
            expect(result.memory).toBeNull();
        });

        test.each([
            ['memory_write', { key: '../escape', type: 'feature', content: 'x' }],
            ['memory_write', { key: 'ok', type: 'not-a-type', content: 'x' }],
            ['memory_write', { key: 'ok', type: 'feature', content: '' }],
            ['memory_read', {}],
            ['memory_read', { key: 'a/b' }],
            ['memory_search', { limit: 1000 }],
            ['memory_update', { key: 'C:evil', content: 'x' }],
            ['memory_delete', { key: '..' }]
        ])('should reject invalid %s arguments %j', async (tool, args) => {
            await expect(tools.call(tool, args)).rejects.toThrow(ToolInputError);
        });

        test('should reject unknown tools', async () => {
            await expect(tools.call('memory_explode', {})).rejects.toThrow('Unknown tool');
        });
    });

    describe('Tool definitions', () => {
        test('are derived from the Zod schemas and have no projectId', () => {
            const definitions = MCPTools.listTools();
            expect(definitions.map(t => t.name)).toEqual([
                'memory_write', 'memory_read', 'memory_search', 'memory_list',
                'memory_update', 'memory_delete', 'project_init', 'memory_stats'
            ]);

            for (const tool of definitions) {
                const schema = tool.inputSchema as any;
                expect(schema.type).toBe('object');
                expect(schema.$schema).toBeUndefined();
                expect(Object.keys(schema.properties ?? {})).not.toContain('projectId');
                expect(schema.required ?? []).not.toContain('projectId');
            }

            const write = definitions.find(t => t.name === 'memory_write')!.inputSchema as any;
            expect(write.required).toEqual(['key', 'type', 'content']);
            expect(write.properties.type.enum).toEqual(['architecture', 'pattern', 'feature', 'api', 'bug', 'decision']);
        });
    });

    describe('MCP server', () => {
        let server: MCPServer;

        beforeAll(() => {
            server = new MCPServer({ explicit: testWorkspace, parentPid: process.ppid, cwd: process.cwd() });
        });

        test('answers tools/list and tools/call over JSON-RPC', async () => {
            const list = await server.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
            expect(list?.result.tools.map((t: any) => t.name)).toContain('memory_delete');

            const call = await server.handleRequest({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'memory_read', arguments: { key: 'api-routes' } }
            });
            expect(JSON.parse(call?.result.content[0].text).key).toBe('api-routes');
        });

        test('returns invalid-params errors for bad arguments', async () => {
            const response = await server.handleRequest({
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: { name: 'memory_write', arguments: { key: '../../etc/passwd', type: 'bug', content: 'x' } }
            });
            expect(response?.error?.code).toBe(-32602);
            expect(response?.error?.message).toContain('path separators');
        });

        test('does not answer notifications', async () => {
            expect(await server.handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
        });
    });
});

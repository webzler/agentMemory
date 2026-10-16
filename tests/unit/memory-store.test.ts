import * as fs from 'fs/promises';
import * as path from 'path';
import { InvalidMemoryKeyError } from '../../src/mcp-server/memory-file';
import { MemoryInput, MemoryStore } from '../../src/mcp-server/memory-store';
import { makeTempWorkspace, removeTempWorkspace, silentLog } from '../helpers/temp-workspace';

function input(key: string, overrides: Partial<MemoryInput> = {}): MemoryInput {
    return {
        key,
        type: 'feature',
        content: `Content of ${key}`,
        tags: ['test'],
        createdBy: 'test',
        ...overrides
    };
}

describe('MemoryStore', () => {
    let workspace: string;
    let store: MemoryStore;

    beforeEach(async () => {
        workspace = await makeTempWorkspace();
        store = new MemoryStore(workspace, { log: silentLog });
    });

    afterEach(async () => {
        await removeTempWorkspace(workspace);
    });

    test('init creates memories/ and a .gitignore for local state', async () => {
        await store.init();

        const memoriesDir = path.join(workspace, '.agentMemory', 'memories');
        expect((await fs.stat(memoriesDir)).isDirectory()).toBe(true);
        const gitignore = await fs.readFile(path.join(workspace, '.agentMemory', '.gitignore'), 'utf8');
        expect(gitignore.split('\n')).toEqual(expect.arrayContaining(['.stats.json', '*.tmp', '*.lock']));
    });

    test('init leaves an existing .gitignore alone', async () => {
        await fs.mkdir(path.join(workspace, '.agentMemory'), { recursive: true });
        await fs.writeFile(path.join(workspace, '.agentMemory', '.gitignore'), 'custom\n');
        await store.init();
        expect(await fs.readFile(path.join(workspace, '.agentMemory', '.gitignore'), 'utf8')).toBe('custom\n');
    });

    test('writes one markdown file per memory and reads it back', async () => {
        const { memory, created } = await store.write(input('test-key', {
            content: '# Title\n\nTest content',
            relationships: { dependsOn: ['other'] }
        }));

        expect(created).toBe(true);
        const file = await fs.readFile(path.join(store.memoriesDir, 'test-key.md'), 'utf8');
        expect(file).toMatch(/^---\nid: [0-9a-f-]{36}\nkey: test-key\ntype: feature\n/);
        expect(file).toContain('\n---\n\n# Title\n\nTest content\n');

        const read = await store.read('test-key');
        expect(read).toEqual(memory);
        expect(read?.relationships).toEqual({ dependsOn: ['other'], implements: [] });
    });

    test('writing an existing key keeps id and createdAt and moves updatedAt', async () => {
        const first = (await store.write(input('feature-x', { createdBy: 'cline' }))).memory;
        await new Promise(resolve => setTimeout(resolve, 5));
        const { memory: second, created } = await store.write(input('feature-x', { content: 'Replaced', createdBy: 'roocode' }));

        expect(created).toBe(false);
        expect(second.id).toBe(first.id);
        expect(second.createdAt).toBe(first.createdAt);
        expect(second.createdBy).toBe('cline');
        expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
        expect(second.content).toBe('Replaced');
        expect(await store.list()).toHaveLength(1);
    });

    test('update changes only the given fields', async () => {
        const original = (await store.write(input('feature-x', { tags: ['tag1'] }))).memory;
        const updated = await store.update('feature-x', { tags: ['tag1', 'tag2'] });

        expect(updated?.tags).toEqual(['tag1', 'tag2']);
        expect(updated?.content).toBe(original.content);
        expect(updated?.id).toBe(original.id);
        expect(await store.update('missing', { content: 'x' })).toBeNull();
    });

    test('delete removes the file', async () => {
        await store.write(input('to-delete'));
        expect(await store.delete('to-delete')).toBe(true);
        expect(await store.get('to-delete')).toBeNull();
        expect(await fs.readdir(store.memoriesDir)).toEqual([]);
        expect(await store.delete('to-delete')).toBe(false);
    });

    test('search filters by query, tags and type; list by type', async () => {
        await store.write(input('oauth-impl', { type: 'architecture', content: 'OAuth implementation using Passport.js', tags: ['auth', 'security'] }));
        await store.write(input('api-routes', { type: 'pattern', content: 'REST API routes for user management', tags: ['api', 'backend'] }));

        expect((await store.search({ query: 'OAUTH' })).map(m => m.key)).toEqual(['oauth-impl']);
        expect((await store.search({ tags: ['auth'] })).map(m => m.key)).toEqual(['oauth-impl']);
        expect((await store.search({ type: 'pattern' })).map(m => m.key)).toEqual(['api-routes']);
        expect((await store.list('architecture')).map(m => m.key)).toEqual(['oauth-impl']);
        expect((await store.list()).map(m => m.key)).toEqual(['api-routes', 'oauth-impl']);
    });

    test('getStats counts memories by type', async () => {
        await store.write(input('stats-test', { content: 'Test' }));
        const stats = await store.getStats();
        expect(stats).toEqual({ totalMemories: 1, byType: { feature: 1 }, totalSize: 4 });
    });

    test('keys that are not clean file names still work', async () => {
        await store.write(input('Auth Flow'));
        await store.write(input('auth flow'));
        await store.write(input('auth-flow'));

        expect((await store.list()).map(m => m.key).sort()).toEqual(['Auth Flow', 'auth flow', 'auth-flow']);
        expect((await store.read('Auth Flow'))?.content).toBe('Content of Auth Flow');
        expect(await fs.readdir(store.memoriesDir)).toHaveLength(3);
    });

    describe('reading', () => {
        test('read does not modify the memory file', async () => {
            const { memory } = await store.write(input('stable'));
            const filePath = path.join(store.memoriesDir, 'stable.md');
            const before = await fs.readFile(filePath, 'utf8');
            const statBefore = await fs.stat(filePath);

            for (let i = 0; i < 3; i++) {
                const read = await store.read('stable');
                expect(read?.updatedAt).toBe(memory.updatedAt);
            }
            await store.search({ query: 'stable' });
            await store.list();

            expect(await fs.readFile(filePath, 'utf8')).toBe(before);
            const statAfter = await fs.stat(filePath);
            expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
            expect(statAfter.ino).toBe(statBefore.ino);
        });

        test('access counts go to the untracked .stats.json', async () => {
            const { memory } = await store.write(input('counted'));
            await store.read('counted');
            await store.read('counted');
            await store.get('counted'); // get doesn't count

            expect((await store.getAccessStats())[memory.id].accessCount).toBe(2);
            const stats = JSON.parse(await fs.readFile(path.join(workspace, '.agentMemory', '.stats.json'), 'utf8'));
            expect(stats[memory.id].accessCount).toBe(2);
        });

        test('a hand edit shows up on the next read', async () => {
            const { memory } = await store.write(input('hand-edited', { tags: ['before'] }));
            expect((await store.read('hand-edited'))?.content).toBe('Content of hand-edited');

            const filePath = path.join(store.memoriesDir, 'hand-edited.md');
            const edited = (await fs.readFile(filePath, 'utf8'))
                .replace('Content of hand-edited', 'Edited by a human in their editor')
                .replace('  - before', '  - after');
            await fs.writeFile(filePath, edited);

            const read = await store.read('hand-edited');
            expect(read?.content).toBe('Edited by a human in their editor');
            expect(read?.tags).toEqual(['after']);
            expect(read?.id).toBe(memory.id);
            expect((await store.search({ query: 'human' })).map(m => m.key)).toEqual(['hand-edited']);
        });

        test('hand-created and hand-deleted files are picked up', async () => {
            await store.init();
            await fs.writeFile(
                path.join(store.memoriesDir, 'Team Notes.md'),
                '---\nkey: team-notes\ntype: decision\ntags: [process]\n---\n\nWe review every PR.\n'
            );

            const created = await store.read('team-notes');
            expect(created?.content).toBe('We review every PR.');
            expect(created?.tags).toEqual(['process']);

            // Writing the key updates the hand-made file rather than adding a second one
            await store.write(input('team-notes', { type: 'decision', content: 'We review every PR twice.' }));
            expect(await fs.readdir(store.memoriesDir)).toEqual(['Team Notes.md']);

            await fs.unlink(path.join(store.memoriesDir, 'Team Notes.md'));
            expect(await store.read('team-notes')).toBeNull();
        });

        test('an unparseable file is skipped, not overwritten', async () => {
            await store.init();
            const brokenPath = path.join(store.memoriesDir, 'broken.md');
            await fs.writeFile(brokenPath, '---\nkey: broken\ntype: [unclosed\n---\nbody\n');

            expect(await store.list()).toEqual([]);
            await store.write(input('broken'));
            expect(await fs.readFile(brokenPath, 'utf8')).toContain('[unclosed');
            expect((await store.read('broken'))?.content).toBe('Content of broken');
        });
    });

    describe('path traversal', () => {
        test.each(['../evil', '..', 'a/../../evil', 'nested/key', 'a\\..\\b', '/etc/passwd', 'C:\\evil', 'C:evil'])(
            'rejects key %j without touching the file system outside memories/',
            async key => {
                await expect(store.write(input(key))).rejects.toThrow(InvalidMemoryKeyError);
                await expect(store.read(key)).rejects.toThrow(InvalidMemoryKeyError);
                await expect(store.update(key, { content: 'x' })).rejects.toThrow(InvalidMemoryKeyError);
                await expect(store.delete(key)).rejects.toThrow(InvalidMemoryKeyError);

                // Keys are validated before anything is created
                expect(await fs.readdir(workspace)).toEqual([]);
                const siblings = await fs.readdir(path.dirname(workspace));
                expect(siblings).not.toContain('evil');
                expect(siblings).not.toContain('evil.md');
            }
        );
    });

    describe('two store instances on the same directory', () => {
        let other: MemoryStore;

        beforeEach(() => {
            other = new MemoryStore(workspace, { log: silentLog });
        });

        test('concurrent writes to different memories are all kept', async () => {
            const writes = Array.from({ length: 60 }, (_, i) =>
                (i % 2 === 0 ? store : other).write(input(`concurrent-${i}`, { content: `Written by ${i % 2 === 0 ? 'A' : 'B'}` }))
            );
            await Promise.all(writes);

            for (const instance of [store, other]) {
                const keys = (await instance.list()).map(m => m.key);
                expect(keys).toHaveLength(60);
                expect(new Set(keys).size).toBe(60);
            }
            const files = (await fs.readdir(store.memoriesDir)).filter(f => f.endsWith('.md'));
            expect(files).toHaveLength(60);
        });

        test('each instance sees the other one\'s writes, updates and deletes', async () => {
            await store.list(); // warm the cache of the first instance
            await other.write(input('shared', { content: 'from B' }));
            expect((await store.read('shared'))?.content).toBe('from B');

            await other.update('shared', { content: 'updated by B' });
            expect((await store.read('shared'))?.content).toBe('updated by B');

            await store.write(input('shared', { content: 'replaced by A' }));
            expect((await other.read('shared'))?.content).toBe('replaced by A');

            await other.delete('shared');
            expect(await store.read('shared')).toBeNull();
        });

        test('concurrent writes of the same new key agree on one identity', async () => {
            const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
                (i % 2 === 0 ? store : other).write(input('contested', { content: `version ${i}` }))
            ));

            const final = await store.get('contested');
            expect(new Set(results.map(r => r.memory.id))).toEqual(new Set([final!.id]));
            expect(results.filter(r => r.created)).toHaveLength(1);
            expect(new Set(results.map(r => r.memory.createdAt)).size).toBe(1);
            expect(await fs.readdir(store.memoriesDir)).toEqual(['contested.md']);
        });

        test('no temp or lock files are left behind', async () => {
            await Promise.all(Array.from({ length: 20 }, (_, i) =>
                (i % 2 === 0 ? store : other).write(input(`tidy-${i % 5}`))
            ));
            await Promise.all([store.read('tidy-1'), other.read('tidy-1')]);

            const leftovers = [
                ...(await fs.readdir(store.memoriesDir)),
                ...(await fs.readdir(store.dataDir))
            ].filter(name => name.endsWith('.tmp') || name.endsWith('.lock'));
            expect(leftovers).toEqual([]);
        });
    });
});

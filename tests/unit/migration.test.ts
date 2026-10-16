import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryStore, parseKeyvFileCache, readProjectMemories } from '../../src/mcp-server/memory-store';
import { makeTempWorkspace, removeTempWorkspace, silentLog } from '../helpers/temp-workspace';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'legacy-data.json');
const STRAY_ID = '7a1d4c2e-9b3f-4e8a-a1c2-3d4e5f6a7b8c';

/** A memory file as the old MemoryBankSync wrote it, straight into .agentMemory/. */
const strayMemory = {
    id: STRAY_ID,
    projectId: 'legacy-project',
    key: 'projectBrief-overview',
    type: 'architecture',
    content: '# Overview\n\nImported from .clinerules/memory-bank/projectBrief.md',
    tags: ['overview', 'cline'],
    relationships: { dependsOn: [], implements: [] },
    metadata: { accessCount: 0, createdBy: 'cline', sourceFile: 'projectBrief.md' },
    createdAt: 1767738840000,
    updatedAt: 1767738840000
};

describe('legacy storage migration', () => {
    let workspace: string;
    let dataDir: string;

    beforeEach(async () => {
        workspace = await makeTempWorkspace();
        dataDir = path.join(workspace, '.agentMemory');
        await fs.mkdir(dataDir, { recursive: true });
        await fs.copyFile(FIXTURE, path.join(dataDir, 'data.json'));
        await fs.writeFile(path.join(dataDir, `${STRAY_ID}.json`), JSON.stringify(strayMemory, null, 2));
    });

    afterEach(async () => {
        await removeTempWorkspace(workspace);
    });

    test('parses keyv-file caches and skips the index entries', async () => {
        const data = JSON.parse(await fs.readFile(FIXTURE, 'utf8'));
        const memories = parseKeyvFileCache(data) as Array<{ key: string }>;
        expect(memories.map(m => m.key)).toEqual(['oauth-implementation', 'api-routes', 'notes/today', 'broken-type']);
    });

    test('imports data.json and stray memory files, then moves them aside', async () => {
        const store = new MemoryStore(workspace, { log: silentLog });
        const report = await store.init();

        expect(report.imported).toBe(4);
        expect(report.skipped).toBe(1); // broken-type has an invalid type

        const oauth = await store.get('oauth-implementation');
        expect(oauth).toEqual({
            id: '00000000-0001-4000-8000-000000000001',
            key: 'oauth-implementation',
            type: 'architecture',
            content: '# OAuth Implementation\n\nUpdated: Now using OAuth 2.0 with PKCE',
            tags: ['auth', 'oauth', 'security', 'pkce'],
            relationships: { dependsOn: ['api-routes'], implements: [] },
            createdBy: 'integration-test',
            createdAt: 1767738847950,
            updatedAt: 1767738847954
        });
        expect((await store.getAccessStats())[oauth!.id]).toEqual({ accessCount: 3 });

        expect((await store.get('api-routes'))?.createdBy).toBe('cline');

        // A key with a path separator is imported under a safe key
        const notes = await store.get('notes-today');
        expect(notes?.content).toBe('Key with a path separator');
        expect(notes?.sourceFile).toBe('decisionLog.md');

        const stray = await store.get('projectBrief-overview');
        expect(stray?.id).toBe(STRAY_ID);
        expect(stray?.createdBy).toBe('cline');

        expect(await store.get('broken-type')).toBeNull();

        const files = (await fs.readdir(dataDir)).sort();
        expect(files).toEqual(expect.arrayContaining(['data.json.migrated', `${STRAY_ID}.json.migrated`, 'memories']));
        expect(files).not.toContain('data.json');
        expect(files).not.toContain(`${STRAY_ID}.json`);

        // The original is kept byte for byte
        expect(await fs.readFile(path.join(dataDir, 'data.json.migrated'), 'utf8')).toBe(await fs.readFile(FIXTURE, 'utf8'));
    });

    test('is idempotent and never overwrites memories that already exist', async () => {
        await new MemoryStore(workspace, { log: silentLog }).init();
        const oauthPath = path.join(dataDir, 'memories', 'oauth-implementation.md');
        await fs.writeFile(oauthPath, (await fs.readFile(oauthPath, 'utf8')).replace('PKCE', 'PKCE (edited after migration)'));

        // A second start with nothing left to migrate changes nothing
        const again = await new MemoryStore(workspace, { log: silentLog }).init();
        expect(again).toEqual({ imported: 0, skipped: 0, movedFiles: [] });

        // An old agentMemory process writes data.json again: only new keys are imported
        await fs.copyFile(FIXTURE, path.join(dataDir, 'data.json'));
        const store = new MemoryStore(workspace, { log: silentLog });
        const report = await store.init();
        expect(report.imported).toBe(0);

        expect((await store.get('oauth-implementation'))?.content).toContain('(edited after migration)');
        expect(await fs.readdir(dataDir)).toEqual(expect.arrayContaining(['data.json.migrated', 'data.json.migrated-2']));
    });

    test('two processes starting at once import each memory exactly once', async () => {
        const stores = Array.from({ length: 4 }, () => new MemoryStore(workspace, { log: silentLog }));
        const reports = await Promise.all(stores.map(store => store.init()));

        expect(reports.reduce((sum, r) => sum + r.imported, 0)).toBe(4);
        const memoryFiles = (await fs.readdir(path.join(dataDir, 'memories'))).filter(f => f.endsWith('.md'));
        expect(memoryFiles).toHaveLength(4);
        expect((await stores[0].list()).map(m => m.key).sort())
            .toEqual(['api-routes', 'notes-today', 'oauth-implementation', 'projectBrief-overview']);

        const files = await fs.readdir(dataDir);
        expect(files).toContain('data.json.migrated');
        expect(files).not.toContain('data.json');
        expect(files.filter(f => f.startsWith('data.json'))).toEqual(['data.json.migrated']);
    });

    test('leaves a data.json it cannot parse in place', async () => {
        await fs.writeFile(path.join(dataDir, 'data.json'), '{"cache": [[');
        const store = new MemoryStore(workspace, { log: silentLog });
        await store.init();

        expect(await fs.readFile(path.join(dataDir, 'data.json'), 'utf8')).toBe('{"cache": [[');
        expect((await store.list()).map(m => m.key)).toEqual(['projectBrief-overview']);
    });

    test('the dashboard reader shows unmigrated projects without writing anything', async () => {
        const before = (await fs.readdir(dataDir)).sort();
        const memories = await readProjectMemories(workspace);

        expect(memories.map(m => m.key).sort())
            .toEqual(['api-routes', 'broken-type', 'notes/today', 'oauth-implementation', 'projectBrief-overview']);
        expect(memories.find(m => m.key === 'oauth-implementation')?.accessCount).toBe(3);
        expect((await fs.readdir(dataDir)).sort()).toEqual(before);
    });

    test('the dashboard reader reads memories/ and the stats file after migration', async () => {
        const store = new MemoryStore(workspace, { log: silentLog });
        await store.init();
        await store.read('api-routes');
        await store.write({ key: 'new-one', type: 'bug', content: 'Fresh', createdBy: 'kilocode' });

        const memories = await readProjectMemories(workspace);
        expect(memories).toHaveLength(5);
        expect(memories.find(m => m.key === 'api-routes')?.accessCount).toBe(1);
        expect(memories.find(m => m.key === 'oauth-implementation')?.accessCount).toBe(3);
        expect(memories.find(m => m.key === 'new-one')).toMatchObject({ type: 'bug', createdBy: 'kilocode', accessCount: 0 });
    });
});

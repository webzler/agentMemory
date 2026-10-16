jest.mock('vscode', () => ({ extensions: { getExtension: jest.fn() } }), { virtual: true });

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    AGENT_RULE_TARGETS,
    InterceptorManager,
    RULES_FILE_CONTENT,
    RULES_FILE_NAME,
    renderManagedFile
} from '../../src/interceptor';

const getExtension = vscode.extensions.getExtension as unknown as jest.Mock;

const OWN_FILES = AGENT_RULE_TARGETS.map(t => path.join(t.rulesDir, RULES_FILE_NAME));
const CLINE_FILE = path.join('.clinerules', RULES_FILE_NAME);
const ROO_FILE = path.join('.roo', 'rules', RULES_FILE_NAME);
const KILO_FILE = path.join('.kilocode', 'rules', RULES_FILE_NAME);

describe('InterceptorManager', () => {
    let workspace: string;

    const installAgents = (...ids: string[]) => {
        getExtension.mockImplementation((id: string) => (ids.includes(id) ? { id } : undefined));
    };
    const installAll = () => installAgents(
        ...AGENT_RULE_TARGETS.map(t => t.extensionId),
        'Continue.continue'
    );

    const activate = () => new InterceptorManager(
        { uri: { fsPath: workspace }, name: 'test', index: 0 } as any,
        { appendLine: jest.fn() } as any
    ).injectRules();

    const write = async (rel: string, content: string | Buffer) => {
        await fs.mkdir(path.dirname(path.join(workspace, rel)), { recursive: true });
        await fs.writeFile(path.join(workspace, rel), content);
    };
    const read = (rel: string) => fs.readFile(path.join(workspace, rel));
    const readText = (rel: string) => fs.readFile(path.join(workspace, rel), 'utf-8');
    const exists = (rel: string) => fs.access(path.join(workspace, rel)).then(() => true, () => false);

    /** Every file under the workspace, relative to it. */
    const listFiles = async (dir = workspace): Promise<string[]> => {
        const files: string[] = [];
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await listFiles(full));
            } else {
                files.push(path.relative(workspace, full));
            }
        }
        return files.sort();
    };

    /** Backdate a file so a later rewrite shows up as a changed mtime. */
    const backdate = async (rel: string) => {
        const past = new Date('2020-01-01T00:00:00Z');
        await fs.utimes(path.join(workspace, rel), past, past);
        return past.getTime();
    };
    const mtime = async (rel: string) => (await fs.stat(path.join(workspace, rel))).mtimeMs;

    beforeEach(async () => {
        workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'agentmemory-interceptor-'));
        getExtension.mockReset();
    });

    afterEach(async () => {
        await fs.rm(workspace, { recursive: true, force: true });
    });

    test('leaves agent-maintained files byte-for-byte unchanged', async () => {
        // Mixed line endings, non-ASCII and a non-UTF-8 byte, so any re-encoding would show
        const userFiles: Record<string, Buffer> = {
            [path.join('.clinerules', 'memory-bank', 'activeContext.md')]:
                Buffer.from('# Active Context\r\n\r\nWorking on the café checkout flow 🚀\n'),
            [path.join('.kilocode', 'rules', 'memory-bank', 'techContext.md')]:
                Buffer.from('# Tech Context\n\nNode 20, Postgres 16.  \n'),
            [path.join('.kilocode', 'rules', 'memory-bank', 'systemPatterns.md')]:
                Buffer.concat([Buffer.from('# System Patterns\n\nRepository pattern '), Buffer.from([0xff, 0xfe]), Buffer.from('\n')]),
            [path.join('.kilocode', 'rules', 'MANDATORY_WORKFLOW.md')]:
                Buffer.from('My own workflow notes\n'),
            '.roomodes':
                Buffer.from('customModes:\n  - slug: reviewer\n    name: Reviewer\n    roleDefinition: You review code.\n    groups: [read]\n'),
            [path.join('.continue', 'config.json')]:
                Buffer.from('{\n    "models": [{ "title": "Local", "provider": "ollama", "model": "llama3" }],\n    "contextProviders": [{ "name": "code" }]\n}\n')
        };
        for (const [rel, content] of Object.entries(userFiles)) {
            await write(rel, content);
        }
        installAll();

        await activate();
        await activate();

        for (const [rel, content] of Object.entries(userFiles)) {
            expect((await read(rel)).equals(content)).toBe(true);
        }
        // The only new files are agentMemory's own rules files
        expect(await listFiles()).toEqual([...Object.keys(userFiles), ...OWN_FILES].sort());
    });

    test('creates its own rules files once', async () => {
        installAll();

        await activate();

        expect(await listFiles()).toEqual([...OWN_FILES].sort());
        for (const rel of OWN_FILES) {
            expect(await readText(rel)).toBe(RULES_FILE_CONTENT);
        }

        const stamps = await Promise.all(OWN_FILES.map(backdate));
        await activate();

        expect(await Promise.all(OWN_FILES.map(mtime))).toEqual(stamps);
        expect(await listFiles()).toEqual([...OWN_FILES].sort());
    });

    test('does not create .roomodes or touch Continue config', async () => {
        installAll();

        await activate();

        expect(await exists('.roomodes')).toBe(false);
        expect(await exists('.continue')).toBe(false);
    });

    test('only writes rules for installed agents, detecting Roo Code by its marketplace ID', async () => {
        installAgents('RooVeterinaryInc.roo-cline');

        await activate();

        expect(getExtension).toHaveBeenCalledWith('RooVeterinaryInc.roo-cline');
        expect(await listFiles()).toEqual([ROO_FILE]);
    });

    test('writes nothing when no agents are installed', async () => {
        installAgents();

        await activate();

        expect(await listFiles()).toEqual([]);
    });

    test('updates its own unedited file when the guidance changes', async () => {
        await write(CLINE_FILE, renderManagedFile('# Old agentMemory guidance\n'));
        installAgents('saoudrizwan.claude-dev');

        await activate();

        expect(await readText(CLINE_FILE)).toBe(RULES_FILE_CONTENT);
    });

    test('keeps a managed file once the user has edited it', async () => {
        const edited = renderManagedFile('# Old agentMemory guidance\n') + '\nAlso run the linter.\n';
        await write(CLINE_FILE, edited);
        installAgents('saoudrizwan.claude-dev');

        await activate();

        expect(await readText(CLINE_FILE)).toBe(edited);
    });

    test('keeps an agentmemory.md that has no marker', async () => {
        const own = '# My agentMemory notes\n';
        await write(CLINE_FILE, own);
        installAgents('saoudrizwan.claude-dev');

        await activate();

        expect(await readText(CLINE_FILE)).toBe(own);
    });

    test('does not rewrite a CRLF copy of the current file', async () => {
        await write(CLINE_FILE, RULES_FILE_CONTENT.replace(/\n/g, '\r\n'));
        const stamp = await backdate(CLINE_FILE);
        installAgents('saoudrizwan.claude-dev');

        await activate();

        expect(await mtime(CLINE_FILE)).toBe(stamp);
    });

    test('leaves a single-file .clinerules alone and does not shadow it for Roo Code or Kilo Code', async () => {
        const legacy = Buffer.from('Always use tabs.\n');
        await write('.clinerules', legacy);
        installAll();

        await activate();

        expect((await read('.clinerules')).equals(legacy)).toBe(true);
        expect(await listFiles()).toEqual(['.clinerules']);
    });

    test('does not shadow .roorules or .kilocoderules when the rules directory is empty', async () => {
        await write('.roorules', 'Roo rules\n');
        await write('.kilocoderules', 'Kilo rules\n');
        installAgents('RooVeterinaryInc.roo-cline', 'kilocode.Kilo-Code');

        await activate();

        expect(await exists('.roo')).toBe(false);
        expect(await exists('.kilocode')).toBe(false);
    });

    test('adds its file next to existing rules even when a fallback file exists', async () => {
        await write('.roorules', 'Roo rules\n');
        await write(path.join('.roo', 'rules', 'style.md'), 'Use tabs.\n');
        await write('.kilocoderules', 'Kilo rules\n');
        await write(path.join('.kilocode', 'rules', 'memory-bank', 'techContext.md'), '# Tech\n');
        installAgents('RooVeterinaryInc.roo-cline', 'kilocode.Kilo-Code');

        await activate();

        expect(await readText(ROO_FILE)).toBe(RULES_FILE_CONTENT);
        expect(await readText(KILO_FILE)).toBe(RULES_FILE_CONTENT);
    });

    test('guidance is plain advice that points at the markdown memory store', () => {
        expect(RULES_FILE_CONTENT).not.toMatch(/MANDATORY|INCOMPLETE|rejected|NON-NEGOTIABLE|MUST/);
        expect(RULES_FILE_CONTENT).toContain('memory_search');
        expect(RULES_FILE_CONTENT).toContain('memory_write');
        expect(RULES_FILE_CONTENT).toContain('.agentMemory/memories/');
    });
});

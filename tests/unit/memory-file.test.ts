import * as path from 'path';
import {
    candidateFileNames,
    fileNameForKey,
    InvalidMemoryKeyError,
    parseMemoryFile,
    serializeMemory
} from '../../src/mcp-server/memory-file';
import { Memory } from '../../src/mcp-server/schemas';

const memory: Memory = {
    id: '6f1c2b8e-1d2a-4c3b-9a8e-0b1c2d3e4f50',
    key: 'auth-flow',
    type: 'architecture',
    content: '# Auth flow\n\nWe use OAuth 2.0 with PKCE.\n\n---\n\nA horizontal rule above.',
    tags: ['auth', 'true', '123'],
    relationships: { dependsOn: ['api-routes'], implements: [] },
    createdBy: 'cline',
    createdAt: Date.UTC(2026, 9, 16, 9, 30, 0, 123),
    updatedAt: Date.UTC(2026, 9, 16, 10, 0, 0, 456)
};

describe('memory file format', () => {
    test('round-trips a memory through frontmatter and body', () => {
        const text = serializeMemory(memory);

        expect(text.startsWith('---\nid: 6f1c2b8e-1d2a-4c3b-9a8e-0b1c2d3e4f50\nkey: auth-flow\n')).toBe(true);
        expect(text).toContain('createdAt: 2026-10-16T09:30:00.123Z');
        expect(text).toContain('\n---\n\n# Auth flow\n');
        expect(text.endsWith('A horizontal rule above.\n')).toBe(true);

        const parsed = parseMemoryFile(text, { fileName: 'auth-flow.md', mtimeMs: 0 });
        expect(parsed).toEqual(memory);
    });

    test('keeps sourceFile only when set', () => {
        expect(serializeMemory(memory)).not.toContain('sourceFile');
        const withSource = { ...memory, sourceFile: 'decisionLog.md' };
        expect(parseMemoryFile(serializeMemory(withSource), { fileName: 'x.md', mtimeMs: 0 })).toEqual(withSource);
    });

    test('fills in defaults for a minimal hand-written file', () => {
        const text = '---\ntype: decision\ntags: db, postgres\n---\nUse PostgreSQL.\n';
        const parsed = parseMemoryFile(text, { fileName: 'database-choice.md', mtimeMs: 1700000000000 });

        expect(parsed.key).toBe('database-choice');
        expect(parsed.type).toBe('decision');
        expect(parsed.content).toBe('Use PostgreSQL.');
        expect(parsed.tags).toEqual(['db', 'postgres']);
        expect(parsed.createdBy).toBe('unknown');
        expect(parsed.createdAt).toBe(1700000000000);
        expect(parsed.updatedAt).toBe(1700000000000);
        // The id is derived from the key, so it is the same on every read.
        expect(parseMemoryFile(text, { fileName: 'database-choice.md', mtimeMs: 1 }).id).toBe(parsed.id);
    });

    test('rejects files without a valid type', () => {
        expect(() => parseMemoryFile('---\nkey: x\n---\nbody', { fileName: 'x.md', mtimeMs: 0 })).toThrow();
        expect(() => parseMemoryFile('---\ntype: nonsense\n---\nbody', { fileName: 'x.md', mtimeMs: 0 })).toThrow();
    });

    test('accepts CRLF line endings', () => {
        const text = serializeMemory(memory).replace(/\n/g, '\r\n');
        const parsed = parseMemoryFile(text, { fileName: 'auth-flow.md', mtimeMs: 0 });
        expect(parsed.key).toBe('auth-flow');
        expect(parsed.tags).toEqual(memory.tags);
    });
});

describe('file names', () => {
    test('clean keys are used as-is', () => {
        expect(fileNameForKey('auth-flow')).toBe('auth-flow.md');
        expect(fileNameForKey('concurrent_test_9')).toBe('concurrent_test_9.md');
    });

    test('other keys get a slug and a hash', () => {
        expect(fileNameForKey('Auth Flow')).toMatch(/^auth-flow\.[0-9a-f]{12}\.md$/);
        expect(fileNameForKey('über café')).toMatch(/^uber-cafe\.[0-9a-f]{12}\.md$/);
        expect(fileNameForKey('!!!')).toMatch(/^memory\.[0-9a-f]{12}\.md$/);
        expect(fileNameForKey('con')).toMatch(/^_con\.[0-9a-f]{12}\.md$/);
    });

    test('keys differing only by case get different, lowercase names', () => {
        const names = ['auth', 'Auth', 'AUTH'].map(fileNameForKey);
        expect(new Set(names.map(n => n.toLowerCase())).size).toBe(3);
        for (const name of names) expect(name).toBe(name.toLowerCase());
    });

    test('every candidate name stays inside the memories directory', () => {
        const dir = path.resolve('/tmp/workspace/.agentMemory/memories');
        for (const key of ['Auth Flow', 'scope:key:with:colons', 'x'.repeat(200), 'émoji 🎉', '.hidden', 'trailing.']) {
            for (const name of candidateFileNames(key)) {
                expect(path.dirname(path.resolve(dir, name))).toBe(dir);
                expect(name.startsWith('.')).toBe(false);
            }
        }
    });

    test.each([
        ['../evil'],
        ['..'],
        ['a/../../b'],
        ['a/b'],
        ['a\\b'],
        ['/etc/passwd'],
        ['C:\\Windows\\evil'],
        ['C:evil'],
        ['bad\u0000key'],
        ['line\nbreak'],
        [''],
        ['   ']
    ])('rejects key %j', key => {
        expect(() => fileNameForKey(key)).toThrow(InvalidMemoryKeyError);
    });
});

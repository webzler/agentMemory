import * as crypto from 'crypto';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { Memory, MemorySchema, MemoryType } from './schemas';
import {
    assertValidKey,
    candidateFileNames,
    fileNameForKey,
    isMemoryFileName,
    normalizeContent,
    parseMemoryFile,
    parseTime,
    serializeMemory
} from './memory-file';

/**
 * Markdown memory store: one file per memory in `<workspace>/.agentMemory/memories/`.
 *
 * - Every save writes a temp file in the same directory and renames it into
 *   place, so a file is never half-written and writers only touch the memory
 *   they change. Read-modify-write on one memory is serialized across
 *   processes with a lock file next to it.
 * - Reads go to disk every time, with parsed files cached by mtime/size/inode,
 *   so other processes' writes and hand edits show up without a watcher.
 * - Reading never changes a memory file. Access counts live in the untracked
 *   `.agentMemory/.stats.json`.
 */

export const DATA_DIR_NAME = '.agentMemory';
export const MEMORIES_DIR_NAME = 'memories';
const STATS_FILE_NAME = '.stats.json';
const LEGACY_DATA_FILE_NAME = 'data.json';
const LEGACY_STRAY_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

const GITIGNORE = `# Written by agentMemory. memories/ holds this project's memories and is meant
# to be committed; the files below are local, per-machine state.
${STATS_FILE_NAME}
*.tmp
*.lock
`;

export interface MemoryInput {
    key: string;
    type: MemoryType;
    content: string;
    tags?: string[];
    relationships?: { dependsOn?: string[]; implements?: string[] };
    createdBy: string;
    sourceFile?: string;
}

export interface MemoryPatch {
    type?: MemoryType;
    content?: string;
    tags?: string[];
    relationships?: { dependsOn?: string[]; implements?: string[] };
}

export interface SearchFilter {
    query?: string;
    tags?: string[];
    type?: MemoryType;
}

export interface AccessStats {
    accessCount: number;
    lastAccessedAt?: number;
}

export interface MigrationReport {
    imported: number;
    skipped: number;
    movedFiles: string[];
}

type Logger = (message: string) => void;

const defaultLogger: Logger = message => console.error(`[MemoryStore] ${message}`);

interface CachedFile {
    mtimeMs: number;
    size: number;
    ino: number;
    memory: Memory | null;
}

interface LocatedMemory {
    fileName: string;
    memory: Memory;
}

/**
 * Read-only view of a memories directory with an mtime-keyed parse cache.
 */
class MemoryDirectory {
    private cache = new Map<string, CachedFile>();
    private reportedProblems = new Set<string>();

    constructor(readonly dir: string, private log: Logger) { }

    clearCache(): void {
        this.cache.clear();
    }

    /** Parsed memory in `fileName`, `null` if the file is unparseable, `undefined` if it doesn't exist. */
    async load(fileName: string): Promise<Memory | null | undefined> {
        const fullPath = path.join(this.dir, fileName);
        let stat;
        try {
            stat = await fsp.stat(fullPath);
        } catch (error: any) {
            if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
                this.cache.delete(fileName);
                return undefined;
            }
            throw error;
        }
        if (!stat.isFile()) {
            return undefined;
        }

        const cached = this.cache.get(fileName);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size && cached.ino === stat.ino) {
            return cached.memory;
        }

        let text: string;
        try {
            text = await fsp.readFile(fullPath, 'utf8');
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.cache.delete(fileName);
                return undefined;
            }
            throw error;
        }

        let memory: Memory | null = null;
        try {
            memory = parseMemoryFile(text, { fileName, mtimeMs: stat.mtimeMs });
            this.reportedProblems.delete(fileName);
        } catch (error: any) {
            this.reportOnce(fileName, `Skipping ${fileName}: ${describeError(error)}`);
        }

        this.cache.set(fileName, { mtimeMs: stat.mtimeMs, size: stat.size, ino: stat.ino, memory });
        return memory;
    }

    /** Every valid memory in the directory, one per key. */
    async scan(): Promise<Map<string, LocatedMemory>> {
        let names: string[];
        try {
            names = (await fsp.readdir(this.dir)).filter(isMemoryFileName).sort();
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.cache.clear();
                return new Map();
            }
            throw error;
        }

        const present = new Set(names);
        for (const name of this.cache.keys()) {
            if (!present.has(name)) this.cache.delete(name);
        }

        const loaded = await mapWithLimit(names, 32, async name => ({ fileName: name, memory: await this.load(name) }));
        const byKey = new Map<string, LocatedMemory>();
        for (const { fileName, memory } of loaded) {
            if (!memory) continue;
            const existing = byKey.get(memory.key);
            if (!existing) {
                byKey.set(memory.key, { fileName, memory });
                continue;
            }
            // Two files claim the same key (a copied file, say). Prefer the
            // file name the store itself would use, so reads and writes agree.
            const preferred = safeFileNameForKey(memory.key);
            const winner = fileName === preferred ? { fileName, memory } : existing;
            const loser = winner === existing ? fileName : existing.fileName;
            byKey.set(memory.key, winner);
            this.reportOnce(`dup:${loser}`, `${loser} repeats key "${memory.key}" from ${winner.fileName}; ignoring it`);
        }
        return byKey;
    }

    async locate(key: string): Promise<LocatedMemory | null> {
        const primary = fileNameForKey(key);
        const memory = await this.load(primary);
        if (memory && memory.key === key) {
            return { fileName: primary, memory };
        }
        return (await this.scan()).get(key) ?? null;
    }

    private reportOnce(id: string, message: string): void {
        if (this.reportedProblems.has(id)) return;
        this.reportedProblems.add(id);
        this.log(message);
    }
}

export class MemoryStore {
    readonly dataDir: string;
    readonly memoriesDir: string;
    private readonly statsPath: string;
    private readonly directory: MemoryDirectory;
    private readonly log: Logger;
    private initPromise?: Promise<MigrationReport>;

    constructor(readonly workspacePath: string, options: { log?: Logger } = {}) {
        this.log = options.log ?? defaultLogger;
        this.dataDir = path.join(workspacePath, DATA_DIR_NAME);
        this.memoriesDir = path.join(this.dataDir, MEMORIES_DIR_NAME);
        this.statsPath = path.join(this.dataDir, STATS_FILE_NAME);
        this.directory = new MemoryDirectory(this.memoriesDir, this.log);
    }

    /**
     * Create the directories and import any legacy storage. Safe to call more
     * than once and from several processes at the same time; every other
     * method calls it first.
     */
    init(): Promise<MigrationReport> {
        if (!this.initPromise) {
            this.initPromise = this.initialize().catch(error => {
                this.initPromise = undefined;
                throw error;
            });
        }
        return this.initPromise;
    }

    /** Drop the parse cache. Only useful if file mtimes can't be trusted. */
    clearCache(): void {
        this.directory.clearCache();
    }

    /** Get a memory without counting it as an access. */
    async get(key: string): Promise<Memory | null> {
        assertValidKey(key);
        await this.init();
        const found = await this.directory.locate(key);
        return found ? clone(found.memory) : null;
    }

    /** Get a memory and count the access in `.stats.json`. The memory file is not touched. */
    async read(key: string): Promise<Memory | null> {
        const memory = await this.get(key);
        if (memory) {
            await this.recordAccess(memory.id);
        }
        return memory;
    }

    /**
     * Create or replace a memory. Replacing keeps the existing id, createdAt
     * and createdBy and moves updatedAt forward.
     */
    async write(input: MemoryInput): Promise<{ memory: Memory; created: boolean }> {
        assertValidKey(input.key);
        await this.init();

        return this.withMemoryLock(input.key, async (fileName, existing) => {
            const memory = buildMemory(input, existing);
            await this.writeMemoryFile(fileName, memory);
            return { memory: clone(memory), created: !existing };
        });
    }

    /** Write a memory only if its key is new. Returns null if the key already exists. */
    async create(input: MemoryInput): Promise<Memory | null> {
        assertValidKey(input.key);
        await this.init();

        return this.withMemoryLock(input.key, async (fileName, existing) => {
            if (existing) return null;
            const memory = buildMemory(input, null);
            await this.writeMemoryFile(fileName, memory);
            return clone(memory);
        });
    }

    /** Change some fields of an existing memory. Returns null if the key doesn't exist. */
    async update(key: string, patch: MemoryPatch): Promise<Memory | null> {
        assertValidKey(key);
        await this.init();

        return this.withMemoryLock(key, async (fileName, existing) => {
            if (!existing) return null;
            const memory = MemorySchema.parse({
                ...existing,
                type: patch.type ?? existing.type,
                content: patch.content !== undefined ? normalizeContent(patch.content) : existing.content,
                tags: patch.tags !== undefined ? unique(patch.tags) : existing.tags,
                relationships: {
                    dependsOn: patch.relationships?.dependsOn ?? existing.relationships.dependsOn,
                    implements: patch.relationships?.implements ?? existing.relationships.implements
                },
                updatedAt: Math.max(Date.now(), existing.updatedAt)
            });
            await this.writeMemoryFile(fileName, memory);
            return clone(memory);
        });
    }

    /** Delete a memory. Returns false if the key doesn't exist. */
    async delete(key: string): Promise<boolean> {
        assertValidKey(key);
        await this.init();

        const deleted = await this.withMemoryLock(key, async (fileName, existing) => {
            if (!existing) return null;
            try {
                await fsp.unlink(path.join(this.memoriesDir, fileName));
            } catch (error: any) {
                if (error.code === 'ENOENT') return null;
                throw error;
            }
            return existing;
        });

        if (!deleted) return false;
        await this.updateStats(stats => { delete stats[deleted.id]; });
        return true;
    }

    /** All memories, optionally of one type, sorted by key. */
    async list(type?: MemoryType): Promise<Memory[]> {
        return this.search({ type });
    }

    /** Memories matching every given filter: type, any of the tags, and the query text. */
    async search(filter: SearchFilter = {}): Promise<Memory[]> {
        await this.init();
        const all = Array.from((await this.directory.scan()).values(), entry => entry.memory);
        const query = filter.query?.trim().toLowerCase();

        return all
            .filter(memory => !filter.type || memory.type === filter.type)
            .filter(memory => !filter.tags?.length || filter.tags.some(tag => memory.tags.includes(tag)))
            .filter(memory => {
                if (!query) return true;
                return `${memory.key} ${memory.content} ${memory.tags.join(' ')}`.toLowerCase().includes(query);
            })
            .sort((a, b) => a.key.localeCompare(b.key))
            .map(clone);
    }

    async getStats(): Promise<{ totalMemories: number; byType: Record<string, number>; totalSize: number }> {
        const memories = await this.list();
        const byType: Record<string, number> = {};
        let totalSize = 0;
        for (const memory of memories) {
            byType[memory.type] = (byType[memory.type] || 0) + 1;
            totalSize += Buffer.byteLength(memory.content, 'utf8');
        }
        return { totalMemories: memories.length, byType, totalSize };
    }

    /** Access counts by memory id. */
    async getAccessStats(): Promise<Record<string, AccessStats>> {
        return readStatsFile(this.statsPath);
    }

    private async initialize(): Promise<MigrationReport> {
        await fsp.mkdir(this.memoriesDir, { recursive: true });
        try {
            await fsp.writeFile(path.join(this.dataDir, '.gitignore'), GITIGNORE, { flag: 'wx' });
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
        }
        return this.migrateLegacyStorage();
    }

    /**
     * Run `fn` holding the lock for `key`, with the file the memory lives in
     * (or should be created in) and its current content.
     */
    private async withMemoryLock<T>(
        key: string,
        fn: (fileName: string, existing: Memory | null) => Promise<T>
    ): Promise<T> {
        const lockPath = path.join(this.memoriesDir, `.${fileNameForKey(key)}.lock`);
        return withFileLock(lockPath, async () => {
            const found = await this.directory.locate(key);
            if (found) {
                return fn(found.fileName, found.memory);
            }
            return fn(await this.freeFileName(key), null);
        });
    }

    private async freeFileName(key: string): Promise<string> {
        for (const name of candidateFileNames(key)) {
            const memory = await this.directory.load(name);
            if (memory === undefined || (memory && memory.key === key)) {
                return name;
            }
        }
        throw new Error(`No free file name for memory key "${key}" in ${this.memoriesDir}`);
    }

    private async writeMemoryFile(fileName: string, memory: Memory): Promise<void> {
        await writeFileAtomic(path.join(this.memoriesDir, fileName), serializeMemory(memory));
    }

    private async recordAccess(id: string): Promise<void> {
        await this.updateStats(stats => {
            const previous = typeof stats[id]?.accessCount === 'number' ? stats[id].accessCount : 0;
            stats[id] = { accessCount: previous + 1, lastAccessedAt: Date.now() };
        });
    }

    /** Best effort: stats must never make a memory operation fail. */
    private async updateStats(mutate: (stats: Record<string, AccessStats>) => void): Promise<void> {
        try {
            await withFileLock(`${this.statsPath}.lock`, async () => {
                const stats = await readStatsFile(this.statsPath);
                mutate(stats);
                await writeFileAtomic(this.statsPath, JSON.stringify(stats, null, 2) + '\n');
            }, { timeoutMs: 2000 });
        } catch (error) {
            this.log(`Could not update ${STATS_FILE_NAME}: ${describeError(error)}`);
        }
    }

    /**
     * Import `.agentMemory/data.json` (keyv-file) and stray `<uuid>.json`
     * files written by the old MemoryBankSync. Keys that already exist in
     * `memories/` are left alone. Imported sources are renamed to
     * `*.migrated`, never deleted.
     */
    private async migrateLegacyStorage(): Promise<MigrationReport> {
        const report: MigrationReport = { imported: 0, skipped: 0, movedFiles: [] };
        const sources = await readLegacySources(this.dataDir, this.log);
        if (sources.length === 0) {
            return report;
        }

        const records = newestByKey(sources.flatMap(source => source.records));
        const usedKeys = new Set<string>();
        const accessCounts: Record<string, number> = {};

        for (const record of records) {
            const key = uniqueKey(legacySafeKey(record.key, record.id), record.id, usedKeys);
            usedKeys.add(key);
            if (key !== record.key) {
                this.log(`Legacy key ${JSON.stringify(record.key)} is not a valid file key; importing it as "${key}"`);
            }

            const parsed = MemorySchema.safeParse({ ...record, key, content: normalizeContent(record.content) });
            if (!parsed.success) {
                report.skipped++;
                this.log(`Skipping legacy memory "${record.key}": ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
                continue;
            }

            const memory = parsed.data;
            const imported = await this.withMemoryLock(key, async (fileName, existing) => {
                if (existing) return false;
                await this.writeMemoryFile(fileName, memory);
                return true;
            });

            if (imported) {
                report.imported++;
                if (record.accessCount > 0) accessCounts[memory.id] = record.accessCount;
            } else {
                report.skipped++;
            }
        }

        if (Object.keys(accessCounts).length > 0) {
            await this.updateStats(stats => {
                for (const [id, accessCount] of Object.entries(accessCounts)) {
                    if (!stats[id]) stats[id] = { accessCount };
                }
            });
        }

        for (const source of sources) {
            const moved = await renameAside(source.filePath);
            if (moved) report.movedFiles.push(moved);
        }

        this.log(`Migrated legacy storage: ${report.imported} imported, ${report.skipped} skipped, moved aside ${report.movedFiles.map(f => path.basename(f)).join(', ')}`);
        return report;
    }
}

function buildMemory(input: MemoryInput, existing: Memory | null): Memory {
    const now = Date.now();
    return MemorySchema.parse({
        id: existing?.id ?? crypto.randomUUID(),
        key: input.key,
        type: input.type,
        content: normalizeContent(input.content),
        tags: unique(input.tags ?? []),
        relationships: {
            dependsOn: input.relationships?.dependsOn ?? [],
            implements: input.relationships?.implements ?? []
        },
        createdBy: existing?.createdBy ?? input.createdBy,
        createdAt: existing?.createdAt ?? now,
        updatedAt: existing ? Math.max(now, existing.updatedAt) : now,
        sourceFile: input.sourceFile ?? existing?.sourceFile
    });
}

// ---------------------------------------------------------------------------
// Read-only access for the dashboard
// ---------------------------------------------------------------------------

export interface ProjectMemory extends Memory {
    accessCount: number;
}

const projectDirectories = new Map<string, MemoryDirectory>();

/**
 * Read a project's memories without writing anything (no migration, no
 * stats). Projects that haven't been migrated yet are read from their legacy
 * `data.json`.
 */
export async function readProjectMemories(workspacePath: string): Promise<ProjectMemory[]> {
    const dataDir = path.join(workspacePath, DATA_DIR_NAME);
    const memoriesDir = path.join(dataDir, MEMORIES_DIR_NAME);

    let directory = projectDirectories.get(memoriesDir);
    if (!directory) {
        directory = new MemoryDirectory(memoriesDir, () => { });
        projectDirectories.set(memoriesDir, directory);
    }

    const [current, stats, legacySources] = await Promise.all([
        directory.scan(),
        readStatsFile(path.join(dataDir, STATS_FILE_NAME)),
        readLegacySources(dataDir, () => { })
    ]);

    const result: ProjectMemory[] = Array.from(current.values(), ({ memory }) => ({
        ...clone(memory),
        accessCount: stats[memory.id]?.accessCount ?? 0
    }));

    for (const record of newestByKey(legacySources.flatMap(source => source.records))) {
        if (current.has(record.key)) continue;
        const { accessCount, ...rest } = record;
        result.push({ ...rest, tags: [...rest.tags], accessCount });
    }

    return result;
}

// ---------------------------------------------------------------------------
// Legacy formats
// ---------------------------------------------------------------------------

interface LegacyRecord {
    id: string;
    key: string;
    type: MemoryType;
    content: string;
    tags: string[];
    relationships: { dependsOn: string[]; implements: string[] };
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    sourceFile?: string;
    accessCount: number;
}

interface LegacySource {
    filePath: string;
    records: LegacyRecord[];
}

async function readLegacySources(dataDir: string, log: Logger): Promise<LegacySource[]> {
    let names: string[];
    try {
        names = await fsp.readdir(dataDir);
    } catch (error: any) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }

    const sources: LegacySource[] = [];
    for (const name of names) {
        const isDataFile = name === LEGACY_DATA_FILE_NAME;
        if (!isDataFile && !LEGACY_STRAY_FILE.test(name)) continue;

        const filePath = path.join(dataDir, name);
        let parsed: unknown;
        try {
            parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
        } catch (error) {
            // Possibly mid-write by an older agentMemory process; try again next start.
            log(`Not migrating ${name} yet: ${describeError(error)}`);
            continue;
        }

        const raw = isDataFile ? parseKeyvFileCache(parsed) : [parsed];
        sources.push({
            filePath,
            records: raw.map(fromLegacyMemory).filter((r): r is LegacyRecord => r !== null)
        });
    }
    return sources;
}

/**
 * keyv-file format: `{cache: [["<namespace>:<key>", {value: "<JSON>"}], ...]}`,
 * where the JSON string is `{"value": <memory>, "expires": null}`. Entries for
 * `_index_<projectId>` hold key lists, not memories, and are skipped.
 */
export function parseKeyvFileCache(data: unknown): unknown[] {
    const cache = (data as any)?.cache;
    if (!Array.isArray(cache)) return [];

    const memories: unknown[] = [];
    for (const entry of cache) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [cacheKey, wrapper] = entry;
        if (typeof cacheKey === 'string') {
            const separator = cacheKey.indexOf(':');
            if (cacheKey.slice(separator + 1).startsWith('_index_')) continue;
        }

        let value = wrapper?.value;
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch {
                continue;
            }
        }
        if (value && typeof value === 'object' && 'value' in value) {
            memories.push((value as any).value);
        }
    }
    return memories;
}

function fromLegacyMemory(raw: any): LegacyRecord | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.key !== 'string' || typeof raw.content !== 'string') return null;

    const stringList = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    const createdAt = parseTime(raw.createdAt) ?? Date.now();
    const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const createdBy = metadata.createdBy ?? raw.createdBy;
    const sourceFile = metadata.sourceFile ?? raw.sourceFile;

    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
        key: raw.key,
        type: raw.type,
        content: raw.content,
        tags: stringList(raw.tags),
        relationships: {
            dependsOn: stringList(raw.relationships?.dependsOn),
            implements: stringList(raw.relationships?.implements)
        },
        createdBy: typeof createdBy === 'string' && createdBy ? createdBy : 'unknown',
        createdAt,
        updatedAt: parseTime(raw.updatedAt) ?? createdAt,
        sourceFile: typeof sourceFile === 'string' && sourceFile ? sourceFile : undefined,
        accessCount: typeof metadata.accessCount === 'number' ? metadata.accessCount : 0
    };
}

function newestByKey(records: LegacyRecord[]): LegacyRecord[] {
    const byKey = new Map<string, LegacyRecord>();
    for (const record of records) {
        const existing = byKey.get(record.key);
        if (!existing || record.updatedAt > existing.updatedAt) {
            byKey.set(record.key, record);
        }
    }
    return Array.from(byKey.values());
}

/** Old keys weren't validated; make one usable as a file key. */
function legacySafeKey(key: string, id: string): string {
    const cleaned = key
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\\/]+/g, '-')
        .replace(/\.{2,}/g, '.')
        .replace(/^([a-zA-Z]):/, '$1-')
        .trim()
        .slice(0, 200);
    return cleaned || `memory-${id.slice(0, 8)}`;
}

function uniqueKey(key: string, id: string, used: Set<string>): string {
    if (!used.has(key)) return key;
    return `${key.slice(0, 190)}-${id.slice(0, 8)}`;
}

/** Rename `filePath` to `<filePath>.migrated` (or `.migrated-N` if taken). */
async function renameAside(filePath: string): Promise<string | null> {
    for (let n = 1; n <= 100; n++) {
        const target = n === 1 ? `${filePath}.migrated` : `${filePath}.migrated-${n}`;
        if (await exists(target)) continue;
        try {
            await fsp.rename(filePath, target);
            return target;
        } catch (error: any) {
            // Another process got there first.
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Write to a temp file in the same directory, then rename it over `target`. */
export async function writeFileAtomic(target: string, data: string): Promise<void> {
    const tempPath = path.join(
        path.dirname(target),
        `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    );
    const handle = await fsp.open(tempPath, 'wx');
    try {
        await handle.writeFile(data, 'utf8');
        await handle.sync();
    } finally {
        await handle.close();
    }

    try {
        await renameWithRetry(tempPath, target);
    } catch (error) {
        await fsp.rm(tempPath, { force: true });
        throw error;
    }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try {
            await fsp.rename(from, to);
            return;
        } catch (error: any) {
            // Windows refuses to replace a file another process has open.
            const retryable = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code);
            if (!retryable || attempt >= 10) throw error;
            await delay(20 * (attempt + 1));
        }
    }
}

/**
 * Cross-process mutex: whoever creates `lockPath` first holds it. A lock older
 * than `staleMs` is assumed to belong to a crashed process and is removed.
 */
async function withFileLock<T>(
    lockPath: string,
    fn: () => Promise<T>,
    options: { timeoutMs?: number; staleMs?: number } = {}
): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 10000;
    const staleMs = options.staleMs ?? 15000;
    const deadline = Date.now() + timeoutMs;

    for (; ;) {
        try {
            const handle = await fsp.open(lockPath, 'wx');
            await handle.writeFile(`${process.pid}\n`);
            await handle.close();
            break;
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
        }

        try {
            const stat = await fsp.stat(lockPath);
            if (Date.now() - stat.mtimeMs > staleMs) {
                await fsp.rm(lockPath, { force: true });
                continue;
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }

        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${lockPath}`);
        }
        await delay(5 + Math.random() * 25);
    }

    try {
        return await fn();
    } finally {
        await fsp.rm(lockPath, { force: true }).catch(() => { });
    }
}

async function readStatsFile(statsPath: string): Promise<Record<string, AccessStats>> {
    try {
        const parsed = JSON.parse(await fsp.readFile(statsPath, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        // Missing or corrupt: start over. It only holds access counts.
    }
    return {};
}

async function exists(filePath: string): Promise<boolean> {
    try {
        await fsp.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function safeFileNameForKey(key: string): string | null {
    try {
        return fileNameForKey(key);
    } catch {
        return null;
    }
}

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}

function clone(memory: Memory): Memory {
    return structuredClone(memory);
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
    if (error && typeof error === 'object' && 'issues' in error && Array.isArray((error as any).issues)) {
        return (error as any).issues.map((i: any) => `${i.path.join('.') || 'memory'}: ${i.message}`).join(', ');
    }
    return error instanceof Error ? error.message : String(error);
}

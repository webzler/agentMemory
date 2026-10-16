import * as crypto from 'crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Memory, MemoryKeySchema, MemorySchema } from './schemas';

/**
 * On-disk format of a single memory: YAML frontmatter followed by the content
 * as the markdown body.
 *
 *   ---
 *   id: 6f1c...
 *   key: auth-flow
 *   type: architecture
 *   tags:
 *     - auth
 *   relationships:
 *     dependsOn: []
 *     implements: []
 *   createdBy: cline
 *   createdAt: 2026-10-16T09:30:00.000Z
 *   updatedAt: 2026-10-16T09:30:00.000Z
 *   ---
 *
 *   The memory content.
 */

const FRONTMATTER = /^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

// Keys that are already safe, lowercase file names are used as-is.
const CLEAN_KEY = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

export class InvalidMemoryKeyError extends Error {
    constructor(key: string, reason: string) {
        super(`Invalid memory key ${JSON.stringify(key)}: ${reason}`);
        this.name = 'InvalidMemoryKeyError';
    }
}

export function assertValidKey(key: string): void {
    const result = MemoryKeySchema.safeParse(key);
    if (!result.success) {
        throw new InvalidMemoryKeyError(key, result.error.issues.map(i => i.message).join(', '));
    }
}

/**
 * File name for a key. Clean keys (lowercase letters, digits, `-`, `_`) map to
 * `<key>.md`; every other key maps to `<slug>.<hash>.md`. The two forms can't
 * collide because clean keys never contain a dot, and every name is lowercase,
 * so case-insensitive file systems are safe too.
 */
export function fileNameForKey(key: string): string {
    assertValidKey(key);
    if (CLEAN_KEY.test(key) && !WINDOWS_RESERVED.test(key)) {
        return `${key}.md`;
    }
    return hashedFileName(key);
}

/**
 * File names to try for a key, in order. Only the first is used unless a hand
 * edit left a different memory (or an unparseable file) at that name.
 */
export function candidateFileNames(key: string): string[] {
    const names = [fileNameForKey(key), hashedFileName(key)];
    const base = hashedFileName(key).slice(0, -'.md'.length);
    for (let n = 2; n <= 20; n++) {
        names.push(`${base}-${n}.md`);
    }
    return Array.from(new Set(names));
}

function hashedFileName(key: string): string {
    let slug = key
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '');
    if (!slug) slug = 'memory';
    if (WINDOWS_RESERVED.test(slug)) slug = `_${slug}`;
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 12);
    return `${slug}.${hash}.md`;
}

export function isMemoryFileName(name: string): boolean {
    return name.endsWith('.md') && !name.startsWith('.');
}

/** Content is stored without trailing newlines so it round-trips exactly. */
export function normalizeContent(content: string): string {
    return content.replace(/(?:\r?\n)+$/, '');
}

export function serializeMemory(memory: Memory): string {
    const frontmatter: Record<string, unknown> = {
        id: memory.id,
        key: memory.key,
        type: memory.type,
        tags: memory.tags,
        relationships: {
            dependsOn: memory.relationships.dependsOn,
            implements: memory.relationships.implements
        },
        createdBy: memory.createdBy,
        createdAt: new Date(memory.createdAt).toISOString(),
        updatedAt: new Date(memory.updatedAt).toISOString()
    };
    if (memory.sourceFile) {
        frontmatter.sourceFile = memory.sourceFile;
    }

    const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
    return `---\n${yaml}---\n\n${normalizeContent(memory.content)}\n`;
}

/**
 * Parse a memory file. Hand-written files may leave out everything except
 * `type`: the key falls back to the file name, timestamps to the file's mtime.
 * Throws if the result still isn't a valid memory.
 */
export function parseMemoryFile(text: string, fallback: { fileName: string; mtimeMs: number }): Memory {
    let data: Record<string, any> = {};
    let body = text;

    const match = FRONTMATTER.exec(text);
    if (match) {
        const parsed = match[1] ? parseYaml(match[1]) : null;
        if (parsed !== null && parsed !== undefined) {
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('frontmatter is not a YAML mapping');
            }
            data = parsed;
        }
        body = text.slice(match[0].length).replace(/^\r?\n/, '');
    }

    const key = data.key !== undefined && data.key !== null
        ? String(data.key)
        : fallback.fileName.replace(/\.md$/, '');
    const createdAt = parseTime(data.createdAt) ?? fallback.mtimeMs;
    const relationships = isPlainObject(data.relationships) ? data.relationships : {};

    return MemorySchema.parse({
        id: data.id !== undefined && data.id !== null ? String(data.id) : stableId(key),
        key,
        type: data.type,
        content: normalizeContent(body),
        tags: toStringList(data.tags),
        relationships: {
            dependsOn: toStringList(relationships.dependsOn),
            implements: toStringList(relationships.implements)
        },
        createdBy: data.createdBy !== undefined && data.createdBy !== null && String(data.createdBy)
            ? String(data.createdBy)
            : 'unknown',
        createdAt,
        updatedAt: parseTime(data.updatedAt) ?? createdAt,
        sourceFile: typeof data.sourceFile === 'string' && data.sourceFile ? data.sourceFile : undefined
    });
}

export function parseTime(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
        return value.getTime();
    }
    if (typeof value === 'string' && value.trim()) {
        const asNumber = Number(value);
        if (Number.isFinite(asNumber)) return asNumber;
        const parsed = Date.parse(value);
        if (!isNaN(parsed)) return parsed;
    }
    return undefined;
}

function toStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter(v => v !== null && v !== undefined).map(v => String(v));
    }
    if (typeof value === 'string') {
        return value.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deterministic id for hand-written files that have no `id`, so it doesn't change between reads. */
function stableId(key: string): string {
    const hex = crypto.createHash('sha256').update(`agentmemory:${key}`, 'utf8').digest('hex');
    const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

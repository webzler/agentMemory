import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DATA_DIR_NAME, writeFileAtomic } from './memory-store';

/**
 * Working out which project an MCP server belongs to.
 *
 * Cline, Roo Code and Kilo Code start MCP servers from one global settings
 * file, so the command there can't name a workspace without the last VS Code
 * window to start winning for all of them. Instead, each window's extension
 * host, which is the parent process of the servers its agents start, records
 * "host pid -> workspace" in a shared hosts directory, and the server looks
 * up its parent pid there.
 */

export interface ResolvedWorkspace {
    path: string;
    source: 'argument' | 'host registry' | 'cwd';
}

export interface WorkspaceHints {
    /** `--workspace`, the legacy positional argument, or AGENTMEMORY_WORKSPACE. */
    explicit?: string;
    /** `--hosts-dir`: where extension hosts register their workspace. */
    hostsDir?: string;
    parentPid: number;
    cwd: string;
}

interface HostEntry {
    pid: number;
    workspacePath: string;
    updatedAt: number;
}

export async function resolveWorkspace(hints: WorkspaceHints): Promise<ResolvedWorkspace | null> {
    if (hints.explicit) {
        return { path: path.resolve(hints.explicit), source: 'argument' };
    }
    if (hints.hostsDir) {
        const registered = await lookupHostWorkspace(hints.hostsDir, hints.parentPid);
        if (registered) {
            return { path: registered, source: 'host registry' };
        }
    }
    const fromCwd = findProjectRoot(hints.cwd);
    return fromCwd ? { path: fromCwd, source: 'cwd' } : null;
}

/**
 * Nearest directory at or above `start` that has `.agentMemory` or `.git`.
 * The home directory and the file system root never count.
 */
export function findProjectRoot(start: string): string | null {
    const home = path.resolve(os.homedir());
    let dir = path.resolve(start);
    for (; ;) {
        const isRoot = path.dirname(dir) === dir;
        if (!isRoot && dir !== home) {
            if (fs.existsSync(path.join(dir, DATA_DIR_NAME)) || fs.existsSync(path.join(dir, '.git'))) {
                return dir;
            }
        }
        if (isRoot) return null;
        dir = path.dirname(dir);
    }
}

export async function registerHost(hostsDir: string, workspacePath: string, pid: number = process.pid): Promise<void> {
    await fsp.mkdir(hostsDir, { recursive: true });
    const entry: HostEntry = { pid, workspacePath, updatedAt: Date.now() };
    await writeFileAtomic(hostEntryPath(hostsDir, pid), JSON.stringify(entry, null, 2) + '\n');
    await pruneDeadHosts(hostsDir);
}

export function unregisterHost(hostsDir: string, pid: number = process.pid): void {
    try {
        fs.unlinkSync(hostEntryPath(hostsDir, pid));
    } catch {
        // Already gone.
    }
}

export async function lookupHostWorkspace(hostsDir: string, pid: number): Promise<string | null> {
    try {
        const entry = JSON.parse(await fsp.readFile(hostEntryPath(hostsDir, pid), 'utf8')) as Partial<HostEntry>;
        return typeof entry.workspacePath === 'string' && entry.workspacePath ? entry.workspacePath : null;
    } catch {
        return null;
    }
}

/** Remove entries left behind by extension hosts that crashed. */
async function pruneDeadHosts(hostsDir: string): Promise<void> {
    let names: string[];
    try {
        names = await fsp.readdir(hostsDir);
    } catch {
        return;
    }
    for (const name of names) {
        const match = /^(\d+)\.json$/.exec(name);
        if (match && !isProcessAlive(Number(match[1]))) {
            await fsp.rm(path.join(hostsDir, name), { force: true });
        }
    }
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error: any) {
        return error.code === 'EPERM';
    }
}

function hostEntryPath(hostsDir: string, pid: number): string {
    return path.join(hostsDir, `${pid}.json`);
}

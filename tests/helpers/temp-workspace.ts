import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/** A fresh workspace directory under os.tmpdir(). */
export async function makeTempWorkspace(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'agentmemory-test-'));
}

export async function removeTempWorkspace(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
}

export const silentLog = () => { };

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseCommandLine } from '../../src/mcp-server/server';
import { SocketBridge } from '../../src/mcp-server/socket-bridge';
import {
    findProjectRoot,
    lookupHostWorkspace,
    registerHost,
    resolveWorkspace,
    unregisterHost
} from '../../src/mcp-server/workspace';
import { makeTempWorkspace, removeTempWorkspace } from '../helpers/temp-workspace';

describe('workspace resolution', () => {
    let root: string;
    let hostsDir: string;
    let projectA: string;
    let projectB: string;

    beforeEach(async () => {
        root = await makeTempWorkspace();
        hostsDir = path.join(root, 'globalStorage', 'hosts');
        projectA = path.join(root, 'project-a');
        projectB = path.join(root, 'project-b');
        await fs.mkdir(path.join(projectA, '.git'), { recursive: true });
        await fs.mkdir(path.join(projectB, 'src', 'deep'), { recursive: true });
        await fs.mkdir(path.join(projectB, '.agentMemory'), { recursive: true });
    });

    afterEach(async () => {
        await removeTempWorkspace(root);
    });

    test('each extension host resolves to its own workspace', async () => {
        // Two VS Code windows: this process stands in for one host, its parent for the other
        await registerHost(hostsDir, projectA, process.pid);
        await registerHost(hostsDir, projectB, process.ppid);

        expect(await resolveWorkspace({ hostsDir, parentPid: process.pid, cwd: '/' }))
            .toEqual({ path: projectA, source: 'host registry' });
        expect(await resolveWorkspace({ hostsDir, parentPid: process.ppid, cwd: '/' }))
            .toEqual({ path: projectB, source: 'host registry' });
    });

    test('an explicit workspace wins over the registry and the cwd', async () => {
        await registerHost(hostsDir, projectA, process.pid);
        expect(await resolveWorkspace({ explicit: projectB, hostsDir, parentPid: process.pid, cwd: projectA }))
            .toEqual({ path: projectB, source: 'argument' });
    });

    test('falls back to the project containing the cwd', async () => {
        expect(await resolveWorkspace({ hostsDir, parentPid: 1, cwd: path.join(projectB, 'src', 'deep') }))
            .toEqual({ path: projectB, source: 'cwd' });
        expect(findProjectRoot(projectA)).toBe(projectA);
    });

    test('registering prunes entries of dead hosts; unregistering removes our own', async () => {
        await fs.mkdir(hostsDir, { recursive: true });
        await fs.writeFile(path.join(hostsDir, '999999.json'), JSON.stringify({ pid: 999999, workspacePath: projectA }));
        await registerHost(hostsDir, projectB, process.pid);

        expect(await fs.readdir(hostsDir)).toEqual([`${process.pid}.json`]);
        unregisterHost(hostsDir, process.pid);
        expect(await lookupHostWorkspace(hostsDir, process.pid)).toBeNull();
    });
});

describe('server command line', () => {
    test('reads the new flags', () => {
        const { hints, agentName } = parseCommandLine(['--hosts-dir', '/hosts', '--agent', 'cline'], {});
        expect(hints.hostsDir).toBe('/hosts');
        expect(hints.explicit).toBeUndefined();
        expect(agentName).toBe('cline');
    });

    test('accepts the legacy "<projectId> <workspacePath>" form', () => {
        expect(parseCommandLine(['my-project', '/work/my-project'], {}).hints.explicit).toBe('/work/my-project');
        expect(parseCommandLine(['--workspace', '/work/other'], {}).hints.explicit).toBe('/work/other');
        expect(parseCommandLine([], { AGENTMEMORY_WORKSPACE: '/env/ws', AGENTMEMORY_AGENT: 'roocode' }))
            .toMatchObject({ hints: { explicit: '/env/ws' }, agentName: 'roocode' });
    });
});

describe('socket bridge', () => {
    test('uses one socket per workspace path', () => {
        const a = SocketBridge.socketPathFor('/work/app');
        expect(SocketBridge.socketPathFor('/work/app')).toBe(a);
        expect(SocketBridge.socketPathFor('/other/app')).not.toBe(a);
        expect(path.basename(a)).toMatch(/^agentmemory-[0-9a-f]{16}\.sock$/);
    });
});

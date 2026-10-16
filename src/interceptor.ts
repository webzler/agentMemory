import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * Where an agent loads project rules from.
 *
 * agentMemory adds one file of its own (RULES_FILE_NAME) to each agent's rules
 * directory and never writes anywhere else, so memory-bank files, custom modes
 * and other config the user or agent maintains are left alone.
 */
export interface AgentRuleTarget {
    agent: string;
    /** VS Code Marketplace ID (lookups are case-insensitive). */
    extensionId: string;
    /** Rules directory, relative to the workspace root. The agent loads every file in it. */
    rulesDir: string;
    /**
     * Single-file rules the agent reads only while `rulesDir` is empty. Adding a
     * file to `rulesDir` would stop these loading, so the agent is skipped instead.
     */
    fallbackRuleFiles: string[];
}

// Continue is not listed: rules would point it at tools it can't call until the
// agentMemory MCP server is registered for it.
export const AGENT_RULE_TARGETS: AgentRuleTarget[] = [
    {
        agent: 'cline',
        extensionId: 'saoudrizwan.claude-dev',
        rulesDir: '.clinerules',
        fallbackRuleFiles: []
    },
    {
        agent: 'roocode',
        extensionId: 'RooVeterinaryInc.roo-cline',
        rulesDir: path.join('.roo', 'rules'),
        fallbackRuleFiles: ['.roorules', '.clinerules']
    },
    {
        agent: 'kilocode',
        extensionId: 'kilocode.Kilo-Code',
        rulesDir: path.join('.kilocode', 'rules'),
        fallbackRuleFiles: ['.kilocoderules', '.roorules', '.clinerules']
    }
];

export const RULES_FILE_NAME = 'agentmemory.md';

const MARKER_PATTERN = /^<!-- agentmemory:managed sha256=([0-9a-f]{16}) -->$/;

const RULES_BODY = `<!-- Created by the agentMemory VS Code extension. agentMemory only updates this file while the line above is present and the text below is unedited. Delete that line to keep your own changes. -->

# Project memory (agentMemory)

This workspace has a persistent project memory, available through the \`agentMemory\` MCP server. It keeps decisions and context across sessions so they don't have to be rediscovered.

**Before starting a non-trivial task**, call \`memory_search\` with a few keywords about it, and use \`memory_read\` to open any memory that looks relevant. Earlier decisions, conventions and known issues may already be recorded.

**After significant work**, such as an architectural decision, a new pattern or API, or a fix for a non-obvious bug, call \`memory_write\` to record what was done and why. If a memory on the topic already exists, use \`memory_update\` instead of writing a duplicate.

Quick questions and small edits don't need memory calls.

Memories are stored as readable markdown, one file per memory, in \`.agentMemory/memories/\`. They can be reviewed, edited and committed like any other file in the project.
`;

function bodyHash(body: string): string {
    return createHash('sha256').update(body.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

/** Prefix `body` with the marker that lets agentMemory recognise its own, unedited file. */
export function renderManagedFile(body: string): string {
    return `<!-- agentmemory:managed sha256=${bodyHash(body)} -->\n${body}`;
}

export const RULES_FILE_CONTENT = renderManagedFile(RULES_BODY);

/** True if `content` carries our marker and the text below it hasn't been edited. */
function isUneditedManagedFile(content: string): boolean {
    const newline = content.indexOf('\n');
    if (newline < 0) {
        return false;
    }
    const match = MARKER_PATTERN.exec(content.slice(0, newline).replace(/\r$/, ''));
    return match !== null && match[1] === bodyHash(content.slice(newline + 1));
}

async function statOrNull(filePath: string) {
    try {
        return await fs.stat(filePath);
    } catch {
        return null;
    }
}

async function readFileOrNull(filePath: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

async function containsFiles(dir: string): Promise<boolean> {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return false;
    }
    for (const entry of entries) {
        if (!entry.isDirectory() || await containsFiles(path.join(dir, entry.name))) {
            return true;
        }
    }
    return false;
}

export class InterceptorManager {
    constructor(
        private workspaceFolder: vscode.WorkspaceFolder,
        private outputChannel: vscode.OutputChannel
    ) { }

    async injectRules(): Promise<void> {
        const workspacePath = this.workspaceFolder.uri.fsPath;

        // Detect which agents are actually installed
        const installedAgents = this.detectInstalledAgents();

        if (installedAgents.length === 0) {
            this.outputChannel.appendLine('⚠️  No AI coding agents detected. Skipping rule injection.');
            return;
        }

        this.outputChannel.appendLine(`🔍 Detected agents: ${installedAgents.map(t => t.agent).join(', ')}`);

        for (const target of installedAgents) {
            await this.injectAgentRules(workspacePath, target);
        }
    }

    /**
     * Detect which AI coding agents are installed
     */
    private detectInstalledAgents(): AgentRuleTarget[] {
        return AGENT_RULE_TARGETS.filter(target => {
            const installed = vscode.extensions.getExtension(target.extensionId) !== undefined;
            if (installed) {
                this.outputChannel.appendLine(`  ✅ ${target.agent}: ${target.extensionId}`);
            }
            return installed;
        });
    }

    /**
     * Create agentMemory's rules file for one agent if it's missing, or refresh it
     * if it's still our unedited copy of older guidance. Anything else is left as is.
     */
    private async injectAgentRules(workspacePath: string, target: AgentRuleTarget): Promise<void> {
        const rulesDir = path.join(workspacePath, target.rulesDir);
        const rulesFile = path.join(rulesDir, RULES_FILE_NAME);
        const displayPath = path.join(target.rulesDir, RULES_FILE_NAME);

        try {
            const dirStat = await statOrNull(rulesDir);
            if (dirStat && !dirStat.isDirectory()) {
                this.outputChannel.appendLine(`  ⏭️  ${target.agent}: ${target.rulesDir} is a file, not a directory. Leaving it unchanged.`);
                return;
            }

            const existing = await readFileOrNull(rulesFile);

            if (existing === null) {
                const fallback = await this.findActiveFallbackRuleFile(workspacePath, rulesDir, target);
                if (fallback) {
                    this.outputChannel.appendLine(`  ⏭️  ${target.agent}: not adding ${displayPath}, it would stop ${fallback} from loading.`);
                    return;
                }
                await fs.mkdir(rulesDir, { recursive: true });
                await fs.writeFile(rulesFile, RULES_FILE_CONTENT, { encoding: 'utf-8', flag: 'wx' });
                this.outputChannel.appendLine(`  📄 Created: ${displayPath}`);
                return;
            }

            // Compare without line endings so a CRLF checkout isn't rewritten every activation
            if (existing.replace(/\r\n/g, '\n') === RULES_FILE_CONTENT) {
                return;
            }

            if (!isUneditedManagedFile(existing)) {
                this.outputChannel.appendLine(`  ℹ️  ${displayPath} has been edited. Leaving it unchanged.`);
                return;
            }

            await fs.writeFile(rulesFile, RULES_FILE_CONTENT, 'utf-8');
            this.outputChannel.appendLine(`  🔄 Updated: ${displayPath}`);
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                return; // Appeared between our check and write; leave it to whoever created it
            }
            this.outputChannel.appendLine(`  ❌ Failed to write ${displayPath}: ${error.message}`);
        }
    }

    /**
     * The fallback rule file the agent currently loads, if adding a file to its
     * (empty) rules directory would replace it.
     */
    private async findActiveFallbackRuleFile(
        workspacePath: string,
        rulesDir: string,
        target: AgentRuleTarget
    ): Promise<string | null> {
        if (await containsFiles(rulesDir)) {
            return null;
        }
        for (const file of target.fallbackRuleFiles) {
            const stat = await statOrNull(path.join(workspacePath, file));
            if (stat?.isFile() && stat.size > 0) {
                return file;
            }
        }
        return null;
    }
}

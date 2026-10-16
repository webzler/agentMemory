import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { writeFileAtomic } from './mcp-server/memory-store';
import { registerHost } from './mcp-server/workspace';

interface AgentInfo {
    name: string;
    /** Marketplace ids the agent has shipped under; the first one installed is used. */
    extensionIds: string[];
    /** MCP settings file, relative to the agent's global storage folder. */
    settingsFile?: string;
}

const AGENTS: AgentInfo[] = [
    { name: 'cline', extensionIds: ['saoudrizwan.claude-dev'], settingsFile: path.join('settings', 'cline_mcp_settings.json') },
    { name: 'roocode', extensionIds: ['rooveterinaryinc.roo-cline', 'roo-cline.roo-cline', 'roo-code.roo-code'], settingsFile: path.join('settings', 'mcp_settings.json') },
    { name: 'kilocode', extensionIds: ['kilocode.kilo-code'], settingsFile: path.join('settings', 'mcp_settings.json') },
    { name: 'continue', extensionIds: ['continue.continue'] },
    { name: 'cursor', extensionIds: ['cursor.cursor'] }
];

export class ConfigManager {
    constructor(
        private context: vscode.ExtensionContext,
        private workspaceFolder: vscode.WorkspaceFolder,
        private outputChannel: vscode.OutputChannel
    ) { }

    /**
     * Where each window's extension host records its workspace, so the MCP
     * servers its agents start know which project they serve.
     */
    get hostsDir(): string {
        return path.join(this.context.globalStorageUri.fsPath, 'hosts');
    }

    async ensureSetup(): Promise<void> {
        try {
            await registerHost(this.hostsDir, this.workspaceFolder.uri.fsPath);
        } catch (error: any) {
            this.outputChannel.appendLine(`⚠️  Could not register workspace for MCP servers: ${error.message}`);
        }

        // Get the path to the bundled MCP server
        const serverPath = path.join(this.context.extensionPath, 'out', 'mcp-server', 'server.js');

        // Detect installed agents
        const installedAgents = this.findInstalledAgents();

        if (installedAgents.length === 0) {
            this.outputChannel.appendLine('⚠️  No AI coding agents detected. Skipping MCP configuration.');
            return;
        }

        this.outputChannel.appendLine(`📡 Detected agents: ${installedAgents.map(a => a.agent.name).join(', ')}`);

        // Configure each agent's settings file
        for (const { agent, extensionId } of installedAgents) {
            if (!agent.settingsFile) {
                this.outputChannel.appendLine(`⚠️  Unknown settings path for ${agent.name}`);
                continue;
            }

            // The agents' settings are global, shared by every window, so the
            // command names no workspace: the server looks it up in hostsDir
            // by its parent process, this window's extension host.
            const mcpServerConfig = {
                command: process.execPath,
                args: [serverPath, '--hosts-dir', this.hostsDir],
                env: {
                    ELECTRON_RUN_AS_NODE: '1',
                    AGENTMEMORY_AGENT: agent.name
                }
            };

            await this.updateAgentMCPSettings(this.getAgentSettingsPath(extensionId, agent.settingsFile), mcpServerConfig, agent.name);
        }
    }

    /**
     * Get the path to an agent's MCP settings file. Our own global storage is
     * `<user data>/User/globalStorage/<our id>`; agents keep theirs beside it.
     */
    private getAgentSettingsPath(extensionId: string, settingsFile: string): string {
        const globalStorageRoot = path.dirname(this.context.globalStorageUri.fsPath);
        return path.join(globalStorageRoot, extensionId.toLowerCase(), settingsFile);
    }

    /**
     * Update an agent's MCP settings file with agentMemory server configuration
     */
    private async updateAgentMCPSettings(
        settingsPath: string,
        mcpConfig: { command: string; args: string[]; env: Record<string, string> },
        agentName: string
    ): Promise<void> {
        try {
            // Read existing settings or create new
            let settings: any = { mcpServers: {} };
            let content: string | undefined;
            try {
                content = await fs.readFile(settingsPath, 'utf-8');
            } catch (error: any) {
                if (error.code !== 'ENOENT') throw error;
                // File doesn't exist, use default structure
                this.outputChannel.appendLine(`📝 Creating new ${agentName} settings file`);
            }

            if (content !== undefined) {
                try {
                    settings = JSON.parse(content);
                } catch {
                    // Never overwrite a settings file we can't parse: it has the user's other servers.
                    this.outputChannel.appendLine(`⚠️  ${settingsPath} is not valid JSON; leaving ${agentName} unconfigured`);
                    return;
                }
                if (!settings.mcpServers) {
                    settings.mcpServers = {};
                }
            }

            // Keep the user's own fields on the entry (disabled, autoApprove, ...)
            const previous = settings.mcpServers['agentMemory'];
            const next = {
                ...previous,
                command: mcpConfig.command,
                args: mcpConfig.args,
                env: { ...(previous?.env ?? {}), ...mcpConfig.env }
            };

            if (JSON.stringify(previous) === JSON.stringify(next)) {
                this.outputChannel.appendLine(`✓ ${agentName} MCP settings are up to date`);
                return;
            }

            settings.mcpServers['agentMemory'] = next;
            await fs.mkdir(path.dirname(settingsPath), { recursive: true });
            await writeFileAtomic(settingsPath, JSON.stringify(settings, null, 2));

            if (previous) {
                this.outputChannel.appendLine(`🔄 Updated ${agentName} MCP settings`);
            } else {
                this.outputChannel.appendLine(`✅ Configured ${agentName} MCP settings`);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Failed to configure ${agentName}: ${error.message}`);
        }
    }

    /**
     * Detect which AI coding agents are installed
     */
    async detectInstalledAgents(): Promise<string[]> {
        return this.findInstalledAgents().map(({ agent }) => agent.name);
    }

    private findInstalledAgents(): Array<{ agent: AgentInfo; extensionId: string }> {
        const installed: Array<{ agent: AgentInfo; extensionId: string }> = [];
        for (const agent of AGENTS) {
            for (const id of agent.extensionIds) {
                const extension = vscode.extensions.getExtension(id);
                if (extension) {
                    installed.push({ agent, extensionId: extension.id });
                    break;
                }
            }
        }
        return installed;
    }
}

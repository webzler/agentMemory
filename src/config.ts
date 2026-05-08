import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ConfigManager {
    constructor(
        private context: vscode.ExtensionContext,
        private workspaceFolder: vscode.WorkspaceFolder,
        private outputChannel: vscode.OutputChannel
    ) { }

    async ensureSetup(): Promise<void> {
        const projectId = path.basename(this.workspaceFolder.uri.fsPath);

        // Get the path to the bundled MCP server
        const serverPath = path.join(this.context.extensionPath, 'out', 'mcp-server', 'server.js');
        const workspacePath = this.workspaceFolder.uri.fsPath;

        // Define MCP server configuration (stdio command format)
        const mcpServerConfig = {
            command: 'node',
            args: [serverPath, projectId, workspacePath]
        };

        // Detect installed agents
        const installedAgents = await this.detectInstalledAgents();

        if (installedAgents.length === 0) {
            this.outputChannel.appendLine('⚠️  No AI coding agents detected. Skipping MCP configuration.');
            return;
        }

        this.outputChannel.appendLine(`📡 Detected agents: ${installedAgents.join(', ')}`);

        // Configure each agent's settings file
        for (const agent of installedAgents) {
            // OpenCode uses opencode.json (handled by InterceptorManager), skip VS Code settings
            if (agent === 'opencode') {
                this.outputChannel.appendLine(`  ℹ️  opencode: configured via opencode.json (handled by interceptor)`);
                continue;
            }

            const settingsPath = this.getAgentSettingsPath(agent);
            if (!settingsPath) {
                this.outputChannel.appendLine(`⚠️  Unknown settings path for ${agent}`);
                continue;
            }

            await this.updateAgentMCPSettings(settingsPath, mcpServerConfig, agent);
        }
    }

    /**
     * Get the path to an agent's MCP settings file
     */
    private getAgentSettingsPath(agent: string): string | null {
        const homedir = require('os').homedir();
        const paths: Record<string, string> = {
            'kilocode': `${homedir}/Library/Application Support/Code/User/globalStorage/kilocode.kilo-code/settings/mcp_settings.json`,
            'cline': `${homedir}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`,
            'roocode': `${homedir}/Library/Application Support/Code/User/globalStorage/roo-code.roo-code/settings/mcp_settings.json`
        };
        return paths[agent] || null;
    }

    /**
     * Update an agent's MCP settings file with agentMemory server configuration
     */
    private async updateAgentMCPSettings(
        settingsPath: string,
        mcpConfig: any,
        agentName: string
    ): Promise<void> {
        try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(settingsPath), { recursive: true });

            // Read existing settings or create new
            let settings: any = { mcpServers: {} };
            try {
                const content = await fs.readFile(settingsPath, 'utf-8');
                settings = JSON.parse(content);
                if (!settings.mcpServers) {
                    settings.mcpServers = {};
                }
            } catch (error) {
                // File doesn't exist, use default structure
                this.outputChannel.appendLine(`📝 Creating new ${agentName} settings file`);
            }

            // Always update agentMemory server (to ensure format is current)
            const wasPresent = !!settings.mcpServers['agentMemory'];
            settings.mcpServers['agentMemory'] = mcpConfig;
            await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

            if (wasPresent) {
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
        const installed: string[] = [];
        const agentExtensions = {
            'cline': 'saoudrizwan.claude-dev',
            'roocode': 'roo-code.roo-code',
            'kilocode': 'kilocode.kilo-code',
            'continue': 'continue.continue',
            'cursor': 'cursor.cursor'
        };

        for (const [agent, extensionId] of Object.entries(agentExtensions)) {
            const extension = vscode.extensions.getExtension(extensionId);
            if (extension) {
                installed.push(agent);
            }
        }

        // Detect OpenCode by checking for opencode.json or .opencode/ directory
        const workspacePath = this.workspaceFolder.uri.fsPath;

        try {
            await fs.access(path.join(workspacePath, 'opencode.json'));
            installed.push('opencode');
            this.outputChannel.appendLine('  ✅ opencode: opencode.json found');
        } catch {
            try {
                await fs.access(path.join(workspacePath, '.opencode'));
                installed.push('opencode');
                this.outputChannel.appendLine('  ✅ opencode: .opencode/ directory found');
            } catch {
                // OpenCode not detected
            }
        }

        return installed;
    }
}

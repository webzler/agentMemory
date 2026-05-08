import * as fs from 'fs';
import * as path from 'path';

export const ALL_AGENTS: Record<string, { name: string; fullName: string; description: string; memoryBankPath: string; fileMapping: Record<string, { type: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision'; tags: string[] }> }> = {
    kilocode: {
        name: 'kilocode',
        fullName: 'KiloCode',
        description: 'KiloCode VS Code Extension',
        memoryBankPath: '.kilocode/rules/memory-bank',
        fileMapping: {
            'brief.md': { type: 'architecture', tags: ['overview', 'project'] },
            'product.md': { type: 'feature', tags: ['product', 'features'] },
            'context.md': { type: 'bug', tags: ['context', 'issues'] },
            'architecture.md': { type: 'architecture', tags: ['design', 'system'] },
            'tech.md': { type: 'decision', tags: ['technology', 'stack'] }
        }
    },
    cline: {
        name: 'cline',
        fullName: 'Cline',
        description: 'Cline VS Code Extension',
        memoryBankPath: '.clinerules/memory-bank',
        fileMapping: {
            'projectBrief.md': { type: 'architecture', tags: ['overview', 'project'] },
            'productContext.md': { type: 'feature', tags: ['product', 'goals'] },
            'activeContext.md': { type: 'pattern', tags: ['current', 'focus'] },
            'systemPatterns.md': { type: 'pattern', tags: ['patterns', 'design'] },
            'techContext.md': { type: 'decision', tags: ['technology', 'decisions'] },
            'progress.md': { type: 'feature', tags: ['progress', 'status'] }
        }
    },
    roocode: {
        name: 'roocode',
        fullName: 'RooCode',
        description: 'RooCode VS Code Extension',
        memoryBankPath: '.roo/memory-bank',
        fileMapping: {
            'projectBrief.md': { type: 'architecture', tags: ['overview', 'project'] },
            'productContext.md': { type: 'feature', tags: ['product', 'vision'] },
            'activeContext.md': { type: 'pattern', tags: ['current', 'work'] },
            'systemPatterns.md': { type: 'pattern', tags: ['patterns', 'architecture'] },
            'techContext.md': { type: 'decision', tags: ['technology', 'stack'] },
            'progress.md': { type: 'feature', tags: ['progress', 'tracking'] },
            'decisionLog.md': { type: 'decision', tags: ['decisions', 'log'] }
        }
    },
    opencode: {
        name: 'opencode',
        fullName: 'OpenCode',
        description: 'OpenCode Terminal TUI Agent',
        memoryBankPath: '.opencode/memory-bank',
        fileMapping: {
            'architecture.md': { type: 'architecture', tags: ['design', 'system', 'opencode'] },
            'patterns.md': { type: 'pattern', tags: ['patterns', 'design', 'opencode'] },
            'decisions.md': { type: 'decision', tags: ['decisions', 'tech', 'opencode'] },
            'features.md': { type: 'feature', tags: ['features', 'product', 'opencode'] }
        }
    }
};

export type AgentName = keyof typeof ALL_AGENTS;

export interface AgentConfigData {
    selectedAgents: AgentName[];
    createdAt: string;
    updatedAt: string;
}

export class AgentConfig {
    private configPath: string;

    constructor(private workspacePath: string) {
        this.configPath = path.join(workspacePath, '.agentMemory', 'agents.json');
    }

    /**
     * Detect which agents are "present" in the workspace by checking for their
     * configuration files or directories.
     */
    detectPresentAgents(): AgentName[] {
        const present: AgentName[] = [];
        for (const [key, agent] of Object.entries(ALL_AGENTS)) {
            const agentPath = path.join(this.workspacePath, agent.memoryBankPath);
            try {
                fs.accessSync(agentPath);
                present.push(key as AgentName);
            } catch {
                // Also check for opencode-specific files
                if (key === 'opencode') {
                    try {
                        fs.accessSync(path.join(this.workspacePath, 'opencode.json'));
                        present.push('opencode');
                    } catch {
                        try {
                            fs.accessSync(path.join(this.workspacePath, '.opencode'));
                            present.push('opencode');
                        } catch {
                            // not present
                        }
                    }
                }
            }
        }
        return present;
    }

    /**
     * Check if agents.json already exists
     */
    exists(): boolean {
        return fs.existsSync(this.configPath);
    }

    /**
     * Read selected agents from agents.json.
     * Returns null if no config exists.
     */
    read(): AgentConfigData | null {
        try {
            if (!fs.existsSync(this.configPath)) {
                return null;
            }
            const content = fs.readFileSync(this.configPath, 'utf-8');
            const data = JSON.parse(content) as AgentConfigData;
            // Validate agent names
            data.selectedAgents = data.selectedAgents.filter(a => ALL_AGENTS[a as AgentName] !== undefined);
            return data;
        } catch (error) {
            console.error(`[AgentConfig] Failed to read config: ${error}`);
            return null;
        }
    }

    /**
     * Write selected agents to agents.json
     */
    write(selectedAgents: AgentName[]): AgentConfigData {
        const data: AgentConfigData = {
            selectedAgents: [...new Set(selectedAgents)], // deduplicate
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
            console.error(`[AgentConfig] Saved config: ${data.selectedAgents.join(', ')}`);
        } catch (error) {
            console.error(`[AgentConfig] Failed to write config: ${error}`);
        }
        return data;
    }

    /**
     * Update only selected agents, preserving createdAt
     */
    updateAgents(selectedAgents: AgentName[]): AgentConfigData {
        const existing = this.read();
        const data: AgentConfigData = {
            selectedAgents: [...new Set(selectedAgents)],
            createdAt: existing?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
            console.error(`[AgentConfig] Updated config: ${data.selectedAgents.join(', ')}`);
        } catch (error) {
            console.error(`[AgentConfig] Failed to update config: ${error}`);
        }
        return data;
    }

    /**
     * Get the list of agents that should be active.
     * This reads the config. If no config exists, returns all present agents or all agents as fallback.
     */
    getActiveAgents(): AgentName[] {
        const config = this.read();
        if (config && config.selectedAgents.length > 0) {
            return config.selectedAgents;
        }
        const present = this.detectPresentAgents();
        if (present.length > 0) {
            return present;
        }
        // Fallback: none active until configured
        return [];
    }

    /**
     * Returns agent configuration objects for active agents
     */
    getActiveAgentConfigs(): Array<typeof ALL_AGENTS[AgentName]> {
        const active = this.getActiveAgents();
        return active.map(name => ALL_AGENTS[name]).filter(Boolean);
    }
}

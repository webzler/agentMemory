import { StorageManager } from './storage';
import { CacheManager } from './cache';
import { MemoryBankSync } from './memory-bank-sync';
import { AgentConfig, AgentConfigData, ALL_AGENTS, AgentName } from './agent-config';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface Memory {
    id: string;
    projectId: string;
    key: string;
    type: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision';
    content: string;
    tags: string[];
    relationships: {
        dependsOn: string[];
        implements: string[];
    };
    metadata: {
        accessCount: number;
        createdBy: string;
        sourceFile?: string; // Match MemoryBankSync interface
    };
    createdAt: number;
    updatedAt: number;
}

interface ToolCallParams {
    projectId: string;
    [key: string]: any;
}

export class MCPTools {
    private storage: StorageManager;
    private cache: CacheManager;
    private syncEngine?: MemoryBankSync;
    private agentConfig?: AgentConfig;
    private workspacePath: string;

    constructor(storage: StorageManager, cache: CacheManager, syncEngine?: MemoryBankSync, workspacePath?: string) {
        this.storage = storage;
        this.cache = cache;
        this.syncEngine = syncEngine;
        this.workspacePath = workspacePath || process.cwd();
        if (this.workspacePath) {
            this.agentConfig = new AgentConfig(this.workspacePath);
        }
    }

    /**
     * Tool 1: memory_write - Store new memory
     */
    async memory_write(params: ToolCallParams): Promise<{ success: boolean; id: string }> {
        const { projectId, key, type, content, tags = [], relationships = { dependsOn: [], implements: [] }, createdBy = 'agent' } = params;

        const memory: Memory = {
            id: uuidv4(),
            projectId,
            key,
            type,
            content,
            tags,
            relationships,
            metadata: {
                accessCount: 0,
                createdBy
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.storage.write(projectId, memory);

        // Update cache
        const cacheKey = `${projectId}:${key}`;
        this.cache.set(cacheKey, memory);

        // Sync to agent markdown files (async, no await)
        if (this.syncEngine) {
            this.syncEngine.exportToAgents(memory).catch(err => {
                console.error('[MCPTools] Failed to sync to markdown:', err);
            });
        }

        return { success: true, id: memory.id };
    }

    /**
     * Tool 2: memory_read - Get exact key (2μs target)
     */
    async memory_read(params: ToolCallParams): Promise<Memory | null> {
        const { projectId, key } = params;
        const cacheKey = `${projectId}:${key}`;

        // Try cache first
        const cached = this.cache.get<Memory>(cacheKey);
        if (cached) {
            return cached;
        }

        // Fallback to storage
        const memory = await this.storage.read(projectId, key);
        if (memory) {
            this.cache.set(cacheKey, memory);
        }

        return memory;
    }

    /**
     * Tool 3: memory_search - Keyword/tag search (100μs target)
     */
    async memory_search(params: ToolCallParams): Promise<Memory[]> {
        const { projectId, query, tags, type, limit = 10 } = params;

        const results = await this.storage.search(projectId, query, tags, type);

        // Sort by relevance (access count and recency)
        results.sort((a, b) => {
            const scoreA = a.metadata.accessCount * 0.5 + (Date.now() - a.updatedAt) * -0.0001;
            const scoreB = b.metadata.accessCount * 0.5 + (Date.now() - b.updatedAt) * -0.0001;
            return scoreB - scoreA;
        });

        return results.slice(0, limit);
    }

    /**
     * Tool 4: memory_list - List by type (50μs target)
     */
    async memory_list(params: ToolCallParams): Promise<Memory[]> {
        const { projectId, type } = params;
        return this.storage.list(projectId, type);
    }

    /**
     * Tool 5: memory_update - Append to existing (200μs target)
     */
    async memory_update(params: ToolCallParams): Promise<{ success: boolean; memory: Memory | null }> {
        const { projectId, key, content, tags, relationships } = params;

        const updates: Partial<Memory> = {};
        if (content !== undefined) updates.content = content;
        if (tags !== undefined) updates.tags = tags;
        if (relationships !== undefined) updates.relationships = relationships;

        const updated = await this.storage.update(projectId, key, updates);

        if (updated) {
            // Update cache
            const cacheKey = `${projectId}:${key}`;
            this.cache.set(cacheKey, updated);
        }

        return { success: !!updated, memory: updated };
    }

    /**
     * Tool 6: project_init - Auto-detect workspace and setup agents
     *
     * Supports a comma-separated `agents` argument for non-interactive
     * configuration: e.g., { agents: "kilocode,opencode" }.
     * If omitted and no agents.json exists, interactive readline prompts
     * the user (only in a TTY environment).
     */
    async project_init(params: ToolCallParams): Promise<{ success: boolean; projectId: string; configuredAgents: string[] }> {
        const { projectId, agents } = params;
        await this.storage.initProject(projectId);

        let configuredAgents: string[] = [];

        if (this.agentConfig) {
            const existing = this.agentConfig.read();
            if (existing && existing.selectedAgents.length > 0) {
                configuredAgents = existing.selectedAgents;
                console.error(`[project_init] Using existing agent config: ${configuredAgents.join(', ')}`);
            } else if (typeof agents === 'string' && agents.trim()) {
                const requestedAgents = agents.split(',').map(a => a.trim().toLowerCase() as AgentName);
                const validAgents = requestedAgents.filter(a => ALL_AGENTS[a] !== undefined);
                if (validAgents.length > 0) {
                    this.agentConfig.write(validAgents);
                    configuredAgents = validAgents;
                    console.error(`[project_init] Agents configured from CLI args: ${configuredAgents.join(', ')}`);
                }
            } else if (process.stdin.isTTY) {
                try {
                    configuredAgents = await this.interactiveAgentPrompt();
                    if (configuredAgents.length > 0) {
                        this.agentConfig.write(configuredAgents);
                        console.error(`[project_init] Agents configured interactively: ${configuredAgents.join(', ')}`);
                    }
                } catch (error) {
                    console.error(`[project_init] Interactive prompt failed: ${error}`);
                }
            } else {
                console.error('[project_init] No TTY available, skipping interactive agent selection. Pass --agents or configure later.');
            }
            if (configuredAgents.length === 0) {
                const detected = this.agentConfig.detectPresentAgents();
                if (detected.length > 0) {
                    this.agentConfig.write(detected);
                    configuredAgents = detected;
                    console.error(`[project_init] Auto-detected present agents: ${configuredAgents.join(', ')}`);
                }
            }
        }

        // Auto-create .agent structure if it doesn't exist (Antigravity support)
        try {
            // @ts-ignore
            const storagePath = this.storage.baseDir;
            if (storagePath) {
                const projectRoot = path.dirname(storagePath);
                const agentDir = path.join(projectRoot, '.agent');
                const workflowsDir = path.join(agentDir, 'workflows');

                if (!fs.existsSync(workflowsDir)) {
                    fs.mkdirSync(workflowsDir, { recursive: true });
                }

                const workflowFile = path.join(workflowsDir, 'update-memory.md');
                if (!fs.existsSync(workflowFile)) {
                    const activeAgents = configuredAgents.length > 0 ? configuredAgents.map(a => ALL_AGENTS[a]?.fullName || a).join(', ') : 'All';
                    const workflowContent = `---
description: How to update the project memory bank with new findings
---

# Update Memory Bank

Follow this workflow to document important architectural decisions, patterns, or features.

**Active Agents:** ${activeAgents}

1. **Search First**: Check if a similar memory already exists.
   \`\`\`bash
   # Use the memory_search tool
   memory_search({ "query": "<topic>" })
   \`\`\`

2. **Decide Action**:
   - If it's **new**, use \`memory_write\`.
   - If it **exists** but needs updates, use \`memory_update\` (or \`memory_write\` with the same key to overwrite).

3. **Write Memory**:
   Use the \`memory_write\` tool. Ensure you provide meaningful tags.
   - \`type\`: Choose one of \`architecture\`, \`pattern\`, \`decision\`, \`feature\`.
   - \`key\`: A unique, kebab-case identifier (e.g., \`auth-flow-v2\`).
   
   Example:
   \`\`\`javascript
   memory_write({
     "key": "feature-x-impl",
     "type": "feature",
     "content": "# Feature X\\n\\nImplementation details...",
     "tags": ["frontend", "react"]
   })
   \`\`\`

4. **Verify**: Run \`memory_stats\` to confirm the total memory count increased or changed as expected.
`;
                    fs.writeFileSync(workflowFile, workflowContent);
                }
            }
        } catch (error) {
            console.error('[project_init] Failed to scaffold .agent directory:', error);
        }

        return { success: true, projectId, configuredAgents };
    }

    /**
     * Tool 6.5: configure_agents - Select which agents to enable/disable for syncing
     */
    async configure_agents(params: ToolCallParams): Promise<{ success: boolean; selectedAgents: string[]; previousAgents: string[] }> {
        const { agents, interactive } = params;
        let selectedAgents: string[] = [];
        let previousAgents: string[] = [];

        if (!this.agentConfig) {
            return { success: false, selectedAgents: [], previousAgents: [] };
        }

        const existing = this.agentConfig.read();
        if (existing) {
            previousAgents = [...existing.selectedAgents];
        }

        if (typeof agents === 'string' && agents.trim()) {
            const requestedAgents = agents.split(',').map(a => a.trim().toLowerCase() as AgentName);
            selectedAgents = requestedAgents.filter(a => ALL_AGENTS[a] !== undefined);
        } else if (interactive !== false && process.stdin.isTTY) {
            try {
                selectedAgents = await this.interactiveAgentPrompt(previousAgents);
            } catch (error) {
                console.error(`[configure_agents] Interactive prompt failed: ${error}`);
            }
        }

        if (selectedAgents.length === 0) {
            // Keep previous selection or fall back to detected
            if (previousAgents.length > 0) {
                selectedAgents = previousAgents;
            } else {
                selectedAgents = this.agentConfig.detectPresentAgents();
            }
        }

        if (selectedAgents.length > 0) {
            this.agentConfig.write(selectedAgents);
            console.error(`[configure_agents] Agents updated: ${selectedAgents.join(', ')}`);
        }

        return { success: true, selectedAgents, previousAgents };
    }

    /**
     * Interactive readline prompt for selecting agents
     */
    private async interactiveAgentPrompt(defaultSelection: string[] = []): Promise<AgentName[]> {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const choices = Object.entries(ALL_AGENTS).map(([key, agent]) => {
                const index = Object.keys(ALL_AGENTS).indexOf(key) + 1;
                const checked = defaultSelection.includes(key) ? '✅' : '⬜';
                return `${index}. ${checked} ${agent.fullName} - ${agent.description}`;
            }).join('\n');

            console.error('\n╔════════════════════════════════════════════════════╗');
            console.error('║  Select AI Coding Agents for Memory Bank Sync      ║');
            console.error('╠════════════════════════════════════════════════════╣');
            console.error(choices);
            console.error('╠════════════════════════════════════════════════════╣');
            console.error('║  Enter numbers separated by commas (e.g., 1,3,4)   ║');
            console.error('║  Or type "all" to select every agent               ║');
            console.error('╚════════════════════════════════════════════════════╝\n');

            rl.question('Your selection: ', (answer) => {
                rl.close();
                const trimmed = answer.trim().toLowerCase();

                if (trimmed === 'all') {
                    resolve(Object.keys(ALL_AGENTS) as AgentName[]);
                    return;
                }

                const indices = trimmed.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                const keys = Object.keys(ALL_AGENTS) as AgentName[];
                const selected = indices
                    .map(idx => keys[idx - 1])
                    .filter((k): k is AgentName => k !== undefined && ALL_AGENTS[k] !== undefined);

                resolve(selected);
            });
        });
    }

    /**
     * Tool 7: memory_stats - Usage analytics (20μs target)
     */
    async memory_stats(params: ToolCallParams): Promise<any> {
        const { projectId } = params;
        const stats = await this.storage.getStats(projectId);
        const cacheStats = this.cache.getStats();

        // Show active agent configuration
        let activeAgents: string[] = [];
        let configExists = false;
        if (this.agentConfig) {
            const config = this.agentConfig.read();
            if (config) {
                activeAgents = config.selectedAgents;
                configExists = true;
            }
            if (activeAgents.length === 0) {
                activeAgents = this.agentConfig.detectPresentAgents();
            }
        }

        const syncStatus = this.syncEngine ? {
            enabled: true,
            agents: activeAgents,
            configExists,
            allSupportedAgents: Object.keys(ALL_AGENTS)
        } : { enabled: false };

        return {
            ...stats,
            cache: cacheStats,
            sync: syncStatus
        };
    }

    /**
     * List all available tools
     */
    static listTools() {
        return [
            {
                name: 'memory_write',
                description: 'Store new memory in the memory bank',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string', description: 'Project identifier' },
                        key: { type: 'string', description: 'Unique memory key' },
                        type: { type: 'string', enum: ['architecture', 'pattern', 'feature', 'api', 'bug', 'decision'] },
                        content: { type: 'string', description: 'Memory content (markdown supported)' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
                        relationships: { type: 'object', description: 'Dependencies and implementations' }
                    },
                    required: ['projectId', 'key', 'type', 'content']
                }
            },
            {
                name: 'memory_read',
                description: 'Read memory by exact key',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        key: { type: 'string' }
                    },
                    required: ['projectId', 'key']
                }
            },
            {
                name: 'memory_search',
                description: 'Search memories by keyword, tags, or type',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        query: { type: 'string', description: 'Search query' },
                        tags: { type: 'array', items: { type: 'string' } },
                        type: { type: 'string', enum: ['architecture', 'pattern', 'feature', 'api', 'bug', 'decision'] },
                        limit: { type: 'number', default: 10 }
                    },
                    required: ['projectId']
                }
            },
            {
                name: 'memory_list',
                description: 'List all memories of a specific type',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        type: { type: 'string', enum: ['architecture', 'pattern', 'feature', 'api', 'bug', 'decision'] }
                    },
                    required: ['projectId']
                }
            },
            {
                name: 'memory_update',
                description: 'Update existing memory',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        key: { type: 'string' },
                        content: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } },
                        relationships: { type: 'object' }
                    },
                    required: ['projectId', 'key']
                }
            },
            {
                name: 'project_init',
                description: 'Initialize project storage and optionally configure agents (pass agents: "kilocode,opencode" or use interactive mode)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' },
                        agents: { type: 'string', description: 'Comma-separated list of agents to sync with (e.g., \"kilocode,opencode\")' }
                    },
                    required: ['projectId']
                }
            },
            {
                name: 'configure_agents',
                description: 'Configure which coding agents to sync memory bank files with. Pass agents: "kilocode,opencode" or use interactive mode.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        agents: { type: 'string', description: 'Comma-separated list of agents to enable (e.g., \"kilocode,opencode\")' },
                        interactive: { type: 'boolean', description: 'If true and TTY available, prompt interactively. Set to false for non-interactive.' }
                    },
                    required: []
                }
            },
            {
                name: 'memory_stats',
                description: 'Get storage, cache, and sync statistics',
                inputSchema: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string' }
                    },
                    required: ['projectId']
                }
            }
        ];
    }
}

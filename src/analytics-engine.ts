import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';

export class AnalyticsEngine {

    /**
     * Get aggregated analytics data from all projects
     */
    public async getAnalyticsData(): Promise<any> {
        const allMemories = await this.getAllProjectMemories();
        return this.calculateStatistics(allMemories);
    }

    /**
     * Scan all projects for memories
     */
    private async getAllProjectMemories(): Promise<any[]> {
        const allMemories: any[] = [];
        const projectPaths = await this.findAllProjects();
        const fsPromises = fs.promises;

        for (const projectPath of projectPaths) {
            try {
                const agentMemoryPath = path.join(projectPath, '.agentMemory');

                try {
                    await fsPromises.access(agentMemoryPath);
                } catch {
                    continue; // Skip
                }

                const files = await fsPromises.readdir(agentMemoryPath);
                const memoryFiles = files.filter((f: string) => f.endsWith('.json') && f !== 'data.json' && f !== 'memory.json');

                // Process data.json (Cache format)
                const dataJsonPath = path.join(agentMemoryPath, 'data.json');
                try {
                    const data = await fsPromises.readFile(dataJsonPath, 'utf8');
                    const parsed = JSON.parse(data);
                    if (parsed.cache && Array.isArray(parsed.cache)) {
                        for (const [key, entry] of parsed.cache) {
                            try {
                                const value = JSON.parse(entry.value);
                                if (value.value && typeof value.value === 'object') {
                                    const mem = value.value;
                                    if (!mem.projectId) mem.projectId = path.basename(projectPath);
                                    mem._impliedAgent = this.inferAgent(projectPath, mem);
                                    allMemories.push(mem);
                                }
                            } catch (e) { /* skip */ }
                        }
                    }
                } catch (e) { /* skip */ }

                // Process individual memory files
                for (const file of memoryFiles) {
                    try {
                        const filePath = path.join(agentMemoryPath, file);
                        const data = await fsPromises.readFile(filePath, 'utf8');
                        const parsed = JSON.parse(data);

                        if (parsed.id && parsed.projectId) {
                            parsed._impliedAgent = this.inferAgent(projectPath, parsed);
                            allMemories.push(parsed);
                        }
                    } catch (fileError) { /* skip */ }
                }
            } catch (projectError) { /* skip */ }
        }

        return allMemories;
    }

    /**
     * Infer the AI agent based on project structure and memory metadata
     */
    private inferAgent(projectPath: string, memory: any): string {
        // 1. Trust accurate metadata if specific
        if (memory.metadata?.createdBy && !['agent', 'user', 'unknown'].includes(memory.metadata.createdBy.toLowerCase())) {
            return memory.metadata.createdBy;
        }

        // 2. Check for Agent-specific folders
        try {
            if (fs.existsSync(path.join(projectPath, '.clinerules'))) return 'Cline';
            if (fs.existsSync(path.join(projectPath, '.roo'))) return 'RooCode';
            if (fs.existsSync(path.join(projectPath, '.kilocode'))) return 'KiloCode';
            if (fs.existsSync(path.join(projectPath, '.cursorrules'))) return 'Cursor';
            if (fs.existsSync(path.join(projectPath, '.continue'))) return 'Continue';
        } catch (e) { /* ignore */ }

        // 3. Fallback
        return 'Unknown';
    }

    /**
     * Find all projects
     */
    private async findAllProjects(): Promise<string[]> {
        const projects: Set<string> = new Set();
        const fsPromises = fs.promises;
        const os = require('os');

        // 1. Current Workspace
        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(folder => {
                projects.add(folder.uri.fsPath);
            });
        }

        // 2. Common project locations
        const searchLocations = [
            path.join(os.homedir(), 'Projects'),
            path.join(os.homedir(), 'Development'),
            path.join(os.homedir(), 'Code'),
            path.join(os.homedir(), 'git')
        ];

        for (const location of searchLocations) {
            try {
                const exists = await fsPromises.access(location).then(() => true).catch(() => false);
                if (!exists) continue;

                const entries = await fsPromises.readdir(location, { withFileTypes: true });

                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const projectPath = path.join(location, entry.name);
                        const agentMemoryPath = path.join(projectPath, '.agentMemory');

                        const hasAgentMemory = await fsPromises.access(agentMemoryPath)
                            .then(() => true)
                            .catch(() => false);

                        if (hasAgentMemory) {
                            projects.add(projectPath);
                        }
                    }
                }
            } catch (error) { /* skip */ }
        }

        return Array.from(projects);
    }

    /**
     * Calculate statistics
     */
    public calculateStatistics(memories: any[]) {
        const projects = new Set(memories.map(m => m.projectId).filter(Boolean));

        // Initialize counts
        const agentCounts: Record<string, { writes: number, reads: number }> = {
            'Cline': { writes: 0, reads: 0 },
            'RooCode': { writes: 0, reads: 0 },
            'KiloCode': { writes: 0, reads: 0 },
            'Continue': { writes: 0, reads: 0 },
            'Cursor': { writes: 0, reads: 0 },
            'Unknown': { writes: 0, reads: 0 }
        };

        const activeAgents = new Set<string>();
        const typeCounts: Record<string, number> = {
            'architecture': 0, 'pattern': 0, 'feature': 0, 'api': 0, 'bug': 0, 'decision': 0
        };

        let totalTokensWritten = 0;
        let totalTokensRead = 0;

        memories.forEach(m => {
            const agent = m._impliedAgent || 'Unknown';

            // Ensure agent entry exists
            if (!agentCounts[agent]) agentCounts[agent] = { writes: 0, reads: 0 };

            agentCounts[agent].writes += 1;
            const reads = m.metadata?.accessCount || 0;
            agentCounts[agent].reads += reads;

            if (agent !== 'Unknown') activeAgents.add(agent);

            if (m.type && typeCounts[m.type.toLowerCase()] !== undefined) {
                typeCounts[m.type.toLowerCase()]++;
            }

            const contentLen = (m.content || '').length;
            const wTokens = Math.ceil(contentLen / 4);
            const rTokens = wTokens * reads;

            totalTokensWritten += wTokens;
            totalTokensRead += rTokens;
        });

        const recentActivity = memories
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
            .slice(0, 20)
            .map(m => ({
                key: m.key,
                type: m.type,
                agent: m._impliedAgent || 'Unknown',
                action: m.createdAt === m.updatedAt ? 'Created' : 'Updated',
                time: m.updatedAt || m.createdAt
            }));

        return {
            overview: {
                totalMemories: memories.length,
                totalProjects: projects.size,
                activeAgents: activeAgents.size,
                totalTokensWritten,
                totalTokensRead
            },
            agentActivity: {
                labels: Object.keys(agentCounts),
                writes: Object.values(agentCounts).map(a => a.writes),
                reads: Object.values(agentCounts).map(a => a.reads)
            },
            memoryTypes: {
                labels: Object.keys(typeCounts).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
                data: Object.values(typeCounts)
            },
            tokenMetrics: { timestamps: [], written: [], read: [] },
            recentActivity,
            topMemories: [],
            projects: Array.from(projects)
        };
    }
}

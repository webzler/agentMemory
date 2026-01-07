import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class AnalyticsEngine {
    constructor() { }

    /**
     * Get analytics data from ALL projects
     */
    public async getAnalyticsData() {
        try {
            const allMemories = await this.getAllProjectMemories();
            return this.calculateStatistics(allMemories);
        } catch (error) {
            console.error('Analytics Error:', error);
            return this.getEmptyData();
        }
    }

    /**
     * Scan all projects for memories
     */
    private async getAllProjectMemories(): Promise<any[]> {
        const allMemories: any[] = [];
        const projectPaths = await this.findAllProjects();

        for (const projectPath of projectPaths) {
            try {
                // Improved Agent Detection: Check for markers at project root
                const impliedAgent = await this.detectProjectAgent(projectPath);

                const agentMemoryPath = path.join(projectPath, '.agentMemory');
                const fsPromises = fs.promises;

                const files = await fsPromises.readdir(agentMemoryPath);
                const memoryFiles = files.filter((f: string) => f.endsWith('.json'));

                for (const file of memoryFiles) {
                    try {
                        const filePath = path.join(agentMemoryPath, file);
                        const data = await fsPromises.readFile(filePath, 'utf8');
                        const parsed = JSON.parse(data);

                        // Attach project info to every memory
                        const projectId = path.basename(projectPath);

                        // Handle both simple format and cache format
                        if (parsed.cache && Array.isArray(parsed.cache)) {
                            for (const [key, entry] of parsed.cache) {
                                try {
                                    const value = JSON.parse(entry.value);
                                    if (value.value && typeof value.value === 'object') {
                                        const mem = value.value;
                                        mem.projectId = projectId;
                                        mem._projectPath = projectPath; // Internal helper
                                        mem._impliedAgent = impliedAgent;
                                        allMemories.push(mem);
                                    }
                                } catch (e) { }
                            }
                        } else if (parsed.id || parsed.projectId) {
                            parsed.projectId = projectId;
                            parsed._projectPath = projectPath;
                            parsed._impliedAgent = impliedAgent;
                            allMemories.push(parsed);
                        }
                    } catch (fileError) { }
                }
            } catch (projectError) { }
        }

        return allMemories;
    }

    /**
     * Detect agent based on file markers in project root
     */
    private async detectProjectAgent(projectPath: string): Promise<string> {
        const markers: Record<string, string> = {
            '.kilocode': 'KiloCode',
            '.clinerules': 'Cline',
            '.cursorrules': 'Cursor',
            '.continue': 'Continue',
            '.roo': 'RooCode'
        };

        try {
            const files = await fs.promises.readdir(projectPath);
            for (const [marker, agent] of Object.entries(markers)) {
                if (files.includes(marker)) return agent;
            }
        } catch (e) { }

        return 'Unknown';
    }

    /**
     * Find all projects with .agentMemory folders
     */
    private async findAllProjects(): Promise<string[]> {
        const projects: string[] = [];
        const fsPromises = fs.promises;

        // Common project locations
        // Added depth to find nested projects
        const roots = [
            path.join(os.homedir(), 'Projects'),
            path.join(os.homedir(), 'Development'),
            path.join(os.homedir(), 'Code'),
            path.join(os.homedir(), 'git') // Common git folder
        ];

        // Helper to recursively search for .agentMemory
        const search = async (dir: string, depth: number) => {
            if (depth > 3) return; // Limit depth
            try {
                const entries = await fsPromises.readdir(dir, { withFileTypes: true });

                // Check if this dir has .agentMemory
                const hasMemory = entries.some(e => e.name === '.agentMemory' && e.isDirectory());
                if (hasMemory) {
                    projects.push(dir);
                    // Don't recurse into a project that is already a memory root (usually)
                    // but we can if we support monorepos. Let's continue.
                }

                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        await search(path.join(dir, entry.name), depth + 1);
                    }
                }
            } catch (e) { }
        };

        for (const root of roots) {
            try {
                await fsPromises.access(root);
                await search(root, 0);
            } catch (e) { }
        }

        // De-duplicate
        return Array.from(new Set(projects));
    }

    private calculateStatistics(memories: any[]) {
        // Agent Activity
        const agentCounts: Record<string, { writes: number, reads: number }> = {};
        const activeAgents = new Set<string>();

        // Type Distribution
        const typeCounts: Record<string, number> = {
            'architecture': 0, 'pattern': 0, 'feature': 0, 'api': 0, 'bug': 0, 'decision': 0
        };

        // Project Statistics
        const projectStats: Record<string, {
            name: string,
            path: string,
            count: number,
            lastActive: number,
            agents: Set<string>,
            memories: any[] // Store simplified memories for detail view
        }> = {};

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

            // Project aggregation
            if (m.projectId) {
                if (!projectStats[m.projectId]) {
                    projectStats[m.projectId] = {
                        name: m.projectId,
                        path: m._projectPath || '',
                        count: 0,
                        lastActive: 0,
                        agents: new Set(),
                        memories: []
                    };
                }
                const p = projectStats[m.projectId];
                p.count++;
                const time = m.updatedAt || m.createdAt || 0;
                if (time > p.lastActive) p.lastActive = time;
                if (agent !== 'Unknown') p.agents.add(agent);

                // Add simplified memory object for frontend display
                p.memories.push({
                    key: m.key,
                    type: m.type,
                    agent: agent,
                    content: m.content || '', // Pass content for reading
                    createdAt: m.createdAt,
                    updatedAt: m.updatedAt
                });
            }
        });

        const recentActivity = memories
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
            .slice(0, 20)
            .map(m => ({
                key: m.key,
                type: m.type,
                agent: m._impliedAgent || 'Unknown',
                action: m.createdAt === m.updatedAt ? 'Created' : 'Updated',
                time: m.updatedAt || m.createdAt,
                content: m.content || '' // Include here too
            }));

        // Convert Project Stats to Array
        const projectsList = Object.values(projectStats).map(p => ({
            ...p,
            agents: Array.from(p.agents),
            // Sort project memories
            memories: p.memories.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        })).sort((a, b) => b.lastActive - a.lastActive);

        return {
            overview: {
                totalMemories: memories.length,
                totalProjects: projectsList.length,
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
            projects: projectsList
        };
    }

    private getEmptyData() {
        return {
            overview: { totalMemories: 0, totalProjects: 0, activeAgents: 0, totalTokensWritten: 0, totalTokensRead: 0 },
            agentActivity: { labels: [], writes: [], reads: [] },
            memoryTypes: { labels: [], data: [] },
            tokenMetrics: { timestamps: [], written: [], read: [] },
            recentActivity: [],
            topMemories: [],
            projects: []
        };
    }
}

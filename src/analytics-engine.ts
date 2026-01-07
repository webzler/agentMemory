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

                // Detect agent for this project ONCE (Performance + Accuracy)
                const projectAgent = this.detectProjectAgent(projectPath);

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
                                    mem._impliedAgent = this.inferAgent(mem, projectAgent);
                                    mem._projectPath = projectPath;
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
                            parsed._impliedAgent = this.inferAgent(parsed, projectAgent);
                            parsed._projectPath = projectPath;
                            allMemories.push(parsed);
                        }
                    } catch (fileError) { /* skip */ }
                }
            } catch (projectError) { /* skip */ }
        }

        return allMemories;
    }

    /**
     * Detect agent based on project file structure (High Priority)
     */
    private detectProjectAgent(projectPath: string): string | null {
        try {
            // KiloCode (Check first as it often forks Cline)
            if (fs.existsSync(path.join(projectPath, '.kilocode')) ||
                fs.existsSync(path.join(projectPath, '.kilo')) ||
                fs.existsSync(path.join(projectPath, 'kilocode.json'))) return 'KiloCode';

            // Cursor
            if (fs.existsSync(path.join(projectPath, '.cursorrules')) ||
                fs.existsSync(path.join(projectPath, '.cursor'))) return 'Cursor';

            // Continue
            if (fs.existsSync(path.join(projectPath, '.continue'))) return 'Continue';

            // RooCode
            if (fs.existsSync(path.join(projectPath, '.roo'))) return 'RooCode';

            // Cline
            if (fs.existsSync(path.join(projectPath, '.clinerules'))) return 'Cline';
        } catch (e) { return null; }
        return null;
    }

    /**
     * Infer the AI agent based on project structure and memory metadata
     */
    private inferAgent(memory: any, projectAgent: string | null): string {
        // 1. Prefer project-level detection (Fixes KiloCode showing as Cline)
        if (projectAgent) return projectAgent;

        // 2. Trust accurate metadata if no project override
        if (memory.metadata?.createdBy && !['agent', 'user', 'unknown'].includes(memory.metadata.createdBy.toLowerCase())) {
            return memory.metadata.createdBy;
        }

        // 3. Fallback
        return 'Unknown';
    }

    /**
     * Find all projects recursively
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

        // Recursive walker function
        const walk = async (dir: string, depth: number) => {
            if (depth > 3) return; // Limit depth to avoid performance issues

            try {
                // Check if directory exists
                try {
                    await fsPromises.access(dir);
                } catch {
                    return;
                }

                const entries = await fsPromises.readdir(dir, { withFileTypes: true });

                // Check if this directory is a project (has .agentMemory)
                const hasAgentMemory = entries.some(e => e.isDirectory() && e.name === '.agentMemory');
                if (hasAgentMemory) {
                    projects.add(dir);
                }

                // Recurse into subdirectories
                // Exclude common unnecessary folders to speed up search
                const exclude = ['node_modules', '.git', 'dist', 'out', 'build', '.vscode', '.idea'];
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith('.') && !exclude.includes(entry.name)) {
                        await walk(path.join(dir, entry.name), depth + 1);
                    }
                }
            } catch (error) { /* skip access errors */ }
        };

        // Run search in parallel
        await Promise.all(searchLocations.map(loc => walk(loc, 0)));

        return Array.from(projects);
    }

    /**
     * Calculate statistics
     */
    public calculateStatistics(memories: any[]) {
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

        // Project Statistics
        const projectStats: Record<string, { name: string, path: string, count: number, lastActive: number, agents: Set<string> }> = {};

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
                        agents: new Set()
                    };
                }
                const p = projectStats[m.projectId];
                p.count++;
                const time = m.updatedAt || m.createdAt || 0;
                if (time > p.lastActive) p.lastActive = time;
                if (agent !== 'Unknown') p.agents.add(agent);
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
                time: m.updatedAt || m.createdAt
            }));

        // Convert Project Stats to Array
        const projectsList = Object.values(projectStats).map(p => ({
            ...p,
            agents: Array.from(p.agents)
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
}

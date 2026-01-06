import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Simple HTTP server for dashboard debugging
 * Access at http://localhost:3333
 */
export class DashboardServer {
    private server: http.Server | undefined;
    private port = 3333;

    constructor(
        private context: vscode.ExtensionContext,
        private outputChannel: vscode.OutputChannel
    ) { }

    /**
     * Start the HTTP server
     */
    start(): void {
        if (this.server) {
            this.outputChannel.appendLine('[DashboardServer] Server already running');
            return;
        }

        this.server = http.createServer(async (req, res) => {
            // Enable CORS for API calls
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            // Serve dashboard HTML
            if (req.method === 'GET' && req.url === '/') {
                const data = await this.getAnalyticsData();
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(this.getDashboardHTML(data));
                return;
            }

            // API endpoint for dashboard data
            if (req.url === '/api/analytics') {
                this.handleAnalyticsRequest(req, res);
                return;
            }

            // API endpoint for search
            if (req.url?.startsWith('/api/search')) {
                this.handleSearchRequest(req, res);
                return;
            }

            // API endpoint for list/memories
            if (req.url === '/api/memories') {
                this.handleMemoriesRequest(req, res);
                return;
            }

            // API endpoint for export
            if (req.url?.startsWith('/api/export')) {
                this.handleExportRequest(req, res);
                return;
            }

            // 404
            res.writeHead(404);
            res.end('Not Found');
        });

        this.server.listen(this.port, () => {
            const url = `http://localhost:${this.port}`;
            this.outputChannel.appendLine(`[DashboardServer] Started at ${url}`);
            vscode.window.showInformationMessage(
                `Dashboard server started at ${url}`,
                'Open in Browser'
            ).then(selection => {
                if (selection === 'Open in Browser') {
                    vscode.env.openExternal(vscode.Uri.parse(url));
                }
            });
        });
    }

    /**
     * Stop the HTTP server
     */
    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = undefined;
            this.outputChannel.appendLine('[DashboardServer] Stopped');
        }
    }

    /**
     * Get the dashboard port number
     */
    getPort(): number {
        return this.port;
    }

    /**
     * Handle analytics API request
     */
    private async handleAnalyticsRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const analytics = await this.getAnalyticsData();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(analytics));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch analytics' }));
        }
    }

    /**
     * Get analytics data from ALL projects
     */
    private async getAnalyticsData() {
        try {
            const allMemories = await this.getAllProjectMemories();

            if (allMemories.length === 0) {
                this.outputChannel.appendLine('[DashboardServer] No memories found across all projects');
                return this.getEmptyData();
            }

            this.outputChannel.appendLine(`[DashboardServer] Found ${allMemories.length} memories across all projects`);
            return this.calculateStatistics(allMemories);
        } catch (error) {
            this.outputChannel.appendLine('[DashboardServer] Error: ' + error);
            return this.getEmptyData();
        }
    }

    /**
     * Scan all projects for memories
     */
    private async getAllProjectMemories(): Promise<any[]> {
        const allMemories: any[] = [];
        const projectPaths = await this.findAllProjects();

        this.outputChannel.appendLine(`[DashboardServer] Scanning ${projectPaths.length} projects`);

        for (const projectPath of projectPaths) {
            try {
                const agentMemoryPath = path.join(projectPath, '.agentMemory');
                const fsPromises = require('fs').promises;

                const files = await fsPromises.readdir(agentMemoryPath);
                const memoryFiles = files.filter((f: string) => f.endsWith('.json'));

                this.outputChannel.appendLine(`[DashboardServer] Project ${path.basename(projectPath)}: ${memoryFiles.length} files`);

                for (const file of memoryFiles) {
                    try {
                        const filePath = path.join(agentMemoryPath, file);
                        const data = await fsPromises.readFile(filePath, 'utf8');
                        const parsed = JSON.parse(data);

                        // Handle both cache format and direct memory format
                        if (parsed.cache && Array.isArray(parsed.cache)) {
                            // Cache format from data.json
                            for (const [key, entry] of parsed.cache) {
                                try {
                                    const value = JSON.parse(entry.value);
                                    if (value.value && typeof value.value === 'object') {
                                        allMemories.push(value.value);
                                    }
                                } catch (e) {
                                    // Skip invalid entries
                                }
                            }
                        } else if (parsed.id && parsed.projectId) {
                            // Direct memory format
                            allMemories.push(parsed);
                        }
                    } catch (fileError) {
                        // Skip invalid files
                    }
                }
            } catch (projectError) {
                // Skip projects that can't be read
            }
        }

        return allMemories;
    }

    /**
     * Find all projects with .agentMemory folders
     */
    private async findAllProjects(): Promise<string[]> {
        const projects: string[] = [];
        const fsPromises = require('fs').promises;
        const os = require('os');

        // Common project locations
        const searchLocations = [
            path.join(os.homedir(), 'Projects'),
            path.join(os.homedir(), 'Development'),
            path.join(os.homedir(), 'Code'),
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
                            projects.push(projectPath);
                        }
                    }
                }
            } catch (error) {
                // Skip locations that can't be read
            }
        }

        return projects;
    }

    /**
     * Handle search request
     */
    private async handleSearchRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const query = url.searchParams.get('q') || '';
            const type = url.searchParams.get('type') || '';

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
                return;
            }

            const { StorageManager } = require('./mcp-server/storage');
            const storagePath = path.join(workspaceFolder.uri.fsPath, '.agentMemory');
            const storage = new StorageManager(storagePath);

            const projectId = path.basename(workspaceFolder.uri.fsPath);
            let results = await storage.search(projectId, query);

            // Filter by type if specified
            if (type) {
                results = results.filter((m: any) => m.type === type);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Search failed' }));
        }
    }

    /**
     * Handle memories list request
     */
    private async handleMemoriesRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const type = url.searchParams.get('type') || '';

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
                return;
            }

            const { StorageManager } = require('./mcp-server/storage');
            const storagePath = path.join(workspaceFolder.uri.fsPath, '.agentMemory');
            const storage = new StorageManager(storagePath);

            const projectId = path.basename(workspaceFolder.uri.fsPath);
            const memories = type
                ? await storage.list(projectId, type)
                : await storage.list(projectId);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(memories));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to list memories' }));
        }
    }

    /**
     * Handle export request
     */
    private async handleExportRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const format = url.searchParams.get('format') || 'json';

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                res.writeHead(404);
                res.end('No workspace');
                return;
            }

            const { StorageManager } = require('./mcp-server/storage');
            const storagePath = path.join(workspaceFolder.uri.fsPath, '.agentMemory');
            const storage = new StorageManager(storagePath);

            const projectId = path.basename(workspaceFolder.uri.fsPath);
            const memories = await storage.list(projectId);

            if (format === 'json') {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="memories-${Date.now()}.json"`
                });
                res.end(JSON.stringify(memories, null, 2));
            } else if (format === 'markdown') {
                const markdown = this.convertToMarkdown(memories);
                res.writeHead(200, {
                    'Content-Type': 'text/markdown',
                    'Content-Disposition': `attachment; filename="memories-${Date.now()}.md"`
                });
                res.end(markdown);
            } else {
                res.writeHead(400);
                res.end('Invalid format');
            }
        } catch (error) {
            res.writeHead(500);
            res.end('Export failed');
        }
    }

    /**
     * Convert memories to markdown format
     */
    private convertToMarkdown(memories: any[]): string {
        const lines = ['# Agent Memories Export', '', `Generated: ${new Date().toISOString()}`, ''];

        memories.forEach(memory => {
            lines.push(`## ${memory.key}`, '');
            lines.push(`**Type**: ${memory.type}`);
            lines.push(`**Tags**: ${memory.tags.join(', ')}`);
            lines.push(`**Created**: ${new Date(memory.createdAt).toLocaleString()}`, '');
            lines.push(memory.content, '');
            lines.push('---', '');
        });

        return lines.join('\n');
    }

    /**
     * Calculate statistics from aggregated memories
     */
    private calculateStatistics(memories: any[]) {
        const projects = new Set(memories.map(m => m.projectId).filter(Boolean));

        // Agent Activity
        const agentCounts: Record<string, { writes: number, reads: number }> = {
            'Cline': { writes: 0, reads: 0 },
            'RooCode': { writes: 0, reads: 0 },
            'KiloCode': { writes: 0, reads: 0 },
            'Continue': { writes: 0, reads: 0 },
            'Cursor': { writes: 0, reads: 0 },
            'Unknown': { writes: 0, reads: 0 }
        };

        const activeAgents = new Set<string>();

        // Type Distribution
        const typeCounts: Record<string, number> = {
            'architecture': 0, 'pattern': 0, 'feature': 0, 'api': 0, 'bug': 0, 'decision': 0
        };

        let totalTokensWritten = 0;
        let totalTokensRead = 0;
        const tokenHistory: any[] = [];

        memories.forEach(m => {
            // Count Agent
            const agent = m._impliedAgent || 'Unknown';
            if (!agentCounts[agent]) agentCounts[agent] = { writes: 0, reads: 0 };

            // Heuristic: creation is a write, access is a read (conceptually)
            // But we only have 'accessCount' usually.
            // Let's count existence as 1 write.
            agentCounts[agent].writes += 1;

            // Reads approximated by accessCount
            const reads = m.metadata?.accessCount || 0;
            agentCounts[agent].reads += reads;

            if (agent !== 'Unknown') activeAgents.add(agent);

            // Count Type
            if (m.type && typeCounts[m.type.toLowerCase()] !== undefined) {
                typeCounts[m.type.toLowerCase()]++;
            }

            // Tokens (Mock calculation if missing: ~4 chars per token)
            const contentLen = (m.content || '').length;
            const wTokens = Math.ceil(contentLen / 4);
            const rTokens = wTokens * reads;

            totalTokensWritten += wTokens;
            totalTokensRead += rTokens;
        });

        const recentActivity = memories
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
            .slice(0, 15)
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
            tokenMetrics: { timestamps: [], written: [], read: [] }, // TODO: Implement real history tracking
            recentActivity,
            topMemories: [],
            projects: Array.from(projects)
        };
    }

    private getEmptyData() {
        return {
            overview: { totalMemories: 0, totalProjects: 0, activeAgents: 0, totalTokensWritten: 0, totalTokensRead: 0 },
            agentActivity: { labels: ['Cline', 'RooCode', 'KiloCode', 'Continue', 'Cursor'], writes: [0, 0, 0, 0, 0], reads: [0, 0, 0, 0, 0] },
            memoryTypes: { labels: ['Architecture', 'Pattern', 'Feature', 'API', 'Bug', 'Decision'], data: [0, 0, 0, 0, 0, 0] },
            tokenMetrics: { timestamps: [], written: [], read: [] },
            recentActivity: [],
            topMemories: [],
            projects: []
        };
    }

    /**
     * Get dashboard HTML (modified to fetch from API)
     */
    private getDashboardHTML(data: any) {
        // Read Icon
        const fs = require('fs');
        const iconPath = path.join(this.context.extensionPath, 'images', 'icon.png');
        let iconBase64 = '';
        try {
            iconBase64 = 'data:image/png;base64,' + fs.readFileSync(iconPath, 'base64');
        } catch (e) {
            // Fallback if image missing
            iconBase64 = '';
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>agentMemory Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-dark: #0f0f15;
            --bg-card: rgba(30, 30, 45, 0.7);
            --border-color: rgba(139, 92, 246, 0.15);
            --text-primary: #e8e8e8;
            --text-secondary: #a0a0b8;
            --accent-purple: #8B5CF6;
            --accent-blue: #3B82F6;
            --gradient-primary: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: radial-gradient(circle at top right, #1a1a2e 0%, #0f0f15 100%);
            color: var(--text-primary);
            min-height: 100vh;
        }
        
        .container { padding: 24px 40px; max-width: 1800px; margin: 0 auto; }
        
        /* HEADER */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 32px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-color);
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .logo { width: 32px; height: 32px; object-fit: contain; }
        .brand h1 {
            font-size: 20px;
            font-weight: 600;
            background: var(--gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.5px;
        }
        
        .controls { display: flex; gap: 12px; }
        .search-box {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 8px 16px;
            color: white;
            width: 280px;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }
        .search-box:focus { border-color: var(--accent-purple); }
        
        .btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .btn:hover { background: rgba(255, 255, 255, 0.1); }
        .btn-primary {
            background: var(--gradient-primary);
            border: none;
            color: white;
        }
        .btn-primary:hover { opacity: 0.9; }

        /* STATS GRID */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            backdrop-filter: blur(10px);
        }
        .stat-title {
            color: var(--text-secondary);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        .stat-value {
            font-size: 28px;
            font-weight: 700;
            color: white;
            margin-bottom: 4px;
        }
        .stat-sub { font-size: 12px; color: var(--text-secondary); opacity: 0.7; }
        
        /* CHARTS SECTION */
        .charts-row {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
        }
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            backdrop-filter: blur(10px);
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
        }
        .card-title { font-size: 14px; font-weight: 600; }
        
        /* TABLE */
        .table-container {
            width: 100%;
            overflow-x: auto;
        }
        table { width: 100%; border-collapse: collapse; }
        th {
            text-align: left;
            padding: 12px 16px;
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border-color);
        }
        td {
            padding: 16px;
            font-size: 13px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }
        tr:last-child td { border-bottom: none; }
        
        .agent-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 4px;
            background: rgba(139, 92, 246, 0.1);
            color: #d8b4fe;
            font-size: 12px;
        }
        
        /* Chart specific overrides */
        .chart-wrapper { position: relative; height: 260px; width: 100%; }

    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header class="header">
            <div class="brand">
                <img src="${iconBase64}" class="logo" alt="logo" />
                <h1>agentMemory Dashboard</h1>
            </div>
            <div class="controls">
                <input type="text" class="search-box" placeholder="Search memories..." id="searchInput">
                <button class="btn" onclick="exportJSON()">Export JSON</button>
                <button class="btn btn-primary" onclick="window.location.reload()">Refresh</button>
            </div>
        </header>

        <!-- Stats -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-title">Total Memories</div>
                <div class="stat-value">${data.overview.totalMemories}</div>
                <div class="stat-sub">Stored Across All Projects</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Projects</div>
                <div class="stat-value">${data.overview.totalProjects}</div>
                <div class="stat-sub">Active Memory Contexts</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Active Agents</div>
                <div class="stat-value">${data.overview.activeAgents}</div>
                <div class="stat-sub">Currently Contributing</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Tokens Written</div>
                <div class="stat-value">${(data.overview.totalTokensWritten / 1000).toFixed(1)}k</div>
                <div class="stat-sub">Estimated Content Volume</div>
            </div>
        </div>

        <!-- Charts -->
        <div class="charts-row">
            <div class="card">
                <div class="card-header">
                    <div class="card-title">Agent Activity</div>
                </div>
                <div class="chart-wrapper">
                    <canvas id="agentChart"></canvas>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <div class="card-title">Memory Types</div>
                </div>
                <div class="chart-wrapper">
                    <canvas id="typeChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Recent Activity -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">Recent Activity</div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Agent</th>
                            <th>Action</th>
                            <th>Key</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody id="activityBody">
                        ${data.recentActivity.map((item: any) => `
                        <tr>
                            <td>${new Date(item.time).toLocaleString()}</td>
                            <td><span class="agent-badge">${item.agent}</span></td>
                            <td>${item.action}</td>
                            <td style="font-family: monospace; color: var(--accent-blue);">${item.key}</td>
                            <td>${item.type}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
    }

    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (type) params.append('type', type);

    try {
        const res = await fetch('http://localhost:${this.port}/api/search?' + params);
        const results = await res.json();

        // Update recent activity with search results
        const container = document.getElementById('recentActivityContainer');
        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state">No results found</div>';
            return;
        }

        let html = '<table><thead><tr><th>Key</th><th>Type</th><th>Tags</th><th>Updated</th></tr></thead><tbody>';
        results.forEach(m => {
            html += '<tr><td>' + m.key + '</td><td>' + m.type + '</td><td>' + m.tags.join(', ') + '</td><td>' + new Date(m.updatedAt).toLocaleString() + '</td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(error) {
        console.error('Search failed:', error);
    }
}

// Export function
function exportMemories(format) {
    window.open('http://localhost:${this.port}/api/export?format=' + format, '_blank');
}

// Auto-refresh every 30 seconds
setInterval(() => refresh(), 30000);

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    else if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Alias for backwards compatibility
function fetchAnalytics() { refresh(); }

// Load data on page load
refresh();
</script>
    </body>
    </html>`;
    }
}

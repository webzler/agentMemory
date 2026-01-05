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

        this.server = http.createServer((req, res) => {
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            // Serve dashboard HTML
            if (req.url === '/' || req.url === '/index.html') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(this.getDashboardHTML());
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
     * Get analytics data (same as dashboard.ts)
     */
    private async getAnalyticsData() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            this.outputChannel.appendLine('[DashboardServer] No workspace folder found');
            return this.getEmptyData();
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const agentMemoryPath = path.join(workspacePath, '.agentMemory');

        this.outputChannel.appendLine('[DashboardServer] ===== DEBUG INFO =====');
        this.outputChannel.appendLine('[DashboardServer] Workspace path: ' + workspacePath);
        this.outputChannel.appendLine('[DashboardServer] Looking for data in: ' + agentMemoryPath);

        try {
            const fsPromises = require('fs').promises;

            try {
                await fsPromises.access(agentMemoryPath);
                this.outputChannel.appendLine('[DashboardServer] ✅ Directory exists: ' + agentMemoryPath);
            } catch (error) {
                this.outputChannel.appendLine('[DashboardServer] ❌ Directory not found: ' + agentMemoryPath);
                this.outputChannel.appendLine('[DashboardServer] Error: ' + error);
                return this.getEmptyData();
            }

            const files = await fsPromises.readdir(agentMemoryPath);
            this.outputChannel.appendLine('[DashboardServer] Files in directory: ' + files.length);

            const memoryFiles = files.filter((f: string) => f.endsWith('.json'));
            this.outputChannel.appendLine('[DashboardServer] JSON files found: ' + memoryFiles.length);

            if (memoryFiles.length === 0) {
                this.outputChannel.appendLine('[DashboardServer] No .json files found');
                return this.getEmptyData();
            }

            const memories: any[] = [];
            for (const file of memoryFiles) {
                try {
                    const filePath = path.join(agentMemoryPath, file);
                    const content = await fsPromises.readFile(filePath, 'utf-8');
                    const memory = JSON.parse(content);
                    memories.push(memory);
                } catch (error) {
                    this.outputChannel.appendLine('[DashboardServer] Failed to read memory file: ' + file + ' - ' + error);
                }
            }

            this.outputChannel.appendLine('[DashboardServer] Loaded memories: ' + memories.length);
            const stats = this.calculateStatistics(memories);
            this.outputChannel.appendLine('[DashboardServer] Stats: ' + JSON.stringify(stats.overview));

            return stats;
        } catch (error) {
            this.outputChannel.appendLine('[DashboardServer] Error: ' + error);
            return this.getEmptyData();
        }
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
    private calculateStatistics(memories: any[]) {
        // Same logic as dashboard.ts
        const agentCounts: any = {
            Cline: { writes: 0, reads: 0 },
            RooCode: { writes: 0, reads: 0 },
            KiloCode: { writes: 0, reads: 0 },
            Continue: { writes: 0, reads: 0 },
            Cursor: { writes: 0, reads: 0 }
        };

        const typeCounts: any = {
            Architecture: 0, Pattern: 0, Feature: 0, API: 0, Bug: 0, Decision: 0
        };

        let totalTokensWritten = 0;
        let totalTokensRead = 0;
        const activeAgents = new Set<string>();
        const recentActivity: any[] = [];
        const projects = new Set<string>();

        memories.forEach(memory => {
            if (memory.projectId) projects.add(memory.projectId);
            const createdBy = memory.metadata?.createdBy || 'Unknown';
            activeAgents.add(createdBy);

            let agentName = 'Unknown';
            if (createdBy.includes('cline')) agentName = 'Cline';
            else if (createdBy.includes('roocode')) agentName = 'RooCode';
            else if (createdBy.includes('kilocode')) agentName = 'KiloCode';
            else if (createdBy.includes('continue')) agentName = 'Continue';
            else if (createdBy.includes('cursor')) agentName = 'Cursor';

            if (agentCounts[agentName]) agentCounts[agentName].writes++;

            const contentLength = memory.content?.length || 0;
            const estimatedTokens = Math.ceil(contentLength / 4);
            totalTokensWritten += estimatedTokens;

            const accessCount = memory.metadata?.accessCount || 0;
            totalTokensRead += estimatedTokens * accessCount;
            if (agentCounts[agentName]) agentCounts[agentName].reads += accessCount;

            const type = memory.type || 'Unknown';
            const typeKey = type.charAt(0).toUpperCase() + type.slice(1);
            if (typeCounts[typeKey] !== undefined) typeCounts[typeKey]++;

            recentActivity.push({
                timestamp: memory.createdAt || Date.now(),
                agent: agentName,
                action: 'write',
                key: memory.key
            });
        });

        recentActivity.sort((a, b) => b.timestamp - a.timestamp);

        const topMemories = memories
            .filter(m => m.metadata?.accessCount > 0)
            .sort((a, b) => (b.metadata?.accessCount || 0) - (a.metadata?.accessCount || 0))
            .slice(0, 10)
            .map(m => ({
                key: m.key,
                type: m.type,
                accessCount: m.metadata?.accessCount || 0,
                updatedAt: m.updatedAt || m.createdAt
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
                labels: ['Cline', 'RooCode', 'KiloCode', 'Continue', 'Cursor'],
                writes: Object.values(agentCounts).map((a: any) => a.writes),
                reads: Object.values(agentCounts).map((a: any) => a.reads)
            },
            memoryTypes: {
                labels: ['Architecture', 'Pattern', 'Feature', 'API', 'Bug', 'Decision'],
                data: Object.values(typeCounts)
            },
            tokenMetrics: { timestamps: [], written: [], read: [] },
            recentActivity: recentActivity.slice(0, 10),
            topMemories,
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
    private getDashboardHTML(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>agentMemory Dashboard (Debug Mode)</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            padding: 20px;
        }
        .debug-banner {
            background: #ff9800;
            color: #000;
            padding: 10px 20px;
            margin: -20px -20px 20px -20px;
            font-weight: 600;
        }
        .header { margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
        h1 { font-size: 28px; font-weight: 600; }
        .refresh-btn {
            background: #0e639c;
            color: #fff;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover { background: #1177bb; }
        .overview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #2d2d30; border: 1px solid #3e3e42; border-radius: 8px; padding: 20px; }
        .stat-label { font-size: 12px; text-transform: uppercase; opacity: 0.7; margin-bottom: 8px; }
        .stat-value { font-size: 32px; font-weight: 700; }
        .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .chart-card { background: #2d2d30; border: 1px solid #3e3e42; border-radius: 8px; padding: 20px; }
        .chart-title { font-size: 16px; font-weight: 600; margin-bottom: 15px; }
        .chart-container { position: relative; height: 300px; }
        .table-card { background: #2d2d30; border: 1px solid #3e3e42; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #3e3e42; }
        th { font-weight: 600; opacity: 0.7; font-size: 12px; text-transform: uppercase; }
        .empty-state { text-align: center; padding: 40px; opacity: 0.5; }
    </style>
</head>
<body>
    <div class="debug-banner">⚠️ DEBUG MODE - HTTP Server on localhost:${this.port}</div>
    
    <div class="header">
        <h1>🧠 agentMemory Dashboard</h1>
        <div style="display: flex; gap: 10px; align-items: center;">
            <input type="text" id="searchInput" placeholder="Search memories..." 
                style="padding: 8px 12px; border-radius: 4px; border: 1px solid #444; background: #2d2d2d; color: #ccc; min-width: 250px;">
            <select id="typeFilter" style="padding: 8px 12px; border-radius: 4px; border: 1px solid #444; background: #2d2d2d; color: #ccc;">
                <option value="">All Types</option>
                <option value="architecture">Architecture</option>
                <option value="pattern">Pattern</option>
                <option value="feature">Feature</option>
                <option value="api">API</option>
                <option value="bug">Bug</option>
                <option value="decision">Decision</option>
            </select>
            <button class="refresh-btn" onclick="exportMemories('json')">📥 Export JSON</button>
            <button class="refresh-btn" onclick="exportMemories('markdown')">📄 Export MD</button>
            <button class="refresh-btn" onclick="fetchAnalytics()">🔄 Refresh</button>
        </div>
    </div>

    <div class="overview-grid">
        <div class="stat-card"><div class="stat-label">Total Memories</div><div class="stat-value" id="totalMemories">0</div></div>
        <div class="stat-card"><div class="stat-label">Projects</div><div class="stat-value" id="totalProjects">0</div></div>
        <div class="stat-card"><div class="stat-label">Active Agents</div><div class="stat-value" id="activeAgents">0</div></div>
        <div class="stat-card"><div class="stat-label">Tokens Written</div><div class="stat-value" id="tokensWritten">0</div></div>
        <div class="stat-card"><div class="stat-label">Tokens Read</div><div class="stat-value" id="tokensRead">0</div></div>
    </div>

    <div class="charts-grid">
        <div class="chart-card"><div class="chart-title">Agent Activity</div><div class="chart-container"><canvas id="agentChart"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Memory Types</div><div class="chart-container"><canvas id="typeChart"></canvas></div></div>
    </div>

    <div class="chart-card" style="margin-bottom: 20px;"><div class="chart-title">Token Metrics Over Time</div><div class="chart-container"><canvas id="tokenChart"></canvas></div></div>
    <div class="table-card"><div class="chart-title">Recent Activity</div><div id="recentActivityContainer"></div></div>
    <div class="table-card"><div class="chart-title">Top Memories</div><div id="topMemoriesContainer"></div></div>

    <script>
        let charts = {};

        async function fetchData() {
            const res = await fetch('http://localhost:3333/api/analytics');
            return await res.json();
        }

        async function refresh() {
            console.log('[Dashboard] Fetching data...');
            const data = await fetchData();
            console.log('[Dashboard] Data:', data);
            updateDashboard(data);
        }

        function updateDashboard(data) {
            document.getElementById('totalMemories').textContent = data.overview.totalMemories;
            document.getElementById('totalProjects').textContent = data.overview.totalProjects;
            document.getElementById('activeAgents').textContent = data.overview.activeAgents;
            document.getElementById('tokensWritten').textContent = formatNumber(data.overview.totalTokensWritten);
            document.getElementById('tokensRead').textContent = formatNumber(data.overview.totalTokensRead);

            updateAgentChart(data.agentActivity);
            updateTypeChart(data.memoryTypes);
            updateTokenChart(data.tokenMetrics);
            updateRecentActivity(data.recentActivity);
            updateTopMemories(data.topMemories);
        }

        function updateAgentChart(data) {
            const ctx = document.getElementById('agentChart').getContext('2d');
            if (charts.agentChart) charts.agentChart.destroy();
            charts.agentChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [
                        { label: 'Writes', data: data.writes, backgroundColor: 'rgba(75, 192, 192, 0.6)' },
                        { label: 'Reads', data: data.reads, backgroundColor: 'rgba(153, 102, 255, 0.6)' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        function updateTypeChart(data) {
            const ctx = document.getElementById('typeChart').getContext('2d');
            if (charts.typeChart) charts.typeChart.destroy();
            charts.typeChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: data.labels,
                    datasets: [{
                        data: data.data,
                        backgroundColor: ['rgba(255,99,132,0.6)','rgba(54,162,235,0.6)','rgba(255,206,86,0.6)','rgba(75,192,192,0.6)','rgba(153,102,255,0.6)','rgba(255,159,64,0.6)']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        function updateTokenChart(data) {
            const ctx = document.getElementById('tokenChart').getContext('2d');
            if (charts.tokenChart) charts.tokenChart.destroy();
            charts.tokenChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.timestamps,
                    datasets: [
                        { label: 'Tokens Written', data: data.written, borderColor: 'rgba(75,192,192,1)', fill: false },
                        { label: 'Tokens Read', data: data.read, borderColor: 'rgba(153,102,255,1)', fill: false }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        function updateRecentActivity(activities) {
            const container = document.getElementById('recentActivityContainer');
            if (!activities || activities.length === 0) {
                container.innerHTML = '<div class="empty-state">No recent activity</div>';
                return;
            }
            let html = '<table><thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Key</th></tr></thead><tbody>';
            activities.forEach(a => {
                html += \`<tr><td>\${new Date(a.timestamp).toLocaleString()}</td><td>\${a.agent}</td><td>\${a.action}</td><td>\${a.key}</td></tr>\`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        function updateTopMemories(memories) {
            const container = document.getElementById('topMemoriesContainer');
            if (!memories || memories.length === 0) {
                container.innerHTML = '<div class="empty-state">No memories yet</div>';
                return;
            }
            let html = '<table><thead><tr><th>Key</th><th>Type</th><th>Access Count</th><th>Last Updated</th></tr></thead><tbody>';
            memories.forEach(m => {
                html += `< tr > <td>${ m.key } </td><td>${m.type}</td > <td>${ m.accessCount } </td><td>${new Date(m.updatedAt).toLocaleString()}</td > </tr>`;
    });
            html += '</tbody></table>';
            container.innerHTML = html;
}

// Search and filter functions
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(e.target.value), 300);
});

document.getElementById('typeFilter').addEventListener('change', (e) => {
    performSearch(document.getElementById('searchInput').value, e.target.value);
});

async function performSearch(query = '', type = '') {
    if (!query && !type) {
        refresh(); // Show all
        return;
    }

    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (type) params.append('type', type);

    try {
        const res = await fetch(`http://localhost:${this.port}/api/search?${params}`);
        const results = await res.json();

        // Update recent activity with search results
        const container = document.getElementById('recentActivityContainer');
        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state">No results found</div>';
            return;
        }

        let html = '<table><thead><tr><th>Key</th><th>Type</th><th>Tags</th><th>Updated</th></tr></thead><tbody>';
        results.forEach(m => {
            html += `<tr><td>${m.key}</td><td>${m.type}</td><td>${m.tags.join(', ')}</td><td>${new Date(m.updatedAt).toLocaleString()}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Search failed:', error);
    }
}

// Export function
function exportMemories(format) {
    window.open(`http://localhost:${this.port}/api/export?format=${format}`, '_blank');
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

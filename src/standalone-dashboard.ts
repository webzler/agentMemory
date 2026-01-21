import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

/**
 * Standalone Dashboard Server for Agent Skills
 */
export class StandaloneDashboard {
    private server: http.Server | undefined;
    private port = 3333;
    private maxRetries = 10;
    private workspacePath: string;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
    }

    start(): void {
        this.server = http.createServer((req, res) => {
            // CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200); res.end(); return;
            }

            if (req.url === '/' || req.url === '/index.html') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(this.getDashboardHTML());
                return;
            }

            if (req.url === '/api/analytics') {
                this.handleAnalyticsRequest(req, res);
                return;
            }

            res.writeHead(404);
            res.end('Not Found');
        });

        this.tryListen(this.port, 0);
    }

    private tryListen(port: number, attempt: number) {
        if (!this.server) return;

        this.server.listen(port, () => {
            this.port = port; // Update active port
            console.error(`[Dashboard] Started at http://localhost:${this.port}`);
            console.error(`[Dashboard] Monitoring workspace: ${this.workspacePath}`);
        });

        this.server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                if (attempt < this.maxRetries) {
                    console.error(`[Dashboard] Port ${port} in use, trying ${port + 1}...`);
                    if (this.server) {
                        this.server.close();
                        this.server = http.createServer(this.server.listeners('request')[0] as any);
                        this.tryListen(port + 1, attempt + 1);
                    }
                } else {
                    console.error(`[Dashboard] Could not find an open port after ${this.maxRetries} attempts.`);
                }
            } else {
                console.error('[Dashboard] Failed to start:', err);
            }
        });
    }

    private async handleAnalyticsRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const analytics = await this.getAnalyticsData();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(analytics));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch analytics' }));
        }
    }

    private async getAnalyticsData() {
        const agentMemoryPath = path.join(this.workspacePath, '.agentMemory');

        try {
            try {
                await fsPromises.access(agentMemoryPath);
            } catch (error) {
                return this.getEmptyData();
            }

            const files = await fsPromises.readdir(agentMemoryPath);
            const memoryFiles = files.filter((f: string) => f.endsWith('.json'));

            if (memoryFiles.length === 0) return this.getEmptyData();

            const memories: any[] = [];
            for (const file of memoryFiles) {
                try {
                    const filePath = path.join(agentMemoryPath, file);
                    const content = await fsPromises.readFile(filePath, 'utf-8');
                    memories.push(JSON.parse(content));
                } catch (error) {
                    console.error(`Failed to read ${file}:`, error);
                }
            }

            return this.calculateStatistics(memories);
        } catch (error) {
            return this.getEmptyData();
        }
    }

    private calculateStatistics(memories: any[]) {
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
            if (createdBy.toLowerCase().includes('cline')) agentName = 'Cline';
            else if (createdBy.toLowerCase().includes('roocode')) agentName = 'RooCode';
            else if (createdBy.toLowerCase().includes('kilocode')) agentName = 'KiloCode';
            else if (createdBy.toLowerCase().includes('continue')) agentName = 'Continue';
            else if (createdBy.toLowerCase().includes('cursor')) agentName = 'Cursor';

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

    private getDashboardHTML(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>agentMemory Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #cccccc; padding: 20px; }
        .header { margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
        h1 { font-size: 28px; font-weight: 600; }
        .refresh-btn { background: #0e639c; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; }
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
    <div class="header"><h1>🧠 Memory Dashboard</h1><button class="refresh-btn" onclick="refresh()">🔄 Refresh</button></div>
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
    <div class="table-card"><div class="chart-title">Recent Activity</div><div id="recentActivityContainer"></div></div>
    <div class="table-card"><div class="chart-title">Top Memories</div><div id="topMemoriesContainer"></div></div>
    <script>
        let charts = {};
        const API_PORT = ${this.port};
        async function fetchData() { const res = await fetch(\`http://localhost:\${API_PORT}/api/analytics\`); return await res.json(); }
        async function refresh() { const data = await fetchData(); updateDashboard(data); }
        function updateDashboard(data) {
            document.getElementById('totalMemories').textContent = data.overview.totalMemories;
            document.getElementById('totalProjects').textContent = data.overview.totalProjects;
            document.getElementById('activeAgents').textContent = data.overview.activeAgents;
            document.getElementById('tokensWritten').textContent = formatNumber(data.overview.totalTokensWritten);
            document.getElementById('tokensRead').textContent = formatNumber(data.overview.totalTokensRead);
            updateAgentChart(data.agentActivity);
            updateTypeChart(data.memoryTypes);
            updateRecentActivity(data.recentActivity);
            updateTopMemories(data.topMemories);
        }
        function updateAgentChart(data) {
            const ctx = document.getElementById('agentChart').getContext('2d');
            if (charts.agentChart) charts.agentChart.destroy();
            charts.agentChart = new Chart(ctx, { type: 'bar', data: { labels: data.labels, datasets: [{ label: 'Writes', data: data.writes, backgroundColor: 'rgba(75, 192, 192, 0.6)' }, { label: 'Reads', data: data.reads, backgroundColor: 'rgba(153, 102, 255, 0.6)' }] }, options: { responsive: true, maintainAspectRatio: false } });
        }
        function updateTypeChart(data) {
            const ctx = document.getElementById('typeChart').getContext('2d');
            if (charts.typeChart) charts.typeChart.destroy();
            charts.typeChart = new Chart(ctx, { type: 'doughnut', data: { labels: data.labels, datasets: [{ data: data.data, backgroundColor: ['#ff6384','#36a2eb','#ffce56','#4bc0c0','#9966ff','#ff9f40'] }] }, options: { responsive: true, maintainAspectRatio: false } });
        }
        function updateRecentActivity(activities) {
            const container = document.getElementById('recentActivityContainer');
            if (!activities || activities.length === 0) { container.innerHTML = '<div class="empty-state">No recent activity</div>'; return; }
            let html = '<table><thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Key</th></tr></thead><tbody>';
            activities.forEach(a => { html += \`<tr><td>\${new Date(a.timestamp).toLocaleString()}</td><td>\${a.agent}</td><td>\${a.action}</td><td>\${a.key}</td></tr>\`; });
            html += '</tbody></table>';
            container.innerHTML = html;
        }
        function updateTopMemories(memories) {
            const container = document.getElementById('topMemoriesContainer');
            if (!memories || memories.length === 0) { container.innerHTML = '<div class="empty-state">No memories yet</div>'; return; }
            let html = '<table><thead><tr><th>Key</th><th>Type</th><th>Access Count</th><th>Last Updated</th></tr></thead><tbody>';
            memories.forEach(m => { html += \`<tr><td>\${m.key}</td><td>\${m.type}</td><td>\${m.accessCount}</td><td>\${new Date(m.updatedAt).toLocaleString()}</td></tr>\`; });
            html += '</tbody></table>';
            container.innerHTML = html;
        }
        function formatNumber(num) { if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'; else if (num >= 1000) return (num / 1000).toFixed(1) + 'K'; return num.toString(); }
        refresh();
    </script>
</body>
</html>`;
    }
}

// Only run if called directly
if (require.main === module) {
    const workspacePath = process.argv[2] || process.cwd();
    const server = new StandaloneDashboard(workspacePath);
    server.start();
}

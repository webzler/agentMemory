import * as vscode from 'vscode';
import * as path from 'path';

export class DashboardManager {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) { }

    /**
     * Open the Memory Dashboard in a webview panel
     */
    async openDashboard() {
        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Create new webview panel
        this.panel = vscode.window.createWebviewPanel(
            'agentMemoryDashboard',
            '🧠 Memory Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'out'))
                ]
            }
        );

        // Set HTML content
        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'requestData':
                        await this.sendDataToWebview();
                        break;
                    case 'refresh':
                        await this.sendDataToWebview();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Clean up when panel is disposed
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            undefined,
            this.context.subscriptions
        );

        // Send initial data
        await this.sendDataToWebview();
    }

    /**
     * Send analytics data to the webview
     */
    private async sendDataToWebview() {
        if (!this.panel) return;

        // Get analytics data from MCP server
        const analytics = await this.getAnalyticsData();

        this.panel.webview.postMessage({
            command: 'updateData',
            data: analytics
        });
    }

    /**
     * Fetch analytics data from the MCP server and storage
     */
    private async getAnalyticsData() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return this.getEmptyData();
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const agentMemoryPath = path.join(workspacePath, '.agentMemory');

        try {
            // Check if storage directory exists
            const fs = require('fs').promises;

            try {
                await fs.access(agentMemoryPath);
            } catch {
                // Directory doesn't exist yet - no memories created
                console.log('[Dashboard] No .agentMemory directory found at:', agentMemoryPath);
                return this.getEmptyData();
            }

            // Read all memory files
            const files = await fs.readdir(agentMemoryPath);
            const memoryFiles = files.filter((f: string) => f.endsWith('.json'));

            if (memoryFiles.length === 0) {
                console.log('[Dashboard] No memory files found');
                return this.getEmptyData();
            }

            // Load all memories
            const memories: any[] = [];
            for (const file of memoryFiles) {
                try {
                    const content = await fs.readFile(path.join(agentMemoryPath, file), 'utf-8');
                    const memory = JSON.parse(content);
                    memories.push(memory);
                } catch (error) {
                    console.error('[Dashboard] Failed to read memory file:', file, error);
                }
            }

            // Calculate statistics
            const stats = this.calculateStatistics(memories);
            console.log('[Dashboard] Loaded', memories.length, 'memories');

            return stats;

        } catch (error) {
            console.error('[Dashboard] Error fetching analytics:', error);
            return this.getEmptyData();
        }
    }

    /**
     * Calculate statistics from memories
     */
    private calculateStatistics(memories: any[]) {
        // Count by agent
        const agentCounts: any = {
            Cline: { writes: 0, reads: 0 },
            RooCode: { writes: 0, reads: 0 },
            KiloCode: { writes: 0, reads: 0 },
            Continue: { writes: 0, reads: 0 },
            Cursor: { writes: 0, reads: 0 }
        };

        // Count by type
        const typeCounts: any = {
            Architecture: 0,
            Pattern: 0,
            Feature: 0,
            API: 0,
            Bug: 0,
            Decision: 0
        };

        let totalTokensWritten = 0;
        let totalTokensRead = 0;
        const activeAgents = new Set<string>();
        const recentActivity: any[] = [];
        const projects = new Set<string>();

        memories.forEach(memory => {
            // Track projects
            if (memory.projectId) {
                projects.add(memory.projectId);
            }

            // Track agent activity
            const createdBy = memory.metadata?.createdBy || 'Unknown';
            activeAgents.add(createdBy);

            // Map agent names
            let agentName = 'Unknown';
            if (createdBy.includes('cline')) agentName = 'Cline';
            else if (createdBy.includes('roocode') || createdBy.includes('roo')) agentName = 'RooCode';
            else if (createdBy.includes('kilocode') || createdBy.includes('kilo')) agentName = 'KiloCode';
            else if (createdBy.includes('continue')) agentName = 'Continue';
            else if (createdBy.includes('cursor')) agentName = 'Cursor';

            if (agentCounts[agentName]) {
                agentCounts[agentName].writes++;
            }

            // Estimate tokens (rough: ~4 chars per token)
            const contentLength = memory.content?.length || 0;
            const estimatedTokens = Math.ceil(contentLength / 4);
            totalTokensWritten += estimatedTokens;

            // Track reads from accessCount
            const accessCount = memory.metadata?.accessCount || 0;
            totalTokensRead += estimatedTokens * accessCount;

            if (agentCounts[agentName]) {
                agentCounts[agentName].reads += accessCount;
            }

            // Count by type
            const type = memory.type || 'Unknown';
            const typeKey = type.charAt(0).toUpperCase() + type.slice(1);
            if (typeCounts[typeKey] !== undefined) {
                typeCounts[typeKey]++;
            }

            // Recent activity (simulated from creation time)
            recentActivity.push({
                timestamp: memory.createdAt || Date.now(),
                agent: agentName,
                action: 'write',
                key: memory.key
            });
        });

        // Sort recent activity by timestamp (most recent first)
        recentActivity.sort((a, b) => b.timestamp - a.timestamp);

        // Top memories by access count
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
                writes: [
                    agentCounts.Cline.writes,
                    agentCounts.RooCode.writes,
                    agentCounts.KiloCode.writes,
                    agentCounts.Continue.writes,
                    agentCounts.Cursor.writes
                ],
                reads: [
                    agentCounts.Cline.reads,
                    agentCounts.RooCode.reads,
                    agentCounts.KiloCode.reads,
                    agentCounts.Continue.reads,
                    agentCounts.Cursor.reads
                ]
            },
            memoryTypes: {
                labels: ['Architecture', 'Pattern', 'Feature', 'API', 'Bug', 'Decision'],
                data: [
                    typeCounts.Architecture,
                    typeCounts.Pattern,
                    typeCounts.Feature,
                    typeCounts.API,
                    typeCounts.Bug,
                    typeCounts.Decision
                ]
            },
            tokenMetrics: {
                timestamps: [],
                written: [],
                read: []
            },
            recentActivity: recentActivity.slice(0, 10),
            topMemories,
            projects: Array.from(projects)
        };
    }

    /**
     * Return empty data structure
     */
    private getEmptyData() {
        return {
            overview: {
                totalMemories: 0,
                totalProjects: 0,
                activeAgents: 0,
                totalTokensWritten: 0,
                totalTokensRead: 0
            },
            agentActivity: {
                labels: ['Cline', 'RooCode', 'KiloCode', 'Continue', 'Cursor'],
                writes: [0, 0, 0, 0, 0],
                reads: [0, 0, 0, 0, 0]
            },
            memoryTypes: {
                labels: ['Architecture', 'Pattern', 'Feature', 'API', 'Bug', 'Decision'],
                data: [0, 0, 0, 0, 0, 0]
            },
            tokenMetrics: {
                timestamps: [],
                written: [],
                read: []
            },
            recentActivity: [],
            topMemories: [],
            projects: []
        };
    }

    /**
     * Generate HTML content for the webview
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>agentMemory Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
        }

        .header {
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        h1 {
            font-size: 28px;
            font-weight: 600;
        }

        .refresh-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }

        .refresh-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .overview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
        }

        .stat-label {
            font-size: 12px;
            text-transform: uppercase;
            opacity: 0.7;
            margin-bottom: 8px;
        }

        .stat-value {
            font-size: 32px;
            font-weight: 700;
        }

        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .chart-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
        }

        .chart-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
        }

        .chart-container {
            position: relative;
            height: 300px;
        }

        .table-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        th {
            font-weight: 600;
            opacity: 0.7;
            font-size: 12px;
            text-transform: uppercase;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧠 Memory Dashboard</h1>
        <button class="refresh-btn" onclick="refresh()">🔄 Refresh</button>
    </div>

    <div class="overview-grid">
        <div class="stat-card">
            <div class="stat-label">Total Memories</div>
            <div class="stat-value" id="totalMemories">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Projects</div>
            <div class="stat-value" id="totalProjects">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Active Agents</div>
            <div class="stat-value" id="activeAgents">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Tokens Written</div>
            <div class="stat-value" id="tokensWritten">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Tokens Read</div>
            <div class="stat-value" id="tokensRead">0</div>
        </div>
    </div>

    <div class="charts-grid">
        <div class="chart-card">
            <div class="chart-title">Agent Activity</div>
            <div class="chart-container">
                <canvas id="agentChart"></canvas>
            </div>
        </div>
        <div class="chart-card">
            <div class="chart-title">Memory Types</div>
            <div class="chart-container">
                <canvas id="typeChart"></canvas>
            </div>
        </div>
    </div>

    <div class="chart-card" style="margin-bottom: 20px;">
        <div class="chart-title">Token Metrics Over Time</div>
        <div class="chart-container">
            <canvas id="tokenChart"></canvas>
        </div>
    </div>

    <div class="table-card">
        <div class="chart-title">Recent Activity</div>
        <div id="recentActivityContainer"></div>
    </div>

    <div class="table-card">
        <div class="chart-title">Top Memories (Most Accessed)</div>
        <div id="topMemoriesContainer"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let charts = {};

        // Request initial data
        vscode.postMessage({ command: 'requestData' });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
                updateDashboard(message.data);
            }
        });

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function updateDashboard(data) {
            // Update overview stats
            document.getElementById('totalMemories').textContent = data.overview.totalMemories;
            document.getElementById('totalProjects').textContent = data.overview.totalProjects;
            document.getElementById('activeAgents').textContent = data.overview.activeAgents;
            document.getElementById('tokensWritten').textContent = formatNumber(data.overview.totalTokensWritten);
            document.getElementById('tokensRead').textContent = formatNumber(data.overview.totalTokensRead);

            // Update charts
            updateAgentChart(data.agentActivity);
            updateTypeChart(data.memoryTypes);
            updateTokenChart(data.tokenMetrics);

            // Update tables
            updateRecentActivity(data.recentActivity);
            updateTopMemories(data.topMemories);
        }

        function updateAgentChart(data) {
            const ctx = document.getElementById('agentChart').getContext('2d');
            
            if (charts.agentChart) {
                charts.agentChart.destroy();
            }

            charts.agentChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [
                        {
                            label: 'Writes',
                            data: data.writes,
                            backgroundColor: 'rgba(75, 192, 192, 0.6)'
                        },
                        {
                            label: 'Reads',
                            data: data.reads,
                            backgroundColor: 'rgba(153, 102, 255, 0.6)'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        function updateTypeChart(data) {
            const ctx = document.getElementById('typeChart').getContext('2d');
            
            if (charts.typeChart) {
                charts.typeChart.destroy();
            }

            charts.typeChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: data.labels,
                    datasets: [{
                        data: data.data,
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.6)',
                            'rgba(54, 162, 235, 0.6)',
                            'rgba(255, 206, 86, 0.6)',
                            'rgba(75, 192, 192, 0.6)',
                            'rgba(153, 102, 255, 0.6)',
                            'rgba(255, 159, 64, 0.6)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        function updateTokenChart(data) {
            const ctx = document.getElementById('tokenChart').getContext('2d');
            
            if (charts.tokenChart) {
                charts.tokenChart.destroy();
            }

            charts.tokenChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.timestamps,
                    datasets: [
                        {
                            label: 'Tokens Written',
                            data: data.written,
                            borderColor: 'rgba(75, 192, 192, 1)',
                            fill: false
                        },
                        {
                            label: 'Tokens Read',
                            data: data.read,
                            borderColor: 'rgba(153, 102, 255, 1)',
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        function updateRecentActivity(activities) {
            const container = document.getElementById('recentActivityContainer');
            
            if (!activities || activities.length === 0) {
                container.innerHTML = '<div class="empty-state">No recent activity</div>';
                return;
            }

            let html = '<table><thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Key</th></tr></thead><tbody>';
            activities.forEach(activity => {
                html += \`<tr>
                    <td>\${new Date(activity.timestamp).toLocaleString()}</td>
                    <td>\${activity.agent}</td>
                    <td>\${activity.action}</td>
                    <td>\${activity.key}</td>
                </tr>\`;
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
            memories.forEach(memory => {
                html += \`<tr>
                    <td>\${memory.key}</td>
                    <td>\${memory.type}</td>
                    <td>\${memory.accessCount}</td>
                    <td>\${new Date(memory.updatedAt).toLocaleString()}</td>
                </tr>\`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        function formatNumber(num) {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
            return num.toString();
        }
    </script>
</body>
</html>`;
    }
}

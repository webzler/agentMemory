import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DashboardRenderer {
    constructor(private context: vscode.ExtensionContext) { }

    public getHtml(data: any): string {
        const iconPath = path.join(this.context.extensionPath, 'images', 'icon.png');
        let iconBase64 = '';
        try {
            iconBase64 = 'data:image/png;base64,' + fs.readFileSync(iconPath, 'base64');
        } catch (e) { iconBase64 = ''; }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>agentMemory Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            /* Claymorphism Theme Variables */
            /* Default Dark Mode (Matches User Preference for Dark) */
            --bg-color: #252b36;
            --text-primary: #e0e5ec;
            --text-secondary: #a0a0b8;
            --card-bg: #2b323f;
            --shadow-light: rgba(255, 255, 255, 0.05);
            --shadow-dark: rgba(0, 0, 0, 0.3);
            
            --accent-purple: #8B5CF6;
            --accent-blue: #3B82F6;
            --accent-green: #10B981;
            
            /* 3D Shadows */
            --clay-shadow: 
                8px 8px 16px var(--shadow-dark), 
                -8px -8px 16px var(--shadow-light);
            --clay-shadow-inset: 
                inset 6px 6px 10px var(--shadow-dark), 
                inset -6px -6px 10px var(--shadow-light);
        }

        /* Light Mode Support via Media Query */
        @media (prefers-color-scheme: light) {
            :root {
                --bg-color: #e0e5ec;
                --text-primary: #4a5568;
                --text-secondary: #718096;
                --card-bg: #e0e5ec;
                --shadow-light: #ffffff;
                --shadow-dark: #a3b1c6;
                --clay-shadow: 
                    9px 9px 16px rgb(163,177,198,0.6), 
                    -9px -9px 16px rgba(255,255,255, 0.5);
                --clay-shadow-inset: 
                    inset 6px 6px 10px rgb(163,177,198,0.6), 
                    inset -6px -6px 10px rgba(255,255,255, 0.5);
            }
        }

        body.vscode-light {
            /* VSCode Specific variables if available */
             --bg-color: #e0e5ec;
             --text-primary: #2d3748;
             --card-bg: #e0e5ec;
             /* Redefine shadows for light context */
             --clay-shadow: 9px 9px 16px #a3b1c6, -9px -9px 16px #ffffff;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Nunito', 'Segoe UI', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 40px;
            transition: background-color 0.3s ease;
        }

        .container { max-width: 1600px; margin: 0 auto; }

        /* Clay Headers */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
            padding: 20px 40px;
            border-radius: 30px;
            background-color: var(--bg-color);
            box-shadow: var(--clay-shadow);
        }

        .brand { display: flex; align-items: center; gap: 15px; }
        .logo { width: 40px; height: 40px; border-radius: 12px; box-shadow: var(--clay-shadow); }
        h1 { font-size: 24px; font-weight: 700; color: var(--accent-purple); }

        .search-box {
            border: none;
            outline: none;
            background: var(--bg-color);
            padding: 12px 24px;
            border-radius: 20px;
            box-shadow: var(--clay-shadow-inset);
            color: var(--text-primary);
            width: 300px;
            font-size: 14px;
            transition: all 0.2s;
        }
        .search-box:focus {
            box-shadow: inset 8px 8px 12px var(--shadow-dark), inset -8px -8px 12px var(--shadow-light);
        }

        .btn {
            border: none;
            background: var(--bg-color);
            padding: 12px 24px;
            border-radius: 20px;
            color: var(--accent-blue);
            font-weight: 600;
            box-shadow: var(--clay-shadow);
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            color: var(--accent-purple);
        }
        .btn:active {
            box-shadow: var(--clay-shadow-inset);
            transform: translateY(0);
        }

        /* Stats Grid - Floating Clay Cards */
        .overview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        .stat-card {
            background-color: var(--card-bg);
            border-radius: 30px;
            padding: 30px;
            box-shadow: var(--clay-shadow);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            transition: transform 0.3s;
        }
        .stat-card:hover { transform: translateY(-5px); }
        
        .stat-value {
            font-size: 36px;
            font-weight: 800;
            margin: 10px 0;
            background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .stat-label { font-size: 14px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }

        /* Charts - Deep Clay Containers */
        .grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 30px;
            margin-bottom: 40px;
        }
        .card {
            background-color: var(--card-bg);
            border-radius: 30px;
            padding: 30px;
            box-shadow: var(--clay-shadow);
        }
        .card-title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 20px;
            color: var(--text-primary);
        }
        .chart-wrapper { height: 300px; position: relative; }

        /* Table */
        .table-container {
            border-radius: 20px;
            overflow: hidden;
            box-shadow: var(--clay-shadow-inset);
            padding: 20px;
        }
        table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
        th { color: var(--text-secondary); padding: 10px 20px; }
        td { 
            background: var(--bg-color); 
            padding: 15px 20px; 
            box-shadow: var(--clay-shadow);
            font-size: 14px;
        }
        tr td:first-child { border-top-left-radius: 10px; border-bottom-left-radius: 10px; }
        tr td:last-child { border-top-right-radius: 10px; border-bottom-right-radius: 10px; }
        
        .agent-badge {
            padding: 6px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 700;
            box-shadow: var(--clay-shadow);
            color: var(--accent-purple);
        }

    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="brand">
                <img src="${iconBase64}" class="logo" alt="icon" />
                <h1>agentMemory</h1>
            </div>
            <input type="text" class="search-box" placeholder="Search memories...">
            <div style="display:flex; gap:15px;">
                <button class="btn" onclick="location.reload()">Refresh</button>
            </div>
        </div>

        <div class="overview-grid">
            <div class="stat-card">
                <span class="stat-label">Total Memories</span>
                <span class="stat-value">${data.overview.totalMemories}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Projects</span>
                <span class="stat-value">${data.overview.totalProjects}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Active Agents</span>
                <span class="stat-value">${data.overview.activeAgents}</span>
            </div>
             <div class="stat-card">
                <span class="stat-label">Tokens</span>
                <span class="stat-value">${(data.overview.totalTokensWritten / 1000).toFixed(1)}k</span>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-title">Agent Activity</div>
                <div class="chart-wrapper"><canvas id="agentChart"></canvas></div>
            </div>
            <div class="card">
                <div class="card-title">Types</div>
                <div class="chart-wrapper"><canvas id="typeChart"></canvas></div>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Recent Activity</div>
            <div class="table-container">
                <table>
                    <thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Key</th><th>Type</th></tr></thead>
                    <tbody>
                        ${data.recentActivity.map((item: any) => `
                        <tr>
                            <td>${new Date(item.time).toLocaleTimeString()}</td>
                            <td><span class="agent-badge">${item.agent}</span></td>
                            <td>${item.action}</td>
                            <td style="font-weight:600; color:var(--accent-blue)">${item.key}</td>
                            <td>${item.type}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const agentData = ${JSON.stringify(data.agentActivity)};
        const typeData = ${JSON.stringify(data.memoryTypes)};

        // Claymorphism Chart Configs
        Chart.defaults.color = '#a0a0b8';
        Chart.defaults.font.family = 'Nunito';

        new Chart(document.getElementById('agentChart'), {
            type: 'bar',
            data: {
                labels: agentData.labels,
                datasets: [
                    { label: 'Writes', data: agentData.writes, backgroundColor: '#8B5CF6', borderRadius: 10, barPercentage: 0.6 },
                    { label: 'Reads', data: agentData.reads, backgroundColor: '#3B82F6', borderRadius: 10, barPercentage: 0.6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position:'top', align:'end' } },
                scales: { 
                    y: { grid: { display:false }, border:{ display:false } },
                    x: { grid: { display:false }, border:{ display:false } } 
                }
            }
        });

        new Chart(document.getElementById('typeChart'), {
            type: 'doughnut',
            data: {
                labels: typeData.labels,
                datasets: [{
                    data: typeData.data,
                    backgroundColor: ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position:'right' } }
            }
        });
    </script>
</body>
</html>`;
    }
}

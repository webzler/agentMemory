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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://d3js.org; img-src data: https:;">
    <title>agentMemory Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        :root {
            /* Claymorphism Theme Variables */
            --bg-color: #252b36;
            --text-primary: #e0e5ec;
            --text-secondary: #a0a0b8;
            --card-bg: #2b323f;
            --shadow-light: rgba(255, 255, 255, 0.05);
            --shadow-dark: rgba(0, 0, 0, 0.3);
            
            --accent-purple: #8B5CF6;
            --accent-blue: #3B82F6;
            --accent-green: #10B981;
            
            --clay-shadow: 
                8px 8px 16px var(--shadow-dark), 
                -8px -8px 16px var(--shadow-light);
            --clay-shadow-inset: 
                inset 6px 6px 10px var(--shadow-dark), 
                inset -6px -6px 10px var(--shadow-light);
            --clay-shadow-pressed: 
                 inset 4px 4px 8px var(--shadow-dark), 
                 inset -4px -4px 8px var(--shadow-light);
            
            --container-padding: 40px;
            --card-padding: 30px;
            --gap-size: 30px;
        }

        /* Light Mode Support */
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
                --clay-shadow-pressed:
                    inset 4px 4px 8px rgb(163,177,198,0.6), 
                    inset -4px -4px 8px rgba(255,255,255, 0.5);
            }
            /* Invert logo for light mode if it's white */
            .logo { filter: invert(1); }
        }

        body.vscode-light {
             --bg-color: #e0e5ec;
             --text-primary: #2d3748;
             --card-bg: #e0e5ec;
             --clay-shadow: 9px 9px 16px #a3b1c6, -9px -9px 16px #ffffff;
        }
        body.vscode-light .logo { filter: invert(1); }

        /* Responsive Adjustments */
        @media (max-width: 800px) {
            :root {
                --container-padding: 20px;
                --card-padding: 20px;
                --gap-size: 15px;
            }
            h1 { font-size: 20px; }
            .stat-value { font-size: 24px; }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Nunito', 'Segoe UI', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            min-height: 100vh;
            padding: var(--container-padding);
            transition: background-color 0.3s ease;
            overflow-x: hidden;
        }

        .container { max-width: 100%; margin: 0 auto; }

        /* Headers */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--gap-size);
            padding: 15px 30px;
            border-radius: 20px;
            background-color: var(--bg-color);
            box-shadow: var(--clay-shadow);
            flex-wrap: wrap;
            gap: 15px;
        }

        .brand { display: flex; align-items: center; gap: 15px; }
        .logo { width: 32px; height: 32px; border-radius: 10px; box-shadow: var(--clay-shadow); transition: filter 0.3s; }
        h1 { font-size: 22px; font-weight: 700; color: var(--accent-purple); }

        .btn {
            border: none;
            background: var(--bg-color);
            padding: 10px 20px;
            border-radius: 15px;
            color: var(--accent-blue);
            font-weight: 600;
            box-shadow: var(--clay-shadow);
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
        }
        .btn:hover {
            transform: translateY(-2px);
            color: var(--accent-purple);
        }
        .btn:active {
            box-shadow: var(--clay-shadow-inset);
            transform: translateY(0);
        }
        .btn.secondary {
             color: var(--text-secondary);
             font-size: 12px;
             padding: 8px 16px;
        }

        /* Stats Grid */
        .overview-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: var(--gap-size);
            margin-bottom: var(--gap-size);
        }
        @media (max-width: 700px) { .overview-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 400px) { .overview-grid { grid-template-columns: 1fr; } }

        .stat-card {
            background-color: var(--card-bg);
            border-radius: 20px;
            padding: var(--card-padding);
            box-shadow: var(--clay-shadow);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            transition: all 0.2s;
            min-height: 120px;
            justify-content: center;
            cursor: pointer;
            position: relative;
            user-select: none;
        }
        .stat-card:hover { transform: translateY(-5px); background-color: var(--bg-color); }
        .stat-card:active { box-shadow: var(--clay-shadow-pressed); transform: translateY(0); }
        .stat-card.active { box-shadow: var(--clay-shadow-inset); border: 2px solid var(--accent-purple); }

        .stat-value {
            font-size: 28px;
            font-weight: 800;
            margin: 8px 0;
            background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .stat-label { font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

        /* Views */
        .view-section { display: none; animation: fadeIn 0.4s ease; }
        .view-section.active-view { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* Charts */
        .grid { display: grid; grid-template-columns: 2fr 1fr; gap: var(--gap-size); margin-bottom: var(--gap-size); }
        @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

        .card { background-color: var(--card-bg); border-radius: 20px; padding: var(--card-padding); box-shadow: var(--clay-shadow); margin-bottom: var(--gap-size); }
        .card-title { font-size: 16px; font-weight: 700; margin-bottom: 15px; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; }
        .chart-wrapper { height: 250px; position: relative; }

        /* Tables */
        .table-container { border-radius: 15px; overflow: hidden; box-shadow: var(--clay-shadow-inset); padding: 15px; overflow-x: auto; }
        table { width: 100%; border-collapse: separate; border-spacing: 0 8px; }
        th { color: var(--text-secondary); padding: 10px 15px; font-size: 12px; font-weight: 700; text-transform: uppercase; text-align: left;}
        tr.clickable-row { cursor: pointer; transition: transform 0.1s; }
        tr.clickable-row:hover td { background: var(--card-bg); transform: scale(1.01); }
        td { background: var(--bg-color); padding: 12px 15px; box-shadow: var(--clay-shadow); font-size: 13px; }
        tr td:first-child { border-top-left-radius: 10px; border-bottom-left-radius: 10px; }
        tr td:last-child { border-top-right-radius: 10px; border-bottom-right-radius: 10px; }
        
        .agent-badge { padding: 4px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; box-shadow: var(--clay-shadow); color: var(--accent-purple); background: var(--bg-color); }

        /* MODAL */
        .modal {
            display: none; 
            position: fixed; 
            z-index: 100; 
            left: 0; 
            top: 0; 
            width: 100%; 
            height: 100%; 
            overflow: auto; 
            background-color: rgba(0,0,0,0.5); 
            backdrop-filter: blur(5px);
            animation: fadeIn 0.2s;
        }
        .modal-content {
            background-color: var(--bg-color);
            margin: 5% auto; 
            padding: 30px; 
            border-radius: 20px;
            box-shadow: var(--clay-shadow);
            width: 80%; 
            max-width: 900px;
            max-height: 80vh;
            overflow-y: auto;
            position: relative;
        }
        .close { color: var(--text-secondary); float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
        .close:hover, .close:focus { color: var(--accent-purple); text-decoration: none; cursor: pointer; }
        
        .modal-header { margin-bottom: 20px; border-bottom: 1px solid var(--text-secondary); padding-bottom: 10px; }
        .modal-title { font-size: 20px; font-weight: 800; color: var(--accent-blue); }
        .modal-meta { display: flex; gap: 15px; margin-top: 5px; font-size: 12px; color: var(--text-secondary); }
        
        .markdown-body { font-family: 'Segoe UI', sans-serif; line-height: 1.6; color: var(--text-primary); }
        .markdown-body pre { background: var(--card-bg); padding: 15px; border-radius: 10px; box-shadow: var(--clay-shadow-inset); overflow-x: auto; }
        .markdown-body code { font-family: monospace; color: var(--accent-purple); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="brand">
                <img src="${iconBase64}" class="logo" alt="icon" />
                <h1>agentMemory</h1>
            </div>
            <div style="display:flex; gap:15px;">
                <button class="btn" onclick="location.reload()">Refresh</button>
            </div>
        </div>

        <div class="overview-grid">
            <div class="stat-card" id="card-memories" onclick="switchView('recent', 'card-memories')">
                <span class="stat-label">Total Memories</span>
                <span class="stat-value">${data.overview.totalMemories}</span>
            </div>
            <div class="stat-card" id="card-projects" onclick="switchView('projects', 'card-projects')">
                <span class="stat-label">Projects</span>
                <span class="stat-value">${data.overview.totalProjects}</span>
            </div>
            <div class="stat-card" id="card-agents" onclick="switchView('agents', 'card-agents')">
                <span class="stat-label">Active Agents</span>
                <span class="stat-value">${data.overview.activeAgents}</span>
            </div>
             <div class="stat-card" id="card-tokens" onclick="switchView('tokens', 'card-tokens')">
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

        <!-- VIEW: Recent Activity -->
        <div id="view-recent" class="view-section active-view">
            <div class="card">
                <div class="card-title">Recent Activity</div>
                <div class="table-container">
                    <table id="recent-table">
                        <thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Key</th><th>Type</th></tr></thead>
                        <tbody>
                            ${data.recentActivity.map((item: any) => `
                            <tr class="clickable-row" onclick="openMemoryModal('${item.key}')">
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

        <!-- VIEW: Projects Overview -->
        <div id="view-projects" class="view-section">
            <div class="card">
                <div class="card-title">Projects Overview <span style="font-size:12px; font-weight:400; color:var(--text-secondary)">(Click row for details)</span></div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Project Name</th><th>Memories</th><th>Active Agents</th><th>Last Active</th><th>Actions</th></tr></thead>
                        <tbody>
                             ${data.projects.map((p: any, index: number) => `
                            <tr class="clickable-row">
                                <td style="font-weight:bold; color:var(--text-primary)">${p.name}</td>
                                <td><span class="stat-number">${p.count}</span></td>
                                <td>${p.agents.map((a: string) => `<span class="agent-badge">${a}</span>`).join(' ')}</td>
                                <td>${new Date(p.lastActive).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn secondary" onclick="openProjectDetailsByIndex(${index})">View Details</button>
                                </td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- VIEW: Single Project Details (Hidden by default) -->
        <div id="view-project-detail" class="view-section">
             <div class="card">
                <div class="card-title">
                    <span id="project-detail-title">Project Details</span>
                    <div>
                        <button class="btn" style="margin-right:10px; background-color: var(--accent-purple); color: white;" onclick="openProjectVisualization()">Visualize Workflow</button>
                        <button class="btn secondary" onclick="switchView('projects', 'card-projects')">← Back to Projects</button>
                    </div>
                </div>
                <div class="table-container">
                    <table id="project-memories-table">
                        <!-- Populated by JS -->
                    </table>
                </div>
            </div>
        </div>

        <!-- VIEW: Project Visualization -->
        <div id="view-visualization" class="view-section">
            <div class="card">
                 <div class="card-title">
                    <span id="viz-title">Project Visualization</span>
                    <button class="btn secondary" onclick="backToProjectDetails()">← Back to List</button>
                </div>
                <div id="viz-container" style="width: 100%; overflow: auto; padding: 20px; background: var(--bg-color); border-radius: 15px;">
                    <svg id="workflow-graph" style="width: 100%; min-height: 500px;"></svg>
                </div>
            </div>
        </div>

        <!-- VIEW: Agents -->
        <div id="view-agents" class="view-section">
            <div class="card">
                <div class="card-title">Agents Breakdown</div>
                <div style="padding: 20px; color: var(--text-secondary);">
                    Detailed breakdown of agent interactions and permissions coming soon.
                    <br><br>
                    Currently tracking behavior for: 
                    ${data.projects.flatMap((p: any) => p.agents).filter((v: any, i: any, a: any) => a.indexOf(v) === i).join(', ')}
                </div>
            </div>
        </div>
        
        <!-- VIEW: Tokens -->
        <div id="view-tokens" class="view-section">
             <div class="card">
                <div class="card-title">Token Usage</div>
                <div style="display:flex; justify-content:space-around; text-align:center; margin-top:20px;">
                    <div>
                        <div style="font-size:12px; text-transform:uppercase; color:var(--text-secondary)">Read Tokens</div>
                        <div style="font-size:40px; font-weight:800; color:var(--accent-blue)">${(data.overview.totalTokensRead / 1000).toFixed(1)}k</div>
                    </div>
                </div>
            </div>
        </div>

    </div>

    <!-- Memory Detail Modal -->
    <div id="memoryModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <div class="modal-header">
                <div class="modal-title" id="modalTitle">Memory Title</div>
                <div class="modal-meta" id="modalMeta"></div>
            </div>
            <div class="markdown-body" id="modalBody">
                <!-- Content goes here -->
            </div>
        </div>
    </div>

    <script>
        // VSCode API for webview communication (only available in VSCode webview)
        let vscode = null;
        try {
            if (typeof acquireVsCodeApi !== 'undefined') {
                vscode = acquireVsCodeApi();
            }
        } catch(e) {
            // Running in browser, not VSCode webview
            console.log('Running in browser mode');
        }
        
        // Listen for messages from extension (only in VSCode)
        if (vscode) {
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'updateData') {
                    // Update data without full page reload
                    updateDashboardData(message.data);
                }
            });
        }
        
        function updateDashboardData(newData) {
            // Update global data
            Object.assign({ allProjects, recentActivity }, newData);
            // Refresh current view
            location.reload();
        }
        
        // Data injected from backend
        const allProjects = ${JSON.stringify(data.projects)};
        const recentActivity = ${JSON.stringify(data.recentActivity)};
        let currentProjectName = '';
        
        // Debug logging
        console.log('[Dashboard] Initializing with', allProjects.length, 'projects');
        console.log('[Dashboard] Recent activity count:', recentActivity.length);
        
        // --- View Switching ---
        function switchView(viewId, cardId) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
            document.querySelectorAll('.stat-card').forEach(el => el.classList.remove('active'));
            document.getElementById('view-' + viewId).classList.add('active-view');
            if(cardId) document.getElementById(cardId).classList.add('active');
        }

        // --- Project Details ---
        function openProjectDetailsByIndex(index) {
            const project = allProjects[index];
            if (!project) return;
            openProjectDetails(project.name);
        }

        function openProjectDetails(projectName) {
            currentProjectName = projectName;
            const project = allProjects.find(p => p.name === projectName);
            if (!project) return;
            
            // Set title
            document.getElementById('project-detail-title').innerText = 'Project: ' + projectName;
            
            // Populate table
            const tableHTML = \`
                <thead><tr><th>Time</th><th>Agent</th><th>Key</th><th>Type</th></tr></thead>
                <tbody>
                    \${project.memories.map(m => \`
                    <tr class="clickable-row" onclick="openProjectMemory('\${projectName}', '\${m.key}')">
                        <td>\${new Date(m.createdAt).toLocaleString()}</td>
                        <td><span class="agent-badge">\${m.agent}</span></td>
                        <td style="font-weight:600; color:var(--accent-blue)">\${m.key}</td>
                        <td>\${m.type}</td>
                    </tr>
                    \`).join('')}
                </tbody>
            \`;
            document.getElementById('project-memories-table').innerHTML = tableHTML;
            
            // Switch view
            switchView('project-detail', 'card-projects');
        }

        function openProjectVisualization() {
            if(!currentProjectName) return;
            const project = allProjects.find(p => p.name === currentProjectName);
            if (!project) return;

            document.getElementById('viz-title').innerText = 'Workflow: ' + currentProjectName;
            
            // Filter valid memories and sort by time
            const validMemories = project.memories.filter(m => m.key);
            const sorted = [...validMemories].sort((a,b) => {
                const t1 = new Date(a.createdAt).getTime();
                const t2 = new Date(b.createdAt).getTime();
                return t1 - t2;
            });
            
            // Clear previous visualization
            const svg = d3.select('#workflow-graph');
            svg.selectAll('*').remove();
            
            // Get container dimensions
            const container = document.getElementById('viz-container');
            const width = container.clientWidth - 40;
            const itemsPerRow = 4;
            const nodeWidth = 180;
            const nodeHeight = 50;
            const horizontalGap = 40;
            const verticalGap = 80;
            
            // Calculate positions in snake pattern
            const nodes = sorted.map((m, i) => {
                const row = Math.floor(i / itemsPerRow);
                const col = i % itemsPerRow;
                const isEvenRow = row % 2 === 0;
                const actualCol = isEvenRow ? col : (itemsPerRow - 1 - col);
                
                return {
                    ...m,
                    x: actualCol * (nodeWidth + horizontalGap) + nodeWidth / 2,
                    y: row * (nodeHeight + verticalGap) + nodeHeight / 2,
                    index: i
                };
            });
            
            // Calculate SVG height
            const numRows = Math.ceil(sorted.length / itemsPerRow);
            const height = numRows * (nodeHeight + verticalGap) + 100;
            
            svg.attr('width', width)
               .attr('height', height);
            
            // Create links (connections)
            const links = [];
            for(let i = 0; i < nodes.length - 1; i++) {
                links.push({
                    source: nodes[i],
                    target: nodes[i + 1]
                });
            }
            
            // Draw links
            svg.append('g')
               .selectAll('path')
               .data(links)
               .enter()
               .append('path')
               .attr('d', d => {
                   const sx = d.source.x;
                   const sy = d.source.y;
                   const tx = d.target.x;
                   const ty = d.target.y;
                   
                   // Create curved path
                   const midY = (sy + ty) / 2;
                   return \`M \${sx},\${sy} C \${sx},\${midY} \${tx},\${midY} \${tx},\${ty}\`;
               })
               .attr('fill', 'none')
               .attr('stroke', '#3B82F6')
               .attr('stroke-width', 2)
               .attr('opacity', 0.6);
            
            // Draw nodes
            const nodeGroups = svg.append('g')
               .selectAll('g')
               .data(nodes)
               .enter()
               .append('g')
               .attr('transform', d => \`translate(\${d.x - nodeWidth/2}, \${d.y - nodeHeight/2})\`)
               .style('cursor', 'pointer');
            
            // Add rectangles
            nodeGroups.append('rect')
               .attr('width', nodeWidth)
               .attr('height', nodeHeight)
               .attr('rx', 8)
               .attr('fill', d => {
                   const type = d.type || 'general';
                   if (type === 'feat') return '#8B5CF6';
                   if (type === 'fix') return '#3B82F6';
                   if (type === 'chore') return '#10B981';
                   return '#2b323f';
               })
               .attr('stroke', '#3B82F6')
               .attr('stroke-width', 2);
            
            // Add text
            nodeGroups.append('text')
               .attr('x', nodeWidth / 2)
               .attr('y', nodeHeight / 2)
               .attr('text-anchor', 'middle')
               .attr('dominant-baseline', 'middle')
               .attr('fill', '#e0e5ec')
               .attr('font-size', '12px')
               .attr('font-family', 'Nunito, sans-serif')
               .text(d => {
                   const text = d.key;
                   return text.length > 20 ? text.substring(0, 18) + '...' : text;
               })
               .append('title')
               .text(d => d.key);
            
            switchView('visualization', 'card-projects');
        }

        function backToProjectDetails() {
            switchView('project-detail', 'card-projects');
        }

        // --- Modal Logic ---
        const modal = document.getElementById("memoryModal");
        
        function openMemoryModal(key) {
            // Find memory in recent activity first
            let memory = recentActivity.find(m => m.key === key);
            
            // If not found (e.g. from project view), search in all projects
            if (!memory) {
                for(const p of allProjects) {
                    const found = p.memories.find(m => m.key === key);
                    if(found) { memory = found; break; }
                }
            }
            
            if (memory) {
                document.getElementById('modalTitle').innerText = memory.key;
                document.getElementById('modalMeta').innerHTML = \`
                    <span>Agent: \${memory.agent}</span> &bull; 
                    <span>Type: \${memory.type}</span> &bull; 
                    <span>Updated: \${new Date(memory.time || memory.updatedAt).toLocaleString()}</span>
                \`;
                
                // Parse markdown content
                const content = memory.content || '*No content available*';
                document.getElementById('modalBody').innerHTML = marked.parse(content);
                
                modal.style.display = "block";
            }
        }
        
        function openProjectMemory(projName, key) {
             const project = allProjects.find(p => p.name === projName);
             if(project) {
                 const memory = project.memories.find(m => m.key === key);
                 if(memory) {
                    document.getElementById('modalTitle').innerText = memory.key;
                    document.getElementById('modalMeta').innerHTML = \`
                        <span>Agent: \${memory.agent}</span> &bull; 
                        <span>Type: \${memory.type}</span> &bull; 
                        <span>Updated: \${new Date(memory.updatedAt).toLocaleString()}</span>
                    \`;
                    document.getElementById('modalBody').innerHTML = marked.parse(memory.content || '');
                    modal.style.display = "block";
                 }
             }
        }

        function closeModal() {
            modal.style.display = "none";
        }

        // Close on click outside
        window.onclick = function(event) {
            if (event.target == modal) { modal.style.display = "none"; }
        }

        // --- Charts ---
        const agentData = ${JSON.stringify(data.agentActivity)};
        const typeData = ${JSON.stringify(data.memoryTypes)};

        // Initialize charts when DOM is ready
        document.addEventListener('DOMContentLoaded', function() {
            console.log('[Dashboard] Initializing charts...');
            
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
            
            console.log('[Dashboard] Charts initialized successfully');
        });
    </script>
</body>
</html>`;
    }
}

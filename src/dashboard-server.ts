import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { AnalyticsEngine } from './analytics-engine';
import { DashboardRenderer } from './dashboard-renderer';

/**
 * Simple HTTP server for dashboard debugging
 * Access at http://localhost:3333
 */
export class DashboardServer {
    private server: http.Server | undefined;
    private port = 3333;
    private analyticsEngine: AnalyticsEngine;
    private renderer: DashboardRenderer;

    constructor(
        private context: vscode.ExtensionContext,
        private outputChannel: vscode.OutputChannel
    ) {
        this.analyticsEngine = new AnalyticsEngine();
        this.renderer = new DashboardRenderer(context);
    }

    /**
     * Start the HTTP server
     */
    start(): void {
        if (this.server) {
            this.outputChannel.appendLine('[DashboardServer] Server already running');
            return;
        }

        // Check if port is configured
        const config = vscode.workspace.getConfiguration('agentMemory');
        this.port = config.get<number>('dashboard.port') || 3333;

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

            // Serve dashboard HTML using Shared Renderer
            if (req.method === 'GET' && req.url === '/') {
                try {
                    const data = await this.analyticsEngine.getAnalyticsData();
                    const html = this.renderer.getHtml(data);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(html);
                } catch (e) {
                    res.writeHead(500);
                    res.end('Error rendering dashboard: ' + e);
                }
                return;
            }

            // API endpoint for dashboard data
            if (req.url === '/api/analytics') {
                this.handleAnalyticsRequest(req, res);
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

        this.server.on('error', (e: any) => {
            if (e.code === 'EADDRINUSE') {
                this.outputChannel.appendLine(`[DashboardServer] Port ${this.port} is in use. Attempting to close old server...`);
                // Optional: try to notify user to kill
                vscode.window.showErrorMessage(`Port ${this.port} is already in use. Please kill the process using lsof -i :${this.port}`);
            }
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
            const analytics = await this.analyticsEngine.getAnalyticsData();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(analytics));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch analytics' }));
        }
    }
}

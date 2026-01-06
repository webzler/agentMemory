import * as vscode from 'vscode';
import * as path from 'path';
import { AnalyticsEngine } from './analytics-engine';
import { DashboardRenderer } from './dashboard-renderer';

export class DashboardManager {
    private panel: vscode.WebviewPanel | undefined;
    private analyticsEngine: AnalyticsEngine;
    private renderer: DashboardRenderer;

    constructor(private context: vscode.ExtensionContext) {
        this.analyticsEngine = new AnalyticsEngine();
        this.renderer = new DashboardRenderer(context);
    }

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
                    vscode.Uri.file(path.join(this.context.extensionPath, 'out')),
                    vscode.Uri.file(path.join(this.context.extensionPath, 'images'))
                ]
            }
        );

        // Set HTML content using Shared Renderer
        try {
            await this.updateWebview();
        } catch (e) {
            this.panel.webview.html = `<h1>Error loading dashboard: ${e}</h1>`;
        }

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'requestData':
                    case 'refresh':
                        await this.updateWebview();
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
    }

    /**
     * Refresh data in the same view
     */
    private async updateWebview() {
        if (!this.panel) return;
        try {
            const data = await this.analyticsEngine.getAnalyticsData();
            // Reload HTML to fully re-render charts with new theme/data.
            this.panel.webview.html = this.renderer.getHtml(data);
        } catch (e) {
            console.error('Failed to update dashboard', e);
        }
    }
}

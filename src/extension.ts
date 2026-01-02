import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ConfigManager } from './config';
import { InterceptorManager } from './interceptor';
import { MemoryAPI } from './api';
import { SecurityManager } from './security';
import * as path from 'path';

let mcpServerProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel('agentMemory');
    context.subscriptions.push(outputChannel);

    outputChannel.appendLine('🧠 agentMemory extension is now active');
    outputChannel.appendLine(`Version: 0.1.0`);
    outputChannel.appendLine(`Activated at: ${new Date().toLocaleString()}`);
    outputChannel.appendLine('');


    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(database) Memory: Initializing...';
    statusBarItem.tooltip = 'agentMemory - Persistent Memory for AI Agents';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('agentMemory: No workspace folder found. Extension will not activate.');
        statusBarItem.text = '$(database) Memory: No Workspace';
        return;
    }

    // Initialize configuration manager
    const configManager = new ConfigManager(context, workspaceFolder, outputChannel);

    // Initialize interceptor manager
    const interceptorManager = new InterceptorManager(workspaceFolder, outputChannel);

    // Auto-configure all agents
    configManager.ensureSetup()
        .then(() => {
            outputChannel.appendLine('✅ Agent configuration complete');
            return interceptorManager.injectRules();
        })
        .then(() => {
            outputChannel.appendLine('✅ Behavior injection complete');
            outputChannel.appendLine('');
            statusBarItem.text = '$(database) Memory: Active';
            statusBarItem.tooltip = 'agentMemory - Memory bank active for this workspace';
        })
        .catch((error: any) => {
            outputChannel.appendLine('❌ Setup failed: ' + error.message);
            vscode.window.showErrorMessage(`agentMemory setup failed: ${error.message}`);
            statusBarItem.text = '$(database) Memory: Error';
        });

    // Start bundled MCP server
    startMCPServer(context, workspaceFolder.uri.fsPath);

    // Register commands
    const statsCommand = vscode.commands.registerCommand('agentMemory.showStats', () => {
        vscode.window.showInformationMessage('agentMemory Stats - Coming soon!');
    });
    context.subscriptions.push(statsCommand);

    // Register dashboard command
    const { DashboardManager } = require('./dashboard');
    const dashboardManager = new DashboardManager(context);
    const dashboardCommand = vscode.commands.registerCommand('agentMemory.openDashboard', () => {
        dashboardManager.openDashboard();
    });
    context.subscriptions.push(dashboardCommand);

    // Initialize dashboard HTTP server (for debugging)
    const { DashboardServer } = require('./dashboard-server');
    const dashboardServer = new DashboardServer(context, outputChannel);

    // Register command to start dashboard server
    const serverCommand = vscode.commands.registerCommand('agentMemory.startDashboardServer', () => {
        dashboardServer.start();
    });
    context.subscriptions.push(serverCommand);

    // Auto-start server in development mode (optional)
    // dashboardServer.start();

    // Initialize SecurityManager
    const securityManager = new SecurityManager(context);

    // Initialize and export the public API
    const projectId = path.basename(workspaceFolder.uri.fsPath);
    const api = new MemoryAPI('agentmemory', projectId, securityManager, null);

    // Return API for other extensions to use
    return api;
}

function startMCPServer(context: vscode.ExtensionContext, workspacePath: string) {
    // Get project ID from workspace path
    const projectId = path.basename(workspacePath);

    // Path to bundled MCP server
    const serverPath = path.join(context.extensionPath, 'out', 'mcp-server', 'server.js');

    outputChannel.appendLine(`\n🚀 Starting MCP server for project: ${projectId}`);
    outputChannel.appendLine(`   Server path: ${serverPath}`);

    mcpServerProcess = spawn('node', [serverPath, projectId, workspacePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PROJECT_ID: projectId, WORKSPACE_PATH: workspacePath }
    });

    mcpServerProcess.stdout?.on('data', (data) => {
        outputChannel.appendLine(`[MCP Server] ${data.toString().trim()}`);
    });

    mcpServerProcess.stderr?.on('data', (data) => {
        outputChannel.appendLine(`[MCP Server Error] ${data.toString().trim()}`);
    });

    mcpServerProcess.on('exit', (code) => {
        outputChannel.appendLine(`[MCP Server] Exited with code ${code}`);
        statusBarItem.text = '$(database) Memory: Offline';
    });
}

/**
 * Import existing memory bank files from all agents
 */
async function importExistingMemoryBanks(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const { MemoryBankSync } = await import('./mcp-server/memory-bank-sync');
    const syncEngine = new MemoryBankSync(workspaceFolder.uri.fsPath);

    outputChannel?.appendLine('[Import] Checking for existing memory bank files...');

    try {
        await syncEngine.importAll();
        outputChannel?.appendLine('[Import] ✅ Initial import complete');

        // Start file watching
        syncEngine.startWatching().catch(err => {
            outputChannel?.appendLine(`[Import] ⚠️  Watching: ${err.message}`);
        });
    } catch (error: any) {
        outputChannel?.appendLine(`[Import] ❌ Error: ${error.message}`);
        throw error;
    }
}

export function deactivate() {
    if (mcpServerProcess) {
        mcpServerProcess.kill();
        mcpServerProcess = null;
    }

    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ConfigManager } from './config';
import { InterceptorManager } from './interceptor';
import { MemoryAPI } from './api';
import { SecurityManager } from './security';
import { MCPClient } from './mcp-client';
import { MemoryCommands } from './commands';
import { MemoryStore } from './mcp-server/memory-store';
import { unregisterHost } from './mcp-server/workspace';
import * as path from 'path';

let mcpServerProcess: ChildProcess | null = null;
let hostsDir: string | null = null; // Where this window registered its workspace for MCP servers
let mcpClient: MCPClient | null = null;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let dashboardServer: any | null = null; // Module-level variable for cleanup

export function activate(context: vscode.ExtensionContext) {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel('agentMemory');
    context.subscriptions.push(outputChannel);

    outputChannel.appendLine('🧠 agentMemory extension is now active');
    outputChannel.appendLine(`Version: ${context.extension.packageJSON.version}`);
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
    hostsDir = configManager.hostsDir;

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

    // Start bundled MCP server and get client
    mcpClient = startMCPServer(context, workspaceFolder.uri.fsPath);

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
    dashboardServer = new DashboardServer(context, outputChannel); // Assign to module variable

    // Memory store for commands: the same .agentMemory/memories/ the MCP server uses
    const store = new MemoryStore(workspaceFolder.uri.fsPath, {
        log: message => outputChannel.appendLine(`[MemoryStore] ${message}`)
    });

    // Create .agentMemory/memories/ and import a legacy data.json right away
    store.init().catch((error: any) => {
        outputChannel.appendLine(`❌ Memory storage initialization failed: ${error.message}`);
    });

    // Register memory commands
    const commands = new MemoryCommands(store, dashboardServer, context);
    context.subscriptions.push(
        vscode.commands.registerCommand('agentMemory.searchMemories',
            () => commands.searchMemories()),
        vscode.commands.registerCommand('agentMemory.viewAllMemories',
            () => commands.viewAllMemories()),
        vscode.commands.registerCommand('agentMemory.viewByType',
            () => commands.viewByType()),
        vscode.commands.registerCommand('agentMemory.clearCache',
            () => commands.clearCache()),
        vscode.commands.registerCommand('agentMemory.openDashboardBrowser',
            () => commands.openDashboard())
    );

    // Register command to start dashboard server
    const serverCommand = vscode.commands.registerCommand('agentMemory.startDashboardServer', () => {
        dashboardServer?.start();
    });
    context.subscriptions.push(serverCommand);

    // Auto-start dashboard server
    dashboardServer?.start();

    // Initialize SecurityManager
    const securityManager = new SecurityManager(context);

    // Initialize and export the public API
    const api = new MemoryAPI('agentmemory', securityManager, mcpClient);

    // Return API for other extensions to use
    return api;
}

function startMCPServer(context: vscode.ExtensionContext, workspacePath: string): MCPClient {
    // Get project ID from workspace path
    const projectId = path.basename(workspacePath);

    // Path to bundled MCP server
    const serverPath = path.join(context.extensionPath, 'out', 'mcp-server', 'server.js');

    outputChannel.appendLine(`\n🚀 Starting MCP server for project: ${projectId}`);
    outputChannel.appendLine(`   Server path: ${serverPath}`);

    // Run the server on VS Code's own Node runtime; `node` may not be on PATH.
    mcpServerProcess = spawn(process.execPath, [serverPath, '--workspace', workspacePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', AGENTMEMORY_AGENT: 'agentmemory-extension' }
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

    // Create and return MCP client
    const client = new MCPClient(mcpServerProcess);
    outputChannel.appendLine(`✅ MCP Client initialized`);

    return client;
}

export function deactivate() {
    if (mcpServerProcess) {
        mcpServerProcess.kill();
        mcpServerProcess = null;
    }

    if (dashboardServer) {
        dashboardServer.stop();
        dashboardServer = null;
    }

    if (hostsDir) {
        unregisterHost(hostsDir);
        hostsDir = null;
    }

    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

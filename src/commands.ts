import * as vscode from 'vscode';
import { StorageManager } from './mcp-server/storage';
import { CacheManager } from './mcp-server/cache';
import { DashboardServer } from './dashboard-server';
import { Memory } from './api';

export class MemoryCommands {
    constructor(
        private storage: StorageManager,
        private cache: CacheManager,
        private dashboard: DashboardServer,
        private context: vscode.ExtensionContext
    ) { }

    /**
     * Search memories by keyword
     */
    async searchMemories(): Promise<void> {
        const projectId = this.getProjectId();

        const query = await vscode.window.showInputBox({
            prompt: 'Search memories by keyword',
            placeHolder: 'Enter search term (e.g., "authentication", "API", etc.)',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Search term cannot be empty';
                }
                return null;
            }
        });

        if (!query) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Searching memories for "${query}"...`,
            cancellable: false
        }, async () => {
            try {
                const results = await this.storage.search(projectId, query);

                if (results.length === 0) {
                    vscode.window.showInformationMessage(`No memories found for "${query}"`);
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    results.map(m => ({
                        label: `$(file) ${m.key}`,
                        description: m.type,
                        detail: this.truncate(m.content, 100),
                        memory: m
                    })),
                    {
                        placeHolder: `Found ${results.length} result(s) - Select to view details`,
                        matchOnDescription: true,
                        matchOnDetail: true
                    }
                );

                if (selected) {
                    await this.showMemoryDetails(selected.memory);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Search failed: ${error.message}`);
            }
        });
    }

    /**
     * View all memories in the project
     */
    async viewAllMemories(): Promise<void> {
        const projectId = this.getProjectId();

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Loading memories...',
            cancellable: false
        }, async () => {
            try {
                const memories = await this.storage.list(projectId);

                if (memories.length === 0) {
                    vscode.window.showInformationMessage('No memories found in this project');
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    memories.map(m => ({
                        label: `$(file) ${m.key}`,
                        description: `${m.type} • ${m.tags.join(', ')}`,
                        detail: this.truncate(m.content, 80),
                        memory: m
                    })),
                    {
                        placeHolder: `${memories.length} memories - Select to view details`,
                        matchOnDescription: true,
                        matchOnDetail: true
                    }
                );

                if (selected) {
                    await this.showMemoryDetails(selected.memory);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to load memories: ${error.message}`);
            }
        });
    }

    /**
     * View memories filtered by type
     */
    async viewByType(): Promise<void> {
        const projectId = this.getProjectId();

        // First, select the type
        const typeSelected = await vscode.window.showQuickPick([
            { label: '$(symbol-class) Architecture', type: 'architecture' },
            { label: '$(symbol-method) Pattern', type: 'pattern' },
            { label: '$(symbol-property) Feature', type: 'feature' },
            { label: '$(symbol-interface) API', type: 'api' },
            { label: '$(bug) Bug', type: 'bug' },
            { label: '$(milestone) Decision', type: 'decision' }
        ], {
            placeHolder: 'Select memory type to filter'
        });

        if (!typeSelected) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Loading ${typeSelected.type} memories...`,
            cancellable: false
        }, async () => {
            try {
                const memories = await this.storage.list(projectId, typeSelected.type as any);

                if (memories.length === 0) {
                    vscode.window.showInformationMessage(
                        `No ${typeSelected.type} memories found`
                    );
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    memories.map(m => ({
                        label: `$(file) ${m.key}`,
                        description: m.tags.join(', '),
                        detail: this.truncate(m.content, 80),
                        memory: m
                    })),
                    {
                        placeHolder: `${memories.length} ${typeSelected.type} memories - Select to view`,
                        matchOnDescription: true
                    }
                );

                if (selected) {
                    await this.showMemoryDetails(selected.memory);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to load memories: ${error.message}`);
            }
        });
    }

    /**
     * Clear the memory cache
     */
    async clearCache(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Clear all cached memories? This will not delete stored memories.',
            { modal: true },
            'Clear Cache'
        );

        if (confirm === 'Clear Cache') {
            this.cache.clear();
            const stats = this.cache.getStats();
            vscode.window.showInformationMessage(
                `✓ Memory cache cleared (was ${stats.size} entries)`
            );
        }
    }

    /**
     * Open the dashboard in browser
     */
    async openDashboard(): Promise<void> {
        const port = this.dashboard.getPort();
        const url = `http://localhost:${port}`;

        await vscode.env.openExternal(vscode.Uri.parse(url));
        vscode.window.showInformationMessage(`Dashboard opened at ${url}`);
    }

    /**
     * Show memory details in a new document
     */
    private async showMemoryDetails(memory: Memory): Promise<void> {
        const content = this.formatMemoryForDisplay(memory);

        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
            preview: true,
            preserveFocus: false
        });
    }

    /**
     * Format memory for display
     */
    private formatMemoryForDisplay(memory: Memory): string {
        const lines = [
            `# ${memory.key}`,
            '',
            `**Type**: ${memory.type}`,
            `**Tags**: ${memory.tags.join(', ') || 'none'}`,
            `**Created By**: ${memory.metadata.createdBy}`,
            `**Created**: ${new Date(memory.metadata.createdAt).toLocaleString()}`,
            `**Updated**: ${new Date(memory.metadata.updatedAt).toLocaleString()}`,
            `**Version**: ${memory.metadata.version}`,
            '',
            '---',
            '',
            memory.content
        ];

        if (memory.relationships) {
            const { dependsOn, implements: implementsList } = memory.relationships;
            if (dependsOn && dependsOn.length > 0 || implementsList && implementsList.length > 0) {
                lines.push('', '## Related Memories', '');
                if (dependsOn && dependsOn.length > 0) {
                    lines.push('**Depends On**:');
                    dependsOn.forEach(id => lines.push(`- ${id}`));
                }
                if (implementsList && implementsList.length > 0) {
                    lines.push('**Implements**:');
                    implementsList.forEach(id => lines.push(`- ${id}`));
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Get current project ID
     */
    private getProjectId(): string {
        return vscode.workspace.name || 'default';
    }

    /**
     * Truncate text with ellipsis
     */
    private truncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    }
}

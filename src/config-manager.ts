import * as vscode from 'vscode';

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

export interface CacheConfig {
    ttl: number;
    maxSize: number;
}

export type ConflictStrategy = 'newest-wins' | 'mcp-wins' | 'markdown-wins';

export class ConfigManager {
    private config: vscode.WorkspaceConfiguration;
    private changeEmitter = new vscode.EventEmitter<void>();

    public readonly onConfigChanged = this.changeEmitter.event;

    constructor() {
        this.config = vscode.workspace.getConfiguration('agentMemory');

        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agentMemory')) {
                this.config = vscode.workspace.getConfiguration('agentMemory');
                this.changeEmitter.fire();
            }
        });
    }

    /**
     * Get rate limiting configuration
     */
    getRateLimitConfig(): RateLimitConfig {
        return {
            maxRequests: this.config.get<number>('rateLimit.maxRequests', 100),
            windowMs: this.config.get<number>('rateLimit.windowMs', 60000)
        };
    }

    /**
     * Get conflict resolution strategy
     */
    getConflictStrategy(): ConflictStrategy {
        const strategy = this.config.get<string>('conflictResolution.strategy', 'newest-wins');

        // Validate strategy
        if (!['newest-wins', 'mcp-wins', 'markdown-wins'].includes(strategy)) {
            vscode.window.showWarningMessage(
                `Invalid conflict strategy "${strategy}". Using default: newest-wins`
            );
            return 'newest-wins';
        }

        return strategy as ConflictStrategy;
    }

    /**
     * Get cache configuration
     */
    getCacheConfig(): CacheConfig {
        const ttl = this.config.get<number>('cache.ttl', 3600000);
        const maxSize = this.config.get<number>('cache.maxSize', 10000);

        // Validate values
        if (ttl < 1000 || ttl > 86400000) { // 1 second to 24 hours
            vscode.window.showWarningMessage(
                `Invalid cache TTL ${ttl}ms. Using default: 3600000ms (1 hour)`
            );
            return { ttl: 3600000, maxSize };
        }

        if (maxSize < 100 || maxSize > 100000) {
            vscode.window.showWarningMessage(
                `Invalid cache maxSize ${maxSize}. Using default: 10000`
            );
            return { ttl, maxSize: 10000 };
        }

        return { ttl, maxSize };
    }

    /**
     * Get auto-sync setting
     */
    getAutoSync(): boolean {
        return this.config.get<boolean>('sync.autoSync', true);
    }

    /**
     * Get dashboard port
     */
    getDashboardPort(): number {
        const port = this.config.get<number>('dashboard.port', 3333);

        if (port < 1024 || port > 65535) {
            vscode.window.showWarningMessage(
                `Invalid dashboard port ${port}. Using default: 3333`
            );
            return 3333;
        }

        return port;
    }

    /**
     * Update a configuration value
     */
    async updateConfig(section: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Promise<void> {
        await this.config.update(`agentMemory.${section}`, value, target);
    }

    /**
     * Get all configuration as object
     */
    getAllConfig() {
        return {
            rateLimit: this.getRateLimitConfig(),
            conflictStrategy: this.getConflictStrategy(),
            cache: this.getCacheConfig(),
            autoSync: this.getAutoSync(),
            dashboardPort: this.getDashboardPort()
        };
    }
}

interface ConflictResolution {
    strategy: 'mcp-wins' | 'markdown-wins' | 'newest-wins';
    winner: 'mcp' | 'markdown';
    reason: string;
}

interface Memory {
    id: string;
    projectId: string;
    key: string;
    type: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision';
    content: string;
    tags: string[];
    relationships: {
        dependsOn: string[];
        implements: string[];
    };
    metadata: {
        accessCount: number;
        createdBy: string;
        sourceFile?: string;
    };
    createdAt: number;
    updatedAt: number;
}

/**
 * Conflict resolver for handling concurrent edits to memories
 */
export class ConflictResolver {
    private conflictLog: Array<{ key: string; resolution: ConflictResolution; timestamp: number }> = [];

    /**
     * Resolve conflict between MCP memory and markdown memory
     * @param mcpMemory - Existing memory in MCP storage
     * @param markdownMemory - Memory parsed from markdown file
     * @param strategy - Resolution strategy to use
     * @returns Resolution decision
     */
    resolve(
        mcpMemory: Memory,
        markdownMemory: Memory,
        strategy: 'newest-wins' | 'mcp-wins' | 'markdown-wins' = 'newest-wins'
    ): ConflictResolution {

        if (strategy === 'mcp-wins') {
            return {
                strategy,
                winner: 'mcp',
                reason: 'MCP-wins strategy configured'
            };
        }

        if (strategy === 'markdown-wins') {
            return {
                strategy,
                winner: 'markdown',
                reason: 'Markdown-wins strategy configured'
            };
        }

        // Newest-wins (default)
        const mcpNewer = mcpMemory.updatedAt > markdownMemory.updatedAt;

        return {
            strategy: 'newest-wins',
            winner: mcpNewer ? 'mcp' : 'markdown',
            reason: `${mcpNewer ? 'MCP' : 'Markdown'} version is newer (updated at ${new Date(Math.max(mcpMemory.updatedAt, markdownMemory.updatedAt)).toISOString()
                })`
        };
    }

    /**
     * Log conflict for audit trail
     */
    logConflict(key: string, resolution: ConflictResolution, mcpMemory: Memory, markdownMemory: Memory): void {
        const logEntry = {
            key,
            resolution,
            timestamp: Date.now()
        };

        this.conflictLog.push(logEntry);

        // Log to console for visibility
        console.warn(`╔═══════════════════════════════════════════════════════════╗`);
        console.warn(`║ CONFLICT DETECTED                                         ║`);
        console.warn(`╠═══════════════════════════════════════════════════════════╣`);
        console.warn(`║ Key: ${key.padEnd(52)} ║`);
        console.warn(`║ Strategy: ${resolution.strategy.padEnd(48)} ║`);
        console.warn(`║ Winner: ${resolution.winner.padEnd(50)} ║`);
        console.warn(`║ Reason: ${resolution.reason.substring(0, 50).padEnd(50)} ║`);
        console.warn(`║                                                           ║`);
        console.warn(`║ MCP Version:                                              ║`);
        console.warn(`║   Updated: ${new Date(mcpMemory.updatedAt).toISOString().padEnd(46)} ║`);
        console.warn(`║   Content: ${mcpMemory.content.substring(0, 40).padEnd(46)} ║`);
        console.warn(`║                                                           ║`);
        console.warn(`║ Markdown Version:                                         ║`);
        console.warn(`║   Updated: ${new Date(markdownMemory.updatedAt).toISOString().padEnd(46)} ║`);
        console.warn(`║   Content: ${markdownMemory.content.substring(0, 40).padEnd(46)} ║`);
        console.warn(`╚═══════════════════════════════════════════════════════════╝`);
    }

    /**
     * Get conflict history
     */
    getConflictLog(): Array<{ key: string; resolution: ConflictResolution; timestamp: number }> {
        return [...this.conflictLog];
    }

    /**
     * Clear conflict log (useful for testing)
     */
    clearLog(): void {
        this.conflictLog = [];
    }
}

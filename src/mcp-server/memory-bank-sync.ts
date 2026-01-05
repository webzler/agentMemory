import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as chokidar from 'chokidar';

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
        sourceFile?: string; // Track which markdown file this came from
    };
    createdAt: number;
    updatedAt: number;
}

interface AgentConfig {
    name: string;
    memoryBankPath: string;
    fileMapping: Record<string, { type: Memory['type']; tags: string[] }>;
}

/**
 * Bi-directional sync between agent memory bank files and MCP storage
 */
export class MemoryBankSync {
    private workspacePath: string;
    private mcpDataPath: string;
    private watcher?: chokidar.FSWatcher;
    private debounceTimers = new Map<string, NodeJS.Timeout>();

    // Multi-agent configuration
    private agents: AgentConfig[] = [
        {
            name: 'kilocode',
            memoryBankPath: '.kilocode/rules/memory-bank',
            fileMapping: {
                'brief.md': { type: 'architecture', tags: ['overview', 'project'] },
                'product.md': { type: 'feature', tags: ['product', 'features'] },
                'context.md': { type: 'bug', tags: ['context', 'issues'] },
                'architecture.md': { type: 'architecture', tags: ['design', 'system'] },
                'tech.md': { type: 'decision', tags: ['technology', 'stack'] }
            }
        },
        {
            name: 'cline',
            memoryBankPath: '.clinerules/memory-bank',
            fileMapping: {
                'projectBrief.md': { type: 'architecture', tags: ['overview', 'project'] },
                'productContext.md': { type: 'feature', tags: ['product', 'goals'] },
                'activeContext.md': { type: 'pattern', tags: ['current', 'focus'] },
                'systemPatterns.md': { type: 'pattern', tags: ['patterns', 'design'] },
                'techContext.md': { type: 'decision', tags: ['technology', 'decisions'] },
                'progress.md': { type: 'feature', tags: ['progress', 'status'] }
            }
        },
        {
            name: 'roocode',
            memoryBankPath: '.roo/memory-bank',
            fileMapping: {
                'projectBrief.md': { type: 'architecture', tags: ['overview', 'project'] },
                'productContext.md': { type: 'feature', tags: ['product', 'vision'] },
                'activeContext.md': { type: 'pattern', tags: ['current', 'work'] },
                'systemPatterns.md': { type: 'pattern', tags: ['patterns', 'architecture'] },
                'techContext.md': { type: 'decision', tags: ['technology', 'stack'] },
                'progress.md': { type: 'feature', tags: ['progress', 'tracking'] },
                'decisionLog.md': { type: 'decision', tags: ['decisions', 'log'] }
            }
        }
    ];

    constructor(workspacePath: string, mcpDataPath: string = '.agentMemory') {
        this.workspacePath = workspacePath;
        this.mcpDataPath = path.join(workspacePath, mcpDataPath);
    }

    /**
     * Import all memory bank files from all agents into MCP storage
     */
    async importAll(): Promise<void> {
        console.error('[MemoryBankSync] Starting import from all agents...');

        let totalImported = 0;
        for (const agent of this.agents) {
            totalImported += await this.importFromAgent(agent);
        }

        // If no memories were imported, create a default project memory
        if (totalImported === 0) {
            await this.initializeProject();
        }

        console.error('[MemoryBankSync] Import complete');
    }

    /**
     * Import memory bank files from a specific agent
     * Returns the number of memories imported
     */
    private async importFromAgent(agent: AgentConfig): Promise<number> {
        const memoryBankDir = path.join(this.workspacePath, agent.memoryBankPath);

        try {
            await fs.access(memoryBankDir);
        } catch {
            console.error(`[MemoryBankSync] No memory bank found for ${agent.name}`);
            return 0;
        }

        console.error(`[MemoryBankSync] Importing from ${agent.name}...`);

        let totalImported = 0;
        for (const [filename, config] of Object.entries(agent.fileMapping)) {
            const filePath = path.join(memoryBankDir, filename);

            try {
                const content = await fs.readFile(filePath, 'utf-8');

                if (!content.trim()) continue;

                // Parse markdown into sections
                const memories = this.parseMarkdown(content, filename, config, agent.name);

                // Save to MCP storage
                for (const memory of memories) {
                    await this.saveMCPMemory(memory);
                }

                totalImported += memories.length;
                console.error(`[MemoryBankSync] Imported ${memories.length} memories from ${filename}`);
            } catch (error) {
                // File doesn't exist or can't be read - that's okay
                continue;
            }
        }

        return totalImported;
    }

    /**
     * Initialize project with a default memory (called when no memories exist)
     */
    private async initializeProject(): Promise<void> {
        console.error('[MemoryBankSync] Creating default project memory...');

        const projectName = path.basename(this.workspacePath);
        const defaultMemory: Memory = {
            id: uuidv4(),
            projectId: projectName,
            key: 'project-initialized',
            type: 'architecture',
            content: `# ${projectName} - Project Overview

This project uses **agentMemory** for persistent knowledge management.

## How It Works

- **Memory Bank Files**: Human-readable markdown in memory bank folders
- **Structured Storage**: Machine-queryable JSON in \`.agentMemory/\`
- **Bi-Directional Sync**: Changes sync automatically between both locations

## Getting Started

As you work on this project, document:
- Architecture decisions
- Code patterns
- API contracts
- Bug fixes and solutions
- Technical choices

### MCP Tools Available

- \`memory_write()\` - Save knowledge to persistent storage
- \`memory_search()\` - Find information by query, tags, or type
- \`memory_read()\` - Retrieve specific memories by key

**Note:** This memory was auto-created to demonstrate the system.`,
            tags: ['project', 'overview', 'agentmemory', 'getting-started'],
            relationships: {
                dependsOn: [],
                implements: []
            },
            metadata: {
                accessCount: 0,
                createdBy: 'agentmemory-extension',
                sourceFile: 'auto-generated'
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // Save to MCP storage
        await this.saveMCPMemory(defaultMemory);

        // Export to all agent markdown files
        await this.exportToAgents(defaultMemory);

        console.error('[MemoryBankSync] ✅ Default project memory created and synced');
    }

    /**
     * Parse markdown file into individual memories
     */
    private parseMarkdown(
        content: string,
        filename: string,
        config: { type: Memory['type']; tags: string[] },
        agentName: string
    ): Memory[] {
        const memories: Memory[] = [];

        // Remove frontmatter if present (YAML between ---)
        const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');

        // Split by H1 (#) or H2 (##) headers
        const headerRegex = /^(#{1,2})\s+(.+)$/gm;
        const matches = [...contentWithoutFrontmatter.matchAll(headerRegex)];

        if (matches.length === 0) {
            // No headers found, treat entire file as one memory
            if (contentWithoutFrontmatter.trim()) {
                memories.push(this.createMemory(
                    filename.replace('.md', ''),
                    contentWithoutFrontmatter.trim(),
                    config,
                    agentName,
                    filename
                ));
            }
            return memories;
        }

        // Process each section
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const title = match[2].trim();
            const startIndex = match.index! + match[0].length;
            const endIndex = i < matches.length - 1 ? matches[i + 1].index! : contentWithoutFrontmatter.length;

            let body = contentWithoutFrontmatter.substring(startIndex, endIndex).trim();

            // Skip empty sections
            if (!body) continue;

            // Extract additional tags from content
            const contentTags = this.extractTagsFromContent(body);

            memories.push(this.createMemory(
                title,
                body,
                config,
                agentName,
                filename,
                contentTags
            ));
        }

        return memories;
    }

    /**
     * Create a Memory object from parsed data
     */
    private createMemory(
        title: string,
        content: string,
        config: { type: Memory['type']; tags: string[] },
        agentName: string,
        sourceFile: string,
        additionalTags: string[] = []
    ): Memory {
        return {
            id: uuidv4(),
            projectId: path.basename(this.workspacePath),
            key: this.generateKey(title, sourceFile),
            type: config.type,
            content: `# ${title}\n\n${content}`,
            tags: [...new Set([...config.tags, ...additionalTags, agentName])], // Deduplicate
            relationships: {
                dependsOn: [],
                implements: []
            },
            metadata: {
                accessCount: 0,
                createdBy: agentName,
                sourceFile
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    /**
     * Extract potential tags from markdown content
     */
    private extractTagsFromContent(content: string): string[] {
        const tags: string[] = [];

        // Look for **Tags:** or **Keywords:** sections
        const tagMatch = content.match(/\*\*(?:Tags|Keywords):\*\*\s*([^\n]+)/i);
        if (tagMatch) {
            const extractedTags = tagMatch[1].split(/[,;]/).map(t => t.trim().toLowerCase());
            tags.push(...extractedTags);
        }

        // Look for common technical keywords
        const keywords = ['api', 'auth', 'oauth', 'database', 'security', 'performance', 'bug', 'feature'];
        const lowerContent = content.toLowerCase();
        keywords.forEach(keyword => {
            if (lowerContent.includes(keyword) && !tags.includes(keyword)) {
                tags.push(keyword);
            }
        });

        return tags;
    }

    /**
     * Export MCP memory to appropriate agent markdown files
     */
    async exportToAgents(memory: Memory): Promise<void> {
        for (const agent of this.agents) {
            // Find which file this memory type maps to
            const targetFile = this.getTargetFile(memory.type, agent);

            if (!targetFile) continue;

            await this.appendToMarkdown(memory, agent, targetFile);
        }
    }

    /**
     * Get target markdown file for a memory type
     */
    private getTargetFile(type: Memory['type'], agent: AgentConfig): string | null {
        for (const [filename, config] of Object.entries(agent.fileMapping)) {
            if (config.type === type) {
                return filename;
            }
        }
        return null;
    }

    /**
     * Append memory to markdown file
     */
    private async appendToMarkdown(
        memory: Memory,
        agent: AgentConfig,
        filename: string
    ): Promise<void> {
        const memoryBankDir = path.join(this.workspacePath, agent.memoryBankPath);
        const filePath = path.join(memoryBankDir, filename);

        // Ensure directory exists
        await fs.mkdir(memoryBankDir, { recursive: true });

        // Format memory as markdown section
        const markdownSection = this.formatAsMarkdown(memory);

        // Check if this memory already exists in the file
        try {
            const existing = await fs.readFile(filePath, 'utf-8');

            // Safety check 1: Key already exists
            if (existing.includes(memory.key)) {
                console.error(`[MemoryBankSync] Memory ${memory.key} already exists in ${agent.name}/${filename}, skipping`);
                return;
            }

            // Safety check 2: Similar content exists (prevents near-duplicates)
            const contentPreview = memory.content.substring(0, 100).toLowerCase();
            if (existing.toLowerCase().includes(contentPreview)) {
                console.error(`[MemoryBankSync] Similar content detected in ${agent.name}/${filename}, skipping`);
                return;
            }

            // Safe to append (preserves all existing content)
            await fs.appendFile(filePath, '\n\n' + markdownSection);
            console.error(`[MemoryBankSync] ✓ Synced ${memory.key} to ${agent.name}/${filename}`);
        } catch {
            // File doesn't exist - create it safely
            await fs.writeFile(filePath, markdownSection);
            console.error(`[MemoryBankSync] ✓ Created ${agent.name}/${filename} with ${memory.key}`);
        }
    }

    /**
     * Format memory as markdown
     */
    private formatAsMarkdown(memory: Memory): string {
        return `## ${memory.key}

${memory.content}

**Type:** ${memory.type}  
**Tags:** ${memory.tags.join(', ')}  
**Updated:** ${new Date(memory.updatedAt).toLocaleDateString()}
`;
    }

    /**
     * Save memory to MCP storage
     */
    private async saveMCPMemory(memory: Memory): Promise<void> {
        await fs.mkdir(this.mcpDataPath, { recursive: true });

        const filename = `${memory.id}.json`;
        const filePath = path.join(this.mcpDataPath, filename);

        await fs.writeFile(filePath, JSON.stringify(memory, null, 2));
    }

    /**
     * Generate unique key from title and filename
     */
    private generateKey(title: string, context: string): string {
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        return `${context.replace('.md', '')}-${slug}`.substring(0, 50);
    }

    /**
     * Watch for changes in markdown files and sync to MCP
     */
    async startWatching(): Promise<void> {
        console.error('[MemoryBankSync] Starting file watching with chokidar...');

        // Build watch patterns for all agent directories
        const patterns: string[] = [];
        for (const agent of this.agents) {
            const memoryBankPath = path.join(this.workspacePath, agent.memoryBankPath);
            patterns.push(path.join(memoryBankPath, '**/*.md'));
        }

        // Initialize chokidar watcher
        this.watcher = chokidar.watch(patterns, {
            ignored: /(^|[\/\\])\../, // Ignore dotfiles
            persistent: true,
            ignoreInitial: true, // Don't trigger on startup
            awaitWriteFinish: {
                stabilityThreshold: 500,  // Wait 500ms for file to stabilize
                pollInterval: 100
            }
        });

        // Handle file changes
        this.watcher.on('change', (filePath) => {
            this.handleFileChange(filePath, 'change');
        });

        // Handle new files
        this.watcher.on('add', (filePath) => {
            this.handleFileChange(filePath, 'add');
        });

        // Handle deletions (optional)
        this.watcher.on('unlink', (filePath) => {
            console.error(`[FileWatcher] File deleted: ${path.basename(filePath)}`);
            // Could implement deletion sync here in future
        });

        // Handle errors
        this.watcher.on('error', (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[FileWatcher] Error:', message);
        });

        // Ready event
        this.watcher.on('ready', () => {
            console.error('[FileWatcher] ✅ Watching memory bank files');
        });
    }

    /**
     * Handle file change with debouncing
     */
    private handleFileChange(filePath: string, eventType: 'change' | 'add'): void {
        // Clear existing timeout for this file
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timeout (debounce for 1 second)
        const timer = setTimeout(async () => {
            const basename = path.basename(filePath);
            console.error(`[FileWatcher] ${eventType === 'add' ? 'New file' : 'Change'} detected: ${basename}`);

            try {
                await this.importFromFile(filePath);
                console.error(`[FileWatcher] ✅ Synced: ${basename}`);
            } catch (error: any) {
                console.error(`[FileWatcher] ❌ Sync failed for ${basename}:`, error.message);
            }

            this.debounceTimers.delete(filePath);
        }, 1000);

        this.debounceTimers.set(filePath, timer);
    }

    /**
     * Import from a specific file
     */
    private async importFromFile(filePath: string): Promise<void> {
        const relativePath = path.relative(this.workspacePath, filePath);
        const filename = path.basename(filePath);

        // Determine which agent this file belongs to
        let targetAgent: typeof this.agents[0] | undefined;

        for (const agent of this.agents) {
            if (relativePath.startsWith(agent.memoryBankPath)) {
                targetAgent = agent;
                break;
            }
        }

        if (!targetAgent) {
            console.warn(`[FileWatcher] Unknown agent for file: ${relativePath}`);
            return;
        }

        // Check if this file is in the agent's mapping
        const fileConfig = targetAgent.fileMapping[filename];
        if (!fileConfig) {
            console.warn(`[FileWatcher] File ${filename} not in ${targetAgent.name} mapping, skipping`);
            return;
        }

        // Read and parse the file
        const content = await fs.readFile(filePath, 'utf-8');
        if (!content.trim()) {
            console.error(`[FileWatcher] File ${filename} is empty, skipping`);
            return;
        }

        // Parse markdown into memories
        const memories = this.parseMarkdown(
            content,
            filename,
            fileConfig,
            targetAgent.name
        );

        // Save each memory to MCP storage
        for (const memory of memories) {
            await this.saveMCPMemory(memory);
        }

        console.error(`[FileWatcher] Imported ${memories.length} memories from ${filename}`);
    }

    /**
     * Stop watching
     */
    async stopWatching(): Promise<void> {
        if (this.watcher) {
            // Clear all pending debounce timers
            for (const timer of this.debounceTimers.values()) {
                clearTimeout(timer);
            }
            this.debounceTimers.clear();

            // Close watcher
            await this.watcher.close();
            this.watcher = undefined;
            console.error('[FileWatcher] Stopped watching');
        }
    }
}

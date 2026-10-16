import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryInput, MemoryStore } from './memory-store';
import { MemoryType } from './schemas';

interface AgentConfig {
    name: string;
    memoryBankPath: string;
    fileMapping: Record<string, { type: MemoryType; tags: string[] }>;
}

/**
 * One-way import of agent memory bank files (Cline, Roo Code, Kilo Code) into
 * the agentMemory store. `.agentMemory/memories/` is the only source of truth:
 * nothing is written back to the agents' memory bank folders, and memories
 * that already exist are never overwritten.
 */
export class MemoryBankSync {
    private workspacePath: string;
    private store: MemoryStore;

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

    constructor(workspacePath: string, store: MemoryStore) {
        this.workspacePath = workspacePath;
        this.store = store;
    }

    /**
     * Import all memory bank files from all agents into the store
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

            let content: string;
            try {
                content = await fs.readFile(filePath, 'utf-8');
            } catch {
                // File doesn't exist or can't be read - that's okay
                continue;
            }
            if (!content.trim()) continue;

            // Parse markdown into sections
            const memories = this.parseMarkdown(content, filename, config, agent.name);

            let imported = 0;
            for (const memory of memories) {
                if (await this.store.create(memory)) imported++;
            }

            totalImported += imported;
            console.error(`[MemoryBankSync] Imported ${imported} memories from ${filename}`);
        }

        return totalImported;
    }

    /**
     * Initialize project with a default memory (called when no memories exist)
     */
    private async initializeProject(): Promise<void> {
        const projectName = path.basename(this.workspacePath);
        const created = await this.store.create({
            key: 'project-initialized',
            type: 'architecture',
            content: `# ${projectName} - Project Overview

This project uses **agentMemory** for persistent knowledge management.

## How It Works

- **One file per memory**: Markdown with YAML frontmatter in \`.agentMemory/memories/\`
- **Readable and reviewable**: Edit memories by hand and commit them with the code
- **Shared by all agents**: Every agent reads and writes the same memories

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
            createdBy: 'agentmemory-extension',
            sourceFile: 'auto-generated'
        });

        if (created) {
            console.error('[MemoryBankSync] ✅ Default project memory created');
        }
    }

    /**
     * Parse markdown file into individual memories
     */
    private parseMarkdown(
        content: string,
        filename: string,
        config: { type: MemoryType; tags: string[] },
        agentName: string
    ): MemoryInput[] {
        const memories: MemoryInput[] = [];

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

            const body = contentWithoutFrontmatter.substring(startIndex, endIndex).trim();

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
     * Create a memory from parsed data
     */
    private createMemory(
        title: string,
        content: string,
        config: { type: MemoryType; tags: string[] },
        agentName: string,
        sourceFile: string,
        additionalTags: string[] = []
    ): MemoryInput {
        return {
            key: this.generateKey(title, sourceFile),
            type: config.type,
            content: `# ${title}\n\n${content}`,
            tags: [...new Set([...config.tags, ...additionalTags, agentName])], // Deduplicate
            createdBy: agentName,
            sourceFile
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
     * Generate unique key from title and filename
     */
    private generateKey(title: string, context: string): string {
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        return `${context.replace('.md', '')}-${slug}`.substring(0, 50);
    }
}

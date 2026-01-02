// Add this to memory-bank-sync.ts

/**
 * Initialize project with a default memory (called if no memories exist)
 */
private async initializeProject(): Promise<void> {
    console.log('[MemoryBankSync] Creating default project memory...');

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
- **Bi-Directional Sync**: Changes in either location sync automatically

## Getting Started

As you work, document:
- Architecture decisions
- Code patterns  
- API contracts
- Bug fixes

Use MCP tools:
- \`memory_write()\` to save knowledge
- \`memory_search()\` to find information

**Note: This memory was auto-created to demonstrate the system.**`,
        tags: ['project', 'overview', 'agentmemory'],
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

    console.log('[MemoryBankSync] ✅ Default project memory created');
}

// Update importAll() to:
async importAll(): Promise<void> {
    console.log('[MemoryBankSync] Starting import from all agents...');

    let totalImported = 0;
    for (const agent of this.agents) {
        const count = await this.importFromAgent(agent);
        totalImported += count;
    }

    // If no memories imported, create default
    if (totalImported === 0) {
        await this.initializeProject();
    }

    console.log('[MemoryBankSync] Import complete');
}

// Update importFromAgent() to return number:
private async importFromAgent(agent: AgentConfig): Promise<number> {
    // ... existing code ...
    let totalImported = 0;
    
    // Inside the loop, add:
    totalImported += memories.length;
    
    // At the end:
    return totalImported;
}

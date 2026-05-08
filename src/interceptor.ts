import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export class InterceptorManager {
    constructor(
        private workspaceFolder: vscode.WorkspaceFolder,
        private outputChannel: vscode.OutputChannel
    ) { }

    async injectRules(): Promise<void> {
        const workspacePath = this.workspaceFolder.uri.fsPath;

        // Detect which agents are actually installed
        const installedAgents = await this.detectInstalledAgents();

        if (installedAgents.length === 0) {
            this.outputChannel.appendLine('⚠️  No AI coding agents detected. Skipping rule injection.');
            return;
        }

        this.outputChannel.appendLine(`🔍 Detected agents: ${installedAgents.join(', ')}`);

        // Inject rules only for installed agents
        const promises: Promise<void>[] = [];

        if (installedAgents.includes('cline')) {
            promises.push(this.injectClineRules(workspacePath));
            promises.push(this.injectClineMemoryBank(workspacePath));
        }
        if (installedAgents.includes('roocode')) {
            promises.push(this.injectRooCodeRules(workspacePath));
        }
        if (installedAgents.includes('kilocode')) {
            promises.push(this.injectKiloCodeRules(workspacePath));
        }
        if (installedAgents.includes('continue')) {
            promises.push(this.injectContinueConfig(workspacePath));
        }
        if (installedAgents.includes('opencode')) {
            promises.push(this.injectOpenCodeRules(workspacePath));
            promises.push(this.injectOpenCodeCommands(workspacePath));
            promises.push(this.injectOpenCodeMCPConfig(workspacePath));
        }

        await Promise.all(promises);

        this.outputChannel.appendLine(`📝 Created behavior rules for ${installedAgents.length} agent(s)`);
    }

    /**
     * Detect which AI coding agents are installed
     */
    private async detectInstalledAgents(): Promise<string[]> {
        const installed: string[] = [];
        const agentExtensions = {
            'cline': 'saoudrizwan.claude-dev',
            'roocode': 'roo-cline.roo-cline',
            'kilocode': 'kilocode.kilo-code',
            'continue': 'Continue.continue'
        };

        for (const [agent, extensionId] of Object.entries(agentExtensions)) {
            const extension = vscode.extensions.getExtension(extensionId);
            if (extension) {
                installed.push(agent);
                this.outputChannel.appendLine(`  ✅ ${agent}: ${extensionId}`);
            }
        }

        // Detect OpenCode by checking for opencode.json or .opencode/ directory
        const workspacePath = this.workspaceFolder.uri.fsPath;
        const opencodeConfigPath = path.join(workspacePath, 'opencode.json');
        const opencodeDirPath = path.join(workspacePath, '.opencode');

        try {
            await fs.access(opencodeConfigPath);
            installed.push('opencode');
            this.outputChannel.appendLine(`  ✅ opencode: opencode.json found`);
        } catch {
            try {
                await fs.access(opencodeDirPath);
                installed.push('opencode');
                this.outputChannel.appendLine(`  ✅ opencode: .opencode/ directory found`);
            } catch {
                // OpenCode not detected
            }
        }

        return installed;
    }

    /**
     * Inject .clinerules for Cline
     * NOTE: Disabled - we now use .clinerules/memory-bank/ directory structure instead
     */
    private async injectClineRules(workspacePath: string): Promise<void> {
        // Skip - we use injectClineMemoryBank() instead which creates the directory structure
        this.outputChannel.appendLine(`  ℹ️  Using .clinerules/memory-bank/ instead of .clinerules file`);
    }

    /**
     * Inject .roomodes for RooCode
     */
    private async injectRooCodeRules(workspacePath: string): Promise<void> {
        const rulesPath = path.join(workspacePath, '.roomodes');

        const rules = `# agentMemory - Enforced Memory Usage for RooCode
always_use_memory: true
pre_action_hook: memory_search
enforce_memory_usage: true

# Instructions:
# - Query memory before all coding tasks
# - Document new patterns in memory
# - Maintain consistency with existing architecture
`;

        try {
            await fs.writeFile(rulesPath, rules, 'utf-8');
            this.outputChannel.appendLine(`  📄 Created: .roomodes`);
        } catch (error) {
            this.outputChannel.appendLine(`  ❌ Failed to create .roomodes`);
        }
    }

    /**
     * Inject memory bank files for KiloCode (ALWAYS READ by AI)
     */
    private async injectKiloCodeRules(workspacePath: string): Promise<void> {
        const memoryBankDir = path.join(workspacePath, '.kilocode', 'rules', 'memory-bank');

        // Create tech context file with MANDATORY MCP usage
        const techContextPath = path.join(memoryBankDir, 'techContext.md');
        const techContext = `# Technology Context

## Development Tools

### agentMemory System (REQUIRED)

**STATUS: MANDATORY - This is a core project dependency**

This project uses the agentMemory system for persistent knowledge management. This is **NOT optional** - it's a fundamental part of how this project operates.

#### MCP Server Configuration

The agentMemory MCP server provides tools for project memory:
- Server name: \`agentMemory\`
- Available via MCP tools interface
- MUST be used for all knowledge operations

#### Required Workflow

**EVERY task MUST follow this sequence:**

1. **Before ANY work:**
   \`\`\`
   Call memory_read() or memory_search() to check existing knowledge
   \`\`\`

2. **After ANY significant work:**
   \`\`\`
   Call memory_write() to document what was done
   \`\`\`

3. **Required memory_write parameters:**
   - \`key\`: Unique identifier (e.g., "auth-implementation")
   - \`type\`: One of: architecture, pattern, feature, api, bug, decision  
   - \`content\`: Detailed documentation (markdown format)
   - \`tags\`: Relevant keywords for searchability

#### Why This Matters

The agentMemory system ensures:
- Knowledge persists across sessions
- No repeated work or forgotten decisions
- Searchable project history
- Cross-session context continuity

#### Failure to Use = Incomplete Work

Any task completed without proper memory_read/memory_write calls is considered **incomplete**. The memory system is as essential as version control.

---

## Tech Stack

Document your actual tech stack here alongside the agentMemory requirement.
`;

        // Create system patterns file with MCP enforcement
        const systemPatternsPath = path.join(memoryBankDir, 'systemPatterns.md');
        const systemPatterns = `# System Patterns

## Core Architecture Principle: Memory-First Development

**This project follows a "Memory-First" development pattern.**

### Pattern: Query Before Code

**Rule:** NEVER implement a feature without first querying the memory system.

\`\`\`typescript
// WRONG - implementing without context
async function addFeature() {
  // Start coding immediately
}

// RIGHT - query memory first
async function addFeature() {
  // 1. Check existing patterns
  const patterns = await memory_search({ query: "similar feature" });
  
  // 2. Implement using established patterns
  // ...
  
  // 3. Document the new pattern
  await memory_write({
    key: "new-feature-pattern",
    type: "pattern",
    content: "..."
  });
}
\`\`\`

### Pattern: Document While Building

**Rule:** Documentation happens DURING development, not after.

Every significant piece of work gets documented immediately via \`memory_write()\`:
- Architecture decisions → type: "architecture"
- Reusable patterns → type: "pattern"  
- API designs → type: "api"
- Bug solutions → type: "bug"
- Tech choices → type: "decision"

### Pattern: Search First, Scan Second

**Rule:** Use \`memory_search()\` before scanning files.

The memory system is indexed and fast. Always check it first:

\`\`\`typescript
// Check memory for existing implementation
const existing = await memory_search({
  type: "feature",
  tags: ["authentication"]
});

// Only scan files if memory doesn't have the answer
\`\`\`

---

## Implementation Patterns

Document your actual implementation patterns here alongside the memory-first pattern.
`;

        try {
            await fs.mkdir(memoryBankDir, { recursive: true });
            await fs.writeFile(techContextPath, techContext, 'utf-8');
            await fs.writeFile(systemPatternsPath, systemPatterns, 'utf-8');

            // CRITICAL: Create mandatory workflow file at ROOT of rules directory
            // This ensures KiloCode ALWAYS reads it at session start
            const rulesDir = path.join(workspacePath, '.kilocode', 'rules');
            const mandatoryWorkflowPath = path.join(rulesDir, 'MANDATORY_WORKFLOW.md');
            const mandatoryWorkflow = `# ⚠️ MANDATORY WORKFLOW - READ FIRST

## CRITICAL: agentMemory MCP Integration

**STOP**: Before proceeding with ANY task, you MUST follow this workflow.

### Step 1: ALWAYS Search Memory First

Before writing ANY code or making ANY changes:

\`\`\`
REQUIRED: Call memory_search({ query: "<task description>" })
\`\`\`

**Examples:**
- Creating landing page? → \`memory_search({ query: "landing page design patterns" })\`
- Adding authentication? → \`memory_search({ query: "auth implementation" })\`
- Fixing bug? → \`memory_search({ query: "<bug description>" })\`

### Step 2: Do Your Work

Implement the requested feature/fix.

### Step 3: ALWAYS Document in Memory

After completing ANY significant work:

\`\`\`
REQUIRED: Call memory_write({
  key: "<unique-identifier>",
  type: "<architecture|pattern|feature|api|bug|decision>",
  content: "Detailed markdown documentation of what was done",
  tags: ["relevant", "keywords"]
})
\`\`\`

**Examples:**
- Created landing page? → \`memory_write({ key: "landing-page-v1", type: "feature", content: "...", tags: ["ui", "landing"] })\`
- Added auth? → \`memory_write({ key: "oauth-implementation", type: "architecture", content: "...", tags: ["auth", "security"] })\`

## Why This is NON-NEGOTIABLE

1. **Prevents duplicate work**: Check if someone already solved this
2. **Maintains consistency**: Reuse established patterns
3. **Enables continuity**: Next session picks up where you left off
4. **Creates searchable history**: Future you/others can find solutions

## Validation Checklist

Before marking a task as complete, verify:
- [ ] Called \`memory_search()\` before starting
- [ ] Called \`memory_write()\` after completing
- [ ] Memory includes all architectural decisions made
- [ ] Tags are relevant and searchable

**Tasks without memory operations are INCOMPLETE and will be rejected.**
`;

            await fs.writeFile(mandatoryWorkflowPath, mandatoryWorkflow, 'utf-8');

            this.outputChannel.appendLine(`  📄 Created: .kilocode/rules/MANDATORY_WORKFLOW.md`);
            this.outputChannel.appendLine(`  📄 Created: .kilocode/rules/memory-bank/techContext.md`);
            this.outputChannel.appendLine(`  📄 Created: .kilocode/rules/memory-bank/systemPatterns.md`);
        } catch (error) {
            this.outputChannel.appendLine(`  ❌ Failed to create KiloCode memory bank files`);
        }
    }

    /**
     * Inject memory bank files for Cline (ALWAYS READ by AI)
     */
    private async injectClineMemoryBank(workspacePath: string): Promise<void> {
        const memoryBankDir = path.join(workspacePath, '.clinerules', 'memory-bank');
        const activeContextPath = path.join(memoryBankDir, 'activeContext.md');
        const activeContext = `# Active Context

## Current Development Requirements

### agentMemory Integration (MANDATORY)

**This project requires agentMemory MCP tools for all development work.**

#### MCP Tools Available

- \`memory_search\` - Query existing knowledge
- \`memory_write\` - Document decisions and patterns  
- \`memory_read\` - Retrieve specific memories

#### Mandatory Workflow

1. **Before starting:** Call \`memory_search()\` to check existing knowledge
2. **During work:** Reference established patterns from memory
3. **After completion:** Call \`memory_write()\` to document your work

**Failure to use memory tools = Incomplete work**
`;

        try {
            await fs.mkdir(memoryBankDir, { recursive: true });
            await fs.writeFile(activeContextPath, activeContext, 'utf-8');
            this.outputChannel.appendLine(`  📄 Created: .clinerules/memory-bank/activeContext.md`);
        } catch (error) {
            this.outputChannel.appendLine(`  ❌ Failed to create Cline memory bank files`);
        }
    }

    /**
     * Inject memory bank files for RooCode (ALWAYS READ by AI)
     */
    private async injectRooCodeMemoryBank(workspacePath: string): Promise<void> {
        const memoryBankDir = path.join(workspacePath, '.roo', 'memory-bank');
        const activeContextPath = path.join(memoryBankDir, 'activeContext.md');
        const activeContext = `# Active Context

## Project Memory System

### agentMemory (REQUIRED SYSTEM)

This project uses agentMemory for persistent knowledge management.

**Status:** MANDATORY - Core project dependency.

#### Available MCP Tools

- \`memory_search({ query, tags, type })\` - Search memories  
- \`memory_write({ key, type, content, tags })\` - Save memory
- \`memory_read({ key })\` - Get specific memory

**Server name:** \`agentMemory\`

#### Required Development Pattern

**EVERY task must:**

1. **Query first:** \`memory_search()\` before implementing
2. **Reference:** Use existing patterns from memory
3. **Document:** \`memory_write()\` after significant work

**The memory system is as essential as version control.**
`;

        try {
            await fs.mkdir(memoryBankDir, { recursive: true });
            await fs.writeFile(activeContextPath, activeContext, 'utf-8');
            this.outputChannel.appendLine(`  📄 Created: .roo/memory-bank/activeContext.md`);
        } catch (error) {
            this.outputChannel.appendLine(`  ❌ Failed to create RooCode memory bank files`);
        }
    }

    /**
     * Inject memory instructions into AGENTS.md for OpenCode.
     * OpenCode reads AGENTS.md at session start for project rules.
     * Keeps AGENTS.md clean — only instructions, no operational data.
     */
    private async injectOpenCodeRules(workspacePath: string): Promise<void> {
        const agentsMdPath = path.join(workspacePath, 'AGENTS.md');
        const memorySection = `## agentMemory

This project uses agentMemory for persistent knowledge management.

### Episodic Memory

Project decisions, patterns, and context are stored in \`.opencode/memory-context.md\`.

**Before starting any task:** Read \`.opencode/memory-context.md\` to load recent project context.
**After significant work:** Use \`agentmemory_memory_write\` to persist new knowledge. Entries sync to the context file automatically.

The context file is a sliding window of the 25 most recent memories (newest first). Older entries are pruned automatically — full history remains searchable via \`agentmemory_memory_search\`.

### Available Tools (MCP server: agentmemory)

- \`agentmemory_memory_search\` — Search all memories by query, type, or tags
- \`agentmemory_memory_write\` — Save new memory (key, type, content, tags)
- \`agentmemory_memory_read\` — Retrieve specific memory by key
- \`agentmemory_memory_list\` — List memories by type
- \`agentmemory_memory_update\` — Update existing memory
- \`agentmemory_memory_stats\` — View memory usage statistics

`;

        try {
            let existing = '';
            try {
                existing = await fs.readFile(agentsMdPath, 'utf-8');
            } catch {
                // File doesn't exist yet
            }

            if (existing.includes('## agentMemory')) {
                this.outputChannel.appendLine(`  ℹ️  AGENTS.md already contains agentMemory section`);
                return;
            }

            if (existing.trim()) {
                // Append to existing AGENTS.md
                await fs.writeFile(agentsMdPath, existing.trimEnd() + '\n\n' + memorySection, 'utf-8');
                this.outputChannel.appendLine(`  📄 Updated: AGENTS.md with agentMemory rules`);
            } else {
                // Create new AGENTS.md
                const header = `# AGENTS.md\n\nInstructions for AI coding agents working on this project.\n\n`;
                await fs.writeFile(agentsMdPath, header + memorySection, 'utf-8');
                this.outputChannel.appendLine(`  📄 Created: AGENTS.md with agentMemory rules`);
            }
        } catch (error) {
            this.outputChannel.appendLine(`  ❌ Failed to create/update AGENTS.md`);
        }
    }

    /**
     * Create OpenCode custom commands for memory operations.
     * These appear as /memory-search and /memory-write in the TUI.
     */
    private async injectOpenCodeCommands(workspacePath: string): Promise<void> {
        const commandsDir = path.join(workspacePath, '.opencode', 'commands');

        const memorySearchCommand = `---
description: Search project memories for relevant context
---
Search the agentMemory system for context relevant to: $ARGUMENTS

Use the \`agentmemory_memory_search\` tool with the query "$ARGUMENTS".

If results are found:
1. Summarize each memory's key information
2. Note the memory type and tags
3. Suggest how the findings relate to the current task

If no results are found:
- Suggest alternative search terms
- Consider if this is new knowledge that should be documented
`;

        const memoryWriteCommand = `---
description: Save findings to project memory
---
Document the following in the agentMemory system: $ARGUMENTS

Use the \`agentmemory_memory_write\` tool with:
- \`key\`: A unique kebab-case identifier derived from the topic
- \`type\`: Choose from architecture, pattern, feature, api, bug, decision
- \`content\`: Detailed markdown documentation of the finding
- \`tags\`: Relevant keywords for searchability (e.g., ["auth", "security", "backend"])

After writing, confirm the memory was saved successfully.
`;

        const memoryReviewCommand = `---
description: Review all project memories and summarize patterns
---
List all memories in the project using \`agentmemory_memory_stats\` and \`agentmemory_memory_list\`.

Then summarize:
1. Total number of memories by type
2. Most frequently accessed memories
3. Recent additions
4. Coverage gaps (areas with no memories)

This helps identify knowledge gaps in the project documentation.
`;

        try {
            await fs.mkdir(commandsDir, { recursive: true });
            await fs.writeFile(path.join(commandsDir, 'memory-search.md'), memorySearchCommand, 'utf-8');
            await fs.writeFile(path.join(commandsDir, 'memory-write.md'), memoryWriteCommand, 'utf-8');
            await fs.writeFile(path.join(commandsDir, 'memory-review.md'), memoryReviewCommand, 'utf-8');
            this.outputChannel.appendLine(`  📄 Created: .opencode/commands/memory-search.md`);
            this.outputChannel.appendLine(`  📄 Created: .opencode/commands/memory-write.md`);
            this.outputChannel.appendLine(`  📄 Created: .opencode/commands/memory-review.md`);
        } catch (error) {
            this.outputChannel.appendLine(`  ❌ Failed to create OpenCode commands`);
        }
    }

    /**
     * Inject agentMemory MCP server config into opencode.json.
     * Adds the local MCP server so OpenCode can use memory tools.
     */
    private async injectOpenCodeMCPConfig(workspacePath: string): Promise<void> {
        const configPath = path.join(workspacePath, 'opencode.json');

        const serverPath = path.join(
            this.workspaceFolder.uri.fsPath,
            '..', '..', '.agents', 'skills', 'agent-memory', 'out', 'mcp-server', 'server.js'
        );

        const projectId = path.basename(workspacePath);

        try {
            let config: any = {};
            try {
                const content = await fs.readFile(configPath, 'utf-8');
                config = JSON.parse(content);
            } catch {
                // File doesn't exist, start fresh
            }

            if (!config.mcp) {
                config.mcp = {};
            }

            if (config.mcp.agentmemory) {
                this.outputChannel.appendLine(`  ℹ️  opencode.json already has agentmemory MCP config`);
                return;
            }

            config.mcp.agentmemory = {
                type: 'local',
                command: ['node', serverPath, projectId, workspacePath],
                enabled: true
            };

            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
            this.outputChannel.appendLine(`  📄 Updated: opencode.json with agentmemory MCP server`);
        } catch (error) {
            this.outputChannel.appendLine(`  ❌ Failed to update opencode.json`);
        }
    }

    /**
     * Inject context provider config for Continue
     */
    private async injectContinueConfig(workspacePath: string): Promise<void> {
        const configDir = path.join(workspacePath, '.continue');
        const configPath = path.join(configDir, 'config.json');

        // Read existing config or create new
        let config: any = {
            contextProviders: []
        };

        try {
            const content = await fs.readFile(configPath, 'utf-8');
            config = JSON.parse(content);
        } catch (error) {
            // File doesn't exist, use default
        }

        // Add agentMemory context provider if not present
        const hasMemoryProvider = config.contextProviders?.some(
            (p: any) => p.name === 'agentMemory'
        );

        if (!hasMemoryProvider) {
            config.contextProviders = config.contextProviders || [];
            config.contextProviders.unshift({
                name: 'agentMemory',
                required: true,
                priority: 1,
                description: 'agentMemory - Persistent project memory'
            });

            try {
                await fs.mkdir(configDir, { recursive: true });
                await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
                console.log('Updated .continue/config.json for Continue');
            } catch (error) {
                console.error('Failed to update Continue config:', error);
            }
        }
    }
}

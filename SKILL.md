---
name: agentMemory
description: A hybrid memory system that provides persistent, searchable knowledge management for AI agents.
---

# agentMemory Skill

This skill extends your capabilities by providing a persistent, searchable memory bank that automatically syncs with project documentation.

## Prerequisites

- Node.js installed
- Check if `agentMemory` is already installed in the project:
  ```bash
  ls -la .agentMemory
  ```

## Setup

### 1. Choose Your Agents (Required!)

Before initializing the memory bank, you MUST ask the user which AI coding agents they plan to use in this project.

**Supported agents:**

| # | Agent | Type | Memory Bank Path |
|---|-------|------|------------------|
| 1 | **KiloCode** | VS Code Extension | `.kilocode/rules/memory-bank/` |
| 2 | **Cline** | VS Code Extension | `.clinerules/memory-bank/` |
| 3 | **RooCode** | VS Code Extension | `.roo/memory-bank/` |
| 4 | **OpenCode** | Terminal TUI | `.opencode/memory-bank/` |

**Ask the user:**
```
Which AI coding agents will you use for this project? 
You can select multiple:
[ ] KiloCode
[ ] Cline
[ ] RooCode
[ ] OpenCode
```

Then configure them using the MCP tool:
```
configure_agents({ agents: "kilocode,opencode" })
```

### 2. Build the MCP Server

Once agents are configured, install dependencies and compile:
```bash
cd ~/.agents/skills/agent-memory && npm install && npm run compile
```

### 3. Start the Memory Server

#### For VS Code Agents (Cline, RooCode, KiloCode)

```bash
npm run start-server <project_id> <absolute_path_to_workspace>
```

#### For OpenCode (Terminal-based Agent)

```bash
# Include the agents you configured:
node ~/.agents/skills/agent-memory/out/mcp-server/server.js <PROJECT_ID> <ABSOLUTE/PATH> --agents=kilocode,opencode
```

Or add to your `opencode.json` in the project root:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "agentmemory": {
      "type": "local",
      "command": [
        "node",
        "/Users/YOUR_USER/.agents/skills/agent-memory/out/mcp-server/server.js",
        "PROJECT_ID",
        "/ABSOLUTE/PATH/TO/WORKSPACE",
        "--agents=kilocode,opencode"
      ],
      "enabled": true
    }
  }
}
```
Replace `YOUR_USER`, `PROJECT_ID`, `/ABSOLUTE/PATH/TO/WORKSPACE`, and the agents list with actual values.

### 4. Add Memory Instructions to `AGENTS.md`

Create or update `AGENTS.md` in the project root:
```markdown
## agentMemory System (REQUIRED)

This project uses agentMemory for persistent knowledge management.

### Required Workflow

**EVERY task MUST follow this sequence:**

1. **Before ANY work:** Call `memory_search()` to check existing knowledge
2. **After ANY significant work:** Call `memory_write()` to document what was done

### Available MCP Tools

- `agentmemory_memory_search` — Search for memories by query, type, or tags
- `agentmemory_memory_write` — Save new memory
- `agentmemory_memory_read` — Retrieve specific memory by key
- `agentmemory_memory_list` — List memories by type
- `agentmemory_memory_update` — Update existing memory
- `agentmemory_memory_stats` — View memory statistics
- `agentmemory_configure_agents` — Change which agents to sync with

**Failure to use memory tools = Incomplete work**
```

### 5. Optionally Add Custom Commands

To `.opencode/commands/memory-search.md`:
```markdown
---
description: Search project memories
---
Search the agentMemory system for relevant context about: $ARGUMENTS

Use the agentmemory_memory_search tool with query "$ARGUMENTS".
If results are found, summarize them clearly. If no results, suggest creating a new memory.
```

## Changing Agents Later

If the user wants to add or remove agents after initial setup, use:
```
configure_agents({ agents: "kilocode,roocode" })
```

Or run interactively (only in TTY):
```
configure_agents({ interactive: true })
```

The configuration is stored in `.agentMemory/agents.json`:
```json
{
  "selectedAgents": ["kilocode", "opencode"],
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z"
}
```

## Capabilities (MCP Tools)

Once the server is running, you can use these tools:

### `memory_search`
Search for memories by query, type, or tags.
- **Args**: `query` (string), `type?` (string), `tags?` (string[])
- **Usage**: "Find all authentication patterns" -> `memory_search({ query: "authentication", type: "pattern" })`

### `memory_write`
Record new knowledge or decisions.
- **Args**: `key` (string), `type` (string), `content` (string), `tags?` (string[])
- **Usage**: "Save this architecture decision" -> `memory_write({ key: "auth-v1", type: "decision", content: "..." })`

### `memory_read`
Retrieve specific memory content by key.
- **Args**: `key` (string)
- **Usage**: "Get the auth design" -> `memory_read({ key: "auth-v1" })`

### `memory_stats`
View analytics on memory usage, including which agents are active.
- **Usage**: "Show memory statistics" -> `memory_stats({})`

### `configure_agents`
Switch which agents receive memory bank sync.
- **Args**: `agents` (string — comma-separated)
- **Usage**: `configure_agents({ agents: "kilocode,opencode" })`

## Supported Agents

| Agent | Type | Config Location | Memory Bank Path |
|-------|------|-----------------|------------------|
| KiloCode | VS Code Extension | VS Code MCP settings | `.kilocode/rules/memory-bank/` |
| Cline | VS Code Extension | VS Code MCP settings | `.clinerules/memory-bank/` |
| RooCode | VS Code Extension | VS Code MCP settings | `.roo/memory-bank/` |
| **OpenCode** | Terminal TUI | `opencode.json` | `.opencode/memory-bank/` |

## Workflow

1. **Initialization**: The first time you run this in a project, ask which agents to use and call `configure_agents()`.
2. **Development Loop**:
   - **Before Task**: Search memory for relevant context.
   - **During Task**: Use read/search to answer questions.
   - **After Task**: Write new findings to memory.
3. **Sync**: Your writes are automatically synced to standard markdown files **only for the selected agents**.

## Why Agent Selection Matters

Previously, agentMemory automatically created configuration and files for **all agents** (KiloCode, Cline, RooCode, OpenCode) simultaneously, which cluttered the project directory with files the user never intended to use.

Now, only the agents you explicitly choose will have:
- Memory bank directories created
- MCP settings configured
- Memory files synced

This keeps your project clean and focused.

Base directory for this skill: file:///Users/maksim/.agents/skills/agent-memory
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
Note: file list is sampled.

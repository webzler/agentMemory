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

### For VS Code Agents (Cline, RooCode, KiloCode)

1. **Install Dependencies**:
   ```bash
   cd ~/.agents/skills/agent-memory && npm install && npm run compile
   ```

2. **Start the Memory Server**:
   ```bash
   npm run start-server <project_id> <absolute_path_to_workspace>
   ```

### For OpenCode (Terminal-based Agent)

1. **Build the MCP server**:
   ```bash
   cd ~/.agents/skills/agent-memory && npm install && npm run compile
   ```

2. **Add MCP server to your `opencode.json`** in the project root:
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "mcp": {
       "agentmemory": {
         "type": "local",
         "command": ["node", "/Users/YOUR_USER/.agents/skills/agent-memory/out/mcp-server/server.js", "PROJECT_ID", "/ABSOLUTE/PATH/TO/WORKSPACE"],
         "enabled": true
       }
     }
   }
   ```
   Replace `YOUR_USER`, `PROJECT_ID`, and `/ABSOLUTE/PATH/TO/WORKSPACE` with actual values.

3. **Add memory instructions to `AGENTS.md`** in the project root:
   ```markdown
   ## agentMemory System (REQUIRED)

   This project uses agentMemory for persistent knowledge management.

   ### Required Workflow

   **EVERY task MUST follow this sequence:**

   1. **Before ANY work:** Call `memory_search()` to check existing knowledge
   2. **After ANY significant work:** Call `memory_write()` to document what was done

   ### Available MCP Tools

   - `agentmemory_memory_search` - Search for memories by query, type, or tags
   - `agentmemory_memory_write` - Save new memory
   - `agentmemory_memory_read` - Retrieve specific memory by key
   - `agentmemory_memory_list` - List memories by type
   - `agentmemory_memory_update` - Update existing memory
   - `agentmemory_memory_stats` - View memory statistics
   - `agentmemory_project_init` - Initialize project storage

   **Failure to use memory tools = Incomplete work**
   ```

4. **Optionally add custom commands** to `.opencode/commands/memory-search.md`:
   ```markdown
   ---
   description: Search project memories
   ---
   Search the agentMemory system for relevant context about: $ARGUMENTS

   Use the agentmemory_memory_search tool with query "$ARGUMENTS".
   If results are found, summarize them clearly. If no results, suggest creating a new memory.
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
View analytics on memory usage.
- **Usage**: "Show memory statistics" -> `memory_stats({})`

## Supported Agents

| Agent | Type | Config Location | Memory Bank Path |
|-------|------|-----------------|------------------|
| KiloCode | VS Code Extension | VS Code MCP settings | `.kilocode/rules/memory-bank/` |
| Cline | VS Code Extension | VS Code MCP settings | `.clinerules/memory-bank/` |
| RooCode | VS Code Extension | VS Code MCP settings | `.roo/memory-bank/` |
| **OpenCode** | Terminal TUI | `opencode.json` | `AGENTS.md` + `.opencode/commands/` |

## Workflow

1. **Initialization**: The first time you run this in a project, it may attempt to import existing markdown memory banks from `.kilocode/`, `.clinerules/`, `.roo/`, or `AGENTS.md`.
2. **Development Loop**:
   - **Before Task**: Search memory for relevant context.
   - **During Task**: Use read/search to answer questions.
   - **After Task**: Write new findings to memory.
3. **Sync**: Your writes are automatically synced to standard markdown files in the project.

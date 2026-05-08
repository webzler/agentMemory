# 🚀 agentMemory

**Hybrid Memory System for AI Coding Agents**

Seamlessly integrate with KiloCode, Cline, and RooCode's built-in memory banks while providing powerful search, analytics, and automation.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/webzler.agentmemory?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/webzler.agentmemory)](https://marketplace.visualstudio.com/)

---


## 🚀 Now Available as an Antigravity Skill!

agentMemory is now fully compatible with **Antigravity**. Use it as a skill to give your agents persistent, searchable memory that syncs with your project documentation.

See [SKILL.md](SKILL.md) for usage instructions.

---

## 🎯 What Makes agentMemory Different?

**KiloCode, Cline, and RooCode already have memory banks** - but they're **manual and limited**.

### Their Built-In Memory Banks

```
.kilocode/rules/memory-bank/     ← Markdown files
.clinerules/memory-bank/         ← Manually updated
.roo/memory-bank/                ← No search capability
```

**The Problem with Native Memory Banks:**
- ❌ **Manual Maintenance**: Agents must manually rewrite files to update memory.
- ❌ **No Search**: Agents must read entire files to find specific information.
- ❌ **No Analytics**: No way to track memory growth or patterns over time.
- ❌ **Isolated**: Memories are locked to a single project.

### ✅ The Solution: agentMemory

agentMemory **fixes these limitations** by upgrading your memory bank with:

```
.agentMemory/                    ← Our structured database
  ├── Bi-directional sync        ← Keeps their markdown updated
  ├── Powerful search            ← Query by type, tags, content
  ├── Visual dashboard           ← See trends and analytics
  └── MCP tools                  ← Programmatic access for AI
```

**Benefits:**
- ✅ **Automatic sync** - No manual "update memory bank" needed
- ✅ **Searchable** - Find memories by query, type, or tags
- ✅ **Visual dashboard** - Charts, trends, and analytics
- ✅ **Cross-project** - Query memories across all your projects
- ✅ **Compatible** - Works WITH their systems, not against them

---

## 🏗️ How It Works: Hybrid Architecture

### Two-Layer System

```
┌─────────────────────────────────────────────────────────┐
│  Built-In Memory Banks (Markdown Files)                │
│  .kilocode/rules/memory-bank/                          │
│  .clinerules/memory-bank/                              │
│  .roo/memory-bank/                                      │
│  ├── Human-readable documentation                      │
│  ├── Git-committable                                   │
│  └── Read automatically by agents at session start     │
└──────────────┬──────────────────────────────────────────┘
               │
               │ ⬍ Bi-Directional Sync ⬊
               │
┌──────────────▼──────────────────────────────────────────┐
│  agentMemory (Structured Storage + MCP Server)         │
│  .agentMemory/                                         │
│  ├── JSON database for fast queries                   │
│  ├── MCP tools (memory_read, memory_search, etc.)     │
│  ├── Dashboard with analytics                         │
│  └── Cross-project search capabilities                │
└─────────────────────────────────────────────────────────┘
```

### The Flow

**1. Session Start - Passive Context Loading**
```
AI reads markdown files (.kilocode/rules/memory-bank/)
  └─> Contains: Project context + MCP usage instructions
  └─> Sees: "This project uses agentMemory MCP tools"
```

**2. During Session - Active Queries**
```
AI needs to find auth patterns
  └─> Calls: memory_search({ query: "auth pattern" })
  └─> Gets: Structured results from our database
  └─> Faster and more accurate than file scanning
```

**3. After Work - Automatic Sync**
```
AI calls: memory_write({ key: "new-feature", ... })
  └─> We save to: .agentMemory/ (JSON database)
  └─> We sync to: .kilocode/rules/memory-bank/product.md
  └─> Next session: They see it in markdown automatically
```

---

## ✨ Key Features

### 🔄 Bi-Directional Sync

**Markdown → MCP**
- Parses existing memory bank files
- Imports sections as searchable memories
- Preserves human-friendly docs

**MCP → Markdown**
- Auto-generates markdown from MCP data
- Appends to appropriate files:
  - `architecture.md` ← Architecture decisions
  - `systemPatterns.md` ← Code patterns
  - `techContext.md` ← Tech stack choices
  - `productContext.md` ← Features
  - `progress.md` ← Status tracking

### � Powerful Search

```typescript
// Search across ALL memories
memory_search({ 
  query: "authentication", 
  type: "pattern",
  tags: ["security"]
})

// Returns structured results from our database
// Much faster than scanning markdown files
```

### 📊 Visual Dashboard

- **Memory trends** over time
- **Agent activity** tracking
- **Type distribution** (architecture vs patterns vs features)
- **Recent changes** timeline
- **Cross-project** insights

### 🤖 Multi-Agent Support

| Agent | Type | Memory Bank Location | Sync Status |
|-------|------|---------------------|-------------|
| **KiloCode** | VS Code Extension | `.kilocode/rules/memory-bank/` | ✅ Full sync |
| **Cline** | VS Code Extension | `.clinerules/memory-bank/` | ✅ Full sync |
| **RooCode** | VS Code Extension | `.roo/memory-bank/` | ✅ Full sync |
| **OpenCode** | Terminal TUI | `AGENTS.md` + `.opencode/commands/` | ✅ Full sync |

**Files Synced:**
- `projectBrief.md` / `brief.md`
- `architecture.md` / `systemPatterns.md`
- `productContext.md` / `product.md`
- `techContext.md` / `tech.md`
- `activeContext.md` / `context.md`
- `progress.md`
- `decisionLog.md` (RooCode)

---

## 📦 Installation

### From Marketplace (1-Click)

1. Open VS Code
2. Extensions → Search "agentMemory"
3. Click Install
4. Reload VS Code

**That's it!** The extension will:
- ✅ Create MCP server configuration
- ✅ Inject memory-first instructions into memory banks
- ✅ Start bi-directional sync
- ✅ Enable dashboard

### Manual Installation

```bash
git clone https://github.com/yourusername/agentMemory
cd agentMemory
npm install
npm run compile
npm run package
code --install-extension agentmemory-0.1.0.vsix
```

---

## 🎮 Usage

### For End Users (Zero Config)

Once installed, agentMemory works automatically:

1. **Import existing memory banks** on first run
2. **Sync new memories** as agents create them
3. **Provide MCP tools** for fast queries
4. **Update markdown files** to keep agents in sync

**No configuration needed!**

### For AI Agents (Automatic)

Agents will find mandatory instructions in their memory bank files:

```markdown
# techContext.md

## agentMemory System (REQUIRED)

This project uses agentMemory for knowledge management.

### Required Workflow

1. Before ANY work: Call memory_search() to check existing knowledge
2. After ANY work: Call memory_write() to document decisions
3. Use memory_read() for specific pattern retrieval
```

Agents treat this as **project architecture** and follow it automatically.

---

## 🛠️ Memory Tools (MCP)

| Tool | Purpose | Example |
|------|---------|---------|
| `memory_write` | Save new memory | Document architecture decisions |
| `memory_read` | Get specific memory | Retrieve OAuth implementation |
| `memory_search` | Query by content/tags | Find all auth-related patterns |
| `memory_list` | List by type | Show all architecture decisions |
| `memory_update` | Modify existing | Append to existing pattern |
| `memory_stats` | View analytics | Usage statistics |

---

## � Project Structure

After installation, your project will have:

```
your-project/
├── .vscode/
│   └── settings.json           # MCP server config (auto-created)
│
├── .agentMemory/               # Our structured storage
│   ├── uuid-001.json          # Memory: OAuth architecture
│   ├── uuid-002.json          # Memory: API patterns
│   └── ...
│
├── AGENTS.md                  # OpenCode rules (auto-created)
│
├── opencode.json              # OpenCode MCP config (auto-created)
│
├── .opencode/
│   └── commands/              # OpenCode custom commands (auto-created)
│       ├── memory-search.md
│       ├── memory-write.md
│       └── memory-review.md
│
├── .kilocode/rules/memory-bank/    # KiloCode memory bank
│   ├── brief.md                    # ⬍ Synced with our database
│   ├── architecture.md             # ⬍ Auto-updated
│   ├── product.md                  # ⬍ Auto-updated
│   └── tech.md                     # ⬍ Auto-updated
│
├── .clinerules/memory-bank/        # Cline memory bank
│   ├── projectBrief.md             # ⬍ Synced
│   ├── systemPatterns.md           # ⬍ Synced
│   └── ...                         # ⬍ Synced
│
└── .roo/memory-bank/               # RooCode memory bank
    ├── projectBrief.md             # ⬍ Synced
    ├── decisionLog.md              # ⬍ Synced
    └── ...                         # ⬍ Synced
```

**All markdown files stay human-readable and git-friendly!**

---

## 💡 Example Workflow

### Day 1: Initial Implementation

**User → KiloCode:** "Create OAuth authentication"

1. KiloCode implements OAuth
2. Calls: `memory_write({ key: "oauth-impl", type: "architecture", ... })`
3. **agentMemory saves to:**
   - `.agentMemory/uuid-001.json` (our database)
   - `.kilocode/rules/memory-bank/architecture.md` (their markdown)

### Day 3: Extension by Different Agent

**User → Cline:** "Add Google OAuth provider"

1. Cline reads `.clinerules/memory-bank/architecture.md`
2. Sees OAuth documentation (synced from our database)
3. Calls: `memory_search({ query: "oauth" })`
4. Gets structured results instantly
5. Implements Google provider consistently

### Day 7: New Developer Onboarding

**New Dev → RooCode:** "How does authentication work?"

1. RooCode reads `.roo/memory-bank/systemPatterns.md`
2. Sees complete auth patterns (auto-synced)
3. Calls: `memory_read({ key: "oauth-impl" })`
4. Gets full OAuth architecture doc
5. ✅ **Instant understanding** - Zero learning curve

---

## 🎯 Why agentMemory?

| Feature | agentMemory | Built-In Banks | Standalone MCP |
|---------|-------------|----------------|----------------|
| **Markdown Files** | ✅ Synced | ✅ Manual | ❌ No |
| **Search** | ✅ Fast indexed | ❌ No | ✅ Yes |
| **Analytics** | ✅ Dashboard | ❌ No | ❌ No |
| **Automation** | ✅ Auto-sync | ❌ Manual | ⚠️ Partial |
| **Multi-Agent** | ✅ All 4 | ✅ Per-agent | ✅ All |
| **Git-Friendly** | ✅ Yes | ✅ Yes | ⚠️ Depends |
| **Cross-Project** | ✅ Yes | ❌ No | ❌ No |

---

## � Dashboard

### Opening Dashboard

```
Cmd/Ctrl+Shift+P → "agentMemory: Open Memory Dashboard"
```

### Features

- **Overview**: Total memories, active agents, recent activity
- **Charts**: Memory types, agent activity, trends over time
- **Search**: Query memories with filters
- **Export**: Generate markdown summaries
- **Sync Status**: See which files are synced

---

## � Privacy & Security

- ✅ **100% Local** - No cloud storage
- ✅ **Offline-First** - Works without internet
- ✅ **Git-Friendly** - Commit `.agentMemory/` to version control
- ✅ **Open Source** - Audit the code yourself

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📄 License

MIT © Amit Rathiesh (Webzler Solutions Inc.)

---

## 👨‍💻 Author

**Amit Rathiesh**  
Webzler Solutions Inc.  
📧 amitrathiesh@webzler.com  
🌐 [www.webzler.com](https://www.webzler.com)  
🐙 [@amitrathiesh](https://github.com/amitrathiesh)

---

<div align="center">
  <strong>Making AI memory banks searchable, visual, and automatic</strong>
  <br><br>
  <a href="https://github.com/webzler/agentMemory">⭐ Star on GitHub</a> •
  <a href="https://github.com/sponsors/webzler">💖 Sponsor</a>
</div>

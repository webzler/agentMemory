# agentMemory - Persistent Memory for AI Agents

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/webzler.agentmemory)](https://marketplace.visualstudio.com/items?itemName=webzler.agentmemory)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**agentMemory** is a VSCode extension that provides AI coding agents with a persistent, searchable memory system. It enables agents like Cline, RooCode, and KiloCode to remember project context, decisions, and patterns across sessions.

## ✨ Features

- 🧠 **Persistent Memory** - Store architecture decisions, patterns, bugs, and features
- 🔍 **Powerful Search** - Full-text search with tag and type filtering
- 🔄 **Bi-Directional Sync** - Auto-sync between markdown files and MCP storage
- 🎯 **QuickPick UI** - VSCode commands with rich UI for memory management
- 🛡️ **Security** - Rate limiting and permission system for safe API access
- 📊 **Dashboard** - Visual analytics and memory browsing
- ⚙️ **Configurable** - Customize rate limits, conflict resolution, caching

## 🚀 Quick Start

1. Install the extension from VS Code Marketplace
2. Open any workspace
3. Press `Cmd+Shift+M` to search memories
4. Or use Command Palette: `agentMemory: Search Memories`

## 📝 Usage

### For AI Agents

AI agents can use the public API to store and retrieve memories:

```typescript
// Get the API
const agentMemory = vscode.extensions.getExtension('webzler.agentmemory');
const api = await agentMemory.activate();

// Write a memory
await api.write('auth-flow', 'OAuth 2.0 implementation...', {
  type: 'architecture',
  tags: ['auth', 'security'],
  relationships: {
    dependsOn: [],
    implements: []
  }
});

// Search memories
const results = await api.search({ query: 'authentication' });

// Read specific memory
const memory = await api.read('auth-flow');
```

### For Users

**Commands** (access via `Cmd+Shift+P`):
- `agentMemory: Search Memories` (`Cmd+Shift+M`) - Search and view memories
- `agentMemory: View All Memories` - Browse all memories
- `agentMemory: View by Type` - Filter by architecture, pattern, bug, etc.
- `agentMemory: Clear Cache` - Clear memory cache
- `agentMemory: Open Dashboard` - Open visual dashboard

## ⚙️ Configuration

Access settings via `Cmd+,` → Search "agentMemory":

```json
{
  // Rate limiting
  "agentMemory.rateLimit.maxRequests": 100,  // Max requests per minute
  "agentMemory.rateLimit.windowMs": 60000,   // Window in milliseconds

  // Conflict resolution
  "agentMemory.conflictResolution.strategy": "newest-wins",  // or "mcp-wins", "markdown-wins"

  // Auto-sync
  "agentMemory.sync.autoSync": true,  // Auto-sync markdown changes

  // Cache
  "agentMemory.cache.ttl": 3600000,     // 1 hour in milliseconds
  "agentMemory.cache.maxSize": 10000,   // Max cached entries

  // Dashboard
  "agentMemory.dashboard.port": 3333  // Dashboard HTTP port
}
```

## 📚 Memory Types

- **architecture** - System design, architecture decisions
- **pattern** - Code patterns, best practices
- **feature** - Feature implementations, specifications
- **api** - API designs, endpoints, contracts
- **bug** - Bug fixes, workarounds
- **decision** - Technical decisions, trade-offs

## 🔐 Security

- **Rate Limiting**: Prevents API abuse (default: 100 req/min)
- **Extension Isolation**: Extensions can only access their own memories by default
- **Input Validation**: All memory objects validated with Zod schemas

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

**Test Coverage**: 35/35 tests passing (100%)

## 📖 Documentation

- [API Guide](docs/API_GUIDE.md) - Full API reference
- [Configuration Guide](docs/CONFIGURATION.md) - Configuration options
- [Architecture](docs/ARCHITECTURE.md) - System architecture

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT © webzler

## 🙏 Credits

Built with:
- [VSCode Extension API](https://code.visualstudio.com/api)
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io)
- [lru-cache](https://github.com/isaacs/node-lru-cache)
- [chokidar](https://github.com/paulmillr/chokidar)
- [Jest](https://jestjs.io/)

---

**Made for AI coding agents** 🤖 **Powered by Model Context Protocol** ⚡

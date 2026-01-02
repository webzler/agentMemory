# agentMemory Extension API

Public API for integrating with agentMemory from other VS Code extensions.

---

## Installation

First, ensure agentMemory is installed in the user's VS Code:

```bash
# From VS Code Marketplace
code --install-extension your-publisher.agentmemory
```

---

## Getting the API

```typescript
import * as vscode from 'vscode';

// Get the agentMemory extension
const agentMemoryExt = vscode.extensions.getExtension('webzler.agentmemory');

if (!agentMemoryExt) {
    vscode.window.showErrorMessage('agentMemory extension is not installed');
    return;
}

// Activate and get the API
const api = await agentMemoryExt.activate();
```

---

## API Reference

### `write(key, content, options)`

Write a new memory to the memory bank.

**Parameters:**
- `key` (string): Unique identifier for the memory
- `content` (string): Memory content (supports Markdown)
- `options` (MemoryOptions): Configuration object
  - `type`: `'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision'`
  - `tags?`: string[] - Tags for categorization
  - `relationships?`: Object with `dependsOn` and `implements` arrays
  - `metadata?`: Additional metadata (e.g., `createdBy`)

**Returns:** `Promise<string>` - Memory ID

**Example:**
```typescript
const memoryId = await api.write('oauth-implementation', `
# OAuth Implementation

We use Passport.js with JWT tokens for authentication.

## Configuration
- JWT secret stored in environment variable
- Token expiry: 24 hours
- Refresh token rotation enabled
`, {
    type: 'architecture',
    tags: ['oauth', 'authentication', 'security'],
    relationships: {
        dependsOn: ['user-model', 'jwt-service'],
        implements: []
    },
    metadata: {
        createdBy: 'my-awesome-extension'
    }
});

console.log(`Memory created: ${memoryId}`);
```

---

### `read(key)`

Read a memory by its key.

**Parameters:**
- `key` (string): Memory key to read

**Returns:** `Promise<Memory | null>` - Memory object or null if not found

**Example:**
```typescript
const memory = await api.read('oauth-implementation');

if (memory) {
    console.log(`Type: ${memory.type}`);
    console.log(`Content: ${memory.content}`);
    console.log(`Tags: ${memory.tags.join(', ')}`);
    console.log(`Access count: ${memory.metadata.accessCount}`);
} else {
    console.log('Memory not found');
}
```

---

### `search(options)`

Search memories by query, tags, or type.

**Parameters:**
- `options` (SearchOptions):
  - `query?`: string - Text search query
  - `tags?`: string[] - Filter by tags
  - `type?`: Memory type filter
  - `limit?`: number - Maximum results (default: 10)

**Returns:** `Promise<Memory[]>` - Array of matching memories

**Example:**
```typescript
// Search by query
const authMemories = await api.search({
    query: 'authentication',
    limit: 5
});

// Search by tags
const securityMemories = await api.search({
    tags: ['security', 'oauth']
});

// Search by type
const architectureMemories = await api.search({
    type: 'architecture'
});

// Combined search
const results = await api.search({
    query: 'api',
    tags: ['backend'],
    type: 'pattern',
    limit: 10
});
```

---

### `list(type?)`

List all memories, optionally filtered by type.

**Parameters:**
- `type?` (string): Optional memory type filter

**Returns:** `Promise<Memory[]>` - Array of memories

**Example:**
```typescript
// List all memories
const allMemories = await api.list();

// List only architecture memories
const architectures = await api.list('architecture');
```

---

### `update(key, updates)`

Update an existing memory.

**Parameters:**
- `key` (string): Memory key to update
- `updates` (Partial<Memory>): Updates to apply
  - `content?`: string
  - `tags?`: string[]
  - `relationships?`: Object

**Returns:** `Promise<Memory | null>` - Updated memory or null if not found

**Example:**
```typescript
const updated = await api.update('oauth-implementation', {
    content: memory.content + '\n\n## Update: Added Google OAuth provider',
    tags: [...memory.tags, 'google-oauth']
});
```

---

### `subscribe(callback)`

Subscribe to memory events in real-time.

**Parameters:**
- `callback` (MemoryEventCallback): Function called when events occur

**Returns:** `() => void` - Unsubscribe function

**Example:**
```typescript
const unsubscribe = api.subscribe((event) => {
    console.log(`[${event.action}] ${event.key} by ${event.agent} at ${new Date(event.timestamp)}`);
    
    if (event.action === 'write') {
        vscode.window.showInformationMessage(`New memory created: ${event.key}`);
    }
});

// Later: unsubscribe
unsubscribe();
```

---

### `getStats()`

Get statistics about memory usage.

**Returns:** `Promise<any>` - Statistics object with memory counts, cache info, etc.

**Example:**
```typescript
const stats = await api.getStats();

console.log(`Total memories: ${stats.totalMemories}`);
console.log(`By type:`, stats.byType);
console.log(`Cache size: ${stats.cache.size}`);
```

---

## TypeScript Interfaces

```typescript
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
        [key: string]: any;
    };
    createdAt: number;
    updatedAt: number;
}

interface MemoryOptions {
    type: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision';
    tags?: string[];
    relationships?: {
        dependsOn?: string[];
        implements?: string[];
    };
    metadata?: {
        createdBy?: string;
        [key: string]: any;
    };
}

interface SearchOptions {
    query?: string;
    tags?: string[];
    type?: string;
    limit?: number;
}

interface MemoryEvent {
    action: 'write' | 'read' | 'update' | 'delete';
    key: string;
    agent: string;
    timestamp: number;
}
```

---

## Complete Example: AI Code Assistant Integration

```typescript
import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext) {
    // Get agentMemory API
    const agentMemoryExt = vscode.extensions.getExtension('webzler.agentmemory');
    if (!agentMemoryExt) {
        console.warn('agentMemory not installed');
        return;
    }
    
    const memoryAPI = await agentMemoryExt.activate();
    
    // Example: Store architecture decision
    const storeDecision = vscode.commands.registerCommand('myext.storeDecision', async () => {
        const key = await vscode.window.showInputBox({ prompt: 'Decision key' });
        const content = await vscode.window.showInputBox({ prompt: 'Decision content' });
        
        if (key && content) {
            await memoryAPI.write(key, content, {
                type: 'decision',
                tags: ['architecture'],
                metadata: { createdBy: 'my-extension' }
            });
            
            vscode.window.showInformationMessage('Decision stored!');
        }
    });
    
    // Example: Query before coding
    const queryMemory = vscode.commands.registerCommand('myext.queryMemory', async () => {
        const query = await vscode.window.showInputBox({ prompt: 'Search query' });
        
        if (query) {
            const results = await memoryAPI.search({ query, limit: 5 });
            
            const items = results.map(m => ({
                label: m.key,
                description: m.type,
                detail: m.content.substring(0, 100) + '...'
            }));
            
            const selected = await vscode.window.showQuickPick(items);
            if (selected) {
                const memory = await memoryAPI.read(selected.label);
                // Show memory content in editor
            }
        }
    });
    
    // Example: Subscribe to events
    const unsubscribe = memoryAPI.subscribe((event) => {
        console.log(`Memory ${event.action}: ${event.key}`);
    });
    
    context.subscriptions.push(storeDecision, queryMemory, { dispose: unsubscribe });
}
```

---

## Use Cases

### 1. AI Code Assistant
Store coding patterns and architecture decisions automatically as the AI generates code.

### 2. Documentation Generator
Read memories to generate comprehensive project documentation.

### 3. Code Review Tool
Check if new code follows stored architectural patterns.

### 4. Onboarding Assistant
Query memories to help new developers understand the codebase.

### 5. Testing Framework
Store test patterns and retrieve them when generating new tests.

---

## Best Practices

1. **Use Meaningful Keys**: Use descriptive, hierarchical keys like `auth.oauth.implementation`
2. **Tag Appropriately**: Add relevant tags for better searchability
3. **Document Relationships**: Use `dependsOn` and `implements` to create a knowledge graph
4. **Set createdBy**: Identify your extension in metadata for analytics
5. **Handle Errors**: Always check for null returns from `read()` and `update()`
6. **Unsubscribe**: Clean up event subscriptions when no longer needed

---

## Support

- 📖 [Main Documentation](../README.md)
- 💬 [GitHub Discussions](https://github.com/webzler/agentMemory/discussions)
- 🐛 [Report Issues](https://github.com/webzler/agentMemory/issues)
- 📧 Email: amitrathiesh@webzler.com

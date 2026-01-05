# agentMemory API Guide

Complete API reference for integrating other VSCode extensions with agentMemory.

## Getting the API

```typescript
import * as vscode from 'vscode';

// Get the extension
const agentMemory = vscode.extensions.getExtension('webzler.agentmemory');

// Activate and get API
const api = await agentMemory.activate();
```

## API Methods

### write(key, content, options)

Store a new memory.

**Parameters:**
- `key` (string): Unique identifier
- `content` (string): Memory content (Markdown supported)
- `options` (MemoryOptions):
  - `type`: 'architecture' | 'pattern' | 'feature' | 'api' | 'bug' | 'decision'
  - `tags`: string[]
  - `relationships`: { dependsOn: string[], implements: string[] }
  - `metadata?`: { createdBy?: string }

**Returns:** `Promise<string>` - Memory ID

**Example:**
```typescript
const id = await api.write('oauth-implementation', '# OAuth 2.0\n\nUsing Passport.js...', {
  type: 'architecture',
  tags: ['auth', 'oauth', 'security'],
  relationships: {
    dependsOn: [],
    implements: []
  }
});
```

---

### read(key)

Retrieve a memory by key.

**Parameters:**
- `key` (string): Memory key

**Returns:** `Promise<Memory | null>`

**Example:**
```typescript
const memory = await api.read('oauth-implementation');
if (memory) {
  console.log(memory.content);
  console.log(memory.tags);
}
```

---

### search(options)

Search memories.

**Parameters:**
- `options` (SearchOptions):
  - `query?`: string - Full-text search
  - `tags?`: string[] - Filter by tags
  - `type?`: string - Filter by type
  - `limit?`: number - Max results (default: 50)

**Returns:** `Promise<Memory[]>`

**Examples:**
```typescript
// Full-text search
const results = await api.search({ query: 'authentication' });

// Filter by tags
const authMemories = await api.search({ tags: ['auth', 'security'] });

// Filter by type
const bugs = await api.search({ type: 'bug' });

// Combined search
const results = await api.search({
  query: 'API',
  tags: ['backend'],
  limit: 10
});
```

---

### list(options)

List all memories (optionally filtered by type).

**Parameters:**
- `options?` (ListOptions):
  - `type?`: string - Filter by type

**Returns:** `Promise<Memory[]>`

**Example:**
```typescript
// All memories
const all = await api.list();

// Architecture memories only
const architecture = await api.list({ type: 'architecture' });
```

---

### update(key, updates)

Update an existing memory.

**Parameters:**
- `key` (string): Memory key
- `updates` (Partial<Memory>):
  - `content?`: string
  - `tags?`: string[]
  - `relationships?`: { dependsOn?: string[], implements?: string[] }

**Returns:** `Promise<Memory | null>`

**Example:**
```typescript
const updated = await api.update('oauth-implementation', {
  content: '# OAuth 2.0 with PKCE\n\n...updated content',
  tags: ['auth', 'oauth', 'security', 'pkce']
});
```

---

### subscribe(callback)

Subscribe to memory change events.

**Parameters:**
- `callback` (MemoryEventCallback): `(event: MemoryEvent) => void`

**Returns:** `() => void` - Unsubscribe function

**Example:**
```typescript
const unsubscribe = api.subscribe(event => {
  console.log(`Memory ${event.action}: ${event.key}`);
  console.log(`By: ${event.extensionId}`);
});

// Later...
unsubscribe();
```

---

### getStats()

Get memory statistics.

**Returns:** `Promise<any>` - Statistics object

**Example:**
```typescript
const stats = await api.getStats();
console.log(`Total memories: ${stats.totalMemories}`);
console.log(`By type:`, stats.byType);
```

---

## Types

### Memory

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
  };
  createdAt: number;
  updatedAt: number;
}
```

### MemoryEvent

```typescript
interface MemoryEvent {
  action: 'write' | 'update' | 'delete';
  key: string;
  extensionId: string;
  timestamp: Date;
}
```

---

## Rate Limiting

All API methods are rate-limited (default: 100 requests/minute per extension).

When rate limit is exceeded, an error is thrown:
```
Rate limit exceeded for extension 'my-extension'. 
Limit: 100 requests per minute. 
Current: 100/100. 
Resets in 23 seconds.
```

Users can customize rate limits in settings:
```json
{
  "agentMemory.rateLimit.maxRequests": 200,
  "agentMemory.rateLimit.windowMs": 60000
}
```

---

## Best Practices

1. **Use descriptive keys**: `auth-oauth-implementation` not `mem1`
2. **Add relevant tags**: Helps with search and organization
3. **Set relationships**: Link related memories
4. **Handle errors**: Wrap API calls in try/catch
5. **Respect rate limits**: Batch operations when possible
6. **Use markdown**: Rich formatting in content

---

## Example: AI Agent Integration

```typescript
import * as vscode from 'vscode';

export class MyAIAgent {
  private memoryAPI: any;

  async initialize() {
    const ext = vscode.extensions.getExtension('webzler.agentmemory');
    if (ext) {
      this.memoryAPI = await ext.activate();
      
      // Subscribe to changes
      this.memoryAPI.subscribe(event => {
        this.onMemoryChanged(event);
      });
    }
  }

  async rememberDecision(key: string, decision: string, rationale: string) {
    const content = `# ${decision}\n\n${rationale}`;
    
    try {
      await this.memoryAPI.write(key, content, {
        type: 'decision',
        tags: ['ai-decision'],
        relationships: { dependsOn: [], implements: [] }
      });
    } catch (error) {
      console.error('Failed to store decision:', error);
    }
  }

  async recallContext(query: string) {
    try {
      const memories = await this.memoryAPI.search({ 
        query,
        limit: 5
      });
      
      return memories.map(m => m.content).join('\n\n---\n\n');
    } catch (error) {
      console.error('Failed to recall context:', error);
      return '';
    }
  }

  private onMemoryChanged(event: any) {
    console.log(`Memory ${event.action}: ${event.key}`);
    // Invalidate context cache, etc.
  }
}
```

---

## Support

- Report issues: [GitHub Issues](https://github.com/webzler/agentMemory/issues)
- API questions: [GitHub Discussions](https://github.com/webzler/agentMemory/discussions)

# Configuration Guide

Complete guide to configuring agentMemory.

## Access Settings

1. Press `Cmd+,` (or `Ctrl+,` on Windows/Linux)
2. Search for "agentMemory"
3. Modify settings

Or edit `settings.json` directly.

---

## Rate Limiting

Control API request limits per extension.

### agentMemory.rateLimit.maxRequests

**Type:** number  
**Default:** 100  
**Range:** 10 - 1000

Maximum number of API requests allowed per minute per extension.

```json
{
  "agentMemory.rateLimit.maxRequests": 200
}
```

### agentMemory.rateLimit.windowMs

**Type:** number  
**Default:** 60000 (1 minute)  
**Range:** 1000 - 600000 (1 second - 10 minutes)

Time window for rate limiting in milliseconds.

```json
{
  "agentMemory.rateLimit.windowMs": 120000  // 2 minutes
}
```

---

## Conflict Resolution

Handle conflicts when same memory is modified in both MCP storage and markdown files.

### agentMemory.conflictResolution.strategy

**Type:** enum  
**Default:** "newest-wins"  
**Options:**
- `newest-wins` - Use memory with most recent timestamp
- `mcp-wins` - Always prefer MCP storage version
- `markdown-wins` - Always prefer markdown file version

```json
{
  "agentMemory.conflictResolution.strategy": "newest-wins"
}
```

**When to use each:**
- **newest-wins**: Recommended for most users (default)
- **mcp-wins**: When AI agents are primary source of truth
- **markdown-wins**: When manually editing markdown files frequently

---

## Auto-Sync

Control automatic synchronization of markdown files.

### agentMemory.sync.autoSync

**Type:** boolean  
**Default:** true

Automatically sync markdown file changes to MCP storage.

```json
{
  "agentMemory.sync.autoSync": false  // Disable auto-sync
}
```

**When to disable:**
- Working on large markdown files
- Batch editing multiple memory files
- Debugging sync issues

---

## Cache Configuration

Optimize memory caching for performance.

### agentMemory.cache.ttl

**Type:** number  
**Default:** 3600000 (1 hour)  
**Range:** 1000 - 86400000 (1 second - 24 hours)

Cache Time-To-Live in milliseconds.

```json
{
  "agentMemory.cache.ttl": 7200000  // 2 hours
}
```

**Recommendations:**
- **Short TTL (1 hour)**: Frequently changing memories
- **Long TTL (4-8 hours)**: Stable project documentation
- **Very long (24 hours)**: Archival/reference projects

### agentMemory.cache.maxSize

**Type:** number  
**Default:** 10000  
**Range:** 100 - 100000

Maximum number of cached memory entries.

```json
{
  "agentMemory.cache.maxSize": 20000
}
```

**Recommendations:**
- **Small (1000-5000)**: Limited memory, small projects
- **Medium (10000)**: Default, most projects
- **Large (20000+)**: Large projects, ample memory

---

## Dashboard

Configure the dashboard HTTP server.

### agentMemory.dashboard.port

**Type:** number  
**Default:** 3333  
**Range:** 1024 - 65535

Port number for the dashboard HTTP server.

```json
{
  "agentMemory.dashboard.port": 4000
}
```

**Note:** Requires restart to take effect.

---

## Example Configurations

### High-Performance Setup

For large projects with many AI agent interactions:

```json
{
  "agentMemory.rateLimit.maxRequests": 500,
  "agentMemory.rateLimit.windowMs": 60000,
  "agentMemory.cache.ttl": 7200000,
  "agentMemory.cache.maxSize": 50000,
  "agentMemory.sync.autoSync": true
}
```

### Manual Editing Workflow

For users who frequently edit markdown files manually:

```json
{
  "agentMemory.conflictResolution.strategy": "markdown-wins",
  "agentMemory.sync.autoSync": true,
  "agentMemory.cache.ttl": 1800000  // 30 minutes
}
```

### Conservative Setup

For shared workspaces or limited resources:

```json
{
  "agentMemory.rateLimit.maxRequests": 50,
  "agentMemory.cache.ttl": 3600000,
  "agentMemory.cache.maxSize": 5000,
  "agentMemory.sync.autoSync": true
}
```

---

## Workspace vs User Settings

**User Settings** (global):
```json
// ~/.config/Code/User/settings.json
{
  "agentMemory.cache.maxSize": 10000
}
```

**Workspace Settings** (project-specific):
```json
// .vscode/settings.json
{
  "agentMemory.rateLimit.maxRequests": 200,
  "agentMemory.conflictResolution.strategy": "mcp-wins"
}
```

Workspace settings override user settings.

---

## Validation

All settings are validated with warnings for invalid values:

- Rate limits: Auto-corrected to valid range
- Cache values: Defaulted if out of range
- Conflict strategy: Falls back to "newest-wins"
- Port numbers: Must be 1024-65535

Invalid settings show a warning notification with the corrected value.

---

## Performance Tips

1. **Adjust cache TTL** based on memory change frequency
2. **Increase maxRequests** if hitting rate limits frequently
3. **Reduce cache.maxSize** if memory usage is high
4. **Use workspace settings** for project-specific optimizations
5. **Monitor dashboard** for memory statistics

---

## Troubleshooting

**Rate limit errors?**
- Increase `maxRequests` or `windowMs`
- Check which extension is making requests

**Slow searches?**
- Increase `cache.maxSize`
- Reduce `cache.ttl` to refresh stale data

**Conflicts not resolving?**
- Check `conflictResolution.strategy`
- View conflict logs in Output panel

**Sync not working?**
- Verify `sync.autoSync` is enabled
- Check file permissions on markdown files

---

For more help, see [Troubleshooting Guide](TROUBLESHOOTING.md).

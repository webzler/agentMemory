# Dashboard Debugging Guide

## Issue: Dashboard Shows All Zeros

The dashboard currently shows zeros because it's not connected to the actual storage layer yet.

## Current State

**File:** `src/dashboard.ts` (line 83-114)

The `getAnalyticsData()` method has a TODO and returns hardcoded zeros:

```typescript
private async getAnalyticsData() {
    // TODO: Query actual MCP server for real data
    return {
        overview: {
            totalMemories: 0,  // ← Hardcoded
            // ...
        }
    };
}
```

## Why This Happens

The dashboard needs to:
1. ✅ Render UI (WORKS)
2. ✅ Handle user interactions (WORKS)
3. ❌ **Connect to storage layer** (NOT IMPLEMENTED)

## Quick Debug Steps

### 1. Check if MCP Data Directory Exists

```bash
# From your workspace root
ls -la ./mcp-data/
```

**Expected:** Should see a folder named after your project

**If missing:** MCP server isn't creating the directory

### 2. Check MCP Server Process

```bash
# Check if MCP server is running
ps aux | grep "mcp-server"
```

**Expected:** Should see a node process

**If missing:** Extension isn't starting the MCP server

### 3. Check Extension Output

1. Open Output panel (View → Output)
2. Select "agentMemory" from dropdown
3. Look for:
   - ✅ "agentMemory extension is now active"
   - ✅ "Starting MCP server for project: ..."
   - ✅ "Agent configuration complete"

### 4. Check MCP Server Output

In Output panel, look for:
   - MCP Server logs
   - Error messages from stdio

### 5. Test Storage Manually (Developer Console)

Open Developer Tools (Help → Toggle Developer Tools):

```javascript
// Check if memory directory exists
const fs = require('fs');
const path = require('path');

const workspacePath = '/path/to/your/workspace';
const mcpDataPath = path.join(workspacePath, 'mcp-data');

console.log('MCP Data exists:', fs.existsSync(mcpDataPath));
console.log('Contents:', fs.readdirSync(mcpDataPath));
```

## Solutions

### Option 1: Connect Dashboard to Storage (RECOMMENDED)

We need to modify `dashboard.ts` to query the actual storage layer.

**Required changes:**
1. Import storage module
2. Query `./mcp-data/{projectId}/` directory
3. Read memory files
4. Calculate statistics

### Option 2: Test with Mock Memories

Manually create test memories to verify MCP server works:

```bash
# Create test memory directory
mkdir -p ./mcp-data/agentMemory

# Create test memory file (would normally be created by MCP server)
echo '{"id":"test-1","key":"test","type":"feature","content":"Test memory"}' > ./mcp-data/agentMemory/test-1.json
```

### Option 3: Debug MCP Server Startup

Check if MCP server is actually starting:

1. Add logging to `extension.ts` in `startMCPServer()`
2. Verify server.js exists in `out/mcp-server/server.js`
3. Check node process arguments

## Next Steps

1. **Confirm MCP server starts** (check Output panel)
2. **Verify ./mcp-data/ directory exists**  
3. **Connect dashboard to storage** (code update needed)
4. **Test with real agent** (use KiloCode to create memories)

---

## Known Limitations

- Dashboard currently shows mock data (TODO on line 87)
- No connection between dashboard and storage layer
- MCP server might not be storing data even if it starts

The extension is **functional but incomplete** for the dashboard feature specifically.

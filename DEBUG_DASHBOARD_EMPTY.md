# Dashboard Not Updating - Debug Checklist

## Step 1: Check Browser Console (http://localhost:3333)

Open browser DevTools (F12) and check Console tab for:

### Expected Logs:
```
[Dashboard] Fetching data...
[Dashboard] Data: { overview: { totalMemories: 6, ... } }
```

### Common Errors:
- ❌ `Failed to fetch` → Server not running
- ❌ `CORS error` → Check server CORS headers
- ❌ `Data: { overview: { totalMemories: 0 } }` → No memory files found

## Step 2: Verify Test Data Exists

```bash
# Check if test memory files exist
ls -la ./mcp-data/agentMemory/

# Should see 6 .json files
# Example: 123e4567-e89b-12d3-a456-426614174000.json
```

**If no files:** Run `node test-dashboard.js` again

## Step 3: Check API Response Directly

In browser, open new tab:
```
http://localhost:3333/api/analytics
```

**Expected:** JSON with `totalMemories: 6`

**If you see `totalMemories: 0`:**
- Dashboard is working, but can't find memory files
- Path mismatch issue

## Step 4: Verify Workspace Path

In browser console:
```javascript
// This will show in the response
fetch('http://localhost:3333/api/analytics')
  .then(r => r.json())
  .then(data => console.log('Data:', data));
```

Check the VS Code Output panel for:
```
[DashboardServer] Reading from: /Users/amitrathiesh/Projects/agentMemory/mcp-data/agentMemory
```

## Step 5: Check KiloCode MCP Integration

KiloCode needs to actually USE the MCP server to write memories.

### Verify MCP Config:
```bash
cat .vscode/settings.json
```

Should contain:
```json
{
  "kilocode.mcpServers": {
    "memory-bank": {
      "url": "unix:///tmp/mcp-memory-agentMemory.sock"
    }
  }
}
```

### Check if MCP Server is Running:
```bash
# Check for MCP server process
ps aux | grep "mcp-server"
```

**Expected:** Should see a node process

## Step 6: Test Manual Memory Creation

Create a memory manually to test the flow:

```bash
# Create a new test memory
cat > ./mcp-data/agentMemory/test-$(date +%s).json << 'EOF'
{
  "id": "test-123",
  "projectId": "agentMemory",
  "key": "manual-test",
  "type": "feature",
  "content": "Manual test memory",
  "tags": ["test"],
  "relationships": { "dependsOn": [], "implements": [] },
  "metadata": { "accessCount": 1, "createdBy": "manual" },
  "createdAt": 1735416000000,
  "updatedAt": 1735416000000
}
EOF
```

Then refresh dashboard at http://localhost:3333 → Should see 7 memories

## Step 7: KiloCode Memory Writing

To verify KiloCode is writing to agentMemory:

1. **Ask KiloCode to write a memory:**
   ```
   "Please use the memory_write tool to save this: 
   Key: test-from-kilocode
   Content: Testing agentMemory integration
   Type: feature"
   ```

2. **Check if file was created:**
   ```bash
   ls -lt ./mcp-data/agentMemory/ | head
   ```

3. **Check MCP server logs** (VS Code Output → agentMemory)

## Step 8: Network Tab Check

In browser DevTools, Network tab:
1. Click 🔄 Refresh button on dashboard
2. Look for request to `/api/analytics`
3. Check response preview → Should show JSON data

**If response is empty or has totalMemories: 0:**
- Server can't read files
- Path issue
- Permissions issue

## Quick Test: Hardcoded Response

To verify dashboard rendering works, temporarily edit `dashboard-server.ts`:

```typescript
// In getEmptyData(), change to:
return {
    overview: { totalMemories: 99, ... }, // ← Change to 99
    // ...
}
```

Reload dashboard → Should show 99 (proves rendering works)

## Most Likely Issues:

1. **Path Mismatch:** 
   - Server looking in wrong directory
   - Workspace folder name doesn't match

2. **No Memory Files:**
   - Test script didn't run
   - Files in wrong location

3. **MCP Server Not Running:**
   - Extension didn't start server
   - Check VS Code Output panel

4. **KiloCode Not Using MCP:**
   - MCP tools not available to KiloCode
   - Settings not applied

---

## What to Share for Debugging:

1. Browser console output
2. Output from: `ls ./mcp-data/agentMemory/`
3. Response from: `http://localhost:3333/api/analytics`
4. VS Code Output panel (agentMemory section)

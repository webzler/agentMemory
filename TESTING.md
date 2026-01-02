# agentMemory Testing Guide

## Prerequisites

✅ Project compiled successfully  
✅ All dependencies installed  

## Testing Steps

### 1. Launch Extension Development Host

**In VS Code:**
1. Open the `agentMemory` project folder
2. Press **F5** (or Run → Start Debugging)
3. A new VS Code window will open labeled **[Extension Development Host]**

### 2. Verify Extension Activation

**Check Status Bar:**
- Look for `🧠 Memory: Initializing...` in the bottom-right status bar
- After a few seconds, it should change to `🧠 Memory: Active`

**Check Output:**
- Open Output panel (View → Output)
- Select "agentMemory" from the dropdown
- Verify you see activation logs

### 3. Test Dashboard

**Open Dashboard:**
1. Press `Cmd/Ctrl+Shift+P` to open Command Palette
2. Type "agentMemory: Open Memory Dashboard"
3. Press Enter

**Expected Result:**
- Webview panel opens with dashboard
- Shows overview cards (all zeros initially)
- Charts render correctly (Agent Activity, Memory Types, Token Metrics)
- No console errors

**Test Refresh:**
- Click the "🔄 Refresh" button
- Dashboard should update without errors

### 4. Test Auto-Configuration

**Check Settings File:**
1. In Extension Development Host, check if `.vscode/settings.json` was created
2. Should contain MCP server configuration for detected agents

**Check Rule Files:**
- `.clinerules` (if Cline is installed)
- `.roomodes` (if RooCode is installed)
- `.kilocode/config.yaml` (if KiloCode is installed)

### 5. Test Extension API (Optional)

**Create a test file** `test-api.js`:

```javascript
const vscode = require('vscode');

async function testAPI() {
    const agentMemory = vscode.extensions.getExtension('webzler.agentmemory');
    
    if (!agentMemory) {
        console.error('Extension not found');
        return;
    }
    
    const api = await agentMemory.activate();
    console.log('API activated:', api);
    
    // Try to write a test memory
    try {
        await api.write('test-key', 'Test content', {
            type: 'feature',
            tags: ['test']
        });
        console.log('✅ Write successful');
    } catch (error) {
        console.error('❌ Write failed:', error.message);
    }
}

testAPI();
```

### 6. Test MCP Server

**Check MCP Server Process:**
- Open Task Manager/Activity Monitor
- Look for a `node` process running the MCP server
- Should be running with the project ID as an argument

**Check MCP Data Directory:**
- Navigate to `./mcp-data/` in your workspace
- Should see a folder named after your project
- Contains memory data files

### 7. Test Security System

**Permission Prompts:**
- The permission system won't trigger unless another extension tries to access memory
- For manual testing, you can check the SecurityManager is initialized

**Check Audit Logs (Developer Console):**
1. Open Developer Tools in Extension Development Host
2. Help → Toggle Developer Tools
3. Check Console for security-related logs

---

## Common Issues & Solutions

### Issue: "Extension failed to activate"

**Solution:**
- Check Terminal for compilation errors
- Run `npm run compile` again
- Check for missing dependencies: `npm install`

### Issue: "MCP Server not starting"

**Solution:**
- Check if `out/mcp-server/server.js` exists
- Verify Node.js is in PATH
- Check Extension Host output for error messages

### Issue: "Dashboard shows blank screen"

**Solution:**
- Check browser console for JavaScript errors
- Verify Chart.js CDN is accessible
- Check webview content security policy

### Issue: "Status bar stuck on 'Initializing'"

**Solution:**
- Check if workspace folder is open
- Verify file system permissions
- Check Extension Host output for errors

---

## Manual Test Checklist

- [ ] Extension activates without errors
- [ ] Status bar shows "Memory: Active"
- [ ] Dashboard opens and displays correctly
- [ ] Dashboard charts render (even with zero data)
- [ ] Refresh button works
- [ ] `.vscode/settings.json` is created
- [ ] Rule files are created (if agents detected)
- [ ] MCP server process starts
- [ ] `./mcp-data/` directory is created
- [ ] No console errors in Developer Tools

---

## Next Steps After Testing

1. **If everything works:**
   - Initialize git: `git init`
   - Create `.gitignore` (already exists)
   - Commit: `git add . && git commit -m "Initial commit"`
   - Add remote: `git remote add origin https://github.com/webzler/agentMemory.git`
   - Push: `git push -u origin main`

2. **If issues found:**
   - Note the error messages
   - Check the specific component that failed
   - Debug and fix before publishing

3. **Package extension:**
   - Run: `npm run package`
   - Creates `agentmemory-0.1.0.vsix`
   - Test install: `code --install-extension agentmemory-0.1.0.vsix`

---

## Quick Start Command

```bash
# From the agentMemory directory
code .
# Then press F5 in VS Code
```

Good luck with testing! 🚀

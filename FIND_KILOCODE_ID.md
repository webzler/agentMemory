# Finding KiloCode Extension ID

## Current Problem
The extension is creating `.clinerules` (Cline detected ✅) but NOT creating `.kilocode/` (KiloCode not detected ❌).

This means the extension ID we're checking is wrong.

## How to Find the Correct Extension ID

### Method 1: VS Code Developer Tools

1. **Open Developer Tools:**
   - Help → Toggle Developer Tools

2. **Run this in Console:**
   ```javascript
   // Find all extensions with "kilo" in the name
   vscode.extensions.all
     .filter(e => e.id.toLowerCase().includes('kilo'))
     .map(e => ({
       id: e.id,
       name: e.packageJSON.displayName || e.packageJSON.name
     }))
   ```

3. **Copy the exact ID** (e.g., `kiloco.kilocode` or `KiloCo.kilocode`)

### Method 2: Check Extensions Panel

1. Open Extensions panel (Cmd+Shift+X)
2. Find "Kilo Code AI Agent"
3. Click the gear icon → "Extension Settings"
4. URL will show: `vscode:extension/[EXTENSION_ID]`

### Method 3: Check Extensions Folder

```bash
# List all installed extensions
ls ~/.vscode/extensions/ | grep -i kilo

# Example output might be:
# kiloco.kilocode-1.0.0
# The ID is: kiloco.kilocode
```

## Current Extension IDs We're Checking

In our code (`interceptor.ts` and `config.ts`):
```typescript
'kilocode': 'KiloCo.kilocode'  // ← This might be wrong
```

Common possibilities:
- `KiloCo.kilocode`
- `kiloco.kilocode`
- `kilocode.kilocode`
- `kilo-code.kilocode`

## Once You Find It

Share the exact extension ID with me and I'll update:
1. `src/interceptor.ts` (line 50)
2. `src/config.ts` (line 75)

Then we'll recompile and the `.kilocode/rules/` folder will be created! 🎯

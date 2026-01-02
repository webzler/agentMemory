# agentMemory Security Model

## Overview

agentMemory implements a **multi-layered security system** to protect memory data from unauthorized access by third-party extensions.

---

## Security Layers

### 1. **Namespace Isolation** (Default)

**Rule:** Extensions can **only access** memories they created.

```typescript
// Extension A creates a memory
await api.write('my-secret', 'sensitive data', {
    type: 'feature',
    metadata: { createdBy: 'extension-a' }
});

// Extension B tries to read it
const memory = await api.read('my-secret'); 
// ❌ Throws: "Permission denied: Extension does not have permission to access other extensions' memories"
```

**How it works:**
- Every memory tracks `createdBy` (extension ID)
- API checks ownership before allowing read/write
- Cross-extension access is **denied by default**

---

### 2. **Permission System** (User Consent)

If an extension needs cross-extension access, it must request user permission.

**Permission Scopes:**
- `own` - Own memories only (default)
- `read` - Read all memories
- `write` - Write/update all memories
- `full` - Full access (read, write, update, delete)

**Example:**
```typescript
// Extension requests permission
const api = await agentMemoryExt.activate();

// First cross-extension access triggers permission prompt
try {
    const memory = await api.read('other-extension-key');
} catch (error) {
    // User sees: "Extension 'my-ext' is requesting permission to read memories created by other extensions. Allow?"
    //delete Options: [Allow] [Allow (This Session Only)] [Deny]
}
```

---

### 3. **Audit Logging** (Transparency)

All access attempts are logged with:
- Timestamp
- Extension ID
- Action (read/write/update/delete)
- Memory key
- Allowed/Denied
- Reason (if denied)

**View audit logs:**
```typescript
const logs = securityManager.getAuditLogs(100);

// Example log:
// {
//   timestamp: 1703784000000,
//   extensionId: 'suspicious-extension',
//   action: 'read',
//   memoryKey: 'oauth-secret',
//   allowed: false,
//   reason: 'Extension does not have permission to access other extensions\' memories'
// }
```

---

## Permission Management

### Grant Permission

When an extension tries to access cross-extension data, user sees a **modal prompt**:

```
Extension "code-analyzer-pro" is requesting permission to read memories created by other extensions. Allow?

[Allow]  [Allow (This Session Only)]  [Deny]
```

- **Allow**: Permanent (saved to disk)
- **Allow (This Session Only)**: Temporary (lost on reload)
- **Deny**: Blocked

### Revoke Permission

Users can revoke permissions via command:

```
Cmd/Ctrl+Shift+P → "agentMemory: Manage Permissions"
→ Select extension → [Revoke Permission]
```

---

## Security Best Practices

### For Extension Developers

1. **Use Descriptive Extension IDs**
   ```typescript
   // Good: Users can identify your extension
   metadata: { createdBy: 'my-company.my-extension-name' }
   
   // Bad: Generic
   metadata: { createdBy: 'extension' }
   ```

2. **Request Minimal Permissions**
   ```typescript
   // Good: Only request 'read' if you don't need to write
   // Bad: Always requesting 'full' access
   ```

3. **Use `onlyOwn` Flag for Private Queries**
   ```typescript
   // Only search your own memories
   const results = await api.search({
       query: 'secret',
       onlyOwn: true  // ✅ Skips permission check
   });
   ```

4. **Handle Permission Errors Gracefully**
   ```typescript
   try {
       const memory = await api.read(key);
   } catch (error) {
       if (error.message.includes('Permission denied')) {
           vscode.window.showWarningMessage('Need permission to access memory bank');
       }
   }
   ```

### For Users

1. **Review Permission Requests Carefully**
   - Only grant to trusted extensions
   - Prefer "This Session Only" for testing

2. **Check Audit Logs Periodically**
   ```
   Command: "agentMemory: View Audit Logs"
   ```
   Look for suspicious patterns (e.g., many denied attempts)

3. **Revoke Unused Permissions**
   - Remove permissions for uninstalled extensions
   - Review quarterly

---

## Attack Scenarios Prevented

### ❌ Scenario 1: Malicious Extension Stealing Secrets

```typescript
// Malicious extension tries to steal API keys
const secrets = await api.search({ query: 'api-key' });
// ❌ BLOCKED: Returns only memories created by malicious-ext (likely zero)
```

### ❌ Scenario 2: Data Leakage via Search

```typescript
// Malicious extension searches for all architecture
const arch = await api.search({ type: 'architecture' });
// ❌ BLOCKED: Security filter removes memories from other extensions
```

### ❌ Scenario 3: Unauthorized Modification

```typescript
// Malicious extension tries to modify Cline's memory
await api.update('cline-oauth-config', { content: 'hacked' });
// ❌ BLOCKED: "Permission denied: Extension only has permission to access its own memories"
```

---

## Implementation Details

### Security Manager Architecture

```
┌─────────────────────────────────────────┐
│         MemoryAPI (Public)              │
│  - write() → Security Check             │
│  - read()  → Security Check             │
│  - search()→ Security Filter            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      SecurityManager (Internal)         │
│  - checkPermission(ext, action, key)    │
│  - requestPermission(ext, scope)        │
│  - Audit logging                        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│     Permissions Storage (Disk)          │
│  ~/.vscode/extensions/.../security.json │
└─────────────────────────────────────────┘
```

### Permission Storage Format

```json
[
  {
    "extensionId": "trusted-extension.id",
    "scope": "read",
    "grantedAt": 1703784000000,
    "grantedBy": "user"
  }
]
```

---

## Compliance

### GDPR Compliance

- ✅ Users control who accesses their data (consent)
- ✅ Audit logs provide transparency
- ✅ Permissions can be revoked (right to be forgotten)
- ✅ Data stays local (no cloud transfer)

### Enterprise Security

- ✅ Namespace isolation prevents data leakage
- ✅ Audit logs for compliance reporting
- ✅ No network access (MCP is local only)

---

## FAQs

**Q: Can I disable the permission system?**  
A: No. Namespace isolation is always enforced. This protects user data.

**Q: What if I trust all my extensions?**  
A: Grant `full` permission when prompted. It will be remembered.

**Q: Can extensions bypass the security?**  
A: No. The SecurityManager sits between the API and storage. All access goes through permission checks.

**Q: Are permissions shared across workspaces?**  
A: Yes. Permissions are global (tied to extension ID, not workspace).

**Q: What data is in audit logs?**  
A: Extension ID, action, memory key, timestamp, allowed/denied. **Not** memory content.

---

## Future Enhancements

- [ ] Admin panel in dashboard to view/manage permissions
- [ ] Export audit logs (CSV/JSON)
- [ ] Permission presets ("trusted", "minimal", "locked-down")
- [ ] Rate limiting (prevent brute-force memory enumeration)
- [ ] Encrypted memory storage (optional)

---

## Support

If you discover a security vulnerability:
1. **DO NOT** open a public GitHub issue
2. Email: amitrathiesh@webzler.com
3. We'll respond within 48 hours

For permission questions:
- 📖 [API Documentation](./API.md)
- 🐙 [GitHub Discussions](https://github.com/webzler/agentMemory/discussions)

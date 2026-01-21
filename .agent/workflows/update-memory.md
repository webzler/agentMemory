---
description: How to update the project memory bank with new findings
---

# Update Memory Bank

Follow this workflow to document important architectural decisions, patterns, or features.

1. **Search First**: Check if a similar memory already exists.
   ```bash
   # Use the memory_search tool
   memory_search({ "query": "<topic>" })
   ```

2. **Decide Action**:
   - If it's **new**, use `memory_write`.
   - If it **exists** but needs updates, use `memory_update` (or `memory_write` with the same key to overwrite).

3. **Write Memory**:
   Use the `memory_write` tool. Ensure you provide meaningful tags.
   - `type`: Choose one of `architecture`, `pattern`, `decision`, `feature`.
   - `key`: A unique, kebab-case identifier (e.g., `auth-flow-v2`).
   
   Example:
   ```javascript
   memory_write({
     "key": "feature-x-impl",
     "type": "feature",
     "content": "# Feature X\n\nImplementation details...",
     "tags": ["frontend", "react"]
   })
   ```

4. **Verify**: Run `memory_stats` to confirm the total memory count increased or changed as expected.

# Development Roadmap - agentMemory v0.2.0

> **Branch**: development  
> **Target Version**: 0.2.0  
> **Timeline**: 2-3 weeks  
> **Status**: In Progress 🚧

---

## Phase 1: Critical Fixes (Week 1)

### 1. Fix API MCP Communication ⚠️ CRITICAL
- [ ] Remove TODO in `src/api.ts:303`
- [ ] Implement actual MCP server communication
- [ ] Add error handling for connection failures
- [ ] Test with real extension calling the API
- **Files**: `src/api.ts`
- **Priority**: P0

### 2. Fix Dashboard Real Data ⚠️ CRITICAL
- [ ] Implement `getAnalyticsData()` to query MCP server
- [ ] Remove mock data from dashboard
- [ ] Add real-time updates when memories change
- [ ] Test with actual memory operations
- **Files**: `src/dashboard.ts`, `src/dashboard-server.ts`
- **Priority**: P0

### 3. Add Input Validation ⚠️ CRITICAL
- [ ] Add schema validation library (Zod or Joi)
- [ ] Validate memory objects in `StorageManager.write()`
- [ ] Add validation to all MCP tool inputs
- [ ] Add proper error messages for invalid data
- **Files**: `src/mcp-server/storage.ts`, `src/mcp-server/tools.ts`
- **Priority**: P0

### 4. Set Up Testing Framework 🧪
- [ ] Install Jest and related dependencies
- [ ] Create test directory structure
- [ ] Write unit tests for `StorageManager`
- [ ] Write unit tests for `CacheManager`
- [ ] Write unit tests for MCP tools
- [ ] Set up test coverage reporting
- **Files**: `tests/unit/*.test.ts`, `package.json`, `jest.config.js`
- **Priority**: P0

---

## Phase 2: Core Features (Week 2-3)

### 5. Implement File Watching
- [ ] Install chokidar dependency
- [ ] Implement `startWatching()` in `MemoryBankSync`
- [ ] Add file change handlers
- [ ] Test auto-sync on markdown changes
- **Files**: `src/mcp-server/memory-bank-sync.ts`
- **Priority**: P1

### 6. Add Conflict Resolution
- [ ] Design conflict resolution strategies
- [ ] Implement timestamp-based resolution
- [ ] Add manual conflict resolution UI
- [ ] Log conflicts for audit
- **Files**: `src/mcp-server/memory-bank-sync.ts`
- **Priority**: P1

### 7. Implement Rate Limiting
- [ ] Create `RateLimiter` class
- [ ] Add rate limit checks to API methods
- [ ] Configure sensible limits (100 req/min)
- [ ] Add rate limit exceeded errors
- **Files**: `src/security.ts`
- **Priority**: P1

### 8. Add Integration Tests
- [ ] Test full flow: Agent → MCP → Storage → Sync
- [ ] Test multi-agent scenarios
- [ ] Test dashboard data accuracy
- [ ] Test error recovery
- **Files**: `tests/integration/*.test.ts`
- **Priority**: P1

---

## Phase 3: Polish (Week 4)

### 9. Create Marketplace Assets
- [ ] Design extension icon (128x128)
- [ ] Take dashboard screenshots
- [ ] Take memory sync screenshots
- [ ] Record demo GIF/video (30 seconds)
- [ ] Create marketing banner
- **Files**: `docs/marketplace/*`
- **Priority**: P2

### 10. Write CHANGELOG.md
- [ ] Document v0.1.0 initial release
- [ ] Plan v0.2.0 improvements
- [ ] Follow Keep a Changelog format
- **Files**: `CHANGELOG.md`
- **Priority**: P2

### 11. Add Telemetry (Opt-in)
- [ ] Create `TelemetryManager` class
- [ ] Add telemetry events for key actions
- [ ] Add user preference for telemetry
- [ ] Log to local file only (privacy-first)
- **Files**: `src/telemetry.ts`
- **Priority**: P2

### 12. Improve TypeScript Strictness
- [ ] Enable strict mode in `tsconfig.json`
- [ ] Fix all type errors
- [ ] Add missing return types
- [ ] Remove any `any` types
- **Files**: `tsconfig.json`, all `.ts` files
- **Priority**: P2

---

## Phase 4: Enhancements (Post-Launch)

### 13. Vector Search
- [ ] Research embedding options (local vs API)
- [ ] Implement embedding generation
- [ ] Add semantic search functionality
- [ ] Update search UI to show similarity scores

### 14. Export/Import
- [ ] Add export command
- [ ] Add import command
- [ ] Support JSON and markdown formats
- [ ] Add bulk operations

### 15. Memory Templates
- [ ] Create template library
- [ ] Add command to create from template
- [ ] Add template variables
- [ ] Allow custom templates

### 16. Separate MCP Server Package
- [ ] Create monorepo structure
- [ ] Publish `@agentmemory/server` to npm
- [ ] Update extension to use published package
- [ ] Add standalone CLI

---

## Testing Checklist

Before merging to main:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing in Extension Development Host
- [ ] Test with real Cline/RooCode/KiloCode
- [ ] No console errors in dashboard
- [ ] MCP server starts without errors
- [ ] File sync works bidirectionally
- [ ] Security permissions work correctly
- [ ] Performance benchmarks met (<100ms searches)

---

## Version Targets

- **v0.1.0** (Current): Initial release with core features
- **v0.2.0** (Phase 1-3): Critical fixes + testing + polish
- **v0.3.0** (Phase 4): Enhanced features + vector search
- **v1.0.0** (Stable): Production-ready, marketplace launch

---

## Notes

- Use feature branches for each major change
- Keep commits atomic and well-documented
- Update this roadmap as priorities change
- Tag releases with semantic versioning

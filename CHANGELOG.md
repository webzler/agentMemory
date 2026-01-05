# Changelog

All notable changes to the "agentMemory" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-05

### Added
- **VSCode Commands**: 5 new command palette commands for memory management
  - Search Memories (`Cmd+Shift+M`) with QuickPick UI and live preview
  - View All Memories with filtering options
  - View by Type (6 memory types: architecture, pattern, feature, api, bug, decision)
  - Clear Cache with confirmation dialog
  - Open Dashboard in browser
- **Configuration Options**: 7 customizable settings
  - Rate limiting (maxRequests, windowMs)
  - Conflict resolution strategy (newest-wins, mcp-wins, markdown-wins)
  - Auto-sync toggle for markdown files
  - Cache TTL and max size
  - Dashboard port number
- **Dashboard Enhancements**:
  - Real-time search with debouncing (300ms)
  - Type filter dropdown
  - Export to JSON and Markdown
  - Auto-refresh every 30 seconds
  - Enhanced UI with search bar and filter controls
- **Configuration Management**: ConfigManager class with validation and change notifications
- **Comprehensive Documentation**:
  - Enhanced README with features, quick start, and usage examples
  - API Guide with complete method reference and integration examples
  - Configuration Guide with recommendations and troubleshooting

### Fixed
- **API ↔ MCP Communication**: Implemented actual MCP server communication via stdio (replaced TODO)
- **Dashboard Real Data**: Dashboard now displays actual memory data from `.agentMemory/data.json`
- **Input Validation**: Added Zod schemas for all memory objects and MCP tool parameters
- **File Watching**: Implemented robust chokidar-based file watching with debouncing
- **Conflict Resolution**: Added timestamp-based conflict resolution with 3 strategies
- **Rate Limiting**: Sliding window rate limiter prevents API abuse

### Improved
- **Testing Coverage**: 35 automated tests (100% passing)
  - 13 unit tests (StorageManager, CacheManager)
  - 22 integration tests (Full-flow, Rate limiting, Concurrent operations)
- **Type Safety**: Complete TypeScript type coverage with Zod runtime validation
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Performance**: Search queries < 100ms, cache hits < 10ms

### Technical Details
- Dependencies: Added `chokidar` for file watching, `zod` for validation, `jest` for testing
- Test Framework: Jest with ts-jest, 35 tests covering all major functionality
- Code Quality: ~1,400 lines of new code with full documentation

## [0.1.0] - Initial Release

### Added
- Basic MCP server implementation
- Memory storage with JSON persistence
- LRU caching system
- Dashboard webview with analytics
- Memory bank sync for Cline, RooCode, KiloCode
- Public API for extension integration
- Security manager with permissions

---

## Unreleased

### Planned for v0.3.0
- Vector search with semantic similarity
- Export/Import commands for bulk operations
- Memory templates library
- Standalone MCP server package

[0.2.0]: https://github.com/webzler/agentMemory/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/webzler/agentMemory/releases/tag/v0.1.0

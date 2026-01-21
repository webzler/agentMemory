# Contributing to agentMemory

Thank you for your interest in contributing to agentMemory! We welcome contributions from the community to help make AI memory banks better for everyone.

## 🌟 How to Contribute

### Reporting Bugs
If you find a bug, please create a new issue and include:
- A clear description of the problem
- Steps to reproduce
- Which agent you were using (Cline, RooCode, KiloCode, or Antigravity)
- Relevant logs from the Output channel

### Suggesting Features
Have an idea? We'd love to hear it! Open an issue with the `enhancement` label and describe your proposal.

## 🛠️ Development Setup

agentMemory is a hybrid project (VS Code Extension + Antigravity Skill).

### Prerequisites
- Node.js (v18+)
- VS Code

### Setup Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/webzler/agentMemory.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile the project:
   ```bash
   npm run compile
   ```

### Debugging

#### As a VS Code Extension
1. Open the project in VS Code.
2. Press `F5` to launch the Extension Development Host.

#### As an Antigravity Skill (MCP Server)
1. Run the server standalone:
   ```bash
   npm run start-server test-project-id /path/to/test-workspace
   ```
2. You can verify it is listening on stdio or the unix socket.

## 🧪 Testing

Run the test suite:
```bash
npm run test
```

## 📝 Style Guide

- **TypeScript**: We use strict typing. Please ensure no `any` types unless absolutely necessary.
- **Commits**: Use conventional commits (e.g., `feat: add memory type`, `fix: sync race condition`).
- **Formatting**: We use standard VS Code formatting rules.

## ⚖️ License

By contributing, you agree that your contributions will be licensed under its MIT License.

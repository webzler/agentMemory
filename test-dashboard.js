#!/usr/bin/env node

/**
 * Test script to create sample memories for dashboard testing
 * Run: node test-dashboard.js
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

async function createTestMemories() {
    const workspacePath = process.cwd();
    const agentMemoryPath = path.join(workspacePath, '.agentMemory');

    console.log('📁 Creating test memories in:', agentMemoryPath);

    // Ensure directory exists
    await fs.mkdir(agentMemoryPath, { recursive: true });

    // Sample memories
    const testMemories = [
        {
            id: uuidv4(),
            projectId: path.basename(workspacePath),
            key: 'oauth-implementation',
            type: 'architecture',
            content: '# OAuth Implementation\n\nWe use Passport.js with JWT tokens.\n\n## Configuration\n- JWT secret in env var\n- Token expiry: 24 hours\n- Refresh token rotation enabled',
            tags: ['oauth', 'authentication', 'security'],
            relationships: {
                dependsOn: [],
                implements: []
            },
            metadata: {
                accessCount: 5,
                createdBy: 'kilocode'
            },
            createdAt: Date.now() - 86400000, // 1 day ago
            updatedAt: Date.now() - 3600000   // 1 hour ago
        },
        {
            id: uuidv4(),
            projectId,
            key: 'api-error-handling',
            type: 'pattern',
            content: '# API Error Handling Pattern\n\nAll API routes use centralized error handler.\n\n```javascript\napp.use((err, req, res, next) => {\n  res.status(err.status || 500).json({\n    error: err.message\n  });\n});\n```',
            tags: ['api', 'error-handling', 'express'],
            relationships: {
                dependsOn: [],
                implements: []
            },
            metadata: {
                accessCount: 3,
                createdBy: 'cline'
            },
            createdAt: Date.now() - 172800000, // 2 days ago
            updatedAt: Date.now() - 7200000    // 2 hours ago
        },
        {
            id: uuidv4(),
            projectId,
            key: 'database-schema',
            type: 'architecture',
            content: '# Database Schema\n\n## Users Table\n- id (UUID)\n- email (unique)\n- password_hash\n- created_at\n\n## Sessions Table\n- id (UUID)\n- user_id (FK)\n- token\n- expires_at',
            tags: ['database', 'schema', 'postgresql'],
            relationships: {
                dependsOn: [],
                implements: []
            },
            metadata: {
                accessCount: 8,
                createdBy: 'kilocode'
            },
            createdAt: Date.now() - 259200000, // 3 days ago
            updatedAt: Date.now() - 1800000    // 30 min ago
        },
        {
            id: uuidv4(),
            projectId,
            key: 'bug-cors-headers',
            type: 'bug',
            content: '# CORS Headers Issue\n\n## Problem\nFrontend requests failing with CORS error.\n\n## Solution\nAdded cors middleware:\n```javascript\napp.use(cors({\n  origin: process.env.FRONTEND_URL,\n  credentials: true\n}));\n```',
            tags: ['bug', 'cors', 'frontend'],
            relationships: {
                dependsOn: [],
                implements: []
            },
            metadata: {
                accessCount: 2,
                createdBy: 'cline'
            },
            createdAt: Date.now() - 43200000,  // 12 hours ago
            updatedAt: Date.now() - 3600000    // 1 hour ago
        },
        {
            id: uuidv4(),
            projectId,
            key: 'feature-user-profiles',
            type: 'feature',
            content: '# User Profiles Feature\n\n## Implementation\n- Profile page at /profile/:id\n- Editable fields: name, bio, avatar\n- Avatar upload to S3\n- Profile visibility settings',
            tags: ['feature', 'profiles', 'users'],
            relationships: {
                dependsOn: ['database-schema'],
                implements: []
            },
            metadata: {
                accessCount: 1,
                createdBy: 'roocode'
            },
            createdAt: Date.now() - 7200000,   // 2 hours ago
            updatedAt: Date.now() - 1800000    // 30 min ago
        },
        {
            id: uuidv4(),
            projectId,
            key: 'api-rate-limiting',
            type: 'decision',
            content: '# API Rate Limiting Decision\n\n## Decision\nUse express-rate-limit with Redis store.\n\n## Rationale\n- Better for distributed systems\n- Persistent across restarts\n- 100 requests per 15 minutes per IP',
            tags: ['api', 'rate-limiting', 'redis'],
            relationships: {
                dependsOn: [],
                implements: []
            },
            metadata: {
                accessCount: 4,
                createdBy: 'kilocode'
            },
            createdAt: Date.now() - 345600000, // 4 days ago
            updatedAt: Date.now() - 86400000   // 1 day ago
        }
    ];

    // Write each memory to a file
    for (const memory of testMemories) {
        const filename = `${memory.id}.json`;
        const filepath = path.join(agentMemoryPath, filename);

        await fs.writeFile(filepath, JSON.stringify(memory, null, 2), 'utf-8');
        console.log(`✅ Created: ${memory.key} (${memory.type})`);
    }

    console.log(`\n🎉 Created ${testMemories.length} test memories!`);
    console.log(`📊 Open dashboard to see results: Cmd+Shift+P → "agentMemory: Open Memory Dashboard"`);
    console.log(`📁 Location: ${agentMemoryPath}\n`);
}

// Run the script
createTestMemories().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});

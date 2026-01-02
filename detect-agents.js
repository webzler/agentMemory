#!/usr/bin/env node

/**
 * Script to detect all AI coding agent extensions
 * Run in VS Code terminal: node detect-agents.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 Detecting AI Coding Agent Extensions...\n');

// Check VS Code extensions directory
const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions');

if (!fs.existsSync(extensionsDir)) {
    console.log('❌ VS Code extensions directory not found:', extensionsDir);
    process.exit(1);
}

const extensions = fs.readdirSync(extensionsDir);

const agentKeywords = ['cline', 'roo', 'kilo', 'continue', 'cursor', 'claude'];
const detectedAgents = [];

extensions.forEach(ext => {
    const lowerExt = ext.toLowerCase();

    if (agentKeywords.some(keyword => lowerExt.includes(keyword))) {
        // Parse extension folder name
        // Format: publisher.name-version
        const match = ext.match(/^(.+?)-(\d+\.\d+\.\d+.*)$/);

        if (match) {
            const extensionId = match[1];
            const version = match[2];

            // Try to read package.json for display name
            const packageJsonPath = path.join(extensionsDir, ext, 'package.json');
            let displayName = extensionId;

            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                displayName = packageJson.displayName || packageJson.name || extensionId;
            } catch (error) {
                // Ignore
            }

            detectedAgents.push({
                id: extensionId,
                name: displayName,
                version: version,
                folder: ext
            });
        }
    }
});

if (detectedAgents.length === 0) {
    console.log('❌ No AI coding agent extensions detected');
    console.log('\nSearched for keywords:', agentKeywords.join(', '));
} else {
    console.log('✅ Detected AI Coding Agents:\n');

    detectedAgents.forEach(agent => {
        console.log(`📦 ${agent.name}`);
        console.log(`   ID: ${agent.id}`);
        console.log(`   Version: ${agent.version}`);
        console.log(`   Folder: ${agent.folder}`);
        console.log('');
    });

    console.log('\n📋 Extension IDs for config:');
    console.log('const agentExtensions = {');
    detectedAgents.forEach(agent => {
        const key = agent.id.split('.')[1] || agent.id;
        console.log(`    '${key}': '${agent.id}',`);
    });
    console.log('};');
}

console.log('\n✅ Done!');

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface Permission {
    extensionId: string;
    scope: 'own' | 'read' | 'write' | 'full';
    grantedAt: number;
    grantedBy: 'user' | 'system';
}

export interface AuditLog {
    timestamp: number;
    extensionId: string;
    action: 'read' | 'write' | 'update' | 'delete';
    memoryKey: string;
    allowed: boolean;
    reason?: string;
}

/**
 * Security Manager for agentMemory Extension API
 * 
 * Security Model:
 * 1. Namespace Isolation: Extensions can only access their own memories by default
 * 2. Permission System: User must grant explicit permission for cross-extension access
 * 3. Audit Logging: All access attempts are logged
 */
export class SecurityManager {
    private permissions: Map<string, Permission> = new Map();
    private auditLogs: AuditLog[] = [];
    private configPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.configPath = path.join(context.globalStorageUri.fsPath, 'security.json');
        this.loadPermissions();
    }

    /**
     * Check if an extension has permission to perform an action
     */
    async checkPermission(
        extensionId: string,
        action: 'read' | 'write' | 'update' | 'delete',
        memoryKey: string,
        createdBy?: string
    ): Promise<{ allowed: boolean; reason?: string }> {

        // Rule 1: Extensions can always access their own memories
        if (createdBy === extensionId) {
            this.logAccess(extensionId, action, memoryKey, true);
            return { allowed: true };
        }

        // Rule 2: Check if extension has explicit permission
        const permission = this.permissions.get(extensionId);

        if (!permission) {
            // No permission granted - deny by default
            const reason = 'Extension does not have permission to access other extensions\' memories';
            this.logAccess(extensionId, action, memoryKey, false, reason);
            return { allowed: false, reason };
        }

        // Rule 3: Check scope level
        switch (permission.scope) {
            case 'own':
                const reason = 'Extension only has permission to access its own memories';
                this.logAccess(extensionId, action, memoryKey, false, reason);
                return { allowed: false, reason };

            case 'read':
                if (action === 'read') {
                    this.logAccess(extensionId, action, memoryKey, true);
                    return { allowed: true };
                } else {
                    const reason = 'Extension only has read permission';
                    this.logAccess(extensionId, action, memoryKey, false, reason);
                    return { allowed: false, reason };
                }

            case 'write':
                if (action === 'write' || action === 'update') {
                    this.logAccess(extensionId, action, memoryKey, true);
                    return { allowed: true };
                } else {
                    const reason = 'Extension does not have permission for this action';
                    this.logAccess(extensionId, action, memoryKey, false, reason);
                    return { allowed: false, reason };
                }

            case 'full':
                this.logAccess(extensionId, action, memoryKey, true);
                return { allowed: true };
        }

        return { allowed: false, reason: 'Unknown permission scope' };
    }

    /**
     * Request permission from user
     */
    async requestPermission(extensionId: string, requestedScope: 'read' | 'write' | 'full'): Promise<boolean> {
        const scopeDescriptions = {
            read: 'read memories created by other extensions',
            write: 'write and update memories (including from other extensions)',
            full: 'full access to all memories (read, write, update, delete)'
        };

        const message = `Extension "${extensionId}" is requesting permission to ${scopeDescriptions[requestedScope]}. Allow?`;

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Allow',
            'Allow (This Session Only)',
            'Deny'
        );

        if (choice === 'Allow' || choice === 'Allow (This Session Only)') {
            const permission: Permission = {
                extensionId,
                scope: requestedScope,
                grantedAt: Date.now(),
                grantedBy: 'user'
            };

            this.permissions.set(extensionId, permission);

            if (choice === 'Allow') {
                // Persist permission
                await this.savePermissions();
            }

            vscode.window.showInformationMessage(`Permission granted to ${extensionId}`);
            return true;
        } else {
            vscode.window.showInformationMessage(`Permission denied to ${extensionId}`);
            return false;
        }
    }

    /**
     * Revoke permission for an extension
     */
    async revokePermission(extensionId: string): Promise<void> {
        this.permissions.delete(extensionId);
        await this.savePermissions();
        vscode.window.showInformationMessage(`Permission revoked for ${extensionId}`);
    }

    /**
     * Get all permissions
     */
    getPermissions(): Permission[] {
        return Array.from(this.permissions.values());
    }

    /**
     * Get audit logs
     */
    getAuditLogs(limit: number = 100): AuditLog[] {
        return this.auditLogs.slice(-limit);
    }

    /**
     * Clear audit logs
     */
    clearAuditLogs(): void {
        this.auditLogs = [];
    }

    /**
     * Log access attempt
     */
    private logAccess(
        extensionId: string,
        action: 'read' | 'write' | 'update' | 'delete',
        memoryKey: string,
        allowed: boolean,
        reason?: string
    ): void {
        const log: AuditLog = {
            timestamp: Date.now(),
            extensionId,
            action,
            memoryKey,
            allowed,
            reason
        };

        this.auditLogs.push(log);

        // Keep only last 1000 logs
        if (this.auditLogs.length > 1000) {
            this.auditLogs = this.auditLogs.slice(-1000);
        }

        // Log denied access attempts
        if (!allowed) {
            console.warn(`[SecurityManager] Access denied: ${extensionId} tried to ${action} "${memoryKey}". Reason: ${reason}`);
        }
    }

    /**
     * Load permissions from disk
     */
    private async loadPermissions(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
            const data = await fs.readFile(this.configPath, 'utf-8');
            const permissions: Permission[] = JSON.parse(data);

            this.permissions = new Map(permissions.map(p => [p.extensionId, p]));
            console.log(`[SecurityManager] Loaded ${this.permissions.size} permissions`);
        } catch (error) {
            // File doesn't exist or is invalid, start fresh
            console.log('[SecurityManager] No existing permissions found');
        }
    }

    /**
     * Save permissions to disk
     */
    private async savePermissions(): Promise<void> {
        try {
            const permissions = Array.from(this.permissions.values());
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
            await fs.writeFile(this.configPath, JSON.stringify(permissions, null, 2), 'utf-8');
            console.log(`[SecurityManager] Saved ${permissions.length} permissions`);
        } catch (error) {
            console.error('[SecurityManager] Failed to save permissions:', error);
        }
    }
}

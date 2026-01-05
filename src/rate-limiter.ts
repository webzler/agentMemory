interface RateLimitConfig {
    maxRequests: number;      // Max requests in window
    windowMs: number;         // Time window in milliseconds
}

interface RequestRecord {
    timestamp: number;
}

/**
 * Rate limiter for preventing API abuse
 * Uses sliding window algorithm
 */
export class RateLimiter {
    private attempts = new Map<string, RequestRecord[]>();
    private config: RateLimitConfig;

    constructor(config: Partial<RateLimitConfig> = {}) {
        this.config = {
            maxRequests: config.maxRequests || 100,
            windowMs: config.windowMs || 60000  // 1 minute default
        };
    }

    /**
     * Check if request is allowed for an extension
     * @param extensionId - Unique identifier for the extension
     * @returns true if allowed, false if rate limit exceeded
     */
    checkLimit(extensionId: string): boolean {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        // Get existing attempts for this extension
        let records = this.attempts.get(extensionId) || [];

        // Remove old attempts outside the sliding window
        records = records.filter(r => r.timestamp > windowStart);

        // Check if limit exceeded
        if (records.length >= this.config.maxRequests) {
            // Update attempts (for accurate tracking)
            this.attempts.set(extensionId, records);
            return false;  // Rate limit exceeded
        }

        // Add new attempt
        records.push({ timestamp: now });
        this.attempts.set(extensionId, records);

        return true;  // Request allowed
    }

    /**
     * Get current usage statistics for an extension
     * @param extensionId - Extension to check
     * @returns Usage stats including current count, limit, and reset time
     */
    getUsage(extensionId: string): { current: number; limit: number; resetIn: number } {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;
        const records = (this.attempts.get(extensionId) || [])
            .filter(r => r.timestamp > windowStart);

        const oldestRequest = records[0]?.timestamp || now;
        const resetIn = Math.max(0, (oldestRequest + this.config.windowMs) - now);

        return {
            current: records.length,
            limit: this.config.maxRequests,
            resetIn
        };
    }

    /**
     * Clear all attempts for a specific extension
     * Useful for testing or manual resets
     */
    clear(extensionId: string): void {
        this.attempts.delete(extensionId);
    }

    /**
     * Clear all attempts for all extensions
     */
    clearAll(): void {
        this.attempts.clear();
    }

    /**
     * Clean up old attempts across all extensions
     * Should be called periodically to prevent memory leaks
     */
    cleanup(): void {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        for (const [extensionId, records] of this.attempts.entries()) {
            const filtered = records.filter(r => r.timestamp > windowStart);

            if (filtered.length === 0) {
                // No recent attempts - remove entry
                this.attempts.delete(extensionId);
            } else {
                // Update with filtered records
                this.attempts.set(extensionId, filtered);
            }
        }
    }

    /**
     * Get total number of extensions being tracked
     */
    getTrackedExtensionsCount(): number {
        return this.attempts.size;
    }

    /**
     * Get configuration
     */
    getConfig(): Readonly<RateLimitConfig> {
        return { ...this.config };
    }
}

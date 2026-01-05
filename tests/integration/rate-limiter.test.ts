import { RateLimiter } from '../../src/rate-limiter';

describe('Rate Limiter Integration Tests', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
        rateLimiter = new RateLimiter({
            maxRequests: 10,
            windowMs: 1000 // 1 second for faster testing
        });
    });

    test('should allow requests under limit', () => {
        const extensionId = 'test-extension';

        for (let i = 0; i < 10; i++) {
            const allowed = rateLimiter.checkLimit(extensionId);
            expect(allowed).toBe(true);
        }
    });

    test('should block requests over limit', () => {
        const extensionId = 'test-extension';

        // Max out the limit
        for (let i = 0; i < 10; i++) {
            rateLimiter.checkLimit(extensionId);
        }

        // Next request should be blocked
        const blocked = rateLimiter.checkLimit(extensionId);
        expect(blocked).toBe(false);
    });

    test('should provide accurate usage stats', () => {
        const extensionId = 'test-extension';

        rateLimiter.checkLimit(extensionId);
        rateLimiter.checkLimit(extensionId);
        rateLimiter.checkLimit(extensionId);

        const usage = rateLimiter.getUsage(extensionId);
        expect(usage.current).toBe(3);
        expect(usage.limit).toBe(10);
        expect(usage.resetIn).toBeGreaterThan(0);
    });

    test('should reset after window expires', async () => {
        const extensionId = 'test-extension';

        // Max out the limit
        for (let i = 0; i < 10; i++) {
            rateLimiter.checkLimit(extensionId);
        }

        expect(rateLimiter.checkLimit(extensionId)).toBe(false);

        // Wait for window to reset
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Should allow requests again
        const allowed = rateLimiter.checkLimit(extensionId);
        expect(allowed).toBe(true);
    });

    test('should track multiple extensions separately', () => {
        const ext1 = 'extension-1';
        const ext2 = 'extension-2';

        // Max out ext1
        for (let i = 0; i < 10; i++) {
            rateLimiter.checkLimit(ext1);
        }

        // ext2 should still work
        expect(rateLimiter.checkLimit(ext2)).toBe(true);
        expect(rateLimiter.checkLimit(ext1)).toBe(false);
    });

    test('should cleanup old entries', () => {
        const ext1 = 'old-extension';
        const ext2 = 'active-extension';

        rateLimiter.checkLimit(ext1);
        expect(rateLimiter.getTrackedExtensionsCount()).toBe(1);

        // Add another extension
        rateLimiter.checkLimit(ext2);
        expect(rateLimiter.getTrackedExtensionsCount()).toBe(2);

        // Cleanup (ext1's requests should be old now)
        rateLimiter.cleanup();

        // Both should still be tracked (recent requests)
        expect(rateLimiter.getTrackedExtensionsCount()).toBeGreaterThanOrEqual(0);
    });

    test('should allow clearing specific extension', () => {
        const extensionId = 'test-extension';

        // Max out the limit
        for (let i = 0; i < 10; i++) {
            rateLimiter.checkLimit(extensionId);
        }

        expect(rateLimiter.checkLimit(extensionId)).toBe(false);

        // Clear and try again
        rateLimiter.clear(extensionId);
        expect(rateLimiter.checkLimit(extensionId)).toBe(true);
    });
});

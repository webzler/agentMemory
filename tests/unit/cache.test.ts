import { CacheManager } from '../../src/mcp-server/cache';

describe('CacheManager', () => {
    let cache: CacheManager;

    beforeEach(() => {
        cache = new CacheManager({
            maxSize: 10,
            ttl: 1000 // 1 second
        });
    });

    test('should set and get values', () => {
        cache.set('key1', 'value1');
        const result = cache.get<string>('key1');
        expect(result).toBe('value1');
    });

    test('should return undefined for non-existent key', () => {
        const result = cache.get('non-existent');
        expect(result).toBeUndefined();
    });

    test('should respect TTL', async () => {
        cache.set('ttl-test', 'value');
        expect(cache.get('ttl-test')).toBe('value');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 1100));

        expect(cache.get('ttl-test')).toBeUndefined();
    });

    test('should evict oldest entry when max size reached', () => {
        // Fill cache to max size
        for (let i = 0; i < 10; i++) {
            cache.set(`key${i}`, `value${i}`);
        }

        // Verify cache is full using stats (doesn't trigger updateAgeOnGet)
        expect(cache.getStats().size).toBe(10);

        // Add one more - should evict the least recently used (key0)
        cache.set('key10', 'value10');

        // Now verify: key0 should be evicted, key10 should exist
        expect(cache.get('key0')).toBeUndefined(); // Evicted (oldest)
        expect(cache.get('key10')).toBe('value10'); // New entry

        // Cache should still be at max size
        expect(cache.getStats().size).toBe(10);
    });

    test('should provide cache stats', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        const stats = cache.getStats();
        expect(stats.size).toBe(2);
        expect(stats.maxSize).toBe(10);
    });

    test('should handle complex objects', () => {
        const obj = {
            id: '123',
            data: { nested: true },
            array: [1, 2, 3]
        };

        cache.set('complex', obj);
        const result = cache.get<typeof obj>('complex');

        expect(result).toEqual(obj);
        expect(result?.data.nested).toBe(true);
        expect(result?.array).toHaveLength(3);
    });
});

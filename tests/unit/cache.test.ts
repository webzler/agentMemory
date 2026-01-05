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

        // All 10 should be in cache
        expect(cache.get('key0')).toBe('value0');
        expect(cache.get('key9')).toBe('value9');

        // Add one more - should evict oldest (key0)
        cache.set('key10', 'value10');

        expect(cache.get('key0')).toBeUndefined(); // Evicted
        expect(cache.get('key10')).toBe('value10'); // New entry
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

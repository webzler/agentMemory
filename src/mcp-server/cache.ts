import { LRUCache } from 'lru-cache';

interface CacheOptions {
    maxSize?: number;
    ttl?: number; // in milliseconds
}

export class CacheManager {
    private cache: LRUCache<string, any>;

    constructor(options: CacheOptions = {}) {
        const maxSize = options.maxSize || 10000; // Default: 10K entries
        const ttl = options.ttl || 3600000; // Default: 1 hour in ms

        this.cache = new LRUCache({
            max: maxSize,
            ttl: ttl,
            updateAgeOnGet: true,
            updateAgeOnHas: true
        });
    }

    /**
     * Get a value from cache
     */
    get<T>(key: string): T | undefined {
        return this.cache.get(key) as T | undefined;
    }

    /**
     * Set a value in cache
     */
    set<T>(key: string, value: T): void {
        this.cache.set(key, value);
    }

    /**
     * Check if key exists in cache
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * Delete a key from cache
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear entire cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.cache.max,
            ttl: this.cache.ttl
        };
    }
}

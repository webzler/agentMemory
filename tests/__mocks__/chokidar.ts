// Mock chokidar for Jest tests
// This avoids ESM compatibility issues

export class FSWatcher {
    private callbacks: Map<string, Function[]> = new Map();

    watch(paths: string | string[], options?: any): this {
        return this;
    }

    on(event: string, callback: Function): this {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event)?.push(callback);
        return this;
    }

    async close(): Promise<void> {
        this.callbacks.clear();
    }

    // Test helper to trigger events
    _trigger(event: string, ...args: any[]): void {
        const handlers = this.callbacks.get(event) || [];
        handlers.forEach(handler => handler(...args));
    }
}

export function watch(paths: string | string[], options?: any): FSWatcher {
    return new FSWatcher().watch(paths, options);
}

export default { watch, FSWatcher };

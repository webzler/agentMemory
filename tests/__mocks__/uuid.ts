// Mock uuid v4 function for Jest tests
// This avoids ESM compatibility issues with the uuid package
// Generates properly formatted UUIDs that pass Zod validation

let counter = 0;

export function v4(): string {
    // Generate valid UUID v4 format for test
    counter++;

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hexadecimal digit and y is one of 8, 9, A, or B

    const hex = counter.toString(16).padStart(12, '0');

    // Build a proper UUID v4
    const uuid = [
        hex.slice(0, 8),
        hex.slice(8, 12),
        '4' + hex.slice(0, 3),  // Version 4
        '8' + hex.slice(3, 6),  // Variant (8, 9, A, or B)
        hex + (counter * 2).toString(16).padStart(12, '0').slice(0, 12)
    ].join('-');

    return uuid.slice(0, 36);  // Ensure correct length
}

// Alternative: generate from scratch each time
export function v4Alt(): string {
    counter++;
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4() + s4()}-${s4()}-4${s4().substr(0, 3)}-${['8', '9', 'a', 'b'][counter % 4]}${s4().substr(0, 3)}-${s4()}${s4()}${s4()}`;
}

// Reset counter between tests
export function resetCounter(): void {
    counter = 0;
}

// Also export as default for different import styles
export default { v4, resetCounter };

/**
 * Test fixtures for the Gemini API client.
 *
 * This module provides utilities for loading test fixtures from JSON and text files.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
/**
 * Load a fixture file as a string.
 */
export function loadFixture(relativePath) {
    const fixturePath = join(__dirname, relativePath);
    return readFileSync(fixturePath, 'utf-8');
}
/**
 * Load a JSON fixture and parse it.
 */
export function loadJsonFixture(relativePath) {
    const content = loadFixture(relativePath);
    return JSON.parse(content);
}
/**
 * Load streaming fixture and parse as JSON lines.
 */
export function loadStreamingFixture(relativePath) {
    const content = loadFixture(relativePath);
    // Split by lines that start with comma or opening bracket
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map(line => {
        // Remove leading comma if present
        const cleaned = line.startsWith(',') ? line.slice(1) : line;
        return JSON.parse(cleaned);
    });
}
//# sourceMappingURL=index.js.map
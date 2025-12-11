/**
 * Test fixtures for the Gemini API client.
 *
 * This module provides utilities for loading test fixtures from JSON and text files.
 */
/**
 * Load a fixture file as a string.
 */
export declare function loadFixture(relativePath: string): string;
/**
 * Load a JSON fixture and parse it.
 */
export declare function loadJsonFixture<T>(relativePath: string): T;
/**
 * Load streaming fixture and parse as JSON lines.
 */
export declare function loadStreamingFixture(relativePath: string): unknown[];
//# sourceMappingURL=index.d.ts.map
/**
 * Client interface and factory for Gemini API.
 * Re-exports all client-related types and functions.
 */
import type { GeminiConfig } from '../config/index.js';
import type { GeminiClient } from './types.js';
export type { GeminiClient } from './types.js';
export type { GeminiConfig };
export { GeminiClientBuilder } from './builder.js';
export { HttpClient } from './http.js';
/**
 * Create a Gemini client with the given configuration.
 * @param config - Client configuration
 * @returns The Gemini client
 */
export declare function createClient(config: GeminiConfig): GeminiClient;
/**
 * Create a Gemini client from environment variables.
 * @returns The Gemini client
 */
export declare function createClientFromEnv(): GeminiClient;
//# sourceMappingURL=index.d.ts.map
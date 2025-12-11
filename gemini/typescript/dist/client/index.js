/**
 * Client interface and factory for Gemini API.
 * Re-exports all client-related types and functions.
 */
import { GeminiClientImpl } from './client.js';
import { GeminiClientBuilder } from './builder.js';
// Re-export builder
export { GeminiClientBuilder } from './builder.js';
// Re-export HTTP client for internal use by services
export { HttpClient } from './http.js';
/**
 * Create a Gemini client with the given configuration.
 * @param config - Client configuration
 * @returns The Gemini client
 */
export function createClient(config) {
    return new GeminiClientImpl(config);
}
/**
 * Create a Gemini client from environment variables.
 * @returns The Gemini client
 */
export function createClientFromEnv() {
    return GeminiClientBuilder.fromEnv();
}
//# sourceMappingURL=index.js.map
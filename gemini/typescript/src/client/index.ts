/**
 * Client interface and factory for Gemini API.
 * Re-exports all client-related types and functions.
 */

import type { GeminiConfig } from '../config/index.js';
import type { GeminiClient } from './types.js';
import { GeminiClientImpl } from './client.js';
import { GeminiClientBuilder } from './builder.js';

// Re-export types
export type { GeminiClient } from './types.js';
export type { GeminiConfig };

// Re-export builder
export { GeminiClientBuilder } from './builder.js';

// Re-export HTTP client for internal use by services
export { HttpClient } from './http.js';

/**
 * Create a Gemini client with the given configuration.
 * @param config - Client configuration
 * @returns The Gemini client
 */
export function createClient(config: GeminiConfig): GeminiClient {
  return new GeminiClientImpl(config);
}

/**
 * Create a Gemini client from environment variables.
 * @returns The Gemini client
 */
export function createClientFromEnv(): GeminiClient {
  return GeminiClientBuilder.fromEnv();
}

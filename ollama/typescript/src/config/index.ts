/**
 * Configuration module for the Ollama client.
 *
 * This module provides configuration types, constants, and a fluent builder
 * for creating Ollama client instances.
 *
 * @example
 * ```typescript
 * import { OllamaClientBuilder } from './config';
 *
 * // Build client with defaults
 * const client = new OllamaClientBuilder()
 *   .baseUrlFromEnv()
 *   .defaultModelFromEnv()
 *   .build();
 *
 * // Build client with custom configuration
 * const client = new OllamaClientBuilder()
 *   .baseUrl('http://localhost:11434')
 *   .timeoutMs(60000)
 *   .defaultModel('llama3.2')
 *   .build();
 *
 * // Build client with simulation
 * const client = new OllamaClientBuilder()
 *   .recordTo({ type: 'file', path: './recordings.json' })
 *   .build();
 * ```
 */

export * from './types.js';
export * from './constants.js';
export * from './builder.js';

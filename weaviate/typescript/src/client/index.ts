/**
 * Client module - Main exports
 *
 * Provides the WeaviateClient class and factory functions for creating clients.
 *
 * @module client
 */

// Main client class
export { WeaviateClient } from './client.js';

// Factory functions
export {
  createClient,
  createClientFromEnv,
  createTestClient,
  createClientBuilder,
  WeaviateClientBuilder,
} from './factory.js';

// Types
export type {
  WeaviateClientOptions,
  HealthStatus,
} from './types.js';
export { ClientState } from './types.js';

// Health check
export { healthCheck } from './health.js';

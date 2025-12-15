/**
 * Azure Cognitive Search Client
 *
 * Re-exports all client components.
 */

export type { AcsConfig, NormalizedAcsConfig, RetryConfig, CircuitBreakerConfig, SimulationMode } from './config.js';
export { normalizeConfig, configFromEnv, DEFAULT_API_VERSION, DEFAULT_TIMEOUT, DEFAULT_RETRY_CONFIG, DEFAULT_CIRCUIT_BREAKER_CONFIG } from './config.js';

export type { AcsClient } from './client.js';
export { AcsClientImpl, AcsClientBuilder, createClient, createClientFromEnv, builder } from './client.js';

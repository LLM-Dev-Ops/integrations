/**
 * Factory functions for creating R2 clients
 * @module @studiorack/cloudflare-r2/client
 */

import type { R2Client } from './interface.js';
import { R2ClientImpl } from './client.js';
import type { R2Config } from '../config/index.js';
import { normalizeConfig, createConfigFromEnv } from '../config/index.js';
import { R2Signer } from '../signing/index.js';
import {
  createFetchTransport,
  createResilientTransport,
} from '../transport/index.js';

/**
 * Creates an R2 client from a configuration object
 *
 * Validates and normalizes the configuration, then constructs
 * the client with all necessary dependencies (transport, signer).
 *
 * @param config - R2 configuration
 * @returns Configured R2 client
 * @throws {ConfigError} If configuration is invalid
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   accountId: 'my-account',
 *   accessKeyId: 'my-key',
 *   secretAccessKey: 'my-secret',
 *   timeout: 60000
 * });
 *
 * try {
 *   // Use the client
 *   const data = await client.objects.get('bucket', 'key');
 * } finally {
 *   await client.close();
 * }
 * ```
 */
export function createClient(config: R2Config): R2Client {
  // Normalize and validate config
  const normalizedConfig = normalizeConfig(config);

  // Create HTTP transport
  // Start with basic fetch transport
  const fetchTransport = createFetchTransport(normalizedConfig.timeout);

  // Wrap with resilient transport for retry and circuit breaker
  const transport = createResilientTransport(
    fetchTransport,
    normalizedConfig.retry,
    normalizedConfig.circuitBreaker
  );

  // Create signer
  const signer = new R2Signer({
    accessKeyId: normalizedConfig.accessKeyId,
    secretAccessKey: normalizedConfig.secretAccessKey,
    region: 'auto', // R2 is always "auto"
    service: 's3',
  });

  // Create and return client
  return new R2ClientImpl(normalizedConfig, transport, signer);
}

/**
 * Creates an R2 client from environment variables
 *
 * Reads configuration from the following environment variables:
 * - R2_ACCOUNT_ID (required): Cloudflare account ID
 * - R2_ACCESS_KEY_ID (required): R2 access key ID
 * - R2_SECRET_ACCESS_KEY (required): R2 secret access key
 * - R2_ENDPOINT (optional): Custom endpoint URL
 * - R2_TIMEOUT_MS (optional): Request timeout in milliseconds
 * - R2_MULTIPART_THRESHOLD_BYTES (optional): Multipart upload threshold
 * - R2_MULTIPART_PART_SIZE_BYTES (optional): Multipart part size
 * - R2_MULTIPART_CONCURRENCY (optional): Number of concurrent part uploads
 *
 * @returns Configured R2 client
 * @throws {ConfigError} If required environment variables are missing or invalid
 *
 * @example
 * ```typescript
 * // Set environment variables
 * process.env.R2_ACCOUNT_ID = 'my-account';
 * process.env.R2_ACCESS_KEY_ID = 'my-key';
 * process.env.R2_SECRET_ACCESS_KEY = 'my-secret';
 *
 * // Create client
 * const client = createClientFromEnv();
 *
 * try {
 *   // Use the client
 *   const data = await client.objects.get('bucket', 'key');
 * } finally {
 *   await client.close();
 * }
 * ```
 */
export function createClientFromEnv(): R2Client {
  // Load config from environment variables
  const normalizedConfig = createConfigFromEnv();

  // Create HTTP transport
  const fetchTransport = createFetchTransport(normalizedConfig.timeout);

  // Wrap with resilient transport
  const transport = createResilientTransport(
    fetchTransport,
    normalizedConfig.retry,
    normalizedConfig.circuitBreaker
  );

  // Create signer
  const signer = new R2Signer({
    accessKeyId: normalizedConfig.accessKeyId,
    secretAccessKey: normalizedConfig.secretAccessKey,
    region: 'auto',
    service: 's3',
  });

  // Create and return client
  return new R2ClientImpl(normalizedConfig, transport, signer);
}

/**
 * Options for creating a mock client
 */
export interface MockClientOptions {
  /**
   * List of bucket names that should exist in the mock
   */
  buckets?: string[];

  /**
   * Pre-populated objects in the mock
   * Map of "bucket/key" to object data
   */
  objects?: Map<string, Uint8Array>;
}

/**
 * Creates a mock R2 client for testing
 *
 * Returns a mock client that simulates R2 behavior without making
 * actual network requests. Useful for testing and development.
 *
 * @param options - Mock client configuration
 * @returns Mock R2 client
 *
 * @example
 * ```typescript
 * const client = createMockClient({
 *   buckets: ['test-bucket'],
 *   objects: new Map([
 *     ['test-bucket/test-key', new TextEncoder().encode('test data')]
 *   ])
 * });
 *
 * // Use the mock client
 * const data = await client.objects.get('test-bucket', 'test-key');
 * // Returns the pre-populated test data
 * ```
 *
 * @note This is a placeholder implementation.
 * The actual mock client will be implemented with the service modules.
 */
export function createMockClient(_options?: MockClientOptions): R2Client {
  // TODO: Implement mock client when service implementations are available
  // For now, throw an error indicating this is not yet implemented
  throw new Error(
    'Mock client is not yet implemented. ' +
      'This will be available once the service modules are complete.'
  );
}

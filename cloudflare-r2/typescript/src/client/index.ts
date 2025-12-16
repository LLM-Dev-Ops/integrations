/**
 * Client module for Cloudflare R2 Storage Integration
 *
 * Provides the main client interface, builder, and factory functions
 * for creating and configuring R2 clients.
 *
 * @module @studiorack/cloudflare-r2/client
 *
 * @example
 * ```typescript
 * import { createClient, R2ClientBuilder } from '@studiorack/cloudflare-r2/client';
 *
 * // Create client from config object
 * const client1 = createClient({
 *   accountId: 'my-account',
 *   accessKeyId: 'my-key',
 *   secretAccessKey: 'my-secret'
 * });
 *
 * // Create client using builder
 * const client2 = new R2ClientBuilder()
 *   .accountId('my-account')
 *   .credentials('my-key', 'my-secret')
 *   .timeout(60000)
 *   .retry({ maxRetries: 5 })
 *   .build();
 *
 * // Create client from environment variables
 * const client3 = createClientFromEnv();
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  R2Client,
  R2ObjectsService,
  R2MultipartService,
  R2PresignService,
} from './interface.js';

export type { MockClientOptions } from './factory.js';

// ============================================================================
// Class Exports
// ============================================================================

export { R2ClientImpl } from './client.js';
export { R2ClientBuilder } from './builder.js';

// ============================================================================
// Factory Function Exports
// ============================================================================

export {
  createClient,
  createClientFromEnv,
  createMockClient,
} from './factory.js';

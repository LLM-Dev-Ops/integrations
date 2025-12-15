/**
 * Azure Key Vault Simulation Layer
 *
 * Mock implementations and replay functionality for testing Key Vault operations
 * without requiring live Azure services.
 *
 * This simulation layer provides:
 * - MockKeyVaultClient: In-memory implementation of Key Vault operations
 * - Access logging: Track all operations for analysis and replay
 * - Replay functionality: Validate access patterns and test scenarios
 *
 * @example
 * ```typescript
 * import { MockKeyVaultClient, AccessLogReplayer } from './simulation';
 *
 * // Create mock client
 * const client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
 *
 * // Register test data
 * client.registerSecret('db-password', 'secret123');
 * client.registerKey('encryption-key', { kty: 'RSA' });
 *
 * // Use in tests
 * const secret = await client.secrets().get('db-password');
 * const key = await client.keys().get('encryption-key');
 *
 * // Review access log
 * const log = client.getAccessLog();
 * console.log(`Performed ${log.length} operations`);
 *
 * // Replay access patterns
 * const replayer = new AccessLogReplayer(client);
 * const result = await replayer.replay(log);
 * console.log(`Match rate: ${result.matchPercentage}%`);
 * ```
 */

export { MockKeyVaultClient } from './mockClient.js';
export type {
  SecretsService,
  KeysService,
  CertificatesService,
} from './mockClient.js';
export { AccessLogReplayer } from './replay.js';
export type {
  AccessResult,
  AccessLogEntry,
  ReplayEntry,
  ReplayResult,
  AccessLogFile,
} from './types.js';

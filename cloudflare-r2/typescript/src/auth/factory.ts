/**
 * Authentication provider factory for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/auth/factory
 */

import type { R2Config } from '../config/types.js';
import type { AuthProvider } from './types.js';
import { StaticAuthProvider, EnvironmentAuthProvider } from './provider.js';

/**
 * Creates an authentication provider from configuration.
 *
 * @param config - R2 configuration containing credentials
 * @returns Authentication provider instance
 */
export function createAuthProvider(config: R2Config): AuthProvider {
  return new StaticAuthProvider({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
}

/**
 * Creates an authentication provider from environment variables.
 *
 * Environment variables:
 * - R2_ACCESS_KEY_ID (required): R2 access key ID
 * - R2_SECRET_ACCESS_KEY (required): R2 secret access key
 *
 * @returns Authentication provider instance
 * @throws {ConfigError} If required environment variables are missing
 */
export function createAuthProviderFromEnv(): AuthProvider {
  return new EnvironmentAuthProvider();
}

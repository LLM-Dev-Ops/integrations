/**
 * Authentication module for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/auth
 */

export type { R2Credentials, AuthProvider } from './types.js';

export { StaticAuthProvider, EnvironmentAuthProvider } from './provider.js';

export { createAuthProvider, createAuthProviderFromEnv } from './factory.js';

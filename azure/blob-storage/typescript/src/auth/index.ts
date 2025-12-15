/**
 * Azure Blob Storage Authentication
 *
 * Re-exports all authentication types and providers.
 */

export type { AuthMethod, AuthHeader, AuthProvider, AzureAdCredentials } from './auth-provider.js';

export {
  StorageKeyAuthProvider,
  AzureAdAuthProvider,
  SasTokenAuthProvider,
  ConnectionStringAuthProvider,
  createAuthProvider,
} from './auth-provider.js';

/**
 * Authentication module exports.
 * @module auth
 */

export {
  SecretString,
  TokenManager,
  buildScope,
  parseScope,
  ScopeActions,
} from './token-manager.js';

export type { GhcrCredentials, CredentialProvider } from './providers.js';
export {
  StaticCredentialProvider,
  EnvCredentialProvider,
  ChainCredentialProvider,
  createCredentialProvider,
} from './providers.js';

/**
 * Authentication module for Google Artifact Registry.
 * @module auth
 */

export { SecretString } from './secret.js';
export { GcpAuthProvider, type TokenResponse, type CachedToken } from './provider.js';
export { DockerTokenProvider, type DockerTokenResponse } from './docker-token.js';

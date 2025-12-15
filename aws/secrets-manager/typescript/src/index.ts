/**
 * AWS Secrets Manager Integration
 *
 * A thin adapter layer for AWS Secrets Manager that provides:
 * - Secret retrieval with caching and version awareness
 * - Version management (AWSCURRENT, AWSPREVIOUS, AWSPENDING)
 * - Access scoping via path-based filtering
 * - Rotation support and awareness
 * - Provider abstraction for multi-cloud support
 *
 * This module follows the SPARC specification and integrates with the
 * LLM Dev Ops platform's shared infrastructure.
 *
 * @example Basic usage
 * ```typescript
 * import {
 *   SecretsManagerClient,
 *   EnvironmentCredentialProvider
 * } from '@aws/secrets-manager';
 *
 * // Create client
 * const client = SecretsManagerClient.builder()
 *   .region('us-east-1')
 *   .credentialsProvider(new EnvironmentCredentialProvider())
 *   .build();
 *
 * // Get a secret
 * const secret = await client.getSecretValue('my-secret');
 * console.log(secret.secretString);
 * ```
 *
 * @example Get a specific key from a JSON secret
 * ```typescript
 * // Secret value: {"username": "admin", "password": "secret123"}
 * const password = await client.getSecretKey('db-credentials', 'password');
 * console.log(password); // "secret123"
 * ```
 *
 * @example Version awareness
 * ```typescript
 * // Get the current version
 * const current = await client.getSecretValue('my-secret');
 *
 * // Get the previous version
 * const previous = await client.getSecretValue('my-secret', {
 *   versionStage: 'AWSPREVIOUS'
 * });
 *
 * // Get a specific version by ID
 * const specific = await client.getSecretValue('my-secret', {
 *   versionId: 'abc123'
 * });
 * ```
 *
 * @example List and describe secrets
 * ```typescript
 * // List secrets with filters
 * const response = await client.listSecrets({
 *   filters: [
 *     { key: 'name', values: ['prod/'] },
 *     { key: 'tag-key', values: ['environment'] }
 *   ]
 * });
 *
 * // Describe a secret (metadata without value)
 * const metadata = await client.describeSecret('my-secret');
 * console.log('Rotation enabled:', metadata.rotationEnabled);
 * ```
 *
 * @example Rotation
 * ```typescript
 * // Trigger rotation
 * const result = await client.rotateSecret('my-secret');
 * console.log('New version:', result.versionId);
 * ```
 *
 * @module aws-secrets-manager
 */

// Client exports
export {
  SecretsManagerClient,
  SecretsManagerClientBuilder,
  clientBuilder,
  createClient,
  createClientFromEnv,
} from './client/index.js';

// Configuration exports
export {
  SecretsManagerConfigBuilder,
  configBuilder,
  resolveEndpoint,
  buildUserAgent,
  DEFAULT_CONFIG,
} from './config/index.js';
export type { SecretsManagerConfig, RetryConfig } from './config/index.js';

// Error exports
export {
  SecretsManagerError,
  mapAwsError,
  mapHttpError,
  configurationError,
  credentialError,
  signingError,
  validationError,
  transportError,
  timeoutError,
  secretNotFoundError,
  versionNotFoundError,
  wrapError,
} from './error/index.js';
export type { SecretsManagerErrorCode } from './error/index.js';

// Type exports
export type {
  AwsCredentials,
  CredentialProvider,
  VersionStage,
  GetSecretOptions,
  ListSecretsOptions,
  SecretFilter,
  SecretValue,
  SecretMetadata,
  RotationRules,
  ReplicationStatus,
  RotationResult,
  ListSecretsResponse,
  HttpRequest,
  HttpResponse,
  SignedRequest,
  SigningParams,
} from './types/index.js';

// Credential exports
export {
  StaticCredentialProvider,
  EnvironmentCredentialProvider,
  ChainCredentialProvider,
  CredentialError,
  defaultProvider,
  AWS_ENV_VARS,
} from './credentials/index.js';

// Signing exports
export { signRequest } from './signing/index.js';

// HTTP exports
export { FetchTransport } from './http/index.js';
export type { Transport, TransportOptions } from './http/index.js';

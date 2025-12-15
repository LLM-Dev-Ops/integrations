/**
 * AWS credentials management module.
 *
 * This module provides comprehensive credential management for AWS services,
 * including multiple providers, caching, and the default credential chain.
 *
 * @example Basic usage with default provider
 * ```typescript
 * import { defaultProvider } from '@aws/cloudwatch-logs/credentials';
 *
 * const provider = defaultProvider();
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example Using specific providers
 * ```typescript
 * import { EnvironmentCredentialProvider } from '@aws/cloudwatch-logs/credentials';
 *
 * const provider = new EnvironmentCredentialProvider();
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example Custom credential chain
 * ```typescript
 * import {
 *   ChainCredentialProvider,
 *   StaticCredentialProvider,
 *   EnvironmentCredentialProvider
 * } from '@aws/cloudwatch-logs/credentials';
 *
 * const provider = new ChainCredentialProvider([
 *   new StaticCredentialProvider({ ... }),
 *   new EnvironmentCredentialProvider()
 * ]);
 * ```
 *
 * @module credentials
 */

// Core types
export type { AwsCredentials, CredentialProvider } from './types.js';

// Error types
export { CredentialError } from './error.js';
export type { CredentialErrorCode } from './error.js';

// Provider implementations
export { StaticCredentialProvider } from './static.js';

export {
  EnvironmentCredentialProvider,
  AWS_ENV_VARS
} from './environment.js';

export {
  ProfileCredentialProvider
} from './profile.js';
export type { ProfileConfig } from './profile.js';

export {
  IMDSCredentialProvider
} from './imds.js';
export type { IMDSConfig } from './imds.js';

export {
  ChainCredentialProvider,
  defaultProvider
} from './chain.js';

export {
  CachedCredentialProvider
} from './cache.js';
export type { CacheConfig } from './cache.js';

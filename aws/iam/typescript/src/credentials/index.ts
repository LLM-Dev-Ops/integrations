/**
 * AWS IAM Credentials Management Module
 *
 * This module provides comprehensive credential management for assumed IAM roles,
 * including caching, automatic refresh, and role chaining support.
 *
 * @example Basic usage with credential provider
 * ```typescript
 * import { AssumedRoleCredentialProvider } from '@aws/iam/credentials';
 *
 * const provider = new AssumedRoleCredentialProvider(
 *   stsService,
 *   'arn:aws:iam::123456789012:role/MyRole',
 *   'my-session'
 * );
 *
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example Using credential cache
 * ```typescript
 * import { AssumedCredentialCache } from '@aws/iam/credentials';
 *
 * const cache = new AssumedCredentialCache({
 *   refreshBuffer: 5 * 60 * 1000, // 5 minutes
 *   maxEntries: 100
 * });
 *
 * cache.put(cacheKey, credentials, originalRequest);
 * const cached = cache.get(cacheKey);
 * ```
 *
 * @example Role chaining for cross-account access
 * ```typescript
 * import { RoleChainBuilder } from '@aws/iam/credentials';
 *
 * const credentials = await RoleChainBuilder.create(stsService)
 *   .addRole('arn:aws:iam::111111111111:role/JumpRole', 'jump-session')
 *   .addRole('arn:aws:iam::222222222222:role/TargetRole', 'target-session')
 *   .withExternalId('my-external-id')
 *   .assumeChain();
 * ```
 *
 * @module credentials
 */

// Cache exports
export {
  AssumedCredentialCache,
  type CacheConfig,
  type CacheStats,
} from './cache.js';

// Provider exports
export {
  AssumedRoleCredentialProvider,
  type CredentialProvider,
  type AwsCredentials,
  type StsService,
  type AssumedRoleProviderOptions,
} from './provider.js';

// Chain exports
export {
  RoleChainProvider,
  RoleChainBuilder,
  type RoleChainStep,
} from './chain.js';

// Static provider export
export { StaticCredentialProvider } from './static.js';

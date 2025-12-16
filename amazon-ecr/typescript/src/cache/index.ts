/**
 * Cache modules for Amazon ECR.
 *
 * This module exports caching utilities for ECR authorization tokens
 * and repository/image metadata.
 *
 * @module cache
 */

export { TokenCache } from './token-cache.js';
export type { CachedToken } from './token-cache.js';

export { MetadataCache } from './metadata-cache.js';
export type { CacheConfig } from './metadata-cache.js';

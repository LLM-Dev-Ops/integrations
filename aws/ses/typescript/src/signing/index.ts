/**
 * AWS Signature Version 4 Signing Module
 *
 * This module provides AWS Signature V4 signing functionality for authenticating
 * requests to AWS services like SES.
 *
 * @example Basic usage
 * ```typescript
 * import { signRequest } from './signing';
 *
 * const request = new Request('https://email.us-east-1.amazonaws.com/', {
 *   method: 'POST',
 *   body: JSON.stringify({ Action: 'SendEmail' }),
 * });
 *
 * const signed = await signRequest(request, {
 *   region: 'us-east-1',
 *   service: 'ses',
 *   credentials: {
 *     accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *     secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   },
 * });
 * ```
 *
 * @example Using the cache
 * ```typescript
 * import { getSigningKeyCache } from './signing';
 *
 * // Clean up expired keys periodically
 * const cache = getSigningKeyCache();
 * setInterval(() => {
 *   const removed = cache.cleanup();
 *   console.log(`Cleaned up ${removed} expired keys`);
 * }, 3600000);
 * ```
 *
 * @module signing
 */

// Core signing functionality
export {
  signRequest,
  createCanonicalRequest,
  createStringToSign,
  calculateSignature,
  deriveSigningKey,
  buildAuthorizationHeader,
  getSigningKeyCache,
} from './v4';

// Canonical request utilities
export {
  uriEncode,
  normalizeUriPath,
  canonicalQueryString,
  canonicalHeaders,
  shouldSignHeader,
} from './canonical';

// Cache management
export { SigningKeyCache } from './cache';

// Error types
export { SigningError, isSigningError } from './error';
export type { SigningErrorCode } from './error';

// Type definitions
export type {
  AwsCredentials,
  SigningParams,
  SignedRequest,
  CanonicalRequest,
  CacheEntry,
} from './types';

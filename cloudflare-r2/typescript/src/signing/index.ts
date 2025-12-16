/**
 * S3 Signature V4 signing module for Cloudflare R2 Storage
 *
 * This module provides complete S3-compatible signing functionality:
 * - Request signing with Authorization header
 * - Presigned URL generation (GET/PUT)
 * - Canonical request construction
 * - Signing key derivation with caching
 * - Cryptographic utilities (HMAC-SHA256, SHA-256)
 *
 * R2-specific configuration:
 * - Region: always "auto" (R2 is regionless)
 * - Service: always "s3"
 * - Path-style URLs only
 */

// Types
export type {
  SigningRequest,
  SignedRequest,
  PresignedUrlOptions,
  PresignedUrlResult,
} from './types.js';

// Main signer
export {
  R2Signer,
  type R2SignerConfig,
  UNSIGNED_PAYLOAD,
  EMPTY_SHA256,
} from './signer.js';

// Presigned URLs
export { createPresignedUrl } from './presign.js';

// Cryptographic utilities
export { hmacSha256, sha256Hash, sha256Hex, toHex } from './crypto.js';

// Canonical request utilities
export {
  createCanonicalRequest,
  getCanonicalUri,
  getCanonicalQueryString,
  getCanonicalHeaders,
  getSignedHeaders,
  uriEncode,
  uriEncodePath,
} from './canonical.js';

// Signing key derivation
export { deriveSigningKey, SigningKeyCache } from './key-derivation.js';

// Date formatting
export {
  formatDateStamp,
  formatAmzDate,
  parseAmzDate,
} from './format.js';

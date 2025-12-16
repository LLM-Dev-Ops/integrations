/**
 * Cryptographic utilities for S3 Signature V4 signing
 * Uses @noble/hashes for HMAC-SHA256 operations
 */

import { hmac } from '@noble/hashes/hmac';
import { sha256 as sha256Noble } from '@noble/hashes/sha256';

/**
 * Compute HMAC-SHA256
 */
export function hmacSha256(
  key: Uint8Array,
  data: string | Uint8Array
): Uint8Array {
  const dataBytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hmac(sha256Noble, key, dataBytes);
}

/**
 * Compute SHA-256 hash
 */
export function sha256Hash(data: string | Uint8Array): Uint8Array {
  const dataBytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return sha256Noble(dataBytes);
}

/**
 * Compute SHA-256 hash and return as hex string
 */
export function sha256Hex(data: string | Uint8Array): string {
  return toHex(sha256Hash(data));
}

/**
 * Convert byte array to hex string
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Signing key derivation for S3 Signature V4
 * Based on SPARC specification section 3.3
 */

import { hmacSha256 } from './crypto.js';

/**
 * Derive signing key using HMAC-SHA256 chaining
 * kSecret = "AWS4" + secretAccessKey
 * kDate = HMAC-SHA256(kSecret, dateStamp)
 * kRegion = HMAC-SHA256(kDate, region)
 * kService = HMAC-SHA256(kRegion, service)
 * kSigning = HMAC-SHA256(kService, "aws4_request")
 */
export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Uint8Array {
  // Step 1: kSecret = "AWS4" + secretAccessKey
  const kSecret = new TextEncoder().encode('AWS4' + secretAccessKey);

  // Step 2: kDate = HMAC-SHA256(kSecret, dateStamp)
  const kDate = hmacSha256(kSecret, dateStamp);

  // Step 3: kRegion = HMAC-SHA256(kDate, region)
  const kRegion = hmacSha256(kDate, region);

  // Step 4: kService = HMAC-SHA256(kRegion, service)
  const kService = hmacSha256(kRegion, service);

  // Step 5: kSigning = HMAC-SHA256(kService, "aws4_request")
  const kSigning = hmacSha256(kService, 'aws4_request');

  return kSigning;
}

/**
 * Cache signing keys for same-day requests (performance optimization)
 * Signing keys are only valid for a specific date, so we can cache them
 */
export class SigningKeyCache {
  private cache: Map<string, { key: Uint8Array; date: string }> = new Map();

  /**
   * Get signing key from cache or derive new one
   */
  getSigningKey(
    secretAccessKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Uint8Array {
    const cacheKey = `${secretAccessKey}:${dateStamp}:${region}:${service}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.date === dateStamp) {
      return cached.key;
    }

    // Derive new key
    const key = this.deriveSigningKey(
      secretAccessKey,
      dateStamp,
      region,
      service
    );

    // Store in cache
    this.cache.set(cacheKey, { key, date: dateStamp });

    // Clean up old entries (keep only today's keys)
    this.cleanupCache(dateStamp);

    return key;
  }

  /**
   * Derive signing key (internal method)
   */
  private deriveSigningKey(
    secretAccessKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Uint8Array {
    return deriveSigningKey(secretAccessKey, dateStamp, region, service);
  }

  /**
   * Remove cache entries for dates other than the current one
   */
  private cleanupCache(currentDate: string): void {
    const keysToDelete: string[] = [];

    for (const [key, value] of this.cache.entries()) {
      if (value.date !== currentDate) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cached keys
   */
  clear(): void {
    this.cache.clear();
  }
}

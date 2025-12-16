/**
 * Fingerprint generation for simulation records
 * Creates deterministic hashes for request/response matching
 */

import { createHash } from 'crypto';

/**
 * Generate a deterministic fingerprint for an operation and request
 *
 * @param operation - The operation name
 * @param request - The request data to fingerprint
 * @returns A SHA-256 hex string fingerprint
 */
export function generateFingerprint(operation: string, request: unknown): string {
  const normalized = normalizeRequest(request);
  const data = JSON.stringify({ operation, request: normalized });
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Normalize a request object for deterministic fingerprinting
 *
 * Normalization rules:
 * - Sort object keys recursively
 * - Normalize floating point numbers to 6 decimal places
 * - Preserve arrays in their original order
 * - Handle null, undefined, and primitive types
 *
 * @param request - The request data to normalize
 * @returns Normalized request data
 */
export function normalizeRequest(request: unknown): unknown {
  // Handle null and undefined
  if (request === null || request === undefined) {
    return request;
  }

  // Handle primitive types
  if (typeof request !== 'object') {
    // Normalize floating point numbers
    if (typeof request === 'number' && !Number.isInteger(request)) {
      return parseFloat(request.toFixed(6));
    }
    return request;
  }

  // Handle arrays
  if (Array.isArray(request)) {
    return request.map(item => normalizeRequest(item));
  }

  // Handle objects - sort keys and normalize values
  const normalized: Record<string, unknown> = {};
  const sortedKeys = Object.keys(request).sort();

  for (const key of sortedKeys) {
    const value = (request as Record<string, unknown>)[key];
    normalized[key] = normalizeRequest(value);
  }

  return normalized;
}

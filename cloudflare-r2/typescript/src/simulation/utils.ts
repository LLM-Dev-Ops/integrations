/**
 * Utility functions for simulation support
 * @module @studiorack/cloudflare-r2/simulation
 */

import { sha256Hex } from '../signing/index.js';
import type { RecordedRequest, SimulationStore } from './types.js';
import type { HttpRequest } from '../transport/index.js';

/**
 * Generate an ETag for object data
 *
 * Uses SHA-256 hash of the data, formatted as a quoted hex string.
 * This matches the S3 ETag format for non-multipart uploads.
 *
 * @param data - Object data
 * @returns ETag string with quotes
 */
export function generateETag(data: Uint8Array): string {
  const hash = sha256Hex(data);
  // Take first 32 characters (MD5 length) for compatibility
  const truncated = hash.substring(0, 32);
  return `"${truncated}"`;
}

/**
 * Check if a recorded request matches an actual request
 *
 * Compares method, URL, and headers (excluding ignored headers).
 *
 * @param recorded - Recorded request from store
 * @param actual - Actual HTTP request
 * @param ignoreHeaders - Headers to ignore during comparison
 * @returns True if requests match
 */
export function matchRequest(
  recorded: RecordedRequest,
  actual: HttpRequest,
  ignoreHeaders: string[] = []
): boolean {
  // Method must match
  if (recorded.method !== actual.method) {
    return false;
  }

  // URL must match (case-sensitive)
  if (recorded.url !== actual.url) {
    return false;
  }

  // Compare headers (case-insensitive keys)
  const recordedHeaders = normalizeHeaders(recorded.headers, ignoreHeaders);
  const actualHeaders = normalizeHeaders(actual.headers, ignoreHeaders);

  const recordedKeys = Object.keys(recordedHeaders).sort();
  const actualKeys = Object.keys(actualHeaders).sort();

  // Keys must match
  if (recordedKeys.length !== actualKeys.length) {
    return false;
  }

  for (let i = 0; i < recordedKeys.length; i++) {
    if (recordedKeys[i] !== actualKeys[i]) {
      return false;
    }
  }

  // Values must match
  for (const key of recordedKeys) {
    if (recordedHeaders[key] !== actualHeaders[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Serialize a simulation store to JSON string
 *
 * Handles Uint8Array serialization by converting to base64.
 *
 * @param store - Simulation store
 * @returns JSON string
 */
export function serializeStore(store: SimulationStore): string {
  // Convert Uint8Arrays to base64 for JSON serialization
  const serializable = {
    ...store,
    recordings: store.recordings.map((recording) => ({
      request: {
        ...recording.request,
        body: recording.request.body
          ? arrayBufferToBase64(recording.request.body)
          : undefined,
      },
      response: {
        ...recording.response,
        body: arrayBufferToBase64(recording.response.body),
      },
    })),
  };

  return JSON.stringify(serializable, null, 2);
}

/**
 * Deserialize a simulation store from JSON string
 *
 * Handles base64 to Uint8Array conversion.
 *
 * @param json - JSON string
 * @returns Simulation store
 */
export function deserializeStore(json: string): SimulationStore {
  const parsed = JSON.parse(json);

  // Convert base64 back to Uint8Arrays
  const recordings = parsed.recordings.map((recording: any) => ({
    request: {
      ...recording.request,
      body: recording.request.body
        ? base64ToArrayBuffer(recording.request.body)
        : undefined,
    },
    response: {
      ...recording.response,
      body: base64ToArrayBuffer(recording.response.body),
    },
  }));

  return {
    ...parsed,
    recordings,
  };
}

/**
 * Normalize headers for comparison
 *
 * Converts all header names to lowercase and removes ignored headers.
 *
 * @param headers - Original headers
 * @param ignoreHeaders - Headers to ignore
 * @returns Normalized headers
 */
function normalizeHeaders(
  headers: Record<string, string>,
  ignoreHeaders: string[]
): Record<string, string> {
  const normalized: Record<string, string> = {};
  const ignoreSet = new Set(ignoreHeaders.map((h) => h.toLowerCase()));

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (!ignoreSet.has(lowerKey)) {
      normalized[lowerKey] = value;
    }
  }

  return normalized;
}

/**
 * Convert Uint8Array to base64 string
 */
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a random upload ID for multipart uploads
 */
export function generateUploadId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * Generate a request ID for mock responses
 */
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15).toUpperCase();
}

/**
 * Calculate total size from multiple byte arrays
 */
export function calculateTotalSize(parts: Uint8Array[]): number {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

/**
 * Concatenate multiple Uint8Arrays into one
 */
export function concatenateArrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = calculateTotalSize(arrays);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

/**
 * Check if a key matches a prefix
 */
export function matchesPrefix(key: string, prefix?: string): boolean {
  if (!prefix) {
    return true;
  }
  return key.startsWith(prefix);
}

/**
 * Extract common prefixes from keys
 */
export function extractCommonPrefixes(
  keys: string[],
  prefix: string = '',
  delimiter: string = '/'
): string[] {
  const prefixes = new Set<string>();

  for (const key of keys) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    const remaining = key.substring(prefix.length);
    const delimiterIndex = remaining.indexOf(delimiter);

    if (delimiterIndex > 0) {
      const commonPrefix = prefix + remaining.substring(0, delimiterIndex + 1);
      prefixes.add(commonPrefix);
    }
  }

  return Array.from(prefixes).sort();
}

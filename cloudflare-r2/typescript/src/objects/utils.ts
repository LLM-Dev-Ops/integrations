/**
 * Utility functions for object operations
 * @module @studiorack/cloudflare-r2/objects/utils
 */

import { getHeader } from '../transport/index.js';

/**
 * Builds a full URL for an object operation
 *
 * Constructs the URL in path-style format: {endpoint}/{bucket}/{key}
 * R2 only supports path-style URLs (not virtual-hosted style).
 *
 * @param endpoint - R2 endpoint URL (e.g., https://[account-id].r2.cloudflarestorage.com)
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Full object URL
 *
 * @example
 * ```typescript
 * const url = buildObjectUrl(
 *   'https://abc123.r2.cloudflarestorage.com',
 *   'my-bucket',
 *   'path/to/file.txt'
 * );
 * // Result: 'https://abc123.r2.cloudflarestorage.com/my-bucket/path/to/file.txt'
 * ```
 */
export function buildObjectUrl(endpoint: string, bucket: string, key: string): string {
  // Remove trailing slash from endpoint
  const baseUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;

  // Encode the key properly
  const encodedKey = encodeKey(key);

  return `${baseUrl}/${bucket}/${encodedKey}`;
}

/**
 * Encodes an object key for use in URLs
 *
 * S3/R2 keys need special URL encoding:
 * - Use encodeURIComponent for each path segment
 * - Don't encode forward slashes (/) between segments
 * - Encode spaces as %20 (not +)
 *
 * @param key - Object key to encode
 * @returns URL-encoded key
 *
 * @example
 * ```typescript
 * encodeKey('path/to/my file.txt');     // 'path/to/my%20file.txt'
 * encodeKey('file with spaces.txt');    // 'file%20with%20spaces.txt'
 * encodeKey('special!@#$.txt');         // 'special!%40%23%24.txt'
 * ```
 */
export function encodeKey(key: string): string {
  // Split by forward slash to preserve path structure
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Extracts custom metadata from response headers
 *
 * R2 custom metadata is stored in headers with the prefix 'x-amz-meta-'.
 * This function extracts all such headers and returns them as a plain object.
 *
 * @param headers - HTTP response headers
 * @returns Custom metadata object without the x-amz-meta- prefix
 *
 * @example
 * ```typescript
 * const headers = {
 *   'content-type': 'text/plain',
 *   'x-amz-meta-author': 'John Doe',
 *   'x-amz-meta-created-by': 'app-v1.0',
 *   'etag': '"abc123"'
 * };
 *
 * const metadata = extractMetadata(headers);
 * // Result: { author: 'John Doe', 'created-by': 'app-v1.0' }
 * ```
 */
export function extractMetadata(headers: Record<string, string>): Record<string, string> {
  const metadata: Record<string, string> = {};
  const prefix = 'x-amz-meta-';

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith(prefix)) {
      // Remove the prefix and add to metadata
      const metadataKey = lowerKey.slice(prefix.length);
      metadata[metadataKey] = value;
    }
  }

  return metadata;
}

/**
 * Builds headers for custom metadata
 *
 * Converts a metadata object into x-amz-meta-* headers for requests.
 * Each key in the metadata object becomes a separate header.
 *
 * @param metadata - Custom metadata object
 * @returns Headers object with x-amz-meta-* prefixes
 *
 * @example
 * ```typescript
 * const metadata = {
 *   author: 'John Doe',
 *   version: '1.0',
 *   'created-by': 'app'
 * };
 *
 * const headers = buildMetadataHeaders(metadata);
 * // Result: {
 * //   'x-amz-meta-author': 'John Doe',
 * //   'x-amz-meta-version': '1.0',
 * //   'x-amz-meta-created-by': 'app'
 * // }
 * ```
 */
export function buildMetadataHeaders(
  metadata?: Record<string, string>
): Record<string, string> {
  if (!metadata) {
    return {};
  }

  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Convert to lowercase for consistency
    const headerKey = `x-amz-meta-${key.toLowerCase()}`;
    headers[headerKey] = value;
  }

  return headers;
}

/**
 * Parses a date from a header value
 *
 * Handles both ISO 8601 format and HTTP date format.
 *
 * @param value - Date string from header
 * @returns Parsed Date object or undefined
 */
export function parseHeaderDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return isNaN(timestamp) ? undefined : new Date(timestamp);
}

/**
 * Extracts common object metadata from response headers
 *
 * Parses standard S3/R2 headers into a structured metadata object.
 *
 * @param headers - HTTP response headers
 * @returns Structured metadata
 */
export function extractObjectMetadata(headers: Record<string, string>): {
  contentType?: string;
  contentLength?: number;
  eTag?: string;
  lastModified?: Date;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  expires?: Date;
  versionId?: string;
  serverSideEncryption?: string;
  expiration?: string;
  acceptRanges?: string;
  contentRange?: string;
} {
  const contentLengthStr = getHeader(headers, 'content-length');
  const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : undefined;

  const eTagRaw = getHeader(headers, 'etag');
  const eTag = eTagRaw ? eTagRaw.replace(/^"|"$/g, '') : undefined;

  const lastModifiedStr = getHeader(headers, 'last-modified');
  const lastModified = parseHeaderDate(lastModifiedStr);

  const expiresStr = getHeader(headers, 'expires');
  const expires = parseHeaderDate(expiresStr);

  return {
    contentType: getHeader(headers, 'content-type'),
    contentLength,
    eTag,
    lastModified,
    cacheControl: getHeader(headers, 'cache-control'),
    contentDisposition: getHeader(headers, 'content-disposition'),
    contentEncoding: getHeader(headers, 'content-encoding'),
    contentLanguage: getHeader(headers, 'content-language'),
    expires,
    versionId: getHeader(headers, 'x-amz-version-id'),
    serverSideEncryption: getHeader(headers, 'x-amz-server-side-encryption'),
    expiration: getHeader(headers, 'x-amz-expiration'),
    acceptRanges: getHeader(headers, 'accept-ranges'),
    contentRange: getHeader(headers, 'content-range'),
  };
}

/**
 * Builds query string from object parameters
 *
 * Used for operations that require query parameters (e.g., list, versionId).
 *
 * @param params - Query parameters
 * @returns URL-encoded query string with leading '?' or empty string
 */
export function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/**
 * Normalizes body content to Uint8Array
 *
 * Converts various body types to Uint8Array for transport.
 *
 * @param body - Body content (string, Buffer, or Uint8Array)
 * @returns Uint8Array representation
 */
export function normalizeBody(body: string | Buffer | Uint8Array): Uint8Array {
  if (typeof body === 'string') {
    return new TextEncoder().encode(body);
  }

  if (body instanceof Buffer) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  return body;
}

/**
 * Checks if a body is a stream
 *
 * @param body - Body to check
 * @returns True if body is a ReadableStream
 */
export function isStream(body: unknown): body is ReadableStream<Uint8Array> {
  return (
    body !== null &&
    typeof body === 'object' &&
    'getReader' in body &&
    typeof (body as ReadableStream<Uint8Array>).getReader === 'function'
  );
}

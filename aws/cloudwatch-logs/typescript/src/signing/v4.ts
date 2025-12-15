/**
 * AWS Signature Version 4 (SigV4) Implementation
 *
 * Implements the AWS Signature Version 4 signing process for authenticating
 * requests to AWS services.
 *
 * @see https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
 */

import {
  canonicalHeaders,
  canonicalQueryString,
  normalizeUriPath,
} from './canonical';
import { SigningKeyCache } from './cache';
import { SigningError } from './error';
import type { SignedRequest, SigningParams } from './types';

/**
 * AWS Signature V4 algorithm identifier.
 */
const ALGORITHM = 'AWS4-HMAC-SHA256';

/**
 * Termination string for signing key derivation.
 */
const AWS4_REQUEST = 'aws4_request';

/**
 * Global signing key cache instance.
 */
const signingKeyCache = new SigningKeyCache();

/**
 * Compute SHA-256 hash of data.
 *
 * @param data - Data to hash
 * @returns Hex-encoded SHA-256 hash
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return arrayBufferToHex(hashBuffer);
}

/**
 * Compute HMAC-SHA256 signature.
 *
 * @param key - Signing key
 * @param data - Data to sign
 * @returns HMAC signature as ArrayBuffer
 */
async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  return crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
}

/**
 * Convert ArrayBuffer to hex string.
 *
 * @param buffer - ArrayBuffer to convert
 * @returns Hex-encoded string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Format date as ISO 8601 basic format (YYYYMMDD).
 *
 * @param date - Date to format
 * @returns Date string in YYYYMMDD format
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format date as ISO 8601 basic format with time (YYYYMMDDTHHMMSSZ).
 *
 * @param date - Date to format
 * @returns Datetime string in ISO 8601 basic format
 */
function formatDateTime(date: Date): string {
  const dateStr = formatDate(date);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${dateStr}T${hours}${minutes}${seconds}Z`;
}

/**
 * Create the canonical request string.
 *
 * Format:
 * ```
 * HTTPMethod + '\n' +
 * CanonicalURI + '\n' +
 * CanonicalQueryString + '\n' +
 * CanonicalHeaders + '\n' +
 * SignedHeaders + '\n' +
 * HashedPayload
 * ```
 *
 * @param method - HTTP method (uppercase)
 * @param path - URI path
 * @param query - Query string parameters
 * @param headers - Canonical headers string
 * @param signedHeaders - Signed headers list
 * @param payloadHash - Hex-encoded SHA-256 hash of payload
 * @returns Canonical request string
 */
export function createCanonicalRequest(
  method: string,
  path: string,
  query: string,
  headers: string,
  signedHeaders: string,
  payloadHash: string
): string {
  return [
    method.toUpperCase(),
    normalizeUriPath(path),
    query,
    headers,
    signedHeaders,
    payloadHash,
  ].join('\n');
}

/**
 * Create the string to sign.
 *
 * Format:
 * ```
 * Algorithm + '\n' +
 * RequestDateTime + '\n' +
 * CredentialScope + '\n' +
 * HashedCanonicalRequest
 * ```
 *
 * @param datetime - Request datetime in ISO 8601 basic format
 * @param scope - Credential scope (date/region/service/aws4_request)
 * @param canonicalRequestHash - Hex-encoded SHA-256 hash of canonical request
 * @returns String to sign
 */
export function createStringToSign(
  datetime: string,
  scope: string,
  canonicalRequestHash: string
): string {
  return [ALGORITHM, datetime, scope, canonicalRequestHash].join('\n');
}

/**
 * Calculate the signature.
 *
 * @param signingKey - Derived signing key
 * @param stringToSign - String to sign
 * @returns Hex-encoded signature
 */
export async function calculateSignature(
  signingKey: ArrayBuffer,
  stringToSign: string
): Promise<string> {
  const signature = await hmacSha256(signingKey, stringToSign);
  return arrayBufferToHex(signature);
}

/**
 * Derive the signing key from AWS credentials.
 *
 * The signing key is derived using the following steps:
 * 1. kDate = HMAC-SHA256("AWS4" + SecretAccessKey, Date)
 * 2. kRegion = HMAC-SHA256(kDate, Region)
 * 3. kService = HMAC-SHA256(kRegion, Service)
 * 4. kSigning = HMAC-SHA256(kService, "aws4_request")
 *
 * @param secret - AWS secret access key
 * @param date - Date in YYYYMMDD format
 * @param region - AWS region
 * @param service - AWS service name
 * @returns Derived signing key
 */
export async function deriveSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  // Check cache first
  const cached = await signingKeyCache.get(date, region, service);
  if (cached) {
    return cached;
  }

  // Derive the signing key
  const encoder = new TextEncoder();
  const kSecret = encoder.encode(`AWS4${secret}`).buffer;

  const kDate = await hmacSha256(kSecret, date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, AWS4_REQUEST);

  // Cache the derived key
  await signingKeyCache.set(date, region, service, kSigning);

  return kSigning;
}

/**
 * Build the Authorization header value.
 *
 * Format:
 * ```
 * AWS4-HMAC-SHA256 Credential=AccessKeyId/CredentialScope,
 * SignedHeaders=SignedHeaders, Signature=Signature
 * ```
 *
 * @param accessKeyId - AWS access key ID
 * @param credentialScope - Credential scope
 * @param signedHeaders - Semicolon-separated list of signed header names
 * @param signature - Hex-encoded signature
 * @returns Authorization header value
 */
export function buildAuthorizationHeader(
  accessKeyId: string,
  credentialScope: string,
  signedHeaders: string,
  signature: string
): string {
  return [
    `${ALGORITHM} Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');
}

/**
 * Sign an HTTP request using AWS Signature Version 4.
 *
 * This function:
 * 1. Adds required headers (Host, X-Amz-Date, X-Amz-Security-Token if present)
 * 2. Creates canonical request
 * 3. Creates string to sign
 * 4. Derives signing key
 * 5. Calculates signature
 * 6. Adds Authorization header
 *
 * @param request - Request to sign
 * @param params - Signing parameters
 * @returns Signed request with Authorization header
 * @throws {SigningError} If request URL is invalid or signing fails
 *
 * @example
 * ```typescript
 * const request = new Request('https://logs.us-east-1.amazonaws.com/', {
 *   method: 'POST',
 *   body: JSON.stringify({ /* CloudWatch Logs API request *\/ }),
 * });
 *
 * const params: SigningParams = {
 *   region: 'us-east-1',
 *   service: 'logs',
 *   credentials: {
 *     accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *     secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   },
 * };
 *
 * const signed = await signRequest(request, params);
 * // signed.headers['authorization'] contains the signature
 * ```
 */
export async function signRequest(
  request: Request,
  params: SigningParams
): Promise<SignedRequest> {
  try {
    // Parse URL
    const url = new URL(request.url);

    // Use provided date or current time
    const date = params.date || new Date();
    const dateStr = formatDate(date);
    const datetime = formatDateTime(date);

    // Clone headers and add required AWS headers
    const headers = new Headers(request.headers);

    // Add host header
    headers.set('host', url.host);

    // Add timestamp
    headers.set('x-amz-date', datetime);

    // Add security token if present (for temporary credentials)
    if (params.credentials.sessionToken) {
      headers.set('x-amz-security-token', params.credentials.sessionToken);
    }

    // Compute payload hash
    let payloadHash: string;
    let bodyText: string | undefined;

    if (request.method === 'GET' || request.method === 'HEAD') {
      payloadHash = await sha256('');
    } else if (request.body) {
      // Read body as text (can only be done once)
      bodyText = await request.text();
      payloadHash = await sha256(bodyText);
    } else {
      payloadHash = await sha256('');
    }

    // Add payload hash header (required for some AWS services)
    headers.set('x-amz-content-sha256', payloadHash);

    // Create canonical request components
    const { canonical: canonicalHeadersStr, signed: signedHeadersList } =
      canonicalHeaders(headers);

    const canonicalQueryStr = canonicalQueryString(url.searchParams);

    const canonicalRequest = createCanonicalRequest(
      request.method,
      url.pathname,
      canonicalQueryStr,
      canonicalHeadersStr,
      signedHeadersList,
      payloadHash
    );

    // Create string to sign
    const credentialScope = `${dateStr}/${params.region}/${params.service}/${AWS4_REQUEST}`;
    const canonicalRequestHash = await sha256(canonicalRequest);
    const stringToSign = createStringToSign(datetime, credentialScope, canonicalRequestHash);

    // Derive signing key and calculate signature
    const signingKey = await deriveSigningKey(
      params.credentials.secretAccessKey,
      dateStr,
      params.region,
      params.service
    );

    const signature = await calculateSignature(signingKey, stringToSign);

    // Build Authorization header
    const authHeader = buildAuthorizationHeader(
      params.credentials.accessKeyId,
      credentialScope,
      signedHeadersList,
      signature
    );

    // Add Authorization header
    headers.set('authorization', authHeader);

    // Build signed request
    const signedHeaders: Record<string, string> = {};
    for (const [name, value] of headers.entries()) {
      signedHeaders[name] = value;
    }

    return {
      headers: signedHeaders,
      url: url.toString(),
      method: request.method,
      body: bodyText,
    };
  } catch (error) {
    if (error instanceof SigningError) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes('URL')) {
      throw new SigningError(
        `Invalid request URL: ${error.message}`,
        'INVALID_URL'
      );
    }

    throw new SigningError(
      `Failed to sign request: ${error instanceof Error ? error.message : String(error)}`,
      'SIGNING_FAILED'
    );
  }
}

/**
 * Get the signing key cache instance.
 *
 * Useful for cache management operations like cleanup.
 *
 * @returns Global signing key cache
 *
 * @example
 * ```typescript
 * const cache = getSigningKeyCache();
 * setInterval(() => {
 *   const removed = cache.cleanup();
 *   console.log(`Cleaned up ${removed} expired signing keys`);
 * }, 3600000); // Clean up every hour
 * ```
 */
export function getSigningKeyCache(): SigningKeyCache {
  return signingKeyCache;
}

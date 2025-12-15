/**
 * AWS Signature Version 4 (SigV4) Implementation
 *
 * Implements the AWS Signature Version 4 signing process for authenticating
 * requests to AWS Secrets Manager.
 *
 * @see https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
 * @module signing
 */

import type { AwsCredentials, SignedRequest, SigningParams } from '../types/index.js';

/**
 * AWS Signature V4 algorithm identifier.
 */
const ALGORITHM = 'AWS4-HMAC-SHA256';

/**
 * Termination string for signing key derivation.
 */
const AWS4_REQUEST = 'aws4_request';

/**
 * Headers that should never be signed.
 */
const HEADERS_TO_IGNORE = new Set([
  'authorization',
  'content-length',
  'user-agent',
  'expect',
  'x-amzn-trace-id',
]);

/**
 * Signing key cache to avoid re-deriving keys.
 */
const signingKeyCache = new Map<string, { key: ArrayBuffer; expires: number }>();

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
    .map((byte) => byte.toString(16).padStart(2, '0'))
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
 * URI encode a string following AWS rules.
 *
 * @param str - String to encode
 * @returns URI encoded string
 */
function uriEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Normalize URI path for signing.
 *
 * @param path - URI path
 * @returns Normalized path
 */
function normalizeUriPath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }

  // Split, encode, and rejoin
  const segments = path.split('/');
  const encoded = segments.map((segment) => {
    if (!segment) return '';
    return uriEncode(segment);
  });

  return encoded.join('/') || '/';
}

/**
 * Create canonical query string.
 *
 * @param searchParams - URL search parameters
 * @returns Canonical query string
 */
function canonicalQueryString(searchParams: URLSearchParams): string {
  const params: Array<[string, string]> = [];

  for (const [key, value] of searchParams.entries()) {
    params.push([uriEncode(key), uriEncode(value)]);
  }

  // Sort by parameter name, then value
  params.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });

  return params.map(([k, v]) => `${k}=${v}`).join('&');
}

/**
 * Create canonical headers and signed headers list.
 *
 * @param headers - Request headers
 * @returns Object with canonical headers string and signed headers list
 */
function canonicalHeaders(
  headers: Record<string, string>
): { canonical: string; signed: string } {
  const headerMap = new Map<string, string[]>();

  const headerEntries = Object.entries(headers);

  for (const [name, value] of headerEntries) {
    const lowerName = name.toLowerCase();

    if (HEADERS_TO_IGNORE.has(lowerName)) {
      continue;
    }

    // Trim and normalize whitespace
    const trimmedValue = value.trim().replace(/\s+/g, ' ');

    if (headerMap.has(lowerName)) {
      headerMap.get(lowerName)!.push(trimmedValue);
    } else {
      headerMap.set(lowerName, [trimmedValue]);
    }
  }

  // Sort by header name
  const sortedNames = Array.from(headerMap.keys()).sort();

  // Build canonical headers string
  const canonicalLines = sortedNames.map((name) => {
    const values = headerMap.get(name)!.join(',');
    return `${name}:${values}`;
  });

  return {
    canonical: canonicalLines.join('\n') + '\n',
    signed: sortedNames.join(';'),
  };
}

/**
 * Derive the signing key from AWS credentials.
 *
 * @param secret - AWS secret access key
 * @param date - Date in YYYYMMDD format
 * @param region - AWS region
 * @param service - AWS service name
 * @returns Derived signing key
 */
async function deriveSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  // Check cache
  const cacheKey = `${date}:${region}:${service}`;
  const cached = signingKeyCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.key;
  }

  // Derive the signing key
  const encoder = new TextEncoder();
  const kSecret = encoder.encode(`AWS4${secret}`).buffer;

  const kDate = await hmacSha256(kSecret, date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, AWS4_REQUEST);

  // Cache for 5 minutes (keys are valid for the day, but we refresh earlier)
  signingKeyCache.set(cacheKey, {
    key: kSigning,
    expires: Date.now() + 5 * 60 * 1000,
  });

  // Cleanup old cache entries
  const now = Date.now();
  for (const [key, value] of signingKeyCache.entries()) {
    if (value.expires < now) {
      signingKeyCache.delete(key);
    }
  }

  return kSigning;
}

/**
 * Sign an HTTP request using AWS Signature Version 4.
 *
 * @param method - HTTP method
 * @param url - Request URL
 * @param headers - Request headers
 * @param body - Request body
 * @param params - Signing parameters
 * @returns Signed request with Authorization header
 */
export async function signRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  params: SigningParams
): Promise<SignedRequest> {
  // Parse URL
  const parsedUrl = new URL(url);

  // Use provided date or current time
  const date = params.date || new Date();
  const dateStr = formatDate(date);
  const datetime = formatDateTime(date);

  // Clone headers and add required AWS headers
  const signedHeaders: Record<string, string> = { ...headers };

  // Add host header
  signedHeaders['host'] = parsedUrl.host;

  // Add timestamp
  signedHeaders['x-amz-date'] = datetime;

  // Add security token if present (for temporary credentials)
  if (params.credentials.sessionToken) {
    signedHeaders['x-amz-security-token'] = params.credentials.sessionToken;
  }

  // Compute payload hash
  const payloadHash = await sha256(body || '');

  // Add payload hash header
  signedHeaders['x-amz-content-sha256'] = payloadHash;

  // Create canonical request components
  const { canonical: canonicalHeadersStr, signed: signedHeadersList } = canonicalHeaders(
    signedHeaders
  );

  const canonicalQueryStr = canonicalQueryString(parsedUrl.searchParams);

  const canonicalRequest = [
    method.toUpperCase(),
    normalizeUriPath(parsedUrl.pathname),
    canonicalQueryStr,
    canonicalHeadersStr,
    signedHeadersList,
    payloadHash,
  ].join('\n');

  // Create string to sign
  const credentialScope = `${dateStr}/${params.region}/${params.service}/${AWS4_REQUEST}`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = [ALGORITHM, datetime, credentialScope, canonicalRequestHash].join('\n');

  // Derive signing key and calculate signature
  const signingKey = await deriveSigningKey(
    params.credentials.secretAccessKey,
    dateStr,
    params.region,
    params.service
  );

  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = arrayBufferToHex(signatureBuffer);

  // Build Authorization header
  const authHeader = [
    `${ALGORITHM} Credential=${params.credentials.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeadersList}`,
    `Signature=${signature}`,
  ].join(', ');

  // Add Authorization header
  signedHeaders['authorization'] = authHeader;

  return {
    headers: signedHeaders,
    url: url,
    method: method,
    body: body,
  };
}

export { AwsCredentials, SignedRequest, SigningParams };

/**
 * AWS Canonical Request Building
 *
 * Functions for creating canonical requests according to AWS Signature V4 specification.
 *
 * @see https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
 */

import { SigningError } from './error';

/**
 * URI encode a string for AWS Signature V4.
 *
 * AWS requires specific encoding:
 * - URI encode every byte except unreserved characters (A-Z, a-z, 0-9, hyphen, underscore, period, tilde)
 * - Encode space as %20 (not +)
 * - Encode forward slashes based on encodeSlash parameter
 *
 * @param input - String to encode
 * @param encodeSlash - Whether to encode forward slashes (default: true)
 * @returns URI-encoded string
 *
 * @example
 * ```typescript
 * uriEncode('hello world', true); // 'hello%20world'
 * uriEncode('path/to/file', false); // 'path/to/file'
 * uriEncode('path/to/file', true); // 'path%2Fto%2Ffile'
 * ```
 */
export function uriEncode(input: string, encodeSlash: boolean = true): string {
  const encoded = encodeURIComponent(input);

  // Fix encoding to match AWS requirements
  return encoded
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%2F/g, encodeSlash ? '%2F' : '/');
}

/**
 * Normalize a URI path for canonical request.
 *
 * AWS requirements:
 * - Normalize URI paths according to RFC 3986
 * - Remove redundant and relative path components
 * - Preserve trailing slash if present
 * - URI-encode each path segment
 *
 * @param path - URI path to normalize
 * @returns Normalized canonical path
 *
 * @example
 * ```typescript
 * normalizeUriPath('/'); // '/'
 * normalizeUriPath(''); // '/'
 * normalizeUriPath('/path/to/resource'); // '/path/to/resource'
 * normalizeUriPath('/path//to///resource'); // '/path/to/resource'
 * normalizeUriPath('/path/./to/../resource'); // '/path/resource'
 * ```
 */
export function normalizeUriPath(path: string): string {
  // Empty path or just '/' returns '/'
  if (!path || path === '/') {
    return '/';
  }

  // Split path into segments
  const segments = path.split('/');
  const normalized: string[] = [];

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      // Skip empty segments and current directory references
      continue;
    } else if (segment === '..') {
      // Parent directory - remove last segment if present
      if (normalized.length > 0) {
        normalized.pop();
      }
    } else {
      // Normal segment - URI encode it
      normalized.push(uriEncode(segment, false));
    }
  }

  // Reconstruct path
  let result = '/' + normalized.join('/');

  // Preserve trailing slash if original path had one
  if (path.endsWith('/') && !result.endsWith('/')) {
    result += '/';
  }

  return result;
}

/**
 * Create canonical query string from URL search parameters.
 *
 * AWS requirements:
 * - Sort parameters by name (case-sensitive)
 * - URI-encode parameter names and values
 * - Separate parameters with &
 * - Use = to separate names and values
 * - Parameters with no value should include = with empty value
 *
 * @param params - URL search parameters
 * @returns Canonical query string
 *
 * @example
 * ```typescript
 * const params = new URLSearchParams('foo=bar&baz=qux');
 * canonicalQueryString(params); // 'baz=qux&foo=bar'
 *
 * const params2 = new URLSearchParams('foo=bar&foo=baz');
 * canonicalQueryString(params2); // 'foo=bar&foo=baz'
 * ```
 */
export function canonicalQueryString(params: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];

  // Collect all parameter pairs
  for (const [key, value] of params.entries()) {
    pairs.push([uriEncode(key, true), uriEncode(value, true)]);
  }

  // Sort by parameter name, then by value
  pairs.sort((a, b) => {
    if (a[0] !== b[0]) {
      return a[0].localeCompare(b[0]);
    }
    return a[1].localeCompare(b[1]);
  });

  // Build query string
  return pairs.map(([key, value]) => `${key}=${value}`).join('&');
}

/**
 * Header names that should be included in signing.
 */
const SIGNED_HEADERS = new Set([
  'host',
  'content-type',
  'x-amz-date',
  'x-amz-target',
  'x-amz-security-token',
  'x-amz-content-sha256',
]);

/**
 * Header prefixes that should be included in signing.
 */
const SIGNED_HEADER_PREFIXES = ['x-amz-'];

/**
 * Determine if a header should be included in the signature.
 *
 * AWS requirements:
 * - Always include: host, content-type, and all x-amz-* headers
 * - Never include: Authorization header
 * - Never include: User-Agent header (optional)
 *
 * @param name - Header name (case-insensitive)
 * @returns true if header should be signed
 *
 * @example
 * ```typescript
 * shouldSignHeader('host'); // true
 * shouldSignHeader('x-amz-date'); // true
 * shouldSignHeader('authorization'); // false
 * shouldSignHeader('user-agent'); // false
 * ```
 */
export function shouldSignHeader(name: string): boolean {
  const lowerName = name.toLowerCase();

  // Never sign these headers
  if (lowerName === 'authorization' || lowerName === 'user-agent') {
    return false;
  }

  // Always sign these specific headers
  if (SIGNED_HEADERS.has(lowerName)) {
    return true;
  }

  // Sign headers with these prefixes
  return SIGNED_HEADER_PREFIXES.some(prefix => lowerName.startsWith(prefix));
}

/**
 * Create canonical headers string and signed headers list.
 *
 * AWS requirements:
 * - Convert header names to lowercase
 * - Sort headers by name (case-sensitive after lowercasing)
 * - Trim whitespace from header values
 * - Convert sequential spaces to single space
 * - Include all headers that should be signed
 *
 * @param headers - Request headers
 * @returns Object with canonical headers string and signed headers list
 * @throws {SigningError} If required 'host' header is missing
 *
 * @example
 * ```typescript
 * const headers = new Headers({
 *   'Host': 'logs.us-east-1.amazonaws.com',
 *   'X-Amz-Date': '20231201T120000Z',
 *   'Content-Type': 'application/x-amz-json-1.1'
 * });
 *
 * const result = canonicalHeaders(headers);
 * // result.canonical: 'content-type:application/x-amz-json-1.1\nhost:logs.us-east-1.amazonaws.com\nx-amz-date:20231201T120000Z\n'
 * // result.signed: 'content-type;host;x-amz-date'
 * ```
 */
export function canonicalHeaders(headers: Headers): { canonical: string; signed: string } {
  const headerMap = new Map<string, string>();

  // Collect headers that should be signed
  for (const [name, value] of headers.entries()) {
    if (shouldSignHeader(name)) {
      const lowerName = name.toLowerCase();

      // Trim and normalize whitespace in header value
      const normalizedValue = value.trim().replace(/\s+/g, ' ');

      // Handle duplicate headers by concatenating with commas
      if (headerMap.has(lowerName)) {
        headerMap.set(lowerName, `${headerMap.get(lowerName)},${normalizedValue}`);
      } else {
        headerMap.set(lowerName, normalizedValue);
      }
    }
  }

  // Verify required headers
  if (!headerMap.has('host')) {
    throw new SigningError('Missing required header: host', 'MISSING_HEADER');
  }

  // Sort headers by name
  const sortedHeaders = Array.from(headerMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  // Build canonical headers string (each header on new line, ends with newline)
  const canonical = sortedHeaders
    .map(([name, value]) => `${name}:${value}`)
    .join('\n') + '\n';

  // Build signed headers list (semicolon-separated)
  const signed = sortedHeaders
    .map(([name]) => name)
    .join(';');

  return { canonical, signed };
}

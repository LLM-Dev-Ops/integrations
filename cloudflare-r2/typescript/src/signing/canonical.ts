/**
 * Canonical request construction for S3 Signature V4
 * Based on SPARC specification section 3.2
 */

/**
 * URI encode following S3 requirements (RFC 3986)
 * Different from standard encodeURIComponent
 */
export function uriEncode(str: string, encodeSlash = true): string {
  let encoded = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = char.charCodeAt(0);

    // Unreserved characters: A-Z a-z 0-9 - _ . ~
    if (
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
      (code >= 0x30 && code <= 0x39) || // 0-9
      code === 0x2d || // -
      code === 0x5f || // _
      code === 0x2e || // .
      code === 0x7e // ~
    ) {
      encoded += char;
    } else if (char === '/' && !encodeSlash) {
      encoded += '/';
    } else {
      // Encode as UTF-8 bytes
      const utf8 = new TextEncoder().encode(char);
      for (const byte of utf8) {
        encoded += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return encoded;
}

/**
 * URI encode path (preserve slashes)
 */
export function uriEncodePath(path: string): string {
  // Split path and encode each segment separately
  const segments = path.split('/');
  return segments.map((segment) => uriEncode(segment, true)).join('/');
}

/**
 * Get canonical URI from path
 * For S3, this is the URI-encoded path
 */
export function getCanonicalUri(path: string): string {
  if (!path || path === '') {
    return '/';
  }

  // Ensure path starts with /
  let normalized = path.startsWith('/') ? path : '/' + path;

  // Remove double slashes
  normalized = normalized.replace(/\/+/g, '/');

  // URI encode the path preserving slashes
  return uriEncodePath(normalized);
}

/**
 * Get canonical query string
 * Query parameters must be sorted by name and URI-encoded
 */
export function getCanonicalQueryString(query: string): string {
  if (!query || query === '') {
    return '';
  }

  // Parse query string
  const params: Array<[string, string]> = [];
  const pairs = query.split('&');

  for (const pair of pairs) {
    if (!pair) continue;

    const idx = pair.indexOf('=');
    if (idx === -1) {
      params.push([uriEncode(pair), '']);
    } else {
      const key = pair.substring(0, idx);
      const value = pair.substring(idx + 1);
      params.push([uriEncode(key), uriEncode(value)]);
    }
  }

  // Sort by key, then by value
  params.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });

  // Build canonical query string
  return params.map(([key, value]) => `${key}=${value}`).join('&');
}

/**
 * Get canonical headers
 * Headers must be lowercase, sorted, and trimmed
 */
export function getCanonicalHeaders(headers: Record<string, string>): string {
  const canonical: string[] = [];

  // Lowercase and sort header names
  const headerNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();

  for (const name of headerNames) {
    // Find original header (case-insensitive)
    const originalKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === name
    );
    if (!originalKey) continue;

    const value = headers[originalKey];

    // Trim and normalize whitespace in value
    const trimmed = value.trim().replace(/\s+/g, ' ');

    canonical.push(`${name}:${trimmed}`);
  }

  // Must end with newline
  return canonical.join('\n') + '\n';
}

/**
 * Get signed headers (semicolon-separated list of lowercase header names)
 */
export function getSignedHeaders(headers: Record<string, string>): string {
  return Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort()
    .join(';');
}

/**
 * Create canonical request for S3 Signature V4
 * Format:
 * HTTP_METHOD\n
 * CANONICAL_URI\n
 * CANONICAL_QUERY_STRING\n
 * CANONICAL_HEADERS\n
 * SIGNED_HEADERS\n
 * PAYLOAD_HASH
 */
export function createCanonicalRequest(
  method: string,
  path: string,
  query: string,
  headers: Record<string, string>,
  payloadHash: string
): string {
  const canonicalUri = getCanonicalUri(path);
  const canonicalQuery = getCanonicalQueryString(query);
  const canonicalHeaders = getCanonicalHeaders(headers);
  const signedHeaders = getSignedHeaders(headers);

  return [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
}

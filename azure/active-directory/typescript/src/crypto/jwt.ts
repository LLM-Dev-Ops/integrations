/**
 * JWT utilities for Azure AD OAuth2.
 *
 * Used for:
 * - Creating client assertions (certificate auth)
 * - Parsing and validating tokens
 */

import { createSign, randomUUID } from 'crypto';

/**
 * JWT header.
 */
export interface JwtHeader {
  alg: string;
  typ: string;
  x5t?: string;  // Certificate thumbprint
  kid?: string;  // Key ID
}

/**
 * JWT client assertion claims.
 */
export interface ClientAssertionClaims {
  aud: string;   // Token endpoint
  iss: string;   // Client ID
  sub: string;   // Client ID
  jti: string;   // Unique ID
  nbf: number;   // Not before
  exp: number;   // Expiry
}

/**
 * Parse a JWT without validation (for header inspection).
 */
export function parseJwtHeader(token: string): JwtHeader {
  const [headerPart] = token.split('.');
  if (!headerPart) {
    throw new Error('Invalid JWT: missing header');
  }

  try {
    const decoded = base64UrlDecode(headerPart);
    return JSON.parse(decoded.toString('utf8')) as JwtHeader;
  } catch {
    throw new Error('Invalid JWT: failed to parse header');
  }
}

/**
 * Parse JWT payload without validation.
 */
export function parseJwtPayload<T>(token: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 parts');
  }

  const payloadPart = parts[1];
  if (!payloadPart) {
    throw new Error('Invalid JWT: missing payload');
  }

  try {
    const decoded = base64UrlDecode(payloadPart);
    return JSON.parse(decoded.toString('utf8')) as T;
  } catch {
    throw new Error('Invalid JWT: failed to parse payload');
  }
}

/**
 * Create a client assertion JWT for certificate authentication.
 */
export function createClientAssertion(
  tokenEndpoint: string,
  clientId: string,
  privateKey: string,
  thumbprint: string
): string {
  const now = Math.floor(Date.now() / 1000);

  const header: JwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
    x5t: base64UrlEncodeString(thumbprint),
  };

  const claims: ClientAssertionClaims = {
    aud: tokenEndpoint,
    iss: clientId,
    sub: clientId,
    jti: randomUUID(),
    nbf: now,
    exp: now + 300,  // 5 minutes
  };

  return signJwt(header, claims, privateKey);
}

/**
 * Sign a JWT with RS256.
 */
function signJwt(header: JwtHeader, payload: object, privateKey: string): string {
  const headerEncoded = base64UrlEncodeJson(header);
  const payloadEncoded = base64UrlEncodeJson(payload);
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey);

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Base64 URL encode a buffer.
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode.
 */
function base64UrlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Base64 URL encode a string.
 */
function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(Buffer.from(str, 'utf8'));
}

/**
 * Base64 URL encode JSON.
 */
function base64UrlEncodeJson(obj: object): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(obj), 'utf8'));
}

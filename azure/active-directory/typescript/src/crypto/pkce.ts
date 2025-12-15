/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth2.
 *
 * PKCE is required for all authorization code flows as per SPARC specification.
 */

import { randomBytes, createHash } from 'crypto';

/**
 * PKCE code verifier and challenge pair.
 */
export interface PkceParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Generate PKCE parameters for authorization code flow.
 *
 * @returns PKCE code verifier and challenge
 */
export function generatePkce(): PkceParams {
  // Generate 32 random bytes for verifier (gives 43 chars base64url)
  const verifierBytes = randomBytes(32);
  const codeVerifier = base64UrlEncode(verifierBytes);

  // SHA256 hash for challenge
  const challengeBytes = createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64UrlEncode(challengeBytes);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Generate a cryptographically random state parameter.
 *
 * @returns Random state string
 */
export function generateState(): string {
  return base64UrlEncode(randomBytes(16));
}

/**
 * Base64 URL encode (no padding).
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
export function base64UrlDecode(str: string): Buffer {
  // Add padding if needed
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

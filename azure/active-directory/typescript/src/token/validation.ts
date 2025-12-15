/**
 * Token validation for Azure AD OAuth2.
 *
 * JWT signature verification and claims validation.
 */

import { createVerify } from 'crypto';
import type { TokenClaims } from '../types/index.js';
import { expiredToken, invalidToken } from '../error.js';
import { parseJwtPayload } from '../crypto/jwt.js';

/**
 * JSON Web Key.
 */
export interface JsonWebKey {
  kid: string;
  kty: string;
  use: string;
  n: string;
  e: string;
  x5c?: string[];
  x5t?: string;
}

/**
 * JWKS document.
 */
export interface JwksDocument {
  keys: JsonWebKey[];
}

/**
 * JWKS cache.
 */
export class JwksCache {
  private jwks: JwksDocument | null = null;
  private fetchedAt: number = 0;
  private readonly ttlMs: number;

  constructor(ttlMs: number = 24 * 60 * 60 * 1000) {  // 24 hours default
    this.ttlMs = ttlMs;
  }

  /**
   * Check if cache is valid.
   */
  isValid(): boolean {
    if (!this.jwks) {
      return false;
    }
    return Date.now() - this.fetchedAt < this.ttlMs;
  }

  /**
   * Get cached JWKS.
   */
  get(): JwksDocument | null {
    if (!this.isValid()) {
      return null;
    }
    return this.jwks;
  }

  /**
   * Set JWKS in cache.
   */
  set(jwks: JwksDocument): void {
    this.jwks = jwks;
    this.fetchedAt = Date.now();
  }

  /**
   * Find a key by kid.
   */
  findKey(kid: string): JsonWebKey | undefined {
    return this.jwks?.keys.find(k => k.kid === kid);
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.jwks = null;
    this.fetchedAt = 0;
  }
}

/**
 * Validate JWT claims.
 */
export function validateClaims(
  claims: TokenClaims,
  expectedAudience: string,
  expectedTenantId: string
): void {
  const now = Math.floor(Date.now() / 1000);

  // Check expiry
  if (claims.exp < now) {
    throw expiredToken(claims.exp);
  }

  // Check not before
  if (claims.nbf && claims.nbf > now) {
    throw invalidToken('Token not yet valid');
  }

  // Validate issuer (v2.0 or v1.0 format)
  const expectedIssuerV2 = `https://login.microsoftonline.com/${expectedTenantId}/v2.0`;
  const expectedIssuerV1 = `https://sts.windows.net/${expectedTenantId}/`;

  if (claims.iss !== expectedIssuerV2 && claims.iss !== expectedIssuerV1) {
    throw invalidToken(`Invalid issuer: ${claims.iss}`);
  }

  // Validate audience
  if (claims.aud !== expectedAudience) {
    throw invalidToken(`Invalid audience: ${claims.aud}`);
  }
}

/**
 * Verify JWT signature.
 */
export function verifySignature(token: string, key: JsonWebKey): TokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw invalidToken('Invalid JWT format');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;

  // Convert JWK to PEM
  const pem = jwkToPem(key);

  // Verify signature
  const signature = base64UrlDecode(signaturePart!);
  const verify = createVerify('RSA-SHA256');
  verify.update(signingInput);

  if (!verify.verify(pem, signature)) {
    throw invalidToken('Invalid signature');
  }

  return parseJwtPayload<TokenClaims>(token);
}

/**
 * Convert JWK to PEM format.
 */
function jwkToPem(jwk: JsonWebKey): string {
  // Use x5c certificate if available
  if (jwk.x5c && jwk.x5c.length > 0) {
    const cert = jwk.x5c[0];
    return `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
  }

  // Otherwise construct from n and e
  const n = base64UrlDecode(jwk.n);
  const e = base64UrlDecode(jwk.e);

  // ASN.1 encoding for RSA public key
  const modLen = n.length;
  const expLen = e.length;

  // Build DER encoded key
  const totalLen = modLen + expLen + 11;
  const seqLen = modLen + expLen + 9;

  const der = Buffer.alloc(totalLen + 4);
  let offset = 0;

  // SEQUENCE
  der[offset++] = 0x30;
  if (seqLen > 127) {
    der[offset++] = 0x82;
    der.writeUInt16BE(seqLen, offset);
    offset += 2;
  } else {
    der[offset++] = seqLen;
  }

  // INTEGER (modulus)
  der[offset++] = 0x02;
  if (modLen > 127) {
    der[offset++] = 0x82;
    der.writeUInt16BE(modLen + 1, offset);
    offset += 2;
  } else {
    der[offset++] = modLen + 1;
  }
  der[offset++] = 0x00; // Leading zero for positive integer
  n.copy(der, offset);
  offset += modLen;

  // INTEGER (exponent)
  der[offset++] = 0x02;
  der[offset++] = expLen;
  e.copy(der, offset);

  const pemBody = der.subarray(0, offset + expLen).toString('base64');
  return `-----BEGIN RSA PUBLIC KEY-----\n${pemBody}\n-----END RSA PUBLIC KEY-----`;
}

/**
 * Base64 URL decode.
 */
function base64UrlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Create a JWKS cache.
 */
export function createJwksCache(ttlMs?: number): JwksCache {
  return new JwksCache(ttlMs);
}

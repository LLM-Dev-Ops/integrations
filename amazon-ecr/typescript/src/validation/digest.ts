/**
 * Image digest validation and verification for Amazon ECR.
 *
 * This module provides validation and verification functions for image digests,
 * including format validation and content verification.
 *
 * @module validation/digest
 */

import { createHash } from 'crypto';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Regular expression for valid image digests.
 *
 * Pattern: ^(sha256|sha512):[a-f0-9]{64,128}$
 *
 * Rules:
 * - Must start with algorithm prefix (sha256 or sha512)
 * - Followed by colon
 * - Followed by hex-encoded hash
 * - sha256: 64 hex characters
 * - sha512: 128 hex characters
 */
const DIGEST_PATTERN = /^(sha256|sha512):([a-f0-9]{64,128})$/;

/**
 * Expected hash lengths for each algorithm.
 */
const HASH_LENGTHS: Record<string, number> = {
  sha256: 64,
  sha512: 128,
};

/**
 * Validates a digest format.
 *
 * Throws an EcrError with kind InvalidParameter if the digest is invalid.
 *
 * @param digest - Image digest to validate
 * @throws {EcrError} If the digest format is invalid
 *
 * @example
 * ```typescript
 * validateDigestFormat("sha256:abcd..."); // OK (if 64 hex chars)
 * validateDigestFormat("sha512:abcd..."); // OK (if 128 hex chars)
 * validateDigestFormat("md5:abcd..."); // throws: unsupported algorithm
 * validateDigestFormat("sha256:xyz"); // throws: invalid hex
 * ```
 */
export function validateDigestFormat(digest: string): void {
  if (!digest) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Digest cannot be empty',
      { statusCode: 400 }
    );
  }

  const match = DIGEST_PATTERN.exec(digest);
  if (!match) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Digest must be in format "sha256:<hex>" or "sha512:<hex>" with lowercase hexadecimal characters',
      { statusCode: 400 }
    );
  }

  const algorithm = match[1];
  const hash = match[2];

  // Validate hash length for algorithm
  const expectedLength = HASH_LENGTHS[algorithm];
  if (hash.length !== expectedLength) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Digest hash for ${algorithm} must be exactly ${expectedLength} hexadecimal characters`,
      { statusCode: 400 }
    );
  }
}

/**
 * Checks if a digest format is valid.
 *
 * @param digest - Image digest to check
 * @returns true if the digest format is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidDigest("sha256:abcd..."); // true (if properly formatted)
 * isValidDigest("md5:abcd..."); // false
 * ```
 */
export function isValidDigest(digest: string): boolean {
  try {
    validateDigestFormat(digest);
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the SHA-256 digest of content.
 *
 * @param content - Content to hash (string or Buffer)
 * @returns Digest in format "sha256:<hex>"
 *
 * @example
 * ```typescript
 * const digest = computeDigest("hello world");
 * // Returns: "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
 *
 * const buffer = Buffer.from("hello world");
 * const digest2 = computeDigest(buffer);
 * // Same result
 * ```
 */
export function computeDigest(content: string | Buffer): string {
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;
  const hash = createHash('sha256').update(buffer).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Verifies that content matches an expected digest.
 *
 * @param content - Content to verify (string or Buffer)
 * @param expectedDigest - Expected digest value
 * @returns true if the content matches the digest, false otherwise
 *
 * @example
 * ```typescript
 * const content = "hello world";
 * const digest = "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
 *
 * verifyDigest(content, digest); // true
 * verifyDigest("different", digest); // false
 * ```
 */
export function verifyDigest(
  content: string | Buffer,
  expectedDigest: string
): boolean {
  // Validate expected digest format
  try {
    validateDigestFormat(expectedDigest);
  } catch {
    return false;
  }

  // Extract algorithm from expected digest
  const colonIndex = expectedDigest.indexOf(':');
  const algorithm = expectedDigest.substring(0, colonIndex);

  // Compute digest using the same algorithm
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;

  let computedHash: string;
  if (algorithm === 'sha256') {
    computedHash = createHash('sha256').update(buffer).digest('hex');
  } else if (algorithm === 'sha512') {
    computedHash = createHash('sha512').update(buffer).digest('hex');
  } else {
    return false;
  }

  const computedDigest = `${algorithm}:${computedHash}`;
  return computedDigest === expectedDigest;
}

/**
 * Extracts the algorithm from a digest.
 *
 * @param digest - Digest to parse
 * @returns Algorithm name (e.g., "sha256", "sha512")
 * @throws {EcrError} If the digest format is invalid
 *
 * @example
 * ```typescript
 * getDigestAlgorithm("sha256:abc..."); // "sha256"
 * getDigestAlgorithm("sha512:abc..."); // "sha512"
 * ```
 */
export function getDigestAlgorithm(digest: string): string {
  validateDigestFormat(digest);
  const colonIndex = digest.indexOf(':');
  return digest.substring(0, colonIndex);
}

/**
 * Extracts the hash value from a digest.
 *
 * @param digest - Digest to parse
 * @returns Hash value (hexadecimal string)
 * @throws {EcrError} If the digest format is invalid
 *
 * @example
 * ```typescript
 * getDigestHash("sha256:abc123..."); // "abc123..."
 * ```
 */
export function getDigestHash(digest: string): string {
  validateDigestFormat(digest);
  const colonIndex = digest.indexOf(':');
  return digest.substring(colonIndex + 1);
}

/**
 * Image tag validation for Amazon ECR.
 *
 * This module provides validation functions for ECR image tags
 * according to AWS specifications.
 *
 * @module validation/image
 */

import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Regular expression for valid ECR image tags.
 *
 * Pattern: ^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$
 *
 * Rules:
 * - Must start with alphanumeric character or underscore
 * - Can contain letters (upper/lowercase), digits, periods, hyphens, and underscores
 * - Length: 1-128 characters
 */
const IMAGE_TAG_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/;

/**
 * Minimum image tag length.
 */
const MIN_LENGTH = 1;

/**
 * Maximum image tag length.
 */
const MAX_LENGTH = 128;

/**
 * Pattern for digest format (used to prevent tags that look like digests).
 */
const DIGEST_LIKE_PATTERN = /^sha(256|512):[a-f0-9]+$/;

/**
 * Validates an image tag.
 *
 * Throws an EcrError with kind InvalidParameter if the tag is invalid.
 *
 * @param tag - Image tag to validate
 * @throws {EcrError} If the tag is invalid
 *
 * @example
 * ```typescript
 * validateImageTag("v1.0.0"); // OK
 * validateImageTag("latest"); // OK
 * validateImageTag("my_tag-123"); // OK
 * validateImageTag("-invalid"); // throws: cannot start with hyphen
 * validateImageTag("sha256:abc..."); // throws: cannot be digest format
 * ```
 */
export function validateImageTag(tag: string): void {
  if (!tag) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Image tag cannot be empty',
      { statusCode: 400 }
    );
  }

  // Check length
  if (tag.length < MIN_LENGTH) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Image tag must be at least ${MIN_LENGTH} character long`,
      { statusCode: 400 }
    );
  }

  if (tag.length > MAX_LENGTH) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Image tag must not exceed ${MAX_LENGTH} characters`,
      { statusCode: 400 }
    );
  }

  // Check if tag looks like a digest (not allowed)
  if (DIGEST_LIKE_PATTERN.test(tag)) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Image tag cannot be in digest format (sha256:... or sha512:...)',
      { statusCode: 400 }
    );
  }

  // Check pattern
  if (!IMAGE_TAG_PATTERN.test(tag)) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Image tag must start with an alphanumeric character or underscore and contain only letters, digits, periods, hyphens, and underscores.',
      { statusCode: 400 }
    );
  }
}

/**
 * Checks if an image tag is valid.
 *
 * @param tag - Image tag to check
 * @returns true if the tag is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidImageTag("v1.0.0"); // true
 * isValidImageTag("latest"); // true
 * isValidImageTag("-invalid"); // false
 * ```
 */
export function isValidImageTag(tag: string): boolean {
  try {
    validateImageTag(tag);
    return true;
  } catch {
    return false;
  }
}

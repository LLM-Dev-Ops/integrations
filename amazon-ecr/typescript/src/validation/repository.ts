/**
 * Repository name validation for Amazon ECR.
 *
 * This module provides validation functions for ECR repository names
 * according to AWS specifications.
 *
 * @module validation/repository
 */

import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Regular expression for valid ECR repository names.
 *
 * Pattern: ^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$
 *
 * Rules:
 * - Start with lowercase letter or digit
 * - Can contain lowercase letters, digits, hyphens, underscores, and periods
 * - Can contain forward slashes for namespacing
 * - No consecutive special characters
 * - No leading/trailing special characters
 */
const REPOSITORY_NAME_PATTERN =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;

/**
 * Minimum repository name length.
 */
const MIN_LENGTH = 2;

/**
 * Maximum repository name length.
 */
const MAX_LENGTH = 256;

/**
 * Validates a repository name.
 *
 * Throws an EcrError with kind InvalidParameter if the name is invalid.
 *
 * @param name - Repository name to validate
 * @throws {EcrError} If the name is invalid
 *
 * @example
 * ```typescript
 * validateRepositoryName("my-app"); // OK
 * validateRepositoryName("team/my-app"); // OK
 * validateRepositoryName("My-App"); // throws: uppercase not allowed
 * validateRepositoryName("a"); // throws: too short
 * ```
 */
export function validateRepositoryName(name: string): void {
  if (!name) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Repository name cannot be empty',
      { statusCode: 400 }
    );
  }

  // Check length
  if (name.length < MIN_LENGTH) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Repository name must be at least ${MIN_LENGTH} characters long`,
      { statusCode: 400 }
    );
  }

  if (name.length > MAX_LENGTH) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Repository name must not exceed ${MAX_LENGTH} characters`,
      { statusCode: 400 }
    );
  }

  // Check for path traversal
  if (name.includes('..')) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Repository name cannot contain path traversal sequences (..)',
      { statusCode: 400 }
    );
  }

  // Check for leading/trailing slashes
  if (name.startsWith('/') || name.endsWith('/')) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Repository name cannot start or end with a slash',
      { statusCode: 400 }
    );
  }

  // Check pattern
  if (!REPOSITORY_NAME_PATTERN.test(name)) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Repository name must contain only lowercase letters, digits, hyphens, underscores, periods, and forward slashes. ' +
        'It must start with a letter or digit and cannot have consecutive special characters.',
      { statusCode: 400 }
    );
  }
}

/**
 * Checks if a repository name is valid.
 *
 * @param name - Repository name to check
 * @returns true if the name is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidRepositoryName("my-app"); // true
 * isValidRepositoryName("team/my-app"); // true
 * isValidRepositoryName("My-App"); // false
 * isValidRepositoryName("a"); // false
 * ```
 */
export function isValidRepositoryName(name: string): boolean {
  try {
    validateRepositoryName(name);
    return true;
  } catch {
    return false;
  }
}

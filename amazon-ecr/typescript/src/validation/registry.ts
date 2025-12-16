/**
 * Registry ID validation for Amazon ECR.
 *
 * This module provides validation functions for ECR registry IDs,
 * which are 12-digit AWS account IDs.
 *
 * @module validation/registry
 */

import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Regular expression for valid AWS account IDs (registry IDs).
 *
 * Pattern: ^[0-9]{12}$
 *
 * Rules:
 * - Must be exactly 12 digits
 * - Only numeric characters
 */
const REGISTRY_ID_PATTERN = /^[0-9]{12}$/;

/**
 * Expected registry ID length.
 */
const REGISTRY_ID_LENGTH = 12;

/**
 * Validates a registry ID.
 *
 * Registry IDs must be valid 12-digit AWS account IDs.
 *
 * Throws an EcrError with kind InvalidParameter if the registry ID is invalid.
 *
 * @param registryId - Registry ID to validate
 * @throws {EcrError} If the registry ID is invalid
 *
 * @example
 * ```typescript
 * validateRegistryId("123456789012"); // OK
 * validateRegistryId("12345678901"); // throws: too short
 * validateRegistryId("1234567890123"); // throws: too long
 * validateRegistryId("12345678901a"); // throws: contains non-digit
 * ```
 */
export function validateRegistryId(registryId: string): void {
  if (!registryId) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Registry ID cannot be empty',
      { statusCode: 400 }
    );
  }

  // Check length
  if (registryId.length !== REGISTRY_ID_LENGTH) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Registry ID must be exactly ${REGISTRY_ID_LENGTH} digits (AWS account ID)`,
      { statusCode: 400 }
    );
  }

  // Check pattern
  if (!REGISTRY_ID_PATTERN.test(registryId)) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      'Registry ID must contain only numeric digits (0-9)',
      { statusCode: 400 }
    );
  }
}

/**
 * Checks if a registry ID is valid.
 *
 * @param registryId - Registry ID to check
 * @returns true if the registry ID is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidRegistryId("123456789012"); // true
 * isValidRegistryId("12345678901"); // false
 * isValidRegistryId("12345678901a"); // false
 * ```
 */
export function isValidRegistryId(registryId: string): boolean {
  try {
    validateRegistryId(registryId);
    return true;
  } catch {
    return false;
  }
}

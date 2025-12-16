/**
 * Namespace validation module for Pinecone integration.
 *
 * Provides validation for namespace identifiers according to Pinecone's
 * naming constraints.
 *
 * @module validation/namespace
 */

import { ValidationError } from './vector.js';

/**
 * Maximum length for namespace identifiers.
 */
export const MAX_NAMESPACE_LENGTH = 64;

/**
 * Pattern for valid namespace names.
 * Must start with alphanumeric, can contain alphanumeric, underscore, or hyphen.
 */
export const NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Validator for Pinecone namespace identifiers.
 */
export class NamespaceValidator {
  /**
   * Validates a namespace identifier.
   *
   * Rules:
   * - Empty string is valid (represents default namespace)
   * - Maximum 64 characters
   * - Must start with alphanumeric character
   * - Can contain alphanumeric characters, underscores, and hyphens
   *
   * @param namespace - The namespace to validate
   * @throws {ValidationError} If validation fails
   */
  static validate(namespace: string): void {
    if (namespace === null || namespace === undefined) {
      throw new ValidationError('Namespace cannot be null or undefined');
    }

    if (typeof namespace !== 'string') {
      throw new ValidationError(
        `Namespace must be a string (got ${typeof namespace})`
      );
    }

    // Empty namespace is valid (default namespace)
    if (namespace.length === 0) {
      return;
    }

    // Check maximum length
    if (namespace.length > MAX_NAMESPACE_LENGTH) {
      throw new ValidationError(
        `Namespace exceeds maximum length of ${MAX_NAMESPACE_LENGTH} characters (got ${namespace.length})`
      );
    }

    // Validate pattern
    if (!NAMESPACE_PATTERN.test(namespace)) {
      // Provide more specific error messages
      if (!/^[a-zA-Z0-9]/.test(namespace)) {
        throw new ValidationError(
          `Namespace must start with an alphanumeric character (got "${namespace[0]}")`
        );
      }

      // Find the first invalid character
      for (let i = 0; i < namespace.length; i++) {
        const char = namespace[i];
        if (char !== undefined && !/[a-zA-Z0-9_-]/.test(char)) {
          throw new ValidationError(
            `Namespace contains invalid character "${char}" at position ${i}. Only alphanumeric, underscore, and hyphen are allowed`
          );
        }
      }

      // Generic error if pattern doesn't match for some other reason
      throw new ValidationError(
        `Namespace "${namespace}" does not match required pattern. Must start with alphanumeric and contain only alphanumeric, underscore, or hyphen`
      );
    }
  }

  /**
   * Checks if a namespace is the default namespace (empty string).
   *
   * @param namespace - The namespace to check
   * @returns True if the namespace is the default namespace
   */
  static isDefault(namespace: string): boolean {
    return namespace === '';
  }

  /**
   * Normalizes a namespace value.
   * Converts undefined or null to empty string (default namespace).
   *
   * @param namespace - The namespace to normalize
   * @returns The normalized namespace string
   */
  static normalize(namespace?: string | null): string {
    if (namespace === undefined || namespace === null) {
      return '';
    }
    return namespace;
  }
}

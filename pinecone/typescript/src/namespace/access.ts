/**
 * Namespace access control for security and authorization.
 *
 * This module provides pattern-based access control for namespaces,
 * allowing you to restrict operations based on namespace patterns.
 *
 * @module namespace/access
 */

import { AuthorizationError } from '../errors.js';

/**
 * Type of operation being performed on a namespace.
 */
export type Operation = 'read' | 'write' | 'delete';

/**
 * Configuration for namespace access control.
 */
export interface AccessControlConfig {
  /**
   * Regex patterns for allowed namespaces.
   * If specified, only namespaces matching these patterns are allowed.
   */
  allowedPatterns?: string[];

  /**
   * Regex patterns for denied namespaces.
   * These take precedence over allowedPatterns.
   */
  deniedPatterns?: string[];
}

/**
 * Enforces access control policies on namespace operations.
 *
 * The NamespaceAccessControl class uses regex patterns to control access
 * to namespaces. This is useful for:
 * - Preventing accidental writes to production namespaces
 * - Restricting access to specific tenant namespaces
 * - Enforcing naming conventions
 *
 * @example
 * ```typescript
 * // Only allow access to dev namespaces
 * const ac = new NamespaceAccessControl({
 *   allowedPatterns: ['^dev-.*']
 * });
 *
 * ac.checkAccess('dev-team1', 'write'); // OK
 * ac.checkAccess('prod-data', 'write'); // Throws AuthorizationError
 *
 * // Deny access to production namespaces
 * const ac2 = new NamespaceAccessControl({
 *   deniedPatterns: ['^prod-.*']
 * });
 *
 * ac2.checkAccess('dev-team1', 'write'); // OK
 * ac2.checkAccess('prod-data', 'write'); // Throws AuthorizationError
 *
 * // Allow specific tenants, but deny prod for tenant 'test'
 * const ac3 = new NamespaceAccessControl({
 *   allowedPatterns: ['^(acme|globex)-.*'],
 *   deniedPatterns: ['^test-prod-.*']
 * });
 *
 * ac3.checkAccess('acme-dev-rag', 'write'); // OK
 * ac3.checkAccess('test-prod-rag', 'write'); // Throws (denied)
 * ac3.checkAccess('unknown-dev-rag', 'write'); // Throws (not allowed)
 * ```
 */
export class NamespaceAccessControl {
  private readonly allowedRegexes: RegExp[];
  private readonly deniedRegexes: RegExp[];

  /**
   * Creates a new NamespaceAccessControl instance.
   *
   * @param config - Access control configuration
   *
   * @example
   * ```typescript
   * // Allow only dev and staging namespaces
   * const ac = new NamespaceAccessControl({
   *   allowedPatterns: ['^(dev|staging)-.*']
   * });
   *
   * // Allow all but production
   * const ac2 = new NamespaceAccessControl({
   *   deniedPatterns: ['^prod-.*']
   * });
   * ```
   */
  constructor(config: AccessControlConfig) {
    this.allowedRegexes = (config.allowedPatterns ?? []).map(
      (pattern) => new RegExp(pattern)
    );
    this.deniedRegexes = (config.deniedPatterns ?? []).map(
      (pattern) => new RegExp(pattern)
    );
  }

  /**
   * Checks if an operation is allowed on a namespace.
   *
   * Access is determined by:
   * 1. If namespace matches any deniedPatterns -> DENY
   * 2. If allowedPatterns is empty -> ALLOW
   * 3. If namespace matches any allowedPatterns -> ALLOW
   * 4. Otherwise -> DENY
   *
   * @param namespace - Namespace to check access for
   * @param operation - Type of operation being performed
   * @throws {AuthorizationError} If access is denied
   *
   * @example
   * ```typescript
   * const ac = new NamespaceAccessControl({
   *   allowedPatterns: ['^dev-.*'],
   *   deniedPatterns: ['^dev-restricted-.*']
   * });
   *
   * // OK - matches allowed pattern
   * ac.checkAccess('dev-team1', 'write');
   *
   * // Throws - matches denied pattern
   * ac.checkAccess('dev-restricted-data', 'write');
   *
   * // Throws - doesn't match allowed pattern
   * ac.checkAccess('prod-data', 'write');
   * ```
   */
  checkAccess(namespace: string, operation: Operation): void {
    // Check denied patterns first (highest priority)
    if (this.isDenied(namespace)) {
      throw new AuthorizationError(
        `Access denied: namespace '${namespace}' matches denied pattern for operation '${operation}'`,
        {
          namespace,
          operation,
          reason: 'denied_pattern',
        }
      );
    }

    // If no allowed patterns configured, allow all (except denied)
    if (this.allowedRegexes.length === 0) {
      return;
    }

    // Check if namespace matches any allowed pattern
    if (!this.isAllowed(namespace)) {
      throw new AuthorizationError(
        `Access denied: namespace '${namespace}' does not match allowed patterns for operation '${operation}'`,
        {
          namespace,
          operation,
          reason: 'not_allowed',
        }
      );
    }
  }

  /**
   * Checks if a namespace matches any denied pattern.
   *
   * @param namespace - Namespace to check
   * @returns True if namespace is denied
   */
  private isDenied(namespace: string): boolean {
    return this.deniedRegexes.some((regex) => regex.test(namespace));
  }

  /**
   * Checks if a namespace matches any allowed pattern.
   *
   * @param namespace - Namespace to check
   * @returns True if namespace is allowed
   */
  private isAllowed(namespace: string): boolean {
    return this.allowedRegexes.some((regex) => regex.test(namespace));
  }
}

/**
 * No-Op Authentication Provider
 *
 * Provides a pass-through authentication provider for unauthenticated access.
 * Useful for local development or testing environments without authentication.
 *
 * @module @llmdevops/weaviate-integration/auth/noop
 */

import type { AuthProvider } from './types.js';

// ============================================================================
// NoopAuthProvider
// ============================================================================

/**
 * Authentication provider that returns no authentication headers.
 *
 * This provider is used when no authentication is required, such as
 * when connecting to a local Weaviate instance without authentication enabled.
 *
 * @example
 * ```typescript
 * const provider = new NoopAuthProvider();
 * const headers = await provider.getAuthHeaders(); // Returns {}
 * ```
 */
export class NoopAuthProvider implements AuthProvider {
  /**
   * Creates a new no-op authentication provider.
   */
  constructor() {
    // No initialization needed
  }

  /**
   * Returns empty headers object.
   *
   * @returns Empty object since no authentication is used
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    return {};
  }

  /**
   * No-op auth never expires.
   *
   * @returns Always false
   */
  isExpired(): boolean {
    return false;
  }

  /**
   * No-op refresh does nothing.
   */
  async refresh(): Promise<void> {
    // Nothing to refresh
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a no-op authentication provider.
 *
 * @returns A new NoopAuthProvider instance
 *
 * @example
 * ```typescript
 * import { createNoopAuthProvider } from '@llmdevops/weaviate-integration/auth';
 *
 * const provider = createNoopAuthProvider();
 * ```
 */
export function createNoopAuthProvider(): NoopAuthProvider {
  return new NoopAuthProvider();
}

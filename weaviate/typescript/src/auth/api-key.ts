/**
 * API Key Authentication Provider
 *
 * Implements API key authentication for Weaviate using Bearer tokens.
 * Includes secure credential handling with automatic redaction.
 *
 * @module @llmdevops/weaviate-integration/auth/api-key
 */

import type { AuthProvider } from './types.js';

// ============================================================================
// SecretString Helper
// ============================================================================

/**
 * Secure string wrapper that prevents accidental exposure of API keys.
 *
 * This class wraps sensitive strings (like API keys) and redacts them
 * in common scenarios like logging, JSON serialization, and inspection.
 */
class SecretString {
  private readonly value: string;

  constructor(value: string) {
    if (!value || value.trim() === '') {
      throw new Error('SecretString cannot be empty');
    }
    this.value = value;
  }

  /**
   * Exposes the secret value. Use with caution.
   *
   * @returns The raw secret string
   */
  expose(): string {
    return this.value;
  }

  /**
   * Prevents accidental serialization of secrets to JSON.
   *
   * @returns Redacted string
   */
  toJSON(): string {
    return '***REDACTED***';
  }

  /**
   * Prevents accidental logging of secrets.
   *
   * @returns Redacted string
   */
  toString(): string {
    return '***REDACTED***';
  }

  /**
   * Prevents inspection of secrets in Node.js.
   *
   * @returns Redacted string
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '***REDACTED***';
  }

  /**
   * Clears the secret from memory (best effort).
   * Note: JavaScript doesn't provide guaranteed memory clearing.
   */
  clear(): void {
    // This is a best-effort approach; actual memory clearing
    // is not guaranteed in JavaScript
    Object.defineProperty(this, 'value', {
      value: '',
      writable: false,
    });
  }
}

// ============================================================================
// ApiKeyAuthProvider
// ============================================================================

/**
 * Authentication provider for API key (Bearer token) authentication.
 *
 * This provider uses a static API key for authentication via the
 * Authorization header with Bearer scheme. The API key is securely
 * stored and automatically redacted in logs and error messages.
 *
 * Security features:
 * - API key is wrapped in SecretString to prevent accidental exposure
 * - Redacted in toString(), toJSON(), and Node.js inspection
 * - Clear method to remove from memory when done
 *
 * @example
 * ```typescript
 * const provider = new ApiKeyAuthProvider('your-api-key-here');
 * const headers = await provider.getAuthHeaders();
 * // headers = { 'Authorization': 'Bearer your-api-key-here' }
 * ```
 */
export class ApiKeyAuthProvider implements AuthProvider {
  private readonly apiKey: SecretString;

  /**
   * Creates a new API key authentication provider.
   *
   * @param apiKey - The Weaviate API key
   * @throws {Error} If API key is empty
   */
  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API key cannot be empty');
    }
    this.apiKey = new SecretString(apiKey);
  }

  /**
   * Gets the authentication headers with Bearer token.
   *
   * @returns Promise resolving to headers object with Authorization header
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${this.apiKey.expose()}`,
    };
  }

  /**
   * API keys don't expire (until manually rotated).
   *
   * @returns Always false
   */
  isExpired(): boolean {
    return false;
  }

  /**
   * No-op for API key since keys don't automatically refresh.
   * This method exists to satisfy the AuthProvider interface.
   */
  async refresh(): Promise<void> {
    // API keys don't need refresh
  }

  /**
   * Clears the API key from memory (best effort).
   * Call this when the provider is no longer needed.
   */
  clear(): void {
    this.apiKey.clear();
  }

  /**
   * Prevents accidental serialization of the provider with API key.
   *
   * @returns Object with redacted API key
   */
  toJSON(): Record<string, unknown> {
    return {
      type: 'ApiKeyAuthProvider',
      apiKey: '***REDACTED***',
    };
  }

  /**
   * Prevents accidental logging of the provider with API key.
   *
   * @returns String representation with redacted API key
   */
  toString(): string {
    return '[ApiKeyAuthProvider: apiKey=***REDACTED***]';
  }

  /**
   * Prevents inspection of API key in Node.js.
   *
   * @returns Redacted representation
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an API key authentication provider.
 *
 * @param apiKey - The Weaviate API key
 * @returns A new ApiKeyAuthProvider instance
 * @throws {Error} If API key is empty
 *
 * @example
 * ```typescript
 * import { createApiKeyAuthProvider } from '@llmdevops/weaviate-integration/auth';
 *
 * const provider = createApiKeyAuthProvider(process.env.WEAVIATE_API_KEY!);
 * const headers = await provider.getAuthHeaders();
 * ```
 */
export function createApiKeyAuthProvider(apiKey: string): ApiKeyAuthProvider {
  return new ApiKeyAuthProvider(apiKey);
}

/**
 * Creates an API key provider from environment variable.
 *
 * @param envVar - Environment variable name (default: 'WEAVIATE_API_KEY')
 * @returns A new ApiKeyAuthProvider instance
 * @throws {Error} If environment variable is not set or empty
 *
 * @example
 * ```typescript
 * import { createApiKeyAuthProviderFromEnv } from '@llmdevops/weaviate-integration/auth';
 *
 * // Uses WEAVIATE_API_KEY by default
 * const provider = createApiKeyAuthProviderFromEnv();
 *
 * // Or specify a custom variable
 * const provider2 = createApiKeyAuthProviderFromEnv('MY_API_KEY');
 * ```
 */
export function createApiKeyAuthProviderFromEnv(
  envVar: string = 'WEAVIATE_API_KEY'
): ApiKeyAuthProvider {
  const apiKey = process.env[envVar];
  if (!apiKey) {
    throw new Error(
      `Environment variable ${envVar} is not set or empty`
    );
  }
  return new ApiKeyAuthProvider(apiKey);
}

/**
 * API Key Credential Provider
 *
 * @module auth/api-key
 */

import type { CredentialProvider, AuthHeader } from './provider.js';
import { configurationError } from '../error.js';

/**
 * API key credential provider for xAI authentication.
 *
 * Uses Bearer token authentication with the provided API key.
 */
export class ApiKeyCredentialProvider implements CredentialProvider {
  private readonly apiKey: string;

  /**
   * Create an API key provider.
   *
   * @param apiKey - xAI API key
   */
  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw configurationError('API key cannot be empty');
    }
    this.apiKey = apiKey;
  }

  /**
   * Get the authentication header.
   *
   * @returns Bearer token authorization header
   */
  async getAuthHeader(): Promise<AuthHeader> {
    return {
      name: 'Authorization',
      value: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Create provider from environment variable.
   *
   * @returns ApiKeyCredentialProvider
   * @throws {GrokError} If XAI_API_KEY is not set
   */
  static fromEnv(): ApiKeyCredentialProvider {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw configurationError(
        'XAI_API_KEY environment variable is not set'
      );
    }
    return new ApiKeyCredentialProvider(apiKey);
  }
}

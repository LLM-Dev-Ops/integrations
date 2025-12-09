import { AuthenticationError } from '../errors/categories.js';
import type { BetaFeature } from '../config/config.js';

/**
 * Interface for managing authentication headers
 */
export interface AuthManager {
  /**
   * Generates authentication headers for API requests
   */
  getHeaders(): Record<string, string>;

  /**
   * Validates the API key format
   */
  validateApiKey(): void;
}

/**
 * Bearer token authentication manager for Anthropic API
 */
export class BearerAuthManager implements AuthManager {
  private readonly apiKey: string;
  private readonly apiVersion: string;
  private readonly betaFeatures: BetaFeature[];
  private readonly customHeaders: Record<string, string>;

  constructor(options: {
    apiKey: string;
    apiVersion: string;
    betaFeatures?: BetaFeature[];
    customHeaders?: Record<string, string>;
  }) {
    this.apiKey = options.apiKey;
    this.apiVersion = options.apiVersion;
    this.betaFeatures = options.betaFeatures ?? [];
    this.customHeaders = options.customHeaders ?? {};
    this.validateApiKey();
  }

  /**
   * Validates the API key format
   */
  validateApiKey(): void {
    if (!this.apiKey || typeof this.apiKey !== 'string') {
      throw new AuthenticationError('API key must be a non-empty string');
    }

    if (this.apiKey.trim().length === 0) {
      throw new AuthenticationError('API key cannot be empty or whitespace');
    }

    // Anthropic API keys typically start with 'sk-ant-'
    if (!this.apiKey.startsWith('sk-ant-')) {
      console.warn(
        'Warning: API key does not match expected format (should start with "sk-ant-"). ' +
        'This may indicate an invalid key.'
      );
    }
  }

  /**
   * Generates authentication headers for API requests
   */
  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
      'content-type': 'application/json',
      ...this.customHeaders,
    };

    // Add beta features header if any are specified
    if (this.betaFeatures.length > 0) {
      headers['anthropic-beta'] = this.betaFeatures.join(',');
    }

    return headers;
  }

  /**
   * Gets streaming headers (same as regular headers for Anthropic)
   */
  getStreamHeaders(): Record<string, string> {
    return {
      ...this.getHeaders(),
      'accept': 'text/event-stream',
    };
  }
}

/**
 * Creates a default AuthManager instance
 */
export function createAuthManager(options: {
  apiKey: string;
  apiVersion: string;
  betaFeatures?: BetaFeature[];
  customHeaders?: Record<string, string>;
}): AuthManager {
  return new BearerAuthManager(options);
}

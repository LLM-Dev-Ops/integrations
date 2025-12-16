/**
 * Authentication manager for Stripe API
 */
import type { NormalizedStripeConfig } from '../config/config.js';

/**
 * Interface for auth header management
 */
export interface AuthManager {
  /**
   * Gets the authentication headers for API requests
   */
  getHeaders(): Record<string, string>;

  /**
   * Gets headers with optional Stripe-Account for Connect
   */
  getHeadersWithAccount(stripeAccount?: string): Record<string, string>;

  /**
   * Gets the API key (redacted for logging)
   */
  getRedactedApiKey(): string;
}

/**
 * Authentication header configuration
 */
interface AuthConfig {
  apiKey: string;
  apiVersion: string;
  customHeaders?: Record<string, string>;
}

/**
 * Bearer token authentication manager
 */
export class BearerAuthManager implements AuthManager {
  private readonly apiKey: string;
  private readonly apiVersion: string;
  private readonly customHeaders: Record<string, string>;
  private readonly baseHeaders: Record<string, string>;

  constructor(config: AuthConfig) {
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion;
    this.customHeaders = config.customHeaders ?? {};

    // Pre-compute base headers for performance
    this.baseHeaders = this.buildBaseHeaders();
  }

  /**
   * Builds the base headers object
   */
  private buildBaseHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': this.apiVersion,
      'User-Agent': this.getUserAgent(),
      ...this.customHeaders,
    };
  }

  /**
   * Gets the user agent string
   */
  private getUserAgent(): string {
    const nodeVersion = typeof process !== 'undefined' ? process.version : 'unknown';
    return `llm-devops-stripe/1.0.0 node/${nodeVersion}`;
  }

  /**
   * Gets the authentication headers for API requests
   */
  getHeaders(): Record<string, string> {
    return { ...this.baseHeaders };
  }

  /**
   * Gets headers with optional Stripe-Account for Connect
   */
  getHeadersWithAccount(stripeAccount?: string): Record<string, string> {
    const headers = this.getHeaders();
    if (stripeAccount) {
      headers['Stripe-Account'] = stripeAccount;
    }
    return headers;
  }

  /**
   * Gets the API key with sensitive characters redacted
   */
  getRedactedApiKey(): string {
    if (this.apiKey.length <= 12) {
      return '***REDACTED***';
    }
    const prefix = this.apiKey.substring(0, 7); // e.g., "sk_test"
    const suffix = this.apiKey.substring(this.apiKey.length - 4);
    return `${prefix}...${suffix}`;
  }
}

/**
 * Creates an auth manager from normalized config
 */
export function createAuthManager(config: NormalizedStripeConfig): AuthManager {
  return new BearerAuthManager({
    apiKey: config.apiKey,
    apiVersion: config.apiVersion,
    customHeaders: config.headers,
  });
}

/**
 * Secret string wrapper to prevent accidental logging
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Gets the actual secret value
   */
  reveal(): string {
    return this.value;
  }

  /**
   * Returns a redacted representation for logging
   */
  toString(): string {
    return '***REDACTED***';
  }

  /**
   * Prevents JSON serialization of the secret
   */
  toJSON(): string {
    return '***REDACTED***';
  }

  /**
   * Returns redacted value for inspection
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '***REDACTED***';
  }
}

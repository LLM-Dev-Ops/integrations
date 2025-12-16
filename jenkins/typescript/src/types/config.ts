/**
 * Configuration types for Jenkins client.
 * @module config
 */

/**
 * Basic authentication credentials.
 */
export interface BasicAuthCredentials {
  /** Jenkins username */
  username: string;
  /** Jenkins API token or password */
  token: string;
}

/**
 * Credential provider interface for flexible authentication.
 */
export interface CredentialProvider {
  /**
   * Get the current credentials.
   */
  getCredentials(): Promise<BasicAuthCredentials> | BasicAuthCredentials;
}

/**
 * Static credential provider.
 */
export class StaticCredentialProvider implements CredentialProvider {
  constructor(private readonly credentials: BasicAuthCredentials) {}

  getCredentials(): BasicAuthCredentials {
    return this.credentials;
  }
}

/**
 * Environment variable credential provider.
 */
export class EnvCredentialProvider implements CredentialProvider {
  getCredentials(): BasicAuthCredentials {
    const username = process.env.JENKINS_USERNAME || process.env.JENKINS_USER;
    const token = process.env.JENKINS_TOKEN || process.env.JENKINS_API_TOKEN;

    if (!username || !token) {
      throw new Error('Jenkins credentials not found in environment variables');
    }

    return { username, token };
  }
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Backoff multiplier (e.g., 2 for exponential backoff) */
  multiplier: number;
  /** Whether to add random jitter to delays */
  jitter: boolean;
}

/**
 * Crumb/CSRF configuration.
 */
export interface CrumbConfig {
  /** Whether to enable crumb handling */
  enabled: boolean;
  /** TTL for cached crumb in milliseconds (default: 5 minutes) */
  ttlMs: number;
  /** Whether to automatically retry on 403 with fresh crumb */
  autoRetryOnExpired: boolean;
}

/**
 * Jenkins client configuration.
 */
export interface JenkinsConfig {
  /** Jenkins base URL (e.g., https://jenkins.example.com) */
  baseUrl: string;
  /** Credential provider for authentication */
  credentialProvider: CredentialProvider;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retries for failed requests */
  maxRetries?: number;
  /** Retry configuration */
  retryConfig?: Partial<RetryConfig>;
  /** Crumb/CSRF configuration */
  crumbConfig?: Partial<CrumbConfig>;
  /** User agent string */
  userAgent?: string;
}

/**
 * Default retry configuration for Jenkins.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  multiplier: 2,
  jitter: true,
};

/**
 * Default crumb configuration.
 */
export const DEFAULT_CRUMB_CONFIG: CrumbConfig = {
  enabled: true,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  autoRetryOnExpired: true,
};

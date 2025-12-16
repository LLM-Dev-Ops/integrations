/**
 * Configuration types for the Jenkins client.
 * @module config
 */

import { z } from 'zod';

/** Default Jenkins base URL (needs to be set by user). */
export const DEFAULT_BASE_URL = '';

/** Default request timeout in milliseconds (30 seconds). */
export const DEFAULT_TIMEOUT = 30000;

/** Default timeout for console log retrieval in milliseconds (5 minutes). */
export const DEFAULT_LOG_TIMEOUT = 300000;

/** Default maximum retry attempts. */
export const DEFAULT_MAX_RETRIES = 3;

/** Default CSRF crumb TTL in milliseconds (5 minutes). */
export const DEFAULT_CRUMB_TTL = 300000;

/** Default User-Agent header. */
export const DEFAULT_USER_AGENT = 'integrations-jenkins/0.1.0';

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum retry attempts. */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds. */
  initialBackoff: number;
  /** Maximum backoff delay in milliseconds. */
  maxBackoff: number;
  /** Backoff multiplier. */
  multiplier: number;
  /** Jitter factor (0.0 to 1.0). */
  jitter: number;
  /** Enable retries. */
  enabled: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialBackoff: 1000,
  maxBackoff: 60000,
  multiplier: 2.0,
  jitter: 0.1,
  enabled: true,
};

/**
 * Jenkins client configuration.
 */
export interface JenkinsConfig {
  /** Jenkins base URL (e.g., "https://jenkins.example.com"). */
  baseUrl: string;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Console log retrieval timeout in milliseconds. */
  logTimeout: number;
  /** Maximum retry attempts (deprecated - use retry.maxAttempts). */
  maxRetries: number;
  /** Enable CSRF crumb support. */
  crumbEnabled: boolean;
  /** CSRF crumb cache TTL in milliseconds. */
  crumbTtl: number;
  /** Retry configuration. */
  retry: RetryConfig;
  /** User-Agent header. */
  userAgent: string;
}

/**
 * Zod schema for URL validation.
 */
const urlSchema = z.string().url();

/**
 * Creates a default Jenkins configuration.
 */
export function createDefaultConfig(): JenkinsConfig {
  return {
    baseUrl: DEFAULT_BASE_URL,
    timeout: DEFAULT_TIMEOUT,
    logTimeout: DEFAULT_LOG_TIMEOUT,
    maxRetries: DEFAULT_MAX_RETRIES,
    crumbEnabled: true,
    crumbTtl: DEFAULT_CRUMB_TTL,
    retry: DEFAULT_RETRY_CONFIG,
    userAgent: DEFAULT_USER_AGENT,
  };
}

/**
 * Validates a Jenkins configuration.
 * @param config - The configuration to validate.
 * @throws {Error} If the configuration is invalid.
 */
export function validateConfig(config: JenkinsConfig): void {
  if (!config.baseUrl || config.baseUrl.trim() === '') {
    throw new Error('Base URL cannot be empty');
  }

  if (!config.baseUrl.startsWith('http://') && !config.baseUrl.startsWith('https://')) {
    throw new Error('Base URL must start with http:// or https://');
  }

  // Validate URL format
  const urlResult = urlSchema.safeParse(config.baseUrl);
  if (!urlResult.success) {
    throw new Error(`Invalid base URL format: ${config.baseUrl}`);
  }

  if (config.timeout <= 0) {
    throw new Error('Timeout must be greater than 0');
  }

  if (config.logTimeout <= 0) {
    throw new Error('Log timeout must be greater than 0');
  }

  if (config.maxRetries < 0) {
    throw new Error('Max retries must be non-negative');
  }

  if (config.crumbTtl <= 0) {
    throw new Error('Crumb TTL must be greater than 0');
  }

  if (!config.userAgent || config.userAgent.trim() === '') {
    throw new Error('User-Agent cannot be empty');
  }

  // Validate retry config
  if (config.retry.maxAttempts < 0) {
    throw new Error('Retry max attempts must be non-negative');
  }

  if (config.retry.initialBackoff <= 0) {
    throw new Error('Retry initial backoff must be greater than 0');
  }

  if (config.retry.maxBackoff <= 0) {
    throw new Error('Retry max backoff must be greater than 0');
  }

  if (config.retry.multiplier <= 0) {
    throw new Error('Retry multiplier must be greater than 0');
  }

  if (config.retry.jitter < 0 || config.retry.jitter > 1) {
    throw new Error('Retry jitter must be between 0.0 and 1.0');
  }
}

/**
 * Builder for JenkinsConfig.
 */
export class JenkinsConfigBuilder {
  private config: JenkinsConfig;

  constructor() {
    this.config = createDefaultConfig();
  }

  /**
   * Sets the base URL.
   * @param url - The base URL.
   * @returns The builder instance for chaining.
   */
  baseUrl(url: string): this {
    this.config.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
    return this;
  }

  /**
   * Sets the request timeout.
   * @param timeout - The timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  timeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets the console log retrieval timeout.
   * @param timeout - The timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  logTimeout(timeout: number): this {
    this.config.logTimeout = timeout;
    return this;
  }

  /**
   * Sets the maximum retry attempts.
   * @param maxRetries - The maximum retry attempts.
   * @returns The builder instance for chaining.
   * @deprecated Use retry() instead.
   */
  maxRetries(maxRetries: number): this {
    this.config.maxRetries = maxRetries;
    this.config.retry.maxAttempts = maxRetries;
    return this;
  }

  /**
   * Enables or disables CSRF crumb support.
   * @param enabled - Whether to enable CSRF crumb support.
   * @returns The builder instance for chaining.
   */
  crumbEnabled(enabled: boolean): this {
    this.config.crumbEnabled = enabled;
    return this;
  }

  /**
   * Sets the CSRF crumb cache TTL.
   * @param ttl - The TTL in milliseconds.
   * @returns The builder instance for chaining.
   */
  crumbTtl(ttl: number): this {
    this.config.crumbTtl = ttl;
    return this;
  }

  /**
   * Sets the retry configuration.
   * @param config - The retry configuration.
   * @returns The builder instance for chaining.
   */
  retry(config: Partial<RetryConfig>): this {
    this.config.retry = {
      ...this.config.retry,
      ...config,
    };
    return this;
  }

  /**
   * Disables retries.
   * @returns The builder instance for chaining.
   */
  noRetry(): this {
    this.config.retry = {
      ...DEFAULT_RETRY_CONFIG,
      enabled: false,
    };
    return this;
  }

  /**
   * Sets the User-Agent header.
   * @param userAgent - The User-Agent string.
   * @returns The builder instance for chaining.
   */
  userAgent(userAgent: string): this {
    this.config.userAgent = userAgent;
    return this;
  }

  /**
   * Builds and validates the configuration.
   * @returns The validated configuration.
   * @throws {Error} If the configuration is invalid.
   */
  build(): JenkinsConfig {
    validateConfig(this.config);
    return { ...this.config };
  }
}

/**
 * Creates a Jenkins configuration from environment variables.
 *
 * Environment variables:
 * - JENKINS_URL: Base URL (required)
 * - JENKINS_TIMEOUT_SECS: Request timeout in seconds
 * - JENKINS_LOG_TIMEOUT_SECS: Console log timeout in seconds
 * - JENKINS_MAX_RETRIES: Maximum retry attempts
 * - JENKINS_CRUMB_ENABLED: Enable CSRF crumb support (true/false)
 * - JENKINS_CRUMB_TTL_SECS: CSRF crumb TTL in seconds
 * - JENKINS_USER_AGENT: Custom User-Agent string
 *
 * @returns A Jenkins configuration builder pre-configured from environment variables.
 */
export function createConfigFromEnv(): JenkinsConfigBuilder {
  const builder = new JenkinsConfigBuilder();

  const baseUrl = process.env.JENKINS_URL;
  if (baseUrl) {
    builder.baseUrl(baseUrl);
  }

  const timeoutSecs = process.env.JENKINS_TIMEOUT_SECS;
  if (timeoutSecs) {
    const timeout = parseInt(timeoutSecs, 10);
    if (!isNaN(timeout)) {
      builder.timeout(timeout * 1000);
    }
  }

  const logTimeoutSecs = process.env.JENKINS_LOG_TIMEOUT_SECS;
  if (logTimeoutSecs) {
    const logTimeout = parseInt(logTimeoutSecs, 10);
    if (!isNaN(logTimeout)) {
      builder.logTimeout(logTimeout * 1000);
    }
  }

  const maxRetries = process.env.JENKINS_MAX_RETRIES;
  if (maxRetries) {
    const retries = parseInt(maxRetries, 10);
    if (!isNaN(retries)) {
      builder.maxRetries(retries);
    }
  }

  const crumbEnabled = process.env.JENKINS_CRUMB_ENABLED;
  if (crumbEnabled !== undefined) {
    builder.crumbEnabled(crumbEnabled.toLowerCase() === 'true');
  }

  const crumbTtlSecs = process.env.JENKINS_CRUMB_TTL_SECS;
  if (crumbTtlSecs) {
    const ttl = parseInt(crumbTtlSecs, 10);
    if (!isNaN(ttl)) {
      builder.crumbTtl(ttl * 1000);
    }
  }

  const userAgent = process.env.JENKINS_USER_AGENT;
  if (userAgent) {
    builder.userAgent(userAgent);
  }

  return builder;
}

/**
 * Namespace for JenkinsConfig-related utilities.
 */
export namespace JenkinsConfig {
  /**
   * Creates a new configuration builder.
   * @returns A new JenkinsConfigBuilder instance.
   */
  export function builder(): JenkinsConfigBuilder {
    return new JenkinsConfigBuilder();
  }

  /**
   * Creates a default configuration.
   * @returns The default configuration.
   */
  export function defaultConfig(): JenkinsConfig {
    return createDefaultConfig();
  }

  /**
   * Validates a configuration.
   * @param config - The configuration to validate.
   * @throws {Error} If the configuration is invalid.
   */
  export function validate(config: JenkinsConfig): void {
    validateConfig(config);
  }

  /**
   * Creates a configuration from environment variables.
   * @returns A configuration builder pre-configured from environment variables.
   */
  export function fromEnv(): JenkinsConfigBuilder {
    return createConfigFromEnv();
  }
}

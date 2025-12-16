/**
 * Stripe client configuration
 */
import { ConfigurationError } from '../errors/categories.js';

/**
 * Simulation mode options
 */
export type SimulationMode = 'disabled' | 'record' | 'replay';

/**
 * Idempotency key strategy
 */
export type IdempotencyStrategy = 'content_hash' | 'uuid' | 'custom';

/**
 * Default API configuration constants
 */
export const DEFAULT_BASE_URL = 'https://api.stripe.com/v1';
export const DEFAULT_API_VERSION = '2024-12-18.acacia';
export const DEFAULT_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_IDEMPOTENCY_CACHE_TTL = 86400000; // 24 hours in milliseconds
export const DEFAULT_IDEMPOTENCY_CACHE_SIZE = 10000;
export const DEFAULT_WEBHOOK_TOLERANCE = 300; // 5 minutes in seconds

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}

/**
 * Idempotency configuration
 */
export interface IdempotencyConfig {
  strategy: IdempotencyStrategy;
  cacheTtl: number;
  cacheSize: number;
}

/**
 * Simulation configuration
 */
export interface SimulationConfig {
  mode: SimulationMode;
  recordingsPath?: string;
}

/**
 * Stripe client configuration interface
 */
export interface StripeConfig {
  /**
   * Stripe API secret key (sk_test_... or sk_live_...)
   */
  apiKey: string;

  /**
   * Webhook endpoint secret (whsec_...)
   */
  webhookSecret?: string;

  /**
   * Base URL for the API
   * @default 'https://api.stripe.com/v1'
   */
  baseUrl?: string;

  /**
   * Stripe API version
   * @default '2024-12-18.acacia'
   */
  apiVersion?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Custom headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Circuit breaker configuration
   */
  circuitBreaker?: Partial<CircuitBreakerConfig>;

  /**
   * Idempotency configuration
   */
  idempotency?: Partial<IdempotencyConfig>;

  /**
   * Simulation mode configuration
   */
  simulation?: Partial<SimulationConfig>;

  /**
   * Webhook signature tolerance in seconds
   * @default 300 (5 minutes)
   */
  webhookTolerance?: number;

  /**
   * Enable audit logging
   * @default false
   */
  auditEnabled?: boolean;

  /**
   * Custom fetch implementation
   */
  fetch?: typeof fetch;
}

/**
 * Normalized configuration with all defaults applied
 */
export interface NormalizedStripeConfig {
  apiKey: string;
  webhookSecret?: string;
  baseUrl: string;
  apiVersion: string;
  timeout: number;
  maxRetries: number;
  headers: Record<string, string>;
  circuitBreaker: CircuitBreakerConfig;
  idempotency: IdempotencyConfig;
  simulation: SimulationConfig;
  webhookTolerance: number;
  auditEnabled: boolean;
  fetch: typeof fetch;
}

/**
 * Validates and normalizes the Stripe configuration
 */
export function validateConfig(config: StripeConfig): NormalizedStripeConfig {
  // Validate API key
  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
    throw new ConfigurationError('API key is required and must be a non-empty string');
  }

  const apiKey = config.apiKey.trim();

  // Validate API key format (basic check)
  if (!apiKey.startsWith('sk_test_') && !apiKey.startsWith('sk_live_') && !apiKey.startsWith('rk_')) {
    throw new ConfigurationError(
      'Invalid API key format. Expected format: sk_test_*, sk_live_*, or rk_*'
    );
  }

  // Validate base URL
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    throw new ConfigurationError('Base URL must start with http:// or https://');
  }

  // Validate timeout
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  if (timeout < 0) {
    throw new ConfigurationError('Timeout must be a non-negative number');
  }

  // Validate max retries
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (maxRetries < 0) {
    throw new ConfigurationError('Max retries must be a non-negative number');
  }

  // Validate webhook tolerance
  const webhookTolerance = config.webhookTolerance ?? DEFAULT_WEBHOOK_TOLERANCE;
  if (webhookTolerance < 0) {
    throw new ConfigurationError('Webhook tolerance must be a non-negative number');
  }

  // Normalize circuit breaker config
  const circuitBreaker: CircuitBreakerConfig = {
    enabled: config.circuitBreaker?.enabled ?? true,
    failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
    successThreshold: config.circuitBreaker?.successThreshold ?? 3,
    timeout: config.circuitBreaker?.timeout ?? 30000,
  };

  // Normalize idempotency config
  const idempotency: IdempotencyConfig = {
    strategy: config.idempotency?.strategy ?? 'content_hash',
    cacheTtl: config.idempotency?.cacheTtl ?? DEFAULT_IDEMPOTENCY_CACHE_TTL,
    cacheSize: config.idempotency?.cacheSize ?? DEFAULT_IDEMPOTENCY_CACHE_SIZE,
  };

  // Normalize simulation config
  const simulation: SimulationConfig = {
    mode: config.simulation?.mode ?? 'disabled',
    recordingsPath: config.simulation?.recordingsPath,
  };

  return {
    apiKey,
    webhookSecret: config.webhookSecret,
    baseUrl,
    apiVersion: config.apiVersion ?? DEFAULT_API_VERSION,
    timeout,
    maxRetries,
    headers: config.headers ?? {},
    circuitBreaker,
    idempotency,
    simulation,
    webhookTolerance,
    auditEnabled: config.auditEnabled ?? false,
    fetch: config.fetch ?? globalThis.fetch,
  };
}

/**
 * Fluent builder for creating StripeConfig objects
 */
export class StripeConfigBuilder {
  private config: Partial<StripeConfig> = {};

  /**
   * Sets the API key
   */
  withApiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    return this;
  }

  /**
   * Sets the webhook secret
   */
  withWebhookSecret(webhookSecret: string): this {
    this.config.webhookSecret = webhookSecret;
    return this;
  }

  /**
   * Sets the base URL
   */
  withBaseUrl(baseUrl: string): this {
    this.config.baseUrl = baseUrl;
    return this;
  }

  /**
   * Sets the API version
   */
  withApiVersion(apiVersion: string): this {
    this.config.apiVersion = apiVersion;
    return this;
  }

  /**
   * Sets the request timeout
   */
  withTimeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets the maximum number of retries
   */
  withMaxRetries(maxRetries: number): this {
    this.config.maxRetries = maxRetries;
    return this;
  }

  /**
   * Adds a custom header
   */
  withHeader(key: string, value: string): this {
    this.config.headers = { ...this.config.headers, [key]: value };
    return this;
  }

  /**
   * Sets multiple custom headers
   */
  withHeaders(headers: Record<string, string>): this {
    this.config.headers = { ...this.config.headers, ...headers };
    return this;
  }

  /**
   * Configures the circuit breaker
   */
  withCircuitBreaker(config: Partial<CircuitBreakerConfig>): this {
    this.config.circuitBreaker = { ...this.config.circuitBreaker, ...config };
    return this;
  }

  /**
   * Disables the circuit breaker
   */
  withCircuitBreakerDisabled(): this {
    this.config.circuitBreaker = { enabled: false };
    return this;
  }

  /**
   * Configures idempotency
   */
  withIdempotency(config: Partial<IdempotencyConfig>): this {
    this.config.idempotency = { ...this.config.idempotency, ...config };
    return this;
  }

  /**
   * Sets simulation mode
   */
  withSimulationMode(mode: SimulationMode, recordingsPath?: string): this {
    this.config.simulation = { mode, recordingsPath };
    return this;
  }

  /**
   * Enables record mode for simulation
   */
  withRecordMode(recordingsPath: string): this {
    this.config.simulation = { mode: 'record', recordingsPath };
    return this;
  }

  /**
   * Enables replay mode for simulation
   */
  withReplayMode(recordingsPath: string): this {
    this.config.simulation = { mode: 'replay', recordingsPath };
    return this;
  }

  /**
   * Sets webhook signature tolerance
   */
  withWebhookTolerance(tolerance: number): this {
    this.config.webhookTolerance = tolerance;
    return this;
  }

  /**
   * Enables audit logging
   */
  withAuditEnabled(enabled: boolean = true): this {
    this.config.auditEnabled = enabled;
    return this;
  }

  /**
   * Sets a custom fetch implementation
   */
  withFetch(fetchImpl: typeof fetch): this {
    this.config.fetch = fetchImpl;
    return this;
  }

  /**
   * Builds and validates the configuration
   */
  build(): NormalizedStripeConfig {
    if (!this.config.apiKey) {
      throw new ConfigurationError('API key is required. Use withApiKey() to set it.');
    }
    return validateConfig(this.config as StripeConfig);
  }

  /**
   * Creates a builder from an existing config
   */
  static from(config: StripeConfig): StripeConfigBuilder {
    const builder = new StripeConfigBuilder();
    builder.config = { ...config };
    return builder;
  }
}

/**
 * Creates a Stripe config from environment variables
 */
export function createConfigFromEnv(overrides?: Partial<StripeConfig>): StripeConfig {
  const apiKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;

  if (!apiKey) {
    throw new ConfigurationError(
      'STRIPE_SECRET_KEY or STRIPE_API_KEY environment variable is not set'
    );
  }

  return {
    apiKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    baseUrl: process.env.STRIPE_BASE_URL,
    apiVersion: process.env.STRIPE_API_VERSION,
    timeout: process.env.STRIPE_TIMEOUT ? parseInt(process.env.STRIPE_TIMEOUT, 10) : undefined,
    maxRetries: process.env.STRIPE_MAX_RETRIES ? parseInt(process.env.STRIPE_MAX_RETRIES, 10) : undefined,
    webhookTolerance: process.env.STRIPE_WEBHOOK_TOLERANCE
      ? parseInt(process.env.STRIPE_WEBHOOK_TOLERANCE, 10)
      : undefined,
    auditEnabled: process.env.STRIPE_AUDIT_ENABLED === 'true',
    ...overrides,
  };
}

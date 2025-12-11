/**
 * Configuration types for the SMTP client.
 */

import { SmtpError } from '../errors';

/** Default SMTP port (submission with STARTTLS). */
export const DEFAULT_PORT = 587;

/** Default timeout for connections in milliseconds. */
export const DEFAULT_CONNECT_TIMEOUT = 30000;

/** Default timeout for commands in milliseconds. */
export const DEFAULT_COMMAND_TIMEOUT = 60000;

/** Default maximum message size (10 MB). */
export const DEFAULT_MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

/**
 * TLS mode for SMTP connections.
 */
export enum TlsMode {
  /** No TLS (insecure, not recommended). */
  None = 'none',
  /** Opportunistic STARTTLS (default). */
  StartTls = 'starttls',
  /** Required STARTTLS (fail if not supported). */
  StartTlsRequired = 'starttls_required',
  /** Implicit TLS (port 465). */
  Implicit = 'implicit',
}

/**
 * Minimum TLS version.
 */
export enum TlsVersion {
  /** TLS 1.0 (not recommended). */
  Tls10 = 'TLSv1',
  /** TLS 1.1 (not recommended). */
  Tls11 = 'TLSv1.1',
  /** TLS 1.2 (default). */
  Tls12 = 'TLSv1.2',
  /** TLS 1.3 (preferred). */
  Tls13 = 'TLSv1.3',
}

/**
 * TLS configuration.
 */
export interface TlsConfig {
  /** TLS mode. */
  mode: TlsMode;
  /** Minimum TLS version. */
  minVersion: TlsVersion;
  /** Verify server certificate. */
  verifyCertificate: boolean;
  /** Accept invalid certificates (NEVER in production). */
  acceptInvalidCerts: boolean;
  /** Path to CA certificate file. */
  caCertPath?: string;
  /** Server Name Indication override. */
  sniOverride?: string;
}

/**
 * Default TLS configuration.
 */
export const DEFAULT_TLS_CONFIG: TlsConfig = {
  mode: TlsMode.StartTls,
  minVersion: TlsVersion.Tls12,
  verifyCertificate: true,
  acceptInvalidCerts: false,
};

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  /** Maximum number of connections. */
  maxConnections: number;
  /** Minimum idle connections. */
  minIdle: number;
  /** Connection acquire timeout in milliseconds. */
  acquireTimeout: number;
  /** Idle connection timeout in milliseconds. */
  idleTimeout: number;
  /** Maximum connection lifetime in milliseconds. */
  maxLifetime: number;
  /** Enable health checks. */
  healthCheckEnabled: boolean;
  /** Health check interval in milliseconds. */
  healthCheckInterval: number;
}

/**
 * Default pool configuration.
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConnections: 5,
  minIdle: 1,
  acquireTimeout: 30000,
  idleTimeout: 300000,
  maxLifetime: 3600000,
  healthCheckEnabled: true,
  healthCheckInterval: 60000,
};

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum retry attempts. */
  maxAttempts: number;
  /** Initial retry delay in milliseconds. */
  initialDelay: number;
  /** Maximum retry delay in milliseconds. */
  maxDelay: number;
  /** Backoff multiplier. */
  multiplier: number;
  /** Enable jitter. */
  jitter: boolean;
  /** Enable retries. */
  enabled: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 500,
  maxDelay: 30000,
  multiplier: 2,
  jitter: true,
  enabled: true,
};

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit. */
  failureThreshold: number;
  /** Time window for counting failures in milliseconds. */
  failureWindow: number;
  /** Recovery timeout in milliseconds. */
  recoveryTimeout: number;
  /** Success threshold to close circuit. */
  successThreshold: number;
  /** Enable circuit breaker. */
  enabled: boolean;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindow: 60000,
  recoveryTimeout: 30000,
  successThreshold: 3,
  enabled: true,
};

/**
 * Behavior when rate limit is exceeded.
 */
export enum OnLimitBehavior {
  /** Reject immediately with error. */
  Reject = 'reject',
  /** Wait until capacity is available. */
  Wait = 'wait',
  /** Wait with a maximum timeout. */
  WaitWithTimeout = 'wait_with_timeout',
}

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Maximum emails per time window. */
  maxEmails?: number;
  /** Time window for rate limiting in milliseconds. */
  window: number;
  /** Maximum concurrent connections. */
  maxConnections?: number;
  /** Behavior when limit is exceeded. */
  onLimit: OnLimitBehavior;
  /** Enable rate limiting. */
  enabled: boolean;
}

/**
 * Default rate limit configuration.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  window: 60000,
  onLimit: OnLimitBehavior.Reject,
  enabled: false,
};

/**
 * Authentication method.
 */
export enum AuthMethod {
  /** PLAIN authentication. */
  Plain = 'PLAIN',
  /** LOGIN authentication. */
  Login = 'LOGIN',
  /** CRAM-MD5 challenge-response. */
  CramMd5 = 'CRAM-MD5',
  /** Google/Microsoft XOAUTH2. */
  XOAuth2 = 'XOAUTH2',
  /** OAuth 2.0 Bearer Token. */
  OAuthBearer = 'OAUTHBEARER',
}

/**
 * SMTP client configuration.
 */
export interface SmtpConfig {
  /** SMTP server hostname. */
  host: string;
  /** SMTP server port. */
  port: number;
  /** TLS configuration. */
  tls: TlsConfig;
  /** Authentication username. */
  username?: string;
  /** Authentication password. */
  password?: string;
  /** Preferred authentication method. */
  authMethod?: AuthMethod;
  /** Connect timeout in milliseconds. */
  connectTimeout: number;
  /** Command timeout in milliseconds. */
  commandTimeout: number;
  /** Maximum message size. */
  maxMessageSize: number;
  /** Connection pool configuration. */
  pool: PoolConfig;
  /** Retry configuration. */
  retry: RetryConfig;
  /** Circuit breaker configuration. */
  circuitBreaker: CircuitBreakerConfig;
  /** Rate limit configuration. */
  rateLimit: RateLimitConfig;
  /** Client identifier for EHLO. */
  clientId?: string;
}

/**
 * Options for creating SmtpConfig.
 */
export interface SmtpConfigOptions {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  authMethod?: AuthMethod;
  tls?: Partial<TlsConfig>;
  connectTimeout?: number;
  commandTimeout?: number;
  maxMessageSize?: number;
  pool?: Partial<PoolConfig>;
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  rateLimit?: Partial<RateLimitConfig>;
  clientId?: string;
}

/**
 * Creates an SMTP configuration from options.
 */
export function createSmtpConfig(options: SmtpConfigOptions): SmtpConfig {
  if (!options.host) {
    throw SmtpError.configuration('Host is required');
  }

  const config: SmtpConfig = {
    host: options.host,
    port: options.port ?? DEFAULT_PORT,
    tls: { ...DEFAULT_TLS_CONFIG, ...options.tls },
    username: options.username,
    password: options.password,
    authMethod: options.authMethod,
    connectTimeout: options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT,
    commandTimeout: options.commandTimeout ?? DEFAULT_COMMAND_TIMEOUT,
    maxMessageSize: options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE,
    pool: { ...DEFAULT_POOL_CONFIG, ...options.pool },
    retry: { ...DEFAULT_RETRY_CONFIG, ...options.retry },
    circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...options.circuitBreaker },
    rateLimit: { ...DEFAULT_RATE_LIMIT_CONFIG, ...options.rateLimit },
    clientId: options.clientId,
  };

  validateConfig(config);
  return config;
}

/**
 * Validates the SMTP configuration.
 */
function validateConfig(config: SmtpConfig): void {
  if (config.port === 0) {
    throw SmtpError.configuration('Port must be non-zero');
  }

  if (config.pool.maxConnections === 0) {
    throw SmtpError.configuration('max_connections must be positive');
  }

  if (config.pool.minIdle > config.pool.maxConnections) {
    throw SmtpError.configuration('min_idle cannot exceed max_connections');
  }

  // Warn about insecure settings in non-development
  if (config.tls.acceptInvalidCerts && process.env['NODE_ENV'] === 'production') {
    console.warn('WARNING: accept_invalid_certs should not be used in production');
  }
}

/**
 * Builder for SMTP configuration.
 */
export class SmtpConfigBuilder {
  private options: SmtpConfigOptions;

  constructor() {
    this.options = {
      host: '',
    };
  }

  /** Sets the SMTP server host. */
  host(host: string): this {
    this.options.host = host;
    return this;
  }

  /** Sets the SMTP server port. */
  port(port: number): this {
    this.options.port = port;
    return this;
  }

  /** Sets plain credentials. */
  credentials(username: string, password: string): this {
    this.options.username = username;
    this.options.password = password;
    return this;
  }

  /** Sets the authentication method. */
  authMethod(method: AuthMethod): this {
    this.options.authMethod = method;
    return this;
  }

  /** Sets the TLS mode. */
  tlsMode(mode: TlsMode): this {
    this.options.tls = { ...this.options.tls, mode };
    return this;
  }

  /** Sets the TLS configuration. */
  tls(config: Partial<TlsConfig>): this {
    this.options.tls = { ...this.options.tls, ...config };
    return this;
  }

  /** Disables TLS (insecure). */
  noTls(): this {
    this.options.tls = { ...this.options.tls, mode: TlsMode.None };
    return this;
  }

  /** Sets connect timeout. */
  connectTimeout(ms: number): this {
    this.options.connectTimeout = ms;
    return this;
  }

  /** Sets command timeout. */
  commandTimeout(ms: number): this {
    this.options.commandTimeout = ms;
    return this;
  }

  /** Sets maximum message size. */
  maxMessageSize(size: number): this {
    this.options.maxMessageSize = size;
    return this;
  }

  /** Sets pool configuration. */
  pool(config: Partial<PoolConfig>): this {
    this.options.pool = { ...this.options.pool, ...config };
    return this;
  }

  /** Sets retry configuration. */
  retry(config: Partial<RetryConfig>): this {
    this.options.retry = { ...this.options.retry, ...config };
    return this;
  }

  /** Disables retries. */
  noRetry(): this {
    this.options.retry = { ...this.options.retry, enabled: false };
    return this;
  }

  /** Sets circuit breaker configuration. */
  circuitBreaker(config: Partial<CircuitBreakerConfig>): this {
    this.options.circuitBreaker = { ...this.options.circuitBreaker, ...config };
    return this;
  }

  /** Disables circuit breaker. */
  noCircuitBreaker(): this {
    this.options.circuitBreaker = { ...this.options.circuitBreaker, enabled: false };
    return this;
  }

  /** Sets rate limit configuration. */
  rateLimit(config: Partial<RateLimitConfig>): this {
    this.options.rateLimit = { ...this.options.rateLimit, ...config };
    return this;
  }

  /** Sets the client identifier for EHLO. */
  clientId(id: string): this {
    this.options.clientId = id;
    return this;
  }

  /** Builds the configuration. */
  build(): SmtpConfig {
    return createSmtpConfig(this.options);
  }
}

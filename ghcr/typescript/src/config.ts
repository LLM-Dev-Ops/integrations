/**
 * Configuration types for GitHub Container Registry integration.
 * @module config
 */

import { z } from 'zod';
import { GhcrError, GhcrErrorKind } from './errors.js';

/**
 * Default registry URL.
 */
export const DEFAULT_REGISTRY = 'ghcr.io';

/**
 * Default GitHub API base URL.
 */
export const DEFAULT_API_BASE = 'https://api.github.com';

/**
 * Default request timeout in milliseconds.
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Default upload timeout in milliseconds (5 minutes).
 */
export const DEFAULT_UPLOAD_TIMEOUT = 300000;

/**
 * Default chunk size for blob uploads (5 MB).
 */
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * Default maximum retry attempts.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Default throttle threshold percentage.
 */
export const DEFAULT_THROTTLE_THRESHOLD = 0.8;

/**
 * Default User-Agent header.
 */
export const DEFAULT_USER_AGENT = '@integrations/ghcr/0.1.0';

/**
 * Simulation mode options.
 */
export type SimulationMode =
  | { readonly type: 'off' }
  | { readonly type: 'record'; readonly path: string }
  | { readonly type: 'replay'; readonly path: string };

/**
 * SimulationMode factory functions.
 */
export const SimulationMode = {
  off(): SimulationMode {
    return { type: 'off' };
  },
  record(path: string): SimulationMode {
    return { type: 'record', path };
  },
  replay(path: string): SimulationMode {
    return { type: 'replay', path };
  },
};

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Initial delay in milliseconds */
  readonly initialDelayMs: number;
  /** Maximum delay in milliseconds */
  readonly maxDelayMs: number;
  /** Backoff multiplier */
  readonly multiplier: number;
  /** Whether to add jitter */
  readonly jitter: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
};

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Enable preemptive throttling */
  readonly preemptive: boolean;
  /** Throttle threshold (0.0 - 1.0) */
  readonly throttleThreshold: number;
  /** Auto-wait on rate limit */
  readonly autoWait: boolean;
  /** Maximum wait time in milliseconds */
  readonly maxWaitMs: number;
}

/**
 * Default rate limit configuration.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  preemptive: true,
  throttleThreshold: DEFAULT_THROTTLE_THRESHOLD,
  autoWait: true,
  maxWaitMs: 120000, // 2 minutes
};

/**
 * GHCR client configuration.
 */
export interface GhcrConfig {
  /** Registry hostname */
  readonly registry: string;
  /** GitHub API base URL */
  readonly apiBase: string;
  /** Request timeout in milliseconds */
  readonly timeout: number;
  /** Upload timeout in milliseconds */
  readonly uploadTimeout: number;
  /** Chunk size for blob uploads */
  readonly chunkSize: number;
  /** Maximum retry attempts */
  readonly maxRetries: number;
  /** Retry configuration */
  readonly retry: RetryConfig;
  /** Rate limit configuration */
  readonly rateLimit: RateLimitConfig;
  /** Simulation mode */
  readonly simulation: SimulationMode;
  /** User-Agent header */
  readonly userAgent: string;
}

/**
 * Zod schema for configuration validation.
 */
const configSchema = z.object({
  registry: z.string().min(1),
  apiBase: z.string().url(),
  timeout: z.number().positive(),
  uploadTimeout: z.number().positive(),
  chunkSize: z.number().positive().min(1024),
  maxRetries: z.number().nonnegative().max(10),
  retry: z.object({
    initialDelayMs: z.number().positive(),
    maxDelayMs: z.number().positive(),
    multiplier: z.number().positive(),
    jitter: z.boolean(),
  }),
  rateLimit: z.object({
    preemptive: z.boolean(),
    throttleThreshold: z.number().min(0).max(1),
    autoWait: z.boolean(),
    maxWaitMs: z.number().positive(),
  }),
  simulation: z.discriminatedUnion('type', [
    z.object({ type: z.literal('off') }),
    z.object({ type: z.literal('record'), path: z.string() }),
    z.object({ type: z.literal('replay'), path: z.string() }),
  ]),
  userAgent: z.string().min(1),
});

/**
 * Creates the default configuration.
 */
export function createDefaultConfig(): GhcrConfig {
  return {
    registry: DEFAULT_REGISTRY,
    apiBase: DEFAULT_API_BASE,
    timeout: DEFAULT_TIMEOUT,
    uploadTimeout: DEFAULT_UPLOAD_TIMEOUT,
    chunkSize: DEFAULT_CHUNK_SIZE,
    maxRetries: DEFAULT_MAX_RETRIES,
    retry: { ...DEFAULT_RETRY_CONFIG },
    rateLimit: { ...DEFAULT_RATE_LIMIT_CONFIG },
    simulation: SimulationMode.off(),
    userAgent: DEFAULT_USER_AGENT,
  };
}

/**
 * Validates a configuration.
 */
export function validateConfig(config: GhcrConfig): void {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new GhcrError(
      GhcrErrorKind.InvalidConfig,
      `Invalid configuration: ${issues.join(', ')}`
    );
  }
}

/**
 * Partial configuration for builder.
 */
export type PartialGhcrConfig = Partial<{
  registry: string;
  apiBase: string;
  timeout: number;
  uploadTimeout: number;
  chunkSize: number;
  maxRetries: number;
  retry: Partial<RetryConfig>;
  rateLimit: Partial<RateLimitConfig>;
  simulation: SimulationMode;
  userAgent: string;
}>;

/**
 * Configuration builder.
 */
export class GhcrConfigBuilder {
  private config: GhcrConfig;

  constructor() {
    this.config = createDefaultConfig();
  }

  /**
   * Sets the registry hostname.
   */
  registry(value: string): this {
    this.config = { ...this.config, registry: value };
    return this;
  }

  /**
   * Sets the GitHub API base URL.
   */
  apiBase(value: string): this {
    this.config = { ...this.config, apiBase: value };
    return this;
  }

  /**
   * Sets the request timeout.
   */
  timeout(value: number): this {
    this.config = { ...this.config, timeout: value };
    return this;
  }

  /**
   * Sets the upload timeout.
   */
  uploadTimeout(value: number): this {
    this.config = { ...this.config, uploadTimeout: value };
    return this;
  }

  /**
   * Sets the chunk size for blob uploads.
   */
  chunkSize(value: number): this {
    this.config = { ...this.config, chunkSize: value };
    return this;
  }

  /**
   * Sets the maximum retry attempts.
   */
  maxRetries(value: number): this {
    this.config = { ...this.config, maxRetries: value };
    return this;
  }

  /**
   * Sets the retry configuration.
   */
  retry(value: Partial<RetryConfig>): this {
    this.config = {
      ...this.config,
      retry: { ...this.config.retry, ...value },
    };
    return this;
  }

  /**
   * Sets the rate limit configuration.
   */
  rateLimit(value: Partial<RateLimitConfig>): this {
    this.config = {
      ...this.config,
      rateLimit: { ...this.config.rateLimit, ...value },
    };
    return this;
  }

  /**
   * Sets the throttle threshold.
   */
  throttleThreshold(value: number): this {
    this.config = {
      ...this.config,
      rateLimit: { ...this.config.rateLimit, throttleThreshold: value },
    };
    return this;
  }

  /**
   * Sets the simulation mode.
   */
  simulation(value: SimulationMode): this {
    this.config = { ...this.config, simulation: value };
    return this;
  }

  /**
   * Sets the User-Agent header.
   */
  userAgent(value: string): this {
    this.config = { ...this.config, userAgent: value };
    return this;
  }

  /**
   * Builds and validates the configuration.
   */
  build(): GhcrConfig {
    validateConfig(this.config);
    return { ...this.config };
  }
}

/**
 * GhcrConfig namespace with factory methods.
 */
export const GhcrConfig = {
  /**
   * Creates a new configuration builder.
   */
  builder(): GhcrConfigBuilder {
    return new GhcrConfigBuilder();
  },

  /**
   * Creates the default configuration.
   */
  default(): GhcrConfig {
    return createDefaultConfig();
  },

  /**
   * Creates configuration from environment variables.
   */
  fromEnv(): GhcrConfig {
    const builder = new GhcrConfigBuilder();

    const env = process.env;

    if (env['GHCR_REGISTRY']) {
      builder.registry(env['GHCR_REGISTRY']);
    }

    if (env['GHCR_API_BASE']) {
      builder.apiBase(env['GHCR_API_BASE']);
    }

    if (env['GHCR_TIMEOUT_SECS']) {
      builder.timeout(parseInt(env['GHCR_TIMEOUT_SECS'], 10) * 1000);
    }

    if (env['GHCR_UPLOAD_TIMEOUT_SECS']) {
      builder.uploadTimeout(parseInt(env['GHCR_UPLOAD_TIMEOUT_SECS'], 10) * 1000);
    }

    if (env['GHCR_CHUNK_SIZE']) {
      builder.chunkSize(parseInt(env['GHCR_CHUNK_SIZE'], 10));
    }

    if (env['GHCR_MAX_RETRIES']) {
      builder.maxRetries(parseInt(env['GHCR_MAX_RETRIES'], 10));
    }

    if (env['GHCR_THROTTLE_THRESHOLD']) {
      builder.throttleThreshold(parseFloat(env['GHCR_THROTTLE_THRESHOLD']));
    }

    if (env['GHCR_SIMULATION_MODE']) {
      const mode = env['GHCR_SIMULATION_MODE'];
      const path = env['GHCR_SIMULATION_PATH'] ?? '';

      if (mode === 'record') {
        builder.simulation(SimulationMode.record(path));
      } else if (mode === 'replay') {
        builder.simulation(SimulationMode.replay(path));
      }
    }

    return builder.build();
  },

  /**
   * Creates configuration from partial values.
   */
  from(partial: PartialGhcrConfig): GhcrConfig {
    const defaults = createDefaultConfig();
    return {
      registry: partial.registry ?? defaults.registry,
      apiBase: partial.apiBase ?? defaults.apiBase,
      timeout: partial.timeout ?? defaults.timeout,
      uploadTimeout: partial.uploadTimeout ?? defaults.uploadTimeout,
      chunkSize: partial.chunkSize ?? defaults.chunkSize,
      maxRetries: partial.maxRetries ?? defaults.maxRetries,
      retry: { ...defaults.retry, ...partial.retry },
      rateLimit: { ...defaults.rateLimit, ...partial.rateLimit },
      simulation: partial.simulation ?? defaults.simulation,
      userAgent: partial.userAgent ?? defaults.userAgent,
    };
  },

  /**
   * Validates a configuration.
   */
  validate(config: GhcrConfig): void {
    validateConfig(config);
  },
};

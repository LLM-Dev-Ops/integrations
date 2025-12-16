/**
 * Configuration management for the Prometheus metrics integration.
 *
 * Provides configuration classes with builder pattern for setting up
 * metrics collection and HTTP endpoint.
 */

import { ConfigurationError } from '../errors/index.js';
import type { Labels, MetricsEndpointConfig } from '../types.js';

/**
 * Configuration options for metrics endpoint
 */
export interface MetricsConfigOptions {
  /** HTTP path for metrics endpoint (default: /metrics) */
  path?: string;
  /** Port to listen on (default: 9090) */
  port?: number;
  /** Enable /health endpoint (default: true) */
  enableHealth?: boolean;
  /** Enable gzip compression for responses (default: true) */
  enableCompression?: boolean;
  /** Minimum response size in bytes to trigger compression (default: 1024) */
  compressionThreshold?: number;
  /** Scrape timeout in milliseconds (default: 10000) */
  scrapeTimeout?: number;
  /** Cache TTL in milliseconds for metrics (default: 0, disabled) */
  cacheTtl?: number;
  /** Default labels applied to all metrics */
  defaultLabels?: Labels;
  /** Cardinality limits per metric name to prevent explosion */
  cardinalityLimits?: Record<string, number>;
  /** Enable process metrics (CPU, memory, file descriptors) (default: true) */
  enableProcessMetrics?: boolean;
  /** Enable runtime metrics (event loop lag, GC stats) (default: true) */
  enableRuntimeMetrics?: boolean;
}

/**
 * Default configuration values per SPARC specification
 */
const DEFAULT_CONFIG: Required<MetricsConfigOptions> = {
  path: '/metrics',
  port: 9090,
  enableHealth: true,
  enableCompression: true,
  compressionThreshold: 1024,
  scrapeTimeout: 10000,
  cacheTtl: 0,
  defaultLabels: {},
  cardinalityLimits: {},
  enableProcessMetrics: true,
  enableRuntimeMetrics: true,
};

/**
 * Validated configuration for the metrics endpoint
 */
export class MetricsConfig implements MetricsEndpointConfig {
  readonly path: string;
  readonly port: number;
  readonly enableHealth: boolean;
  readonly enableCompression: boolean;
  readonly compressionThreshold: number;
  readonly scrapeTimeout: number;
  readonly cacheTtl: number;
  readonly defaultLabels: Labels;
  readonly cardinalityLimits: Record<string, number>;
  readonly enableProcessMetrics: boolean;
  readonly enableRuntimeMetrics: boolean;

  private constructor(options: Required<MetricsConfigOptions>) {
    this.path = options.path;
    this.port = options.port;
    this.enableHealth = options.enableHealth;
    this.enableCompression = options.enableCompression;
    this.compressionThreshold = options.compressionThreshold;
    this.scrapeTimeout = options.scrapeTimeout;
    this.cacheTtl = options.cacheTtl;
    this.defaultLabels = options.defaultLabels;
    this.cardinalityLimits = options.cardinalityLimits;
    this.enableProcessMetrics = options.enableProcessMetrics;
    this.enableRuntimeMetrics = options.enableRuntimeMetrics;
  }

  /**
   * Create configuration from options
   */
  static create(options: MetricsConfigOptions = {}): MetricsConfig {
    const config = new MetricsConfig({
      path: options.path ?? DEFAULT_CONFIG.path,
      port: options.port ?? DEFAULT_CONFIG.port,
      enableHealth: options.enableHealth ?? DEFAULT_CONFIG.enableHealth,
      enableCompression: options.enableCompression ?? DEFAULT_CONFIG.enableCompression,
      compressionThreshold: options.compressionThreshold ?? DEFAULT_CONFIG.compressionThreshold,
      scrapeTimeout: options.scrapeTimeout ?? DEFAULT_CONFIG.scrapeTimeout,
      cacheTtl: options.cacheTtl ?? DEFAULT_CONFIG.cacheTtl,
      defaultLabels: options.defaultLabels ?? DEFAULT_CONFIG.defaultLabels,
      cardinalityLimits: options.cardinalityLimits ?? DEFAULT_CONFIG.cardinalityLimits,
      enableProcessMetrics: options.enableProcessMetrics ?? DEFAULT_CONFIG.enableProcessMetrics,
      enableRuntimeMetrics: options.enableRuntimeMetrics ?? DEFAULT_CONFIG.enableRuntimeMetrics,
    });
    config.validate();
    return config;
  }

  /**
   * Create configuration from environment variables
   *
   * Environment variables:
   * - METRICS_PATH: HTTP path for metrics endpoint
   * - METRICS_PORT: Port to listen on
   * - METRICS_ENABLE_HEALTH: Enable health endpoint (true/false)
   * - METRICS_ENABLE_COMPRESSION: Enable gzip compression (true/false)
   * - METRICS_COMPRESSION_THRESHOLD: Compression threshold in bytes
   * - METRICS_SCRAPE_TIMEOUT: Scrape timeout in milliseconds
   * - METRICS_CACHE_TTL: Cache TTL in milliseconds
   * - METRICS_DEFAULT_LABELS: JSON object of default labels
   * - METRICS_ENABLE_PROCESS_METRICS: Enable process metrics (true/false)
   * - METRICS_ENABLE_RUNTIME_METRICS: Enable runtime metrics (true/false)
   */
  static fromEnv(): MetricsConfig {
    const options: MetricsConfigOptions = {};

    if (process.env['METRICS_PATH']) {
      options.path = process.env['METRICS_PATH'];
    }

    if (process.env['METRICS_PORT']) {
      const port = parseInt(process.env['METRICS_PORT'], 10);
      if (isNaN(port)) {
        throw new ConfigurationError('METRICS_PORT must be a valid number');
      }
      options.port = port;
    }

    if (process.env['METRICS_ENABLE_HEALTH']) {
      options.enableHealth = process.env['METRICS_ENABLE_HEALTH'] === 'true';
    }

    if (process.env['METRICS_ENABLE_COMPRESSION']) {
      options.enableCompression = process.env['METRICS_ENABLE_COMPRESSION'] === 'true';
    }

    if (process.env['METRICS_COMPRESSION_THRESHOLD']) {
      const threshold = parseInt(process.env['METRICS_COMPRESSION_THRESHOLD'], 10);
      if (isNaN(threshold)) {
        throw new ConfigurationError('METRICS_COMPRESSION_THRESHOLD must be a valid number');
      }
      options.compressionThreshold = threshold;
    }

    if (process.env['METRICS_SCRAPE_TIMEOUT']) {
      const timeout = parseInt(process.env['METRICS_SCRAPE_TIMEOUT'], 10);
      if (isNaN(timeout)) {
        throw new ConfigurationError('METRICS_SCRAPE_TIMEOUT must be a valid number');
      }
      options.scrapeTimeout = timeout;
    }

    if (process.env['METRICS_CACHE_TTL']) {
      const ttl = parseInt(process.env['METRICS_CACHE_TTL'], 10);
      if (isNaN(ttl)) {
        throw new ConfigurationError('METRICS_CACHE_TTL must be a valid number');
      }
      options.cacheTtl = ttl;
    }

    if (process.env['METRICS_DEFAULT_LABELS']) {
      try {
        options.defaultLabels = JSON.parse(process.env['METRICS_DEFAULT_LABELS']);
      } catch (error) {
        throw new ConfigurationError(
          'METRICS_DEFAULT_LABELS must be valid JSON',
          { cause: error as Error }
        );
      }
    }

    if (process.env['METRICS_ENABLE_PROCESS_METRICS']) {
      options.enableProcessMetrics = process.env['METRICS_ENABLE_PROCESS_METRICS'] === 'true';
    }

    if (process.env['METRICS_ENABLE_RUNTIME_METRICS']) {
      options.enableRuntimeMetrics = process.env['METRICS_ENABLE_RUNTIME_METRICS'] === 'true';
    }

    return MetricsConfig.create(options);
  }

  /**
   * Validate the configuration
   */
  validate(): void {
    // Validate path
    if (!this.path || this.path.trim() === '') {
      throw new ConfigurationError('Metrics path is required');
    }

    if (!this.path.startsWith('/')) {
      throw new ConfigurationError('Metrics path must start with "/"');
    }

    // Validate port
    if (this.port <= 0 || this.port > 65535) {
      throw new ConfigurationError('Port must be between 1 and 65535');
    }

    // Validate compression threshold
    if (this.compressionThreshold < 0) {
      throw new ConfigurationError('Compression threshold must be non-negative');
    }

    // Validate scrape timeout
    if (this.scrapeTimeout <= 0) {
      throw new ConfigurationError('Scrape timeout must be positive');
    }

    // Validate cache TTL
    if (this.cacheTtl < 0) {
      throw new ConfigurationError('Cache TTL must be non-negative');
    }

    // Validate default labels
    if (this.defaultLabels) {
      for (const [key, value] of Object.entries(this.defaultLabels)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          throw new ConfigurationError('Default labels must be string key-value pairs');
        }
        if (!this.isValidLabelName(key)) {
          throw new ConfigurationError(
            `Invalid label name in default labels: ${key}. ` +
            'Label names must match [a-zA-Z_][a-zA-Z0-9_]*'
          );
        }
      }
    }

    // Validate cardinality limits
    if (this.cardinalityLimits) {
      for (const [metricName, limit] of Object.entries(this.cardinalityLimits)) {
        if (!this.isValidMetricName(metricName)) {
          throw new ConfigurationError(
            `Invalid metric name in cardinality limits: ${metricName}. ` +
            'Metric names must match [a-zA-Z_:][a-zA-Z0-9_:]*'
          );
        }
        if (limit <= 0) {
          throw new ConfigurationError(
            `Cardinality limit for ${metricName} must be positive`
          );
        }
      }
    }
  }

  /**
   * Check if a metric name is valid according to Prometheus naming rules
   */
  private isValidMetricName(name: string): boolean {
    return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name);
  }

  /**
   * Check if a label name is valid according to Prometheus naming rules
   */
  private isValidLabelName(name: string): boolean {
    // Label names starting with __ are reserved for internal use
    if (name.startsWith('__')) {
      return false;
    }
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  /**
   * Get cardinality limit for a specific metric
   */
  getCardinalityLimit(metricName: string): number | undefined {
    return this.cardinalityLimits[metricName];
  }

  /**
   * Check if health endpoint is enabled
   */
  isHealthEnabled(): boolean {
    return this.enableHealth;
  }

  /**
   * Check if compression is enabled
   */
  isCompressionEnabled(): boolean {
    return this.enableCompression;
  }

  /**
   * Check if a response should be compressed based on size
   */
  shouldCompress(size: number): boolean {
    return this.enableCompression && size >= this.compressionThreshold;
  }
}

/**
 * Builder for creating metrics configuration with fluent API
 */
export class MetricsConfigBuilder {
  private options: MetricsConfigOptions = {};

  /**
   * Set the HTTP path for the metrics endpoint
   */
  path(path: string): this {
    this.options.path = path;
    return this;
  }

  /**
   * Set the port to listen on
   */
  port(port: number): this {
    this.options.port = port;
    return this;
  }

  /**
   * Enable or disable the health endpoint
   */
  enableHealth(enabled: boolean): this {
    this.options.enableHealth = enabled;
    return this;
  }

  /**
   * Enable or disable gzip compression
   */
  enableCompression(enabled: boolean): this {
    this.options.enableCompression = enabled;
    return this;
  }

  /**
   * Set the compression threshold in bytes
   */
  compressionThreshold(threshold: number): this {
    this.options.compressionThreshold = threshold;
    return this;
  }

  /**
   * Set the scrape timeout in milliseconds
   */
  scrapeTimeout(timeout: number): this {
    this.options.scrapeTimeout = timeout;
    return this;
  }

  /**
   * Set the cache TTL in milliseconds
   */
  cacheTtl(ttl: number): this {
    this.options.cacheTtl = ttl;
    return this;
  }

  /**
   * Set default labels applied to all metrics
   */
  defaultLabels(labels: Labels): this {
    this.options.defaultLabels = labels;
    return this;
  }

  /**
   * Add a default label
   */
  addDefaultLabel(key: string, value: string): this {
    this.options.defaultLabels = this.options.defaultLabels ?? {};
    this.options.defaultLabels[key] = value;
    return this;
  }

  /**
   * Set cardinality limits for metrics
   */
  cardinalityLimits(limits: Record<string, number>): this {
    this.options.cardinalityLimits = limits;
    return this;
  }

  /**
   * Set cardinality limit for a specific metric
   */
  setCardinalityLimit(metricName: string, limit: number): this {
    this.options.cardinalityLimits = this.options.cardinalityLimits ?? {};
    this.options.cardinalityLimits[metricName] = limit;
    return this;
  }

  /**
   * Enable or disable process metrics
   */
  enableProcessMetrics(enabled: boolean): this {
    this.options.enableProcessMetrics = enabled;
    return this;
  }

  /**
   * Enable or disable runtime metrics
   */
  enableRuntimeMetrics(enabled: boolean): this {
    this.options.enableRuntimeMetrics = enabled;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): MetricsConfig {
    return MetricsConfig.create(this.options);
  }
}

/**
 * Configuration management for the Cohere client.
 */

import { ConfigurationError } from '../errors';

/**
 * Configuration options for the Cohere client
 */
export interface CohereConfigOptions {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API (default: https://api.cohere.ai) */
  baseUrl?: string;
  /** API version (default: v1) */
  apiVersion?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Client name for tracking */
  clientName?: string;
  /** Custom user agent suffix */
  userAgentSuffix?: string;
}

/**
 * Validated configuration for the Cohere client
 */
export class CohereConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly apiVersion: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly clientName?: string;
  readonly userAgentSuffix?: string;

  private constructor(options: Required<Omit<CohereConfigOptions, 'clientName' | 'userAgentSuffix'>> & Pick<CohereConfigOptions, 'clientName' | 'userAgentSuffix'>) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.apiVersion = options.apiVersion;
    this.timeout = options.timeout;
    this.maxRetries = options.maxRetries;
    this.clientName = options.clientName;
    this.userAgentSuffix = options.userAgentSuffix;
  }

  /**
   * Create configuration from options
   */
  static create(options: CohereConfigOptions): CohereConfig {
    const config = new CohereConfig({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? 'https://api.cohere.ai',
      apiVersion: options.apiVersion ?? 'v1',
      timeout: options.timeout ?? 30000,
      maxRetries: options.maxRetries ?? 3,
      clientName: options.clientName,
      userAgentSuffix: options.userAgentSuffix,
    });
    config.validate();
    return config;
  }

  /**
   * Create configuration from environment variables
   */
  static fromEnv(): CohereConfig {
    const apiKey = process.env['COHERE_API_KEY'];
    if (!apiKey) {
      throw new ConfigurationError('COHERE_API_KEY environment variable is not set');
    }

    return CohereConfig.create({
      apiKey,
      baseUrl: process.env['COHERE_BASE_URL'],
      apiVersion: process.env['COHERE_API_VERSION'],
      timeout: process.env['COHERE_TIMEOUT']
        ? parseInt(process.env['COHERE_TIMEOUT'], 10)
        : undefined,
      maxRetries: process.env['COHERE_MAX_RETRIES']
        ? parseInt(process.env['COHERE_MAX_RETRIES'], 10)
        : undefined,
      clientName: process.env['COHERE_CLIENT_NAME'],
    });
  }

  /**
   * Validate the configuration
   */
  validate(): void {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new ConfigurationError('API key is required');
    }

    if (this.apiKey.length < 10) {
      throw new ConfigurationError('API key appears to be invalid (too short)');
    }

    try {
      new URL(this.baseUrl);
    } catch {
      throw new ConfigurationError(`Invalid base URL: ${this.baseUrl}`);
    }

    if (this.timeout <= 0) {
      throw new ConfigurationError('Timeout must be positive');
    }

    if (this.maxRetries < 0) {
      throw new ConfigurationError('Max retries must be non-negative');
    }
  }

  /**
   * Build full endpoint URL
   */
  buildUrl(path: string): string {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}/${this.apiVersion}${cleanPath}`;
  }

  /**
   * Get user agent string
   */
  getUserAgent(): string {
    let ua = `cohere-typescript/0.1.0`;
    if (this.clientName) {
      ua += ` ${this.clientName}`;
    }
    if (this.userAgentSuffix) {
      ua += ` ${this.userAgentSuffix}`;
    }
    return ua;
  }
}

/**
 * Builder for creating configuration
 */
export class CohereConfigBuilder {
  private options: Partial<CohereConfigOptions> = {};

  /**
   * Set the API key
   */
  apiKey(key: string): this {
    this.options.apiKey = key;
    return this;
  }

  /**
   * Set the base URL
   */
  baseUrl(url: string): this {
    this.options.baseUrl = url;
    return this;
  }

  /**
   * Set the API version
   */
  apiVersion(version: string): this {
    this.options.apiVersion = version;
    return this;
  }

  /**
   * Set the request timeout
   */
  timeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }

  /**
   * Set the maximum number of retries
   */
  maxRetries(count: number): this {
    this.options.maxRetries = count;
    return this;
  }

  /**
   * Set the client name
   */
  clientName(name: string): this {
    this.options.clientName = name;
    return this;
  }

  /**
   * Set a custom user agent suffix
   */
  userAgentSuffix(suffix: string): this {
    this.options.userAgentSuffix = suffix;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): CohereConfig {
    if (!this.options.apiKey) {
      throw new ConfigurationError('API key is required');
    }
    return CohereConfig.create(this.options as CohereConfigOptions);
  }
}

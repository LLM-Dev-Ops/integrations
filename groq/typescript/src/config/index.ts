/**
 * Configuration module for the Groq client.
 */

import { GroqError } from '../errors';

/** Default base URL for the Groq API. */
export const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

/** Default request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 60000;

/** Default maximum retry attempts. */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Configuration options for the Groq client.
 */
export interface GroqConfigOptions {
  /** API key for authentication. */
  apiKey: string;
  /** Base URL for API requests. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Maximum retry attempts. */
  maxRetries?: number;
  /** Custom headers to include in requests. */
  customHeaders?: Record<string, string>;
}

/**
 * Configuration for the Groq client.
 */
export class GroqConfig {
  /** API key for authentication. */
  readonly apiKey: string;
  /** Base URL for API requests. */
  readonly baseUrl: string;
  /** Request timeout in milliseconds. */
  readonly timeout: number;
  /** Maximum retry attempts. */
  readonly maxRetries: number;
  /** Custom headers. */
  readonly customHeaders: Record<string, string>;

  private constructor(options: GroqConfigOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.customHeaders = options.customHeaders ?? {};
  }

  /**
   * Creates a new configuration builder.
   */
  static builder(): GroqConfigBuilder {
    return new GroqConfigBuilder();
  }

  /**
   * Creates a configuration from environment variables.
   */
  static fromEnv(): GroqConfig {
    const apiKey = process.env['GROQ_API_KEY'];
    if (!apiKey) {
      throw GroqError.configuration('GROQ_API_KEY environment variable not set');
    }

    const builder = new GroqConfigBuilder().apiKey(apiKey);

    const baseUrl = process.env['GROQ_BASE_URL'];
    if (baseUrl) {
      builder.baseUrl(baseUrl);
    }

    const timeout = process.env['GROQ_TIMEOUT'];
    if (timeout) {
      const ms = parseInt(timeout, 10);
      if (!isNaN(ms)) {
        builder.timeout(ms);
      }
    }

    const maxRetries = process.env['GROQ_MAX_RETRIES'];
    if (maxRetries) {
      const retries = parseInt(maxRetries, 10);
      if (!isNaN(retries)) {
        builder.maxRetries(retries);
      }
    }

    return builder.build();
  }

  /**
   * Creates configuration from options.
   */
  static fromOptions(options: GroqConfigOptions): GroqConfig {
    return new GroqConfig(options);
  }

  /**
   * Returns a hint of the API key for debugging.
   */
  getApiKeyHint(): string {
    if (this.apiKey.length > 4) {
      return `...${this.apiKey.slice(-4)}`;
    }
    return '****';
  }

  /**
   * Builds the full URL for an endpoint.
   */
  getEndpointUrl(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\//, '')}`;
  }
}

/**
 * Builder for GroqConfig.
 */
export class GroqConfigBuilder {
  private _apiKey?: string;
  private _baseUrl?: string;
  private _timeout?: number;
  private _maxRetries?: number;
  private _customHeaders: Record<string, string> = {};

  /**
   * Sets the API key.
   */
  apiKey(key: string): this {
    this._apiKey = key;
    return this;
  }

  /**
   * Sets the API key from an environment variable.
   */
  apiKeyFromEnv(varName: string = 'GROQ_API_KEY'): this {
    const key = process.env[varName];
    if (!key) {
      throw GroqError.configuration(`Environment variable ${varName} not set`);
    }
    this._apiKey = key;
    return this;
  }

  /**
   * Sets the base URL.
   */
  baseUrl(url: string): this {
    this._baseUrl = url;
    return this;
  }

  /**
   * Sets the request timeout in milliseconds.
   */
  timeout(ms: number): this {
    this._timeout = ms;
    return this;
  }

  /**
   * Sets the timeout in seconds.
   */
  timeoutSecs(secs: number): this {
    this._timeout = secs * 1000;
    return this;
  }

  /**
   * Sets the maximum retry attempts.
   */
  maxRetries(retries: number): this {
    this._maxRetries = retries;
    return this;
  }

  /**
   * Adds a custom header.
   */
  header(name: string, value: string): this {
    this._customHeaders[name] = value;
    return this;
  }

  /**
   * Builds the configuration.
   */
  build(): GroqConfig {
    if (!this._apiKey) {
      throw GroqError.configuration('API key is required');
    }

    if (this._apiKey.length === 0) {
      throw GroqError.configuration('API key cannot be empty');
    }

    // Warn if API key doesn't match expected format
    if (!this._apiKey.startsWith('gsk_')) {
      console.warn('API key does not match expected Groq format (gsk_*)');
    }

    if (this._baseUrl && !this._baseUrl.startsWith('https://')) {
      throw GroqError.configuration('Base URL must use HTTPS');
    }

    return GroqConfig.fromOptions({
      apiKey: this._apiKey,
      baseUrl: this._baseUrl,
      timeout: this._timeout,
      maxRetries: this._maxRetries,
      customHeaders:
        Object.keys(this._customHeaders).length > 0 ? this._customHeaders : undefined,
    });
  }
}

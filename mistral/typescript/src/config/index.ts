/**
 * Configuration module for the Mistral client.
 */

const DEFAULT_BASE_URL = 'https://api.mistral.ai';
const DEFAULT_TIMEOUT = 120000; // 2 minutes
const DEFAULT_MAX_RETRIES = 3;

/**
 * Configuration options for the Mistral client.
 */
export interface MistralConfigOptions {
  /** API key for authentication. */
  apiKey: string;
  /** Base URL for the API. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Maximum number of retry attempts. */
  maxRetries?: number;
  /** Custom headers to include in requests. */
  customHeaders?: Record<string, string>;
}

/**
 * Configuration for the Mistral client.
 */
export class MistralConfig {
  /** API key for authentication. */
  readonly apiKey: string;
  /** Base URL for the API. */
  readonly baseUrl: string;
  /** Request timeout in milliseconds. */
  readonly timeout: number;
  /** Maximum number of retry attempts. */
  readonly maxRetries: number;
  /** Custom headers to include in requests. */
  readonly customHeaders: Record<string, string>;

  private constructor(options: Required<MistralConfigOptions>) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.timeout = options.timeout;
    this.maxRetries = options.maxRetries;
    this.customHeaders = options.customHeaders;
  }

  /**
   * Creates a new configuration builder.
   */
  static builder(): MistralConfigBuilder {
    return new MistralConfigBuilder();
  }

  /**
   * Creates configuration from environment variables.
   */
  static fromEnv(): MistralConfig {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY environment variable is not set');
    }

    return new MistralConfig({
      apiKey,
      baseUrl: process.env.MISTRAL_BASE_URL ?? DEFAULT_BASE_URL,
      timeout: parseInt(process.env.MISTRAL_TIMEOUT ?? String(DEFAULT_TIMEOUT), 10),
      maxRetries: parseInt(process.env.MISTRAL_MAX_RETRIES ?? String(DEFAULT_MAX_RETRIES), 10),
      customHeaders: {},
    });
  }

  /**
   * Creates configuration from options.
   */
  static create(options: MistralConfigOptions): MistralConfig {
    return new MistralConfig({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      customHeaders: options.customHeaders ?? {},
    });
  }
}

/**
 * Builder for Mistral configuration.
 */
export class MistralConfigBuilder {
  private options: Partial<MistralConfigOptions> = {};

  /**
   * Sets the API key.
   */
  apiKey(key: string): this {
    this.options.apiKey = key;
    return this;
  }

  /**
   * Sets the base URL.
   */
  baseUrl(url: string): this {
    this.options.baseUrl = url;
    return this;
  }

  /**
   * Sets the request timeout.
   */
  timeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }

  /**
   * Sets the maximum number of retries.
   */
  maxRetries(retries: number): this {
    this.options.maxRetries = retries;
    return this;
  }

  /**
   * Adds a custom header.
   */
  header(key: string, value: string): this {
    this.options.customHeaders = {
      ...this.options.customHeaders,
      [key]: value,
    };
    return this;
  }

  /**
   * Sets custom headers.
   */
  headers(headers: Record<string, string>): this {
    this.options.customHeaders = { ...this.options.customHeaders, ...headers };
    return this;
  }

  /**
   * Builds the configuration.
   */
  build(): MistralConfig {
    if (!this.options.apiKey) {
      // Try to get from environment
      const envKey = process.env.MISTRAL_API_KEY;
      if (!envKey) {
        throw new Error('API key is required');
      }
      this.options.apiKey = envKey;
    }

    return MistralConfig.create(this.options as MistralConfigOptions);
  }
}

export { MistralConfig as default };

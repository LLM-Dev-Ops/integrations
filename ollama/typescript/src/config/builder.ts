/**
 * Builder for creating Ollama client instances.
 */

import type { OllamaConfig, SimulationMode, RecordStorage, TimingMode } from './types.js';
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES } from './constants.js';
import type { OllamaClient } from '../client.js';

/**
 * Builder for OllamaConfig with fluent API.
 */
export class OllamaClientBuilder {
  private _baseUrl?: string;
  private _timeoutMs?: number;
  private _maxRetries?: number;
  private _authToken?: string;
  private _defaultModel?: string;
  private _defaultHeaders: Record<string, string> = {};
  private _simulationMode: SimulationMode = { type: 'disabled' };

  /**
   * Set base URL.
   */
  baseUrl(url: string): this {
    this._baseUrl = url;
    return this;
  }

  /**
   * Set base URL from environment variable.
   * Reads from OLLAMA_HOST environment variable.
   */
  baseUrlFromEnv(): this {
    const url = process.env.OLLAMA_HOST;
    if (url) {
      this._baseUrl = url;
    }
    return this;
  }

  /**
   * Set timeout in milliseconds.
   */
  timeoutMs(ms: number): this {
    this._timeoutMs = ms;
    return this;
  }

  /**
   * Set maximum retry attempts.
   */
  maxRetries(count: number): this {
    this._maxRetries = count;
    return this;
  }

  /**
   * Set authentication token.
   * For use with proxied Ollama setups.
   */
  authToken(token: string): this {
    this._authToken = token;
    return this;
  }

  /**
   * Set default model.
   */
  defaultModel(model: string): this {
    this._defaultModel = model;
    return this;
  }

  /**
   * Set default model from environment variable.
   * Reads from OLLAMA_MODEL environment variable.
   */
  defaultModelFromEnv(): this {
    const model = process.env.OLLAMA_MODEL;
    if (model) {
      this._defaultModel = model;
    }
    return this;
  }

  /**
   * Add a default header.
   */
  defaultHeader(name: string, value: string): this {
    this._defaultHeaders[name] = value;
    return this;
  }

  /**
   * Enable simulation recording mode.
   * Records all requests and responses for later replay.
   */
  recordTo(storage: RecordStorage): this {
    this._simulationMode = { type: 'recording', storage };
    return this;
  }

  /**
   * Enable simulation replay mode.
   * Replays previously recorded responses without hitting Ollama.
   *
   * @param source - Source of recordings
   * @param timing - Timing mode (default: 'instant')
   */
  replayFrom(source: RecordStorage, timing: TimingMode = 'instant'): this {
    this._simulationMode = { type: 'replay', source, timing };
    return this;
  }

  /**
   * Build the client.
   * Validates configuration and creates OllamaClient instance.
   *
   * @throws Error if configuration is invalid
   */
  build(): OllamaClient {
    const config: OllamaConfig = {
      baseUrl: this._baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: this._timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: this._maxRetries ?? DEFAULT_MAX_RETRIES,
      authToken: this._authToken,
      defaultModel: this._defaultModel,
      defaultHeaders: this._defaultHeaders,
      simulationMode: this._simulationMode,
    };

    // Validate configuration
    this.validate(config);

    // Import and instantiate client
    // Note: This is a lazy import to avoid circular dependencies
    // The actual OllamaClient class will be imported at runtime
    const { OllamaClient } = require('../client.js') as { OllamaClient: new (config: OllamaConfig) => OllamaClient };
    return new OllamaClient(config);
  }

  /**
   * Validate configuration.
   *
   * @throws Error if configuration is invalid
   */
  private validate(config: OllamaConfig): void {
    // Validate base URL format
    if (!config.baseUrl.startsWith('http://') && !config.baseUrl.startsWith('https://')) {
      throw new Error('Base URL must start with http:// or https://');
    }

    // Validate timeout
    if (config.timeoutMs <= 0) {
      throw new Error('Timeout must be greater than 0');
    }

    // Warn if connecting to remote without auth
    if (this.isRemote(config) && !config.authToken) {
      console.warn('Connecting to remote Ollama without authentication');
    }
  }

  /**
   * Check if configuration points to a remote server.
   */
  private isRemote(config: OllamaConfig): boolean {
    return !config.baseUrl.includes('localhost') && !config.baseUrl.includes('127.0.0.1');
  }
}

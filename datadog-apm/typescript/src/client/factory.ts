/**
 * Factory for creating Datadog APM clients.
 *
 * Implements singleton pattern to ensure only one client instance exists.
 * Provides methods for creating real and mock clients.
 */

import type { DatadogAPMClient } from './interface.js';
import { DatadogAPMClientImpl } from './client.js';
import type { DatadogAPMConfig, SpanOptions, Tags } from '../types/index.js';
import type { Span } from '../tracing/index.js';
import type { LLMSpan, LLMSpanOptions } from '../llm/interface.js';
import type { AgentSpan, AgentSpanOptions } from '../agent/interface.js';
import type { Timer } from '../metrics/timer.js';
import { ConfigurationError } from '../errors/index.js';
import { validateConfig } from '../config/validation.js';

/**
 * Simplified interface for dd-trace tracer
 */
interface DatadogTracerWrapper {
  startSpan(name: string, options?: Record<string, unknown>): any;
  scope(): {
    active(): any | null;
  };
  inject(spanContext: unknown, format: string, carrier: any): void;
  extract(format: string, carrier: any): unknown | null;
}

/**
 * Simplified interface for hot-shots StatsD client
 */
interface StatsDClient {
  increment(stat: string, value?: number, tags?: string[]): void;
  gauge(stat: string, value: number, tags?: string[]): void;
  histogram(stat: string, value: number, tags?: string[]): void;
  distribution(stat: string, value: number, tags?: string[]): void;
  close(callback?: (error?: Error) => void): void;
}

/**
 * Mock implementation of DatadogAPMClient for testing.
 *
 * All methods are no-ops that return appropriate default values.
 * Implements the full DatadogAPMClient interface properly.
 */
class MockDatadogAPMClient implements DatadogAPMClient {
  private mockSpan: Span | null = null;
  private readonly config?: Partial<DatadogAPMConfig>;

  constructor(config?: Partial<DatadogAPMConfig>) {
    this.config = config;
  }

  startSpan(name: string): Span {
    // Create a minimal mock span that implements the Span interface
    const mockSpan: Span = {
      traceId: '1234567890abcdef',
      spanId: 'fedcba0987654321',
      parentId: undefined,
      name,
      service: this.config?.service || 'mock-service',
      resource: name,
      startTime: Date.now(),
      duration: undefined,
      tags: {},
      error: undefined,
      metrics: {},
      setTag: (key: string, value: any) => {
        (mockSpan.tags as any)[key] = value;
        return mockSpan;
      },
      setError: (error: Error | string) => {
        (mockSpan as any).error = 1;
        if (typeof error === 'string') {
          (mockSpan.tags as any)['error.message'] = error;
        } else {
          (mockSpan.tags as any)['error.type'] = error.constructor.name;
          (mockSpan.tags as any)['error.message'] = error.message;
          if (error.stack) {
            (mockSpan.tags as any)['error.stack'] = error.stack;
          }
        }
        return mockSpan;
      },
      addEvent: (eventName: string, attributes?: any) => {
        (mockSpan.tags as any)[`event.${eventName}.timestamp`] = new Date().toISOString();
        if (attributes) {
          Object.entries(attributes).forEach(([key, value]) => {
            (mockSpan.tags as any)[`event.${eventName}.${key}`] = value;
          });
        }
        return mockSpan;
      },
      finish: (endTime?: number) => {
        (mockSpan as any).duration = (endTime || Date.now()) - mockSpan.startTime;
      },
      context: () => ({
        traceId: mockSpan.traceId,
        spanId: mockSpan.spanId,
        parentId: mockSpan.parentId,
        samplingPriority: 1,
      }),
    };

    this.mockSpan = mockSpan;
    return mockSpan;
  }

  getCurrentSpan(): Span | null {
    return this.mockSpan;
  }

  injectContext(_carrier: any): void {
    // No-op - mock doesn't inject real context
  }

  extractContext(_carrier: any): any {
    return null;
  }

  increment(_name: string, _value?: number, _tags?: any): void {
    // No-op - mock doesn't send real metrics
  }

  gauge(_name: string, _value: number, _tags?: any): void {
    // No-op - mock doesn't send real metrics
  }

  histogram(_name: string, _value: number, _tags?: any): void {
    // No-op - mock doesn't send real metrics
  }

  distribution(_name: string, _value: number, _tags?: any): void {
    // No-op - mock doesn't send real metrics
  }

  getLogContext(): any {
    if (!this.mockSpan) {
      return null;
    }
    return {
      dd_trace_id: this.mockSpan.traceId,
      dd_span_id: this.mockSpan.spanId,
      dd_service: this.config?.service || 'mock-service',
      dd_env: this.config?.env || 'test',
      dd_version: this.config?.version || '1.0.0',
    };
  }

  async flush(): Promise<void> {
    // No-op - mock doesn't need to flush
  }

  async shutdown(): Promise<void> {
    // No-op - mock doesn't need cleanup
    this.mockSpan = null;
  }

  startLLMSpan(_name: string, _options: LLMSpanOptions): LLMSpan {
    // Create a mock LLM span that extends the basic span
    const baseSpan = this.startSpan(_name);
    return {
      ...baseSpan,
      recordTokens: (_inputTokens: number, _outputTokens: number) => baseSpan,
      setFinishReason: (_reason: string) => baseSpan,
      recordCost: (_inputCost: number, _outputCost: number) => baseSpan,
      sanitizeContent: (_content: string) => _content,
    } as any as LLMSpan;
  }

  async traceLLM<T>(
    name: string,
    options: LLMSpanOptions,
    fn: (span: LLMSpan) => Promise<T>
  ): Promise<T> {
    const span = this.startLLMSpan(name, options);
    try {
      const result = await fn(span);
      span.finish();
      return result;
    } catch (error) {
      span.setError(error as Error);
      span.finish();
      throw error;
    }
  }

  startAgentSpan(_name: string, _options: AgentSpanOptions): AgentSpan {
    // Create a mock agent span that extends the basic span
    const baseSpan = this.startSpan(_name);
    return {
      ...baseSpan,
      startStep: (_stepName: string, _stepOptions?: any) => baseSpan as any,
      recordToolCall: (_toolName: string, _durationMs: number, _success: boolean) => baseSpan,
      setTotalSteps: (_totalSteps: number) => baseSpan,
      setCurrentStep: (_stepNumber: number) => baseSpan,
    } as any as AgentSpan;
  }

  async traceAgent<T>(
    name: string,
    options: AgentSpanOptions,
    fn: (span: AgentSpan) => Promise<T>
  ): Promise<T> {
    const span = this.startAgentSpan(name, options);
    try {
      const result = await fn(span);
      span.finish();
      return result;
    } catch (error) {
      span.setError(error as Error);
      span.finish();
      throw error;
    }
  }

  async trace<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    _options?: SpanOptions
  ): Promise<T> {
    // Note: options are not used in mock implementation
    const span = this.startSpan(name);
    try {
      const result = await fn(span);
      span.finish();
      return result;
    } catch (error) {
      span.setError(error as Error);
      span.finish();
      throw error;
    }
  }

  startTimer(_name: string, _tags?: Tags): Timer {
    // Create a mock timer
    const startTime = Date.now();
    return {
      stop: () => {
        const duration = Date.now() - startTime;
        return duration;
      },
    } as Timer;
  }
}

/**
 * Factory for creating and managing Datadog APM clients.
 *
 * Implements the singleton pattern to ensure only one client instance
 * exists per application. Provides methods for:
 * - Creating a real client connected to Datadog (with user-provided tracer)
 * - Attempting to auto-initialize dd-trace (dynamic import)
 * - Creating a mock client for testing
 * - Retrieving the singleton instance
 * - Resetting the singleton (primarily for testing)
 */
export class DatadogAPMClientFactory {
  private static instance: DatadogAPMClient | null = null;

  /**
   * Create a new Datadog APM client with user-provided tracer and optional StatsD client.
   *
   * This is the recommended method for production use where you have already
   * initialized dd-trace in your application. It enforces the singleton pattern,
   * throwing an error if a client already exists.
   *
   * @param tracer - Pre-initialized dd-trace tracer instance
   * @param statsD - Optional hot-shots StatsD client for metrics
   * @param config - Configuration for the Datadog APM client (will be validated)
   * @returns A new DatadogAPMClient instance
   * @throws {ConfigurationError} If a client already exists or if config is invalid
   *
   * @example
   * ```typescript
   * import tracer from 'dd-trace';
   * import StatsD from 'hot-shots';
   *
   * // Initialize dd-trace
   * tracer.init({
   *   service: 'my-service',
   *   env: 'production',
   *   version: '1.0.0',
   * });
   *
   * // Initialize StatsD (optional)
   * const statsD = new StatsD({
   *   host: 'localhost',
   *   port: 8125,
   * });
   *
   * // Create client
   * const client = DatadogAPMClientFactory.createWithTracer(tracer, statsD, {
   *   service: 'my-service',
   *   env: 'production',
   *   version: '1.0.0',
   * });
   * ```
   */
  static createWithTracer(
    tracer: DatadogTracerWrapper,
    statsD: StatsDClient | undefined,
    config: Partial<DatadogAPMConfig>
  ): DatadogAPMClient {
    if (this.instance) {
      throw new ConfigurationError(
        'DatadogAPM client already initialized. Use getInstance() to retrieve the existing client or reset() to clear it.'
      );
    }

    // Validate configuration
    const validatedConfig = validateConfig(config);

    // Create client instance
    this.instance = new DatadogAPMClientImpl(tracer, statsD, validatedConfig);
    return this.instance;
  }

  /**
   * Create a new Datadog APM client by attempting to dynamically import dd-trace.
   *
   * This method tries to import and initialize dd-trace automatically. It will:
   * 1. Validate the configuration
   * 2. Attempt to dynamically import dd-trace
   * 3. Initialize dd-trace with the provided configuration
   * 4. Optionally initialize hot-shots StatsD client if configured
   * 5. Create a DatadogAPMClientImpl instance
   *
   * If dd-trace is not installed, it throws a helpful error message.
   *
   * @param config - Configuration for the Datadog APM client (will be validated)
   * @returns A new DatadogAPMClient instance
   * @throws {ConfigurationError} If a client already exists, config is invalid, or dd-trace cannot be loaded
   *
   * @example
   * ```typescript
   * const client = DatadogAPMClientFactory.create({
   *   service: 'my-service',
   *   env: 'production',
   *   version: '1.0.0',
   *   agentHost: 'localhost',
   *   agentPort: 8126,
   *   sampleRate: 1.0,
   *   statsdPort: 8125,
   * });
   * ```
   */
  static async create(config: Partial<DatadogAPMConfig>): Promise<DatadogAPMClient> {
    if (this.instance) {
      throw new ConfigurationError(
        'DatadogAPM client already initialized. Use getInstance() to retrieve the existing client or reset() to clear it.'
      );
    }

    // Validate configuration
    const validatedConfig = validateConfig(config);

    try {
      // Try to dynamically import dd-trace
      // @ts-expect-error - dd-trace is a peer dependency loaded dynamically
      const ddTrace = await import('dd-trace');

      // Initialize dd-trace with configuration
      const tracer = ddTrace.default.init({
        service: validatedConfig.service,
        env: validatedConfig.env,
        version: validatedConfig.version,
        hostname: validatedConfig.agentHost,
        port: validatedConfig.agentPort,
        sampleRate: validatedConfig.sampleRate,
        logInjection: true,
      });

      // Initialize StatsD client if configured
      let statsD: StatsDClient | undefined;
      if (validatedConfig.statsdPort) {
        try {
          // @ts-expect-error - hot-shots is a peer dependency loaded dynamically
          const StatsD = await import('hot-shots');
          statsD = new StatsD.default({
            host: validatedConfig.agentHost,
            port: validatedConfig.statsdPort,
            globalTags: validatedConfig.globalTags
              ? Object.entries(validatedConfig.globalTags).map(([k, v]) => `${k}:${v}`)
              : undefined,
          }) as StatsDClient;
        } catch (statsdError) {
          validatedConfig.logger?.warn(
            'hot-shots not available, metrics will not be recorded',
            { error: statsdError }
          );
        }
      }

      // Create client instance
      this.instance = new DatadogAPMClientImpl(tracer, statsD, validatedConfig);
      return this.instance;
    } catch (error: any) {
      // Check if the error is from a failed import
      if (error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'MODULE_NOT_FOUND') {
        throw new ConfigurationError(
          'dd-trace module not found. Install it with: npm install dd-trace\n' +
          'Alternatively, use createWithTracer() if you have already initialized dd-trace in your application.'
        );
      }

      throw new ConfigurationError(
        `Failed to initialize dd-trace: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a mock client for testing.
   *
   * This creates a mock implementation that doesn't connect to Datadog.
   * All operations are no-ops. Like create(), this enforces the singleton pattern.
   * Optionally accepts a partial config to customize mock behavior (e.g., service name).
   *
   * @param config - Optional partial configuration for the mock client
   * @returns A mock DatadogAPMClient instance
   * @throws {ConfigurationError} If a client already exists
   *
   * @example
   * ```typescript
   * // In test setup
   * const client = DatadogAPMClientFactory.createMock({
   *   service: 'test-service',
   *   env: 'test',
   *   version: '1.0.0',
   * });
   * ```
   */
  static createMock(config?: Partial<DatadogAPMConfig>): DatadogAPMClient {
    if (this.instance) {
      throw new ConfigurationError(
        'DatadogAPM client already initialized. Use reset() to clear the existing client first.'
      );
    }

    this.instance = new MockDatadogAPMClient(config);
    return this.instance;
  }

  /**
   * Get the singleton client instance.
   *
   * Returns the existing client instance, or throws an error if
   * no client has been created yet.
   *
   * @returns The singleton DatadogAPMClient instance
   * @throws {ConfigurationError} If no client has been initialized
   *
   * @example
   * ```typescript
   * // Anywhere in your application
   * const client = DatadogAPMClientFactory.getInstance();
   * const span = client.startSpan('operation');
   * ```
   */
  static getInstance(): DatadogAPMClient {
    if (!this.instance) {
      throw new ConfigurationError(
        'DatadogAPM client not initialized. Call create() or createMock() first.'
      );
    }
    return this.instance;
  }

  /**
   * Reset the singleton instance.
   *
   * Clears the current client instance. This is primarily useful for testing,
   * allowing you to create a new client after resetting.
   *
   * WARNING: This does not shut down the existing client. Call shutdown()
   * on the client before resetting if you need to clean up resources.
   *
   * @example
   * ```typescript
   * // In test teardown
   * const client = DatadogAPMClientFactory.getInstance();
   * await client.shutdown();
   * DatadogAPMClientFactory.reset();
   * ```
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Check if a client instance exists.
   *
   * @returns True if a client has been initialized, false otherwise
   *
   * @example
   * ```typescript
   * if (!DatadogAPMClientFactory.hasInstance()) {
   *   DatadogAPMClientFactory.create(config);
   * }
   * ```
   */
  static hasInstance(): boolean {
    return this.instance !== null;
  }
}

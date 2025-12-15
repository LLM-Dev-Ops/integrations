/**
 * vLLM Client Implementation
 * Main entry point for vLLM API interactions
 */

import type {
  VllmConfig,
  ServerConfig,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  TokenizeRequest,
  TokenizeResponse,
  DetokenizeRequest,
  DetokenizeResponse,
  ModelInfo,
  ModelList,
  HealthCheckResult,
  VllmMetrics,
  HealthStatus,
} from '../types/index.js';
import { InvalidModelError, ConfigurationError } from '../types/errors.js';
import { validateConfig, mergeConfig } from './config.js';
import { createHttpTransport, type HttpTransport } from '../transport/http-transport.js';
import { parseChatChunks, createBackpressureStream } from '../streaming/sse-parser.js';
import { CircuitBreakerRegistry, type CircuitState } from '../resilience/circuit-breaker.js';
import { RateLimiterRegistry } from '../resilience/rate-limiter.js';
import { RetryHandler } from '../resilience/retry.js';
import { ModelRegistry, ModelDiscoveryService } from '../routing/model-registry.js';
import { BatchProcessor, ConcurrentExecutor } from '../batching/batch-processor.js';
import { WorkloadRecorder } from '../simulation/recorder.js';
import {
  type MetricsCollector,
  createMetricsCollector,
  MetricNames,
} from '../observability/metrics.js';
import { type Tracer, createTracer, SpanNames } from '../observability/tracing.js';
import { type Logger, createLogger } from '../observability/logging.js';

/**
 * vLLM Client interface
 */
export interface VllmClient {
  // Chat API
  chatCompletion(request: ChatRequest): Promise<ChatResponse>;
  chatCompletionStream(request: ChatRequest): AsyncIterable<ChatChunk>;

  // Completions API
  completion(request: CompletionRequest): Promise<CompletionResponse>;

  // Embeddings API
  embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  // Model discovery
  listModels(): Promise<ModelList>;
  getModel(modelId: string): ModelInfo | undefined;

  // Tokenization
  tokenize(request: TokenizeRequest): Promise<TokenizeResponse>;
  detokenize(request: DetokenizeRequest): Promise<DetokenizeResponse>;

  // Health and metrics
  healthCheck(serverUrl?: string): Promise<HealthCheckResult>;
  getMetrics(serverUrl: string): Promise<VllmMetrics>;

  // Lifecycle
  close(): Promise<void>;

  // Recording
  startRecording(): void;
  stopRecording(): void;
  isRecording(): boolean;
}

/**
 * vLLM Client implementation
 */
export class VllmClientImpl implements VllmClient {
  private readonly config: VllmConfig;
  private readonly transports: Map<string, HttpTransport> = new Map();
  private readonly circuitBreakers: CircuitBreakerRegistry;
  private readonly rateLimiters: RateLimiterRegistry | undefined;
  private readonly retryHandler: RetryHandler;
  private readonly modelRegistry: ModelRegistry;
  private readonly discoveryService: ModelDiscoveryService;
  private readonly batchProcessor: BatchProcessor | undefined;
  private readonly recorder: WorkloadRecorder;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;
  private readonly logger: Logger;
  private closed = false;

  constructor(config: VllmConfig) {
    this.config = validateConfig(config);

    // Initialize components
    this.circuitBreakers = new CircuitBreakerRegistry(this.config.circuitBreaker);
    this.retryHandler = new RetryHandler(this.config.retry);
    this.modelRegistry = new ModelRegistry(this.config.servers);
    this.recorder = new WorkloadRecorder();
    this.metrics = createMetricsCollector(true);
    this.tracer = createTracer(true);
    this.logger = createLogger('info');

    // Initialize rate limiters if configured
    if (this.config.rateLimit) {
      this.rateLimiters = new RateLimiterRegistry(this.config.rateLimit);
    }

    // Initialize transports
    for (const server of this.config.servers) {
      const headers: Record<string, string> = {};
      if (server.authToken) {
        headers['Authorization'] = `Bearer ${server.authToken}`;
      }

      const transport = createHttpTransport(
        server.url,
        headers,
        this.config.timeout
      );

      this.transports.set(server.url, transport);
    }

    // Initialize model discovery
    this.discoveryService = new ModelDiscoveryService(
      this.modelRegistry,
      this.config.modelDiscoveryIntervalMs,
      async (serverUrl) => {
        const models = await this.fetchModelsFromServer(serverUrl);
        return models.data;
      }
    );

    // Initialize batch processor if configured
    if (this.config.batch) {
      const executor = new ConcurrentExecutor(
        (request) => this.executeChatCompletion(request)
      );
      this.batchProcessor = new BatchProcessor(this.config.batch, executor);
      this.batchProcessor.start();
    }

    // Start model discovery if enabled
    if (this.config.autoDiscoverModels) {
      this.discoveryService.start();
    }

    this.logger.info('VllmClient initialized', {
      servers: this.config.servers.length,
      autoDiscoverModels: this.config.autoDiscoverModels,
    });
  }

  // ===== CHAT API =====

  async chatCompletion(request: ChatRequest): Promise<ChatResponse> {
    this.ensureNotClosed();

    // Use batch processor if available and request is not streaming
    if (this.batchProcessor && !request.stream) {
      return this.batchProcessor.submit(request);
    }

    return this.executeChatCompletion(request);
  }

  private async executeChatCompletion(request: ChatRequest): Promise<ChatResponse> {
    const span = this.tracer.startSpan(SpanNames.CHAT_COMPLETION, {
      model: request.model,
      stream: false,
    });

    const startTime = Date.now();

    try {
      const serverUrl = this.selectServer(request.model);
      const transport = this.getTransport(serverUrl);
      const circuitBreaker = this.circuitBreakers.get(serverUrl);

      // Check rate limit
      if (this.rateLimiters) {
        await this.rateLimiters.acquireAsync(serverUrl);
      }

      // Execute with circuit breaker and retry
      const result = await this.retryHandler.execute(async () => {
        return circuitBreaker.execute(async () => {
          return transport.request<ChatResponse>(
            'POST',
            '/v1/chat/completions',
            { ...request, stream: false }
          );
        });
      });

      // Record metrics
      const duration = Date.now() - startTime;
      this.metrics.incrementCounter(MetricNames.REQUEST_COUNT, 1, {
        server: serverUrl,
        model: request.model,
        status: 'success',
      });
      this.metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, duration, {
        server: serverUrl,
        model: request.model,
      });
      this.metrics.incrementCounter(
        MetricNames.TOKENS_PROMPT,
        result.usage.prompt_tokens,
        { server: serverUrl, model: request.model }
      );
      this.metrics.incrementCounter(
        MetricNames.TOKENS_COMPLETION,
        result.usage.completion_tokens,
        { server: serverUrl, model: request.model }
      );

      // Record for simulation
      if (this.recorder.isRecording()) {
        await this.recorder.record(request, result, duration);
      }

      span.setAttribute('tokens.prompt', result.usage.prompt_tokens);
      span.setAttribute('tokens.completion', result.usage.completion_tokens);
      span.setStatus('ok');

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.incrementCounter(MetricNames.REQUEST_ERRORS, 1, {
        model: request.model,
        error: error instanceof Error ? error.name : 'unknown',
      });
      this.metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, duration, {
        model: request.model,
      });

      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  chatCompletionStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    this.ensureNotClosed();

    const self = this;

    return {
      [Symbol.asyncIterator]() {
        return self.streamChatCompletion(request);
      },
    };
  }

  private async *streamChatCompletion(
    request: ChatRequest
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const span = this.tracer.startSpan(SpanNames.CHAT_COMPLETION_STREAM, {
      model: request.model,
      stream: true,
    });

    const startTime = Date.now();
    let chunkCount = 0;

    try {
      const serverUrl = this.selectServer(request.model);
      const transport = this.getTransport(serverUrl);
      const circuitBreaker = this.circuitBreakers.get(serverUrl);

      // Check rate limit
      if (this.rateLimiters) {
        await this.rateLimiters.acquireAsync(serverUrl);
      }

      // Execute with circuit breaker
      circuitBreaker.check();

      const stream = await transport.requestStream(
        'POST',
        '/v1/chat/completions',
        { ...request, stream: true }
      );

      // Parse stream with back-pressure
      const chunks = createBackpressureStream(stream, parseChatChunks, 100);

      for await (const chunk of chunks) {
        chunkCount++;
        yield chunk;
      }

      circuitBreaker.recordSuccess();

      // Record metrics
      const duration = Date.now() - startTime;
      this.metrics.incrementCounter(MetricNames.REQUEST_COUNT, 1, {
        server: serverUrl,
        model: request.model,
        status: 'success',
      });
      this.metrics.recordHistogram(MetricNames.STREAM_DURATION_MS, duration, {
        server: serverUrl,
        model: request.model,
      });
      this.metrics.incrementCounter(MetricNames.STREAM_CHUNKS, chunkCount, {
        server: serverUrl,
        model: request.model,
      });

      span.setAttribute('chunks', chunkCount);
      span.setStatus('ok');
    } catch (error) {
      this.metrics.incrementCounter(MetricNames.REQUEST_ERRORS, 1, {
        model: request.model,
        error: error instanceof Error ? error.name : 'unknown',
      });

      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  // ===== COMPLETIONS API =====

  async completion(request: CompletionRequest): Promise<CompletionResponse> {
    this.ensureNotClosed();

    const span = this.tracer.startSpan(SpanNames.COMPLETION, {
      model: request.model,
    });

    try {
      const serverUrl = this.selectServer(request.model);
      const transport = this.getTransport(serverUrl);
      const circuitBreaker = this.circuitBreakers.get(serverUrl);

      if (this.rateLimiters) {
        await this.rateLimiters.acquireAsync(serverUrl);
      }

      const result = await this.retryHandler.execute(async () => {
        return circuitBreaker.execute(async () => {
          return transport.request<CompletionResponse>(
            'POST',
            '/v1/completions',
            { ...request, stream: false }
          );
        });
      });

      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  // ===== EMBEDDINGS API =====

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    this.ensureNotClosed();

    const span = this.tracer.startSpan(SpanNames.EMBEDDINGS, {
      model: request.model,
    });

    try {
      const serverUrl = this.selectServer(request.model);
      const transport = this.getTransport(serverUrl);
      const circuitBreaker = this.circuitBreakers.get(serverUrl);

      if (this.rateLimiters) {
        await this.rateLimiters.acquireAsync(serverUrl);
      }

      const result = await this.retryHandler.execute(async () => {
        return circuitBreaker.execute(async () => {
          return transport.request<EmbeddingResponse>(
            'POST',
            '/v1/embeddings',
            request
          );
        });
      });

      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  // ===== MODEL DISCOVERY =====

  async listModels(): Promise<ModelList> {
    this.ensureNotClosed();

    const span = this.tracer.startSpan(SpanNames.LIST_MODELS);

    try {
      // If we have cached models, return them
      const cachedModels = this.modelRegistry.listModels();
      if (cachedModels.length > 0) {
        span.setStatus('ok');
        return {
          object: 'list',
          data: cachedModels,
        };
      }

      // Fetch from first available server
      for (const server of this.config.servers) {
        try {
          const result = await this.fetchModelsFromServer(server.url);
          span.setStatus('ok');
          return result;
        } catch {
          continue;
        }
      }

      throw new ConfigurationError('No servers available to list models');
    } catch (error) {
      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  private async fetchModelsFromServer(serverUrl: string): Promise<ModelList> {
    const transport = this.getTransport(serverUrl);
    return transport.request<ModelList>('GET', '/v1/models');
  }

  getModel(modelId: string): ModelInfo | undefined {
    const models = this.modelRegistry.listModels();
    return models.find((m) => m.id === modelId);
  }

  // ===== TOKENIZATION =====

  async tokenize(request: TokenizeRequest): Promise<TokenizeResponse> {
    this.ensureNotClosed();

    const span = this.tracer.startSpan(SpanNames.TOKENIZE);

    try {
      // Use first available server
      const serverUrl = this.config.servers[0]!.url;
      const transport = this.getTransport(serverUrl);

      const result = await transport.request<TokenizeResponse>(
        'POST',
        '/tokenize',
        request
      );

      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  async detokenize(request: DetokenizeRequest): Promise<DetokenizeResponse> {
    this.ensureNotClosed();

    const span = this.tracer.startSpan(SpanNames.DETOKENIZE);

    try {
      const serverUrl = this.config.servers[0]!.url;
      const transport = this.getTransport(serverUrl);

      const result = await transport.request<DetokenizeResponse>(
        'POST',
        '/detokenize',
        request
      );

      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  // ===== HEALTH AND METRICS =====

  async healthCheck(serverUrl?: string): Promise<HealthCheckResult> {
    this.ensureNotClosed();

    const span = this.tracer.startSpan(SpanNames.HEALTH_CHECK, {
      server: serverUrl ?? 'all',
    });

    const targetUrl = serverUrl ?? this.config.servers[0]!.url;
    const startTime = Date.now();

    try {
      const transport = this.getTransport(targetUrl);
      await transport.request('GET', '/health');

      const latency = Date.now() - startTime;

      span.setStatus('ok');
      return {
        status: 'healthy',
        server: targetUrl,
        latencyMs: latency,
        timestamp: Date.now(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      return {
        status: 'unhealthy',
        server: targetUrl,
        latencyMs: latency,
        timestamp: Date.now(),
      };
    } finally {
      span.end();
    }
  }

  async getMetrics(serverUrl: string): Promise<VllmMetrics> {
    this.ensureNotClosed();

    const transport = this.getTransport(serverUrl);

    // vLLM returns Prometheus format, we need to parse it
    const response = await transport.request<string>('GET', '/metrics');

    // Parse Prometheus metrics
    return this.parsePrometheusMetrics(response);
  }

  private parsePrometheusMetrics(text: string): VllmMetrics {
    // Simple parser for key metrics
    const metrics: VllmMetrics = {
      num_requests_running: 0,
      num_requests_waiting: 0,
      gpu_cache_usage_perc: 0,
      cpu_cache_usage_perc: 0,
      avg_prompt_throughput_toks_per_s: 0,
      avg_generation_throughput_toks_per_s: 0,
    };

    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;

      const match = line.match(/^(\w+)(?:\{[^}]*\})?\s+([\d.]+)/);
      if (!match) continue;

      const [, name, value] = match;
      const numValue = parseFloat(value!);

      switch (name) {
        case 'vllm:num_requests_running':
          metrics.num_requests_running = numValue;
          break;
        case 'vllm:num_requests_waiting':
          metrics.num_requests_waiting = numValue;
          break;
        case 'vllm:gpu_cache_usage_perc':
          metrics.gpu_cache_usage_perc = numValue;
          break;
        case 'vllm:cpu_cache_usage_perc':
          metrics.cpu_cache_usage_perc = numValue;
          break;
        case 'vllm:avg_prompt_throughput_toks_per_s':
          metrics.avg_prompt_throughput_toks_per_s = numValue;
          break;
        case 'vllm:avg_generation_throughput_toks_per_s':
          metrics.avg_generation_throughput_toks_per_s = numValue;
          break;
      }
    }

    return metrics;
  }

  // ===== LIFECYCLE =====

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Stop discovery service
    this.discoveryService.stop();

    // Drain batch processor
    if (this.batchProcessor) {
      await this.batchProcessor.drain();
    }

    this.logger.info('VllmClient closed');
  }

  // ===== RECORDING =====

  startRecording(): void {
    this.recorder.startRecording();
    this.logger.info('Recording started');
  }

  stopRecording(): void {
    this.recorder.stopRecording();
    this.logger.info('Recording stopped');
  }

  isRecording(): boolean {
    return this.recorder.isRecording();
  }

  // ===== PRIVATE METHODS =====

  private ensureNotClosed(): void {
    if (this.closed) {
      throw new ConfigurationError('Client is closed');
    }
  }

  private selectServer(model: string): string {
    // Try to get from model registry first
    if (this.modelRegistry.hasModel(model)) {
      return this.modelRegistry.selectServer(model).url;
    }

    // Fall back to round-robin
    const servers = this.config.servers;
    if (servers.length === 0) {
      throw new InvalidModelError(model);
    }

    // Use default model if specified
    if (this.config.defaultModel && model !== this.config.defaultModel) {
      this.logger.warn(`Model ${model} not found, using default`, {
        model,
        defaultModel: this.config.defaultModel,
      });
    }

    return servers[0]!.url;
  }

  private getTransport(serverUrl: string): HttpTransport {
    const transport = this.transports.get(serverUrl);
    if (!transport) {
      throw new ConfigurationError(`No transport for server: ${serverUrl}`);
    }
    return transport;
  }
}

/**
 * Create a vLLM client
 */
export function createVllmClient(config: VllmConfig): VllmClient {
  return new VllmClientImpl(config);
}

/**
 * Create a vLLM client with a single server
 */
export function createVllmClientFromUrl(
  serverUrl: string,
  authToken?: string
): VllmClient {
  const server: ServerConfig = { url: serverUrl, authToken };
  const config = mergeConfig({}, [server]);
  return new VllmClientImpl(config);
}

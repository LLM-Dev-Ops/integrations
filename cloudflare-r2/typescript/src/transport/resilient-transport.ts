/**
 * Resilient HTTP transport wrapper for Cloudflare R2
 *
 * Wraps an HTTP transport with resilience patterns (retry + circuit breaker).
 */

import type {
  HttpRequest,
  HttpResponse,
  StreamingHttpResponse,
  HttpTransport,
} from './types.js';
import type { ResilienceOrchestrator } from '../resilience/index.js';
import {
  createResilienceOrchestrator,
  createDefaultResilienceOrchestrator,
} from '../resilience/index.js';
import type { R2RetryConfig, R2CircuitBreakerConfig } from '../config/index.js';

/**
 * Resilient transport that wraps an inner transport with resilience patterns
 *
 * Applies retry logic and circuit breaker to all HTTP operations.
 * Note: Streaming responses are NOT retried since the stream may have been
 * partially consumed. Only the initial request is subject to resilience.
 */
export class ResilientTransport implements HttpTransport {
  private readonly inner: HttpTransport;
  private readonly orchestrator: ResilienceOrchestrator;

  constructor(inner: HttpTransport, orchestrator: ResilienceOrchestrator) {
    this.inner = inner;
    this.orchestrator = orchestrator;
  }

  /**
   * Sends an HTTP request with resilience (retry + circuit breaker)
   *
   * The entire request/response cycle is wrapped in resilience logic.
   * Failed requests are retried according to the retry policy.
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    return this.orchestrator.execute(() => this.inner.send(request));
  }

  /**
   * Sends a streaming HTTP request with resilience
   *
   * Important: Only the initial connection attempt is retried.
   * Once a stream is returned, it cannot be retried if it fails mid-stream.
   * Consumers should handle stream errors separately.
   */
  async sendStreaming(request: HttpRequest): Promise<StreamingHttpResponse> {
    return this.orchestrator.execute(() => this.inner.sendStreaming(request));
  }

  /**
   * Closes the transport
   */
  async close(): Promise<void> {
    return this.inner.close();
  }

  /**
   * Gets the underlying resilience orchestrator
   */
  getOrchestrator(): ResilienceOrchestrator {
    return this.orchestrator;
  }

  /**
   * Gets the inner transport
   */
  getInnerTransport(): HttpTransport {
    return this.inner;
  }
}

/**
 * Creates a resilient transport with custom retry and circuit breaker configuration
 */
export function createResilientTransport(
  transport: HttpTransport,
  retryConfig: R2RetryConfig,
  circuitBreakerConfig: R2CircuitBreakerConfig
): HttpTransport {
  const orchestrator = createResilienceOrchestrator(retryConfig, circuitBreakerConfig);
  return new ResilientTransport(transport, orchestrator);
}

/**
 * Creates a resilient transport with default configuration
 */
export function createDefaultResilientTransport(transport: HttpTransport): HttpTransport {
  const orchestrator = createDefaultResilienceOrchestrator();
  return new ResilientTransport(transport, orchestrator);
}

/**
 * Creates a resilient transport with custom orchestrator
 */
export function createResilientTransportWithOrchestrator(
  transport: HttpTransport,
  orchestrator: ResilienceOrchestrator
): HttpTransport {
  return new ResilientTransport(transport, orchestrator);
}

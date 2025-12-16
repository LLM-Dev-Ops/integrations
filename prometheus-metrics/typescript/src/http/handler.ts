import { ResponseCache, CachedResponse } from './cache';
import { compressIfNeeded, acceptsGzip } from './compression';

/**
 * Metrics request interface.
 */
export interface MetricsRequest {
  accept?: string;
  acceptEncoding?: string;
  timeout?: number;
}

/**
 * Metrics response interface.
 */
export interface MetricsResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}

/**
 * Handler configuration.
 */
export interface HandlerConfig {
  cacheTtl?: number;
  compressionThreshold?: number;
  timeout?: number;
}

/**
 * Minimal MetricsRegistry interface for handler.
 */
interface MetricsRegistry {
  gather(): Promise<any[]>;
}

/**
 * Minimal serializer interface.
 */
interface Serializer {
  serialize(metrics: any[]): string;
}

/**
 * HTTP handler for the /metrics endpoint.
 */
export class MetricsHandler {
  private readonly registry: MetricsRegistry;
  private readonly prometheusSerializer: Serializer;
  private readonly openMetricsSerializer: Serializer;
  private readonly cache: ResponseCache | null;
  private readonly compressionThreshold: number;
  private readonly timeout: number;

  constructor(
    registry: MetricsRegistry,
    prometheusSerializer: Serializer,
    openMetricsSerializer: Serializer,
    config?: HandlerConfig
  ) {
    this.registry = registry;
    this.prometheusSerializer = prometheusSerializer;
    this.openMetricsSerializer = openMetricsSerializer;
    this.cache = config?.cacheTtl ? new ResponseCache(config.cacheTtl) : null;
    this.compressionThreshold = config?.compressionThreshold ?? 1024;
    this.timeout = config?.timeout ?? 10000;
  }

  /**
   * Handle a metrics scrape request.
   * Returns { status, headers, body } for framework-agnostic usage.
   */
  async handle(request: MetricsRequest): Promise<MetricsResponse> {
    try {
      // 1. Check cache
      const cached = this.cache?.get();
      if (cached) {
        return this.createResponseFromCache(cached, request);
      }

      // 2. Determine format from Accept header
      const format = this.determineFormat(request.accept);
      const serializer = format === 'openmetrics'
        ? this.openMetricsSerializer
        : this.prometheusSerializer;

      // 3. Gather metrics with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Metrics gather timeout')),
          request.timeout ?? this.timeout
        )
      );

      const metrics = await Promise.race([
        this.registry.gather(),
        timeoutPromise
      ]);

      // 4. Serialize
      const content = serializer.serialize(metrics);

      // 5. Compress if needed
      const shouldCompress = acceptsGzip(request.acceptEncoding);
      const compressed = shouldCompress
        ? compressIfNeeded(content, this.compressionThreshold)
        : { data: content, isCompressed: false };

      // 6. Update cache
      if (this.cache) {
        this.cache.set(
          content,
          compressed.isCompressed ? compressed.data as Buffer : undefined
        );
      }

      // 7. Return response
      return this.createResponse(
        content,
        compressed.data,
        compressed.isCompressed,
        format
      );
    } catch (error) {
      return {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: `Error gathering metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create response from cached data.
   */
  private createResponseFromCache(
    cached: CachedResponse,
    request: MetricsRequest
  ): MetricsResponse {
    const shouldCompress = acceptsGzip(request.acceptEncoding);
    const useCompressed = shouldCompress && cached.compressed;

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'ETag': cached.etag
    };

    if (useCompressed && cached.compressed) {
      headers['Content-Encoding'] = 'gzip';
      return {
        status: 200,
        headers,
        body: cached.compressed
      };
    }

    return {
      status: 200,
      headers,
      body: cached.content
    };
  }

  /**
   * Create response from fresh metrics.
   */
  private createResponse(
    content: string,
    data: Buffer | string,
    isCompressed: boolean,
    format: 'prometheus' | 'openmetrics'
  ): MetricsResponse {
    const contentType = format === 'openmetrics'
      ? 'application/openmetrics-text; version=1.0.0; charset=utf-8'
      : 'text/plain; version=0.0.4; charset=utf-8';

    const headers: Record<string, string> = {
      'Content-Type': contentType
    };

    if (isCompressed) {
      headers['Content-Encoding'] = 'gzip';
    }

    return {
      status: 200,
      headers,
      body: data
    };
  }

  /**
   * Determine output format from Accept header.
   */
  private determineFormat(accept?: string): 'prometheus' | 'openmetrics' {
    if (!accept) return 'prometheus';

    // Check for OpenMetrics format
    if (accept.includes('application/openmetrics-text')) {
      return 'openmetrics';
    }

    return 'prometheus';
  }
}

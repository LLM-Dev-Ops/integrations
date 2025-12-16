/**
 * Batch operations service for Weaviate
 *
 * Provides high-level batch create, update, and delete operations with:
 * - Automatic chunking for large batches
 * - Parallel execution with concurrency control
 * - Retry logic for transient failures
 * - Progress tracking and metrics
 * - Observability (tracing, logging, metrics)
 */

import type { HttpTransport } from '../transport/types.js';
import type { ObservabilityContext } from '../observability/types.js';
import type { ResilienceOrchestrator } from '../resilience/orchestrator.js';
import type {
  BatchObject,
  BatchResponse,
  BatchDeleteRequest,
  BatchDeleteResponse,
  ConsistencyLevel,
} from '../types/batch.js';
import type { WhereFilter } from '../types/filter.js';
import type {
  BatchOptions,
  BatchRetryOptions,
  BatchDeleteOptions,
  BatchResult,
  BatchUpdateObject,
} from './types.js';
import { createChunks, chunkArray } from './chunker.js';
import { BatchProgressTracker } from './progress.js';
import {
  isRetriableBatchError,
  extractFailedObjects,
  aggregateBatchResponses,
  calculateRetryDelay,
} from './retry.js';
import { SpanNames, MetricNames } from '../observability/types.js';

/**
 * Configuration for batch service
 */
export interface BatchServiceConfig {
  /**
   * Default batch size
   * Default: 100
   */
  defaultBatchSize?: number;

  /**
   * Default max parallelism
   * Default: 4
   */
  defaultMaxParallelism?: number;

  /**
   * Whether to prefer gRPC for batch operations
   * Default: true (if gRPC client available)
   */
  preferGrpc?: boolean;
}

/**
 * Batch operations service
 */
export class BatchService {
  private readonly transport: HttpTransport;
  private readonly observability: ObservabilityContext;
  private readonly resilience: ResilienceOrchestrator;
  private readonly config: Required<BatchServiceConfig>;

  constructor(
    transport: HttpTransport,
    observability: ObservabilityContext,
    resilience: ResilienceOrchestrator,
    config?: BatchServiceConfig
  ) {
    this.transport = transport;
    this.observability = observability;
    this.resilience = resilience;
    this.config = {
      defaultBatchSize: config?.defaultBatchSize ?? 100,
      defaultMaxParallelism: config?.defaultMaxParallelism ?? 4,
      preferGrpc: config?.preferGrpc ?? true,
    };
  }

  /**
   * Batch create objects with automatic chunking and parallel execution
   *
   * @param objects - Array of objects to create
   * @param options - Batch options
   * @returns Batch response with success/failure counts
   *
   * @example
   * ```typescript
   * const response = await batchService.batchCreate(objects, {
   *   batchSize: 100,
   *   maxParallelism: 4,
   *   continueOnError: true,
   *   onProgress: (progress) => {
   *     console.log(`${progress.completed}/${progress.total}`);
   *   }
   * });
   * ```
   */
  async batchCreate(
    objects: BatchObject[],
    options?: BatchOptions
  ): Promise<BatchResponse> {
    const span = this.observability.tracer.startSpan(SpanNames.BATCH_CREATE, {
      'batch.size': objects.length,
    });

    const startTime = Date.now();

    try {
      // Resolve options with defaults
      const batchSize = options?.batchSize ?? this.config.defaultBatchSize;
      const maxParallelism =
        options?.maxParallelism ?? this.config.defaultMaxParallelism;
      const continueOnError = options?.continueOnError ?? false;

      // Create chunks
      const chunks = createChunks(objects, batchSize);

      this.observability.logger.info('Starting batch create operation', {
        totalObjects: objects.length,
        chunks: chunks.length,
        batchSize,
        maxParallelism,
      });

      span.setAttribute('batch.chunks', chunks.length);

      // Initialize progress tracking
      const tracker = options?.onProgress
        ? new BatchProgressTracker(objects.length, chunks.length)
        : null;

      if (tracker && options?.onProgress) {
        tracker.onProgress(options.onProgress);
        tracker.start();
      }

      // Process chunks with concurrency control
      const responses: BatchResponse[] = [];
      const errors: Array<{ index: number; error: Error }> = [];

      // Use semaphore for concurrency control
      let activeRequests = 0;
      const queue: Array<() => Promise<void>> = [];

      const processChunk = async (
        chunk: typeof chunks[0],
        chunkIndex: number
      ): Promise<void> => {
        try {
          // Update progress: mark chunk as in progress
          if (tracker) {
            tracker.setInProgress(
              tracker.getProgress().inProgress + chunk.objects.length
            );
          }

          // Execute batch create for this chunk
          const response = await this.executeBatchCreate(
            chunk.objects,
            options?.consistencyLevel,
            options?.tenant
          );

          responses[chunkIndex] = response;

          // Update progress: mark chunk as complete
          if (tracker) {
            tracker.updateProgress(
              chunk.objects.length,
              response.successful,
              response.failed
            );
          }

          // Record metrics
          this.observability.metrics.increment(
            MetricNames.BATCH_OBJECTS,
            response.successful,
            {
              status: 'success',
            }
          );
        } catch (error) {
          errors.push({
            index: chunkIndex,
            error: error instanceof Error ? error : new Error(String(error)),
          });

          // Update progress: mark chunk as failed
          if (tracker) {
            tracker.updateProgress(chunk.objects.length, 0, chunk.objects.length);
          }

          // Record error metrics
          this.observability.metrics.increment(
            MetricNames.BATCH_ERRORS,
            chunk.objects.length
          );

          if (!continueOnError) {
            throw error;
          }
        }
      };

      const executeNext = async (): Promise<void> => {
        const task = queue.shift();
        if (task) {
          activeRequests++;
          try {
            await task();
          } finally {
            activeRequests--;
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            if (queue.length > 0) {
              executeNext();
            }
          }
        }
      };

      // Queue all chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        queue.push(() => processChunk(chunk, i));
      }

      // Start initial batch of requests
      const initialBatch = Math.min(maxParallelism, queue.length);
      const promises: Promise<void>[] = [];
      for (let i = 0; i < initialBatch; i++) {
        promises.push(executeNext());
      }

      // Wait for all to complete
      await Promise.all(promises);

      // Wait for any remaining active requests
      while (activeRequests > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Complete progress tracking
      if (tracker) {
        tracker.complete();
      }

      // Aggregate responses
      const aggregatedResponse = aggregateBatchResponses(responses);
      aggregatedResponse.elapsedMs = Date.now() - startTime;

      // Log completion summary
      this.observability.logger.info('Batch create completed', {
        total: objects.length,
        successful: aggregatedResponse.successful,
        failed: aggregatedResponse.failed,
        chunks: chunks.length,
        elapsedMs: aggregatedResponse.elapsedMs,
      });

      span.setAttribute('batch.successful', aggregatedResponse.successful);
      span.setAttribute('batch.failed', aggregatedResponse.failed);
      span.end('ok');

      return aggregatedResponse;
    } catch (error) {
      span.recordError(error instanceof Error ? error : new Error(String(error)));
      span.end('error');

      this.observability.logger.error('Batch create failed', {
        error: error instanceof Error ? error.message : String(error),
        objectCount: objects.length,
      });

      throw error;
    }
  }

  /**
   * Batch create with automatic retry for failed objects
   *
   * @param objects - Array of objects to create
   * @param options - Batch retry options
   * @returns Detailed batch result with retry attempts
   *
   * @example
   * ```typescript
   * const result = await batchService.batchCreateWithRetry(objects, {
   *   maxRetries: 3,
   *   batchSize: 100,
   *   initialDelayMs: 1000,
   *   backoffMultiplier: 2
   * });
   * ```
   */
  async batchCreateWithRetry(
    objects: BatchObject[],
    options?: BatchRetryOptions
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const maxRetries = options?.maxRetries ?? 3;
    const initialDelayMs = options?.initialDelayMs ?? 1000;
    const maxDelayMs = options?.maxDelayMs ?? 30000;
    const backoffMultiplier = options?.backoffMultiplier ?? 2;
    const jitter = options?.jitter ?? true;

    let attempt = 0;
    let remainingObjects = [...objects];
    let totalSuccessful = 0;
    let totalFailed = 0;
    const allErrors: Array<{
      object: BatchObject;
      error: string;
      attempts: number;
    }> = [];

    this.observability.logger.info('Starting batch create with retry', {
      totalObjects: objects.length,
      maxRetries,
    });

    while (attempt <= maxRetries && remainingObjects.length > 0) {
      attempt++;

      this.observability.logger.debug(`Batch attempt ${attempt}/${maxRetries + 1}`, {
        remaining: remainingObjects.length,
      });

      // Attempt batch create
      const response = await this.batchCreate(remainingObjects, {
        ...options,
        continueOnError: true,
      });

      totalSuccessful += response.successful;

      // If all succeeded, we're done
      if (response.failed === 0 || !response.errors) {
        break;
      }

      // Extract failed objects for retry
      const failedObjects = extractFailedObjects(response, remainingObjects);

      // Separate retriable from non-retriable failures
      const retriable: BatchObject[] = [];
      const nonRetriable: typeof failedObjects = [];

      for (const { object, error } of failedObjects) {
        const tempError = new Error(error.errorMessage);
        if (isRetriableBatchError(tempError)) {
          retriable.push(object);
        } else {
          nonRetriable.push({ object, error });
        }
      }

      // Record non-retriable errors
      for (const { object, error } of nonRetriable) {
        allErrors.push({
          object,
          error: error.errorMessage,
          attempts: attempt,
        });
      }

      totalFailed += nonRetriable.length;

      // If no retriable failures or max retries reached, stop
      if (retriable.length === 0 || attempt > maxRetries) {
        totalFailed += retriable.length;
        for (const object of retriable) {
          const error = failedObjects.find((f) => f.object === object)?.error;
          allErrors.push({
            object,
            error: error?.errorMessage ?? 'Unknown error',
            attempts: attempt,
          });
        }
        break;
      }

      // Calculate delay for next retry
      const delay = calculateRetryDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier,
        jitter
      );

      this.observability.logger.info(`Retrying ${retriable.length} failed objects`, {
        attempt,
        delayMs: delay,
      });

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry with failed objects
      remainingObjects = retriable;
    }

    const elapsedMs = Date.now() - startTime;

    this.observability.logger.info('Batch create with retry completed', {
      total: objects.length,
      successful: totalSuccessful,
      failed: totalFailed,
      attempts: attempt,
      elapsedMs,
    });

    return {
      total: objects.length,
      successful: totalSuccessful,
      failed: totalFailed,
      attempts: attempt,
      errors: allErrors.map((e) => ({
        index: objects.indexOf(e.object),
        errorMessage: e.error,
        object: e.object,
      })),
      elapsedMs,
    };
  }

  /**
   * Batch delete objects matching a filter
   *
   * @param className - Class name
   * @param filter - Filter to match objects for deletion
   * @param options - Delete options
   * @returns Delete response with counts
   *
   * @example
   * ```typescript
   * const response = await batchService.batchDelete(
   *   'Article',
   *   { operator: 'Operand', operand: { path: ['status'], operator: 'Equal', value: 'archived' } },
   *   { dryRun: false }
   * );
   * ```
   */
  async batchDelete(
    className: string,
    filter: WhereFilter,
    options?: BatchDeleteOptions
  ): Promise<BatchDeleteResponse> {
    const span = this.observability.tracer.startSpan('weaviate.batch_delete', {
      class_name: className,
      dry_run: options?.dryRun ?? false,
    });

    const startTime = Date.now();

    try {
      // Build request body
      const request: BatchDeleteRequest = {
        className,
        filter,
        dryRun: options?.dryRun ?? false,
        tenant: options?.tenant,
        consistencyLevel: options?.consistencyLevel as ConsistencyLevel,
        output: options?.output ?? 'minimal',
      };

      // Serialize filter
      const body = {
        match: {
          class: className,
          where: this.serializeFilter(filter),
        },
        dryRun: request.dryRun,
        output: request.output,
      };

      if (request.tenant) {
        (body.match as Record<string, unknown>).tenant = request.tenant;
      }

      this.observability.logger.info('Executing batch delete', {
        className,
        dryRun: request.dryRun,
        tenant: request.tenant,
      });

      // Execute with resilience
      const httpResponse = await this.resilience.execute(() =>
        this.transport.delete('/v1/batch/objects', body)
      );

      if (httpResponse.status !== 200) {
        throw new Error(`Batch delete failed with status ${httpResponse.status}`);
      }

      // Parse response
      const responseBody = httpResponse.body as {
        match?: { class: string };
        results?: {
          matches?: number;
          successful?: number;
          failed?: number;
          objects?: Array<{ id: string; status?: string; error?: string }>;
        };
      };

      const matched = responseBody.results?.matches ?? 0;
      const successful = responseBody.results?.successful ?? 0;
      const failed = responseBody.results?.failed ?? 0;

      const response: BatchDeleteResponse = {
        matched,
        deleted: request.dryRun ? 0 : successful,
        dryRun: request.dryRun,
        successful: failed === 0,
        elapsedMs: Date.now() - startTime,
      };

      // Parse verbose results if available
      if (request.output === 'verbose' && responseBody.results?.objects) {
        response.results = {
          successful: responseBody.results.objects
            .filter((o) => o.status === 'SUCCESS')
            .map((o) => o.id),
          failed: responseBody.results.objects
            .filter((o) => o.status === 'FAILED')
            .map((o) => ({
              id: o.id,
              error: o.error ?? 'Unknown error',
            })),
        };
      }

      this.observability.logger.info('Batch delete completed', {
        className,
        matched,
        deleted: response.deleted,
        dryRun: request.dryRun,
        elapsedMs: response.elapsedMs,
      });

      span.setAttribute('batch.matched', matched);
      span.setAttribute('batch.deleted', response.deleted);
      span.end('ok');

      return response;
    } catch (error) {
      span.recordError(error instanceof Error ? error : new Error(String(error)));
      span.end('error');

      this.observability.logger.error('Batch delete failed', {
        className,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Batch update objects
   *
   * Note: Weaviate doesn't have a native batch update endpoint,
   * so this is implemented as a batch of individual updates.
   *
   * @param objects - Array of update objects
   * @param options - Batch options
   * @returns Batch response
   */
  async batchUpdate(
    objects: BatchUpdateObject[],
    options?: BatchOptions
  ): Promise<BatchResponse> {
    const span = this.observability.tracer.startSpan('weaviate.batch_update', {
      'batch.size': objects.length,
    });

    const startTime = Date.now();

    try {
      const batchSize = options?.batchSize ?? this.config.defaultBatchSize;
      const chunks = chunkArray(objects, batchSize);

      this.observability.logger.info('Starting batch update operation', {
        totalObjects: objects.length,
        chunks: chunks.length,
      });

      let totalSuccessful = 0;
      let totalFailed = 0;
      const errors: Array<{
        index: number;
        objectId: string;
        errorMessage: string;
      }> = [];

      // Process chunks sequentially (updates are typically not parallelized)
      for (const chunk of chunks) {
        for (const obj of chunk) {
          try {
            const method = obj.merge ? 'PATCH' : 'PUT';
            const path = `/v1/objects/${obj.className}/${obj.id}`;

            const body: Record<string, unknown> = {
              class: obj.className,
              id: obj.id,
            };

            if (obj.properties) {
              body.properties = obj.properties;
            }

            if (obj.vector) {
              body.vector = obj.vector;
            }

            const params: Record<string, string> = {};
            if (obj.tenant) {
              params.tenant = obj.tenant;
            }

            await this.resilience.execute(() =>
              this.transport.request({
                method: method as 'PUT' | 'PATCH',
                path,
                query: params,
                body,
              })
            );

            totalSuccessful++;
          } catch (error) {
            totalFailed++;
            errors.push({
              index: objects.indexOf(obj),
              objectId: obj.id,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            });

            if (!options?.continueOnError) {
              throw error;
            }
          }
        }
      }

      const response: BatchResponse = {
        successful: totalSuccessful,
        failed: totalFailed,
        errors: errors.length > 0 ? errors : undefined,
        elapsedMs: Date.now() - startTime,
      };

      this.observability.logger.info('Batch update completed', {
        total: objects.length,
        successful: totalSuccessful,
        failed: totalFailed,
        elapsedMs: response.elapsedMs,
      });

      span.end('ok');
      return response;
    } catch (error) {
      span.recordError(error instanceof Error ? error : new Error(String(error)));
      span.end('error');
      throw error;
    }
  }

  /**
   * Execute a batch create request via REST API
   */
  private async executeBatchCreate(
    objects: BatchObject[],
    consistencyLevel?: string,
    tenant?: string
  ): Promise<BatchResponse> {
    // Build request body
    const body = {
      objects: objects.map((obj) => ({
        class: obj.className,
        id: obj.id,
        properties: obj.properties,
        vector: obj.vector,
        vectors: obj.vectors,
        tenant: obj.tenant ?? tenant,
      })),
    };

    const params: Record<string, string> = {};
    if (consistencyLevel) {
      params.consistency_level = consistencyLevel;
    }

    // Execute with resilience
    const response = await this.resilience.execute(() =>
      this.transport.post('/v1/batch/objects', body, params)
    );

    if (response.status !== 200) {
      throw new Error(`Batch create failed with status ${response.status}`);
    }

    // Parse response
    return this.parseBatchResponse(response.body, objects.length);
  }

  /**
   * Parse batch response from Weaviate
   */
  private parseBatchResponse(
    body: unknown,
    totalObjects: number
  ): BatchResponse {
    const responseArray = Array.isArray(body) ? body : [];

    let successful = 0;
    let failed = 0;
    const errors: Array<{
      index: number;
      objectId?: string;
      errorMessage: string;
    }> = [];

    for (let i = 0; i < responseArray.length; i++) {
      const result = responseArray[i] as {
        result?: { status?: string; errors?: { error?: { message?: string }[] } };
        id?: string;
      };

      const status = result.result?.status;
      const resultErrors = result.result?.errors;

      if (status === 'SUCCESS' || (!resultErrors && !status)) {
        successful++;
      } else {
        failed++;
        const errorMessage =
          resultErrors?.[0]?.error?.message ?? 'Unknown error';
        errors.push({
          index: i,
          objectId: result.id,
          errorMessage,
        });
      }
    }

    return {
      successful,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Serialize filter for API request
   */
  private serializeFilter(filter: WhereFilter): unknown {
    // This is a simplified serialization
    // In practice, you'd use the filter builder from graphql module
    return filter;
  }
}

/**
 * Batch Processor for vLLM
 * Client-side request batching for high-throughput scenarios
 */

import type { BatchConfig, ChatRequest, ChatResponse } from '../types/index.js';
import { QueueFullError, ConcurrencyExceededError } from '../types/errors.js';

interface BatchRequest {
  request: ChatRequest;
  resolve: (response: ChatResponse) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export interface BatchExecutor {
  execute(requests: ChatRequest[]): Promise<ChatResponse[]>;
}

/**
 * Batch processor that accumulates requests and executes them in batches
 */
export class BatchProcessor {
  private readonly config: BatchConfig;
  private readonly executor: BatchExecutor;
  private readonly queue: BatchRequest[] = [];
  private inflightBatches = 0;
  private flushTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(config: BatchConfig, executor: BatchExecutor) {
    this.config = config;
    this.executor = executor;
  }

  /**
   * Start the batch processor
   */
  start(): void {
    this.running = true;
  }

  /**
   * Stop the batch processor
   */
  stop(): void {
    this.running = false;
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = undefined;
    }
  }

  /**
   * Submit a request to the batch queue
   */
  async submit(request: ChatRequest): Promise<ChatResponse> {
    if (!this.running) {
      throw new Error('BatchProcessor is not running');
    }

    // Check queue depth
    if (this.queue.length >= this.config.maxQueueDepth) {
      throw new QueueFullError(this.queue.length, this.config.maxQueueDepth);
    }

    return new Promise<ChatResponse>((resolve, reject) => {
      const batchRequest: BatchRequest = {
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.queue.push(batchRequest);

      // Schedule flush if needed
      this.scheduleFlush();

      // Check if we should flush immediately
      if (this.shouldFlushImmediately()) {
        this.flush();
      }
    });
  }

  /**
   * Get current queue depth
   */
  queueDepth(): number {
    return this.queue.length;
  }

  /**
   * Get number of in-flight batches
   */
  inflightCount(): number {
    return this.inflightBatches;
  }

  /**
   * Force flush pending requests
   */
  async flush(): Promise<void> {
    // Clear scheduled flush
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = undefined;
    }

    // Check concurrency limit
    if (this.inflightBatches >= this.config.maxConcurrentBatches) {
      // Will be retried when a batch completes
      return;
    }

    // Get batch from queue
    const batch = this.queue.splice(0, this.config.maxBatchSize);
    if (batch.length === 0) {
      return;
    }

    this.inflightBatches++;

    try {
      // Execute batch
      const requests = batch.map((b) => b.request);
      const responses = await this.executor.execute(requests);

      // Resolve promises
      for (let i = 0; i < batch.length; i++) {
        const batchReq = batch[i]!;
        const response = responses[i];
        if (response) {
          batchReq.resolve(response);
        } else {
          batchReq.reject(new Error('No response for request'));
        }
      }
    } catch (error) {
      // Reject all promises in batch
      const err = error instanceof Error ? error : new Error(String(error));
      for (const batchReq of batch) {
        batchReq.reject(err);
      }
    } finally {
      this.inflightBatches--;

      // Check if more requests are waiting
      if (this.queue.length > 0) {
        this.flush();
      }
    }
  }

  /**
   * Drain all pending requests (for shutdown)
   */
  async drain(): Promise<void> {
    this.running = false;

    // Flush all remaining requests
    while (this.queue.length > 0 || this.inflightBatches > 0) {
      if (this.queue.length > 0 && this.inflightBatches < this.config.maxConcurrentBatches) {
        await this.flush();
      } else {
        // Wait a bit for in-flight batches to complete
        await this.sleep(10);
      }
    }
  }

  private shouldFlushImmediately(): boolean {
    return this.queue.length >= this.config.maxBatchSize;
  }

  private scheduleFlush(): void {
    if (this.flushTimeoutId) {
      return; // Already scheduled
    }

    this.flushTimeoutId = setTimeout(() => {
      this.flushTimeoutId = undefined;
      this.flush();
    }, this.config.batchTimeoutMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Simple executor that sends concurrent requests
 */
export class ConcurrentExecutor implements BatchExecutor {
  constructor(
    private readonly executeOne: (request: ChatRequest) => Promise<ChatResponse>
  ) {}

  async execute(requests: ChatRequest[]): Promise<ChatResponse[]> {
    return Promise.all(requests.map((r) => this.executeOne(r)));
  }
}

/**
 * Priority queue for batch processing
 */
export interface PriorityRequest {
  priority: number;
  request: ChatRequest;
}

export class PriorityBatchProcessor {
  private readonly normalProcessor: BatchProcessor;
  private readonly highPriorityExecutor: BatchExecutor;
  private readonly priorityThreshold: number;

  constructor(
    config: BatchConfig,
    executor: BatchExecutor,
    priorityThreshold: number = 5
  ) {
    this.normalProcessor = new BatchProcessor(config, executor);
    this.highPriorityExecutor = executor;
    this.priorityThreshold = priorityThreshold;
  }

  start(): void {
    this.normalProcessor.start();
  }

  stop(): void {
    this.normalProcessor.stop();
  }

  async submit(request: PriorityRequest): Promise<ChatResponse> {
    if (request.priority >= this.priorityThreshold) {
      // High priority - execute immediately, bypass batch queue
      const responses = await this.highPriorityExecutor.execute([request.request]);
      return responses[0]!;
    }

    // Normal priority - use batch processor
    return this.normalProcessor.submit(request.request);
  }

  queueDepth(): number {
    return this.normalProcessor.queueDepth();
  }
}

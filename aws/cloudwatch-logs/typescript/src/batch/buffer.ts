/**
 * AWS CloudWatch Logs Batch Buffer
 *
 * This module provides efficient batching of log events before sending to CloudWatch Logs.
 */

import { InputLogEvent } from '../types/logEvent';
import { StructuredLogEvent } from '../types/structured';
import { BatchConfig, DEFAULT_BATCH_CONFIG } from './config';
import { SequenceTokenManager } from './sequencing';

/**
 * Batch buffer metrics.
 */
export interface BatchMetrics {
  /** Number of events currently buffered */
  eventsBuffered: number;
  /** Number of bytes currently buffered */
  bytesBuffered: number;
  /** Number of flushes pending */
  flushesPending: number;
  /** Number of flushes completed successfully */
  flushesCompleted: number;
  /** Number of flushes that failed */
  flushesFailed: number;
}

/**
 * Batch buffer interface for log events.
 */
export interface BatchBuffer {
  /**
   * Adds a log event to the buffer.
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @param event - Log event to add
   */
  add(logGroup: string, logStream: string, event: InputLogEvent): Promise<void>;

  /**
   * Adds a structured log event to the buffer.
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @param event - Structured log event to add
   */
  addStructured(logGroup: string, logStream: string, event: StructuredLogEvent): Promise<void>;

  /**
   * Flushes buffered events for a specific log group/stream.
   * @param logGroup - Log group name (optional, flushes all if not provided)
   * @param logStream - Log stream name (optional, flushes all streams if not provided)
   */
  flush(logGroup?: string, logStream?: string): Promise<void>;

  /**
   * Flushes all buffered events.
   */
  flushAll(): Promise<void>;

  /**
   * Starts the background flush timer.
   */
  start(): void;

  /**
   * Stops the background flush timer and flushes all remaining events.
   */
  stop(): Promise<void>;

  /**
   * Gets current buffer metrics.
   * @returns Current metrics
   */
  getMetrics(): BatchMetrics;
}

/**
 * Stream buffer holding events for a specific log stream.
 */
interface StreamBuffer {
  events: InputLogEvent[];
  bytes: number;
}

/**
 * Flush function type for sending events to CloudWatch Logs.
 */
export type FlushFunction = (
  logGroup: string,
  logStream: string,
  events: InputLogEvent[],
  sequenceToken?: string
) => Promise<{ nextSequenceToken?: string }>;

/**
 * AWS event size overhead per event (26 bytes).
 * This is the fixed overhead added by CloudWatch Logs per event.
 */
const EVENT_OVERHEAD_BYTES = 26;

/**
 * Implementation of BatchBuffer for efficient log batching.
 */
export class BatchBufferImpl implements BatchBuffer {
  private config: BatchConfig;
  private buffer: Map<string, Map<string, StreamBuffer>>;
  private sequenceTokenManager: SequenceTokenManager;
  private flushFunction: FlushFunction;
  private flushTimer?: NodeJS.Timeout;
  private isStarted: boolean;
  private metrics: BatchMetrics;
  private flushLock: Map<string, Promise<void>>;

  /**
   * Creates a new batch buffer.
   * @param flushFunction - Function to call when flushing events
   * @param config - Batch configuration (optional, uses defaults if not provided)
   */
  constructor(flushFunction: FlushFunction, config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
    this.buffer = new Map();
    this.sequenceTokenManager = new SequenceTokenManager();
    this.flushFunction = flushFunction;
    this.isStarted = false;
    this.metrics = {
      eventsBuffered: 0,
      bytesBuffered: 0,
      flushesPending: 0,
      flushesCompleted: 0,
      flushesFailed: 0,
    };
    this.flushLock = new Map();
  }

  /**
   * Adds a log event to the buffer.
   */
  async add(logGroup: string, logStream: string, event: InputLogEvent): Promise<void> {
    const eventSize = this.calculateEventSize(event);

    // Get or create stream buffer
    let groupBuffers = this.buffer.get(logGroup);
    if (!groupBuffers) {
      groupBuffers = new Map();
      this.buffer.set(logGroup, groupBuffers);
    }

    let streamBuffer = groupBuffers.get(logStream);
    if (!streamBuffer) {
      streamBuffer = { events: [], bytes: 0 };
      groupBuffers.set(logStream, streamBuffer);
    }

    // Check if adding this event would exceed limits
    const wouldExceedEvents = streamBuffer.events.length + 1 > this.config.maxEvents;
    const wouldExceedBytes = streamBuffer.bytes + eventSize > this.config.maxBytes;

    if (wouldExceedEvents || wouldExceedBytes) {
      // Flush current buffer before adding new event
      await this.flush(logGroup, logStream);

      // Re-fetch stream buffer after flush (it may have been cleared)
      groupBuffers = this.buffer.get(logGroup);
      if (!groupBuffers) {
        groupBuffers = new Map();
        this.buffer.set(logGroup, groupBuffers);
      }
      streamBuffer = groupBuffers.get(logStream);
      if (!streamBuffer) {
        streamBuffer = { events: [], bytes: 0 };
        groupBuffers.set(logStream, streamBuffer);
      }
    }

    // Add event to buffer
    streamBuffer.events.push(event);
    streamBuffer.bytes += eventSize;

    // Update metrics
    this.metrics.eventsBuffered++;
    this.metrics.bytesBuffered += eventSize;
  }

  /**
   * Adds a structured log event to the buffer.
   */
  async addStructured(
    logGroup: string,
    logStream: string,
    event: StructuredLogEvent
  ): Promise<void> {
    // Convert structured event to InputLogEvent
    const inputEvent: InputLogEvent = {
      timestamp: event.timestamp ?? Date.now(),
      message: JSON.stringify(event),
    };

    await this.add(logGroup, logStream, inputEvent);
  }

  /**
   * Flushes buffered events for a specific log group/stream.
   */
  async flush(logGroup?: string, logStream?: string): Promise<void> {
    if (!logGroup) {
      // Flush all groups
      await this.flushAll();
      return;
    }

    const groupBuffers = this.buffer.get(logGroup);
    if (!groupBuffers) {
      return; // No events for this log group
    }

    if (!logStream) {
      // Flush all streams in this group
      const flushPromises: Promise<void>[] = [];
      const streams = Array.from(groupBuffers.keys());
      for (const stream of streams) {
        flushPromises.push(this.flushStream(logGroup, stream));
      }
      await Promise.all(flushPromises);
    } else {
      // Flush specific stream
      await this.flushStream(logGroup, logStream);
    }
  }

  /**
   * Flushes all buffered events.
   */
  async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    const groups = Array.from(this.buffer.entries());
    for (const [logGroup, groupBuffers] of groups) {
      const streams = Array.from(groupBuffers.keys());
      for (const logStream of streams) {
        flushPromises.push(this.flushStream(logGroup, logStream));
      }
    }

    await Promise.all(flushPromises);
  }

  /**
   * Starts the background flush timer.
   */
  start(): void {
    if (this.isStarted) {
      return; // Already started
    }

    this.isStarted = true;
    this.flushTimer = setInterval(() => {
      this.flushAll().catch((error) => {
        // Log error but don't throw (background task)
        console.error('Background flush failed:', error);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Stops the background flush timer and flushes all remaining events.
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    this.isStarted = false;

    // Final flush of all remaining events
    await this.flushAll();
  }

  /**
   * Gets current buffer metrics.
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Flushes a specific stream's buffer.
   */
  private async flushStream(logGroup: string, logStream: string): Promise<void> {
    const lockKey = `${logGroup}/${logStream}`;

    // Check if a flush is already in progress for this stream
    const existingFlush = this.flushLock.get(lockKey);
    if (existingFlush) {
      return existingFlush;
    }

    // Create new flush promise
    const flushPromise = this.performFlush(logGroup, logStream);
    this.flushLock.set(lockKey, flushPromise);

    try {
      await flushPromise;
    } finally {
      this.flushLock.delete(lockKey);
    }
  }

  /**
   * Performs the actual flush operation.
   */
  private async performFlush(logGroup: string, logStream: string): Promise<void> {
    const groupBuffers = this.buffer.get(logGroup);
    if (!groupBuffers) {
      return;
    }

    const streamBuffer = groupBuffers.get(logStream);
    if (!streamBuffer || streamBuffer.events.length === 0) {
      return;
    }

    // Extract events and clear buffer immediately
    const events = [...streamBuffer.events];
    const bytes = streamBuffer.bytes;
    streamBuffer.events = [];
    streamBuffer.bytes = 0;

    // Update metrics
    this.metrics.eventsBuffered -= events.length;
    this.metrics.bytesBuffered -= bytes;
    this.metrics.flushesPending++;

    // Sort events by timestamp (required by CloudWatch Logs)
    events.sort((a, b) => a.timestamp - b.timestamp);

    // Get sequence token
    const sequenceToken = this.sequenceTokenManager.getToken(logGroup, logStream);

    // Attempt flush with retries
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.flushFunction(logGroup, logStream, events, sequenceToken);

        // Update sequence token if provided
        if (result.nextSequenceToken) {
          this.sequenceTokenManager.setToken(logGroup, logStream, result.nextSequenceToken);
        }

        // Success
        this.metrics.flushesPending--;
        this.metrics.flushesCompleted++;
        return;
      } catch (error) {
        lastError = error as Error;

        // Check if this is an InvalidSequenceToken error
        if (this.isInvalidSequenceTokenError(error)) {
          // Invalidate token and retry
          this.sequenceTokenManager.invalidateToken(logGroup, logStream);
        } else if (!this.isRetryableError(error)) {
          // Non-retryable error, fail immediately
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries failed
    this.metrics.flushesPending--;
    this.metrics.flushesFailed++;

    // Re-add events to buffer if flush failed
    streamBuffer.events.push(...events);
    streamBuffer.bytes += bytes;
    this.metrics.eventsBuffered += events.length;
    this.metrics.bytesBuffered += bytes;

    throw lastError || new Error('Flush failed after retries');
  }

  /**
   * Calculates the size of an event in bytes.
   * Formula: message.length (UTF-8 bytes) + 26 bytes overhead
   */
  private calculateEventSize(event: InputLogEvent): number {
    // Get UTF-8 byte length of message
    const messageBytes = new TextEncoder().encode(event.message).length;
    return messageBytes + EVENT_OVERHEAD_BYTES;
  }

  /**
   * Checks if an error is an InvalidSequenceToken error.
   */
  private isInvalidSequenceTokenError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'name' in error) {
      return (
        error.name === 'InvalidSequenceTokenException' ||
        (error as Error).message?.includes('InvalidSequenceToken')
      );
    }
    return false;
  }

  /**
   * Checks if an error is retryable.
   */
  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'name' in error) {
      const retryableErrors = [
        'ThrottlingException',
        'ServiceUnavailableException',
        'InternalServerError',
        'RequestTimeoutException',
      ];
      return retryableErrors.includes((error as { name: string }).name);
    }
    return false;
  }
}

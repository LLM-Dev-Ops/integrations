/**
 * Log Buffer for Batched Writes
 *
 * Implements buffered write queue following the SPARC specification.
 */

import type { BufferConfig } from "../config/index.js";
import type { LogEntry } from "../types/index.js";

/**
 * Log buffer for batched writes.
 */
export class LogBuffer {
  private entries: LogEntry[] = [];
  private config: BufferConfig;
  private byteSize: number = 0;
  private lastFlush: number = Date.now();

  constructor(config: BufferConfig) {
    this.config = config;
  }

  /**
   * Try to add an entry to the buffer.
   * Returns false if buffer is full.
   */
  tryAdd(entry: LogEntry): boolean {
    const entrySize = this.estimateSize(entry);

    // Check byte limit
    if (this.byteSize + entrySize > this.config.maxBytes) {
      return false;
    }

    // Check entry count
    if (this.entries.length >= this.config.maxEntries) {
      return false;
    }

    this.entries.push(entry);
    this.byteSize += entrySize;
    return true;
  }

  /**
   * Force add an entry to the buffer.
   * Used after flush when buffer is known to have space.
   */
  add(entry: LogEntry): void {
    const entrySize = this.estimateSize(entry);
    this.entries.push(entry);
    this.byteSize += entrySize;
  }

  /**
   * Check if buffer should be flushed.
   */
  shouldFlush(): boolean {
    // Flush if entry threshold reached
    if (this.entries.length >= this.config.flushThreshold) {
      return true;
    }

    // Flush if interval elapsed
    const elapsed = Date.now() - this.lastFlush;
    if (elapsed >= this.config.flushIntervalMs) {
      return true;
    }

    // Flush if byte threshold reached
    if (this.byteSize >= this.config.flushByteThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Drain all entries from the buffer.
   */
  drain(): LogEntry[] {
    const drained = this.entries;
    this.entries = [];
    this.byteSize = 0;
    this.lastFlush = Date.now();
    return drained;
  }

  /**
   * Get current buffer size (entry count).
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Get current buffer byte size.
   */
  bytes(): number {
    return this.byteSize;
  }

  /**
   * Check if buffer is empty.
   */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /**
   * Get time since last flush in milliseconds.
   */
  timeSinceLastFlush(): number {
    return Date.now() - this.lastFlush;
  }

  /**
   * Estimate the size of a log entry in bytes.
   */
  private estimateSize(entry: LogEntry): number {
    // Base overhead for JSON structure
    let size = 200;

    // Text payload
    if (entry.textPayload) {
      size += entry.textPayload.length;
    }

    // JSON payload (estimate by stringifying)
    if (entry.jsonPayload) {
      try {
        size += JSON.stringify(entry.jsonPayload).length;
      } catch {
        size += 500; // Fallback estimate
      }
    }

    // Labels
    for (const [key, value] of Object.entries(entry.labels)) {
      size += key.length + value.length + 10; // Include JSON overhead
    }

    // Trace info
    if (entry.trace) {
      size += entry.trace.length + 20;
    }

    if (entry.spanId) {
      size += entry.spanId.length + 20;
    }

    // Source location
    if (entry.sourceLocation) {
      size += entry.sourceLocation.file.length + 50;
    }

    return size;
  }
}

/**
 * Chunk entries into batches respecting size limits.
 */
export function chunkEntries(
  entries: LogEntry[],
  maxBatchSize: number = 1000,
  maxBytes: number = 10 * 1024 * 1024
): LogEntry[][] {
  const batches: LogEntry[][] = [];
  let currentBatch: LogEntry[] = [];
  let currentBytes = 0;

  for (const entry of entries) {
    const entrySize = estimateEntrySize(entry);

    // Start new batch if limits would be exceeded
    if (
      currentBatch.length >= maxBatchSize ||
      currentBytes + entrySize > maxBytes
    ) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      currentBatch = [];
      currentBytes = 0;
    }

    currentBatch.push(entry);
    currentBytes += entrySize;
  }

  // Add final batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Estimate entry size for chunking.
 */
function estimateEntrySize(entry: LogEntry): number {
  let size = 200;

  if (entry.textPayload) {
    size += entry.textPayload.length;
  }

  if (entry.jsonPayload) {
    try {
      size += JSON.stringify(entry.jsonPayload).length;
    } catch {
      size += 500;
    }
  }

  for (const [key, value] of Object.entries(entry.labels)) {
    size += key.length + value.length + 10;
  }

  return size;
}

/**
 * Create a new log buffer with the given configuration.
 */
export function createBuffer(config: BufferConfig): LogBuffer {
  return new LogBuffer(config);
}

/**
 * Simulation layer for recording and replaying Ollama interactions.
 * Based on SPARC specification Section 7.
 */

import type { SimulationMode, TimingMode } from '../config/types.js';
import type { HttpTransport, HttpResponse } from '../transport/types.js';
import type { RecordEntry, RecordedResponse, TimingInfo, Recording } from './types.js';
import { FileStorage } from './storage.js';

/**
 * SimulationLayer wraps the HTTP transport to provide recording and replay capabilities.
 *
 * Modes:
 * - Disabled: Pass-through to transport (production mode)
 * - Recording: Execute requests and record responses
 * - Replay: Return recorded responses without hitting the server
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private readonly transport: HttpTransport;
  private recordings: RecordEntry[] = [];

  constructor(mode: SimulationMode, transport: HttpTransport) {
    this.mode = mode;
    this.transport = transport;
  }

  /**
   * Change the simulation mode at runtime.
   */
  setMode(mode: SimulationMode): void {
    this.mode = mode;
  }

  /**
   * Get the current simulation mode.
   */
  getMode(): SimulationMode {
    return this.mode;
  }

  /**
   * Execute a non-streaming operation through the simulation layer.
   *
   * @param operation - Operation name (e.g., 'chat', 'generate')
   * @param body - Request body
   * @param executor - Function that executes the actual request
   * @returns Promise resolving to HTTP response
   */
  async execute(
    operation: string,
    body: unknown,
    executor: (transport: HttpTransport) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    if (this.mode.type === 'disabled') {
      // Pass through to transport
      return executor(this.transport);
    }

    if (this.mode.type === 'recording') {
      // Execute and record
      const start = Date.now();
      let result: HttpResponse;
      let error: unknown | null = null;

      try {
        result = await executor(this.transport);
      } catch (e) {
        error = e;
        throw e;
      } finally {
        const duration = Date.now() - start;

        // Create record entry
        const entry = this.createRecordEntry(
          operation,
          body,
          error !== null ? { type: 'error' as const, error } : { type: 'success' as const, body: result!.body },
          duration
        );

        this.recordings.push(entry);

        // Persist if file storage
        if (this.mode.storage.type === 'file') {
          const storage = new FileStorage(this.mode.storage.path);
          await storage.append(entry).catch((err) => {
            console.error('Failed to persist recording:', err);
          });
        }
      }

      return result!;
    }

    if (this.mode.type === 'replay') {
      // Find matching recording
      const entry = this.findMatchingRecording(operation, body);

      if (!entry) {
        throw new Error(`No recording found for operation: ${operation}`);
      }

      // Apply timing
      await this.applyTiming(entry.timing, this.mode.timing);

      // Return recorded response
      if (entry.response.type === 'success') {
        return {
          status: 200,
          body: entry.response.body,
        };
      }

      if (entry.response.type === 'error') {
        throw entry.response.error;
      }

      throw new Error('Use executeStreaming for streaming operations');
    }

    throw new Error(`Unknown simulation mode: ${(this.mode as any).type}`);
  }

  /**
   * Execute a streaming operation through the simulation layer.
   *
   * @param operation - Operation name (e.g., 'chat-stream', 'generate-stream')
   * @param body - Request body
   * @param executor - Function that executes the actual streaming request
   * @returns Async generator yielding chunks
   */
  async *executeStreaming(
    operation: string,
    body: unknown,
    executor: (transport: HttpTransport) => AsyncIterable<Uint8Array>
  ): AsyncGenerator<Uint8Array, void, unknown> {
    if (this.mode.type === 'disabled') {
      // Pass through to transport
      yield* executor(this.transport);
      return;
    }

    if (this.mode.type === 'recording') {
      // Execute and record chunks
      const chunks: unknown[] = [];
      const chunkTimings: number[] = [];
      const start = Date.now();
      let firstTokenMs: number | undefined;

      try {
        for await (const chunk of executor(this.transport)) {
          const chunkTime = Date.now() - start;

          if (firstTokenMs === undefined) {
            firstTokenMs = chunkTime;
          }

          // Parse chunk to store as JSON
          const decoder = new TextDecoder();
          const text = decoder.decode(chunk);

          try {
            const parsed = JSON.parse(text);
            chunks.push(parsed);
          } catch {
            // If not JSON, store as string
            chunks.push(text);
          }

          chunkTimings.push(chunkTime);
          yield chunk;
        }

        const totalDuration = Date.now() - start;

        // Create record entry
        const entry = this.createRecordEntry(
          operation,
          body,
          { type: 'stream', chunks },
          totalDuration,
          firstTokenMs,
          chunkTimings
        );

        this.recordings.push(entry);

        // Persist if file storage
        if (this.mode.storage.type === 'file') {
          const storage = new FileStorage(this.mode.storage.path);
          await storage.append(entry).catch((err) => {
            console.error('Failed to persist recording:', err);
          });
        }
      } catch (error) {
        // Record error
        const totalDuration = Date.now() - start;
        const entry = this.createRecordEntry(operation, body, { type: 'error', error }, totalDuration);

        this.recordings.push(entry);

        if (this.mode.storage.type === 'file') {
          const storage = new FileStorage(this.mode.storage.path);
          await storage.append(entry).catch((err) => {
            console.error('Failed to persist recording:', err);
          });
        }

        throw error;
      }

      return;
    }

    if (this.mode.type === 'replay') {
      // Find matching recording
      const entry = this.findMatchingRecording(operation, body);

      if (!entry) {
        throw new Error(`No recording found for operation: ${operation}`);
      }

      if (entry.response.type !== 'stream') {
        throw new Error('Recording is not a streaming response');
      }

      // Replay chunks with timing
      const chunks = entry.response.chunks;
      const timings = entry.timing.chunkTimings || [];

      for (let i = 0; i < chunks.length; i++) {
        // Apply timing for this chunk
        if (i > 0) {
          const prevTiming = timings[i - 1] || 0;
          const currentTiming = timings[i] || 0;
          const delay = currentTiming - prevTiming;

          if (delay > 0) {
            await this.applyTimingDelay(delay, this.mode.timing);
          }
        } else if (i === 0 && entry.timing.firstTokenMs) {
          // Delay for first token
          await this.applyTimingDelay(entry.timing.firstTokenMs, this.mode.timing);
        }

        // Convert chunk back to Uint8Array
        const encoder = new TextEncoder();
        const chunkData = typeof chunks[i] === 'string' ? chunks[i] : JSON.stringify(chunks[i]);
        yield encoder.encode(chunkData as string);
      }

      return;
    }

    throw new Error(`Unknown simulation mode: ${(this.mode as any).type}`);
  }

  /**
   * Save current recordings to a file.
   *
   * @param path - File path to save recordings
   */
  async saveToFile(path: string): Promise<void> {
    const recording: Recording = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      entries: this.recordings,
    };

    const storage = new FileStorage(path);
    await storage.save(recording);
  }

  /**
   * Load recordings from a file.
   *
   * @param path - File path to load recordings from
   */
  async loadFromFile(path: string): Promise<void> {
    const storage = new FileStorage(path);
    const recording = await storage.load();
    this.recordings = recording.entries;
  }

  /**
   * Get all recorded entries.
   */
  getRecordings(): RecordEntry[] {
    return [...this.recordings];
  }

  /**
   * Clear all recordings.
   */
  clearRecordings(): void {
    this.recordings = [];
  }

  /**
   * Find a matching recording for the given operation and body.
   *
   * @param operation - Operation name
   * @param body - Request body
   * @returns Matching record entry or undefined
   */
  private findMatchingRecording(operation: string, body: unknown): RecordEntry | undefined {
    // Try exact match first
    for (const entry of this.recordings) {
      if (entry.operation === operation && this.deepEqual(entry.request, body)) {
        return entry;
      }
    }

    // Try relaxed match (operation only)
    for (const entry of this.recordings) {
      if (entry.operation === operation) {
        return entry;
      }
    }

    return undefined;
  }

  /**
   * Apply timing delay based on timing mode.
   *
   * @param timing - Recorded timing information
   * @param mode - Timing mode
   */
  private async applyTiming(timing: TimingInfo, mode: TimingMode): Promise<void> {
    await this.applyTimingDelay(timing.totalDurationMs, mode);
  }

  /**
   * Apply timing delay for a specific duration.
   *
   * @param durationMs - Duration in milliseconds
   * @param mode - Timing mode
   */
  private async applyTimingDelay(durationMs: number, mode: TimingMode): Promise<void> {
    if (mode === 'instant') {
      // No delay
      return;
    }

    if (mode === 'realistic') {
      // Simulate original timing
      await this.sleep(durationMs);
      return;
    }

    if (typeof mode === 'object' && mode.type === 'fixed') {
      // Use fixed delay
      await this.sleep(mode.delayMs);
      return;
    }
  }

  /**
   * Create a record entry from request/response data.
   */
  private createRecordEntry(
    operation: string,
    request: unknown,
    response: RecordedResponse,
    totalDurationMs: number,
    firstTokenMs?: number,
    chunkTimings?: number[]
  ): RecordEntry {
    // Extract model from request if available
    const model =
      typeof request === 'object' && request !== null && 'model' in request
        ? String((request as any).model)
        : 'unknown';

    return {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      operation,
      model,
      request,
      response,
      timing: {
        totalDurationMs,
        firstTokenMs,
        chunkTimings,
      },
    };
  }

  /**
   * Generate a unique ID for a recording.
   */
  private generateId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Deep equality check for objects.
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object);
      const bKeys = Object.keys(b as object);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (!this.deepEqual((a as any)[key], (b as any)[key])) {
          return false;
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

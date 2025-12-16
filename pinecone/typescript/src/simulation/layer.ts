/**
 * Simulation layer for record/replay testing
 */

import { generateFingerprint as createFingerprint } from './fingerprint.js';
import { SimulationMode, SimulationRecord, SimulationStorage } from './types.js';

/**
 * Configuration for the simulation layer
 */
export interface SimulationLayerConfig {
  /** Current simulation mode */
  mode: SimulationMode;
  /** Storage backend for simulation records */
  storage: SimulationStorage;
}

/**
 * Simulation layer that provides record/replay capabilities
 *
 * Modes:
 * - disabled: No recording or replay, operations execute normally
 * - record: Execute operations and record their responses
 * - replay: Return recorded responses without executing operations
 * - passthrough: Execute and record, but always return live response
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private storage: SimulationStorage;

  constructor(config: SimulationLayerConfig) {
    this.mode = config.mode;
    this.storage = config.storage;
  }

  /**
   * Check if currently in replay mode
   */
  isReplayMode(): boolean {
    return this.mode === 'replay';
  }

  /**
   * Check if currently in record mode
   */
  isRecordMode(): boolean {
    return this.mode === 'record';
  }

  /**
   * Set the current simulation mode
   */
  setMode(mode: SimulationMode): void {
    this.mode = mode;
  }

  /**
   * Record a request/response pair if recording is enabled
   *
   * @param operation - The operation name
   * @param request - The request data
   * @param response - The response data
   */
  recordIfEnabled<T>(operation: string, request: unknown, response: T): void {
    if (this.mode === 'record' || this.mode === 'passthrough') {
      const fingerprint = this.generateFingerprint(operation, request);
      const record: SimulationRecord = {
        fingerprint,
        operation,
        request,
        response,
        timestamp: Date.now(),
      };

      // Fire and forget - don't wait for storage
      void this.storage.store(record);
    }
  }

  /**
   * Get a recorded response if available
   *
   * @param operation - The operation name
   * @param request - The request data
   * @returns The recorded response or null if not found
   */
  async getRecorded<T>(operation: string, request: unknown): Promise<T | null> {
    if (this.mode !== 'replay') {
      return null;
    }

    const fingerprint = this.generateFingerprint(operation, request);
    const record = await this.storage.get(fingerprint);

    return record ? (record.response as T) : null;
  }

  /**
   * Generate a fingerprint for an operation and request
   *
   * @param operation - The operation name
   * @param request - The request data
   * @returns A deterministic fingerprint string
   */
  generateFingerprint(operation: string, request: unknown): string {
    return createFingerprint(operation, request);
  }

  /**
   * Wrap an operation with automatic record/replay behavior
   *
   * @param operation - The operation name
   * @param request - The request data
   * @param execute - Function that executes the actual operation
   * @returns The operation result (either live or replayed)
   */
  async wrap<T>(
    operation: string,
    request: unknown,
    execute: () => Promise<T>
  ): Promise<T> {
    switch (this.mode) {
      case 'disabled':
        // Just execute normally
        return await execute();

      case 'replay': {
        // Try to get recorded response
        const recorded = await this.getRecorded<T>(operation, request);
        if (recorded !== null) {
          return recorded;
        }
        // If no recording found, fall back to executing
        // This allows for graceful degradation
        return await execute();
      }

      case 'record': {
        // Execute and record the response
        const response = await execute();
        this.recordIfEnabled(operation, request, response);
        return response;
      }

      case 'passthrough': {
        // Execute, record, but always return live response
        const response = await execute();
        this.recordIfEnabled(operation, request, response);
        return response;
      }

      default:
        // Should never happen, but satisfy TypeScript
        return await execute();
    }
  }
}

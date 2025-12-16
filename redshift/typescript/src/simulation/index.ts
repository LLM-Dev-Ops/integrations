/**
 * Redshift Integration Simulation Layer
 *
 * Provides query recording and replay capabilities for testing without
 * connecting to Redshift.
 *
 * @module @llmdevops/redshift-integration/simulation
 */

export { QueryFingerprinter, defaultFingerprinter } from './fingerprint.js';
export { QueryRecorder } from './recorder.js';
export { SimulationReplayer, type ReplayStatistics } from './replayer.js';

// Re-export simulation-related types from the types module
export type { SimulationMode, RecordedQuery } from '../types/index.js';
export type { SimulationConfig } from '../config/index.js';

import type { QueryResult } from '../types/index.js';
import type { SimulationMode } from '../types/index.js';
import { QueryRecorder } from './recorder.js';
import { SimulationReplayer } from './replayer.js';

/**
 * Options for simulation configuration.
 */
export interface SimulationOptions {
  /** Path for recording or replay file */
  recordingPath?: string;
  /** Strict mode for replay (fail on unmatched queries) */
  strictMode?: boolean;
}

/**
 * Query executor function type.
 * Executes a query and returns a promise with the result.
 */
export type QueryExecutor = (sql: string, params?: unknown[]) => Promise<QueryResult>;

/**
 * Simulation layer that wraps query execution with recording or replay.
 *
 * @example
 * ```typescript
 * // Create a simulation layer in record mode
 * const simulation = new SimulationLayer('record', {
 *   recordingPath: './recordings/queries.json'
 * });
 *
 * // Wrap the query executor
 * const wrappedExecutor = simulation.wrap(originalExecutor);
 *
 * // Execute queries - they will be recorded
 * const result = await wrappedExecutor('SELECT * FROM users');
 *
 * // Save recordings
 * await simulation.flush();
 * ```
 *
 * @example
 * ```typescript
 * // Create a simulation layer in replay mode
 * const simulation = new SimulationLayer('replay', {
 *   recordingPath: './recordings/queries.json',
 *   strictMode: true
 * });
 *
 * // Load recordings
 * await simulation.loadRecording();
 *
 * // Wrap the query executor
 * const wrappedExecutor = simulation.wrap(originalExecutor);
 *
 * // Execute queries - they will be replayed from recordings
 * const result = await wrappedExecutor('SELECT * FROM users');
 * ```
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private recorder?: QueryRecorder;
  private replayer?: SimulationReplayer;
  private recordingPath?: string;

  /**
   * Creates a new simulation layer.
   * @param mode - Simulation mode (disabled, record, or replay)
   * @param options - Simulation options
   */
  constructor(mode: SimulationMode, options?: SimulationOptions) {
    this.mode = mode;
    this.recordingPath = options?.recordingPath;

    if (mode === 'record') {
      if (!this.recordingPath) {
        throw new Error('recordingPath is required for record mode');
      }
      this.recorder = new QueryRecorder(this.recordingPath);
    } else if (mode === 'replay') {
      if (!this.recordingPath) {
        throw new Error('recordingPath is required for replay mode');
      }
      this.replayer = new SimulationReplayer(
        undefined,
        undefined,
        options?.strictMode ?? false
      );
    }
  }

  /**
   * Loads recordings from the configured path (replay mode only).
   * @throws Error if not in replay mode or if recording path is not set
   */
  async loadRecording(): Promise<void> {
    if (this.mode !== 'replay') {
      throw new Error('loadRecording can only be called in replay mode');
    }
    if (!this.replayer || !this.recordingPath) {
      throw new Error('Replayer not initialized');
    }
    await this.replayer.load(this.recordingPath);
  }

  /**
   * Saves recordings to the configured path (record mode only).
   * @throws Error if not in record mode or if recording path is not set
   */
  async flush(): Promise<void> {
    if (this.mode !== 'record') {
      throw new Error('flush can only be called in record mode');
    }
    if (!this.recorder) {
      throw new Error('Recorder not initialized');
    }
    await this.recorder.save();
  }

  /**
   * Wraps a query executor with simulation capabilities.
   * @param executor - Original query executor function
   * @returns Wrapped query executor that records or replays based on mode
   */
  wrap(executor: QueryExecutor): QueryExecutor {
    if (this.mode === 'disabled') {
      return executor;
    }

    if (this.mode === 'record') {
      return async (sql: string, params?: unknown[]): Promise<QueryResult> => {
        const startTime = Date.now();
        try {
          const result = await executor(sql, params);
          const durationMs = Date.now() - startTime;
          this.recorder!.record(sql, result, durationMs, params);
          return result;
        } catch (error) {
          const durationMs = Date.now() - startTime;
          this.recorder!.record(sql, error as Error, durationMs, params);
          throw error;
        }
      };
    }

    if (this.mode === 'replay') {
      return async (sql: string, params?: unknown[]): Promise<QueryResult> => {
        return this.replayer!.replay(sql, params);
      };
    }

    return executor;
  }

  /**
   * Gets the current simulation mode.
   */
  getMode(): SimulationMode {
    return this.mode;
  }

  /**
   * Gets the recorder instance (record mode only).
   */
  getRecorder(): QueryRecorder | undefined {
    return this.recorder;
  }

  /**
   * Gets the replayer instance (replay mode only).
   */
  getReplayer(): SimulationReplayer | undefined {
    return this.replayer;
  }

  /**
   * Gets replay statistics (replay mode only).
   * @returns Statistics about replay operations
   */
  getStats() {
    if (this.mode !== 'replay' || !this.replayer) {
      throw new Error('getStats can only be called in replay mode');
    }
    return this.replayer.getStats();
  }

  /**
   * Gets the number of recordings (record or replay mode).
   */
  getRecordingCount(): number {
    if (this.mode === 'record' && this.recorder) {
      return this.recorder.count;
    }
    if (this.mode === 'replay' && this.replayer) {
      return this.replayer.count;
    }
    return 0;
  }
}

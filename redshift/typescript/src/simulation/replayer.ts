/**
 * Simulation Replayer
 *
 * Replays recorded query executions without connecting to Redshift.
 * @module @llmdevops/redshift-integration/simulation/replayer
 */

import { promises as fs } from 'fs';
import type { QueryResult, RecordedQuery } from '../types/index.js';
import { QueryFingerprinter } from './fingerprint.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

/**
 * Statistics for replay operations.
 */
export interface ReplayStatistics {
  /** Number of successful query matches */
  hits: number;
  /** Number of query misses */
  misses: number;
  /** Total number of replay attempts */
  total: number;
}

/**
 * Simulation replayer for replay mode.
 * Finds and returns matching recorded results without executing queries.
 */
export class SimulationReplayer {
  private recordings: Map<string, RecordedQuery>;
  private fingerprinter: QueryFingerprinter;
  private strictMode: boolean;
  private stats: ReplayStatistics;

  /**
   * Creates a new simulation replayer.
   * @param recordings - Optional initial recordings
   * @param fingerprinter - Optional custom fingerprinter
   * @param strictMode - Whether to fail on unmatched queries
   */
  constructor(
    recordings?: RecordedQuery[],
    fingerprinter?: QueryFingerprinter,
    strictMode: boolean = false
  ) {
    this.recordings = new Map();
    this.fingerprinter = fingerprinter || new QueryFingerprinter();
    this.strictMode = strictMode;
    this.stats = { hits: 0, misses: 0, total: 0 };

    if (recordings) {
      for (const recording of recordings) {
        this.recordings.set(recording.fingerprint, recording);
      }
    }
  }

  /**
   * Loads recordings from a file.
   * @param path - Path to the recording file
   */
  async load(path: string): Promise<void> {
    try {
      const data = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(data);

      if (!Array.isArray(parsed)) {
        throw new Error('Invalid recording file format: expected array');
      }

      // Clear existing recordings
      this.recordings.clear();

      // Deserialize and store recordings
      for (const item of parsed) {
        const recording = this.deserializeRecording(item);
        this.recordings.set(recording.fingerprint, recording);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Recording file not found: ${path}`);
      }
      throw new Error(`Failed to load recordings from ${path}: ${error}`);
    }
  }

  /**
   * Replays a query by finding and returning the matching recorded result.
   * @param sql - SQL query text
   * @param params - Optional query parameters
   * @returns Recorded query result
   * @throws Error if no matching recording found and strict mode is enabled
   */
  replay(sql: string, params?: unknown[]): QueryResult {
    this.stats.total++;

    const fingerprint = this.fingerprinter.fingerprint(sql, params);
    const recording = this.recordings.get(fingerprint);

    if (!recording) {
      this.stats.misses++;

      if (this.strictMode) {
        throw new RedshiftError(
          `No recorded response found for query: ${sql.substring(0, 100)}...`,
          RedshiftErrorCode.UNKNOWN_ERROR,
          {
            context: {
              fingerprint,
              availableRecordings: this.recordings.size,
            },
          }
        );
      }

      // Return empty result in non-strict mode
      return this.createEmptyResult(sql);
    }

    this.stats.hits++;

    // If the recorded response is an error, throw it
    if (recording.response instanceof Error) {
      throw recording.response;
    }

    // Return the recorded result
    return recording.response as QueryResult;
  }

  /**
   * Checks if a recording exists for a query.
   * @param sql - SQL query text
   * @param params - Optional query parameters
   * @returns True if a recording exists
   */
  hasRecording(sql: string, params?: unknown[]): boolean {
    const fingerprint = this.fingerprinter.fingerprint(sql, params);
    return this.recordings.has(fingerprint);
  }

  /**
   * Sets the strict mode.
   * In strict mode, unmatched queries throw an error.
   * @param strict - Whether to enable strict mode
   */
  setStrictMode(strict: boolean): void {
    this.strictMode = strict;
  }

  /**
   * Gets replay statistics.
   * @returns Statistics about replay operations
   */
  getStats(): ReplayStatistics {
    return { ...this.stats };
  }

  /**
   * Resets replay statistics.
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, total: 0 };
  }

  /**
   * Gets the number of loaded recordings.
   */
  get count(): number {
    return this.recordings.size;
  }

  /**
   * Gets all recordings.
   */
  getRecordings(): RecordedQuery[] {
    return Array.from(this.recordings.values());
  }

  /**
   * Clears all recordings.
   */
  clear(): void {
    this.recordings.clear();
  }

  /**
   * Creates an empty result for unmatched queries in non-strict mode.
   */
  private createEmptyResult(sql: string): QueryResult {
    return {
      queryId: `simulated-${Date.now()}`,
      sqlText: sql,
      resultSet: {
        columns: [],
        rows: [],
        rowCount: 0,
      },
      statistics: {
        executionTimeMs: 0,
        rowsReturned: 0,
      },
    };
  }

  /**
   * Deserializes a recording from JSON storage.
   */
  private deserializeRecording(data: any): RecordedQuery {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid recording data');
    }

    return {
      fingerprint: data.fingerprint,
      sqlText: data.sqlText,
      params: data.params?.map((param: any) => this.deserializeValue(param)),
      response: this.deserializeResponse(data.response),
      timestamp: new Date(data.timestamp),
      durationMs: data.durationMs,
    };
  }

  /**
   * Deserializes a value from JSON storage.
   */
  private deserializeValue(data: any): unknown {
    if (!data || typeof data !== 'object' || !data.type) {
      throw new Error('Invalid value data');
    }

    if (data.type === 'null') {
      return null;
    }
    if (data.type === 'binary') {
      return new Uint8Array(Buffer.from(data.value, 'base64'));
    }
    if (data.type === 'date') {
      return new Date(data.value);
    }
    if (data.type === 'bigint') {
      return BigInt(data.value);
    }
    return data.value;
  }

  /**
   * Deserializes a response from JSON storage.
   */
  private deserializeResponse(data: any): QueryResult | Error {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response data');
    }

    if (data.__type === 'error') {
      const error = new Error(data.message);
      error.name = data.name;
      if (data.stack) error.stack = data.stack;

      // If it's a RedshiftError, reconstruct it
      if (data.code) {
        const rsError = new RedshiftError(data.message, data.code, {
          sqlState: data.sqlState,
          queryId: data.queryId,
          retryable: data.retryable,
          context: data.context,
        });
        return rsError;
      }

      return error;
    }

    if (data.__type === 'result') {
      // Reconstruct QueryResult
      const rows = data.resultSet.rows.map((rowData: any) => {
        const row: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rowData)) {
          row[key] = this.deserializeValue(value);
        }
        return row;
      });

      return {
        queryId: data.queryId,
        sqlText: data.sqlText,
        resultSet: {
          columns: data.resultSet.columns,
          rows,
          rowCount: data.resultSet.rowCount,
          command: data.resultSet.command,
          oid: data.resultSet.oid,
        },
        statistics: data.statistics,
        sessionId: data.sessionId,
        queryGroup: data.queryGroup,
      };
    }

    throw new Error('Invalid response type');
  }
}

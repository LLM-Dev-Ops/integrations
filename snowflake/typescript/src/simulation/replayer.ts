/**
 * Simulation Replayer
 *
 * Replays recorded query executions without connecting to Snowflake.
 * @module @llmdevops/snowflake-integration/simulation/replayer
 */

import { promises as fs } from 'fs';
import type { Value, QueryResult, RecordedQuery } from '../types/index.js';
import { QueryFingerprinter } from './fingerprint.js';
import { SnowflakeError, SnowflakeErrorCode } from '../errors/index.js';

/**
 * Simulation replayer for replay mode.
 * Finds and returns matching recorded results without executing queries.
 */
export class SimulationReplayer {
  private recordings: Map<string, RecordedQuery>;
  private fingerprinter: QueryFingerprinter;
  private strictMode: boolean;

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
  replay(sql: string, params?: Value[]): QueryResult {
    const fingerprint = this.fingerprinter.fingerprint(sql, params);
    const recording = this.recordings.get(fingerprint);

    if (!recording) {
      if (this.strictMode) {
        throw new SnowflakeError(
          `No recorded response found for query: ${sql.substring(0, 100)}...`,
          SnowflakeErrorCode.UNKNOWN_ERROR,
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
  hasRecording(sql: string, params?: Value[]): boolean {
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
      statementHash: this.fingerprinter.hashQuery(sql),
      resultSet: {
        columns: [],
        rows: [],
        rowCount: 0,
        hasMore: false,
      },
      statistics: {
        executionTimeMs: 0,
        rowsProduced: 0,
        bytesScanned: 0,
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
   * Deserializes a Value from JSON storage.
   */
  private deserializeValue(data: any): Value {
    if (!data || typeof data !== 'object' || !data.type) {
      throw new Error('Invalid value data');
    }

    if (data.type === 'null') {
      return { type: 'null' };
    }
    if (data.type === 'binary') {
      return {
        type: 'binary',
        value: new Uint8Array(Buffer.from(data.value, 'base64')),
      };
    }
    if (data.type === 'date' || data.type === 'timestamp') {
      return {
        type: data.type,
        value: new Date(data.value),
      };
    }
    if (data.type === 'bigint') {
      return {
        type: 'bigint',
        value: BigInt(data.value),
      };
    }
    return data as Value;
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

      // If it's a SnowflakeError, reconstruct it
      if (data.code) {
        const sfError = new SnowflakeError(data.message, data.code, {
          sqlState: data.sqlState,
          queryId: data.queryId,
          retryable: data.retryable,
          context: data.context,
        });
        return sfError;
      }

      return error;
    }

    if (data.__type === 'result') {
      // Reconstruct QueryResult with Row instances
      const rows = data.resultSet.rows.map((rowData: any) => {
        const values = rowData.values.map((v: any) => this.deserializeValue(v));
        const columns = data.resultSet.columns;
        const columnIndex = new Map<string, number>(
          columns.map((col: any, i: number) => [col.name.toUpperCase(), i])
        );

        const getValue = (key: string | number): Value | undefined => {
          if (typeof key === 'number') {
            return values[key];
          }
          const upperKey = String(key).toUpperCase();
          const idx = columnIndex.get(upperKey);
          if (idx === undefined) return undefined;
          return values[idx];
        };

        const extractValue = (value: Value): unknown => {
          if (value.type === 'null') {
            return null;
          }
          return value.value;
        };

        return {
          values,
          get<T = unknown>(key: string | number): T | undefined {
            const v = getValue(key);
            return v ? (extractValue(v) as T) : undefined;
          },
          getString(key: string | number): string | null {
            const v = getValue(key);
            if (!v || v.type === 'null') return null;
            return String(extractValue(v));
          },
          getNumber(key: string | number): number | null {
            const v = getValue(key);
            if (!v || v.type === 'null') return null;
            const raw = extractValue(v);
            if (typeof raw === 'number') return raw;
            if (typeof raw === 'bigint') return Number(raw);
            if (typeof raw === 'string') return parseFloat(raw);
            return null;
          },
          getBoolean(key: string | number): boolean | null {
            const v = getValue(key);
            if (!v || v.type === 'null') return null;
            const raw = extractValue(v);
            if (typeof raw === 'boolean') return raw;
            if (typeof raw === 'number') return raw !== 0;
            if (typeof raw === 'string') return raw.toLowerCase() === 'true';
            return null;
          },
          getDate(key: string | number): Date | null {
            const v = getValue(key);
            if (!v || v.type === 'null') return null;
            const raw = extractValue(v);
            if (raw instanceof Date) return raw;
            if (typeof raw === 'string' || typeof raw === 'number') {
              const d = new Date(raw);
              return isNaN(d.getTime()) ? null : d;
            }
            return null;
          },
          getObject<T = Record<string, unknown>>(key: string | number): T | null {
            const v = getValue(key);
            if (!v || v.type === 'null') return null;
            const raw = extractValue(v);
            if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
              return raw as T;
            }
            if (typeof raw === 'string') {
              try {
                return JSON.parse(raw) as T;
              } catch {
                return null;
              }
            }
            return null;
          },
          getArray<T = unknown>(key: string | number): T[] | null {
            const v = getValue(key);
            if (!v || v.type === 'null') return null;
            const raw = extractValue(v);
            if (Array.isArray(raw)) return raw as T[];
            if (typeof raw === 'string') {
              try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? (parsed as T[]) : null;
              } catch {
                return null;
              }
            }
            return null;
          },
        };
      });

      return {
        queryId: data.queryId,
        statementHash: data.statementHash,
        resultSet: {
          columns: data.resultSet.columns,
          rows,
          rowCount: data.resultSet.rowCount,
          hasMore: data.resultSet.hasMore,
          lastPosition: data.resultSet.lastPosition,
        },
        statistics: data.statistics,
        warehouse: data.warehouse,
        sessionId: data.sessionId,
      };
    }

    throw new Error('Invalid response type');
  }
}

/**
 * Query Recorder
 *
 * Records query executions and results for simulation replay.
 * @module @llmdevops/snowflake-integration/simulation/recorder
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import type { Value, QueryResult, RecordedQuery } from '../types/index.js';
import { QueryFingerprinter } from './fingerprint.js';
import { SnowflakeError } from '../errors/index.js';

/**
 * Query recorder for recording mode.
 * Records query executions and their results to a file for later replay.
 */
export class QueryRecorder {
  private recordings: RecordedQuery[] = [];
  private fingerprinter: QueryFingerprinter;
  private recordingPath: string;

  /**
   * Creates a new query recorder.
   * @param recordingPath - Path to the recording file
   * @param fingerprinter - Optional custom fingerprinter
   */
  constructor(recordingPath: string, fingerprinter?: QueryFingerprinter) {
    this.recordingPath = recordingPath;
    this.fingerprinter = fingerprinter || new QueryFingerprinter();
  }

  /**
   * Records a query and its result.
   * @param query - SQL query text
   * @param result - Query result or error
   * @param durationMs - Execution duration in milliseconds
   * @param params - Optional query parameters
   */
  record(
    query: string,
    result: QueryResult | Error,
    durationMs: number,
    params?: Value[]
  ): void {
    const fingerprint = this.fingerprinter.fingerprint(query, params);

    const recording: RecordedQuery = {
      fingerprint,
      sqlText: query,
      params,
      response: result,
      timestamp: new Date(),
      durationMs,
    };

    this.recordings.push(recording);
  }

  /**
   * Saves recordings to file.
   * @param path - Optional path override. If not provided, uses the constructor path.
   */
  async save(path?: string): Promise<void> {
    const targetPath = path || this.recordingPath;

    // Ensure directory exists
    const dir = dirname(targetPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${dir}: ${error}`);
    }

    // Serialize recordings
    const serialized = JSON.stringify(
      this.recordings.map((recording) => this.serializeRecording(recording)),
      null,
      2
    );

    // Write to file
    try {
      await fs.writeFile(targetPath, serialized, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write recordings to ${targetPath}: ${error}`);
    }
  }

  /**
   * Loads recordings from file.
   * @param path - Path to the recording file
   */
  async load(path: string): Promise<void> {
    try {
      const data = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(data);

      if (!Array.isArray(parsed)) {
        throw new Error('Invalid recording file format: expected array');
      }

      this.recordings = parsed.map((item) => this.deserializeRecording(item));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Recording file not found: ${path}`);
      }
      throw new Error(`Failed to load recordings from ${path}: ${error}`);
    }
  }

  /**
   * Gets all recordings.
   * @returns Array of recorded queries
   */
  getRecordings(): RecordedQuery[] {
    return [...this.recordings];
  }

  /**
   * Clears all recordings.
   */
  clear(): void {
    this.recordings = [];
  }

  /**
   * Gets the number of recordings.
   */
  get count(): number {
    return this.recordings.length;
  }

  /**
   * Serializes a recording for JSON storage.
   */
  private serializeRecording(recording: RecordedQuery): unknown {
    return {
      fingerprint: recording.fingerprint,
      sqlText: recording.sqlText,
      params: recording.params?.map((param) => this.serializeValue(param)),
      response: this.serializeResponse(recording.response),
      timestamp: recording.timestamp.toISOString(),
      durationMs: recording.durationMs,
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
   * Serializes a Value for JSON storage.
   */
  private serializeValue(value: Value): unknown {
    if (value.type === 'null') {
      return { type: 'null' };
    }
    if (value.type === 'binary') {
      return {
        type: 'binary',
        value: Buffer.from(value.value).toString('base64'),
      };
    }
    if (value.type === 'date' || value.type === 'timestamp') {
      return {
        type: value.type,
        value: value.value.toISOString(),
      };
    }
    if (value.type === 'bigint') {
      return {
        type: 'bigint',
        value: value.value.toString(),
      };
    }
    return value;
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
   * Serializes a response (QueryResult or Error) for JSON storage.
   */
  private serializeResponse(response: QueryResult | Error): unknown {
    if (response instanceof Error) {
      return {
        __type: 'error',
        name: response.name,
        message: response.message,
        stack: response.stack,
        ...(response instanceof SnowflakeError && {
          code: response.code,
          sqlState: response.sqlState,
          queryId: response.queryId,
          retryable: response.retryable,
          context: response.context,
        }),
      };
    }

    // Serialize QueryResult
    return {
      __type: 'result',
      queryId: response.queryId,
      statementHash: response.statementHash,
      resultSet: {
        columns: response.resultSet.columns,
        rows: response.resultSet.rows.map((row) => ({
          values: row.values.map((value) => this.serializeValue(value)),
        })),
        rowCount: response.resultSet.rowCount,
        hasMore: response.resultSet.hasMore,
        lastPosition: response.resultSet.lastPosition,
      },
      statistics: response.statistics,
      warehouse: response.warehouse,
      sessionId: response.sessionId,
    };
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

/**
 * Query Recorder
 *
 * Records query executions and results for simulation replay.
 * @module @llmdevops/redshift-integration/simulation/recorder
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import type { QueryResult, RecordedQuery } from '../types/index.js';
import { QueryFingerprinter } from './fingerprint.js';
import { RedshiftError } from '../errors/index.js';

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
    params?: unknown[]
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
   * Serializes a value for JSON storage.
   */
  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return { type: 'null' };
    }
    if (value instanceof Uint8Array || value instanceof Buffer) {
      return {
        type: 'binary',
        value: Buffer.from(value).toString('base64'),
      };
    }
    if (value instanceof Date) {
      return {
        type: 'date',
        value: value.toISOString(),
      };
    }
    if (typeof value === 'bigint') {
      return {
        type: 'bigint',
        value: value.toString(),
      };
    }
    return {
      type: typeof value,
      value: value,
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
   * Serializes a response (QueryResult or Error) for JSON storage.
   */
  private serializeResponse(response: QueryResult | Error): unknown {
    if (response instanceof Error) {
      return {
        __type: 'error',
        name: response.name,
        message: response.message,
        stack: response.stack,
        ...(response instanceof RedshiftError && {
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
      sqlText: response.sqlText,
      resultSet: {
        columns: response.resultSet.columns,
        rows: response.resultSet.rows.map((row) => {
          const serialized: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            serialized[key] = this.serializeValue(value);
          }
          return serialized;
        }),
        rowCount: response.resultSet.rowCount,
        command: response.resultSet.command,
        oid: response.resultSet.oid,
      },
      statistics: response.statistics,
      sessionId: response.sessionId,
      queryGroup: response.queryGroup,
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

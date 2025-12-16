/**
 * Replay engine for recorded ECR operations.
 *
 * This module provides functionality to replay previously recorded
 * ECR operations, enabling deterministic testing without AWS calls.
 *
 * @module simulation/replay
 */

import { readFile } from 'fs/promises';
import { EcrClientInterface } from '../types/client.js';
import { RecordedOperation } from './mock-client.js';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Replay configuration options.
 */
export interface ReplayConfig {
  /**
   * Strict mode: fail if a request doesn't match any recording.
   * If false, returns empty results for unmatched requests.
   */
  readonly strictMode: boolean;

  /**
   * How to match requests to recordings.
   * - 'exact': Parameters must match exactly
   * - 'operation': Only operation name must match (returns first match)
   * - 'fuzzy': Attempts to match based on operation and key parameters
   */
  readonly matchBy: 'exact' | 'operation' | 'fuzzy';
}

/**
 * Default replay configuration.
 */
const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  strictMode: true,
  matchBy: 'exact',
};

/**
 * Replay client that returns recorded responses.
 *
 * This client replays previously recorded operations, returning
 * the recorded results or throwing recorded errors.
 */
export class ReplayClient implements EcrClientInterface {
  private recordings: RecordedOperation[];
  private config: ReplayConfig;
  private usedRecordings: Set<number>;
  private requestCount: number;

  /**
   * Creates a new replay client.
   *
   * @param recordings - Recorded operations to replay
   * @param config - Replay configuration
   */
  constructor(
    recordings: RecordedOperation[],
    config: Partial<ReplayConfig> = {}
  ) {
    this.recordings = recordings;
    this.config = { ...DEFAULT_REPLAY_CONFIG, ...config };
    this.usedRecordings = new Set();
    this.requestCount = 0;
  }

  /**
   * Loads recordings from a file and creates a replay client.
   *
   * @param file - Path to recordings file
   * @param config - Replay configuration
   * @returns A new replay client
   * @throws {Error} If file read or parse fails
   *
   * @example
   * ```typescript
   * const client = await ReplayClient.load('recording.json', {
   *   strictMode: true,
   *   matchBy: 'exact',
   * });
   *
   * // Use like normal client
   * const result = await client.send('DescribeRepositories', {});
   * ```
   */
  static async load(
    file: string,
    config: Partial<ReplayConfig> = {}
  ): Promise<ReplayClient> {
    const content = await readFile(file, 'utf-8');
    const recordings = JSON.parse(content, reviver);
    return new ReplayClient(recordings, config);
  }

  /**
   * Sends a request and returns the recorded response.
   *
   * @param operation - Operation name
   * @param params - Operation parameters
   * @returns The recorded result
   * @throws {EcrError} If the recorded operation threw an error, or if no match found in strict mode
   */
  async send<TRequest, TResponse>(
    operation: string,
    params: TRequest
  ): Promise<TResponse> {
    this.requestCount++;

    // Find matching recording
    const index = this.findMatchingRecording(operation, params);

    if (index === -1) {
      if (this.config.strictMode) {
        throw new EcrError(
          EcrErrorKind.Unknown,
          `No matching recording found for operation ${operation}. ` +
            `Request #${this.requestCount}. ` +
            `Available recordings: ${this.recordings.length}, ` +
            `Used: ${this.usedRecordings.size}`
        );
      }

      // Non-strict mode: return empty result
      return this.createEmptyResult(operation);
    }

    const recording = this.recordings[index];
    this.usedRecordings.add(index);

    // If recording has error, throw it
    if (recording.error) {
      throw recording.error;
    }

    // Return recorded result
    return recording.result as TResponse;
  }

  /**
   * Gets replay statistics.
   *
   * @returns Statistics about replay session
   */
  getStats(): {
    totalRecordings: number;
    usedRecordings: number;
    requestCount: number;
    unusedRecordings: number;
  } {
    return {
      totalRecordings: this.recordings.length,
      usedRecordings: this.usedRecordings.size,
      requestCount: this.requestCount,
      unusedRecordings: this.recordings.length - this.usedRecordings.size,
    };
  }

  /**
   * Gets unused recordings (useful for debugging).
   *
   * @returns Array of recordings that haven't been used
   */
  getUnusedRecordings(): RecordedOperation[] {
    return this.recordings.filter((_, index) => !this.usedRecordings.has(index));
  }

  /**
   * Resets replay state.
   */
  reset(): void {
    this.usedRecordings.clear();
    this.requestCount = 0;
  }

  /**
   * Finds a matching recording for the request.
   *
   * @param operation - Operation name
   * @param params - Operation parameters
   * @returns Index of matching recording, or -1 if not found
   */
  private findMatchingRecording(operation: string, params: unknown): number {
    switch (this.config.matchBy) {
      case 'exact':
        return this.findExactMatch(operation, params);
      case 'operation':
        return this.findOperationMatch(operation);
      case 'fuzzy':
        return this.findFuzzyMatch(operation, params);
      default:
        return -1;
    }
  }

  /**
   * Finds exact match (operation and parameters must match exactly).
   */
  private findExactMatch(operation: string, params: unknown): number {
    return this.recordings.findIndex(
      (rec) =>
        rec.operation === operation &&
        JSON.stringify(rec.params) === JSON.stringify(params)
    );
  }

  /**
   * Finds operation match (only operation name must match, returns first unused).
   */
  private findOperationMatch(operation: string): number {
    return this.recordings.findIndex(
      (rec, index) =>
        rec.operation === operation && !this.usedRecordings.has(index)
    );
  }

  /**
   * Finds fuzzy match (operation and key parameters).
   */
  private findFuzzyMatch(operation: string, params: unknown): number {
    if (typeof params !== 'object' || params === null) {
      return this.findOperationMatch(operation);
    }

    const paramsObj = params as Record<string, unknown>;

    return this.recordings.findIndex((rec, index) => {
      if (rec.operation !== operation || this.usedRecordings.has(index)) {
        return false;
      }

      const recParams = rec.params as Record<string, unknown>;

      // Match based on key identifying parameters
      switch (operation) {
        case 'DescribeRepositories':
          return this.arraysEqual(
            paramsObj.repositoryNames as string[] | undefined,
            recParams.repositoryNames as string[] | undefined
          );

        case 'DescribeImages':
        case 'ListImages':
        case 'BatchGetImage':
        case 'StartImageScan':
        case 'DescribeImageScanFindings':
          return paramsObj.repositoryName === recParams.repositoryName;

        case 'PutImage':
          return (
            paramsObj.repositoryName === recParams.repositoryName &&
            paramsObj.imageTag === recParams.imageTag
          );

        case 'BatchDeleteImage':
          return paramsObj.repositoryName === recParams.repositoryName;

        default:
          // For unknown operations, fall back to operation match
          return true;
      }
    });
  }

  /**
   * Checks if two arrays are equal (order-independent for repository names).
   */
  private arraysEqual<T>(
    a: T[] | undefined,
    b: T[] | undefined
  ): boolean {
    if (a === undefined && b === undefined) return true;
    if (a === undefined || b === undefined) return false;
    if (a.length !== b.length) return false;

    const sortedA = [...a].sort();
    const sortedB = [...b].sort();

    return sortedA.every((val, index) => val === sortedB[index]);
  }

  /**
   * Creates an empty result for an operation when no recording is found.
   */
  private createEmptyResult<T>(operation: string): T {
    switch (operation) {
      case 'DescribeRepositories':
        return { repositories: [] } as T;
      case 'DescribeImages':
        return { imageDetails: [] } as T;
      case 'ListImages':
        return { imageIds: [] } as T;
      case 'BatchGetImage':
        return { images: [], failures: [] } as T;
      case 'BatchDeleteImage':
        return { imageIds: [], failures: [] } as T;
      case 'GetAuthorizationToken':
        return { authorizationData: [] } as T;
      default:
        return {} as T;
    }
  }
}

/**
 * Custom JSON reviver for deserializing recordings.
 * Reconstructs Date and Error objects.
 */
function reviver(_key: string, value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value
  ) {
    const typed = value as { __type: string; [key: string]: unknown };

    if (typed.__type === 'Date') {
      return new Date(typed.value as string);
    }

    if (typed.__type === 'Error') {
      if ('kind' in typed) {
        // Reconstruct EcrError
        const error = new EcrError(
          typed.kind as any,
          typed.message as string,
          {
            statusCode: typed.statusCode as number | undefined,
            requestId: typed.requestId as string | undefined,
            retryAfter: typed.retryAfter as number | undefined,
          }
        );
        if (typed.stack) {
          error.stack = typed.stack as string;
        }
        return error;
      }

      // Generic Error
      const error = new Error(typed.message as string);
      error.name = typed.name as string;
      if (typed.stack) {
        error.stack = typed.stack as string;
      }
      return error;
    }
  }
  return value;
}

/**
 * Replay session manager.
 *
 * This class provides a higher-level interface for replay sessions,
 * including statistics and validation.
 */
export class ReplaySession {
  private client: ReplayClient;
  private startTime: Date;

  /**
   * Creates a new replay session.
   *
   * @param recordings - Recorded operations
   * @param config - Replay configuration
   */
  constructor(
    recordings: RecordedOperation[],
    config: Partial<ReplayConfig> = {}
  ) {
    this.client = new ReplayClient(recordings, config);
    this.startTime = new Date();
  }

  /**
   * Loads a replay session from a file.
   *
   * @param file - Path to recordings file
   * @param config - Replay configuration
   * @returns A new replay session
   */
  static async load(
    file: string,
    config: Partial<ReplayConfig> = {}
  ): Promise<ReplaySession> {
    const client = await ReplayClient.load(file, config);
    return new ReplaySession([], config); // Client already has recordings
  }

  /**
   * Gets the replay client.
   *
   * @returns The replay client
   */
  getClient(): ReplayClient {
    return this.client;
  }

  /**
   * Gets session statistics.
   *
   * @returns Statistics including timing information
   */
  getStats(): {
    totalRecordings: number;
    usedRecordings: number;
    requestCount: number;
    unusedRecordings: number;
    duration: number;
  } {
    const stats = this.client.getStats();
    return {
      ...stats,
      duration: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Validates that all recordings were used.
   *
   * @throws {Error} If there are unused recordings
   */
  validateAllUsed(): void {
    const stats = this.client.getStats();
    if (stats.unusedRecordings > 0) {
      const unused = this.client.getUnusedRecordings();
      const unusedOps = unused.map((r) => r.operation).join(', ');
      throw new Error(
        `Replay validation failed: ${stats.unusedRecordings} recordings were not used. ` +
          `Unused operations: ${unusedOps}`
      );
    }
  }

  /**
   * Prints summary of replay session.
   */
  printSummary(): void {
    const stats = this.getStats();
    console.log('Replay Session Summary:');
    console.log(`  Total recordings: ${stats.totalRecordings}`);
    console.log(`  Used recordings: ${stats.usedRecordings}`);
    console.log(`  Request count: ${stats.requestCount}`);
    console.log(`  Unused recordings: ${stats.unusedRecordings}`);
    console.log(`  Duration: ${stats.duration}ms`);
  }
}

/**
 * Creates a replay session from a file.
 *
 * @param file - Path to recordings file
 * @param config - Replay configuration
 * @returns A new replay session
 *
 * @example
 * ```typescript
 * const session = await createReplaySession('recording.json', {
 *   strictMode: true,
 *   matchBy: 'exact',
 * });
 *
 * const client = session.getClient();
 * // Use client...
 *
 * session.validateAllUsed(); // Ensures all recordings were replayed
 * session.printSummary();
 * ```
 */
export async function createReplaySession(
  file: string,
  config: Partial<ReplayConfig> = {}
): Promise<ReplaySession> {
  return ReplaySession.load(file, config);
}

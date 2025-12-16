/**
 * Operation recording for ECR client operations.
 *
 * This module provides functionality to record ECR client operations
 * to disk for later replay in testing scenarios.
 *
 * @module simulation/recorder
 */

import { writeFile, readFile } from 'fs/promises';
import { EcrClientInterface } from '../types/client.js';
import { RecordedOperation } from './mock-client.js';
import { EcrError } from '../errors.js';

/**
 * Records ECR client operations to a file.
 *
 * The recorder captures all operations sent through a client,
 * including parameters, results, and errors, and saves them
 * to a JSON file for later replay.
 */
export class OperationRecorder {
  private operations: RecordedOperation[];
  private outputFile: string;

  /**
   * Creates a new operation recorder.
   *
   * @param outputFile - Path to the output file
   */
  constructor(outputFile: string) {
    this.outputFile = outputFile;
    this.operations = [];
  }

  /**
   * Records an operation.
   *
   * @param operation - Operation to record
   */
  record(operation: RecordedOperation): void {
    this.operations.push(operation);
  }

  /**
   * Saves recorded operations to disk.
   *
   * @throws {Error} If file write fails
   */
  async save(): Promise<void> {
    const serialized = JSON.stringify(
      this.operations,
      this.replacer,
      2
    );
    await writeFile(this.outputFile, serialized, 'utf-8');
  }

  /**
   * Loads recorded operations from disk.
   *
   * @returns Array of recorded operations
   * @throws {Error} If file read or parse fails
   */
  async load(): Promise<RecordedOperation[]> {
    const content = await readFile(this.outputFile, 'utf-8');
    const parsed = JSON.parse(content, this.reviver);
    return parsed;
  }

  /**
   * Gets the current operations.
   *
   * @returns Array of recorded operations
   */
  getOperations(): RecordedOperation[] {
    return [...this.operations];
  }

  /**
   * Clears all recorded operations.
   */
  clear(): void {
    this.operations = [];
  }

  /**
   * Custom JSON replacer for serializing operations.
   * Handles Date objects and Error objects.
   */
  private replacer(_key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return {
        __type: 'Date',
        value: value.toISOString(),
      };
    }
    if (value instanceof Error) {
      return {
        __type: 'Error',
        name: value.name,
        message: value.message,
        stack: value.stack,
        // Include EcrError specific properties
        ...(value instanceof EcrError && {
          kind: (value as EcrError).kind,
          statusCode: (value as EcrError).statusCode,
          requestId: (value as EcrError).requestId,
          retryAfter: (value as EcrError).retryAfter,
        }),
      };
    }
    return value;
  }

  /**
   * Custom JSON reviver for deserializing operations.
   * Reconstructs Date and Error objects.
   */
  private reviver(_key: string, value: unknown): unknown {
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
}

/**
 * Wraps an ECR client to record all operations.
 *
 * This function creates a proxy around the client that intercepts
 * all send() calls and records them to the provided recorder.
 *
 * @param client - The ECR client to wrap
 * @param recorder - The recorder to use
 * @returns A wrapped client that records operations
 *
 * @example
 * ```typescript
 * const recorder = new OperationRecorder('recording.json');
 * const client = new EcrClient(config);
 * const recordingClient = wrapClientForRecording(client, recorder);
 *
 * // Use the client normally
 * await recordingClient.send('DescribeRepositories', {});
 *
 * // Save recording
 * await recorder.save();
 * ```
 */
export function wrapClientForRecording(
  client: EcrClientInterface,
  recorder: OperationRecorder
): EcrClientInterface {
  return {
    async send<TRequest, TResponse>(
      operation: string,
      params: TRequest
    ): Promise<TResponse> {
      const timestamp = new Date();

      try {
        const result = await client.send<TRequest, TResponse>(operation, params);

        // Record successful operation
        recorder.record({
          operation,
          params,
          timestamp,
          result,
        });

        return result;
      } catch (error) {
        // Record failed operation
        const ecrError = error instanceof EcrError
          ? error
          : new EcrError(
              'unknown' as any,
              error instanceof Error ? error.message : String(error),
              { cause: error instanceof Error ? error : undefined }
            );

        recorder.record({
          operation,
          params,
          timestamp,
          error: ecrError,
        });

        throw error;
      }
    },
  };
}

/**
 * Recording session manager.
 *
 * This class provides a higher-level interface for managing
 * recording sessions, including automatic saving and loading.
 */
export class RecordingSession {
  private recorder: OperationRecorder;
  private client: EcrClientInterface;

  /**
   * Creates a new recording session.
   *
   * @param client - The client to record
   * @param outputFile - Path to save recordings
   */
  constructor(client: EcrClientInterface, outputFile: string) {
    this.recorder = new OperationRecorder(outputFile);
    this.client = wrapClientForRecording(client, this.recorder);
  }

  /**
   * Gets the wrapped client.
   *
   * @returns The recording client
   */
  getClient(): EcrClientInterface {
    return this.client;
  }

  /**
   * Gets the recorder.
   *
   * @returns The operation recorder
   */
  getRecorder(): OperationRecorder {
    return this.recorder;
  }

  /**
   * Saves the recording.
   *
   * @throws {Error} If save fails
   */
  async save(): Promise<void> {
    await this.recorder.save();
  }

  /**
   * Gets the recorded operations.
   *
   * @returns Array of recorded operations
   */
  getOperations(): RecordedOperation[] {
    return this.recorder.getOperations();
  }

  /**
   * Gets the count of recorded operations.
   *
   * @returns Number of recorded operations
   */
  getOperationCount(): number {
    return this.recorder.getOperations().length;
  }

  /**
   * Clears the recording.
   */
  clear(): void {
    this.recorder.clear();
  }
}

/**
 * Creates a recording session from an existing client.
 *
 * @param client - The client to record
 * @param outputFile - Path to save recordings
 * @returns A new recording session
 *
 * @example
 * ```typescript
 * const session = createRecordingSession(client, 'recording.json');
 * const recordingClient = session.getClient();
 *
 * // Use client...
 *
 * await session.save();
 * console.log(`Recorded ${session.getOperationCount()} operations`);
 * ```
 */
export function createRecordingSession(
  client: EcrClientInterface,
  outputFile: string
): RecordingSession {
  return new RecordingSession(client, outputFile);
}

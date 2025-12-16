/**
 * Simulation recording for capturing API interactions
 */
import { createHash } from 'crypto';

/**
 * Recorded operation
 */
export interface RecordedOperation {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  requestHash: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  status: number;
  latencyMs: number;
}

/**
 * Recording storage interface
 */
export interface RecordingStorage {
  save(recordings: RecordedOperation[]): Promise<void>;
  load(): Promise<RecordedOperation[]>;
}

/**
 * Simulation recorder for capturing API interactions
 */
export class SimulationRecorder {
  private readonly recordings: RecordedOperation[] = [];
  private readonly storage?: RecordingStorage;

  constructor(storage?: RecordingStorage) {
    this.storage = storage;
  }

  /**
   * Records an API operation
   */
  record(
    method: string,
    path: string,
    request: Record<string, unknown>,
    response: Record<string, unknown>,
    status: number,
    latencyMs: number
  ): RecordedOperation {
    const requestHash = this.generateHash(method, path, request);
    const id = `rec_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const operation: RecordedOperation = {
      id,
      timestamp: Date.now(),
      method,
      path,
      requestHash,
      request,
      response,
      status,
      latencyMs,
    };

    this.recordings.push(operation);
    return operation;
  }

  /**
   * Generates a hash for request identification
   */
  generateHash(
    method: string,
    path: string,
    request: Record<string, unknown>
  ): string {
    const content = JSON.stringify({
      method,
      path,
      request: this.sortObjectKeys(request),
    });

    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Sorts object keys for consistent hashing
   */
  private sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) =>
        typeof item === 'object' && item !== null
          ? this.sortObjectKeys(item as Record<string, unknown>)
          : item
      ) as unknown as Record<string, unknown>;
    }

    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const value = obj[key];
      result[key] =
        typeof value === 'object' && value !== null
          ? this.sortObjectKeys(value as Record<string, unknown>)
          : value;
    }

    return result;
  }

  /**
   * Gets all recordings
   */
  getRecordings(): RecordedOperation[] {
    return [...this.recordings];
  }

  /**
   * Clears all recordings
   */
  clear(): void {
    this.recordings.length = 0;
  }

  /**
   * Saves recordings to storage
   */
  async save(): Promise<void> {
    if (this.storage) {
      await this.storage.save(this.recordings);
    }
  }

  /**
   * Loads recordings from storage
   */
  async load(): Promise<void> {
    if (this.storage) {
      const loaded = await this.storage.load();
      this.recordings.push(...loaded);
    }
  }

  /**
   * Gets recording count
   */
  get count(): number {
    return this.recordings.length;
  }
}

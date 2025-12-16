/**
 * Simulation replayer for replaying recorded API interactions
 */
import { createHash } from 'crypto';
import { SimulationError } from '../errors/categories.js';
import type { RecordedOperation } from './recorder.js';

/**
 * Replay match result
 */
export interface ReplayMatch {
  recording: RecordedOperation;
  matchScore: number;
  matchType: 'exact' | 'fuzzy' | 'path_only';
}

/**
 * Simulation replayer for replaying recorded API interactions
 */
export class SimulationReplayer {
  private readonly recordings: Map<string, RecordedOperation[]> = new Map();
  private readonly usedRecordings: Set<string> = new Set();
  private strictMode: boolean = true;

  constructor(recordings: RecordedOperation[] = [], strictMode: boolean = true) {
    this.strictMode = strictMode;
    this.loadRecordings(recordings);
  }

  /**
   * Loads recordings into the replayer
   */
  loadRecordings(recordings: RecordedOperation[]): void {
    for (const recording of recordings) {
      const key = this.getPathKey(recording.method, recording.path);
      const existing = this.recordings.get(key) ?? [];
      existing.push(recording);
      this.recordings.set(key, existing);
    }
  }

  /**
   * Finds a matching recording for a request
   */
  findMatch(
    method: string,
    path: string,
    request: Record<string, unknown>
  ): ReplayMatch | undefined {
    const key = this.getPathKey(method, path);
    const candidates = this.recordings.get(key);

    if (!candidates || candidates.length === 0) {
      return undefined;
    }

    const requestHash = this.generateHash(method, path, request);

    // Try exact match first
    for (const recording of candidates) {
      if (recording.requestHash === requestHash && !this.usedRecordings.has(recording.id)) {
        return {
          recording,
          matchScore: 1.0,
          matchType: 'exact',
        };
      }
    }

    // Try fuzzy match
    if (!this.strictMode) {
      for (const recording of candidates) {
        if (!this.usedRecordings.has(recording.id)) {
          const score = this.calculateSimilarity(request, recording.request);
          if (score > 0.8) {
            return {
              recording,
              matchScore: score,
              matchType: 'fuzzy',
            };
          }
        }
      }

      // Fall back to path-only match
      for (const recording of candidates) {
        if (!this.usedRecordings.has(recording.id)) {
          return {
            recording,
            matchScore: 0.5,
            matchType: 'path_only',
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Replays a recorded response
   */
  replay(
    method: string,
    path: string,
    request: Record<string, unknown>
  ): Record<string, unknown> {
    const match = this.findMatch(method, path, request);

    if (!match) {
      throw new SimulationError(
        `No matching recording found for ${method} ${path}`,
        { method, path, requestKeys: Object.keys(request) }
      );
    }

    // Mark recording as used
    this.usedRecordings.add(match.recording.id);

    // Return the recorded response
    return match.recording.response;
  }

  /**
   * Gets a path key for lookup
   */
  private getPathKey(method: string, path: string): string {
    // Normalize path by replacing IDs with placeholders
    const normalizedPath = path.replace(/\/[a-zA-Z]{2,}_[a-zA-Z0-9]+/g, '/:id');
    return `${method}:${normalizedPath}`;
  }

  /**
   * Generates a hash for request identification
   */
  private generateHash(
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
   * Calculates similarity between two objects
   */
  private calculateSimilarity(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): number {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const allKeys = new Set([...keysA, ...keysB]);

    if (allKeys.size === 0) return 1.0;

    let matches = 0;
    for (const key of allKeys) {
      if (key in a && key in b) {
        if (JSON.stringify(a[key]) === JSON.stringify(b[key])) {
          matches++;
        } else {
          matches += 0.5; // Partial match for same key
        }
      }
    }

    return matches / allKeys.size;
  }

  /**
   * Resets used recordings
   */
  reset(): void {
    this.usedRecordings.clear();
  }

  /**
   * Gets unused recordings
   */
  getUnusedRecordings(): RecordedOperation[] {
    const unused: RecordedOperation[] = [];
    for (const recordings of this.recordings.values()) {
      for (const recording of recordings) {
        if (!this.usedRecordings.has(recording.id)) {
          unused.push(recording);
        }
      }
    }
    return unused;
  }

  /**
   * Gets statistics about replay usage
   */
  getStats(): { total: number; used: number; unused: number } {
    let total = 0;
    for (const recordings of this.recordings.values()) {
      total += recordings.length;
    }
    return {
      total,
      used: this.usedRecordings.size,
      unused: total - this.usedRecordings.size,
    };
  }
}

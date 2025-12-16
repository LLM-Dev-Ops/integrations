/**
 * Request replaying for simulation.
 * @module simulation/replayer
 */

import { readFileSync, existsSync } from 'fs';
import { GhcrError, GhcrErrorKind } from '../errors.js';
import type { RecordingEntry, RecordedRequest, RecordedResponse } from './recorder.js';

/**
 * Match options for finding recorded responses.
 */
export interface MatchOptions {
  /** Whether to match URL exactly or by pattern */
  readonly exactUrl?: boolean;
  /** Whether to require headers to match */
  readonly matchHeaders?: boolean;
  /** Headers to ignore when matching */
  readonly ignoreHeaders?: readonly string[];
}

/**
 * Request replayer for simulating HTTP responses.
 */
export class RequestReplayer {
  private readonly entries: RecordingEntry[];
  private readonly usedEntries: Set<string> = new Set();
  private readonly matchOptions: MatchOptions;

  constructor(filePath: string, options?: MatchOptions) {
    if (!existsSync(filePath)) {
      throw new GhcrError(
        GhcrErrorKind.SimulationNotFound,
        `Simulation file not found: ${filePath}`
      );
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      this.entries = JSON.parse(content) as RecordingEntry[];
    } catch (error) {
      throw new GhcrError(
        GhcrErrorKind.SimulationNotFound,
        `Failed to parse simulation file: ${(error as Error).message}`,
        { cause: error as Error }
      );
    }

    this.matchOptions = {
      exactUrl: false,
      matchHeaders: false,
      ignoreHeaders: ['authorization', 'user-agent', 'date', 'x-request-id'],
      ...options,
    };
  }

  /**
   * Finds a matching response for a request.
   */
  findResponse(
    method: string,
    url: string,
    headers?: Record<string, string>
  ): RecordedResponse | null {
    for (const entry of this.entries) {
      // Skip already used entries
      if (this.usedEntries.has(entry.request.id)) {
        continue;
      }

      if (this.matches(entry.request, method, url, headers)) {
        this.usedEntries.add(entry.request.id);
        return entry.response;
      }
    }

    return null;
  }

  /**
   * Gets a response, throwing if not found.
   */
  getResponse(
    method: string,
    url: string,
    headers?: Record<string, string>
  ): RecordedResponse {
    const response = this.findResponse(method, url, headers);

    if (!response) {
      throw new GhcrError(
        GhcrErrorKind.SimulationMismatch,
        `No matching simulation entry for ${method} ${url}`
      );
    }

    return response;
  }

  /**
   * Resets used entries, allowing them to be matched again.
   */
  reset(): void {
    this.usedEntries.clear();
  }

  /**
   * Gets statistics about the simulation.
   */
  getStats(): {
    total: number;
    used: number;
    remaining: number;
  } {
    return {
      total: this.entries.length,
      used: this.usedEntries.size,
      remaining: this.entries.length - this.usedEntries.size,
    };
  }

  /**
   * Checks if a request matches a recorded request.
   */
  private matches(
    recorded: RecordedRequest,
    method: string,
    url: string,
    headers?: Record<string, string>
  ): boolean {
    // Method must match
    if (recorded.method !== method) {
      return false;
    }

    // URL matching
    if (this.matchOptions.exactUrl) {
      if (recorded.url !== url) {
        return false;
      }
    } else {
      // Pattern matching - compare path and query params
      if (!this.urlMatches(recorded.url, url)) {
        return false;
      }
    }

    // Header matching
    if (this.matchOptions.matchHeaders && headers) {
      if (!this.headersMatch(recorded.headers, headers)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if URLs match (path and query params).
   */
  private urlMatches(recorded: string, actual: string): boolean {
    try {
      const recordedUrl = new URL(recorded, 'https://ghcr.io');
      const actualUrl = new URL(actual, 'https://ghcr.io');

      // Path must match
      if (recordedUrl.pathname !== actualUrl.pathname) {
        return false;
      }

      // Query params should be similar (actual can have more)
      for (const [key, value] of recordedUrl.searchParams) {
        if (actualUrl.searchParams.get(key) !== value) {
          return false;
        }
      }

      return true;
    } catch {
      // Fallback to string comparison
      return recorded === actual;
    }
  }

  /**
   * Checks if headers match.
   */
  private headersMatch(
    recorded: Readonly<Record<string, string>>,
    actual: Record<string, string>
  ): boolean {
    const ignoreSet = new Set(
      this.matchOptions.ignoreHeaders?.map(h => h.toLowerCase()) ?? []
    );

    for (const [key, value] of Object.entries(recorded)) {
      const lowerKey = key.toLowerCase();

      if (ignoreSet.has(lowerKey)) {
        continue;
      }

      if (value === '[REDACTED]') {
        continue;
      }

      const actualValue = actual[key] ?? actual[key.toLowerCase()];
      if (actualValue !== value) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Creates a mock Response from a recorded response.
 */
export function createMockResponse(recorded: RecordedResponse): Response {
  const headers = new Headers();

  for (const [key, value] of Object.entries(recorded.headers)) {
    headers.set(key, value);
  }

  return new Response(recorded.body, {
    status: recorded.status,
    headers,
  });
}

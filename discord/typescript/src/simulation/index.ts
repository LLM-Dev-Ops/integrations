/**
 * Simulation layer for recording and replaying Discord API interactions.
 *
 * Enables deterministic testing without making real API calls.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { SimulationMode } from '../config/index.js';
import { SimulationNoMatchError, SimulationLoadError } from '../errors/index.js';
import { generateMockSnowflake } from '../types/index.js';

/**
 * Serialized HTTP request.
 */
export interface SerializedRequest {
  /** HTTP method */
  method: string;
  /** Request URL (path portion only) */
  url: string;
  /** Request headers (normalized) */
  headers: Record<string, string>;
  /** SHA256 hash of request body */
  bodyHash?: string;
  /** Original body (for debugging, may be redacted) */
  body?: unknown;
}

/**
 * Serialized HTTP response.
 */
export interface SerializedResponse {
  /** HTTP status code */
  status: number;
  /** Status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: unknown;
}

/**
 * Recorded API interaction.
 */
export interface RecordedInteraction {
  /** Unique ID for this interaction */
  id: string;
  /** Timestamp when recorded */
  timestamp: string;
  /** Operation identifier (e.g., "webhook:execute", "message:send") */
  operation: string;
  /** Serialized request */
  request: SerializedRequest;
  /** Serialized response */
  response: SerializedResponse;
  /** Duration in milliseconds */
  durationMs: number;
  /** Rate limit info from headers */
  rateLimit?: {
    bucket?: string;
    remaining?: number;
    resetAfter?: number;
  };
}

/**
 * Simulation file format.
 */
export interface SimulationFile {
  /** Format version */
  version: string;
  /** Creation timestamp */
  created: string;
  /** Discord API version */
  discordApiVersion: string;
  /** Recorded interactions */
  interactions: RecordedInteraction[];
}

/**
 * Replay matching mode.
 */
export type MatchingMode = 'exact' | 'operation' | 'relaxed';

/**
 * Headers to skip when normalizing requests.
 */
const SKIP_HEADERS = new Set([
  'authorization',
  'x-ratelimit-bucket',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-reset-after',
  'date',
  'x-request-id',
]);

/**
 * Simulation recorder for capturing API interactions.
 */
export class SimulationRecorder {
  private interactions: RecordedInteraction[] = [];

  /**
   * Records an interaction.
   */
  record(
    operation: string,
    request: {
      method: string;
      url: string;
      headers: Headers;
      body?: unknown;
    },
    response: {
      status: number;
      statusText: string;
      headers: Headers;
      body: unknown;
    },
    durationMs: number
  ): void {
    const serializedRequest = this.serializeRequest(request);
    const serializedResponse = this.serializeResponse(response);

    const interaction: RecordedInteraction = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      operation,
      request: serializedRequest,
      response: serializedResponse,
      durationMs,
      rateLimit: this.extractRateLimitInfo(response.headers),
    };

    this.interactions.push(interaction);
  }

  /**
   * Gets all recorded interactions.
   */
  getInteractions(): RecordedInteraction[] {
    return [...this.interactions];
  }

  /**
   * Clears all recorded interactions.
   */
  clear(): void {
    this.interactions = [];
  }

  /**
   * Exports recordings as a SimulationFile.
   */
  export(): SimulationFile {
    return {
      version: '1.0',
      created: new Date().toISOString(),
      discordApiVersion: '10',
      interactions: this.getInteractions(),
    };
  }

  /**
   * Exports recordings to JSON string.
   */
  exportJson(): string {
    return JSON.stringify(this.export(), null, 2);
  }

  /**
   * Saves recordings to a file.
   */
  async saveToFile(path: string): Promise<void> {
    const json = this.exportJson();
    await fs.promises.writeFile(path, json, 'utf-8');
  }

  private serializeRequest(request: {
    method: string;
    url: string;
    headers: Headers;
    body?: unknown;
  }): SerializedRequest {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (!SKIP_HEADERS.has(key.toLowerCase())) {
        headers[key.toLowerCase()] = value;
      }
    });

    const result: SerializedRequest = {
      method: request.method,
      url: this.normalizeUrl(request.url),
      headers,
    };

    if (request.body !== undefined) {
      const bodyStr =
        typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body);
      result.bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
      result.body = this.redactSensitiveFields(request.body);
    }

    return result;
  }

  private serializeResponse(response: {
    status: number;
    statusText: string;
    headers: Headers;
    body: unknown;
  }): SerializedResponse {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: response.body,
    };
  }

  private normalizeUrl(url: string): string {
    // Remove base URL, keep just the path and query
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  }

  private extractRateLimitInfo(
    headers: Headers
  ): RecordedInteraction['rateLimit'] | undefined {
    const bucket = headers.get('X-RateLimit-Bucket');
    const remaining = headers.get('X-RateLimit-Remaining');
    const resetAfter = headers.get('X-RateLimit-Reset-After');

    if (!bucket && !remaining && !resetAfter) {
      return undefined;
    }

    return {
      bucket: bucket ?? undefined,
      remaining: remaining ? parseInt(remaining, 10) : undefined,
      resetAfter: resetAfter ? parseFloat(resetAfter) : undefined,
    };
  }

  private redactSensitiveFields(body: unknown): unknown {
    if (typeof body !== 'object' || body === null) {
      return body;
    }

    if (Array.isArray(body)) {
      return body.map((item) => this.redactSensitiveFields(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (['token', 'secret', 'password', 'authorization'].includes(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactSensitiveFields(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}

/**
 * Simulation replayer for playing back recorded interactions.
 */
export class SimulationReplayer {
  private readonly interactions: RecordedInteraction[];
  private readonly usedIndices: Set<number> = new Set();
  private matchingMode: MatchingMode = 'operation';

  constructor(interactions: RecordedInteraction[]) {
    this.interactions = interactions;
  }

  /**
   * Loads recordings from a file.
   */
  static async fromFile(path: string): Promise<SimulationReplayer> {
    try {
      const content = await fs.promises.readFile(path, 'utf-8');
      const file: SimulationFile = JSON.parse(content);
      return new SimulationReplayer(file.interactions);
    } catch (error) {
      throw new SimulationLoadError(
        path,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Loads recordings from a JSON string.
   */
  static fromJson(json: string): SimulationReplayer {
    const file: SimulationFile = JSON.parse(json);
    return new SimulationReplayer(file.interactions);
  }

  /**
   * Sets the matching mode.
   */
  setMatchingMode(mode: MatchingMode): void {
    this.matchingMode = mode;
  }

  /**
   * Finds a matching recorded interaction for a request.
   */
  findMatch(
    operation: string,
    request: {
      method: string;
      url: string;
      headers: Headers;
      body?: unknown;
    }
  ): RecordedInteraction | undefined {
    const bodyHash = request.body
      ? crypto
          .createHash('sha256')
          .update(
            typeof request.body === 'string'
              ? request.body
              : JSON.stringify(request.body)
          )
          .digest('hex')
      : undefined;

    for (let i = 0; i < this.interactions.length; i++) {
      if (this.usedIndices.has(i)) continue;

      const interaction = this.interactions[i];
      if (this.isMatch(interaction, operation, request.method, request.url, bodyHash)) {
        this.usedIndices.add(i);
        return interaction;
      }
    }

    return undefined;
  }

  /**
   * Replays a response for a request.
   */
  replay(
    operation: string,
    request: {
      method: string;
      url: string;
      headers: Headers;
      body?: unknown;
    }
  ): SerializedResponse {
    const match = this.findMatch(operation, request);
    if (!match) {
      const key = this.generateMatchKey(operation, request.method, request.url);
      throw new SimulationNoMatchError(key);
    }

    // Generate fresh Snowflake IDs in the response
    return this.refreshResponse(match.response);
  }

  /**
   * Gets the number of remaining (unused) interactions.
   */
  getRemainingCount(): number {
    return this.interactions.length - this.usedIndices.size;
  }

  /**
   * Resets replay state (allows interactions to be reused).
   */
  reset(): void {
    this.usedIndices.clear();
  }

  private isMatch(
    interaction: RecordedInteraction,
    operation: string,
    method: string,
    url: string,
    bodyHash?: string
  ): boolean {
    switch (this.matchingMode) {
      case 'exact':
        return (
          interaction.operation === operation &&
          interaction.request.method === method &&
          this.normalizeUrl(url) === interaction.request.url &&
          (bodyHash === undefined || interaction.request.bodyHash === bodyHash)
        );

      case 'operation':
        return (
          interaction.operation === operation &&
          interaction.request.method === method
        );

      case 'relaxed':
        return interaction.operation === operation;

      default:
        return false;
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  }

  private generateMatchKey(operation: string, method: string, url: string): string {
    return `${operation}:${method}:${this.normalizeUrl(url)}`;
  }

  private refreshResponse(response: SerializedResponse): SerializedResponse {
    // Deep clone the response
    const refreshed: SerializedResponse = JSON.parse(JSON.stringify(response));

    // Replace Snowflake IDs with fresh ones
    refreshed.body = this.refreshSnowflakes(refreshed.body);

    return refreshed;
  }

  private refreshSnowflakes(value: unknown): unknown {
    if (typeof value === 'string' && /^\d{17,20}$/.test(value)) {
      // Looks like a Snowflake, generate a new one
      return generateMockSnowflake();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.refreshSnowflakes(item));
    }

    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        // Refresh known ID fields
        if (['id', 'channel_id', 'guild_id', 'message_id', 'webhook_id'].includes(key)) {
          result[key] = this.refreshSnowflakes(val);
        } else {
          result[key] = this.refreshSnowflakes(val);
        }
      }
      return result;
    }

    return value;
  }
}

/**
 * Simulation layer combining recording and replay.
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private recorder?: SimulationRecorder;
  private replayer?: SimulationReplayer;

  constructor(mode: SimulationMode) {
    this.mode = mode;

    if (mode.type === 'recording') {
      this.recorder = new SimulationRecorder();
    }
  }

  /**
   * Initializes the simulation layer (loads replay data if needed).
   */
  async initialize(): Promise<void> {
    if (this.mode.type === 'replay') {
      this.replayer = await SimulationReplayer.fromFile(this.mode.path);
    }
  }

  /**
   * Checks if simulation is in replay mode.
   */
  isReplay(): boolean {
    return this.mode.type === 'replay';
  }

  /**
   * Checks if simulation is in recording mode.
   */
  isRecording(): boolean {
    return this.mode.type === 'recording';
  }

  /**
   * Checks if simulation is disabled.
   */
  isDisabled(): boolean {
    return this.mode.type === 'disabled';
  }

  /**
   * Records an interaction (only in recording mode).
   */
  record(
    operation: string,
    request: {
      method: string;
      url: string;
      headers: Headers;
      body?: unknown;
    },
    response: {
      status: number;
      statusText: string;
      headers: Headers;
      body: unknown;
    },
    durationMs: number
  ): void {
    if (this.recorder) {
      this.recorder.record(operation, request, response, durationMs);
    }
  }

  /**
   * Replays a response (only in replay mode).
   */
  replay(
    operation: string,
    request: {
      method: string;
      url: string;
      headers: Headers;
      body?: unknown;
    }
  ): SerializedResponse | undefined {
    if (this.replayer) {
      return this.replayer.replay(operation, request);
    }
    return undefined;
  }

  /**
   * Saves recordings to file (only in recording mode).
   */
  async save(): Promise<void> {
    if (this.mode.type === 'recording' && this.recorder) {
      await this.recorder.saveToFile(this.mode.path);
    }
  }

  /**
   * Gets the recorder (for testing).
   */
  getRecorder(): SimulationRecorder | undefined {
    return this.recorder;
  }

  /**
   * Gets the replayer (for testing).
   */
  getReplayer(): SimulationReplayer | undefined {
    return this.replayer;
  }
}

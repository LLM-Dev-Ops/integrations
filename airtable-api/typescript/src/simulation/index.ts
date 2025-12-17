/**
 * Airtable API simulation layer for record/replay testing.
 *
 * Provides recording and replay capabilities for HTTP interactions, enabling
 * deterministic testing without making actual API calls. Includes webhook
 * simulation for testing webhook handlers.
 */

import { readFile, writeFile } from 'fs/promises';
import * as crypto from 'crypto';
import { SimulationMode } from '../config/index.js';
import {
  SimulationNotInReplayError,
  SimulationExhaustedError,
  SimulationMismatchError,
} from '../errors/index.js';
import type { WebhookPayload } from '../types/index.js';

// Re-export WebhookPayload for use by consumers
export type { WebhookPayload } from '../types/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Recorded HTTP request.
 */
export interface RecordedRequest {
  /** HTTP method (GET, POST, PUT, PATCH, DELETE) */
  method: string;
  /** Request path (e.g., "/appXXX/tblYYY") */
  path: string;
  /** Query parameters */
  query?: Record<string, string>;
  /** Request body */
  body?: unknown;
  /** Request headers */
  headers?: Record<string, string>;
}

/**
 * Recorded HTTP response.
 */
export interface RecordedResponse {
  /** HTTP status code */
  status: number;
  /** Response body */
  body?: unknown;
  /** Response headers */
  headers?: Record<string, string>;
}

/**
 * Recorded request/response interaction.
 */
export interface RecordedInteraction {
  /** The recorded request */
  request: RecordedRequest;
  /** The recorded response */
  response: RecordedResponse;
  /** ISO 8601 timestamp of the interaction */
  timestamp: string;
}

/**
 * Simulation session containing multiple recorded interactions.
 */
export interface SimulationSession {
  /** Unique session identifier */
  id: string;
  /** Array of recorded interactions */
  interactions: RecordedInteraction[];
  /** Optional metadata about the session */
  metadata?: Record<string, unknown>;
}

/**
 * Request options for simulation client.
 */
export interface RequestOptions {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Query parameters */
  query?: Record<string, string>;
  /** Request body */
  body?: unknown;
  /** Request headers */
  headers?: Record<string, string>;
}

/**
 * Response from simulation client.
 */
export interface Response {
  /** HTTP status code */
  status: number;
  /** Response body */
  body?: unknown;
  /** Response headers */
  headers?: Record<string, string>;
}

// ============================================================================
// InteractionRecorder Class
// ============================================================================

/**
 * Records HTTP interactions for later replay.
 *
 * The recorder captures request/response pairs during normal operation,
 * storing them in a session that can be saved to disk for replay testing.
 *
 * @example
 * ```typescript
 * const recorder = new InteractionRecorder('test-session-1');
 * recorder.record(
 *   { method: 'GET', path: '/appXXX/tblYYY' },
 *   { status: 200, body: { records: [] } }
 * );
 * await recorder.save('./fixtures/test-session-1.json');
 * ```
 */
export class InteractionRecorder {
  private readonly sessionId: string;
  private readonly interactions: RecordedInteraction[] = [];
  private metadata: Record<string, unknown> = {};

  /**
   * Creates a new interaction recorder.
   *
   * @param sessionId - Optional session identifier. If not provided, a UUID will be generated.
   */
  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? crypto.randomUUID();
  }

  /**
   * Records a request/response interaction.
   *
   * @param request - The HTTP request to record
   * @param response - The HTTP response to record
   */
  record(request: RecordedRequest, response: RecordedResponse): void {
    this.interactions.push({
      request: {
        method: request.method,
        path: request.path,
        query: request.query ? { ...request.query } : undefined,
        body: request.body ? this.deepCopy(request.body) : undefined,
        headers: request.headers ? { ...request.headers } : undefined,
      },
      response: {
        status: response.status,
        body: response.body ? this.deepCopy(response.body) : undefined,
        headers: response.headers ? { ...response.headers } : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Gets the current simulation session.
   *
   * @returns The simulation session with all recorded interactions
   */
  getSession(): SimulationSession {
    return {
      id: this.sessionId,
      interactions: this.interactions.map((interaction) => ({
        request: {
          method: interaction.request.method,
          path: interaction.request.path,
          query: interaction.request.query ? { ...interaction.request.query } : undefined,
          body: interaction.request.body ? this.deepCopy(interaction.request.body) : undefined,
          headers: interaction.request.headers ? { ...interaction.request.headers } : undefined,
        },
        response: {
          status: interaction.response.status,
          body: interaction.response.body ? this.deepCopy(interaction.response.body) : undefined,
          headers: interaction.response.headers
            ? { ...interaction.response.headers }
            : undefined,
        },
        timestamp: interaction.timestamp,
      })),
      metadata: { ...this.metadata },
    };
  }

  /**
   * Saves the session to a JSON file.
   *
   * @param filePath - Path to save the session file
   */
  async save(filePath: string): Promise<void> {
    const session = this.getSession();
    const json = JSON.stringify(session, null, 2);
    await writeFile(filePath, json, 'utf-8');
  }

  /**
   * Clears all recorded interactions.
   */
  clear(): void {
    this.interactions.length = 0;
    this.metadata = {};
  }

  /**
   * Sets metadata for the session.
   *
   * @param key - Metadata key
   * @param value - Metadata value
   */
  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  /**
   * Deep copies an object to avoid reference issues.
   *
   * @param obj - Object to copy
   * @returns Deep copy of the object
   */
  private deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

// ============================================================================
// InteractionReplayer Class
// ============================================================================

/**
 * Replays recorded HTTP interactions for testing.
 *
 * The replayer matches incoming requests against recorded interactions,
 * returning the recorded response. Supports sequential matching and
 * fuzzy matching for dynamic IDs.
 *
 * @example
 * ```typescript
 * const replayer = await InteractionReplayer.load('./fixtures/test-session-1.json');
 * const response = replayer.match({
 *   method: 'GET',
 *   path: '/appXXX/tblYYY'
 * });
 * ```
 */
export class InteractionReplayer {
  private readonly session: SimulationSession;
  private readonly interactions: RecordedInteraction[];
  private matchedCount = 0;

  /**
   * Creates a new interaction replayer.
   *
   * @param session - The simulation session to replay
   */
  constructor(session: SimulationSession) {
    this.session = session;
    // Create a copy so we can remove matched interactions
    this.interactions = [...session.interactions];
  }

  /**
   * Loads a simulation session from a JSON file.
   *
   * @param filePath - Path to the session file
   * @returns A new InteractionReplayer instance
   */
  static async load(filePath: string): Promise<InteractionReplayer> {
    const json = await readFile(filePath, 'utf-8');
    const session = JSON.parse(json) as SimulationSession;
    return new InteractionReplayer(session);
  }

  /**
   * Matches a request against recorded interactions.
   *
   * Uses sequential matching: finds the first matching interaction,
   * returns its response, and removes it from the queue.
   *
   * @param request - The request to match
   * @returns The recorded response, or null if no match found
   */
  match(request: RecordedRequest): RecordedResponse | null {
    const index = this.interactions.findIndex((interaction) =>
      this.matchesRequest(interaction.request, request)
    );

    if (index === -1) {
      return null;
    }

    // Remove the matched interaction and return its response
    const [matched] = this.interactions.splice(index, 1);
    this.matchedCount++;
    return matched.response;
  }

  /**
   * Checks if there are more interactions available.
   *
   * @returns True if there are unmatched interactions
   */
  hasMoreInteractions(): boolean {
    return this.interactions.length > 0;
  }

  /**
   * Gets the number of matched interactions.
   *
   * @returns Count of matched interactions
   */
  getMatchedCount(): number {
    return this.matchedCount;
  }

  /**
   * Gets the number of remaining unmatched interactions.
   *
   * @returns Count of remaining interactions
   */
  getRemainingCount(): number {
    return this.interactions.length;
  }

  /**
   * Gets the session metadata.
   *
   * @returns Session metadata
   */
  getMetadata(): Record<string, unknown> | undefined {
    return this.session.metadata;
  }

  /**
   * Checks if a request matches a recorded request.
   *
   * Performs exact matching on method and path, with optional
   * fuzzy matching for dynamic IDs (e.g., "recXXX", "appXXX").
   *
   * @param recorded - The recorded request
   * @param incoming - The incoming request to match
   * @returns True if the requests match
   */
  private matchesRequest(recorded: RecordedRequest, incoming: RecordedRequest): boolean {
    // Method must match exactly
    if (recorded.method !== incoming.method) {
      return false;
    }

    // Path matching with fuzzy ID support
    if (!this.pathsMatch(recorded.path, incoming.path)) {
      return false;
    }

    // Query parameters (if recorded request had query params, they should match)
    if (recorded.query && !this.queryParamsMatch(recorded.query, incoming.query)) {
      return false;
    }

    return true;
  }

  /**
   * Checks if two paths match, with support for dynamic ID placeholders.
   *
   * Supports fuzzy matching for Airtable IDs:
   * - appXXXXXXXXXXXXXX (base IDs)
   * - tblXXXXXXXXXXXXXX (table IDs)
   * - recXXXXXXXXXXXXXX (record IDs)
   * - fldXXXXXXXXXXXXXX (field IDs)
   * - viwXXXXXXXXXXXXXX (view IDs)
   *
   * @param recorded - The recorded path
   * @param incoming - The incoming path
   * @returns True if paths match
   */
  private pathsMatch(recorded: string, incoming: string): boolean {
    // Exact match first
    if (recorded === incoming) {
      return true;
    }

    // Fuzzy match for dynamic IDs
    const recordedParts = recorded.split('/');
    const incomingParts = incoming.split('/');

    if (recordedParts.length !== incomingParts.length) {
      return false;
    }

    for (let i = 0; i < recordedParts.length; i++) {
      const recordedPart = recordedParts[i];
      const incomingPart = incomingParts[i];

      // Check if this part looks like an Airtable ID
      if (this.isAirtableId(recordedPart) && this.isAirtableId(incomingPart)) {
        // Both are IDs - check if they have the same prefix
        const recordedPrefix = recordedPart.substring(0, 3);
        const incomingPrefix = incomingPart.substring(0, 3);
        if (recordedPrefix !== incomingPrefix) {
          return false;
        }
        // Same prefix, consider it a match
        continue;
      }

      // Not an ID, must match exactly
      if (recordedPart !== incomingPart) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if a string looks like an Airtable ID.
   *
   * @param str - String to check
   * @returns True if string matches Airtable ID pattern
   */
  private isAirtableId(str: string): boolean {
    const prefixes = ['app', 'tbl', 'rec', 'fld', 'viw'];
    return (
      str.length === 17 &&
      prefixes.some((prefix) => str.startsWith(prefix)) &&
      /^[a-zA-Z0-9]+$/.test(str)
    );
  }

  /**
   * Checks if query parameters match.
   *
   * @param recorded - Recorded query parameters
   * @param incoming - Incoming query parameters
   * @returns True if query parameters match
   */
  private queryParamsMatch(
    recorded: Record<string, string>,
    incoming: Record<string, string> | undefined
  ): boolean {
    if (!incoming) {
      return Object.keys(recorded).length === 0;
    }

    // All recorded query params must be present in incoming request
    for (const [key, value] of Object.entries(recorded)) {
      if (incoming[key] !== value) {
        return false;
      }
    }

    return true;
  }
}

// ============================================================================
// SimulationClient Class
// ============================================================================

/**
 * HTTP client wrapper that supports record/replay simulation modes.
 *
 * In Record mode, requests are passed through to a real client and
 * recorded for later replay. In Replay mode, requests are matched
 * against recorded interactions and return canned responses.
 *
 * @example
 * ```typescript
 * // Record mode
 * const recorder = createRecorder('my-test');
 * const client = new SimulationClient(
 *   SimulationMode.Record,
 *   recorder
 * );
 *
 * // Replay mode
 * const replayer = await loadReplayer('./fixtures/my-test.json');
 * const client = new SimulationClient(
 *   SimulationMode.Replay,
 *   undefined,
 *   replayer
 * );
 * ```
 */
export class SimulationClient {
  private readonly mode: SimulationMode;
  private readonly recorder?: InteractionRecorder;
  private readonly replayer?: InteractionReplayer;
  private realClientExecutor?: (options: RequestOptions) => Promise<Response>;

  /**
   * Creates a new simulation client.
   *
   * @param mode - Simulation mode (Disabled, Record, or Replay)
   * @param recorder - Optional recorder for Record mode
   * @param replayer - Optional replayer for Replay mode
   */
  constructor(
    mode: SimulationMode,
    recorder?: InteractionRecorder,
    replayer?: InteractionReplayer
  ) {
    this.mode = mode;
    this.recorder = recorder;
    this.replayer = replayer;
  }

  /**
   * Sets the real client executor for pass-through in Record mode.
   *
   * @param executor - Function that executes real HTTP requests
   */
  setRealClientExecutor(executor: (options: RequestOptions) => Promise<Response>): void {
    this.realClientExecutor = executor;
  }

  /**
   * Executes a request according to the simulation mode.
   *
   * - Disabled mode: Passes through to real client
   * - Record mode: Passes through to real client and records interaction
   * - Replay mode: Matches request and returns recorded response
   *
   * @param options - Request options
   * @returns Response (either from real client or recorded)
   * @throws SimulationNotInReplayError if in Replay mode without replayer
   * @throws SimulationExhaustedError if no matching interaction found in Replay mode
   */
  async executeRequest(options: RequestOptions): Promise<Response> {
    switch (this.mode) {
      case SimulationMode.Disabled:
        return this.executeRealRequest(options);

      case SimulationMode.Record:
        return this.executeAndRecord(options);

      case SimulationMode.Replay:
        return this.executeFromReplay(options);

      default:
        // Should never happen, but TypeScript exhaustiveness check
        return this.executeRealRequest(options);
    }
  }

  /**
   * Gets the recorder instance (if in Record mode).
   *
   * @returns The recorder, or undefined
   */
  getRecorder(): InteractionRecorder | undefined {
    return this.recorder;
  }

  /**
   * Gets the replayer instance (if in Replay mode).
   *
   * @returns The replayer, or undefined
   */
  getReplayer(): InteractionReplayer | undefined {
    return this.replayer;
  }

  /**
   * Executes a real HTTP request.
   *
   * @param options - Request options
   * @returns Response from real client
   */
  private async executeRealRequest(options: RequestOptions): Promise<Response> {
    if (!this.realClientExecutor) {
      throw new Error('Real client executor not set');
    }
    return this.realClientExecutor(options);
  }

  /**
   * Executes a real request and records the interaction.
   *
   * @param options - Request options
   * @returns Response from real client
   */
  private async executeAndRecord(options: RequestOptions): Promise<Response> {
    const response = await this.executeRealRequest(options);

    if (this.recorder) {
      this.recorder.record(
        {
          method: options.method,
          path: options.path,
          query: options.query,
          body: options.body,
          headers: options.headers,
        },
        {
          status: response.status,
          body: response.body,
          headers: response.headers,
        }
      );
    }

    return response;
  }

  /**
   * Executes a request from recorded interactions.
   *
   * @param options - Request options
   * @returns Recorded response
   * @throws SimulationNotInReplayError if replayer not configured
   * @throws SimulationExhaustedError if no matching interaction found
   */
  private executeFromReplay(options: RequestOptions): Promise<Response> {
    if (!this.replayer) {
      throw new SimulationNotInReplayError();
    }

    const recordedResponse = this.replayer.match({
      method: options.method,
      path: options.path,
      query: options.query,
      body: options.body,
      headers: options.headers,
    });

    if (!recordedResponse) {
      throw new SimulationExhaustedError();
    }

    return Promise.resolve({
      status: recordedResponse.status,
      body: recordedResponse.body,
      headers: recordedResponse.headers,
    });
  }
}

// ============================================================================
// WebhookSimulator Class
// ============================================================================

/**
 * Simulates Airtable webhook payloads with fake signatures for testing.
 *
 * Generates webhook payloads with HMAC signatures that can be used to test
 * webhook validation logic without requiring real Airtable webhooks.
 *
 * @example
 * ```typescript
 * const simulator = new WebhookSimulator();
 * const payload: WebhookPayload = {
 *   base: { id: 'appXXX' },
 *   webhook: { id: 'webhook-123' },
 *   timestamp: new Date().toISOString(),
 *   changeType: 'recordCreated',
 * };
 * const { headers, body } = simulator.simulatePayload('webhook-123', payload);
 * ```
 */
export class WebhookSimulator {
  private readonly secrets: Map<string, string> = new Map();

  /**
   * Creates a new webhook simulator.
   */
  constructor() {
    // Initialize with default test secrets if needed
  }

  /**
   * Registers a webhook secret for signature generation.
   *
   * @param webhookId - Webhook identifier
   * @param secret - Webhook secret key
   */
  registerSecret(webhookId: string, secret: string): void {
    this.secrets.set(webhookId, secret);
  }

  /**
   * Simulates a webhook payload with signature.
   *
   * Generates headers including X-Airtable-Content-MAC signature
   * for testing webhook validation.
   *
   * @param webhookId - Webhook identifier
   * @param payload - Webhook payload to simulate
   * @returns Object with headers and body for webhook request
   */
  simulatePayload(
    webhookId: string,
    payload: WebhookPayload
  ): { headers: Record<string, string>; body: string } {
    const body = JSON.stringify(payload);
    const secret = this.secrets.get(webhookId) || 'test-secret';

    // Generate HMAC signature (simulating Airtable's webhook signature)
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body);
    const signature = hmac.digest('hex');

    return {
      headers: {
        'content-type': 'application/json',
        'x-airtable-content-mac': signature,
        'x-airtable-webhook-id': webhookId,
        'user-agent': 'Airtable-Webhooks/1.0',
      },
      body,
    };
  }

  /**
   * Validates a webhook signature.
   *
   * Used for testing webhook validation logic.
   *
   * @param webhookId - Webhook identifier
   * @param body - Webhook payload body
   * @param signature - Signature to validate
   * @returns True if signature is valid
   */
  validateSignature(webhookId: string, body: string, signature: string): boolean {
    const secret = this.secrets.get(webhookId);
    if (!secret) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body);
    const expected = hmac.digest('hex');

    return signature === expected;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new interaction recorder.
 *
 * @param sessionId - Optional session identifier
 * @returns New InteractionRecorder instance
 *
 * @example
 * ```typescript
 * const recorder = createRecorder('my-test-session');
 * ```
 */
export function createRecorder(sessionId?: string): InteractionRecorder {
  return new InteractionRecorder(sessionId);
}

/**
 * Creates a new interaction replayer from a session.
 *
 * @param session - Simulation session to replay
 * @returns New InteractionReplayer instance
 *
 * @example
 * ```typescript
 * const session = { id: 'test', interactions: [] };
 * const replayer = createReplayer(session);
 * ```
 */
export function createReplayer(session: SimulationSession): InteractionReplayer {
  return new InteractionReplayer(session);
}

/**
 * Loads a replayer from a JSON file.
 *
 * @param filePath - Path to the session file
 * @returns Promise resolving to InteractionReplayer instance
 *
 * @example
 * ```typescript
 * const replayer = await loadReplayer('./fixtures/test-session.json');
 * ```
 */
export async function loadReplayer(filePath: string): Promise<InteractionReplayer> {
  return InteractionReplayer.load(filePath);
}

/**
 * Creates a simulation client.
 *
 * @param mode - Simulation mode
 * @param recorder - Optional recorder for Record mode
 * @param replayer - Optional replayer for Replay mode
 * @returns New SimulationClient instance
 *
 * @example
 * ```typescript
 * // Record mode
 * const recorder = createRecorder();
 * const client = createSimulationClient(SimulationMode.Record, recorder);
 *
 * // Replay mode
 * const replayer = await loadReplayer('./fixtures/test.json');
 * const client = createSimulationClient(SimulationMode.Replay, undefined, replayer);
 * ```
 */
export function createSimulationClient(
  mode: SimulationMode,
  recorder?: InteractionRecorder,
  replayer?: InteractionReplayer
): SimulationClient {
  return new SimulationClient(mode, recorder, replayer);
}

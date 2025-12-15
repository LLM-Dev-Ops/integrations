/**
 * Azure Files Simulation Module
 *
 * Provides mock, recording, and replay functionality for testing.
 * Following the SPARC specification for Azure Files integration.
 */

import { createHash } from "crypto";
import { HttpRequest, HttpResponse, HttpTransport } from "../transport/index.js";

/**
 * Serialized HTTP request for recording.
 */
export interface SerializedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyHash?: string;
}

/**
 * Serialized HTTP response for recording.
 */
export interface SerializedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string; // Base64 encoded
}

/**
 * Recorded HTTP interaction.
 */
export interface RecordedInteraction {
  timestamp: string;
  operation: string;
  request: SerializedRequest;
  response: SerializedResponse;
  durationMs: number;
}

/**
 * Simulation file format.
 */
export interface SimulationFile {
  version: "1.0";
  created: string;
  interactions: RecordedInteraction[];
}

/**
 * Matching mode for simulation.
 */
export type MatchingMode = "exact" | "operation" | "relaxed";

/**
 * Hash the body of a request.
 */
function hashBody(body: Buffer | string | undefined): string | undefined {
  if (!body) return undefined;
  const data = typeof body === "string" ? Buffer.from(body) : body;
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Normalize headers for comparison.
 */
function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    // Skip headers that vary between requests
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "x-ms-date" ||
      lowerKey === "x-ms-client-request-id" ||
      lowerKey === "authorization" ||
      lowerKey === "date"
    ) {
      continue;
    }
    normalized[lowerKey] = value;
  }
  return normalized;
}

/**
 * Extract operation name from URL.
 */
function extractOperation(method: string, url: string): string {
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const comp = urlObj.searchParams.get("comp");

  if (comp) {
    return `${method.toLowerCase()}_${comp}`;
  }

  // Infer operation from path structure
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return `${method.toLowerCase()}_root`;
  }
  if (parts.length === 1) {
    return `${method.toLowerCase()}_share`;
  }
  return `${method.toLowerCase()}_file`;
}

/**
 * Recording transport that captures all requests/responses.
 */
export class RecordingTransport implements HttpTransport {
  private transport: HttpTransport;
  private interactions: RecordedInteraction[] = [];

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    const startTime = Date.now();
    const response = await this.transport.send(request);
    const durationMs = Date.now() - startTime;

    const serializedRequest: SerializedRequest = {
      method: request.method,
      url: request.url,
      headers: normalizeHeaders(request.headers),
      bodyHash: hashBody(request.body),
    };

    const serializedResponse: SerializedResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body.toString("base64"),
    };

    this.interactions.push({
      timestamp: new Date().toISOString(),
      operation: extractOperation(request.method, request.url),
      request: serializedRequest,
      response: serializedResponse,
      durationMs,
    });

    return response;
  }

  /**
   * Get all recorded interactions.
   */
  getInteractions(): RecordedInteraction[] {
    return [...this.interactions];
  }

  /**
   * Export recordings as simulation file.
   */
  export(): SimulationFile {
    return {
      version: "1.0",
      created: new Date().toISOString(),
      interactions: this.interactions,
    };
  }

  /**
   * Export as JSON string.
   */
  exportJson(): string {
    return JSON.stringify(this.export(), null, 2);
  }

  /**
   * Clear all recordings.
   */
  clear(): void {
    this.interactions = [];
  }
}

/**
 * Replay transport that returns pre-recorded responses.
 */
export class ReplayTransport implements HttpTransport {
  private interactions: RecordedInteraction[];
  private matchingMode: MatchingMode;
  private usedIndices: Set<number> = new Set();

  constructor(interactions: RecordedInteraction[], matchingMode: MatchingMode = "operation") {
    this.interactions = interactions;
    this.matchingMode = matchingMode;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    const interaction = this.findMatch(request);

    if (!interaction) {
      throw new Error(`No recorded interaction found for ${request.method} ${request.url}`);
    }

    return {
      status: interaction.response.status,
      statusText: interaction.response.statusText,
      headers: interaction.response.headers,
      body: Buffer.from(interaction.response.body, "base64"),
    };
  }

  private findMatch(request: HttpRequest): RecordedInteraction | undefined {
    const normalizedRequestHeaders = normalizeHeaders(request.headers);
    const requestBodyHash = hashBody(request.body);
    const requestOperation = extractOperation(request.method, request.url);

    for (let i = 0; i < this.interactions.length; i++) {
      if (this.usedIndices.has(i)) continue;

      const interaction = this.interactions[i];
      if (!interaction) continue;

      switch (this.matchingMode) {
        case "exact":
          if (
            interaction.request.method === request.method &&
            interaction.request.url === request.url &&
            JSON.stringify(interaction.request.headers) === JSON.stringify(normalizedRequestHeaders) &&
            interaction.request.bodyHash === requestBodyHash
          ) {
            this.usedIndices.add(i);
            return interaction;
          }
          break;

        case "operation":
          if (
            interaction.operation === requestOperation &&
            interaction.request.method === request.method
          ) {
            // Check URL path matches (ignore query params for some operations)
            const interactionPath = new URL(interaction.request.url).pathname;
            const requestPath = new URL(request.url).pathname;
            if (interactionPath === requestPath) {
              this.usedIndices.add(i);
              return interaction;
            }
          }
          break;

        case "relaxed":
          if (interaction.operation === requestOperation) {
            this.usedIndices.add(i);
            return interaction;
          }
          break;
      }
    }

    return undefined;
  }

  /**
   * Reset used indices to allow replaying from start.
   */
  reset(): void {
    this.usedIndices.clear();
  }

  /**
   * Get remaining unused interactions.
   */
  getRemainingCount(): number {
    return this.interactions.length - this.usedIndices.size;
  }
}

/**
 * Mock transport that returns configurable responses.
 */
export class MockTransport implements HttpTransport {
  private handlers: Map<string, (request: HttpRequest) => HttpResponse | Promise<HttpResponse>> =
    new Map();
  private defaultHandler?: (request: HttpRequest) => HttpResponse | Promise<HttpResponse>;
  private calls: HttpRequest[] = [];

  /**
   * Register a handler for a specific method and URL pattern.
   */
  on(
    method: string,
    urlPattern: string | RegExp,
    handler: (request: HttpRequest) => HttpResponse | Promise<HttpResponse>
  ): this {
    const key = `${method}:${urlPattern.toString()}`;
    this.handlers.set(key, handler);
    return this;
  }

  /**
   * Set default handler for unmatched requests.
   */
  onDefault(handler: (request: HttpRequest) => HttpResponse | Promise<HttpResponse>): this {
    this.defaultHandler = handler;
    return this;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);

    // Try to find matching handler
    for (const [key, handler] of this.handlers) {
      const parts = key.split(":", 2);
      const method = parts[0];
      const pattern = parts[1] ?? "";
      if (method !== request.method) continue;

      if (pattern.startsWith("/") && pattern.endsWith("/")) {
        // Regex pattern
        const regex = new RegExp(pattern.slice(1, -1));
        if (regex.test(request.url)) {
          return handler(request);
        }
      } else if (pattern) {
        // Exact match or contains
        if (request.url.includes(pattern)) {
          return handler(request);
        }
      }
    }

    // Use default handler
    if (this.defaultHandler) {
      return this.defaultHandler(request);
    }

    // Return 404 by default
    return {
      status: 404,
      statusText: "Not Found",
      headers: {},
      body: Buffer.from(""),
    };
  }

  /**
   * Get all requests that were sent.
   */
  getCalls(): HttpRequest[] {
    return [...this.calls];
  }

  /**
   * Clear all handlers and calls.
   */
  clear(): void {
    this.handlers.clear();
    this.defaultHandler = undefined;
    this.calls = [];
  }
}

/**
 * Create success response helper.
 */
export function createSuccessResponse(
  body: Buffer | string = "",
  headers: Record<string, string> = {}
): HttpResponse {
  return {
    status: 200,
    statusText: "OK",
    headers,
    body: typeof body === "string" ? Buffer.from(body) : body,
  };
}

/**
 * Create error response helper.
 */
export function createErrorResponse(
  status: number,
  message: string,
  code?: string
): HttpResponse {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<Error>
  <Code>${code ?? "UnknownError"}</Code>
  <Message>${message}</Message>
</Error>`;

  return {
    status,
    statusText: message,
    headers: { "content-type": "application/xml" },
    body: Buffer.from(body),
  };
}

/**
 * Create file info response for mock.
 */
export function createFileInfoResponse(
  size: number,
  etag: string = `"${Date.now()}"`,
  contentType: string = "application/octet-stream"
): HttpResponse {
  return {
    status: 201,
    statusText: "Created",
    headers: {
      etag,
      "last-modified": new Date().toUTCString(),
      "x-ms-content-length": size.toString(),
      "content-type": contentType,
      "x-ms-request-id": `${Date.now()}`,
    },
    body: Buffer.from(""),
  };
}

/**
 * Load simulation file from JSON.
 */
export function loadSimulationFile(json: string): SimulationFile {
  const data = JSON.parse(json);
  if (data.version !== "1.0") {
    throw new Error(`Unsupported simulation file version: ${data.version}`);
  }
  return data as SimulationFile;
}

/**
 * Create a recording transport.
 */
export function createRecordingTransport(transport: HttpTransport): RecordingTransport {
  return new RecordingTransport(transport);
}

/**
 * Create a replay transport.
 */
export function createReplayTransport(
  interactions: RecordedInteraction[],
  matchingMode?: MatchingMode
): ReplayTransport {
  return new ReplayTransport(interactions, matchingMode);
}

/**
 * Create a mock transport.
 */
export function createMockTransport(): MockTransport {
  return new MockTransport();
}

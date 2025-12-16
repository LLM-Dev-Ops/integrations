/**
 * Request recording for simulation/replay.
 * @module simulation/recorder
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Recorded request structure.
 */
export interface RecordedRequest {
  /** Unique request ID */
  readonly id: string;
  /** Request timestamp */
  readonly timestamp: string;
  /** HTTP method */
  readonly method: string;
  /** Request URL */
  readonly url: string;
  /** Request headers (sanitized) */
  readonly headers: Readonly<Record<string, string>>;
  /** Request body hash (not actual content) */
  readonly bodyHash?: string;
}

/**
 * Recorded response structure.
 */
export interface RecordedResponse {
  /** Request ID this is a response to */
  readonly requestId: string;
  /** Response status code */
  readonly status: number;
  /** Response headers */
  readonly headers: Readonly<Record<string, string>>;
  /** Response body */
  readonly body: string;
  /** Response latency in ms */
  readonly latencyMs: number;
}

/**
 * Recording entry.
 */
export interface RecordingEntry {
  readonly request: RecordedRequest;
  readonly response: RecordedResponse;
}

/**
 * Request recorder for capturing HTTP interactions.
 */
export class RequestRecorder {
  private readonly filePath: string;
  private requestCounter = 0;

  constructor(filePath: string) {
    this.filePath = filePath;

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Initialize file with empty array
    if (!existsSync(filePath)) {
      writeFileSync(filePath, '[\n', 'utf-8');
    }
  }

  /**
   * Records a request/response pair.
   */
  record(
    method: string,
    url: string,
    requestHeaders: Record<string, string>,
    responseStatus: number,
    responseHeaders: Headers,
    responseBody: string,
    latencyMs: number,
    bodyHash?: string
  ): void {
    const id = `req-${++this.requestCounter}-${Date.now()}`;

    const entry: RecordingEntry = {
      request: {
        id,
        timestamp: new Date().toISOString(),
        method,
        url,
        headers: this.sanitizeHeaders(requestHeaders),
        bodyHash,
      },
      response: {
        requestId: id,
        status: responseStatus,
        headers: this.headersToObject(responseHeaders),
        body: responseBody,
        latencyMs,
      },
    };

    // Append to file
    const json = JSON.stringify(entry, null, 2);
    const content = this.requestCounter === 1 ? json : `,\n${json}`;
    appendFileSync(this.filePath, content, 'utf-8');
  }

  /**
   * Finalizes the recording file.
   */
  finalize(): void {
    appendFileSync(this.filePath, '\n]\n', 'utf-8');
  }

  /**
   * Sanitizes headers to remove sensitive data.
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();

      // Redact sensitive headers
      if (
        lowerKey === 'authorization' ||
        lowerKey === 'x-auth-token' ||
        lowerKey === 'cookie'
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Converts Headers to a plain object.
   */
  private headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};

    headers.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }
}

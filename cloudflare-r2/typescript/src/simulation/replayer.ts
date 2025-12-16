/**
 * Replay transport for simulating HTTP responses from recordings
 * @module @studiorack/cloudflare-r2/simulation
 */

import type {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  StreamingHttpResponse,
} from '../transport/index.js';
import type { SimulationStore, Recording, ReplayOptions } from './types.js';
import { NetworkError } from '../errors/index.js';
import { matchRequest } from './utils.js';

/**
 * Default headers to ignore when matching requests
 */
const DEFAULT_IGNORE_HEADERS = [
  'x-amz-date',
  'authorization',
  'date',
  'x-amz-content-sha256',
  'user-agent',
];

/**
 * Transport that replays recorded HTTP responses
 *
 * This transport plays back previously recorded interactions,
 * allowing tests to run without actual R2 access.
 *
 * Usage:
 * ```typescript
 * const store = JSON.parse(fs.readFileSync('recordings.json', 'utf-8'));
 * const replayer = new ReplayTransport(store, { strict: true });
 *
 * const client = new R2Client({
 *   transport: replayer,
 *   // ... other config
 * });
 *
 * // Operations will use recorded responses
 * await client.getObject({ bucket: 'test', key: 'file.txt' });
 * ```
 */
export class ReplayTransport implements HttpTransport {
  private recordingIndex = 0;
  private readonly ignoreHeaders: string[];

  constructor(
    private readonly store: SimulationStore,
    private readonly options: ReplayOptions = {}
  ) {
    this.ignoreHeaders = options.ignoreHeaders || DEFAULT_IGNORE_HEADERS;
  }

  /**
   * Send request by finding matching recording
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    // Add artificial latency if configured
    if (this.options.addLatency && this.options.addLatency > 0) {
      await this.delay(this.options.addLatency);
    }

    // Find matching recording
    const recording = this.findMatchingRecording(request);

    if (!recording) {
      if (this.options.strict) {
        throw new NetworkError({
          message: `No matching recording found for ${request.method} ${request.url}`,
          code: 'NO_RECORDING',
          isRetryable: false,
          details: {
            method: request.method,
            url: request.url,
            recordingIndex: this.recordingIndex,
            totalRecordings: this.store.recordings.length,
          },
        });
      }

      // Return 404 if not strict mode
      return {
        status: 404,
        headers: { 'content-type': 'application/xml' },
        body: new TextEncoder().encode(
          '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>Recording not found</Message></Error>'
        ),
      };
    }

    // Return recorded response
    return {
      status: recording.response.status,
      headers: { ...recording.response.headers },
      body: new Uint8Array(recording.response.body),
    };
  }

  /**
   * Send streaming request by finding matching recording
   */
  async sendStreaming(request: HttpRequest): Promise<StreamingHttpResponse> {
    // Add artificial latency if configured
    if (this.options.addLatency && this.options.addLatency > 0) {
      await this.delay(this.options.addLatency);
    }

    // Find matching recording
    const recording = this.findMatchingRecording(request);

    if (!recording) {
      if (this.options.strict) {
        throw new NetworkError({
          message: `No matching recording found for ${request.method} ${request.url}`,
          code: 'NO_RECORDING',
          isRetryable: false,
          details: {
            method: request.method,
            url: request.url,
            recordingIndex: this.recordingIndex,
            totalRecordings: this.store.recordings.length,
          },
        });
      }

      // Return 404 if not strict mode
      const body = new TextEncoder().encode(
        '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>Recording not found</Message></Error>'
      );

      return {
        status: 404,
        headers: { 'content-type': 'application/xml' },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(body);
            controller.close();
          },
        }),
      };
    }

    // Create streaming response from recorded body
    const recordedBody = new Uint8Array(recording.response.body);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(recordedBody);
        controller.close();
      },
    });

    return {
      status: recording.response.status,
      headers: { ...recording.response.headers },
      body: stream,
    };
  }

  /**
   * Close transport (no-op for replay)
   */
  async close(): Promise<void> {
    // No resources to clean up
  }

  /**
   * Reset recording index to start from beginning
   */
  reset(): void {
    this.recordingIndex = 0;
  }

  /**
   * Get current recording index
   */
  getCurrentIndex(): number {
    return this.recordingIndex;
  }

  /**
   * Get total number of recordings
   */
  getTotalRecordings(): number {
    return this.store.recordings.length;
  }

  /**
   * Find a matching recording for the given request
   *
   * Matching strategy:
   * 1. Sequential: Try current index first
   * 2. Search: If not matched and allowPartialMatch, search all recordings
   */
  private findMatchingRecording(request: HttpRequest): Recording | undefined {
    // Try sequential matching first
    if (this.recordingIndex < this.store.recordings.length) {
      const recording = this.store.recordings[this.recordingIndex];
      if (this.isMatch(recording, request)) {
        this.recordingIndex++;
        return recording;
      }
    }

    // If partial match allowed, search all recordings
    if (this.options.allowPartialMatch) {
      for (let i = 0; i < this.store.recordings.length; i++) {
        const recording = this.store.recordings[i];
        if (this.isMatch(recording, request)) {
          return recording;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if a recording matches the request
   */
  private isMatch(recording: Recording, request: HttpRequest): boolean {
    // Method must match
    if (recording.request.method !== request.method) {
      return false;
    }

    // URL must match (normalize by removing trailing slashes)
    const recordedUrl = this.normalizeUrl(recording.request.url);
    const requestUrl = this.normalizeUrl(request.url);

    if (recordedUrl !== requestUrl) {
      return false;
    }

    // If not partial match, headers must match (except ignored ones)
    if (!this.options.allowPartialMatch) {
      return matchRequest(recording.request, request, this.ignoreHeaders);
    }

    return true;
  }

  /**
   * Normalize URL for comparison
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash from path
      parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';
      // Sort query parameters for consistent comparison
      const params = Array.from(parsed.searchParams.entries()).sort(
        ([a], [b]) => a.localeCompare(b)
      );
      parsed.search = '';
      params.forEach(([key, value]) => {
        parsed.searchParams.append(key, value);
      });
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Recording transport for capturing HTTP request/response pairs
 * @module @studiorack/cloudflare-r2/simulation
 */

import type {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  StreamingHttpResponse,
} from '../transport/index.js';
import type { Recording, RecordedRequest, RecordedResponse, SimulationStore } from './types.js';

/**
 * Transport wrapper that records all HTTP requests and responses
 *
 * This transport acts as a decorator around another transport,
 * capturing all interactions for later playback.
 *
 * Usage:
 * ```typescript
 * const baseTransport = new FetchTransport();
 * const recorder = new RecordingTransport(baseTransport);
 *
 * // Use recorder for operations...
 * await client.getObject({ bucket: 'test', key: 'file.txt' });
 *
 * // Export recordings
 * const store = recorder.exportRecordings();
 * fs.writeFileSync('recordings.json', JSON.stringify(store, null, 2));
 * ```
 */
export class RecordingTransport implements HttpTransport {
  private recordings: Recording[] = [];

  constructor(private readonly inner: HttpTransport) {}

  /**
   * Send request and record the interaction
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    const requestTimestamp = Date.now();

    // Record request
    const recordedRequest: RecordedRequest = {
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
      body: await this.captureBody(request.body),
      timestamp: requestTimestamp,
    };

    // Send actual request
    const response = await this.inner.send(request);
    const responseTimestamp = Date.now();

    // Record response
    const recordedResponse: RecordedResponse = {
      status: response.status,
      headers: { ...response.headers },
      body: new Uint8Array(response.body),
      timestamp: responseTimestamp,
    };

    // Store recording
    this.recordings.push({
      request: recordedRequest,
      response: recordedResponse,
    });

    return response;
  }

  /**
   * Send streaming request and record the interaction
   */
  async sendStreaming(request: HttpRequest): Promise<StreamingHttpResponse> {
    const requestTimestamp = Date.now();

    // Record request
    const recordedRequest: RecordedRequest = {
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
      body: await this.captureBody(request.body),
      timestamp: requestTimestamp,
    };

    // Send actual request
    const response = await this.inner.sendStreaming(request);
    const responseTimestamp = Date.now();

    // Capture streaming body
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }

    // Record response
    const recordedResponse: RecordedResponse = {
      status: response.status,
      headers: { ...response.headers },
      body,
      timestamp: responseTimestamp,
    };

    // Store recording
    this.recordings.push({
      request: recordedRequest,
      response: recordedResponse,
    });

    // Return new streaming response with recorded body
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    });

    return {
      status: response.status,
      headers: response.headers,
      body: stream,
    };
  }

  /**
   * Close inner transport
   */
  async close(): Promise<void> {
    await this.inner.close();
  }

  /**
   * Get all recordings
   */
  getRecordings(): Recording[] {
    return [...this.recordings];
  }

  /**
   * Export recordings as a simulation store
   */
  exportRecordings(): SimulationStore {
    return {
      recordings: this.getRecordings(),
      version: '1.0.0',
      metadata: {
        createdAt: new Date().toISOString(),
        description: 'Recorded HTTP interactions for R2 operations',
      },
    };
  }

  /**
   * Clear all recordings
   */
  clearRecordings(): void {
    this.recordings = [];
  }

  /**
   * Capture request body as Uint8Array
   */
  private async captureBody(
    body?: Uint8Array | ReadableStream<Uint8Array>
  ): Promise<Uint8Array | undefined> {
    if (!body) {
      return undefined;
    }

    if (body instanceof Uint8Array) {
      return new Uint8Array(body);
    }

    // Capture stream
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }
}

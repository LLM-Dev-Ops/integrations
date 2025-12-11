/**
 * HTTP transport module for the Mistral client.
 */

import { MistralError } from '../errors';
import type { MistralConfig } from '../config';

/**
 * HTTP response.
 */
export interface HttpResponse {
  /** HTTP status code. */
  status: number;
  /** Response headers. */
  headers: Record<string, string>;
  /** Response body. */
  body: string;
}

/**
 * HTTP transport interface.
 */
export interface HttpTransport {
  /** Sends a GET request. */
  get(path: string): Promise<string>;

  /** Sends a POST request. */
  post(path: string, body: unknown): Promise<string>;

  /** Sends a streaming POST request. */
  postStream(path: string, body: unknown): AsyncIterable<string>;

  /** Sends a PATCH request. */
  patch(path: string, body: unknown): Promise<string>;

  /** Sends a DELETE request. */
  delete(path: string): Promise<string>;

  /** Uploads a file. */
  uploadFile(
    path: string,
    file: Buffer | Blob,
    filename: string,
    purpose: string
  ): Promise<string>;
}

/**
 * Fetch-based HTTP transport.
 */
export class FetchTransport implements HttpTransport {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly customHeaders: Record<string, string>;

  constructor(config: MistralConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
    this.customHeaders = config.customHeaders;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async handleResponse(response: Response): Promise<string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const body = await response.text();

    if (!response.ok) {
      throw MistralError.fromResponse(response.status, body, headers);
    }

    return body;
  }

  async get(path: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof MistralError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw MistralError.timeout('Request timed out');
      }
      throw MistralError.network((error as Error).message, error as Error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async post(path: string, body: unknown): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof MistralError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw MistralError.timeout('Request timed out');
      }
      throw MistralError.network((error as Error).message, error as Error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *postStream(path: string, body: unknown): AsyncIterable<string> {
    const controller = new AbortController();

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        throw MistralError.fromResponse(response.status, text, headers);
      }

      if (!response.body) {
        throw MistralError.stream('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data !== '[DONE]') {
              yield data;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof MistralError) throw error;
      throw MistralError.stream((error as Error).message, error as Error);
    }
  }

  async patch(path: string, body: unknown): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof MistralError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw MistralError.timeout('Request timed out');
      }
      throw MistralError.network((error as Error).message, error as Error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async delete(path: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'DELETE',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof MistralError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw MistralError.timeout('Request timed out');
      }
      throw MistralError.network((error as Error).message, error as Error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async uploadFile(
    path: string,
    file: Buffer | Blob,
    filename: string,
    purpose: string
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const formData = new FormData();

      if (file instanceof Buffer) {
        formData.append('file', new Blob([file]), filename);
      } else {
        formData.append('file', file, filename);
      }
      formData.append('purpose', purpose);

      const headers = { ...this.getHeaders() };
      delete headers['Content-Type']; // Let the browser set it for FormData

      const response = await fetch(this.buildUrl(path), {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof MistralError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw MistralError.timeout('Request timed out');
      }
      throw MistralError.network((error as Error).message, error as Error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export { FetchTransport as default };

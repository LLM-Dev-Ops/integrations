/**
 * Ollama Integration - Generate Service
 *
 * Service for text generation using Ollama's generate API.
 * Based on SPARC specification for Ollama generate endpoints.
 */

import type { OllamaConfig } from '../../config/types.js';
import type { GenerateRequest, GenerateResponse, GenerateChunk } from '../../types/generate.js';
import { OllamaError } from '../../types/errors.js';

export interface GenerateServiceDeps {
  config: OllamaConfig;
  fetch: typeof globalThis.fetch;
}

/**
 * Generate service for text completion
 *
 * Provides both synchronous and streaming text generation.
 * Supports context continuation, raw mode, and multimodal inputs.
 */
export class GenerateService {
  private readonly config: OllamaConfig;
  private readonly fetch: typeof globalThis.fetch;

  constructor(deps: GenerateServiceDeps) {
    this.config = deps.config;
    this.fetch = deps.fetch;
  }

  /**
   * Create a synchronous text generation
   *
   * Generates text in one complete response with full metadata.
   * Returns context array for continuation in subsequent requests.
   *
   * @param request - Generation request parameters
   * @returns Complete generation response with context
   * @throws {OllamaError} If validation fails or generation errors occur
   */
  async create(request: GenerateRequest): Promise<GenerateResponse> {
    // 1. Validate request
    this.validateRequest(request);

    // 2. Resolve model (use default if not specified)
    const resolvedRequest = this.resolveModel(request);

    // 3. Build request body with stream: false
    const body = this.buildRequestBody(resolvedRequest, false);

    // 4. POST to /api/generate
    const url = `${this.config.baseUrl}/api/generate`;
    const response = await this.executeRequest(url, body);

    // 5. Parse and return GenerateResponse
    return this.parseResponse(response);
  }

  /**
   * Create a streaming text generation
   *
   * Streams text as it's generated with incremental chunks.
   * Final chunk includes done: true with full context and metrics.
   *
   * @param request - Generation request parameters
   * @yields {GenerateChunk} Incremental generation chunks
   * @throws {OllamaError} If validation fails or streaming errors occur
   */
  async *createStream(request: GenerateRequest): AsyncGenerator<GenerateChunk, void, unknown> {
    // 1. Validate request
    this.validateRequest(request);

    // 2. Resolve model
    const resolvedRequest = this.resolveModel(request);

    // 3. Build request body with stream: true
    const body = this.buildRequestBody(resolvedRequest, true);

    // 4. Execute streaming request
    const url = `${this.config.baseUrl}/api/generate`;
    const response = await this.executeStreamingRequest(url, body);

    // 5. Parse NDJSON and yield GenerateChunk objects
    yield* this.parseStreamingResponse(response);
  }

  /**
   * Validate the generation request
   *
   * Ensures prompt is not empty and required fields are present.
   *
   * @param request - Request to validate
   * @throws {OllamaError} If validation fails
   */
  private validateRequest(request: GenerateRequest): void {
    // Check prompt is not empty
    if (!request.prompt || request.prompt.trim() === '') {
      throw OllamaError.validationError('Prompt cannot be empty', 'prompt');
    }
  }

  /**
   * Resolve model name
   *
   * Uses provided model or falls back to default from config.
   *
   * @param request - Request with optional model
   * @returns Request with resolved model name
   * @throws {OllamaError} If no model is specified and no default exists
   */
  private resolveModel(request: GenerateRequest): GenerateRequest {
    if (!request.model) {
      if (!this.config.defaultModel) {
        throw OllamaError.validationError('Model is required', 'model');
      }
      return { ...request, model: this.config.defaultModel };
    }
    return request;
  }

  /**
   * Build request body for API call
   *
   * Constructs the request payload with all parameters.
   * Includes context continuation, raw mode, system prompt, template, and images.
   *
   * @param request - Validated and resolved request
   * @param stream - Whether to enable streaming
   * @returns Request body for Ollama API
   */
  private buildRequestBody(
    request: GenerateRequest,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      stream,
    };

    // Add optional parameters
    if (request.system !== undefined) {
      body.system = request.system;
    }

    if (request.template !== undefined) {
      body.template = request.template;
    }

    if (request.context !== undefined) {
      body.context = request.context;
    }

    if (request.raw !== undefined) {
      body.raw = request.raw;
    }

    if (request.images !== undefined) {
      body.images = request.images;
    }

    if (request.keep_alive !== undefined) {
      body.keep_alive = request.keep_alive;
    }

    if (request.options !== undefined) {
      body.options = request.options;
    }

    return body;
  }

  /**
   * Execute synchronous HTTP request
   *
   * @param url - API endpoint URL
   * @param body - Request body
   * @returns Response body
   * @throws {OllamaError} On HTTP or network errors
   */
  private async executeRequest(
    url: string,
    body: Record<string, unknown>
  ): Promise<GenerateResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.defaultHeaders,
          ...(this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return await response.json() as GenerateResponse;
    } catch (error) {
      if (error instanceof OllamaError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw OllamaError.timeout('Generate request', this.config.timeoutMs);
        }
        throw OllamaError.connectionError(
          `Failed to connect to Ollama: ${error.message}`,
          this.config.baseUrl,
          error.message
        );
      }
      throw OllamaError.internalError('Unknown error occurred');
    }
  }

  /**
   * Execute streaming HTTP request
   *
   * @param url - API endpoint URL
   * @param body - Request body
   * @returns Response with readable stream
   * @throws {OllamaError} On HTTP or network errors
   */
  private async executeStreamingRequest(
    url: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.defaultHeaders,
          ...(this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw OllamaError.streamError('No response body received');
      }

      return response;
    } catch (error) {
      if (error instanceof OllamaError) {
        throw error;
      }
      if (error instanceof Error) {
        throw OllamaError.connectionError(
          `Failed to connect to Ollama: ${error.message}`,
          this.config.baseUrl,
          error.message
        );
      }
      throw OllamaError.internalError('Unknown error occurred');
    }
  }

  /**
   * Parse streaming response
   *
   * Parses NDJSON stream into GenerateChunk objects.
   *
   * @param response - Streaming HTTP response
   * @yields {GenerateChunk} Parsed chunks
   * @throws {OllamaError} On parsing errors
   */
  private async *parseStreamingResponse(
    response: Response
  ): AsyncGenerator<GenerateChunk, void, unknown> {
    if (!response.body) {
      throw OllamaError.streamError('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining data in buffer
          if (buffer.trim()) {
            const chunk = this.parseChunk(buffer.trim());
            if (chunk) {
              yield chunk;
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Split by newlines and process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            const chunk = this.parseChunk(trimmed);
            if (chunk) {
              yield chunk;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof OllamaError) {
        throw error;
      }
      if (error instanceof Error) {
        throw OllamaError.streamError(`Stream parsing failed: ${error.message}`);
      }
      throw OllamaError.streamError('Unknown stream error');
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse a single NDJSON chunk
   *
   * @param line - JSON line to parse
   * @returns Parsed chunk or null if invalid
   * @throws {OllamaError} On critical parsing errors
   */
  private parseChunk(line: string): GenerateChunk | null {
    try {
      return JSON.parse(line) as GenerateChunk;
    } catch (error) {
      // Skip invalid JSON lines silently
      return null;
    }
  }

  /**
   * Parse synchronous response
   *
   * @param response - Response body
   * @returns Parsed GenerateResponse
   */
  private parseResponse(response: GenerateResponse): GenerateResponse {
    return response;
  }

  /**
   * Handle HTTP error responses
   *
   * Parses error response and throws appropriate OllamaError.
   *
   * @param response - Error response
   * @throws {OllamaError} Always throws with appropriate error type
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;

    try {
      const body = await response.json() as { error?: string };
      const message = body.error || response.statusText;

      // Map HTTP status codes to specific error types
      if (status === 404) {
        // Extract model name from error message if possible
        const modelMatch = message.match(/model ['"]([^'"]+)['"]/i);
        const model = (modelMatch && modelMatch[1]) ? modelMatch[1] : 'unknown';
        throw OllamaError.modelNotFound(model);
      }

      if (status === 503 || status === 502) {
        throw OllamaError.serverNotRunning(message);
      }

      throw OllamaError.internalError(message, status);
    } catch (error) {
      if (error instanceof OllamaError) {
        throw error;
      }
      // If we can't parse the error body, use status text
      throw OllamaError.internalError(response.statusText, status);
    }
  }
}

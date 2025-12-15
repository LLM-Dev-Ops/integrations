/**
 * Image Service Implementation
 *
 * @module services/image/service
 */

import type { GrokConfig } from '../../config.js';
import type { CredentialProvider } from '../../auth/provider.js';
import { buildRequest } from '../../infra/request-builder.js';
import { parseJsonResponse } from '../../infra/response-parser.js';
import { validationError, timeoutError, networkError } from '../../error.js';
import type {
  GrokImageRequest,
  GrokImageResponse,
} from './types.js';

/**
 * Default image generation model.
 */
export const DEFAULT_IMAGE_MODEL = 'grok-2-image-1212';

/**
 * Image service for xAI Grok API.
 */
export class ImageService {
  private readonly config: GrokConfig;
  private readonly credentialProvider: CredentialProvider;

  constructor(config: GrokConfig, credentialProvider: CredentialProvider) {
    this.config = config;
    this.credentialProvider = credentialProvider;
  }

  /**
   * Generate images from a prompt.
   *
   * @param prompt - Text prompt for image generation
   * @param options - Generation options
   * @returns Image generation response
   */
  async generate(
    prompt: string,
    options: Omit<GrokImageRequest, 'prompt'> = {}
  ): Promise<GrokImageResponse> {
    const request: GrokImageRequest = {
      prompt,
      model: options.model ?? DEFAULT_IMAGE_MODEL,
      ...options,
    };

    return this.execute(request);
  }

  /**
   * Generate a single image and get its URL.
   *
   * @param prompt - Text prompt
   * @param options - Generation options
   * @returns Image URL
   */
  async generateUrl(
    prompt: string,
    options: Omit<GrokImageRequest, 'prompt' | 'n' | 'response_format'> = {}
  ): Promise<string> {
    const response = await this.generate(prompt, {
      ...options,
      n: 1,
      response_format: 'url',
    });

    if (response.data.length === 0 || !response.data[0].url) {
      throw validationError('No image URL in response');
    }

    return response.data[0].url;
  }

  /**
   * Generate a single image and get its base64 data.
   *
   * @param prompt - Text prompt
   * @param options - Generation options
   * @returns Base64-encoded image data
   */
  async generateBase64(
    prompt: string,
    options: Omit<GrokImageRequest, 'prompt' | 'n' | 'response_format'> = {}
  ): Promise<string> {
    const response = await this.generate(prompt, {
      ...options,
      n: 1,
      response_format: 'b64_json',
    });

    if (response.data.length === 0 || !response.data[0].b64_json) {
      throw validationError('No image data in response');
    }

    return response.data[0].b64_json;
  }

  /**
   * Build request body for API.
   *
   * @param request - Image request
   * @returns Request body object
   */
  private buildRequestBody(request: GrokImageRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      model: request.model ?? DEFAULT_IMAGE_MODEL,
    };

    if (request.n !== undefined) {
      body.n = request.n;
    }
    if (request.size !== undefined) {
      body.size = request.size;
    }
    if (request.response_format !== undefined) {
      body.response_format = request.response_format;
    }
    if (request.user !== undefined) {
      body.user = request.user;
    }

    return body;
  }

  /**
   * Execute an image generation request.
   *
   * @param request - Image request
   * @returns Image response
   */
  private async execute(request: GrokImageRequest): Promise<GrokImageResponse> {
    // Validate prompt
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw validationError('Prompt cannot be empty', 'prompt');
    }

    // Validate n
    if (request.n !== undefined && (request.n < 1 || request.n > 10)) {
      throw validationError('n must be between 1 and 10', 'n');
    }

    const authHeader = await this.credentialProvider.getAuthHeader();
    const body = this.buildRequestBody(request);

    const builtRequest = buildRequest(this.config, authHeader, {
      method: 'POST',
      path: '/images/generations',
      body,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      builtRequest.timeout
    );

    try {
      const response = await fetch(builtRequest.url, {
        ...builtRequest.init,
        signal: controller.signal,
      });

      return await parseJsonResponse<GrokImageResponse>(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw timeoutError(`Request timed out after ${builtRequest.timeout}ms`);
      }
      if (error instanceof Error && error.message.includes('fetch')) {
        throw networkError('Network error during request', error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

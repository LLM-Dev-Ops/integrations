/**
 * Ollama Integration - Embeddings Service
 *
 * Service for generating text embeddings using Ollama.
 * Based on SPARC specification Section 5.3.
 */

import type { OllamaConfig } from '../../config/types.js';
import type { SimulationLayer } from '../../simulation/layer.js';
import type { EmbeddingsRequest, EmbeddingsResponse } from '../../types/embeddings.js';
import { OllamaError } from '../../types/errors.js';

/**
 * Dependencies for EmbeddingsService
 */
export interface EmbeddingsServiceDeps {
  config: OllamaConfig;
  simulation: SimulationLayer;
}

/**
 * Embeddings service for generating vector embeddings
 *
 * Supports both Ollama native format (prompt) and OpenAI-compatible format (input).
 * Provides batch embedding with concurrent processing.
 */
export class EmbeddingsService {
  private readonly config: OllamaConfig;
  private readonly simulation: SimulationLayer;

  constructor(deps: EmbeddingsServiceDeps) {
    this.config = deps.config;
    this.simulation = deps.simulation;
  }

  /**
   * Generate embeddings for text
   *
   * @param request - Embeddings request with text to embed
   * @returns Promise resolving to embeddings response
   * @throws {OllamaError} If validation fails or request errors
   *
   * @example
   * ```typescript
   * const response = await embeddings.create({
   *   model: 'nomic-embed-text',
   *   prompt: 'Hello, world!'
   * });
   * console.log(response.embeddings[0]); // [0.123, -0.456, ...]
   * ```
   */
  async create(request: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    // 1. Validate request (must have prompt OR input)
    this.validateRequest(request);

    // 2. Resolve model (use default if not specified)
    const resolvedRequest = this.resolveModel(request);

    // 3. POST to /api/embeddings
    const response = await this.simulation.execute(
      'embeddings',
      resolvedRequest,
      async (transport) => {
        return transport.post('/api/embeddings', resolvedRequest);
      }
    );

    // 4. Return EmbeddingsResponse with embeddings array
    return response.body as EmbeddingsResponse;
  }

  /**
   * Generate embeddings for multiple texts (batch)
   *
   * Processes requests concurrently using Promise.all for optimal performance.
   *
   * @param requests - Array of embeddings requests
   * @returns Promise resolving to array of embeddings responses
   * @throws {OllamaError} If any request fails
   *
   * @example
   * ```typescript
   * const responses = await embeddings.createBatch([
   *   { model: 'nomic-embed-text', prompt: 'First text' },
   *   { model: 'nomic-embed-text', prompt: 'Second text' },
   * ]);
   * ```
   */
  async createBatch(requests: EmbeddingsRequest[]): Promise<EmbeddingsResponse[]> {
    // Process all requests concurrently using Promise.all
    return Promise.all(requests.map(req => this.create(req)));
  }

  /**
   * Validate embeddings request
   *
   * @param request - Request to validate
   * @throws {OllamaError} If validation fails
   * @private
   */
  private validateRequest(request: EmbeddingsRequest): void {
    // Must have either prompt or input
    if (!request.prompt && !request.input) {
      throw OllamaError.validationError('Either prompt or input is required');
    }
  }

  /**
   * Resolve model (use default if not specified)
   *
   * @param request - Original request
   * @returns Request with model resolved
   * @throws {OllamaError} If model cannot be resolved
   * @private
   */
  private resolveModel(request: EmbeddingsRequest): EmbeddingsRequest {
    if (!request.model) {
      if (!this.config.defaultModel) {
        throw OllamaError.validationError('Model is required', 'model');
      }
      return { ...request, model: this.config.defaultModel };
    }
    return request;
  }
}

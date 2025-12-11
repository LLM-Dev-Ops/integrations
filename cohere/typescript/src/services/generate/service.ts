/**
 * Generate service implementation.
 */

import type { HttpTransport, ServerSentEvent } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type {
  GenerateRequest,
  GenerateResponse,
  GenerateStreamEvent,
  Generation,
} from './types';

/**
 * Generate service interface
 */
export interface GenerateService {
  /**
   * Generate text from a prompt
   */
  generate(request: GenerateRequest): Promise<GenerateResponse>;

  /**
   * Stream generated text
   */
  generateStream(request: GenerateRequest): AsyncIterable<GenerateStreamEvent>;
}

/**
 * Generate service implementation
 */
export class GenerateServiceImpl implements GenerateService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Generate text from a prompt
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/generate');
    const body = this.buildRequestBody(request);

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseResponse(response.body);
  }

  /**
   * Stream generated text
   */
  async *generateStream(request: GenerateRequest): AsyncIterable<GenerateStreamEvent> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/generate');
    const body = this.buildRequestBody(request, true);

    const stream = this.transport.sendStreaming('POST', url, {}, body);

    for await (const event of stream) {
      const parsed = this.parseStreamEvent(event);
      if (parsed) {
        yield parsed;
      }
    }
  }

  /**
   * Validate the request
   */
  private validateRequest(request: GenerateRequest): void {
    if (!request.prompt || request.prompt.trim() === '') {
      throw new ValidationError('Prompt is required', [
        { field: 'prompt', message: 'Prompt is required and cannot be empty', code: 'REQUIRED' },
      ]);
    }

    if (request.numGenerations !== undefined) {
      if (request.numGenerations < 1 || request.numGenerations > 5) {
        throw new ValidationError('Invalid num_generations', [
          { field: 'numGenerations', message: 'num_generations must be between 1 and 5', code: 'OUT_OF_RANGE' },
        ]);
      }
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 5) {
        throw new ValidationError('Invalid temperature', [
          { field: 'temperature', message: 'temperature must be between 0 and 5', code: 'OUT_OF_RANGE' },
        ]);
      }
    }

    if (request.topP !== undefined) {
      if (request.topP < 0 || request.topP > 1) {
        throw new ValidationError('Invalid top_p', [
          { field: 'topP', message: 'top_p must be between 0 and 1', code: 'OUT_OF_RANGE' },
        ]);
      }
    }

    if (request.topK !== undefined) {
      if (request.topK < 0 || request.topK > 500) {
        throw new ValidationError('Invalid top_k', [
          { field: 'topK', message: 'top_k must be between 0 and 500', code: 'OUT_OF_RANGE' },
        ]);
      }
    }

    if (request.maxTokens !== undefined) {
      if (request.maxTokens < 1 || request.maxTokens > 4096) {
        throw new ValidationError('Invalid max_tokens', [
          { field: 'maxTokens', message: 'max_tokens must be between 1 and 4096', code: 'OUT_OF_RANGE' },
        ]);
      }
    }
  }

  /**
   * Build the request body
   */
  private buildRequestBody(
    request: GenerateRequest,
    stream = false
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      stream,
    };

    if (request.model) body['model'] = request.model;
    if (request.numGenerations !== undefined) body['num_generations'] = request.numGenerations;
    if (request.truncate) body['truncate'] = request.truncate;
    if (request.returnLikelihoods) body['return_likelihoods'] = request.returnLikelihoods;
    if (request.logitBias) body['logit_bias'] = request.logitBias;
    if (request.rawPrompting !== undefined) body['raw_prompting'] = request.rawPrompting;

    // Generation options
    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens;
    if (request.topP !== undefined) body['p'] = request.topP;
    if (request.topK !== undefined) body['k'] = request.topK;
    if (request.frequencyPenalty !== undefined) body['frequency_penalty'] = request.frequencyPenalty;
    if (request.presencePenalty !== undefined) body['presence_penalty'] = request.presencePenalty;
    if (request.stopSequences) body['stop_sequences'] = request.stopSequences;
    if (request.seed !== undefined) body['seed'] = request.seed;

    return body;
  }

  /**
   * Parse the response
   */
  private parseResponse(body: unknown): GenerateResponse {
    const data = body as Record<string, unknown>;
    const generations = Array.isArray(data['generations'])
      ? data['generations'].map((g: Record<string, unknown>) => this.parseGeneration(g))
      : [];

    return {
      id: data['id'] as string | undefined,
      generations,
      prompt: data['prompt'] as string | undefined,
      meta: data['meta'] as GenerateResponse['meta'],
    };
  }

  /**
   * Parse a single generation
   */
  private parseGeneration(data: Record<string, unknown>): Generation {
    return {
      id: data['id'] as string | undefined,
      text: String(data['text'] ?? ''),
      finishReason: data['finish_reason'] as Generation['finishReason'],
      tokenLikelihoods: Array.isArray(data['token_likelihoods'])
        ? data['token_likelihoods'].map((tl: Record<string, unknown>) => ({
            token: String(tl['token'] ?? ''),
            likelihood: Number(tl['likelihood'] ?? 0),
          }))
        : undefined,
    };
  }

  /**
   * Parse a stream event
   */
  private parseStreamEvent(event: ServerSentEvent): GenerateStreamEvent | null {
    if (!event.data) return null;

    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;

      return {
        eventType: data['is_finished'] ? 'stream-end' : 'text-generation',
        text: data['text'] as string | undefined,
        isFinished: Boolean(data['is_finished']),
        finishReason: data['finish_reason'] as GenerateStreamEvent['finishReason'],
        response: data['response'] ? this.parseResponse(data['response']) : undefined,
      };
    } catch {
      return null;
    }
  }
}

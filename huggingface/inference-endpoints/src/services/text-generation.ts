/**
 * Text Generation Service
 * Implements native HuggingFace text generation format as specified in SPARC documentation
 */

import {
  TextGenerationRequest,
  TextGenerationResponse,
  HfInferenceConfig,
  InferenceProvider,
  InferenceTarget,
} from '../types/index.js';
import { parseHttpError, createValidationError } from '../types/errors.js';
import { ProviderResolver, ResolvedEndpoint } from '../providers/provider-resolver.js';
import { parseSSEResponse, filterDataEvents } from '../utils/sse-parser.js';
import { withRetry } from '../utils/retry.js';
import { ColdStartHandler, createWaitForModelHeaders } from '../utils/cold-start-handler.js';

export interface TextGenerationServiceOptions {
  config: HfInferenceConfig;
  providerResolver: ProviderResolver;
  coldStartHandler: ColdStartHandler;
}

/**
 * Text Generation Service class
 * Provides native HF text generation format
 */
export class TextGenerationService {
  private config: HfInferenceConfig;
  private providerResolver: ProviderResolver;
  private coldStartHandler: ColdStartHandler;

  constructor(options: TextGenerationServiceOptions) {
    this.config = options.config;
    this.providerResolver = options.providerResolver;
    this.coldStartHandler = options.coldStartHandler;
  }

  /**
   * Generate text completion
   */
  async generate(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    this.validateRequest(request);

    const model = request.model || 'meta-llama/Llama-3.2-3B-Instruct';
    const target: InferenceTarget = {
      provider: this.config.defaultProvider,
      model,
    };

    // Only serverless and dedicated endpoints support native text generation
    if (
      target.provider !== InferenceProvider.Serverless &&
      target.provider !== InferenceProvider.Dedicated
    ) {
      throw createValidationError(
        'Native text generation is only supported on serverless and dedicated endpoints'
      );
    }

    const endpoint = this.providerResolver.resolve(target);

    const requestFn = async (): Promise<TextGenerationResponse> => {
      const response = await this.makeRequest(endpoint, request);
      return this.parseResponse(response);
    };

    if (this.config.autoWaitForModel) {
      return this.coldStartHandler.execute(requestFn, {
        timeout: this.config.coldStartTimeout,
      });
    }

    return withRetry(requestFn, {
      maxRetries: this.config.maxRetries,
      baseDelay: this.config.retryBaseDelay,
      maxDelay: this.config.retryMaxDelay,
    });
  }

  /**
   * Generate text with streaming
   */
  async *stream(
    request: TextGenerationRequest
  ): AsyncGenerator<string, TextGenerationResponse, unknown> {
    this.validateRequest(request);

    const model = request.model || 'meta-llama/Llama-3.2-3B-Instruct';
    const target: InferenceTarget = {
      provider: this.config.defaultProvider,
      model,
    };

    if (
      target.provider !== InferenceProvider.Serverless &&
      target.provider !== InferenceProvider.Dedicated
    ) {
      throw createValidationError(
        'Native text generation is only supported on serverless and dedicated endpoints'
      );
    }

    const endpoint = this.providerResolver.resolve(target);
    const streamRequest = {
      ...request,
      parameters: {
        ...request.parameters,
        details: true,
      },
    };

    const response = await this.makeRequest(endpoint, streamRequest, true);

    if (!response.body) {
      throw createValidationError('Response body is null');
    }

    let fullText = '';
    let details: TextGenerationResponse['details'] | undefined;

    const events = parseSSEResponse(response);

    for await (const data of filterDataEvents(events)) {
      try {
        const chunk = JSON.parse(data);

        if (chunk.token?.text) {
          fullText += chunk.token.text;
          yield chunk.token.text;
        }

        // Last chunk may contain details
        if (chunk.details) {
          details = {
            finishReason: this.mapFinishReason(chunk.details.finish_reason),
            generatedTokens: chunk.details.generated_tokens,
            seed: chunk.details.seed,
            tokens: chunk.details.tokens?.map((t: any) => ({
              id: t.id,
              text: t.text,
              logprob: t.logprob,
              special: t.special,
            })),
          };
        }
      } catch {
        // Skip malformed chunks
        continue;
      }
    }

    return {
      generatedText: fullText,
      details,
    };
  }

  /**
   * Validate text generation request
   */
  private validateRequest(request: TextGenerationRequest): void {
    if (!request.inputs || request.inputs.trim() === '') {
      throw createValidationError('Input text is required');
    }

    if (request.parameters) {
      const params = request.parameters;

      if (params.maxNewTokens !== undefined && params.maxNewTokens < 1) {
        throw createValidationError('Max new tokens must be at least 1');
      }

      if (params.temperature !== undefined) {
        if (params.temperature < 0 || params.temperature > 2) {
          throw createValidationError('Temperature must be between 0 and 2');
        }
      }

      if (params.topP !== undefined) {
        if (params.topP < 0 || params.topP > 1) {
          throw createValidationError('Top-p must be between 0 and 1');
        }
      }

      if (params.topK !== undefined && params.topK < 1) {
        throw createValidationError('Top-k must be at least 1');
      }

      if (params.repetitionPenalty !== undefined && params.repetitionPenalty < 0) {
        throw createValidationError('Repetition penalty must be non-negative');
      }
    }
  }

  /**
   * Make HTTP request to the endpoint
   */
  private async makeRequest(
    endpoint: ResolvedEndpoint,
    request: TextGenerationRequest,
    stream: boolean = false
  ): Promise<Response> {
    // Use native text generation endpoint
    const url = `${endpoint.baseUrl}/models/${endpoint.model}`;

    const body = this.buildRequestBody(request, stream);

    const headers: Record<string, string> = {
      ...endpoint.headers,
      ...(this.config.autoWaitForModel
        ? createWaitForModelHeaders(request.options?.waitForModel ?? true)
        : {}),
    };

    const controller = new AbortController();
    const timeout = stream
      ? this.config.streamTimeout
      : this.config.requestTimeout;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseHttpError(response);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build request body for the API
   */
  private buildRequestBody(
    request: TextGenerationRequest,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      inputs: request.inputs,
      stream,
    };

    if (request.parameters) {
      const params: Record<string, unknown> = {};

      if (request.parameters.maxNewTokens !== undefined) {
        params.max_new_tokens = request.parameters.maxNewTokens;
      }

      if (request.parameters.temperature !== undefined) {
        params.temperature = request.parameters.temperature;
      }

      if (request.parameters.topP !== undefined) {
        params.top_p = request.parameters.topP;
      }

      if (request.parameters.topK !== undefined) {
        params.top_k = request.parameters.topK;
      }

      if (request.parameters.repetitionPenalty !== undefined) {
        params.repetition_penalty = request.parameters.repetitionPenalty;
      }

      if (request.parameters.stopSequences) {
        params.stop = request.parameters.stopSequences;
      }

      if (request.parameters.doSample !== undefined) {
        params.do_sample = request.parameters.doSample;
      }

      if (request.parameters.returnFullText !== undefined) {
        params.return_full_text = request.parameters.returnFullText;
      }

      if (request.parameters.seed !== undefined) {
        params.seed = request.parameters.seed;
      }

      body.parameters = params;
    }

    if (request.options) {
      const options: Record<string, unknown> = {};

      if (request.options.useCache !== undefined) {
        options.use_cache = request.options.useCache;
      }

      if (request.options.waitForModel !== undefined) {
        options.wait_for_model = request.options.waitForModel;
      }

      body.options = options;
    }

    return body;
  }

  /**
   * Parse response from the API
   */
  private async parseResponse(response: Response): Promise<TextGenerationResponse> {
    const data = await response.json();

    // Handle array response (batch)
    const result = Array.isArray(data) ? data[0] : data;

    return {
      generatedText: result.generated_text,
      details: result.details
        ? {
            finishReason: this.mapFinishReason(result.details.finish_reason),
            generatedTokens: result.details.generated_tokens,
            seed: result.details.seed,
            tokens: result.details.tokens?.map((t: any) => ({
              id: t.id,
              text: t.text,
              logprob: t.logprob,
              special: t.special,
            })),
          }
        : undefined,
    };
  }

  /**
   * Map finish reason to our enum
   */
  private mapFinishReason(
    reason: string | undefined
  ): 'length' | 'eos_token' | 'stop_sequence' {
    switch (reason) {
      case 'length':
      case 'max_length':
        return 'length';
      case 'eos_token':
      case 'end_of_text':
        return 'eos_token';
      case 'stop_sequence':
      case 'stop':
        return 'stop_sequence';
      default:
        return 'eos_token';
    }
  }
}

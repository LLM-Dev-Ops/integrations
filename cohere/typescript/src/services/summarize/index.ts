/**
 * Summarize service module.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type { ApiMeta, TruncateOption } from '../../types';

/**
 * Summary format
 */
export type SummarizeFormat = 'paragraph' | 'bullets';

/**
 * Summary length
 */
export type SummarizeLength = 'short' | 'medium' | 'long' | 'auto';

/**
 * Summary extractiveness
 */
export type SummarizeExtractiveness = 'low' | 'medium' | 'high' | 'auto';

/**
 * Summarize request
 */
export interface SummarizeRequest {
  /** Text to summarize */
  text: string;
  /** Model to use */
  model?: string;
  /** Summary length */
  length?: SummarizeLength;
  /** Summary format */
  format?: SummarizeFormat;
  /** Extractiveness level */
  extractiveness?: SummarizeExtractiveness;
  /** Temperature for generation */
  temperature?: number;
  /** Additional context */
  additionalCommand?: string;
}

/**
 * Summarize response
 */
export interface SummarizeResponse {
  /** Response ID */
  id?: string;
  /** Generated summary */
  summary: string;
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Summarize service interface
 */
export interface SummarizeService {
  /**
   * Summarize text
   */
  summarize(request: SummarizeRequest): Promise<SummarizeResponse>;
}

/**
 * Summarize service implementation
 */
export class SummarizeServiceImpl implements SummarizeService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Summarize text
   */
  async summarize(request: SummarizeRequest): Promise<SummarizeResponse> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/summarize');
    const body = this.buildRequestBody(request);

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseResponse(response.body);
  }

  private validateRequest(request: SummarizeRequest): void {
    if (!request.text || request.text.trim() === '') {
      throw new ValidationError('Text is required', [
        { field: 'text', message: 'Text is required and cannot be empty', code: 'REQUIRED' },
      ]);
    }

    if (request.text.length < 250) {
      throw new ValidationError('Text too short', [
        { field: 'text', message: 'Text must be at least 250 characters', code: 'OUT_OF_RANGE' },
      ]);
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 5) {
        throw new ValidationError('Invalid temperature', [
          { field: 'temperature', message: 'Temperature must be between 0 and 5', code: 'OUT_OF_RANGE' },
        ]);
      }
    }
  }

  private buildRequestBody(request: SummarizeRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      text: request.text,
    };

    if (request.model) body['model'] = request.model;
    if (request.length) body['length'] = request.length;
    if (request.format) body['format'] = request.format;
    if (request.extractiveness) body['extractiveness'] = request.extractiveness;
    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.additionalCommand) body['additional_command'] = request.additionalCommand;

    return body;
  }

  private parseResponse(body: unknown): SummarizeResponse {
    const data = body as Record<string, unknown>;
    return {
      id: data['id'] as string | undefined,
      summary: String(data['summary'] ?? ''),
      meta: data['meta'] as SummarizeResponse['meta'],
    };
  }
}

/**
 * Classify service implementation.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type { ClassifyRequest, ClassifyResponse, ClassificationResult, LabelConfidence } from './types';

/**
 * Classify service interface
 */
export interface ClassifyService {
  /**
   * Classify texts using examples
   */
  classify(request: ClassifyRequest): Promise<ClassifyResponse>;
}

/**
 * Classify service implementation
 */
export class ClassifyServiceImpl implements ClassifyService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Classify texts using examples
   */
  async classify(request: ClassifyRequest): Promise<ClassifyResponse> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/classify');
    const body = this.buildRequestBody(request);

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseResponse(response.body);
  }

  /**
   * Validate the request
   */
  private validateRequest(request: ClassifyRequest): void {
    if (!request.inputs || request.inputs.length === 0) {
      throw new ValidationError('Inputs are required', [
        { field: 'inputs', message: 'At least one input is required', code: 'REQUIRED' },
      ]);
    }

    if (request.inputs.length > 96) {
      throw new ValidationError('Too many inputs', [
        { field: 'inputs', message: 'Maximum 96 inputs per request', code: 'OUT_OF_RANGE' },
      ]);
    }

    if (!request.examples || request.examples.length === 0) {
      throw new ValidationError('Examples are required', [
        { field: 'examples', message: 'At least one example is required', code: 'REQUIRED' },
      ]);
    }

    if (request.examples.length < 2) {
      throw new ValidationError('Not enough examples', [
        { field: 'examples', message: 'At least 2 examples are required (one per class)', code: 'OUT_OF_RANGE' },
      ]);
    }

    // Validate each example
    const labels = new Set<string>();
    for (let i = 0; i < request.examples.length; i++) {
      const example = request.examples[i];
      if (!example) continue;

      if (!example.text || example.text.trim() === '') {
        throw new ValidationError('Invalid example', [
          { field: `examples[${i}].text`, message: 'Example text is required', code: 'REQUIRED' },
        ]);
      }

      if (!example.label || example.label.trim() === '') {
        throw new ValidationError('Invalid example', [
          { field: `examples[${i}].label`, message: 'Example label is required', code: 'REQUIRED' },
        ]);
      }

      labels.add(example.label);
    }

    // Need at least 2 distinct labels
    if (labels.size < 2) {
      throw new ValidationError('Not enough labels', [
        { field: 'examples', message: 'Examples must include at least 2 distinct labels', code: 'INVALID' },
      ]);
    }
  }

  /**
   * Build the request body
   */
  private buildRequestBody(request: ClassifyRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      inputs: request.inputs,
      examples: request.examples,
    };

    if (request.model) body['model'] = request.model;
    if (request.preset) body['preset'] = request.preset;
    if (request.truncate) body['truncate'] = request.truncate;

    return body;
  }

  /**
   * Parse the response
   */
  private parseResponse(body: unknown): ClassifyResponse {
    const data = body as Record<string, unknown>;
    const classifications = Array.isArray(data['classifications'])
      ? data['classifications'].map((c: Record<string, unknown>) => this.parseClassification(c))
      : [];

    return {
      id: data['id'] as string | undefined,
      classifications,
      meta: data['meta'] as ClassifyResponse['meta'],
    };
  }

  /**
   * Parse a single classification result
   */
  private parseClassification(data: Record<string, unknown>): ClassificationResult {
    return {
      input: String(data['input'] ?? ''),
      prediction: String(data['prediction'] ?? ''),
      confidence: Number(data['confidence'] ?? 0),
      labels: Array.isArray(data['labels'])
        ? data['labels'].map((l: Record<string, unknown>) => ({
            label: String(l['label'] ?? ''),
            confidence: Number(l['confidence'] ?? 0),
          } as LabelConfidence))
        : undefined,
      id: data['id'] as string | undefined,
    };
  }
}

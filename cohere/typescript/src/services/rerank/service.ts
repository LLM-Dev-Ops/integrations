/**
 * Rerank service implementation.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type { RerankRequest, RerankResponse, RerankResult, RerankDocument } from './types';

/**
 * Rerank service interface
 */
export interface RerankService {
  /**
   * Rerank documents by relevance to a query
   */
  rerank(request: RerankRequest): Promise<RerankResponse>;
}

/**
 * Rerank service implementation
 */
export class RerankServiceImpl implements RerankService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Rerank documents by relevance to a query
   */
  async rerank(request: RerankRequest): Promise<RerankResponse> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/rerank');
    const body = this.buildRequestBody(request);

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseResponse(response.body);
  }

  /**
   * Validate the request
   */
  private validateRequest(request: RerankRequest): void {
    if (!request.query || request.query.trim() === '') {
      throw new ValidationError('Query is required', [
        { field: 'query', message: 'Query is required and cannot be empty', code: 'REQUIRED' },
      ]);
    }

    if (!request.documents || request.documents.length === 0) {
      throw new ValidationError('Documents are required', [
        { field: 'documents', message: 'At least one document is required', code: 'REQUIRED' },
      ]);
    }

    if (request.documents.length > 1000) {
      throw new ValidationError('Too many documents', [
        { field: 'documents', message: 'Maximum 1000 documents per request', code: 'OUT_OF_RANGE' },
      ]);
    }

    if (request.topN !== undefined) {
      if (request.topN < 1) {
        throw new ValidationError('Invalid top_n', [
          { field: 'topN', message: 'top_n must be at least 1', code: 'OUT_OF_RANGE' },
        ]);
      }
      if (request.topN > request.documents.length) {
        throw new ValidationError('Invalid top_n', [
          { field: 'topN', message: 'top_n cannot exceed number of documents', code: 'OUT_OF_RANGE' },
        ]);
      }
    }

    if (request.maxChunksPerDoc !== undefined) {
      if (request.maxChunksPerDoc < 1 || request.maxChunksPerDoc > 10000) {
        throw new ValidationError('Invalid max_chunks_per_doc', [
          { field: 'maxChunksPerDoc', message: 'max_chunks_per_doc must be between 1 and 10000', code: 'OUT_OF_RANGE' },
        ]);
      }
    }
  }

  /**
   * Build the request body
   */
  private buildRequestBody(request: RerankRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      query: request.query,
      documents: request.documents,
    };

    if (request.model) body['model'] = request.model;
    if (request.topN !== undefined) body['top_n'] = request.topN;
    if (request.maxChunksPerDoc !== undefined) body['max_chunks_per_doc'] = request.maxChunksPerDoc;
    if (request.returnDocuments !== undefined) body['return_documents'] = request.returnDocuments;

    return body;
  }

  /**
   * Parse the response
   */
  private parseResponse(body: unknown): RerankResponse {
    const data = body as Record<string, unknown>;
    const results = Array.isArray(data['results'])
      ? data['results'].map((r: Record<string, unknown>) => this.parseResult(r))
      : [];

    return {
      id: data['id'] as string | undefined,
      results,
      meta: data['meta'] as RerankResponse['meta'],
    };
  }

  /**
   * Parse a single result
   */
  private parseResult(data: Record<string, unknown>): RerankResult {
    return {
      index: Number(data['index'] ?? 0),
      relevanceScore: Number(data['relevance_score'] ?? 0),
      document: data['document'] as RerankDocument | undefined,
    };
  }
}

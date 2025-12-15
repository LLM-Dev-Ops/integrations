/**
 * Azure Cognitive Search - Document Service
 *
 * Provides document indexing, lookup, and batch operations.
 */

import type { HttpTransport } from '../transport/index.js';
import type {
  UploadDocumentRequest,
  MergeDocumentRequest,
  DeleteDocumentRequest,
  BatchIndexRequest,
  LookupRequest,
  Document,
  IndexResult,
  BatchIndexResult,
  IndexAction,
} from '../types/index.js';
import { PartialFailureError } from '../errors/index.js';

/** Maximum documents per batch */
const MAX_BATCH_SIZE = 1000;

/** Raw Azure index response */
interface AzureIndexResponse {
  value: Array<{
    key: string;
    status: boolean;
    statusCode: number;
    errorMessage?: string;
  }>;
}

/**
 * Document service for Azure Cognitive Search
 */
export class DocumentService {
  private readonly transport: HttpTransport;

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  /**
   * Upload a document (insert or replace)
   */
  async upload(request: UploadDocumentRequest): Promise<IndexResult> {
    return this.indexSingle(request.index, 'upload', request.document, request);
  }

  /**
   * Merge document fields (update existing)
   */
  async merge(request: MergeDocumentRequest): Promise<IndexResult> {
    return this.indexSingle(request.index, 'merge', request.document, request);
  }

  /**
   * Merge or upload document
   */
  async mergeOrUpload(request: MergeDocumentRequest): Promise<IndexResult> {
    return this.indexSingle(request.index, 'mergeOrUpload', request.document, request);
  }

  /**
   * Delete a document by key
   */
  async delete(request: DeleteDocumentRequest): Promise<IndexResult> {
    const doc: Document = {
      [request.keyField]: request.key,
    };
    return this.indexSingle(request.index, 'delete', doc, request);
  }

  /**
   * Lookup a document by key
   */
  async lookup(request: LookupRequest): Promise<Document | null> {
    try {
      const response = await this.transport.request<Document>({
        method: 'GET',
        path: `/indexes/${encodeURIComponent(request.index)}/docs/${encodeURIComponent(request.key)}`,
        queryParams: request.select
          ? { $select: request.select.join(',') }
          : undefined,
        timeout: request.timeout,
        signal: request.signal,
      });

      return response.data;
    } catch (error) {
      // Return null for 404
      if (error instanceof Error && 'statusCode' in error && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Index a batch of documents
   */
  async indexBatch(request: BatchIndexRequest): Promise<BatchIndexResult> {
    const { index, documents } = request;

    // Split into chunks if needed
    if (documents.length > MAX_BATCH_SIZE) {
      return this.indexBatchChunked(request);
    }

    // Build request body
    const body = {
      value: documents.map((doc) => ({
        '@search.action': doc.action,
        ...doc.document,
      })),
    };

    const response = await this.transport.request<AzureIndexResponse>({
      method: 'POST',
      path: `/indexes/${encodeURIComponent(index)}/docs/index`,
      body,
      timeout: request.timeout,
      signal: request.signal,
    });

    return this.parseBatchResult(index, response.data);
  }

  /**
   * Get document count in index
   */
  async count(index: string, options?: { timeout?: number; signal?: AbortSignal }): Promise<number> {
    const response = await this.transport.request<number>({
      method: 'GET',
      path: `/indexes/${encodeURIComponent(index)}/docs/$count`,
      timeout: options?.timeout,
      signal: options?.signal,
    });

    return response.data;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private async indexSingle(
    index: string,
    action: IndexAction,
    document: Document,
    options?: { timeout?: number; signal?: AbortSignal }
  ): Promise<IndexResult> {
    const body = {
      value: [
        {
          '@search.action': action,
          ...document,
        },
      ],
    };

    const response = await this.transport.request<AzureIndexResponse>({
      method: 'POST',
      path: `/indexes/${encodeURIComponent(index)}/docs/index`,
      body,
      timeout: options?.timeout,
      signal: options?.signal,
    });

    const results = this.parseBatchResult(index, response.data);
    const result = results.results[0];

    if (!result) {
      throw new Error('No result returned from index operation');
    }

    return result;
  }

  private async indexBatchChunked(request: BatchIndexRequest): Promise<BatchIndexResult> {
    const { index, documents } = request;
    const allResults: IndexResult[] = [];

    // Process in chunks
    for (let i = 0; i < documents.length; i += MAX_BATCH_SIZE) {
      const chunk = documents.slice(i, i + MAX_BATCH_SIZE);

      const body = {
        value: chunk.map((doc) => ({
          '@search.action': doc.action,
          ...doc.document,
        })),
      };

      const response = await this.transport.request<AzureIndexResponse>({
        method: 'POST',
        path: `/indexes/${encodeURIComponent(index)}/docs/index`,
        body,
        timeout: request.timeout,
        signal: request.signal,
      });

      const chunkResult = this.parseBatchResult(index, response.data);
      allResults.push(...chunkResult.results);
    }

    return this.aggregateResults(allResults);
  }

  private parseBatchResult(index: string, data: AzureIndexResponse): BatchIndexResult {
    const results: IndexResult[] = data.value.map((item) => ({
      key: item.key,
      succeeded: item.status,
      statusCode: item.statusCode,
      errorMessage: item.errorMessage,
    }));

    const successCount = results.filter((r) => r.succeeded).length;
    const failureCount = results.filter((r) => !r.succeeded).length;

    // If there are failures, we might want to throw PartialFailureError
    // but for now, just return the result and let the caller decide
    const result: BatchIndexResult = {
      results,
      successCount,
      failureCount,
    };

    return result;
  }

  private aggregateResults(results: IndexResult[]): BatchIndexResult {
    const successCount = results.filter((r) => r.succeeded).length;
    const failureCount = results.filter((r) => !r.succeeded).length;

    return {
      results,
      successCount,
      failureCount,
    };
  }
}

/** Create a document service */
export function createDocumentService(transport: HttpTransport): DocumentService {
  return new DocumentService(transport);
}

/**
 * Helper to check if batch result has failures
 */
export function hasFailures(result: BatchIndexResult): boolean {
  return result.failureCount > 0;
}

/**
 * Helper to get failed keys from batch result
 */
export function getFailedKeys(result: BatchIndexResult): string[] {
  return result.results.filter((r) => !r.succeeded).map((r) => r.key);
}

/**
 * Helper to throw PartialFailureError if there are failures
 */
export function throwIfPartialFailure(index: string, result: BatchIndexResult): void {
  if (hasFailures(result)) {
    throw new PartialFailureError(
      index,
      result.successCount,
      result.failureCount,
      getFailedKeys(result)
    );
  }
}

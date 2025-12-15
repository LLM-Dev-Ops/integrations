/**
 * Azure Cognitive Search - Vector Store Implementation
 *
 * Implements the VectorStore interface using Azure Cognitive Search.
 */

import type { SearchService } from '../services/search.js';
import type { DocumentService } from '../services/documents.js';
import type {
  VectorStore,
  VectorStoreConfig,
  VectorDocument,
  VectorQuery,
  VectorSearchResult,
} from './types.js';
import { buildMetadataFilter } from './filter.js';
import { PartialFailureError, VectorDimensionMismatchError } from '../errors/index.js';

/**
 * Azure Cognitive Search VectorStore implementation
 */
export class AcsVectorStore implements VectorStore {
  private readonly searchService: SearchService;
  private readonly documentService: DocumentService;
  private readonly config: VectorStoreConfig;

  constructor(
    searchService: SearchService,
    documentService: DocumentService,
    config: VectorStoreConfig
  ) {
    this.searchService = searchService;
    this.documentService = documentService;
    this.config = config;

    // Set key field for search result parsing
    this.searchService.setKeyField(config.indexName, config.keyField);
  }

  /**
   * Insert or update documents
   */
  async upsert(documents: VectorDocument[]): Promise<void> {
    // Validate vector dimensions
    for (const doc of documents) {
      if (doc.vector.length !== this.config.dimensions) {
        throw new VectorDimensionMismatchError(this.config.dimensions, doc.vector.length);
      }
    }

    // Build ACS documents
    const acsDocuments = documents.map((doc) => {
      const acsDoc: Record<string, unknown> = {
        [this.config.keyField]: doc.id,
        [this.config.contentField]: doc.content,
        [this.config.vectorField]: doc.vector,
      };

      // Handle metadata
      if (doc.metadata) {
        if (this.config.metadataField) {
          acsDoc[this.config.metadataField] = doc.metadata;
        } else {
          // Flatten metadata into document
          Object.assign(acsDoc, doc.metadata);
        }
      }

      return {
        action: 'mergeOrUpload' as const,
        document: acsDoc,
      };
    });

    const result = await this.documentService.indexBatch({
      index: this.config.indexName,
      documents: acsDocuments,
    });

    if (result.failureCount > 0) {
      const failedKeys = result.results.filter((r) => !r.succeeded).map((r) => r.key);
      throw new PartialFailureError(
        this.config.indexName,
        result.successCount,
        result.failureCount,
        failedKeys
      );
    }
  }

  /**
   * Search for similar vectors
   */
  async search(query: VectorQuery): Promise<VectorSearchResult[]> {
    // Validate vector dimensions
    if (query.vector.length !== this.config.dimensions) {
      throw new VectorDimensionMismatchError(this.config.dimensions, query.vector.length);
    }

    // Build filter
    const filter = buildMetadataFilter(query.filter, this.config.metadataField);

    // Build select fields
    const select = [this.config.keyField, this.config.contentField];
    if (this.config.metadataField) {
      select.push(this.config.metadataField);
    }
    if (query.includeVectors) {
      select.push(this.config.vectorField);
    }

    // Execute search
    const results = await this.searchService.vectorSearch({
      index: this.config.indexName,
      vector: query.vector,
      vectorField: this.config.vectorField,
      k: query.topK,
      filter,
      select,
    });

    // Transform results
    return results.results
      .filter((r) => !query.minScore || r.score >= query.minScore)
      .map((r) => this.toVectorSearchResult(r, query.includeVectors));
  }

  /**
   * Delete documents by IDs
   */
  async delete(ids: string[]): Promise<void> {
    const documents = ids.map((id) => ({
      action: 'delete' as const,
      document: { [this.config.keyField]: id },
    }));

    await this.documentService.indexBatch({
      index: this.config.indexName,
      documents,
    });
  }

  /**
   * Get a document by ID
   */
  async get(id: string): Promise<VectorDocument | null> {
    const doc = await this.documentService.lookup({
      index: this.config.indexName,
      key: id,
    });

    if (!doc) {
      return null;
    }

    return this.toVectorDocument(doc);
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private toVectorSearchResult(
    result: { id: string; score: number; document: Record<string, unknown> },
    includeVectors?: boolean
  ): VectorSearchResult {
    const doc = result.document;

    const searchResult: VectorSearchResult = {
      id: String(doc[this.config.keyField] ?? result.id),
      content: String(doc[this.config.contentField] ?? ''),
      score: result.score,
    };

    // Extract metadata
    if (this.config.metadataField && doc[this.config.metadataField]) {
      searchResult.metadata = doc[this.config.metadataField] as Record<string, unknown>;
    }

    // Include vector if requested
    if (includeVectors && doc[this.config.vectorField]) {
      searchResult.vector = doc[this.config.vectorField] as number[];
    }

    return searchResult;
  }

  private toVectorDocument(doc: Record<string, unknown>): VectorDocument {
    const vectorDoc: VectorDocument = {
      id: String(doc[this.config.keyField] ?? ''),
      content: String(doc[this.config.contentField] ?? ''),
      vector: (doc[this.config.vectorField] as number[]) ?? [],
    };

    // Extract metadata
    if (this.config.metadataField && doc[this.config.metadataField]) {
      vectorDoc.metadata = doc[this.config.metadataField] as Record<string, unknown>;
    }

    return vectorDoc;
  }
}

/** Create a vector store */
export function createVectorStore(
  searchService: SearchService,
  documentService: DocumentService,
  config: VectorStoreConfig
): AcsVectorStore {
  return new AcsVectorStore(searchService, documentService, config);
}

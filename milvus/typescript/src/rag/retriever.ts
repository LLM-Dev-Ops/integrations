import { MilvusClient } from '../client/client.js';
import { ConsistencyLevel } from '../types/consistency.js';
import { MetricType } from '../types/metric.js';
import { SearchRequest, SearchResponse, createHnswSearchParams } from '../types/index.js';
import { FieldValue } from '../types/entity.js';

/**
 * Query for retrieval operations.
 */
export interface RetrievalQuery {
  /** Query embedding vector */
  embedding: number[];
  /** Number of results to return (default: 10) */
  topK?: number;
  /** Minimum score threshold (optional) */
  minScore?: number;
  /** Filter expression (optional) */
  filter?: string;
  /** Fields to include in results */
  outputFields?: string[];
  /** Override collection name */
  collection?: string;
  /** Partition names to search */
  partitions?: string[];
  /** Consistency level override */
  consistency?: ConsistencyLevel;
}

/**
 * Single retrieval result.
 */
export interface RetrievalResult {
  /** Entity ID */
  id: bigint;
  /** Similarity score */
  score: number;
  /** Content field if present */
  content?: string;
  /** All metadata fields */
  metadata: Record<string, FieldValue>;
}

/**
 * RAG retriever for semantic search and retrieval.
 */
export class RAGRetriever {
  private readonly client: MilvusClient;
  private defaultCollection: string;
  private defaultPartition?: string;
  private defaultTopK: number;
  private defaultMinScore?: number;
  private defaultVectorField: string;
  private defaultContentField: string;
  private defaultMetricType: MetricType;

  constructor(client: MilvusClient) {
    this.client = client;
    this.defaultCollection = '';
    this.defaultTopK = 10;
    this.defaultVectorField = 'embedding';
    this.defaultContentField = 'content';
    this.defaultMetricType = MetricType.Cosine;
  }

  /**
   * Set default collection name.
   */
  withDefaultCollection(collection: string): this {
    this.defaultCollection = collection;
    return this;
  }

  /**
   * Set default partition.
   */
  withDefaultPartition(partition: string): this {
    this.defaultPartition = partition;
    return this;
  }

  /**
   * Set default top K.
   */
  withDefaultTopK(topK: number): this {
    this.defaultTopK = topK;
    return this;
  }

  /**
   * Set minimum score threshold.
   */
  withMinScore(minScore: number): this {
    this.defaultMinScore = minScore;
    return this;
  }

  /**
   * Set vector field name.
   */
  withVectorField(field: string): this {
    this.defaultVectorField = field;
    return this;
  }

  /**
   * Set content field name.
   */
  withContentField(field: string): this {
    this.defaultContentField = field;
    return this;
  }

  /**
   * Set metric type.
   */
  withMetricType(metric: MetricType): this {
    this.defaultMetricType = metric;
    return this;
  }

  /**
   * Retrieve documents for RAG.
   */
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const collection = query.collection ?? this.defaultCollection;
    if (!collection) {
      throw new Error('Collection name is required');
    }

    const topK = query.topK ?? this.defaultTopK;
    const outputFields = query.outputFields ?? [
      this.defaultContentField,
      'id',
    ];

    // Build search request
    const searchRequest: SearchRequest = {
      collectionName: collection,
      partitionNames: query.partitions ?? (this.defaultPartition ? [this.defaultPartition] : undefined),
      vectorField: this.defaultVectorField,
      vectors: [query.embedding],
      metricType: this.defaultMetricType,
      topK,
      params: createHnswSearchParams(64),
      filter: query.filter,
      outputFields,
      consistencyLevel: query.consistency ?? ConsistencyLevel.Session,
    };

    // Execute search
    const response = await this.client.search(searchRequest);

    // Transform results
    const results = this.transformResults(response, query.minScore);

    return results;
  }

  /**
   * Retrieve from multiple collections and merge results.
   */
  async multiRetrieve(
    query: RetrievalQuery,
    collections: string[]
  ): Promise<RetrievalResult[]> {
    // Search all collections in parallel
    const searchPromises = collections.map((collection) =>
      this.retrieve({ ...query, collection })
    );

    const allResults = await Promise.all(searchPromises);

    // Merge and sort by score
    const merged = allResults.flat();
    merged.sort((a, b) => b.score - a.score);

    // Apply final limit
    const topK = query.topK ?? this.defaultTopK;
    return merged.slice(0, topK);
  }

  /**
   * Build context string from retrieval results.
   */
  buildContext(results: RetrievalResult[], separator: string = '\n\n---\n\n'): string {
    return results
      .filter((r) => r.content)
      .map((r) => r.content!)
      .join(separator);
  }

  /**
   * Build numbered context string.
   */
  buildNumberedContext(results: RetrievalResult[]): string {
    return results
      .filter((r) => r.content)
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');
  }

  /**
   * Transform search response to retrieval results.
   */
  private transformResults(
    response: SearchResponse,
    minScore?: number
  ): RetrievalResult[] {
    const hits = response.results[0];
    if (!hits) {
      return [];
    }

    const threshold = minScore ?? this.defaultMinScore ?? 0;
    const results: RetrievalResult[] = [];

    for (let i = 0; i < hits.ids.length; i++) {
      const id = hits.ids[i];
      const score = hits.scores[i];

      if (id === undefined || score === undefined) continue;
      if (score < threshold) continue;

      const fields = hits.fields[i] ?? {};
      const content = this.extractContent(fields);

      results.push({
        id,
        score,
        content,
        metadata: fields as Record<string, FieldValue>,
      });
    }

    return results;
  }

  /**
   * Extract content from fields.
   */
  private extractContent(fields: Record<string, unknown>): string | undefined {
    const contentValue = fields[this.defaultContentField];
    if (typeof contentValue === 'string') {
      return contentValue;
    }
    return undefined;
  }
}

/**
 * Create a RAG retriever instance.
 */
export function createRAGRetriever(client: MilvusClient): RAGRetriever {
  return new RAGRetriever(client);
}

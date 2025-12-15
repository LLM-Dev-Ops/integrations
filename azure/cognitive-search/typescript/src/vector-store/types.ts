/**
 * Azure Cognitive Search - Vector Store Types
 *
 * Types for the VectorStore abstraction following platform conventions.
 */

/** Vector document for storage */
export interface VectorDocument {
  /** Unique document ID */
  id: string;
  /** Text content */
  content: string;
  /** Vector embedding */
  vector: number[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/** Vector query parameters */
export interface VectorQuery {
  /** Query vector */
  vector: number[];
  /** Number of results to return */
  topK: number;
  /** Optional metadata filter */
  filter?: MetadataFilter;
  /** Minimum score threshold */
  minScore?: number;
  /** Include vectors in results */
  includeVectors?: boolean;
}

/** Metadata filter conditions */
export interface MetadataFilter {
  /** Filter conditions */
  conditions: FilterCondition[];
  /** Logical operator (default: 'and') */
  operator?: 'and' | 'or';
}

/** Single filter condition */
export interface FilterCondition {
  /** Field name (in metadata) */
  field: string;
  /** Comparison operator */
  operator: FilterOperator;
  /** Value to compare */
  value: FilterValue;
}

/** Filter operators */
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' | 'in' | 'contains';

/** Filter value types */
export type FilterValue = string | number | boolean | string[] | number[];

/** Vector search result */
export interface VectorSearchResult {
  /** Document ID */
  id: string;
  /** Text content */
  content: string;
  /** Similarity score */
  score: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Optional vector (if requested) */
  vector?: number[];
}

/** VectorStore configuration for ACS */
export interface VectorStoreConfig {
  /** Index name */
  indexName: string;
  /** Vector field name */
  vectorField: string;
  /** Key field name */
  keyField: string;
  /** Content field name */
  contentField: string;
  /** Metadata field name (optional, for nested metadata) */
  metadataField?: string;
  /** Vector dimensions */
  dimensions: number;
}

/** VectorStore interface */
export interface VectorStore {
  /** Insert or update documents */
  upsert(documents: VectorDocument[]): Promise<void>;
  /** Search for similar vectors */
  search(query: VectorQuery): Promise<VectorSearchResult[]>;
  /** Delete documents by IDs */
  delete(ids: string[]): Promise<void>;
  /** Get a document by ID */
  get(id: string): Promise<VectorDocument | null>;
}

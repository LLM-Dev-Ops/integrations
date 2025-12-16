/**
 * Statistics about a specific namespace
 */
export interface NamespaceStats {
  /**
   * Number of vectors in this namespace
   */
  vectorCount: number;
}

/**
 * Information about a namespace
 */
export interface NamespaceInfo {
  /**
   * Name of the namespace
   */
  name: string;

  /**
   * Number of vectors in this namespace
   */
  vectorCount: number;
}

/**
 * Overall statistics for a Pinecone index
 */
export interface IndexStats {
  /**
   * Map of namespace names to their statistics
   */
  namespaces?: Record<string, NamespaceStats>;

  /**
   * Dimension of vectors in the index
   */
  dimension?: number;

  /**
   * Fullness of the index (0-1)
   */
  indexFullness?: number;

  /**
   * Total number of vectors across all namespaces
   */
  totalVectorCount: number;
}

/**
 * Request to describe index statistics
 */
export interface DescribeIndexStatsRequest {
  /**
   * Optional filter to get stats for specific metadata
   */
  filter?: Record<string, unknown>;
}

/**
 * Response from describe index stats operation
 */
export interface DescribeIndexStatsResponse extends IndexStats {}

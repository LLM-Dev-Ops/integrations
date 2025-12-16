import type { Vector } from './vector.js';

/**
 * Request to fetch vectors by their IDs
 */
export interface FetchRequest {
  /**
   * IDs of vectors to fetch
   */
  ids: string[];

  /**
   * Namespace to fetch from
   */
  namespace?: string;
}

/**
 * Response from a fetch operation
 */
export interface FetchResponse {
  /**
   * Map of vector IDs to vector objects
   */
  vectors: Record<string, Vector>;

  /**
   * Namespace that was fetched from
   */
  namespace?: string;

  /**
   * Usage statistics for the fetch operation
   */
  usage?: {
    /**
     * Number of read units consumed
     */
    readUnits?: number;
  };
}

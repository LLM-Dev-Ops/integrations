import type { Vector } from './vector.js';

/**
 * Request to upsert (insert or update) vectors
 */
export interface UpsertRequest {
  /**
   * Namespace to upsert vectors into
   */
  namespace?: string;

  /**
   * Vectors to upsert
   */
  vectors: Vector[];
}

/**
 * Response from an upsert operation
 */
export interface UpsertResponse {
  /**
   * Number of vectors successfully upserted
   */
  upsertedCount: number;
}

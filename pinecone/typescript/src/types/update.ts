import type { Metadata } from './metadata.js';
import type { SparseValues } from './vector.js';

/**
 * Request to update a vector's values or metadata
 */
export interface UpdateRequest {
  /**
   * ID of the vector to update
   */
  id: string;

  /**
   * Namespace containing the vector
   */
  namespace?: string;

  /**
   * New dense vector values (optional)
   */
  values?: number[];

  /**
   * New sparse vector values (optional)
   */
  sparseValues?: SparseValues;

  /**
   * Metadata to set (replaces existing metadata)
   */
  setMetadata?: Metadata;
}

/**
 * Response from an update operation
 */
export interface UpdateResponse {
  /**
   * Indicates whether the update was successful
   */
  success?: boolean;
}

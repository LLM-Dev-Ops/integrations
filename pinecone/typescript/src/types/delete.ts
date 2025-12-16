import type { MetadataFilter } from './filter.js';

/**
 * Request to delete vectors
 */
export interface DeleteRequest {
  /**
   * Namespace to delete from
   */
  namespace?: string;

  /**
   * IDs of specific vectors to delete
   */
  ids?: string[];

  /**
   * Delete all vectors matching this metadata filter
   */
  filter?: MetadataFilter;

  /**
   * Delete all vectors in the namespace
   */
  deleteAll?: boolean;
}

/**
 * Response from a delete operation
 */
export interface DeleteResponse {
  /**
   * Indicates whether the deletion was successful
   */
  success?: boolean;
}

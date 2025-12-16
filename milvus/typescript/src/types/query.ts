import { ConsistencyLevel } from './consistency.js';
import { Entity } from './entity.js';

/**
 * Request for scalar query with filter expression.
 */
export interface QueryRequest {
  /** Collection to query */
  collectionName: string;
  /** Optional partition names */
  partitionNames?: string[];
  /** Filter expression (required) */
  filter: string;
  /** Fields to include in results */
  outputFields: string[];
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Consistency level override */
  consistencyLevel?: ConsistencyLevel;
}

/**
 * Response from a query operation.
 */
export interface QueryResponse {
  /** Matched entities */
  entities: Entity[];
}

/**
 * Request to get entities by primary keys.
 */
export interface GetRequest {
  /** Collection name */
  collectionName: string;
  /** Optional partition name */
  partitionName?: string;
  /** Primary key values */
  ids: bigint[];
  /** Fields to include in results */
  outputFields: string[];
  /** Consistency level override */
  consistencyLevel?: ConsistencyLevel;
}

/**
 * Response from a get operation.
 */
export interface GetResponse {
  /** Retrieved entities */
  entities: Entity[];
}

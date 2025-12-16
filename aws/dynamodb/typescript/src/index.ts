/**
 * AWS DynamoDB Integration
 *
 * This integration provides a type-safe, resilient interface for AWS DynamoDB operations
 * following the SPARC architecture principles.
 *
 * @module @integrations/aws-dynamodb
 */

// ============================================================================
// Configuration
// ============================================================================

export type {
  DynamoDBConfig,
  CredentialsConfig,
  RetryConfig,
  CircuitBreakerConfig,
} from './config/index.js';

export { DynamoDBConfigBuilder } from './config/index.js';

// ============================================================================
// Error Handling
// ============================================================================

export { DynamoDBError } from './error/index.js';

// ============================================================================
// Types
// ============================================================================

// Key and Attribute Types
export type { AttributeValue, Key } from './types/index.js';
export { createKey, withSortKey, toKeyMap } from './types/index.js';

// Item Types
export type { Item, ConsumedCapacity } from './types/index.js';

// Operation Options
export type {
  GetItemOptions,
  PutItemOptions,
  UpdateItemOptions,
  DeleteItemOptions,
  QueryOptions,
  ScanOptions,
} from './types/index.js';

// Operation Results
export type {
  GetItemResult,
  PutItemResult,
  UpdateItemResult,
  DeleteItemResult,
  QueryResult,
  ScanResult,
  BatchGetResult,
  BatchWriteResult,
  WriteRequest,
} from './types/index.js';

// Batch and Transaction Types
export type { TransactWriteItem, TransactGetItem } from './types/index.js';

// ============================================================================
// Operations
// ============================================================================

export * from './operations/index.js';

// ============================================================================
// Batch Operations
// ============================================================================

export * from './batch/index.js';

// ============================================================================
// Transactions
// ============================================================================

export * from './transaction/index.js';

// ============================================================================
// Builders
// ============================================================================

export * from './builders/index.js';

// ============================================================================
// Observability
// ============================================================================

export * from './observability/index.js';

// ============================================================================
// Resilience
// ============================================================================

export * from './resilience/index.js';

// ============================================================================
// Client
// ============================================================================

export * from './client/index.js';

// ============================================================================
// Version
// ============================================================================

export const DYNAMODB_INTEGRATION_VERSION = '0.1.0';

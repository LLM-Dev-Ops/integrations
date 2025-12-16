/**
 * DynamoDB Configuration
 *
 * Configuration interfaces and utilities for DynamoDB client.
 */

export type {
  DynamoDBConfig,
  CredentialsConfig,
  RetryConfig,
  CircuitBreakerConfig,
} from './config.js';

export { DynamoDBConfigBuilder } from './config.js';

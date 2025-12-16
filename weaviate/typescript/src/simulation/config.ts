/**
 * Mock configuration types
 *
 * This module defines configuration options for the mock Weaviate client.
 */

import type { DistanceMetric } from '../types/vector.js';
import type { SearchResult } from '../types/search.js';
import type { WeaviateError } from '../errors/index.js';

/**
 * Mock configuration options
 *
 * Controls the behavior of the MockWeaviateClient for testing scenarios.
 */
export interface MockConfig {
  /**
   * Distance metric to use for vector similarity calculations
   * @default DistanceMetric.Cosine
   */
  distanceMetric: DistanceMetric;

  /**
   * Simulated latency in milliseconds
   * Adds artificial delay to all operations to simulate network latency
   */
  simulatedLatency?: number;

  /**
   * Random error rate (0.0 - 1.0)
   * Probability that an operation will randomly fail
   * Useful for testing error handling
   */
  errorRate?: number;

  /**
   * Pattern-based error injection
   * Map of operation patterns to errors that should be thrown
   * Pattern format: "operationType:className" or just "operationType"
   */
  errorPatterns?: Map<string, WeaviateError>;

  /**
   * Pre-configured search responses
   * Map of class names to search results that should be returned
   * Bypasses actual vector similarity calculation
   */
  searchResponses?: Map<string, SearchResult>;

  /**
   * Whether to record all operations
   * @default true
   */
  recordOperations?: boolean;

  /**
   * Whether to validate objects against schema
   * @default false
   */
  validateSchema?: boolean;

  /**
   * Maximum number of objects to store per class
   * Prevents memory issues in long-running tests
   */
  maxObjectsPerClass?: number;
}

/**
 * Default mock configuration
 */
export const DEFAULT_MOCK_CONFIG: MockConfig = {
  distanceMetric: 'cosine' as DistanceMetric,
  recordOperations: true,
  validateSchema: false,
};

/**
 * Creates a mock configuration with defaults
 *
 * @param overrides - Partial configuration to override defaults
 * @returns Complete mock configuration
 */
export function createMockConfig(overrides?: Partial<MockConfig>): MockConfig {
  return {
    ...DEFAULT_MOCK_CONFIG,
    ...overrides,
  };
}

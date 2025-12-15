/**
 * AWS CloudWatch Logs Correlation Module
 *
 * Provides functionality for correlating log events across multiple log groups
 * using trace IDs, request IDs, and span IDs.
 *
 * @module correlation
 */

// Export types
export type {
  CorrelationType,
  CorrelatedEvent,
  CorrelationResult,
} from './types.js';

// Export parser
export { parseCorrelationIds } from './parser.js';
export type { ParsedCorrelationIds } from './parser.js';

// Export engine
export type { CorrelationEngine } from './engine.js';
export { DefaultCorrelationEngine } from './engine.js';

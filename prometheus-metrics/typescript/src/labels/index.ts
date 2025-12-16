/**
 * Label utilities for Prometheus metrics.
 *
 * This module provides comprehensive label management functionality including:
 * - Label name and metric name validation
 * - Label value sanitization and escaping
 * - Efficient label set storage with pre-computed hashing
 * - High-cardinality detection
 *
 * @module labels
 *
 * @example
 * ```typescript
 * import {
 *   isValidLabelName,
 *   isValidMetricName,
 *   sanitizeMetricName,
 *   sanitizeLabelValue,
 *   LabelSet,
 *   validateLabelSet
 * } from './labels/index.js';
 *
 * // Validate label names
 * if (isValidLabelName('http_method')) {
 *   console.log('Valid label name');
 * }
 *
 * // Sanitize metric names
 * const metricName = sanitizeMetricName('http-requests-total');
 * // 'http_requests_total'
 *
 * // Create and use label sets
 * const labels = LabelSet.from({
 *   method: 'GET',
 *   status: '200',
 *   endpoint: '/api/users'
 * });
 *
 * // Validate entire label sets
 * const validation = validateLabelSet({
 *   method: 'GET',
 *   request_id: '550e8400-e29b-41d4-a716-446655440000'
 * });
 * if (!validation.valid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 * ```
 */

// Validation exports
export {
  isValidLabelName,
  isValidMetricName,
  isHighCardinalityValue,
  validateLabelSet,
  type ValidationResult,
} from './validation.js';

// Sanitization exports
export {
  sanitizeMetricName,
  sanitizeLabelValue,
  sanitizeLabelSet,
  buildMetricName,
  MAX_LABEL_VALUE_LENGTH,
} from './sanitization.js';

// Label set exports
export { LabelSet, createLabelKey } from './label-set.js';

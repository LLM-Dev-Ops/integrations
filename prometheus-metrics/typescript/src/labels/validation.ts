/**
 * Label and metric name validation utilities for Prometheus metrics.
 * Implements validation rules per the Prometheus specification.
 */

/**
 * Result of validating a label set.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a Prometheus label name.
 * Label names must match [a-zA-Z_][a-zA-Z0-9_]*
 * Labels starting with __ are reserved for internal use.
 *
 * @param name - The label name to validate
 * @returns true if the label name is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidLabelName('status')     // true
 * isValidLabelName('http_code')  // true
 * isValidLabelName('__internal') // false (reserved)
 * isValidLabelName('123_abc')    // false (starts with digit)
 * isValidLabelName('')           // false (empty)
 * ```
 */
export function isValidLabelName(name: string): boolean {
  // Label names must not be empty
  if (!name || name.length === 0) {
    return false;
  }

  // Labels starting with __ are reserved for internal use
  if (name.startsWith('__')) {
    return false;
  }

  // First character must be [a-zA-Z_]
  const firstChar = name.charAt(0);
  if (!/[a-zA-Z_]/.test(firstChar)) {
    return false;
  }

  // Remaining characters must be [a-zA-Z0-9_]
  for (let i = 1; i < name.length; i++) {
    if (!/[a-zA-Z0-9_]/.test(name.charAt(i))) {
      return false;
    }
  }

  return true;
}

/**
 * Validates a Prometheus metric name.
 * Metric names must match [a-zA-Z_:][a-zA-Z0-9_:]*
 * Note: Colons are reserved for user-defined recording rules.
 *
 * @param name - The metric name to validate
 * @returns true if the metric name is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidMetricName('http_requests_total')      // true
 * isValidMetricName('node_cpu:seconds')         // true (colon allowed)
 * isValidMetricName('requests_total')           // true
 * isValidMetricName('123_requests')             // false (starts with digit)
 * isValidMetricName('')                         // false (empty)
 * isValidMetricName('requests-total')           // false (hyphen not allowed)
 * ```
 */
export function isValidMetricName(name: string): boolean {
  // Metric names must not be empty
  if (!name || name.length === 0) {
    return false;
  }

  // First character must be [a-zA-Z_:]
  const firstChar = name.charAt(0);
  if (!/[a-zA-Z_:]/.test(firstChar)) {
    return false;
  }

  // Remaining characters must be [a-zA-Z0-9_:]
  for (let i = 1; i < name.length; i++) {
    if (!/[a-zA-Z0-9_:]/.test(name.charAt(i))) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a label value appears to be high-cardinality.
 * High-cardinality values can cause performance issues in Prometheus.
 * Detects:
 * - UUID patterns (8-4-4-4-12 format)
 * - Timestamp patterns (ISO 8601, Unix timestamps)
 * - Very long values (> 64 characters)
 *
 * @param value - The label value to check
 * @returns true if the value appears to be high-cardinality, false otherwise
 *
 * @example
 * ```typescript
 * isHighCardinalityValue('550e8400-e29b-41d4-a716-446655440000') // true (UUID)
 * isHighCardinalityValue('2024-12-16T10:30:00Z')                 // true (timestamp)
 * isHighCardinalityValue('1702729800')                           // true (unix timestamp)
 * isHighCardinalityValue('a'.repeat(100))                        // true (very long)
 * isHighCardinalityValue('success')                              // false
 * ```
 */
export function isHighCardinalityValue(value: string): boolean {
  // Check for empty or very short values first (common case)
  if (!value || value.length <= 8) {
    return false;
  }

  // Very long values (> 64 characters) are likely high-cardinality
  if (value.length > 64) {
    return true;
  }

  // UUID pattern: 8-4-4-4-12 hexadecimal format
  // Example: 550e8400-e29b-41d4-a716-446655440000
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(value)) {
    return true;
  }

  // ISO 8601 timestamp pattern
  // Examples: 2024-12-16T10:30:00Z, 2024-12-16T10:30:00.123Z, 2024-12-16T10:30:00+00:00
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/;
  if (iso8601Pattern.test(value)) {
    return true;
  }

  // Unix timestamp pattern (10 digits for seconds, 13 for milliseconds)
  // Must be all digits and reasonable length
  const unixTimestampPattern = /^\d{10,13}$/;
  if (unixTimestampPattern.test(value)) {
    return true;
  }

  // RFC 3339 / date-time patterns (common variations)
  const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
  if (rfc3339Pattern.test(value)) {
    return true;
  }

  return false;
}

/**
 * Validates an entire label set.
 * Checks that all label names are valid and warns about potential high-cardinality values.
 *
 * @param labels - The label set to validate (map of label name to value)
 * @returns ValidationResult with valid flag and any error messages
 *
 * @example
 * ```typescript
 * const result = validateLabelSet({
 *   method: 'GET',
 *   status: '200',
 *   endpoint: '/api/users'
 * });
 * // { valid: true, errors: [] }
 *
 * const invalid = validateLabelSet({
 *   '123invalid': 'value',
 *   '__reserved': 'internal',
 *   request_id: '550e8400-e29b-41d4-a716-446655440000'
 * });
 * // {
 * //   valid: false,
 * //   errors: [
 * //     'Invalid label name: 123invalid',
 * //     'Invalid label name: __reserved (reserved prefix)',
 * //     'High cardinality label value detected: request_id=550e8400-e29b-41d4-a716-446655440000'
 * //   ]
 * // }
 * ```
 */
export function validateLabelSet(labels: Record<string, string>): ValidationResult {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(labels)) {
    // Validate label name
    if (!isValidLabelName(key)) {
      if (key.startsWith('__')) {
        errors.push(`Invalid label name: ${key} (reserved prefix)`);
      } else if (key.length === 0) {
        errors.push('Invalid label name: empty string');
      } else if (!/[a-zA-Z_]/.test(key.charAt(0))) {
        errors.push(`Invalid label name: ${key} (must start with letter or underscore)`);
      } else {
        errors.push(`Invalid label name: ${key} (contains invalid characters)`);
      }
    }

    // Check for high-cardinality values
    if (isHighCardinalityValue(value)) {
      errors.push(
        `High cardinality label value detected: ${key}=${value}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

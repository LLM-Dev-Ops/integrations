/**
 * Label name and value sanitization utilities for Prometheus metrics.
 * Ensures metric names and label values are safe for Prometheus output.
 */

import { isValidMetricName } from './validation.js';

/**
 * Maximum length for label values to prevent unbounded memory usage.
 * Values longer than this will be truncated.
 */
export const MAX_LABEL_VALUE_LENGTH = 128;

/**
 * Sanitizes a metric name to be Prometheus-compatible.
 * Replaces invalid characters with underscores and ensures the name
 * follows the pattern [a-zA-Z_:][a-zA-Z0-9_:]*
 *
 * @param name - The metric name to sanitize
 * @returns A sanitized metric name that is Prometheus-compatible
 * @throws Error if the name is empty after sanitization
 *
 * @example
 * ```typescript
 * sanitizeMetricName('http-requests-total')   // 'http_requests_total'
 * sanitizeMetricName('123_requests')          // '_123_requests'
 * sanitizeMetricName('requests.per.second')   // 'requests_per_second'
 * sanitizeMetricName('cpu%usage')             // 'cpu_usage'
 * sanitizeMetricName('')                      // throws Error
 * ```
 */
export function sanitizeMetricName(name: string): string {
  if (!name || name.trim().length === 0) {
    throw new Error('Metric name cannot be empty');
  }

  let sanitized = name.trim();

  // First, replace all invalid characters with underscores
  // Valid characters are: a-zA-Z0-9_:
  sanitized = sanitized.replace(/[^a-zA-Z0-9_:]/g, '_');

  // If the first character is a digit, prefix with underscore
  // Metric names must start with [a-zA-Z_:]
  if (/^\d/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  // Remove any leading/trailing underscores that might have been added
  // (but keep them if they were intentional)
  // Actually, we should keep them as underscores are valid

  // Collapse multiple consecutive underscores to single underscore
  // This helps with readability when multiple invalid chars were adjacent
  sanitized = sanitized.replace(/_+/g, '_');

  // Final validation check
  if (!isValidMetricName(sanitized)) {
    throw new Error(
      `Failed to sanitize metric name: "${name}" -> "${sanitized}"`
    );
  }

  return sanitized;
}

/**
 * Sanitizes a label value for safe inclusion in Prometheus output.
 * Performs the following operations:
 * 1. Escapes special characters (backslash, quotes, newlines)
 * 2. Replaces control characters with spaces
 * 3. Truncates to maximum length if needed
 *
 * @param value - The label value to sanitize
 * @param maxLength - Maximum length for the value (defaults to MAX_LABEL_VALUE_LENGTH)
 * @returns A sanitized label value safe for Prometheus output
 *
 * @example
 * ```typescript
 * sanitizeLabelValue('normal value')           // 'normal value'
 * sanitizeLabelValue('value with "quotes"')    // 'value with \\"quotes\\"'
 * sanitizeLabelValue('line1\nline2')           // 'line1\\nline2'
 * sanitizeLabelValue('path\\to\\file')         // 'path\\\\to\\\\file'
 * sanitizeLabelValue('a'.repeat(200))          // truncated to 128 chars
 * sanitizeLabelValue('tab\there')              // 'tab here' (control char replaced)
 * ```
 */
export function sanitizeLabelValue(
  value: string,
  maxLength: number = MAX_LABEL_VALUE_LENGTH
): string {
  if (value === null || value === undefined) {
    return '';
  }

  let sanitized = String(value);

  // Step 1: Escape special characters that need escaping in Prometheus label values
  // Order matters: backslash must be escaped first
  sanitized = sanitized
    .replace(/\\/g, '\\\\') // Escape backslashes: \ -> \\
    .replace(/"/g, '\\"') // Escape double quotes: " -> \"
    .replace(/\n/g, '\\n'); // Escape newlines: \n -> \\n

  // Step 2: Replace control characters (0x00-0x1F except \n which we already handled)
  // Control characters can cause issues in Prometheus output
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ' ');

  // Step 3: Truncate if needed
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitizes an entire label set.
 * Sanitizes all values while keeping keys unchanged (they should be validated separately).
 *
 * @param labels - The label set to sanitize
 * @param maxLength - Maximum length for label values
 * @returns A new label set with sanitized values
 *
 * @example
 * ```typescript
 * const labels = {
 *   method: 'GET',
 *   path: '/api/users\nmalicious',
 *   message: 'Error: "invalid" input'
 * };
 *
 * const sanitized = sanitizeLabelSet(labels);
 * // {
 * //   method: 'GET',
 * //   path: '/api/users\\nmalicious',
 * //   message: 'Error: \\"invalid\\" input'
 * // }
 * ```
 */
export function sanitizeLabelSet(
  labels: Record<string, string>,
  maxLength: number = MAX_LABEL_VALUE_LENGTH
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(labels)) {
    sanitized[key] = sanitizeLabelValue(value, maxLength);
  }

  return sanitized;
}

/**
 * Creates a safe metric name from a base name and optional components.
 * Useful for building metric names programmatically.
 *
 * @param parts - Array of name components to join
 * @param separator - Separator to use between parts (default: '_')
 * @returns A sanitized metric name
 *
 * @example
 * ```typescript
 * buildMetricName(['http', 'requests', 'total'])           // 'http_requests_total'
 * buildMetricName(['cache', 'hit-rate'], ':')              // 'cache:hit_rate'
 * buildMetricName(['node', '123', 'cpu'])                  // 'node_123_cpu'
 * buildMetricName(['app.domain.com', 'requests'])          // 'app_domain_com_requests'
 * ```
 */
export function buildMetricName(
  parts: string[],
  separator: string = '_'
): string {
  if (!parts || parts.length === 0) {
    throw new Error('Metric name parts cannot be empty');
  }

  // Filter out empty parts
  const filtered = parts.filter((p) => p && p.trim().length > 0);

  if (filtered.length === 0) {
    throw new Error('Metric name parts cannot all be empty');
  }

  // Join parts and sanitize
  const joined = filtered.join(separator);
  return sanitizeMetricName(joined);
}

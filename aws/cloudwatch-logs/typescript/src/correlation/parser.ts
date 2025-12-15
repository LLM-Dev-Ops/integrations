/**
 * AWS CloudWatch Logs Message Parser
 *
 * Parses log messages to extract correlation IDs (trace_id, request_id, span_id)
 * and other structured fields.
 *
 * @module correlation/parser
 */

/**
 * Parsed correlation IDs and fields from a log message.
 */
export interface ParsedCorrelationIds {
  /** Trace ID extracted from the message */
  traceId?: string;

  /** Request ID extracted from the message */
  requestId?: string;

  /** Span ID extracted from the message */
  spanId?: string;

  /** All parsed fields from the message */
  parsedFields: Record<string, unknown>;
}

/**
 * Parse correlation IDs from a log message.
 *
 * This function attempts to parse the message as JSON and extract common
 * correlation ID fields. It handles both snake_case and camelCase naming
 * conventions.
 *
 * If the message is not valid JSON, it returns empty correlation IDs but
 * does not throw an error (graceful handling).
 *
 * @param message - The log message to parse
 * @returns Parsed correlation IDs and fields
 *
 * @example
 * ```typescript
 * // JSON message with correlation IDs
 * const result = parseCorrelationIds(
 *   '{"level":"INFO","message":"Request processed","trace_id":"abc-123"}'
 * );
 * console.log(result.traceId); // "abc-123"
 *
 * // Non-JSON message
 * const result2 = parseCorrelationIds("Plain text log message");
 * console.log(result2.traceId); // undefined
 * console.log(result2.parsedFields); // {}
 * ```
 */
export function parseCorrelationIds(message: string): ParsedCorrelationIds {
  const result: ParsedCorrelationIds = {
    parsedFields: {},
  };

  // Try to parse as JSON
  let parsed: any = null;
  try {
    parsed = JSON.parse(message);

    // Only process if it's an object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return result;
    }

    // Store all parsed fields
    result.parsedFields = { ...parsed };
  } catch {
    // Not JSON - return empty result
    return result;
  }

  // Extract trace ID (try both snake_case and camelCase)
  result.traceId =
    extractStringField(parsed, 'trace_id') ||
    extractStringField(parsed, 'traceId');

  // Extract request ID (try both snake_case and camelCase)
  result.requestId =
    extractStringField(parsed, 'request_id') ||
    extractStringField(parsed, 'requestId');

  // Extract span ID (try both snake_case and camelCase)
  result.spanId =
    extractStringField(parsed, 'span_id') ||
    extractStringField(parsed, 'spanId');

  return result;
}

/**
 * Extract a string field from a parsed object.
 *
 * Returns the field value if it's a string, otherwise undefined.
 *
 * @param obj - The parsed object
 * @param field - The field name to extract
 * @returns The field value as a string, or undefined
 */
function extractStringField(obj: any, field: string): string | undefined {
  const value = obj[field];

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return undefined;
}

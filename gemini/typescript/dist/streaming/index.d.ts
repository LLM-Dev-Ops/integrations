/**
 * Streaming utilities for Gemini API responses.
 *
 * This module provides utilities for parsing and accumulating streaming responses
 * from the Gemini API, which uses a chunked JSON array format.
 *
 * @example
 * ```typescript
 * import { ChunkedJsonParser, StreamAccumulator } from '@integrations/gemini/streaming';
 *
 * const parser = new ChunkedJsonParser();
 * const accumulator = new StreamAccumulator();
 *
 * // Parse and accumulate chunks
 * for await (const chunk of stream) {
 *   const responses = parser.parse(chunk);
 *   for (const response of responses) {
 *     accumulator.add(response);
 *   }
 * }
 *
 * // Get the final response
 * const final = accumulator.build();
 * ```
 */
export { ChunkedJsonParser } from './chunked-json.js';
export { StreamAccumulator, type AccumulatorOptions } from './accumulator.js';
//# sourceMappingURL=index.d.ts.map
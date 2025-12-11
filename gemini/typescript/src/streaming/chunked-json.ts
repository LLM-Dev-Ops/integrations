/**
 * Chunked JSON parser for Gemini's streaming response format.
 *
 * Gemini uses a chunked JSON array format (not Server-Sent Events).
 * The response is a stream of JSON objects within an array:
 * [{"candidates":[...],"usageMetadata":...},
 * {"candidates":[...],"usageMetadata":...}]
 *
 * This parser handles:
 * - Complete JSON objects in a single chunk
 * - JSON objects split across multiple chunks
 * - Array opening/closing brackets
 * - Comma separators between objects
 * - Escaped characters in strings
 * - Nested objects and arrays
 * - Empty streams
 * - Stream interruptions
 */

import type { GenerateContentResponse } from '../types/index.js';

/**
 * Parser for chunked JSON streaming responses.
 *
 * Handles Gemini's streaming format which sends an array of JSON objects.
 * Objects may be split across chunks, requiring buffering and state tracking.
 *
 * @example
 * ```typescript
 * const parser = new ChunkedJsonParser();
 *
 * // Feed chunks to the parser
 * const chunks1 = parser.feed('[{"candidates":[{"content"');
 * // chunks1 = [] (incomplete object)
 *
 * const chunks2 = parser.feed(':{"parts":[{"text":"Hello"}]}}]');
 * // chunks2 = [{ candidates: [{ content: { parts: [{ text: "Hello" }] } }] }]
 * ```
 */
export class ChunkedJsonParser {
  private buffer = '';

  /**
   * Feed data to the parser and extract complete JSON objects.
   *
   * This method processes incoming data chunks and returns any complete
   * JSON objects found. Incomplete objects are buffered until more data arrives.
   *
   * @param data - The incoming data chunk
   * @returns Array of parsed response objects
   */
  feed(data: string): GenerateContentResponse[] {
    this.buffer += data;
    const results: GenerateContentResponse[] = [];

    while (true) {
      const result = this.tryExtractObject();
      if (result === null) break;
      results.push(result);
    }

    return results;
  }

  /**
   * Try to extract a complete JSON object from the buffer.
   *
   * @returns A parsed response object or null if no complete object is available
   */
  private tryExtractObject(): GenerateContentResponse | null {
    this.skipWhitespaceAndDelimiters();

    if (this.buffer.length === 0) return null;

    // Handle array brackets
    if (this.buffer.startsWith('[')) {
      this.buffer = this.buffer.slice(1);
      return this.tryExtractObject();
    }

    if (this.buffer.startsWith(']')) {
      this.buffer = this.buffer.slice(1);
      return null;
    }

    // Try to extract JSON object
    const extracted = extractJsonObject(this.buffer);
    if (extracted) {
      const [jsonStr, remaining] = extracted;
      this.buffer = remaining;
      try {
        return JSON.parse(jsonStr) as GenerateContentResponse;
      } catch {
        // Skip invalid JSON and continue
        return null;
      }
    }

    return null;
  }

  /**
   * Skip whitespace and delimiters at the beginning of the buffer.
   */
  private skipWhitespaceAndDelimiters(): void {
    let i = 0;
    while (i < this.buffer.length) {
      const c = this.buffer[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === ',') {
        i++;
      } else {
        break;
      }
    }
    this.buffer = this.buffer.slice(i);
  }

  /**
   * Flush any remaining buffered data and try to parse it.
   * Call this when the stream ends.
   *
   * @returns Final parsed response object or null
   */
  flush(): GenerateContentResponse | null {
    this.skipWhitespaceAndDelimiters();

    if (this.buffer.length === 0 || this.buffer === ']') {
      return null;
    }

    return this.tryExtractObject();
  }

  /**
   * Reset the parser to initial state.
   */
  reset(): void {
    this.buffer = '';
  }
}

/**
 * Extract a complete JSON object from the beginning of the input string.
 *
 * Handles nested objects, arrays, and escaped strings correctly.
 * This function properly tracks:
 * - Brace and bracket depth for nested structures
 * - String boundaries to ignore JSON syntax within strings
 * - Escape sequences within strings
 *
 * @param input - The input string that may contain a JSON object at the beginning
 * @returns A tuple of [object_string, remaining_string] if a complete object is found,
 *          or null if the object is incomplete
 */
function extractJsonObject(input: string): [string, string] | null {
  if (!input.startsWith('{')) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    switch (char) {
      case '\\':
        if (inString) escapeNext = true;
        break;
      case '"':
        inString = !inString;
        break;
      case '{':
      case '[':
        if (!inString) depth++;
        break;
      case '}':
      case ']':
        if (!inString) {
          depth--;
          if (depth === 0) {
            return [input.slice(0, i + 1), input.slice(i + 1)];
          }
        }
        break;
    }
  }

  return null; // Incomplete
}

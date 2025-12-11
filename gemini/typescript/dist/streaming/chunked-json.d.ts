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
export declare class ChunkedJsonParser {
    private buffer;
    /**
     * Feed data to the parser and extract complete JSON objects.
     *
     * This method processes incoming data chunks and returns any complete
     * JSON objects found. Incomplete objects are buffered until more data arrives.
     *
     * @param data - The incoming data chunk
     * @returns Array of parsed response objects
     */
    feed(data: string): GenerateContentResponse[];
    /**
     * Try to extract a complete JSON object from the buffer.
     *
     * @returns A parsed response object or null if no complete object is available
     */
    private tryExtractObject;
    /**
     * Skip whitespace and delimiters at the beginning of the buffer.
     */
    private skipWhitespaceAndDelimiters;
    /**
     * Flush any remaining buffered data and try to parse it.
     * Call this when the stream ends.
     *
     * @returns Final parsed response object or null
     */
    flush(): GenerateContentResponse | null;
    /**
     * Reset the parser to initial state.
     */
    reset(): void;
}
//# sourceMappingURL=chunked-json.d.ts.map
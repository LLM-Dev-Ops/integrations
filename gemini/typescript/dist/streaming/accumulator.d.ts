/**
 * Stream accumulator for combining Gemini response chunks.
 *
 * Accumulates streaming response chunks into a final complete response,
 * combining text content, tracking usage statistics, and handling candidates.
 */
import type { GenerateContentResponse } from '../types/index.js';
/**
 * Options for stream accumulation.
 */
export interface AccumulatorOptions {
    /**
     * Whether to merge text parts within the same candidate.
     * @default true
     */
    mergeTextParts?: boolean;
    /**
     * Whether to track cumulative usage metadata.
     * @default true
     */
    trackUsage?: boolean;
}
/**
 * Accumulator for combining streaming response chunks.
 *
 * Takes individual chunks from a streaming response and combines them into
 * a single final response. Handles:
 * - Merging text content from multiple chunks
 * - Combining candidates from multiple chunks
 * - Accumulating usage metadata
 * - Preserving safety ratings and other metadata
 *
 * @example
 * ```typescript
 * const accumulator = new StreamAccumulator();
 *
 * for await (const chunk of stream) {
 *   accumulator.add(chunk);
 * }
 *
 * const finalResponse = accumulator.build();
 * console.log(finalResponse.candidates[0].content.parts[0].text);
 * ```
 */
export declare class StreamAccumulator {
    private candidates;
    private usageMetadata?;
    private modelVersion?;
    private readonly options;
    /**
     * Create a new stream accumulator.
     *
     * @param options - Configuration options
     */
    constructor(options?: AccumulatorOptions);
    /**
     * Add a chunk to the accumulator.
     *
     * @param chunk - The response chunk to add
     */
    add(chunk: GenerateContentResponse): void;
    /**
     * Add or merge a candidate.
     *
     * @param candidate - The candidate to add
     */
    private addCandidate;
    /**
     * Merge a new candidate chunk into an existing candidate.
     *
     * @param existing - The existing candidate
     * @param incoming - The new candidate chunk
     */
    private mergeCandidate;
    /**
     * Add a part to the content, merging text parts if enabled.
     *
     * @param content - The content to add to
     * @param part - The part to add
     */
    private addPart;
    /**
     * Accumulate usage metadata.
     *
     * @param usage - The usage metadata to accumulate
     */
    private accumulateUsage;
    /**
     * Build the final accumulated response.
     *
     * @returns The complete accumulated response
     */
    build(): GenerateContentResponse;
    /**
     * Get the current accumulated response without finalizing.
     * Useful for getting intermediate results.
     *
     * @returns The current accumulated response
     */
    peek(): GenerateContentResponse;
    /**
     * Get accumulated text from the first candidate.
     * Convenience method for simple use cases.
     *
     * @returns The accumulated text or empty string
     */
    getText(): string;
    /**
     * Reset the accumulator to initial state.
     */
    reset(): void;
    /**
     * Get the number of candidates accumulated so far.
     *
     * @returns The number of candidates
     */
    get candidateCount(): number;
    /**
     * Check if the accumulator has any data.
     *
     * @returns True if the accumulator has data
     */
    get isEmpty(): boolean;
}
//# sourceMappingURL=accumulator.d.ts.map
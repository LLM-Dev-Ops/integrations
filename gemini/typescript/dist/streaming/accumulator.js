/**
 * Stream accumulator for combining Gemini response chunks.
 *
 * Accumulates streaming response chunks into a final complete response,
 * combining text content, tracking usage statistics, and handling candidates.
 */
import { isTextPart } from '../types/index.js';
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
export class StreamAccumulator {
    candidates = new Map();
    usageMetadata;
    modelVersion;
    options;
    /**
     * Create a new stream accumulator.
     *
     * @param options - Configuration options
     */
    constructor(options = {}) {
        this.options = {
            mergeTextParts: options.mergeTextParts ?? true,
            trackUsage: options.trackUsage ?? true,
        };
    }
    /**
     * Add a chunk to the accumulator.
     *
     * @param chunk - The response chunk to add
     */
    add(chunk) {
        // Update model version if present
        if (chunk.modelVersion) {
            this.modelVersion = chunk.modelVersion;
        }
        // Accumulate usage metadata
        if (this.options.trackUsage && chunk.usageMetadata) {
            this.accumulateUsage(chunk.usageMetadata);
        }
        // Process candidates
        if (chunk.candidates) {
            for (const candidate of chunk.candidates) {
                this.addCandidate(candidate);
            }
        }
    }
    /**
     * Add or merge a candidate.
     *
     * @param candidate - The candidate to add
     */
    addCandidate(candidate) {
        const index = candidate.index ?? 0;
        const existing = this.candidates.get(index);
        if (!existing) {
            // First chunk for this candidate - store it
            this.candidates.set(index, { ...candidate });
            return;
        }
        // Merge with existing candidate
        this.mergeCandidate(existing, candidate);
    }
    /**
     * Merge a new candidate chunk into an existing candidate.
     *
     * @param existing - The existing candidate
     * @param incoming - The new candidate chunk
     */
    mergeCandidate(existing, incoming) {
        // Merge content parts
        if (incoming.content?.parts) {
            if (!existing.content) {
                existing.content = { parts: [] };
            }
            if (!existing.content.parts) {
                existing.content.parts = [];
            }
            for (const part of incoming.content.parts) {
                this.addPart(existing.content, part);
            }
            // Update role if specified
            if (incoming.content.role) {
                existing.content.role = incoming.content.role;
            }
        }
        // Update finish reason (use the last one)
        if (incoming.finishReason) {
            existing.finishReason = incoming.finishReason;
        }
        // Merge safety ratings (use the latest)
        if (incoming.safetyRatings) {
            existing.safetyRatings = incoming.safetyRatings;
        }
        // Merge citation metadata
        if (incoming.citationMetadata) {
            if (!existing.citationMetadata) {
                existing.citationMetadata = { citationSources: [] };
            }
            existing.citationMetadata.citationSources.push(...(incoming.citationMetadata.citationSources || []));
        }
        // Merge grounding metadata (use the latest)
        if (incoming.groundingMetadata) {
            existing.groundingMetadata = incoming.groundingMetadata;
        }
        // Update token count
        if (incoming.tokenCount !== undefined) {
            existing.tokenCount = incoming.tokenCount;
        }
    }
    /**
     * Add a part to the content, merging text parts if enabled.
     *
     * @param content - The content to add to
     * @param part - The part to add
     */
    addPart(content, part) {
        if (!this.options.mergeTextParts || !isTextPart(part)) {
            // Not a text part or merging disabled - just append
            content.parts.push(part);
            return;
        }
        // Try to merge with the last part if it's also a text part
        const lastPart = content.parts[content.parts.length - 1];
        if (lastPart && isTextPart(lastPart)) {
            // Merge with existing text part
            lastPart.text += part.text;
        }
        else {
            // No existing text part to merge with
            content.parts.push(part);
        }
    }
    /**
     * Accumulate usage metadata.
     *
     * @param usage - The usage metadata to accumulate
     */
    accumulateUsage(usage) {
        if (!this.usageMetadata) {
            this.usageMetadata = { ...usage };
            return;
        }
        // Use the latest token counts (they should be cumulative in the stream)
        this.usageMetadata.promptTokenCount = usage.promptTokenCount;
        this.usageMetadata.totalTokenCount = usage.totalTokenCount;
        if (usage.candidatesTokenCount !== undefined) {
            this.usageMetadata.candidatesTokenCount = usage.candidatesTokenCount;
        }
        if (usage.cachedContentTokenCount !== undefined) {
            this.usageMetadata.cachedContentTokenCount = usage.cachedContentTokenCount;
        }
    }
    /**
     * Build the final accumulated response.
     *
     * @returns The complete accumulated response
     */
    build() {
        const candidates = Array.from(this.candidates.values()).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const response = {};
        if (candidates.length > 0) {
            response.candidates = candidates;
        }
        if (this.usageMetadata) {
            response.usageMetadata = this.usageMetadata;
        }
        if (this.modelVersion) {
            response.modelVersion = this.modelVersion;
        }
        return response;
    }
    /**
     * Get the current accumulated response without finalizing.
     * Useful for getting intermediate results.
     *
     * @returns The current accumulated response
     */
    peek() {
        return this.build();
    }
    /**
     * Get accumulated text from the first candidate.
     * Convenience method for simple use cases.
     *
     * @returns The accumulated text or empty string
     */
    getText() {
        const candidate = this.candidates.get(0);
        if (!candidate?.content?.parts) {
            return '';
        }
        return candidate.content.parts
            .filter(isTextPart)
            .map((part) => part.text)
            .join('');
    }
    /**
     * Reset the accumulator to initial state.
     */
    reset() {
        this.candidates.clear();
        this.usageMetadata = undefined;
        this.modelVersion = undefined;
    }
    /**
     * Get the number of candidates accumulated so far.
     *
     * @returns The number of candidates
     */
    get candidateCount() {
        return this.candidates.size;
    }
    /**
     * Check if the accumulator has any data.
     *
     * @returns True if the accumulator has data
     */
    get isEmpty() {
        return this.candidates.size === 0;
    }
}
//# sourceMappingURL=accumulator.js.map
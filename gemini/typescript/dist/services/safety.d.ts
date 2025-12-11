/**
 * Safety checking utilities for Gemini API responses.
 *
 * This module provides functions to detect and handle safety-related
 * response blocking, including safety filters and recitation detection.
 */
import type { GenerateContentResponse } from '../types/index.js';
/**
 * Checks for safety blocks in a GenerateContentResponse.
 * Throws appropriate errors if content is blocked.
 *
 * This function checks both:
 * 1. Prompt feedback for input blocking
 * 2. Candidate finish reasons for output blocking
 *
 * @param response - The response to check
 * @throws {SafetyBlockedError} If content is blocked due to safety filters
 * @throws {RecitationBlockedError} If content is blocked due to recitation detection
 */
export declare function checkSafetyBlocks(response: GenerateContentResponse): void;
/**
 * Checks if a response has any safety concerns (non-throwing).
 * Useful for logging or metrics without interrupting flow.
 *
 * @param response - The response to check
 * @returns True if safety concerns exist, false otherwise
 */
export declare function hasSafetyConcerns(response: GenerateContentResponse): boolean;
/**
 * Gets a summary of safety ratings from a response.
 * Useful for logging and debugging.
 *
 * @param response - The response to analyze
 * @returns Object containing safety rating summary
 */
export declare function getSafetyRatingSummary(response: GenerateContentResponse): {
    promptBlocked: boolean;
    responseBlocked: boolean;
    ratings: Array<{
        category: string;
        probability: string;
    }>;
};
//# sourceMappingURL=safety.d.ts.map
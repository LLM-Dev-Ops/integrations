/**
 * Safety checking utilities for Gemini API responses.
 *
 * This module provides functions to detect and handle safety-related
 * response blocking, including safety filters and recitation detection.
 */

import { SafetyBlockedError, RecitationBlockedError } from '../error/index.js';
import type {
  GenerateContentResponse,
  FinishReason,
  SafetyRating,
  PromptFeedback,
} from '../types/index.js';

// ============================================================================
// Safety Checking
// ============================================================================

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
export function checkSafetyBlocks(response: GenerateContentResponse): void {
  // Check prompt feedback for input blocking
  if (response.promptFeedback) {
    checkPromptFeedback(response.promptFeedback);
  }

  // Check candidates for safety finish reasons
  if (response.candidates && response.candidates.length > 0) {
    for (const candidate of response.candidates) {
      if (candidate.finishReason) {
        checkFinishReason(candidate.finishReason, candidate.safetyRatings);
      }
    }
  }
}

/**
 * Checks prompt feedback for blocking reasons.
 *
 * @param feedback - The prompt feedback to check
 * @throws {SafetyBlockedError} If prompt is blocked
 */
function checkPromptFeedback(feedback: PromptFeedback): void {
  if (feedback.blockReason) {
    const category = extractPrimaryCategory(feedback.safetyRatings);
    const probability = extractPrimaryProbability(feedback.safetyRatings);

    throw new SafetyBlockedError(
      category || feedback.blockReason,
      probability,
    );
  }
}

/**
 * Checks finish reason for safety-related blocks.
 *
 * @param finishReason - The finish reason to check
 * @param safetyRatings - Optional safety ratings for context
 * @throws {SafetyBlockedError} If finish reason indicates safety block
 * @throws {RecitationBlockedError} If finish reason indicates recitation block
 */
function checkFinishReason(
  finishReason: FinishReason,
  safetyRatings?: SafetyRating[],
): void {
  switch (finishReason) {
    case 'SAFETY':
      {
        const category = extractPrimaryCategory(safetyRatings);
        const probability = extractPrimaryProbability(safetyRatings);
        throw new SafetyBlockedError(
          category || 'SAFETY',
          probability,
        );
      }

    case 'RECITATION':
      throw new RecitationBlockedError();

    case 'PROHIBITED_CONTENT':
      throw new SafetyBlockedError('PROHIBITED_CONTENT', 'HIGH');

    case 'BLOCKLIST':
      throw new SafetyBlockedError('BLOCKLIST', 'HIGH');

    case 'SPII':
      throw new SafetyBlockedError('SPII', 'HIGH');

    // Non-blocking finish reasons
    case 'STOP':
    case 'MAX_TOKENS':
    case 'OTHER':
      break;

    default:
      // Unknown finish reason - log but don't throw
      break;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts the primary (highest probability) category from safety ratings.
 *
 * @param ratings - Safety ratings array
 * @returns Primary category or undefined
 */
function extractPrimaryCategory(ratings?: SafetyRating[]): string | undefined {
  if (!ratings || ratings.length === 0) {
    return undefined;
  }

  // Find the rating with the highest probability
  const priorityOrder: Record<string, number> = {
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    NEGLIGIBLE: 1,
  };

  let primaryRating = ratings[0];
  let maxPriority = priorityOrder[primaryRating.probability] || 0;

  for (let i = 1; i < ratings.length; i++) {
    const rating = ratings[i];
    const priority = priorityOrder[rating.probability] || 0;
    if (priority > maxPriority) {
      primaryRating = rating;
      maxPriority = priority;
    }
  }

  return primaryRating.category;
}

/**
 * Extracts the primary (highest) probability from safety ratings.
 *
 * @param ratings - Safety ratings array
 * @returns Primary probability or undefined
 */
function extractPrimaryProbability(ratings?: SafetyRating[]): string | undefined {
  if (!ratings || ratings.length === 0) {
    return undefined;
  }

  const priorityOrder: Record<string, number> = {
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    NEGLIGIBLE: 1,
  };

  let maxProbability = ratings[0].probability;
  let maxPriority = priorityOrder[maxProbability] || 0;

  for (let i = 1; i < ratings.length; i++) {
    const probability = ratings[i].probability;
    const priority = priorityOrder[probability] || 0;
    if (priority > maxPriority) {
      maxProbability = probability;
      maxPriority = priority;
    }
  }

  return maxProbability;
}

/**
 * Checks if a response has any safety concerns (non-throwing).
 * Useful for logging or metrics without interrupting flow.
 *
 * @param response - The response to check
 * @returns True if safety concerns exist, false otherwise
 */
export function hasSafetyConcerns(response: GenerateContentResponse): boolean {
  // Check prompt feedback
  if (response.promptFeedback?.blockReason) {
    return true;
  }

  // Check candidates
  if (response.candidates) {
    for (const candidate of response.candidates) {
      if (candidate.finishReason &&
          ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(
            candidate.finishReason,
          )) {
        return true;
      }

      // Check for high-probability safety ratings
      if (candidate.safetyRatings) {
        for (const rating of candidate.safetyRatings) {
          if (rating.probability === 'HIGH' || rating.probability === 'MEDIUM') {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Gets a summary of safety ratings from a response.
 * Useful for logging and debugging.
 *
 * @param response - The response to analyze
 * @returns Object containing safety rating summary
 */
export function getSafetyRatingSummary(response: GenerateContentResponse): {
  promptBlocked: boolean;
  responseBlocked: boolean;
  ratings: Array<{ category: string; probability: string }>;
} {
  const summary = {
    promptBlocked: !!response.promptFeedback?.blockReason,
    responseBlocked: false,
    ratings: [] as Array<{ category: string; probability: string }>,
  };

  // Check candidates
  if (response.candidates) {
    for (const candidate of response.candidates) {
      // Check for blocking finish reasons
      if (candidate.finishReason &&
          ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(
            candidate.finishReason,
          )) {
        summary.responseBlocked = true;
      }

      // Collect safety ratings
      if (candidate.safetyRatings) {
        for (const rating of candidate.safetyRatings) {
          summary.ratings.push({
            category: rating.category,
            probability: rating.probability,
          });
        }
      }
    }
  }

  return summary;
}

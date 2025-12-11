/**
 * Safety-related types for the Gemini API.
 */

// ============================================================================
// Safety Settings
// ============================================================================

/** Harm category for safety filtering */
export type HarmCategory =
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY';

/** Threshold for blocking harmful content */
export type HarmBlockThreshold =
  | 'BLOCK_NONE'
  | 'BLOCK_LOW_AND_ABOVE'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_ONLY_HIGH';

/** Safety setting configuration */
export interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

/** Harm probability level */
export type HarmProbability = 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';

/** Safety rating for content */
export interface SafetyRating {
  category: HarmCategory;
  probability: HarmProbability;
}

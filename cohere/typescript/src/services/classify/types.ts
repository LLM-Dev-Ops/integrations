/**
 * Types for the Classify service.
 */

import type { ApiMeta, TruncateOption } from '../../types';

/**
 * Classification example for few-shot learning
 */
export interface ClassifyExample {
  text: string;
  label: string;
}

/**
 * Label confidence score
 */
export interface LabelConfidence {
  label: string;
  confidence: number;
}

/**
 * Classification result for a single input
 */
export interface ClassificationResult {
  /** Input text */
  input: string;
  /** Predicted label */
  prediction: string;
  /** Confidence score for prediction */
  confidence: number;
  /** Confidence scores for all labels */
  labels?: LabelConfidence[];
  /** Classification ID */
  id?: string;
}

/**
 * Classify request
 */
export interface ClassifyRequest {
  /** Texts to classify */
  inputs: string[];
  /** Few-shot examples */
  examples: ClassifyExample[];
  /** Model to use */
  model?: string;
  /** Preset name */
  preset?: string;
  /** Truncation behavior */
  truncate?: TruncateOption;
}

/**
 * Classify response
 */
export interface ClassifyResponse {
  /** Response ID */
  id?: string;
  /** Classification results */
  classifications: ClassificationResult[];
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Create a classification example
 */
export function createExample(text: string, label: string): ClassifyExample {
  return { text, label };
}

/**
 * Types for the Generate service.
 */

import type { ApiMeta, FinishReason, GenerationOptions, TruncateOption } from '../../types';

/**
 * Return likelihoods option
 */
export type ReturnLikelihoods = 'GENERATION' | 'ALL' | 'NONE';

/**
 * Token likelihood information
 */
export interface TokenLikelihood {
  token: string;
  likelihood: number;
}

/**
 * A single generation
 */
export interface Generation {
  id?: string;
  text: string;
  finishReason?: FinishReason;
  tokenLikelihoods?: TokenLikelihood[];
}

/**
 * Generate request
 */
export interface GenerateRequest extends GenerationOptions {
  /** The prompt to generate from */
  prompt: string;
  /** Model to use */
  model?: string;
  /** Number of generations to return */
  numGenerations?: number;
  /** Truncation behavior */
  truncate?: TruncateOption;
  /** Return likelihoods */
  returnLikelihoods?: ReturnLikelihoods;
  /** Logit bias */
  logitBias?: Record<string, number>;
  /** Raw prompting (disable templates) */
  rawPrompting?: boolean;
}

/**
 * Generate response
 */
export interface GenerateResponse {
  /** Generation ID */
  id?: string;
  /** Generated texts */
  generations: Generation[];
  /** Original prompt */
  prompt?: string;
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Generate stream event types
 */
export type GenerateStreamEventType = 'text-generation' | 'stream-end';

/**
 * Generate stream event
 */
export interface GenerateStreamEvent {
  eventType: GenerateStreamEventType;
  /** Text chunk */
  text?: string;
  /** Is finished */
  isFinished: boolean;
  /** Finish reason */
  finishReason?: FinishReason;
  /** Full response (for stream-end) */
  response?: GenerateResponse;
}

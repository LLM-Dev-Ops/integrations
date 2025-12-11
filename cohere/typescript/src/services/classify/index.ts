/**
 * Classify service module.
 */

export { ClassifyServiceImpl } from './service';
export type { ClassifyService } from './service';
export type {
  ClassifyRequest,
  ClassifyResponse,
  ClassificationResult,
  ClassifyExample,
  LabelConfidence,
} from './types';
export { createExample } from './types';

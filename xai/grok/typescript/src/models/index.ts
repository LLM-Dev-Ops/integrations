/**
 * Models Module
 *
 * @module models
 */

export type {
  GrokModel,
  GrokCapabilities,
  ModelInfo,
  TokenUsage,
  ReasoningContent,
} from './types.js';

export {
  MODEL_CAPABILITIES,
  MODEL_INFO,
  getCapabilities,
  getModelInfo,
  supportsVision,
  supportsReasoning,
  supportsStreaming,
  supportsTools,
} from './capabilities.js';

export type { ModelResolution } from './registry.js';

export {
  ModelRegistry,
  getModelRegistry,
  resolveModel,
} from './registry.js';

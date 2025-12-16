/**
 * LLM module exports
 * Provides instrumentation for LLM operations in Datadog APM
 */

export { LLMRequestType } from './interface.js';
export type { LLMSpan, LLMSpanOptions } from './interface.js';
export { LLMSpanImpl } from './span.js';
export type { DatadogAPMClient } from './span.js';
export { StreamingLLMSpan } from './streaming.js';
export { LLM_TAGS, LLM_METRICS } from './tags.js';
export { CostTracker, MODEL_PRICING } from './cost.js';
export { ContentSanitizer } from './sanitizer.js';
export type { SanitizationRule } from './sanitizer.js';
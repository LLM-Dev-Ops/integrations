/**
 * Reasoning Extractor
 *
 * Extracts reasoning content from Grok-3 model responses.
 *
 * @module reasoning/extractor
 */

import type { GrokModel, ReasoningContent } from '../models/types.js';
import { supportsReasoning } from '../models/capabilities.js';
import type { GrokChatResponse } from '../services/chat/response.js';
import type { ChatStreamChunk } from '../infra/sse-parser.js';

/**
 * Reasoning extractor for Grok-3 models.
 */
export class ReasoningExtractor {
  /**
   * Check if a model supports reasoning.
   *
   * @param model - Model identifier
   * @returns True if model supports reasoning
   */
  static supportsModel(model: GrokModel): boolean {
    return supportsReasoning(model);
  }

  /**
   * Extract reasoning content from a chat response.
   *
   * @param response - Chat completion response
   * @returns Reasoning content or null
   */
  extract(response: GrokChatResponse): ReasoningContent | null {
    if (response.choices.length === 0) {
      return null;
    }

    const reasoningContent = response.choices[0].message.reasoning_content;
    if (!reasoningContent) {
      return null;
    }

    // Get reasoning tokens from usage if available
    const reasoningTokens = response.usage.reasoning_tokens;

    return {
      content: reasoningContent,
      tokens: reasoningTokens,
    };
  }

  /**
   * Extract reasoning content delta from a stream chunk.
   *
   * @param chunk - Stream chunk
   * @returns Reasoning content delta or null
   */
  extractFromChunk(chunk: ChatStreamChunk): string | null {
    if (chunk.choices.length === 0) {
      return null;
    }

    return chunk.choices[0].delta.reasoning_content ?? null;
  }
}

/**
 * Default reasoning extractor instance.
 */
let defaultExtractor: ReasoningExtractor | null = null;

/**
 * Get the default reasoning extractor.
 *
 * @returns Default ReasoningExtractor instance
 */
export function getReasoningExtractor(): ReasoningExtractor {
  if (!defaultExtractor) {
    defaultExtractor = new ReasoningExtractor();
  }
  return defaultExtractor;
}

import type { ThinkingConfig, ThinkingBlock } from './types.js';
import type { ContentBlock, CreateMessageRequest } from '../messages/types.js';

/**
 * Creates a thinking configuration with the specified budget
 * @param budgetTokens - Maximum number of tokens to allocate for extended thinking
 * @returns ThinkingConfig object
 */
export function createThinkingConfig(budgetTokens: number): ThinkingConfig {
  if (budgetTokens <= 0) {
    throw new Error('Budget tokens must be greater than 0');
  }

  return {
    type: 'enabled',
    budget_tokens: budgetTokens,
  };
}

/**
 * Adds extended thinking to a message request
 * @param request - The base message request
 * @param budgetTokens - Maximum number of tokens to allocate for extended thinking
 * @returns Request with thinking configuration
 */
export function withThinking<T extends CreateMessageRequest>(
  request: T,
  budgetTokens: number
): T & { thinking: ThinkingConfig } {
  return {
    ...request,
    thinking: createThinkingConfig(budgetTokens),
  };
}

/**
 * Extracts all thinking blocks from content
 * @param content - Array of content blocks
 * @returns Array of thinking blocks
 */
export function extractThinkingBlocks(content: ContentBlock[]): ThinkingBlock[] {
  return content.filter(
    (block): block is ThinkingBlock => block.type === 'thinking'
  );
}

/**
 * Gets the combined text from all thinking blocks
 * @param content - Array of content blocks
 * @returns Combined thinking text, separated by newlines
 */
export function getThinkingText(content: ContentBlock[]): string {
  return extractThinkingBlocks(content)
    .map(block => block.thinking)
    .join('\n\n');
}

/**
 * Checks if content contains any thinking blocks
 * @param content - Array of content blocks
 * @returns True if content contains thinking blocks
 */
export function hasThinkingBlocks(content: ContentBlock[]): boolean {
  return content.some(block => block.type === 'thinking');
}

/**
 * Counts the approximate number of tokens in thinking blocks
 * This is a rough estimation (4 characters per token)
 * @param content - Array of content blocks
 * @returns Estimated token count
 */
export function estimateThinkingTokens(content: ContentBlock[]): number {
  const thinkingText = getThinkingText(content);
  return Math.ceil(thinkingText.length / 4);
}

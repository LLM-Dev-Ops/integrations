import type { ThinkingConfig, ThinkingBlock } from './types.js';
import type { ContentBlock, CreateMessageRequest } from '../messages/types.js';
/**
 * Creates a thinking configuration with the specified budget
 * @param budgetTokens - Maximum number of tokens to allocate for extended thinking
 * @returns ThinkingConfig object
 */
export declare function createThinkingConfig(budgetTokens: number): ThinkingConfig;
/**
 * Adds extended thinking to a message request
 * @param request - The base message request
 * @param budgetTokens - Maximum number of tokens to allocate for extended thinking
 * @returns Request with thinking configuration
 */
export declare function withThinking<T extends CreateMessageRequest>(request: T, budgetTokens: number): T & {
    thinking: ThinkingConfig;
};
/**
 * Extracts all thinking blocks from content
 * @param content - Array of content blocks
 * @returns Array of thinking blocks
 */
export declare function extractThinkingBlocks(content: ContentBlock[]): ThinkingBlock[];
/**
 * Gets the combined text from all thinking blocks
 * @param content - Array of content blocks
 * @returns Combined thinking text, separated by newlines
 */
export declare function getThinkingText(content: ContentBlock[]): string;
/**
 * Checks if content contains any thinking blocks
 * @param content - Array of content blocks
 * @returns True if content contains thinking blocks
 */
export declare function hasThinkingBlocks(content: ContentBlock[]): boolean;
/**
 * Counts the approximate number of tokens in thinking blocks
 * This is a rough estimation (4 characters per token)
 * @param content - Array of content blocks
 * @returns Estimated token count
 */
export declare function estimateThinkingTokens(content: ContentBlock[]): number;
//# sourceMappingURL=extended-thinking.d.ts.map
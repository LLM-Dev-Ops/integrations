/**
 * Beta features for Anthropic TypeScript integration
 *
 * This module provides access to Anthropic's beta features including:
 * - Extended thinking
 * - PDF document support
 * - Prompt caching
 * - Token counting
 * - Computer use (agentic capabilities)
 */
export type { ThinkingConfig, ThinkingBlock, PdfSource, DocumentContent, CacheControl, SystemPromptWithCache, CacheUsage, TokenCountRequest, TokenCountResponse, ComputerToolType, ComputerTool, ComputerToolResult, ComputerToolResultContent, ImageSource, } from './types.js';
export { createThinkingConfig, withThinking, extractThinkingBlocks, getThinkingText, hasThinkingBlocks, estimateThinkingTokens, } from './extended-thinking.js';
export { createPdfContent, createPdfContentFromBuffer, createPdfContentFromArrayBuffer, createPdfContentFromBytes, validatePdfBytes, validatePdfBase64, estimatePdfSize, isPdfWithinSizeLimit, } from './pdf-support.js';
export { createCacheControl, createCacheableSystemPrompt, createCacheableSystemPrompts, hasCacheUsage, getCacheEfficiency, calculateTokensSaved, calculateCostSavings, getCacheStats, isCachingEffective, } from './prompt-caching.js';
export type { TokenCountingService } from './token-counting.js';
export { TokenCountingServiceImpl, createTokenCountingService, } from './token-counting.js';
export { COMPUTER_USE_BETA_HEADER, createComputerTool, createTextEditorTool, createBashTool, createComputerUseTools, ComputerToolResultBuilder, createComputerToolResult, createTextToolResult, createScreenshotToolResult, validateComputerTool, } from './computer-use.js';
//# sourceMappingURL=index.d.ts.map
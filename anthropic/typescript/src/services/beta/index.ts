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

// Types
export type {
  ThinkingConfig,
  ThinkingBlock,
  PdfSource,
  DocumentContent,
  CacheControl,
  SystemPromptWithCache,
  CacheUsage,
  TokenCountRequest,
  TokenCountResponse,
  ComputerToolType,
  ComputerTool,
  ComputerToolResult,
  ComputerToolResultContent,
  ImageSource,
} from './types.js';

// Extended thinking
export {
  createThinkingConfig,
  withThinking,
  extractThinkingBlocks,
  getThinkingText,
  hasThinkingBlocks,
  estimateThinkingTokens,
} from './extended-thinking.js';

// PDF support
export {
  createPdfContent,
  createPdfContentFromBuffer,
  createPdfContentFromArrayBuffer,
  createPdfContentFromBytes,
  validatePdfBytes,
  validatePdfBase64,
  estimatePdfSize,
  isPdfWithinSizeLimit,
} from './pdf-support.js';

// Prompt caching
export {
  createCacheControl,
  createCacheableSystemPrompt,
  createCacheableSystemPrompts,
  hasCacheUsage,
  getCacheEfficiency,
  calculateTokensSaved,
  calculateCostSavings,
  getCacheStats,
  isCachingEffective,
} from './prompt-caching.js';

// Token counting
export type { TokenCountingService } from './token-counting.js';
export {
  TokenCountingServiceImpl,
  createTokenCountingService,
} from './token-counting.js';

// Computer use
export {
  COMPUTER_USE_BETA_HEADER,
  createComputerTool,
  createTextEditorTool,
  createBashTool,
  createComputerUseTools,
  ComputerToolResultBuilder,
  createComputerToolResult,
  createTextToolResult,
  createScreenshotToolResult,
  validateComputerTool,
} from './computer-use.js';

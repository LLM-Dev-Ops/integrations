import type { Message, Usage, TextBlock, ImageBlock, ToolUseBlock, ToolResultBlock, Tool, ModelInfo } from '../types/common.js';
import type { AnthropicConfig } from '../config/config.js';
/**
 * Mock factory for creating test configurations
 */
export declare function mockConfig(overrides?: Partial<AnthropicConfig>): AnthropicConfig;
/**
 * Mock factory for creating test messages
 */
export declare function mockMessage(overrides?: Partial<Message>): Message;
/**
 * Mock factory for creating usage statistics
 */
export declare function mockUsage(overrides?: Partial<Usage>): Usage;
/**
 * Mock factory for text content blocks
 */
export declare function mockTextBlock(text?: string): TextBlock;
/**
 * Mock factory for image content blocks
 */
export declare function mockImageBlock(overrides?: Partial<ImageBlock>): ImageBlock;
/**
 * Mock factory for tool use blocks
 */
export declare function mockToolUseBlock(overrides?: Partial<ToolUseBlock>): ToolUseBlock;
/**
 * Mock factory for tool result blocks
 */
export declare function mockToolResultBlock(overrides?: Partial<ToolResultBlock>): ToolResultBlock;
/**
 * Mock factory for tool definitions
 */
export declare function mockTool(overrides?: Partial<Tool>): Tool;
/**
 * Mock factory for model info
 */
export declare function mockModelInfo(overrides?: Partial<ModelInfo>): ModelInfo;
/**
 * Mock factory for creating a complete message response
 */
export declare function mockMessageResponse(overrides?: any): any;
/**
 * Mock factory for streaming events
 */
export declare function mockStreamEvent(type: string, data?: any): any;
/**
 * Mock fetch implementation for testing
 */
export declare class MockFetch {
    private responses;
    private defaultResponse;
    /**
     * Sets a mock response for a specific URL pattern
     */
    setResponse(urlPattern: string | RegExp, response: any): void;
    /**
     * Sets a default response for all unmatched URLs
     */
    setDefaultResponse(response: any): void;
    /**
     * Mock fetch function
     */
    fetch: (url: string | URL, init?: RequestInit) => Promise<Response>;
    /**
     * Resets all mock responses
     */
    reset(): void;
}
/**
 * Creates a new mock fetch instance
 */
export declare function createMockFetch(): MockFetch;
//# sourceMappingURL=index.d.ts.map
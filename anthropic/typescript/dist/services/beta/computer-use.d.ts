import type { ComputerTool, ComputerToolResult, ImageSource } from './types.js';
/**
 * Beta header value for computer use features
 */
export declare const COMPUTER_USE_BETA_HEADER = "computer-use-2024-10-22";
/**
 * Creates a computer tool for interacting with a desktop environment
 * @param width - Display width in pixels
 * @param height - Display height in pixels
 * @param displayNumber - Display number (default: 1)
 * @returns ComputerTool configuration
 */
export declare function createComputerTool(width: number, height: number, displayNumber?: number): ComputerTool;
/**
 * Creates a text editor tool for file editing
 * @returns ComputerTool configuration for text editor
 */
export declare function createTextEditorTool(): ComputerTool;
/**
 * Creates a bash tool for command execution
 * @returns ComputerTool configuration for bash
 */
export declare function createBashTool(): ComputerTool;
/**
 * Creates a complete set of computer use tools
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @returns Array of computer use tools
 */
export declare function createComputerUseTools(screenWidth: number, screenHeight: number): ComputerTool[];
/**
 * Builder for creating computer tool results
 * Provides a fluent API for constructing tool result objects
 */
export declare class ComputerToolResultBuilder {
    private toolUseId;
    private content;
    private isError;
    constructor(toolUseId: string);
    /**
     * Adds text content to the result
     * @param text - Text content to add
     * @returns This builder for chaining
     */
    withText(text: string): this;
    /**
     * Adds a screenshot to the result
     * @param base64Png - Base64-encoded image data
     * @param mediaType - Image media type (default: 'image/png')
     * @returns This builder for chaining
     */
    withScreenshot(base64Png: string, mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'): this;
    /**
     * Adds an image to the result
     * @param source - Image source object
     * @returns This builder for chaining
     */
    withImage(source: ImageSource): this;
    /**
     * Marks the result as an error
     * @returns This builder for chaining
     */
    asError(): this;
    /**
     * Builds the final tool result object
     * @returns ComputerToolResult
     */
    build(): ComputerToolResult;
}
/**
 * Creates a computer tool result builder
 * @param toolUseId - The ID of the tool use to respond to
 * @returns ComputerToolResultBuilder instance
 */
export declare function createComputerToolResult(toolUseId: string): ComputerToolResultBuilder;
/**
 * Creates a simple text-only computer tool result
 * @param toolUseId - The ID of the tool use to respond to
 * @param text - Text content
 * @param isError - Whether this represents an error
 * @returns ComputerToolResult
 */
export declare function createTextToolResult(toolUseId: string, text: string, isError?: boolean): ComputerToolResult;
/**
 * Creates a computer tool result with both text and screenshot
 * @param toolUseId - The ID of the tool use to respond to
 * @param text - Text content
 * @param screenshot - Base64-encoded screenshot
 * @param isError - Whether this represents an error
 * @returns ComputerToolResult
 */
export declare function createScreenshotToolResult(toolUseId: string, text: string, screenshot: string, isError?: boolean): ComputerToolResult;
/**
 * Validates computer tool configuration
 * @param tool - Computer tool to validate
 * @returns True if valid
 * @throws Error if invalid
 */
export declare function validateComputerTool(tool: ComputerTool): boolean;
//# sourceMappingURL=computer-use.d.ts.map
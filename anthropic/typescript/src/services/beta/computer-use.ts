import type {
  ComputerTool,
  ComputerToolResult,
  ComputerToolResultContent,
  ImageSource,
} from './types.js';

/**
 * Beta header value for computer use features
 */
export const COMPUTER_USE_BETA_HEADER = 'computer-use-2024-10-22';

/**
 * Creates a computer tool for interacting with a desktop environment
 * @param width - Display width in pixels
 * @param height - Display height in pixels
 * @param displayNumber - Display number (default: 1)
 * @returns ComputerTool configuration
 */
export function createComputerTool(
  width: number,
  height: number,
  displayNumber = 1
): ComputerTool {
  if (width <= 0 || height <= 0) {
    throw new Error('Display dimensions must be greater than 0');
  }

  if (displayNumber < 0) {
    throw new Error('Display number must be non-negative');
  }

  return {
    type: 'computer_20241022',
    name: 'computer',
    display_width_px: width,
    display_height_px: height,
    display_number: displayNumber,
  };
}

/**
 * Creates a text editor tool for file editing
 * @returns ComputerTool configuration for text editor
 */
export function createTextEditorTool(): ComputerTool {
  return {
    type: 'text_editor_20241022',
    name: 'str_replace_editor',
  };
}

/**
 * Creates a bash tool for command execution
 * @returns ComputerTool configuration for bash
 */
export function createBashTool(): ComputerTool {
  return {
    type: 'bash_20241022',
    name: 'bash',
  };
}

/**
 * Creates a complete set of computer use tools
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @returns Array of computer use tools
 */
export function createComputerUseTools(
  screenWidth: number,
  screenHeight: number
): ComputerTool[] {
  return [
    createComputerTool(screenWidth, screenHeight),
    createTextEditorTool(),
    createBashTool(),
  ];
}

/**
 * Builder for creating computer tool results
 * Provides a fluent API for constructing tool result objects
 */
export class ComputerToolResultBuilder {
  private toolUseId: string;
  private content: ComputerToolResultContent[] = [];
  private isError = false;

  constructor(toolUseId: string) {
    if (!toolUseId || toolUseId.trim().length === 0) {
      throw new Error('Tool use ID cannot be empty');
    }
    this.toolUseId = toolUseId;
  }

  /**
   * Adds text content to the result
   * @param text - Text content to add
   * @returns This builder for chaining
   */
  withText(text: string): this {
    if (text === null || text === undefined) {
      throw new Error('Text content cannot be null or undefined');
    }
    this.content.push({ type: 'text', text });
    return this;
  }

  /**
   * Adds a screenshot to the result
   * @param base64Png - Base64-encoded image data
   * @param mediaType - Image media type (default: 'image/png')
   * @returns This builder for chaining
   */
  withScreenshot(
    base64Png: string,
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = 'image/png'
  ): this {
    if (!base64Png || base64Png.trim().length === 0) {
      throw new Error('Screenshot data cannot be empty');
    }

    this.content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: base64Png,
      },
    });
    return this;
  }

  /**
   * Adds an image to the result
   * @param source - Image source object
   * @returns This builder for chaining
   */
  withImage(source: ImageSource): this {
    this.content.push({
      type: 'image',
      source,
    });
    return this;
  }

  /**
   * Marks the result as an error
   * @returns This builder for chaining
   */
  asError(): this {
    this.isError = true;
    return this;
  }

  /**
   * Builds the final tool result object
   * @returns ComputerToolResult
   */
  build(): ComputerToolResult {
    if (this.content.length === 0) {
      throw new Error('Tool result must have at least one content item');
    }

    const result: ComputerToolResult = {
      type: 'tool_result',
      tool_use_id: this.toolUseId,
      content: this.content,
    };

    if (this.isError) {
      result.is_error = true;
    }

    return result;
  }
}

/**
 * Creates a computer tool result builder
 * @param toolUseId - The ID of the tool use to respond to
 * @returns ComputerToolResultBuilder instance
 */
export function createComputerToolResult(toolUseId: string): ComputerToolResultBuilder {
  return new ComputerToolResultBuilder(toolUseId);
}

/**
 * Creates a simple text-only computer tool result
 * @param toolUseId - The ID of the tool use to respond to
 * @param text - Text content
 * @param isError - Whether this represents an error
 * @returns ComputerToolResult
 */
export function createTextToolResult(
  toolUseId: string,
  text: string,
  isError: boolean = false
): ComputerToolResult {
  const builder = new ComputerToolResultBuilder(toolUseId).withText(text);
  if (isError) {
    builder.asError();
  }
  return builder.build();
}

/**
 * Creates a computer tool result with both text and screenshot
 * @param toolUseId - The ID of the tool use to respond to
 * @param text - Text content
 * @param screenshot - Base64-encoded screenshot
 * @param isError - Whether this represents an error
 * @returns ComputerToolResult
 */
export function createScreenshotToolResult(
  toolUseId: string,
  text: string,
  screenshot: string,
  isError: boolean = false
): ComputerToolResult {
  const builder = new ComputerToolResultBuilder(toolUseId)
    .withText(text)
    .withScreenshot(screenshot);

  if (isError) {
    builder.asError();
  }
  return builder.build();
}

/**
 * Validates computer tool configuration
 * @param tool - Computer tool to validate
 * @returns True if valid
 * @throws Error if invalid
 */
export function validateComputerTool(tool: ComputerTool): boolean {
  if (!tool.type || !tool.name) {
    throw new Error('Computer tool must have type and name');
  }

  if (tool.type === 'computer_20241022') {
    if (!tool.display_width_px || !tool.display_height_px) {
      throw new Error('Computer tool must have display dimensions');
    }
  }

  return true;
}

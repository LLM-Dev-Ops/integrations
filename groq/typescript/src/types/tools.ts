/**
 * Tool types for function calling.
 */

/**
 * Function definition for a tool.
 */
export interface FunctionDefinition {
  /** Function name. */
  name: string;
  /** Function description. */
  description?: string;
  /** JSON schema for function parameters. */
  parameters?: Record<string, unknown>;
}

/**
 * Tool definition.
 */
export interface Tool {
  /** Tool type (currently only 'function'). */
  type: 'function';
  /** Function definition. */
  function: FunctionDefinition;
}

/**
 * Function call in a response.
 */
export interface FunctionCall {
  /** Function name. */
  name: string;
  /** JSON-encoded arguments. */
  arguments: string;
}

/**
 * Tool call in a response.
 */
export interface ToolCall {
  /** Unique ID for this tool call. */
  id: string;
  /** Tool type. */
  type: 'function';
  /** Function call details. */
  function: FunctionCall;
}

/**
 * Tool call delta in streaming response.
 */
export interface ToolCallDelta {
  /** Index of the tool call. */
  index: number;
  /** Tool call ID (only in first chunk). */
  id?: string;
  /** Tool type (only in first chunk). */
  type?: 'function';
  /** Function delta. */
  function?: {
    /** Function name (only in first chunk). */
    name?: string;
    /** Partial arguments. */
    arguments?: string;
  };
}

/**
 * Tool choice specification.
 */
export type ToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Creates a tool definition from a function.
 */
export function createTool(
  name: string,
  description: string,
  parameters?: Record<string, unknown>
): Tool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters,
    },
  };
}

/**
 * Parses tool call arguments as JSON.
 */
export function parseToolArguments<T = unknown>(toolCall: ToolCall): T {
  try {
    return JSON.parse(toolCall.function.arguments) as T;
  } catch {
    throw new Error(`Failed to parse tool arguments for ${toolCall.function.name}`);
  }
}

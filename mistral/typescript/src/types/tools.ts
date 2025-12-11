/**
 * Tool and function calling types.
 */

/**
 * A tool available for the model to use.
 */
export interface Tool {
  /** Tool type. */
  type: 'function';
  /** Function definition. */
  function: FunctionDefinition;
}

/**
 * Function definition.
 */
export interface FunctionDefinition {
  /** Function name. */
  name: string;
  /** Function description. */
  description?: string;
  /** JSON Schema for parameters. */
  parameters: Record<string, unknown>;
}

/**
 * Tool choice specification.
 */
export type ToolChoice =
  | 'auto'
  | 'any'
  | 'none'
  | { type: 'function'; function: { name: string } };

/**
 * A tool call made by the model.
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
 * Function call details.
 */
export interface FunctionCall {
  /** Function name. */
  name: string;
  /** JSON-encoded arguments. */
  arguments: string;
}

/**
 * Creates a function tool.
 */
export function createFunctionTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>
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
 * Creates a tool choice for a specific function.
 */
export function createFunctionChoice(name: string): ToolChoice {
  return {
    type: 'function',
    function: { name },
  };
}

/**
 * Parses function call arguments.
 */
export function parseArguments<T>(call: FunctionCall): T {
  return JSON.parse(call.arguments) as T;
}

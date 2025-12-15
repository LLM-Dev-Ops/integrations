/**
 * Tool Types
 *
 * @module types/tool
 */

/**
 * JSON Schema for function parameters.
 */
export interface JsonSchema {
  readonly type?: string;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: string[];
  readonly items?: JsonSchema;
  readonly enum?: unknown[];
  readonly description?: string;
  readonly [key: string]: unknown;
}

/**
 * Function definition for tool.
 */
export interface FunctionDefinition {
  /** Function name */
  readonly name: string;

  /** Function description */
  readonly description?: string;

  /** Parameters JSON schema */
  readonly parameters?: JsonSchema;

  /** Whether to enable strict schema validation */
  readonly strict?: boolean;
}

/**
 * Tool definition.
 */
export interface Tool {
  /** Tool type (always "function") */
  readonly type: 'function';

  /** Function definition */
  readonly function: FunctionDefinition;
}

/**
 * Tool choice options.
 */
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { readonly type: 'function'; readonly function: { readonly name: string } };

/**
 * Response format options.
 */
export type ResponseFormat =
  | { readonly type: 'text' }
  | { readonly type: 'json_object' }
  | {
      readonly type: 'json_schema';
      readonly json_schema: {
        readonly name: string;
        readonly strict?: boolean;
        readonly schema: JsonSchema;
      };
    };

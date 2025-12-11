/**
 * Tool-related types for the Gemini API.
 */
/** Function declaration for tools */
export interface FunctionDeclaration {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}
/** Code execution tool (empty config) */
export interface CodeExecution {
}
/** Google Search retrieval tool (empty config) */
export interface GoogleSearchRetrieval {
}
/** Tool definition */
export interface Tool {
    functionDeclarations?: FunctionDeclaration[];
    codeExecution?: CodeExecution;
    googleSearchRetrieval?: GoogleSearchRetrieval;
}
/** Function calling mode */
export type FunctionCallingMode = 'AUTO' | 'ANY' | 'NONE';
/** Function calling configuration */
export interface FunctionCallingConfig {
    mode?: FunctionCallingMode;
    allowedFunctionNames?: string[];
}
/** Tool configuration */
export interface ToolConfig {
    functionCallingConfig?: FunctionCallingConfig;
}
//# sourceMappingURL=tools.d.ts.map
/**
 * Content-related types for the Gemini API.
 */
/** Text content part */
export interface TextPart {
    text: string;
}
/** Inline binary data */
export interface Blob {
    mimeType: string;
    data: string;
}
/** Inline data part */
export interface InlineDataPart {
    inlineData: Blob;
}
/** File reference */
export interface FileData {
    mimeType?: string;
    fileUri: string;
}
/** File data part */
export interface FileDataPart {
    fileData: FileData;
}
/** Function call from model */
export interface FunctionCall {
    name: string;
    args: Record<string, unknown>;
}
/** Function call part */
export interface FunctionCallPart {
    functionCall: FunctionCall;
}
/** Function response from client */
export interface FunctionResponse {
    name: string;
    response: Record<string, unknown>;
}
/** Function response part */
export interface FunctionResponsePart {
    functionResponse: FunctionResponse;
}
/** Executable code */
export interface ExecutableCode {
    language: string;
    code: string;
}
/** Executable code part */
export interface ExecutableCodePart {
    executableCode: ExecutableCode;
}
/** Code execution result */
export interface CodeExecutionResult {
    outcome: string;
    output?: string;
}
/** Code execution result part */
export interface CodeExecutionResultPart {
    codeExecutionResult: CodeExecutionResult;
}
/** Union of all part types */
export type Part = TextPart | InlineDataPart | FileDataPart | FunctionCallPart | FunctionResponsePart | ExecutableCodePart | CodeExecutionResultPart;
/** Role in conversation */
export type Role = 'user' | 'model' | 'system';
/** Content with role and parts */
export interface Content {
    role?: Role;
    parts: Part[];
}
/** Check if a part is a text part */
export declare function isTextPart(part: Part): part is TextPart;
/** Check if a part is an inline data part */
export declare function isInlineDataPart(part: Part): part is InlineDataPart;
/** Check if a part is a file data part */
export declare function isFileDataPart(part: Part): part is FileDataPart;
/** Check if a part is a function call part */
export declare function isFunctionCallPart(part: Part): part is FunctionCallPart;
/** Check if a part is a function response part */
export declare function isFunctionResponsePart(part: Part): part is FunctionResponsePart;
/** Check if a part is an executable code part */
export declare function isExecutableCodePart(part: Part): part is ExecutableCodePart;
/** Check if a part is a code execution result part */
export declare function isCodeExecutionResultPart(part: Part): part is CodeExecutionResultPart;
//# sourceMappingURL=content.d.ts.map
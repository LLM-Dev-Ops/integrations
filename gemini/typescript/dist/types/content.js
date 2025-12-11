/**
 * Content-related types for the Gemini API.
 */
// ============================================================================
// Type Guards
// ============================================================================
/** Check if a part is a text part */
export function isTextPart(part) {
    return 'text' in part;
}
/** Check if a part is an inline data part */
export function isInlineDataPart(part) {
    return 'inlineData' in part;
}
/** Check if a part is a file data part */
export function isFileDataPart(part) {
    return 'fileData' in part;
}
/** Check if a part is a function call part */
export function isFunctionCallPart(part) {
    return 'functionCall' in part;
}
/** Check if a part is a function response part */
export function isFunctionResponsePart(part) {
    return 'functionResponse' in part;
}
/** Check if a part is an executable code part */
export function isExecutableCodePart(part) {
    return 'executableCode' in part;
}
/** Check if a part is a code execution result part */
export function isCodeExecutionResultPart(part) {
    return 'codeExecutionResult' in part;
}
//# sourceMappingURL=content.js.map
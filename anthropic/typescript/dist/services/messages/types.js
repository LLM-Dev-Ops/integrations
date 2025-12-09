// Helper functions
export function createUserMessage(content) {
    return {
        role: 'user',
        content,
    };
}
export function createAssistantMessage(content) {
    return {
        role: 'assistant',
        content,
    };
}
export function createTextBlock(text) {
    return {
        type: 'text',
        text,
    };
}
export function createToolUseBlock(id, name, input) {
    return {
        type: 'tool_use',
        id,
        name,
        input,
    };
}
export function createToolResultBlock(tool_use_id, content, is_error) {
    return {
        type: 'tool_result',
        tool_use_id,
        content,
        is_error,
    };
}
export function createImageBlock(data, media_type) {
    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type,
            data,
        },
    };
}
export function createDocumentBlock(data) {
    return {
        type: 'document',
        source: {
            type: 'base64',
            media_type: 'application/pdf',
            data,
        },
    };
}
//# sourceMappingURL=types.js.map
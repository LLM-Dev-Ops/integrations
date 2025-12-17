import { ValidationError } from '../../errors/categories.js';
export function validateCreateMessageRequest(request) {
    const errors = [];
    // Required fields
    if (!request.model) {
        errors.push('model is required');
    }
    if (!request.max_tokens) {
        errors.push('max_tokens is required');
    }
    else if (request.max_tokens <= 0) {
        errors.push('max_tokens must be greater than 0');
    }
    else if (!Number.isInteger(request.max_tokens)) {
        errors.push('max_tokens must be an integer');
    }
    if (!request.messages || !Array.isArray(request.messages)) {
        errors.push('messages is required and must be an array');
    }
    else if (request.messages.length === 0) {
        errors.push('at least one message is required');
    }
    else {
        // Validate message alternation
        validateMessageAlternation(request.messages, errors);
        // Validate individual messages
        request.messages.forEach((msg, idx) => {
            validateMessage(msg, idx, errors);
        });
    }
    // Optional field validation
    if (request.temperature !== undefined) {
        if (typeof request.temperature !== 'number') {
            errors.push('temperature must be a number');
        }
        else if (request.temperature < 0 || request.temperature > 1) {
            errors.push('temperature must be between 0 and 1');
        }
    }
    if (request.top_p !== undefined) {
        if (typeof request.top_p !== 'number') {
            errors.push('top_p must be a number');
        }
        else if (request.top_p < 0 || request.top_p > 1) {
            errors.push('top_p must be between 0 and 1');
        }
    }
    if (request.top_k !== undefined) {
        if (typeof request.top_k !== 'number') {
            errors.push('top_k must be a number');
        }
        else if (request.top_k < 0) {
            errors.push('top_k must be non-negative');
        }
        else if (!Number.isInteger(request.top_k)) {
            errors.push('top_k must be an integer');
        }
    }
    if (request.stop_sequences !== undefined) {
        if (!Array.isArray(request.stop_sequences)) {
            errors.push('stop_sequences must be an array');
        }
        else if (request.stop_sequences.length > 0) {
            request.stop_sequences.forEach((seq, idx) => {
                if (typeof seq !== 'string') {
                    errors.push(`stop_sequences[${idx}] must be a string`);
                }
            });
        }
    }
    if (request.tools !== undefined) {
        if (!Array.isArray(request.tools)) {
            errors.push('tools must be an array');
        }
        else {
            request.tools.forEach((tool, idx) => {
                validateTool(tool, idx, errors);
            });
        }
    }
    if (request.tool_choice !== undefined) {
        validateToolChoice(request.tool_choice, errors);
    }
    if (request.thinking !== undefined) {
        validateThinkingConfig(request.thinking, errors, request.model);
    }
    if (errors.length > 0) {
        throw new ValidationError('Request validation failed', errors);
    }
}
export function validateCountTokensRequest(request) {
    const errors = [];
    if (!request.model) {
        errors.push('model is required');
    }
    if (!request.messages || !Array.isArray(request.messages)) {
        errors.push('messages is required and must be an array');
    }
    else if (request.messages.length === 0) {
        errors.push('at least one message is required');
    }
    else {
        validateMessageAlternation(request.messages, errors);
        request.messages.forEach((msg, idx) => {
            validateMessage(msg, idx, errors);
        });
    }
    if (request.tools !== undefined) {
        if (!Array.isArray(request.tools)) {
            errors.push('tools must be an array');
        }
        else {
            request.tools.forEach((tool, idx) => {
                validateTool(tool, idx, errors);
            });
        }
    }
    if (errors.length > 0) {
        throw new ValidationError('Request validation failed', errors);
    }
}
function validateMessage(msg, idx, errors) {
    if (!msg.role) {
        errors.push(`messages[${idx}].role is required`);
    }
    else if (msg.role !== 'user' && msg.role !== 'assistant') {
        errors.push(`messages[${idx}].role must be "user" or "assistant"`);
    }
    if (msg.content === undefined || msg.content === null) {
        errors.push(`messages[${idx}].content is required`);
    }
    else if (typeof msg.content === 'string') {
        if (msg.content.length === 0) {
            errors.push(`messages[${idx}].content cannot be empty`);
        }
    }
    else if (Array.isArray(msg.content)) {
        if (msg.content.length === 0) {
            errors.push(`messages[${idx}].content array cannot be empty`);
        }
        // Validate content blocks
        msg.content.forEach((block, blockIdx) => {
            if (!block.type) {
                errors.push(`messages[${idx}].content[${blockIdx}].type is required`);
            }
        });
    }
    else {
        errors.push(`messages[${idx}].content must be a string or array`);
    }
}
function validateMessageAlternation(messages, errors) {
    // First message must be from user
    if (messages[0] && messages[0].role !== 'user') {
        errors.push('first message must be from user');
    }
    // Messages should alternate between user and assistant
    for (let i = 1; i < messages.length; i++) {
        const prevRole = messages[i - 1].role;
        const currRole = messages[i].role;
        // Allow consecutive user messages but not consecutive assistant messages
        if (currRole === 'assistant' && prevRole === 'assistant') {
            errors.push(`messages[${i}]: consecutive assistant messages are not allowed`);
        }
    }
}
function validateTool(tool, idx, errors) {
    if (!tool.name) {
        errors.push(`tools[${idx}].name is required`);
    }
    else if (typeof tool.name !== 'string') {
        errors.push(`tools[${idx}].name must be a string`);
    }
    if (!tool.description) {
        errors.push(`tools[${idx}].description is required`);
    }
    else if (typeof tool.description !== 'string') {
        errors.push(`tools[${idx}].description must be a string`);
    }
    if (!tool.input_schema) {
        errors.push(`tools[${idx}].input_schema is required`);
    }
    else if (typeof tool.input_schema !== 'object' || tool.input_schema === null) {
        errors.push(`tools[${idx}].input_schema must be an object`);
    }
}
function validateToolChoice(toolChoice, errors) {
    if (!toolChoice.type) {
        errors.push('tool_choice.type is required');
    }
    else if (!['auto', 'any', 'tool'].includes(toolChoice.type)) {
        errors.push('tool_choice.type must be "auto", "any", or "tool"');
    }
    if (toolChoice.type === 'tool') {
        if (!toolChoice.name) {
            errors.push('tool_choice.name is required when type is "tool"');
        }
        else if (typeof toolChoice.name !== 'string') {
            errors.push('tool_choice.name must be a string');
        }
    }
}
function validateThinkingConfig(thinking, errors, model) {
    if (!thinking.type) {
        errors.push('thinking.type is required');
    }
    else if (!['enabled', 'disabled'].includes(thinking.type)) {
        errors.push('thinking.type must be "enabled" or "disabled"');
    }
    if (thinking.budget_tokens !== undefined) {
        if (typeof thinking.budget_tokens !== 'number') {
            errors.push('thinking.budget_tokens must be a number');
        }
        else if (!Number.isInteger(thinking.budget_tokens)) {
            errors.push('thinking.budget_tokens must be an integer');
        }
        else if (thinking.budget_tokens < 1024) {
            // SPARC requirement: budget_tokens must be at least 1024
            errors.push('thinking.budget_tokens must be at least 1024');
        }
    }
    // Validate model compatibility for extended thinking
    if (thinking.type === 'enabled' && model) {
        const supportedModels = [
            'claude-sonnet-4-20250514',
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
        ];
        const isSupported = supportedModels.some(m => model.startsWith(m));
        if (!isSupported) {
            errors.push(`extended thinking is only supported on models: ${supportedModels.join(', ')}`);
        }
    }
}
//# sourceMappingURL=validation.js.map
/**
 * Validation for chat requests.
 */

import { ValidationError } from '../../errors';
import type { ValidationDetail } from '../../errors';
import type { ChatRequest, ChatMessage, Tool } from './types';

/**
 * Validate a chat request
 */
export function validateChatRequest(request: ChatRequest): void {
  const errors: ValidationDetail[] = [];

  // Validate message
  if (!request.message || request.message.trim() === '') {
    errors.push({
      field: 'message',
      message: 'Message is required and cannot be empty',
      code: 'REQUIRED',
    });
  }

  // Validate temperature
  if (request.temperature !== undefined) {
    if (request.temperature < 0 || request.temperature > 2) {
      errors.push({
        field: 'temperature',
        message: 'Temperature must be between 0 and 2',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Validate top_p
  if (request.topP !== undefined) {
    if (request.topP < 0 || request.topP > 1) {
      errors.push({
        field: 'topP',
        message: 'top_p must be between 0 and 1',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Validate top_k
  if (request.topK !== undefined) {
    if (request.topK < 0 || request.topK > 500) {
      errors.push({
        field: 'topK',
        message: 'top_k must be between 0 and 500',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Validate max_tokens
  if (request.maxTokens !== undefined) {
    if (request.maxTokens < 1 || request.maxTokens > 4096) {
      errors.push({
        field: 'maxTokens',
        message: 'max_tokens must be between 1 and 4096',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Validate frequency_penalty
  if (request.frequencyPenalty !== undefined) {
    if (request.frequencyPenalty < 0 || request.frequencyPenalty > 1) {
      errors.push({
        field: 'frequencyPenalty',
        message: 'frequency_penalty must be between 0 and 1',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Validate presence_penalty
  if (request.presencePenalty !== undefined) {
    if (request.presencePenalty < 0 || request.presencePenalty > 1) {
      errors.push({
        field: 'presencePenalty',
        message: 'presence_penalty must be between 0 and 1',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Validate chat history
  if (request.chatHistory) {
    const historyErrors = validateChatHistory(request.chatHistory);
    errors.push(...historyErrors);
  }

  // Validate tools
  if (request.tools) {
    const toolErrors = validateTools(request.tools);
    errors.push(...toolErrors);
  }

  // Validate tool results require tools
  if (request.toolResults && request.toolResults.length > 0 && !request.tools) {
    errors.push({
      field: 'toolResults',
      message: 'Tool results require tools to be defined',
      code: 'INVALID_COMBINATION',
    });
  }

  // Validate documents
  if (request.documents) {
    for (let i = 0; i < request.documents.length; i++) {
      const doc = request.documents[i];
      if (!doc?.text || doc.text.trim() === '') {
        errors.push({
          field: `documents[${i}].text`,
          message: 'Document text is required',
          code: 'REQUIRED',
        });
      }
    }
  }

  // Throw if there are validation errors
  if (errors.length > 0) {
    throw new ValidationError('Invalid chat request', errors);
  }
}

/**
 * Validate chat history
 */
function validateChatHistory(history: ChatMessage[]): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  for (let i = 0; i < history.length; i++) {
    const message = history[i];

    if (!message) {
      errors.push({
        field: `chatHistory[${i}]`,
        message: 'Message cannot be null',
        code: 'REQUIRED',
      });
      continue;
    }

    if (!message.role) {
      errors.push({
        field: `chatHistory[${i}].role`,
        message: 'Message role is required',
        code: 'REQUIRED',
      });
    }

    if (!message.content || message.content.trim() === '') {
      errors.push({
        field: `chatHistory[${i}].content`,
        message: 'Message content is required',
        code: 'REQUIRED',
      });
    }

    // Validate tool messages have tool_call_id
    if (message.role === 'TOOL' && !message.toolCallId) {
      errors.push({
        field: `chatHistory[${i}].toolCallId`,
        message: 'Tool messages require toolCallId',
        code: 'REQUIRED',
      });
    }
  }

  return errors;
}

/**
 * Validate tools
 */
function validateTools(tools: Tool[]): ValidationDetail[] {
  const errors: ValidationDetail[] = [];
  const toolNames = new Set<string>();

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];

    if (!tool) {
      errors.push({
        field: `tools[${i}]`,
        message: 'Tool cannot be null',
        code: 'REQUIRED',
      });
      continue;
    }

    if (!tool.name || tool.name.trim() === '') {
      errors.push({
        field: `tools[${i}].name`,
        message: 'Tool name is required',
        code: 'REQUIRED',
      });
    } else if (toolNames.has(tool.name)) {
      errors.push({
        field: `tools[${i}].name`,
        message: `Duplicate tool name: ${tool.name}`,
        code: 'DUPLICATE',
      });
    } else {
      toolNames.add(tool.name);
    }

    if (!tool.description || tool.description.trim() === '') {
      errors.push({
        field: `tools[${i}].description`,
        message: 'Tool description is required',
        code: 'REQUIRED',
      });
    }

    // Validate parameters
    if (tool.parameters) {
      const paramNames = new Set<string>();
      for (let j = 0; j < tool.parameters.length; j++) {
        const param = tool.parameters[j];

        if (!param) continue;

        if (!param.name) {
          errors.push({
            field: `tools[${i}].parameters[${j}].name`,
            message: 'Parameter name is required',
            code: 'REQUIRED',
          });
        } else if (paramNames.has(param.name)) {
          errors.push({
            field: `tools[${i}].parameters[${j}].name`,
            message: `Duplicate parameter name: ${param.name}`,
            code: 'DUPLICATE',
          });
        } else {
          paramNames.add(param.name);
        }
      }
    }
  }

  return errors;
}

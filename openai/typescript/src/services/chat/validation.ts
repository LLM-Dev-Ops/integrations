import { InvalidRequestError } from '../../errors/categories.js';
import type { ChatCompletionRequest } from './types.js';

export class ChatCompletionValidator {
  static validate(request: ChatCompletionRequest): void {
    if (!request.model) {
      throw new InvalidRequestError('model is required', { param: 'model' });
    }

    if (!request.messages || request.messages.length === 0) {
      throw new InvalidRequestError('messages array is required and cannot be empty', { param: 'messages' });
    }

    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i];
      if (!msg.role) {
        throw new InvalidRequestError(`messages[${i}].role is required`, { param: `messages[${i}].role` });
      }
      if (msg.content === undefined && !msg.tool_calls) {
        throw new InvalidRequestError(`messages[${i}].content or tool_calls is required`, { param: `messages[${i}]` });
      }
    }

    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
      throw new InvalidRequestError('temperature must be between 0 and 2', { param: 'temperature' });
    }

    if (request.top_p !== undefined && (request.top_p < 0 || request.top_p > 1)) {
      throw new InvalidRequestError('top_p must be between 0 and 1', { param: 'top_p' });
    }

    if (request.max_tokens !== undefined && request.max_tokens < 1) {
      throw new InvalidRequestError('max_tokens must be at least 1', { param: 'max_tokens' });
    }
  }
}

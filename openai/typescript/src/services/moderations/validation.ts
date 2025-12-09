import { InvalidRequestError } from '../../errors/categories.js';
import type { ModerationRequest } from './types.js';

export class ModerationsValidator {
  static validate(request: ModerationRequest): void {
    if (!request.input) {
      throw new InvalidRequestError('input is required', { param: 'input' });
    }
    if (typeof request.input === 'string' && request.input.trim() === '') {
      throw new InvalidRequestError('input cannot be empty', { param: 'input' });
    }
    if (Array.isArray(request.input) && request.input.length === 0) {
      throw new InvalidRequestError('input array cannot be empty', { param: 'input' });
    }
  }
}

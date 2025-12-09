import { InvalidRequestError } from '../../errors/categories.js';
import type { EmbeddingRequest } from './types.js';

export class EmbeddingsValidator {
  static validate(request: EmbeddingRequest): void {
    if (!request.model) {
      throw new InvalidRequestError('model is required', { param: 'model' });
    }

    if (request.input === undefined || request.input === null) {
      throw new InvalidRequestError('input is required', { param: 'input' });
    }

    if (typeof request.input === 'string' && request.input.length === 0) {
      throw new InvalidRequestError('input cannot be empty', { param: 'input' });
    }

    if (Array.isArray(request.input) && request.input.length === 0) {
      throw new InvalidRequestError('input array cannot be empty', { param: 'input' });
    }

    if (request.dimensions !== undefined && request.dimensions < 1) {
      throw new InvalidRequestError('dimensions must be at least 1', { param: 'dimensions' });
    }
  }
}

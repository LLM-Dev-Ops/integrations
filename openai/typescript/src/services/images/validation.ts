import { InvalidRequestError } from '../../errors/categories.js';
import type { ImageGenerateRequest, ImageEditRequest, ImageVariationRequest } from './types.js';

export class ImagesValidator {
  static validateGenerate(request: ImageGenerateRequest): void {
    if (!request.prompt || request.prompt.trim() === '') {
      throw new InvalidRequestError('prompt is required', { param: 'prompt' });
    }
    if (request.n !== undefined && (request.n < 1 || request.n > 10)) {
      throw new InvalidRequestError('n must be between 1 and 10', { param: 'n' });
    }
  }

  static validateEdit(request: ImageEditRequest): void {
    if (!request.image) {
      throw new InvalidRequestError('image is required', { param: 'image' });
    }
    if (!request.prompt || request.prompt.trim() === '') {
      throw new InvalidRequestError('prompt is required', { param: 'prompt' });
    }
  }

  static validateVariation(request: ImageVariationRequest): void {
    if (!request.image) {
      throw new InvalidRequestError('image is required', { param: 'image' });
    }
  }
}

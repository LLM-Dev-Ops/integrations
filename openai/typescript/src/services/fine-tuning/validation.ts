import { InvalidRequestError } from '../../errors/categories.js';
import type { FineTuningJobCreateRequest } from './types.js';

export class FineTuningValidator {
  static validateCreate(request: FineTuningJobCreateRequest): void {
    if (!request.model) {
      throw new InvalidRequestError('model is required', { param: 'model' });
    }
    if (!request.training_file) {
      throw new InvalidRequestError('training_file is required', { param: 'training_file' });
    }
  }

  static validateJobId(jobId: string): void {
    if (!jobId || jobId.trim() === '') {
      throw new InvalidRequestError('jobId is required');
    }
  }
}

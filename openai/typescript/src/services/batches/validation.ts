import { InvalidRequestError } from '../../errors/categories.js';
import type { BatchCreateRequest } from './types.js';

export class BatchesValidator {
  static validateCreate(request: BatchCreateRequest): void {
    if (!request.input_file_id) {
      throw new InvalidRequestError('input_file_id is required', { param: 'input_file_id' });
    }
    if (!request.endpoint) {
      throw new InvalidRequestError('endpoint is required', { param: 'endpoint' });
    }
    if (!request.completion_window) {
      throw new InvalidRequestError('completion_window is required', { param: 'completion_window' });
    }
  }

  static validateBatchId(batchId: string): void {
    if (!batchId || batchId.trim() === '') {
      throw new InvalidRequestError('batchId is required');
    }
  }
}

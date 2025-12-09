import { InvalidRequestError } from '../../errors/categories.js';
import type { FileCreateRequest } from './types.js';

export class FilesValidator {
  static validateCreate(request: FileCreateRequest): void {
    if (!request.file) {
      throw new InvalidRequestError('file is required', { param: 'file' });
    }
    if (!request.purpose) {
      throw new InvalidRequestError('purpose is required', { param: 'purpose' });
    }
  }

  static validateFileId(fileId: string): void {
    if (!fileId || fileId.trim() === '') {
      throw new InvalidRequestError('fileId is required');
    }
  }
}

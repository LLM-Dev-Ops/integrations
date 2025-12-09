import { InvalidRequestError } from '../../errors/categories.js';
import type { AudioTranscriptionRequest, AudioTranslationRequest, SpeechRequest } from './types.js';

export class AudioValidator {
  static validateTranscription(request: AudioTranscriptionRequest): void {
    if (!request.file) {
      throw new InvalidRequestError('file is required', { param: 'file' });
    }
    if (!request.model) {
      throw new InvalidRequestError('model is required', { param: 'model' });
    }
    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 1)) {
      throw new InvalidRequestError('temperature must be between 0 and 1', { param: 'temperature' });
    }
  }

  static validateTranslation(request: AudioTranslationRequest): void {
    if (!request.file) {
      throw new InvalidRequestError('file is required', { param: 'file' });
    }
    if (!request.model) {
      throw new InvalidRequestError('model is required', { param: 'model' });
    }
  }

  static validateSpeech(request: SpeechRequest): void {
    if (!request.model) {
      throw new InvalidRequestError('model is required', { param: 'model' });
    }
    if (!request.input || request.input.trim() === '') {
      throw new InvalidRequestError('input is required', { param: 'input' });
    }
    if (!request.voice) {
      throw new InvalidRequestError('voice is required', { param: 'voice' });
    }
    if (request.speed !== undefined && (request.speed < 0.25 || request.speed > 4.0)) {
      throw new InvalidRequestError('speed must be between 0.25 and 4.0', { param: 'speed' });
    }
  }
}

/**
 * Audio transcription and translation service.
 */

import { createReadStream } from 'fs';
import FormData from 'form-data';
import { HttpTransport } from '../transport';
import { GroqError } from '../errors';
import {
  TranscriptionRequest,
  TranscriptionResponse,
  TranslationRequest,
  TranslationResponse,
  AudioInput,
} from '../types/audio';

/**
 * Audio service interface.
 */
export interface AudioService {
  /**
   * Transcribes audio to text.
   */
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>;

  /**
   * Translates audio to English text.
   */
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}

/**
 * Default audio service implementation.
 */
export class DefaultAudioService implements AudioService {
  private readonly transport: HttpTransport;

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    this.validateTranscriptionRequest(request);

    const formData = await this.buildTranscriptionForm(request);

    const response = await this.transport.request<TranscriptionResponse>({
      method: 'POST',
      path: 'audio/transcriptions',
      body: formData,
    });

    return response.data;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateTranslationRequest(request);

    const formData = await this.buildTranslationForm(request);

    const response = await this.transport.request<TranslationResponse>({
      method: 'POST',
      path: 'audio/translations',
      body: formData,
    });

    return response.data;
  }

  private validateTranscriptionRequest(request: TranscriptionRequest): void {
    if (!request.file) {
      throw GroqError.validation('Audio file is required', 'file');
    }

    if (!request.model) {
      throw GroqError.validation('Model is required', 'model');
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 1) {
        throw GroqError.validation(
          'Temperature must be between 0 and 1',
          'temperature',
          String(request.temperature)
        );
      }
    }
  }

  private validateTranslationRequest(request: TranslationRequest): void {
    if (!request.file) {
      throw GroqError.validation('Audio file is required', 'file');
    }

    if (!request.model) {
      throw GroqError.validation('Model is required', 'model');
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 1) {
        throw GroqError.validation(
          'Temperature must be between 0 and 1',
          'temperature',
          String(request.temperature)
        );
      }
    }
  }

  private async buildTranscriptionForm(
    request: TranscriptionRequest
  ): Promise<FormData> {
    const form = new FormData();

    await this.appendAudioFile(form, request.file);
    form.append('model', request.model);

    if (request.language) {
      form.append('language', request.language);
    }

    if (request.prompt) {
      form.append('prompt', request.prompt);
    }

    if (request.response_format) {
      form.append('response_format', request.response_format);
    }

    if (request.temperature !== undefined) {
      form.append('temperature', String(request.temperature));
    }

    if (request.timestamp_granularities && request.timestamp_granularities.length > 0) {
      for (const granularity of request.timestamp_granularities) {
        form.append('timestamp_granularities[]', granularity);
      }
    }

    return form;
  }

  private async buildTranslationForm(request: TranslationRequest): Promise<FormData> {
    const form = new FormData();

    await this.appendAudioFile(form, request.file);
    form.append('model', request.model);

    if (request.prompt) {
      form.append('prompt', request.prompt);
    }

    if (request.response_format) {
      form.append('response_format', request.response_format);
    }

    if (request.temperature !== undefined) {
      form.append('temperature', String(request.temperature));
    }

    return form;
  }

  private async appendAudioFile(form: FormData, input: AudioInput): Promise<void> {
    switch (input.type) {
      case 'path':
        form.append('file', createReadStream(input.path));
        break;

      case 'buffer':
        form.append('file', input.buffer, {
          filename: input.filename,
          contentType: this.getContentType(input.filename),
        });
        break;

      case 'stream':
        form.append('file', input.stream, {
          filename: input.filename,
          contentType: this.getContentType(input.filename),
        });
        break;
    }
  }

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      flac: 'audio/flac',
      mp3: 'audio/mpeg',
      mp4: 'audio/mp4',
      mpeg: 'audio/mpeg',
      mpga: 'audio/mpeg',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'audio/webm',
    };

    return contentTypes[ext ?? ''] ?? 'application/octet-stream';
  }
}

/**
 * Creates an audio service.
 */
export function createAudioService(transport: HttpTransport): AudioService {
  return new DefaultAudioService(transport);
}

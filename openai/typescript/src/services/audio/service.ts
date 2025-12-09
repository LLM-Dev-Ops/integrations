import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import { RequestBuilder } from '../../transport/request-builder.js';
import { ResponseParser } from '../../transport/response-parser.js';
import { MultipartFormBuilder } from '../../transport/multipart.js';
import type {
  AudioTranscriptionRequest,
  AudioTranslationRequest,
  SpeechRequest,
  AudioTranscription,
} from './types.js';
import { AudioValidator } from './validation.js';
import type { RequestOptions } from '../../types/common.js';

export interface AudioService {
  transcribe(request: AudioTranscriptionRequest, options?: RequestOptions): Promise<AudioTranscription>;
  translate(request: AudioTranslationRequest, options?: RequestOptions): Promise<AudioTranscription>;
  speech(request: SpeechRequest, options?: RequestOptions): Promise<ArrayBuffer>;
}

export class AudioServiceImpl implements AudioService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async transcribe(
    request: AudioTranscriptionRequest,
    options?: RequestOptions
  ): Promise<AudioTranscription> {
    AudioValidator.validateTranscription(request);

    const formBuilder = MultipartFormBuilder.create()
      .addFile('file', request.file, 'audio.mp3')
      .addField('model', request.model);

    if (request.language) formBuilder.addField('language', request.language);
    if (request.prompt) formBuilder.addField('prompt', request.prompt);
    if (request.response_format) formBuilder.addField('response_format', request.response_format);
    if (request.temperature !== undefined) formBuilder.addField('temperature', String(request.temperature));
    if (request.timestamp_granularities) {
      request.timestamp_granularities.forEach(g => formBuilder.addField('timestamp_granularities[]', g));
    }

    const httpRequest = RequestBuilder.create()
      .setMethod('POST')
      .setPath('/v1/audio/transcriptions')
      .setBody(formBuilder.build())
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<AudioTranscription>(response);
  }

  async translate(
    request: AudioTranslationRequest,
    options?: RequestOptions
  ): Promise<AudioTranscription> {
    AudioValidator.validateTranslation(request);

    const formBuilder = MultipartFormBuilder.create()
      .addFile('file', request.file, 'audio.mp3')
      .addField('model', request.model);

    if (request.prompt) formBuilder.addField('prompt', request.prompt);
    if (request.response_format) formBuilder.addField('response_format', request.response_format);
    if (request.temperature !== undefined) formBuilder.addField('temperature', String(request.temperature));

    const httpRequest = RequestBuilder.create()
      .setMethod('POST')
      .setPath('/v1/audio/translations')
      .setBody(formBuilder.build())
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<AudioTranscription>(response);
  }

  async speech(request: SpeechRequest, options?: RequestOptions): Promise<ArrayBuffer> {
    AudioValidator.validateSpeech(request);

    const httpRequest = RequestBuilder.create()
      .setMethod('POST')
      .setPath('/v1/audio/speech')
      .setBody(request)
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<ArrayBuffer>(response);
  }
}

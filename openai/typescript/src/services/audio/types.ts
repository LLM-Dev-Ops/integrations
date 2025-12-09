import type { RequestOptions } from '../../types/common.js';

export type AudioModel = 'whisper-1';
export type AudioResponseFormat = 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
export type SpeechModel = 'tts-1' | 'tts-1-hd';
export type SpeechResponseFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
export type VoiceType = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface AudioTranscriptionRequest {
  file: File | Blob;
  model: AudioModel;
  language?: string;
  prompt?: string;
  response_format?: AudioResponseFormat;
  temperature?: number;
  timestamp_granularities?: ('word' | 'segment')[];
}

export interface AudioTranslationRequest {
  file: File | Blob;
  model: AudioModel;
  prompt?: string;
  response_format?: AudioResponseFormat;
  temperature?: number;
}

export interface SpeechRequest {
  model: SpeechModel;
  input: string;
  voice: VoiceType;
  response_format?: SpeechResponseFormat;
  speed?: number;
}

export interface AudioTranscription {
  text: string;
  task?: string;
  language?: string;
  duration?: number;
  words?: AudioWord[];
  segments?: AudioSegment[];
}

export interface AudioWord {
  word: string;
  start: number;
  end: number;
}

export interface AudioSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export type AudioTranslation = AudioTranscription;

export type AudioTranscriptionParams = AudioTranscriptionRequest & RequestOptions;
export type AudioTranslationParams = AudioTranslationRequest & RequestOptions;
export type SpeechCreateParams = SpeechRequest & RequestOptions;

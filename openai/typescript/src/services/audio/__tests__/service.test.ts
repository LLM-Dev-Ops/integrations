import { describe, it, expect, beforeEach } from 'vitest';
import { AudioServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  create401UnauthorizedError,
  create500InternalServerError,
  createTimeoutError,
} from '../../../__fixtures__/index.js';

describe('AudioService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: AudioServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new AudioServiceImpl(mockOrchestrator);
  });

  describe('transcribe', () => {
    it('should transcribe audio successfully', async () => {
      const response = {
        text: 'Hello, this is a test transcription.',
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const audioFile = new Blob(['audio'], { type: 'audio/mpeg' });
      const result = await service.transcribe({
        file: audioFile,
        model: 'whisper-1',
      });

      expect(result.text).toBe('Hello, this is a test transcription.');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/audio/transcriptions',
        })
      );
    });

    it('should handle validation errors', async () => {
      await expect(
        service.transcribe({ file: undefined as any, model: 'whisper-1' })
      ).rejects.toThrow();
    });

    it('should handle unauthorized errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Unauthorized')
      );

      const audioFile = new Blob(['audio'], { type: 'audio/mpeg' });
      await expect(
        service.transcribe({ file: audioFile, model: 'whisper-1' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('translate', () => {
    it('should translate audio successfully', async () => {
      const response = {
        text: 'Hello, this is a test translation.',
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const audioFile = new Blob(['audio'], { type: 'audio/mpeg' });
      const result = await service.translate({
        file: audioFile,
        model: 'whisper-1',
      });

      expect(result.text).toBe('Hello, this is a test translation.');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/audio/translations',
        })
      );
    });

    it('should handle timeout errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        createTimeoutError()
      );

      const audioFile = new Blob(['audio'], { type: 'audio/mpeg' });
      await expect(
        service.translate({ file: audioFile, model: 'whisper-1' })
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('speak', () => {
    it('should generate speech successfully', async () => {
      const audioBuffer = new ArrayBuffer(1024);

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
        data: audioBuffer,
      });

      const result = await service.speak({
        model: 'tts-1',
        input: 'Hello, world!',
        voice: 'alloy',
      });

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/audio/speech',
        })
      );
    });

    it('should handle validation errors', async () => {
      await expect(
        service.speak({ model: 'tts-1', input: '', voice: 'alloy' })
      ).rejects.toThrow();
    });

    it('should handle server errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Internal server error')
      );

      await expect(
        service.speak({ model: 'tts-1', input: 'test', voice: 'alloy' })
      ).rejects.toThrow('Internal server error');
    });
  });
});

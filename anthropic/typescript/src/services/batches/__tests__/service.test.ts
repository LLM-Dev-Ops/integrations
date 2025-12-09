import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchesServiceImpl } from '../service.js';
import type {
  MessageBatch,
  CreateBatchRequest,
  BatchListParams,
  BatchListResponse,
  BatchResultsResponse,
} from '../types.js';
import { createMockHttpTransport, mockHttpTransportResponse, mockHttpTransportError } from '../../../__mocks__/http-transport.mock.js';
import { createMockAuthManager } from '../../../__mocks__/auth-manager.mock.js';
import { createMockResilienceOrchestrator, mockResilienceOrchestratorError } from '../../../__mocks__/resilience.mock.js';
import { ValidationError, ServerError } from '../../../errors/categories.js';

describe('BatchesServiceImpl', () => {
  let service: BatchesServiceImpl;
  let mockTransport: ReturnType<typeof createMockHttpTransport>;
  let mockAuth: ReturnType<typeof createMockAuthManager>;
  let mockResilience: ReturnType<typeof createMockResilienceOrchestrator>;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new BatchesServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('create', () => {
    it('should create a batch successfully', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
          {
            custom_id: 'req-2',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'World' }],
            },
          },
        ],
      };

      const expectedResponse: MessageBatch = {
        id: 'msgbatch_01ABC123',
        type: 'message_batch',
        processing_status: 'in_progress',
        request_counts: {
          succeeded: 0,
          errored: 0,
          expired: 0,
          canceled: 0,
        },
        created_at: '2024-10-22T12:00:00Z',
        expires_at: '2024-10-23T12:00:00Z',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.create(request);

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/batches',
        request,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
        ],
      };

      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 30000,
      };

      mockTransport.request.mockResolvedValue({} as MessageBatch);

      await service.create(request, options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/batches',
        request,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 30000,
        })
      );
    });

    it('should throw ValidationError for missing request', async () => {
      await expect(service.create(null as any)).rejects.toThrow(ValidationError);
      await expect(service.create(null as any)).rejects.toThrow('Request is required');
    });

    it('should throw ValidationError for missing requests array', async () => {
      const request = {} as CreateBatchRequest;
      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Requests must be an array');
    });

    it('should throw ValidationError for empty requests array', async () => {
      const request: CreateBatchRequest = {
        requests: [],
      };
      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Requests array cannot be empty');
    });

    it('should throw ValidationError for missing custom_id', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: '',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
        ],
      };
      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Request at index 0 must have a valid custom_id');
    });

    it('should throw ValidationError for missing params', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: null as any,
          },
        ],
      };
      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Request at index 0 must have params');
    });

    it('should throw ValidationError for missing model in params', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: {
              model: '',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'Hello' }],
            } as any,
          },
        ],
      };
      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Request at index 0: model is required');
    });

    it('should throw ValidationError for invalid max_tokens', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 0,
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
        ],
      };
      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Request at index 0: max_tokens must be a positive number');
    });

    it('should throw ValidationError for empty messages array', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1024,
              messages: [],
            },
          },
        ],
      };
      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Request at index 0: messages must be a non-empty array');
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
        ],
      };

      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.create(request)).rejects.toThrow(apiError);
    });

    it('should validate multiple requests correctly', async () => {
      const request: CreateBatchRequest = {
        requests: [
          {
            custom_id: 'req-1',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
          {
            custom_id: 'req-2',
            params: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 0, // Invalid
              messages: [{ role: 'user', content: 'World' }],
            },
          },
        ],
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
      await expect(service.create(request)).rejects.toThrow('Request at index 1: max_tokens must be a positive number');
    });
  });

  describe('retrieve', () => {
    it('should retrieve a batch successfully', async () => {
      const expectedResponse: MessageBatch = {
        id: 'msgbatch_01ABC123',
        type: 'message_batch',
        processing_status: 'ended',
        request_counts: {
          succeeded: 2,
          errored: 0,
          expired: 0,
          canceled: 0,
        },
        created_at: '2024-10-22T12:00:00Z',
        expires_at: '2024-10-23T12:00:00Z',
        ended_at: '2024-10-22T13:00:00Z',
        results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_01ABC123/results',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.retrieve('msgbatch_01ABC123');

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches/msgbatch_01ABC123',
        undefined,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 10000,
      };

      mockTransport.request.mockResolvedValue({} as MessageBatch);

      await service.retrieve('msgbatch_01ABC123', options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches/msgbatch_01ABC123',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 10000,
        })
      );
    });

    it('should throw ValidationError for missing batch ID', async () => {
      await expect(service.retrieve('')).rejects.toThrow(ValidationError);
      await expect(service.retrieve('')).rejects.toThrow('Batch ID is required and must be a non-empty string');
    });

    it('should throw ValidationError for whitespace-only batch ID', async () => {
      await expect(service.retrieve('   ')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for null batch ID', async () => {
      await expect(service.retrieve(null as any)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for undefined batch ID', async () => {
      await expect(service.retrieve(undefined as any)).rejects.toThrow(ValidationError);
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.retrieve('msgbatch_01ABC123')).rejects.toThrow(apiError);
    });
  });

  describe('list', () => {
    it('should list batches successfully', async () => {
      const expectedResponse: BatchListResponse = {
        data: [
          {
            id: 'msgbatch_01ABC123',
            type: 'message_batch',
            processing_status: 'ended',
            request_counts: {
              succeeded: 2,
              errored: 0,
              expired: 0,
              canceled: 0,
            },
            created_at: '2024-10-22T12:00:00Z',
            expires_at: '2024-10-23T12:00:00Z',
            ended_at: '2024-10-22T13:00:00Z',
          },
        ],
        has_more: false,
        first_id: 'msgbatch_01ABC123',
        last_id: 'msgbatch_01ABC123',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.list();

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches',
        undefined,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should list batches with before_id parameter', async () => {
      const params: BatchListParams = {
        before_id: 'msgbatch_01XYZ',
      };

      mockTransport.request.mockResolvedValue({ data: [], has_more: false });

      await service.list(params);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches?before_id=msgbatch_01XYZ',
        undefined,
        expect.anything()
      );
    });

    it('should list batches with after_id parameter', async () => {
      const params: BatchListParams = {
        after_id: 'msgbatch_01ABC',
      };

      mockTransport.request.mockResolvedValue({ data: [], has_more: false });

      await service.list(params);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches?after_id=msgbatch_01ABC',
        undefined,
        expect.anything()
      );
    });

    it('should list batches with limit parameter', async () => {
      const params: BatchListParams = {
        limit: 10,
      };

      mockTransport.request.mockResolvedValue({ data: [], has_more: false });

      await service.list(params);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches?limit=10',
        undefined,
        expect.anything()
      );
    });

    it('should list batches with multiple parameters', async () => {
      const params: BatchListParams = {
        after_id: 'msgbatch_01ABC',
        limit: 20,
      };

      mockTransport.request.mockResolvedValue({ data: [], has_more: false });

      await service.list(params);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches?after_id=msgbatch_01ABC&limit=20',
        undefined,
        expect.anything()
      );
    });

    it('should throw ValidationError for both before_id and after_id', async () => {
      const params: BatchListParams = {
        before_id: 'msgbatch_01XYZ',
        after_id: 'msgbatch_01ABC',
      };

      await expect(service.list(params)).rejects.toThrow(ValidationError);
      await expect(service.list(params)).rejects.toThrow('Cannot specify both before_id and after_id');
    });

    it('should throw ValidationError for invalid limit', async () => {
      const params: BatchListParams = {
        limit: -1,
      };

      await expect(service.list(params)).rejects.toThrow(ValidationError);
      await expect(service.list(params)).rejects.toThrow('Limit must be a positive number');
    });

    it('should throw ValidationError for zero limit', async () => {
      const params: BatchListParams = {
        limit: 0,
      };

      await expect(service.list(params)).rejects.toThrow(ValidationError);
    });

    it('should pass request options to transport', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 15000,
      };

      mockTransport.request.mockResolvedValue({ data: [], has_more: false });

      await service.list(undefined, options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 15000,
        })
      );
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.list()).rejects.toThrow(apiError);
    });

    it('should handle special characters in query parameters', async () => {
      const params: BatchListParams = {
        before_id: 'msgbatch_01ABC&special=value',
      };

      mockTransport.request.mockResolvedValue({ data: [], has_more: false });

      await service.list(params);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches?before_id=msgbatch_01ABC%26special%3Dvalue',
        undefined,
        expect.anything()
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a batch successfully', async () => {
      const expectedResponse: MessageBatch = {
        id: 'msgbatch_01ABC123',
        type: 'message_batch',
        processing_status: 'canceling',
        request_counts: {
          succeeded: 1,
          errored: 0,
          expired: 0,
          canceled: 0,
        },
        created_at: '2024-10-22T12:00:00Z',
        expires_at: '2024-10-23T12:00:00Z',
        cancel_initiated_at: '2024-10-22T12:30:00Z',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.cancel('msgbatch_01ABC123');

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/batches/msgbatch_01ABC123/cancel',
        undefined,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 20000,
      };

      mockTransport.request.mockResolvedValue({} as MessageBatch);

      await service.cancel('msgbatch_01ABC123', options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/batches/msgbatch_01ABC123/cancel',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 20000,
        })
      );
    });

    it('should throw ValidationError for missing batch ID', async () => {
      await expect(service.cancel('')).rejects.toThrow(ValidationError);
      await expect(service.cancel('')).rejects.toThrow('Batch ID is required and must be a non-empty string');
    });

    it('should throw ValidationError for whitespace-only batch ID', async () => {
      await expect(service.cancel('   ')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for null batch ID', async () => {
      await expect(service.cancel(null as any)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for undefined batch ID', async () => {
      await expect(service.cancel(undefined as any)).rejects.toThrow(ValidationError);
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.cancel('msgbatch_01ABC123')).rejects.toThrow(apiError);
    });
  });

  describe('results', () => {
    it('should retrieve batch results successfully', async () => {
      const expectedResponse: BatchResultsResponse = [
        {
          custom_id: 'req-1',
          result: {
            type: 'succeeded',
            message: {
              id: 'msg_01XYZ',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello!' }],
              model: 'claude-3-5-sonnet-20241022',
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: {
                input_tokens: 10,
                output_tokens: 5,
              },
            },
          },
        },
        {
          custom_id: 'req-2',
          result: {
            type: 'errored',
            error: {
              type: 'invalid_request_error',
              message: 'Invalid parameters',
            },
          },
        },
      ];

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.results('msgbatch_01ABC123');

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches/msgbatch_01ABC123/results',
        undefined,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 25000,
      };

      mockTransport.request.mockResolvedValue([]);

      await service.results('msgbatch_01ABC123', options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/messages/batches/msgbatch_01ABC123/results',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 25000,
        })
      );
    });

    it('should throw ValidationError for missing batch ID', async () => {
      await expect(service.results('')).rejects.toThrow(ValidationError);
      await expect(service.results('')).rejects.toThrow('Batch ID is required and must be a non-empty string');
    });

    it('should throw ValidationError for whitespace-only batch ID', async () => {
      await expect(service.results('   ')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for null batch ID', async () => {
      await expect(service.results(null as any)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for undefined batch ID', async () => {
      await expect(service.results(undefined as any)).rejects.toThrow(ValidationError);
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.results('msgbatch_01ABC123')).rejects.toThrow(apiError);
    });

    it('should handle empty results', async () => {
      const expectedResponse: BatchResultsResponse = [];

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.results('msgbatch_01ABC123');

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle different result types', async () => {
      const expectedResponse: BatchResultsResponse = [
        {
          custom_id: 'req-1',
          result: {
            type: 'succeeded',
            message: {
              id: 'msg_01',
              type: 'message',
              role: 'assistant',
              content: [],
              model: 'claude-3-5-sonnet-20241022',
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
        },
        {
          custom_id: 'req-2',
          result: {
            type: 'errored',
            error: { type: 'error', message: 'Error occurred' },
          },
        },
        {
          custom_id: 'req-3',
          result: {
            type: 'expired',
          },
        },
        {
          custom_id: 'req-4',
          result: {
            type: 'canceled',
          },
        },
      ];

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.results('msgbatch_01ABC123');

      expect(result).toHaveLength(4);
      expect(result[0].result.type).toBe('succeeded');
      expect(result[1].result.type).toBe('errored');
      expect(result[2].result.type).toBe('expired');
      expect(result[3].result.type).toBe('canceled');
    });
  });
});

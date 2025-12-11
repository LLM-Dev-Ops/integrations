/**
 * Tests for the Embed service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EmbedServiceImpl } from '../services/embed';
import { CohereConfig } from '../config';
import { MockHttpTransport, assertRequestMade } from '../mocks';
import { embedResponse, embedResponseMultiType } from '../fixtures';
import { ValidationError } from '../errors';

describe('EmbedService', () => {
  let transport: MockHttpTransport;
  let config: CohereConfig;
  let service: EmbedServiceImpl;

  beforeEach(() => {
    transport = new MockHttpTransport();
    config = CohereConfig.create({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.cohere.ai',
    });
    service = new EmbedServiceImpl(transport, config);
  });

  describe('embed', () => {
    it('should create embeddings for texts', async () => {
      const mockResponse = embedResponse();
      transport.addJsonResponse(mockResponse);

      const result = await service.embed({
        texts: ['Hello', 'World'],
      });

      expect(result.embeddings).toBeDefined();
      expect(result.embeddings?.length).toBe(2);
      expect(result.texts).toEqual(['Hello', 'World']);

      assertRequestMade(transport, {
        method: 'POST',
        url: '/embed',
        bodyContains: { texts: ['Hello', 'World'] },
      });
    });

    it('should support multiple embedding types', async () => {
      const mockResponse = embedResponseMultiType();
      transport.addJsonResponse(mockResponse);

      const result = await service.embed({
        texts: ['Test text'],
        embeddingTypes: ['float', 'int8'],
      });

      expect(result.embeddingsByType).toBeDefined();
      expect(result.embeddingsByType?.float).toBeDefined();
      expect(result.embeddingsByType?.int8).toBeDefined();
    });

    it('should include input type in request', async () => {
      transport.addJsonResponse(embedResponse());

      await service.embed({
        texts: ['Query text'],
        inputType: 'search_query',
      });

      const request = transport.getLastRequest();
      const body = request?.body as Record<string, unknown>;
      expect(body['input_type']).toBe('search_query');
    });

    it('should throw validation error for empty texts', async () => {
      await expect(service.embed({ texts: [] })).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for too many texts', async () => {
      const texts = Array(100).fill('text');
      await expect(service.embed({ texts })).rejects.toThrow(ValidationError);
    });
  });

  describe('createJob', () => {
    it('should create an embed job', async () => {
      transport.addJsonResponse({
        job_id: 'job-123',
        status: 'processing',
      });

      const result = await service.createJob({
        datasetId: 'dataset-123',
        model: 'embed-english-v3.0',
      });

      expect(result.jobId).toBe('job-123');
      expect(result.status).toBe('processing');

      assertRequestMade(transport, {
        method: 'POST',
        url: '/embed-jobs',
        bodyContains: { dataset_id: 'dataset-123' },
      });
    });

    it('should throw validation error for missing dataset ID', async () => {
      await expect(
        service.createJob({ datasetId: '' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getJob', () => {
    it('should get an embed job by ID', async () => {
      transport.addJsonResponse({
        job_id: 'job-123',
        status: 'complete',
        output_dataset_id: 'output-123',
      });

      const result = await service.getJob('job-123');

      expect(result.jobId).toBe('job-123');
      expect(result.status).toBe('complete');
      expect(result.outputDatasetId).toBe('output-123');

      assertRequestMade(transport, {
        method: 'GET',
        url: '/embed-jobs/job-123',
      });
    });
  });

  describe('listJobs', () => {
    it('should list embed jobs', async () => {
      transport.addJsonResponse({
        embed_jobs: [
          { job_id: 'job-1', status: 'complete' },
          { job_id: 'job-2', status: 'processing' },
        ],
      });

      const result = await service.listJobs();

      expect(result.length).toBe(2);
      expect(result[0]?.jobId).toBe('job-1');
      expect(result[1]?.jobId).toBe('job-2');
    });
  });

  describe('cancelJob', () => {
    it('should cancel an embed job', async () => {
      transport.addJsonResponse({});

      await service.cancelJob('job-123');

      assertRequestMade(transport, {
        method: 'POST',
        url: '/embed-jobs/job-123/cancel',
      });
    });
  });
});

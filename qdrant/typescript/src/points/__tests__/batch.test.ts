/**
 * Batch Processing Tests
 *
 * Unit tests for batch processing utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { BatchProcessor, chunkArray, parallelMap } from '../batch.js';
import type { Point, UpsertResult } from '../types.js';

describe('BatchProcessor', () => {
  describe('processBatches', () => {
    it('should process small batch successfully', async () => {
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => ({
        operationId: 1,
        status: 'acknowledged',
      }));

      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = [
        { id: 1, vector: [0.1, 0.2] },
        { id: 2, vector: [0.3, 0.4] },
      ];

      const result = await processor.processBatches(points, { batchSize: 10 });

      expect(result.totalPoints).toBe(2);
      expect(result.batchesProcessed).toBe(1);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('should split into multiple batches', async () => {
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => ({
        operationId: 1,
        status: 'acknowledged',
      }));

      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      const result = await processor.processBatches(points, { batchSize: 10 });

      expect(result.totalPoints).toBe(25);
      expect(result.batchesProcessed).toBe(3); // 10 + 10 + 5
      expect(mockUpsert).toHaveBeenCalledTimes(3);
    });

    it('should respect max concurrency', async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);

        await new Promise((resolve) => setTimeout(resolve, 10));

        concurrentCalls--;
        return { operationId: 1, status: 'acknowledged' };
      });

      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      await processor.processBatches(points, {
        batchSize: 10,
        maxConcurrency: 3,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should call progress callback', async () => {
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => ({
        operationId: 1,
        status: 'acknowledged',
      }));

      const onProgress = vi.fn();
      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      await processor.processBatches(points, {
        batchSize: 10,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalled();
      // Last call should be with total points
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe(30);
      expect(lastCall?.[1]).toBe(30);
    });

    it('should call batch complete callback', async () => {
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => ({
        operationId: 1,
        status: 'acknowledged',
      }));

      const onBatchComplete = vi.fn();
      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      await processor.processBatches(points, {
        batchSize: 10,
        onBatchComplete,
      });

      expect(onBatchComplete).toHaveBeenCalledTimes(2);
      expect(onBatchComplete.mock.calls[0]?.[0]).toBe(0); // First batch index
      expect(onBatchComplete.mock.calls[1]?.[0]).toBe(1); // Second batch index
    });

    it('should handle batch errors', async () => {
      let callCount = 0;
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Batch failed');
        }
        return { operationId: 1, status: 'acknowledged' };
      });

      const onBatchError = vi.fn();
      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      const result = await processor.processBatches(points, {
        batchSize: 10,
        onBatchError,
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(1);
      expect(onBatchError).toHaveBeenCalledTimes(1);
    });

    it('should continue processing after batch error', async () => {
      let callCount = 0;
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Batch 2 failed');
        }
        return { operationId: 1, status: 'acknowledged' };
      });

      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      const result = await processor.processBatches(points, {
        batchSize: 10,
      });

      expect(result.batchesProcessed).toBe(2); // 1st and 3rd succeeded
      expect(result.errors?.length).toBe(1);
      expect(mockUpsert).toHaveBeenCalledTimes(3);
    });
  });

  describe('processBatchesWithRetry', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return { operationId: 1, status: 'acknowledged' };
      });

      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = [{ id: 1, vector: [0.1, 0.2] }];

      const result = await processor.processBatchesWithRetry(points, {
        batchSize: 10,
        maxRetries: 3,
      });

      expect(result.batchesProcessed).toBe(1);
      expect(attempts).toBe(2);
    });

    it('should fail after max retries', async () => {
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => {
        throw new Error('Persistent failure');
      });

      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = [{ id: 1, vector: [0.1, 0.2] }];

      await expect(
        processor.processBatchesWithRetry(points, {
          batchSize: 10,
          maxRetries: 2,
        })
      ).rejects.toThrow('Batch processing failed after retries');

      expect(mockUpsert).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry on partial success', async () => {
      let callCount = 0;
      const mockUpsert = vi.fn(async (points: Point[]): Promise<UpsertResult> => {
        callCount++;
        // Fail only 1 out of 3 batches (33% failure)
        if (callCount === 2) {
          throw new Error('Single batch failed');
        }
        return { operationId: 1, status: 'acknowledged' };
      });

      const processor = new BatchProcessor(mockUpsert);
      const points: Point[] = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      const result = await processor.processBatchesWithRetry(points, {
        batchSize: 10,
        maxRetries: 3,
      });

      // Should succeed with partial errors
      expect(result.batchesProcessed).toBe(2);
      expect(result.errors?.length).toBe(1);
    });
  });
});

describe('chunkArray', () => {
  it('should split array into chunks', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const chunks = chunkArray(arr, 3);

    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toEqual([1, 2, 3]);
    expect(chunks[1]).toEqual([4, 5, 6]);
    expect(chunks[2]).toEqual([7, 8, 9]);
    expect(chunks[3]).toEqual([10]);
  });

  it('should handle empty array', () => {
    const chunks = chunkArray([], 5);
    expect(chunks).toHaveLength(0);
  });

  it('should handle chunk size larger than array', () => {
    const arr = [1, 2, 3];
    const chunks = chunkArray(arr, 10);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual([1, 2, 3]);
  });

  it('should handle chunk size of 1', () => {
    const arr = [1, 2, 3];
    const chunks = chunkArray(arr, 1);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([1]);
    expect(chunks[1]).toEqual([2]);
    expect(chunks[2]).toEqual([3]);
  });
});

describe('parallelMap', () => {
  it('should process items in parallel', async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = vi.fn(async (item: number) => item * 2);

    const results = await parallelMap(items, fn, 2);

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('should respect concurrency limit', async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    const fn = async (item: number) => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);

      await new Promise((resolve) => setTimeout(resolve, 10));

      concurrentCalls--;
      return item * 2;
    };

    await parallelMap(items, fn, 3);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('should preserve order', async () => {
    const items = [5, 4, 3, 2, 1];
    const fn = async (item: number) => {
      // Add random delay
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      return item * 2;
    };

    const results = await parallelMap(items, fn, 3);

    expect(results).toEqual([10, 8, 6, 4, 2]);
  });

  it('should handle errors', async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = async (item: number) => {
      if (item === 3) {
        throw new Error('Failed at 3');
      }
      return item * 2;
    };

    await expect(parallelMap(items, fn, 2)).rejects.toThrow('Failed at 3');
  });

  it('should handle empty array', async () => {
    const fn = vi.fn(async (item: number) => item * 2);
    const results = await parallelMap([], fn, 5);

    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should pass index to function', async () => {
    const items = ['a', 'b', 'c'];
    const indices: number[] = [];

    const fn = async (item: string, index: number) => {
      indices.push(index);
      return item.toUpperCase();
    };

    await parallelMap(items, fn, 2);

    expect(indices).toEqual([0, 1, 2]);
  });
});

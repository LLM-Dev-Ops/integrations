/**
 * Examples demonstrating batch operations usage
 *
 * These examples show common batch operation patterns and best practices.
 */

import { BatchService } from './service.js';
import type { BatchObject } from '../types/batch.js';
import type { HttpTransport } from '../transport/types.js';
import type { ObservabilityContext } from '../observability/types.js';
import type { ResilienceOrchestrator } from '../resilience/orchestrator.js';

/**
 * Example 1: Simple batch create with progress tracking
 */
export async function exampleSimpleBatchCreate(
  batchService: BatchService
): Promise<void> {
  // Prepare objects
  const objects: BatchObject[] = [];
  for (let i = 0; i < 1000; i++) {
    objects.push({
      className: 'Article',
      properties: {
        title: `Article ${i}`,
        content: `Content for article ${i}`,
        publishedDate: new Date().toISOString(),
      },
      vector: Array.from({ length: 768 }, () => Math.random()),
    });
  }

  // Execute batch create with progress tracking
  console.log('Starting batch create...');

  const response = await batchService.batchCreate(objects, {
    batchSize: 100,
    maxParallelism: 4,
    continueOnError: true,
    onProgress: (current, total, successful, failed) => {
      const percentage = Math.floor((current / total) * 100);
      console.log(
        `Progress: ${percentage}% (${current}/${total}) - ` +
          `✓ ${successful} succeeded, ✗ ${failed} failed`
      );
    },
  });

  console.log('\nBatch create completed:');
  console.log(`  Total: ${objects.length}`);
  console.log(`  Successful: ${response.successful}`);
  console.log(`  Failed: ${response.failed}`);
  console.log(`  Time: ${response.elapsedMs}ms`);

  if (response.errors && response.errors.length > 0) {
    console.log(`\nErrors:`);
    response.errors.slice(0, 5).forEach((error) => {
      console.log(`  [${error.index}] ${error.errorMessage}`);
    });
    if (response.errors.length > 5) {
      console.log(`  ... and ${response.errors.length - 5} more errors`);
    }
  }
}

/**
 * Example 2: Batch create with automatic retry
 */
export async function exampleBatchCreateWithRetry(
  batchService: BatchService
): Promise<void> {
  const objects: BatchObject[] = [
    {
      className: 'Article',
      properties: {
        title: 'Retryable Article',
        content: 'This might fail transiently',
      },
      vector: Array.from({ length: 768 }, () => Math.random()),
    },
    // ... more objects
  ];

  console.log('Starting batch create with automatic retry...');

  const result = await batchService.batchCreateWithRetry(objects, {
    maxRetries: 3,
    batchSize: 100,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: true,
    continueOnError: true,
    onProgress: (current, total, successful, failed) => {
      console.log(`Progress: ${current}/${total} (${successful} ok, ${failed} failed)`);
    },
  });

  console.log('\nBatch create with retry completed:');
  console.log(`  Total: ${result.total}`);
  console.log(`  Successful: ${result.successful}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Attempts: ${result.attempts}`);
  console.log(`  Time: ${result.elapsedMs}ms`);

  if (result.errors.length > 0) {
    console.log(`\nPermanent failures (${result.errors.length}):`);
    result.errors.slice(0, 3).forEach((error) => {
      console.log(`  [${error.index}] ${error.errorMessage}`);
    });
  }
}

/**
 * Example 3: Batch delete by filter
 */
export async function exampleBatchDelete(
  batchService: BatchService
): Promise<void> {
  // First, do a dry run to see how many objects would be deleted
  console.log('Performing dry run...');

  const dryRunResponse = await batchService.batchDelete(
    'Article',
    {
      operator: 'Operand',
      operand: {
        path: ['status'],
        operator: 'Equal',
        value: { valueText: 'archived' },
      },
    },
    {
      dryRun: true,
      output: 'minimal',
    }
  );

  console.log(`Dry run results:`);
  console.log(`  Matched: ${dryRunResponse.matched} objects`);
  console.log(`  Would delete: ${dryRunResponse.matched} objects`);

  // Confirm and execute actual deletion
  console.log('\nExecuting actual deletion...');

  const deleteResponse = await batchService.batchDelete(
    'Article',
    {
      operator: 'Operand',
      operand: {
        path: ['status'],
        operator: 'Equal',
        value: { valueText: 'archived' },
      },
    },
    {
      dryRun: false,
      output: 'verbose',
    }
  );

  console.log(`Deletion results:`);
  console.log(`  Matched: ${deleteResponse.matched}`);
  console.log(`  Deleted: ${deleteResponse.deleted}`);
  console.log(`  Time: ${deleteResponse.elapsedMs}ms`);

  if (deleteResponse.results?.failed && deleteResponse.results.failed.length > 0) {
    console.log(`\nFailed deletions:`);
    deleteResponse.results.failed.forEach((failure) => {
      console.log(`  ${failure.id}: ${failure.error}`);
    });
  }
}

/**
 * Example 4: Batch update objects
 */
export async function exampleBatchUpdate(
  batchService: BatchService
): Promise<void> {
  const updates = [
    {
      className: 'Article',
      id: '550e8400-e29b-41d4-a716-446655440000',
      properties: {
        status: 'published',
        lastModified: new Date().toISOString(),
      },
      merge: true, // Merge with existing properties
    },
    {
      className: 'Article',
      id: '550e8400-e29b-41d4-a716-446655440001',
      properties: {
        status: 'published',
        lastModified: new Date().toISOString(),
      },
      merge: true,
    },
    // ... more updates
  ];

  console.log('Starting batch update...');

  const response = await batchService.batchUpdate(updates, {
    batchSize: 50,
    continueOnError: true,
  });

  console.log('\nBatch update completed:');
  console.log(`  Total: ${updates.length}`);
  console.log(`  Successful: ${response.successful}`);
  console.log(`  Failed: ${response.failed}`);
  console.log(`  Time: ${response.elapsedMs}ms`);
}

/**
 * Example 5: Handling large batches with optimal chunking
 */
export async function exampleLargeBatchOptimized(
  batchService: BatchService
): Promise<void> {
  // Generate large dataset
  const objects: BatchObject[] = [];
  for (let i = 0; i < 10000; i++) {
    objects.push({
      className: 'Document',
      properties: {
        title: `Document ${i}`,
        content: 'Lorem ipsum '.repeat(100), // ~1KB per object
        metadata: {
          index: i,
          batch: Math.floor(i / 1000),
        },
      },
      vector: Array.from({ length: 1536 }, () => Math.random()), // Large vector
    });
  }

  console.log(`Processing ${objects.length} objects...`);

  let lastProgress = 0;
  const startTime = Date.now();

  const response = await batchService.batchCreate(objects, {
    batchSize: 50, // Smaller batches for large objects
    maxParallelism: 8, // Higher parallelism for throughput
    continueOnError: true,
    onProgress: (current, total, successful, failed) => {
      const progress = Math.floor((current / total) * 100);
      // Only log every 10%
      if (progress >= lastProgress + 10) {
        const elapsed = Date.now() - startTime;
        const rate = Math.round((current / elapsed) * 1000);
        console.log(
          `${progress}% complete - ${rate} obj/sec - ` +
            `${successful} ok, ${failed} failed`
        );
        lastProgress = progress;
      }
    },
  });

  const totalTime = Date.now() - startTime;
  const avgRate = Math.round((objects.length / totalTime) * 1000);

  console.log('\nBatch processing completed:');
  console.log(`  Total objects: ${objects.length}`);
  console.log(`  Successful: ${response.successful}`);
  console.log(`  Failed: ${response.failed}`);
  console.log(`  Total time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`  Average rate: ${avgRate} objects/sec`);
}

/**
 * Example 6: Multi-tenant batch operations
 */
export async function exampleMultiTenantBatch(
  batchService: BatchService
): Promise<void> {
  // Batch create for specific tenant
  const tenantObjects: BatchObject[] = [
    {
      className: 'Product',
      properties: {
        name: 'Product A',
        price: 29.99,
      },
      tenant: 'tenant-123',
    },
    {
      className: 'Product',
      properties: {
        name: 'Product B',
        price: 49.99,
      },
      tenant: 'tenant-123',
    },
  ];

  console.log('Creating objects for tenant-123...');

  const response = await batchService.batchCreate(tenantObjects, {
    batchSize: 100,
    tenant: 'tenant-123',
  });

  console.log(`Created ${response.successful} objects for tenant-123`);

  // Batch delete for specific tenant
  console.log('\nDeleting archived products for tenant-123...');

  const deleteResponse = await batchService.batchDelete(
    'Product',
    {
      operator: 'Operand',
      operand: {
        path: ['archived'],
        operator: 'Equal',
        value: { valueBoolean: true },
      },
    },
    {
      tenant: 'tenant-123',
      dryRun: false,
    }
  );

  console.log(`Deleted ${deleteResponse.deleted} archived products`);
}

/**
 * Example 7: Error handling and recovery
 */
export async function exampleErrorHandling(
  batchService: BatchService
): Promise<void> {
  const objects: BatchObject[] = [
    // Mix of valid and invalid objects
    {
      className: 'Article',
      properties: { title: 'Valid Article' },
      vector: Array.from({ length: 768 }, () => Math.random()),
    },
    {
      className: 'NonExistentClass', // This will fail
      properties: { title: 'Invalid Article' },
      vector: Array.from({ length: 768 }, () => Math.random()),
    },
    {
      className: 'Article',
      properties: { title: 'Another Valid Article' },
      vector: Array.from({ length: 768 }, () => Math.random()),
    },
  ];

  try {
    console.log('Attempting batch create with mixed valid/invalid objects...');

    const response = await batchService.batchCreate(objects, {
      batchSize: 10,
      continueOnError: true, // Continue processing despite errors
    });

    console.log('\nResults:');
    console.log(`  Successful: ${response.successful}`);
    console.log(`  Failed: ${response.failed}`);

    if (response.errors) {
      console.log('\nError details:');
      response.errors.forEach((error) => {
        console.log(`  Object ${error.index}: ${error.errorMessage}`);
      });
    }
  } catch (error) {
    console.error('Batch operation failed:', error);
  }
}

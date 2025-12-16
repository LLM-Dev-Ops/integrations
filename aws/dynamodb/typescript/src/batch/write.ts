/**
 * DynamoDB BatchWriteItem operations following SPARC specification.
 *
 * Provides batch write operations (put/delete) with automatic chunking and retry logic.
 */

import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Key } from '../types/key.js';
import type { WriteRequest } from '../types/batch.js';
import type { BatchWriteResult } from '../types/results.js';
import { toKeyMap } from '../types/key.js';
import { chunk } from './chunker.js';

/**
 * Maximum number of write requests allowed in a single BatchWriteItem request.
 * AWS DynamoDB limit.
 */
const MAX_BATCH_WRITE_ITEMS = 25;

/**
 * Default maximum number of retries for unprocessed items.
 */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Base delay for exponential backoff (milliseconds).
 */
const BASE_DELAY_MS = 100;

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
function calculateBackoff(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

/**
 * Converts WriteRequest to AWS SDK format.
 *
 * @param request - Write request to convert
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @returns AWS SDK WriteRequest format
 */
function toAwsWriteRequest(
  request: WriteRequest,
  pkName: string,
  skName: string | undefined
): { PutRequest?: { Item: Record<string, unknown> }; DeleteRequest?: { Key: Record<string, unknown> } } {
  if (request.type === 'put') {
    return {
      PutRequest: {
        Item: request.item,
      },
    };
  } else {
    return {
      DeleteRequest: {
        Key: toKeyMap(request.key, pkName, skName),
      },
    };
  }
}

/**
 * Converts AWS SDK WriteRequest back to our format.
 *
 * @param awsRequest - AWS SDK write request
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @returns WriteRequest in our format
 */
function fromAwsWriteRequest(
  awsRequest: { PutRequest?: { Item: Record<string, unknown> }; DeleteRequest?: { Key: Record<string, unknown> } },
  pkName: string,
  skName: string | undefined
): WriteRequest {
  if (awsRequest.PutRequest) {
    return {
      type: 'put',
      item: awsRequest.PutRequest.Item,
    };
  } else if (awsRequest.DeleteRequest) {
    const keyMap = awsRequest.DeleteRequest.Key;
    return {
      type: 'delete',
      key: {
        partitionKey: keyMap[pkName],
        sortKey: skName ? keyMap[skName] : undefined,
      },
    };
  } else {
    throw new Error('Invalid AWS WriteRequest format');
  }
}

/**
 * Executes a single BatchWriteItem operation.
 *
 * Writes up to 25 items in a single request. Does not automatically retry
 * unprocessed items - use batchWriteWithRetry for automatic retry handling.
 *
 * @param docClient - DynamoDB document client
 * @param tableName - Name of the table
 * @param requests - Array of write requests (max 25)
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @returns Result containing processed count and any unprocessed items
 * @throws Error if requests array exceeds 25 items
 *
 * @example
 * ```typescript
 * const requests: WriteRequest[] = [
 *   { type: 'put', item: { userId: 'user-1', name: 'Alice' } },
 *   { type: 'delete', key: { partitionKey: 'user-2' } },
 * ];
 *
 * const result = await batchWrite(
 *   docClient,
 *   'Users',
 *   requests,
 *   'userId',
 *   undefined
 * );
 *
 * console.log(`Processed ${result.processedCount} items`);
 * if (result.unprocessedItems && result.unprocessedItems.length > 0) {
 *   console.log(`${result.unprocessedItems.length} items were not processed`);
 * }
 * ```
 */
export async function batchWrite(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  requests: WriteRequest[],
  pkName: string,
  skName: string | undefined
): Promise<BatchWriteResult> {
  // Validate input
  if (requests.length === 0) {
    return {
      processedCount: 0,
      unprocessedItems: [],
      consumedCapacity: [],
    };
  }

  if (requests.length > MAX_BATCH_WRITE_ITEMS) {
    throw new Error(
      `Cannot batch write more than ${MAX_BATCH_WRITE_ITEMS} items. Got ${requests.length}. Use batchWriteWithRetry instead.`
    );
  }

  // Convert requests to AWS format
  const awsRequests = requests.map((req) => toAwsWriteRequest(req, pkName, skName));

  // Build BatchWriteCommand
  const command = new BatchWriteCommand({
    RequestItems: {
      [tableName]: awsRequests,
    },
    ReturnConsumedCapacity: 'TOTAL',
  });

  // Execute command
  const response = await docClient.send(command);

  // Extract unprocessed items
  const unprocessedItemsRaw = response.UnprocessedItems?.[tableName] || [];
  const unprocessedItems: WriteRequest[] = unprocessedItemsRaw.map((awsReq) =>
    fromAwsWriteRequest(awsReq, pkName, skName)
  );

  // Calculate processed count
  const processedCount = requests.length - unprocessedItems.length;

  // Log warning if there are unprocessed items
  if (unprocessedItems.length > 0) {
    console.warn(
      `BatchWriteItem: ${unprocessedItems.length} of ${requests.length} items were not processed`
    );
  }

  // Extract consumed capacity
  const consumedCapacity = response.ConsumedCapacity || [];

  return {
    processedCount,
    unprocessedItems: unprocessedItems.length > 0 ? unprocessedItems : undefined,
    consumedCapacity,
  };
}

/**
 * Executes BatchWriteItem with automatic chunking and retry logic.
 *
 * Handles any number of write requests by automatically chunking into batches of 25.
 * Automatically retries unprocessed items with exponential backoff.
 *
 * @param docClient - DynamoDB document client
 * @param tableName - Name of the table
 * @param requests - Array of write requests (any size)
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @param maxRetries - Maximum number of retry attempts for unprocessed items
 * @returns Aggregate result with total processed count and any remaining unprocessed items
 *
 * @example
 * ```typescript
 * // Write 100 items - automatically chunked into 4 batches
 * const requests: WriteRequest[] = Array.from({ length: 100 }, (_, i) => ({
 *   type: 'put',
 *   item: { userId: `user-${i}`, name: `User ${i}` }
 * }));
 *
 * const result = await batchWriteWithRetry(
 *   docClient,
 *   'Users',
 *   requests,
 *   'userId',
 *   undefined
 * );
 *
 * console.log(`Processed ${result.processedCount} items`);
 * ```
 */
export async function batchWriteWithRetry(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  requests: WriteRequest[],
  pkName: string,
  skName: string | undefined,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<BatchWriteResult> {
  if (requests.length === 0) {
    return {
      processedCount: 0,
      unprocessedItems: [],
      consumedCapacity: [],
    };
  }

  let totalProcessed = 0;
  const allConsumedCapacity: any[] = [];

  // Chunk requests into batches of 25
  const requestChunks = chunk(requests, MAX_BATCH_WRITE_ITEMS);

  // Process each chunk
  for (const requestChunk of requestChunks) {
    let remainingRequests = requestChunk;
    let attempt = 0;

    // Retry loop for unprocessed items
    while (remainingRequests.length > 0 && attempt <= maxRetries) {
      // Add backoff delay for retries
      if (attempt > 0) {
        const delay = calculateBackoff(attempt - 1);
        console.warn(
          `Retrying ${remainingRequests.length} unprocessed items (attempt ${attempt}/${maxRetries}) after ${delay}ms`
        );
        await sleep(delay);
      }

      // Execute batch write
      const result = await batchWrite(
        docClient,
        tableName,
        remainingRequests,
        pkName,
        skName
      );

      // Accumulate results
      totalProcessed += result.processedCount;
      if (result.consumedCapacity) {
        allConsumedCapacity.push(...result.consumedCapacity);
      }

      // Update remaining requests for retry
      if (result.unprocessedItems && result.unprocessedItems.length > 0) {
        remainingRequests = result.unprocessedItems;
        attempt++;
      } else {
        // All items processed successfully
        remainingRequests = [];
      }
    }

    // Log warning if we exhausted retries
    if (remainingRequests.length > 0) {
      console.error(
        `Failed to write ${remainingRequests.length} items after ${maxRetries} retries`
      );
    }
  }

  return {
    processedCount: totalProcessed,
    consumedCapacity: allConsumedCapacity,
  };
}

/**
 * Batch puts multiple items with automatic retry.
 *
 * Convenience method that converts items to put requests and calls batchWriteWithRetry.
 *
 * @template T - Type of items to put
 * @param docClient - DynamoDB document client
 * @param tableName - Name of the table
 * @param items - Array of items to put (any size)
 * @returns Result with processed count and consumed capacity
 *
 * @example
 * ```typescript
 * const users = [
 *   { userId: 'user-1', name: 'Alice' },
 *   { userId: 'user-2', name: 'Bob' },
 * ];
 *
 * const result = await batchPut(docClient, 'Users', users);
 * console.log(`Put ${result.processedCount} items`);
 * ```
 */
export async function batchPut<T extends Record<string, unknown>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  items: T[]
): Promise<BatchWriteResult> {
  // Convert items to write requests
  const requests: WriteRequest[] = items.map((item) => ({
    type: 'put',
    item,
  }));

  // Call batchWriteWithRetry (pkName/skName not needed for puts)
  return batchWriteWithRetry(docClient, tableName, requests, '', undefined);
}

/**
 * Batch deletes multiple items with automatic retry.
 *
 * Convenience method that converts keys to delete requests and calls batchWriteWithRetry.
 *
 * @param docClient - DynamoDB document client
 * @param tableName - Name of the table
 * @param keys - Array of keys to delete (any size)
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @returns Result with processed count and consumed capacity
 *
 * @example
 * ```typescript
 * const keysToDelete = [
 *   { partitionKey: 'user-1' },
 *   { partitionKey: 'user-2' },
 * ];
 *
 * const result = await batchDelete(
 *   docClient,
 *   'Users',
 *   keysToDelete,
 *   'userId',
 *   undefined
 * );
 *
 * console.log(`Deleted ${result.processedCount} items`);
 * ```
 */
export async function batchDelete(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  keys: Key[],
  pkName: string,
  skName: string | undefined
): Promise<BatchWriteResult> {
  // Convert keys to write requests
  const requests: WriteRequest[] = keys.map((key) => ({
    type: 'delete',
    key,
  }));

  // Call batchWriteWithRetry
  return batchWriteWithRetry(docClient, tableName, requests, pkName, skName);
}

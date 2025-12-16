/**
 * DynamoDB BatchGetItem operations following SPARC specification.
 *
 * Provides batch read operations with automatic chunking and retry logic.
 */

import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import type { Key } from '../types/key.js';
import type { BatchGetResult } from '../types/results.js';
import { toKeyMap } from '../types/key.js';
import { chunk } from './chunker.js';

/**
 * Maximum number of items allowed in a single BatchGetItem request.
 * AWS DynamoDB limit.
 */
const MAX_BATCH_GET_ITEMS = 100;

/**
 * Default maximum number of retries for unprocessed keys.
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
 * Executes a single BatchGetItem operation.
 *
 * Retrieves up to 100 items in a single request. Does not automatically retry
 * unprocessed keys - use batchGetAll for automatic retry handling.
 *
 * @template T - Type of items to retrieve
 * @param docClient - DynamoDB document client
 * @param tableName - Name of the table
 * @param keys - Array of keys to retrieve (max 100)
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @returns Result containing items and any unprocessed keys
 * @throws Error if keys array exceeds 100 items
 *
 * @example
 * ```typescript
 * const result = await batchGet<User>(
 *   docClient,
 *   'Users',
 *   [{ partitionKey: 'user-1' }, { partitionKey: 'user-2' }],
 *   'userId',
 *   undefined
 * );
 *
 * console.log(`Retrieved ${result.items.length} items`);
 * if (result.unprocessedKeys && result.unprocessedKeys.length > 0) {
 *   console.log(`${result.unprocessedKeys.length} keys were not processed`);
 * }
 * ```
 */
export async function batchGet<T>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  keys: Key[],
  pkName: string,
  skName: string | undefined
): Promise<BatchGetResult<T>> {
  // Validate input
  if (keys.length === 0) {
    return {
      items: [],
      unprocessedKeys: [],
      consumedCapacity: [],
    };
  }

  if (keys.length > MAX_BATCH_GET_ITEMS) {
    throw new Error(
      `Cannot batch get more than ${MAX_BATCH_GET_ITEMS} items. Got ${keys.length}. Use batchGetAll instead.`
    );
  }

  // Convert keys to DynamoDB format
  const keysToGet = keys.map((key) => toKeyMap(key, pkName, skName));

  // Build BatchGetCommand
  const command = new BatchGetCommand({
    RequestItems: {
      [tableName]: {
        Keys: keysToGet,
      },
    },
    ReturnConsumedCapacity: 'TOTAL',
  });

  // Execute command
  const response = await docClient.send(command);

  // Extract items
  const items = (response.Responses?.[tableName] || []) as T[];

  // Extract unprocessed keys
  const unprocessedKeysRaw =
    response.UnprocessedKeys?.[tableName]?.Keys || [];
  const unprocessedKeys: Key[] = unprocessedKeysRaw.map((keyMap) => ({
    partitionKey: keyMap[pkName],
    sortKey: skName ? keyMap[skName] : undefined,
  }));

  // Log warning if there are unprocessed keys
  if (unprocessedKeys.length > 0) {
    console.warn(
      `BatchGetItem: ${unprocessedKeys.length} of ${keys.length} keys were not processed`
    );
  }

  // Extract consumed capacity
  const consumedCapacity = response.ConsumedCapacity || [];

  return {
    items,
    unprocessedKeys: unprocessedKeys.length > 0 ? unprocessedKeys : undefined,
    consumedCapacity,
  };
}

/**
 * Executes BatchGetItem with automatic chunking and retry logic.
 *
 * Handles any number of keys by automatically chunking into batches of 100.
 * Automatically retries unprocessed keys with exponential backoff.
 *
 * @template T - Type of items to retrieve
 * @param docClient - DynamoDB document client
 * @param tableName - Name of the table
 * @param keys - Array of keys to retrieve (any size)
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @param maxRetries - Maximum number of retry attempts for unprocessed keys
 * @returns Array of all successfully retrieved items
 *
 * @example
 * ```typescript
 * // Retrieve 500 items - automatically chunked into 5 batches
 * const keys = Array.from({ length: 500 }, (_, i) => ({
 *   partitionKey: `user-${i}`
 * }));
 *
 * const items = await batchGetAll<User>(
 *   docClient,
 *   'Users',
 *   keys,
 *   'userId',
 *   undefined
 * );
 *
 * console.log(`Retrieved ${items.length} items`);
 * ```
 */
export async function batchGetAll<T>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  keys: Key[],
  pkName: string,
  skName: string | undefined,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<T[]> {
  if (keys.length === 0) {
    return [];
  }

  const allItems: T[] = [];

  // Chunk keys into batches of 100
  const keyChunks = chunk(keys, MAX_BATCH_GET_ITEMS);

  // Process each chunk
  for (const keyChunk of keyChunks) {
    let remainingKeys = keyChunk;
    let attempt = 0;

    // Retry loop for unprocessed keys
    while (remainingKeys.length > 0 && attempt <= maxRetries) {
      // Add backoff delay for retries
      if (attempt > 0) {
        const delay = calculateBackoff(attempt - 1);
        console.warn(
          `Retrying ${remainingKeys.length} unprocessed keys (attempt ${attempt}/${maxRetries}) after ${delay}ms`
        );
        await sleep(delay);
      }

      // Execute batch get
      const result = await batchGet<T>(
        docClient,
        tableName,
        remainingKeys,
        pkName,
        skName
      );

      // Accumulate items
      allItems.push(...result.items);

      // Update remaining keys for retry
      if (result.unprocessedKeys && result.unprocessedKeys.length > 0) {
        remainingKeys = result.unprocessedKeys;
        attempt++;
      } else {
        // All keys processed successfully
        remainingKeys = [];
      }
    }

    // Log warning if we exhausted retries
    if (remainingKeys.length > 0) {
      console.error(
        `Failed to retrieve ${remainingKeys.length} keys after ${maxRetries} retries`
      );
    }
  }

  return allItems;
}

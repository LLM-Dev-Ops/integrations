/**
 * DynamoDB GetItem Operation
 *
 * Implements single-item retrieval operations for DynamoDB tables.
 * Provides strongly consistent and eventually consistent read capabilities.
 */

import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { AttributeValue, Key } from '../types/key.js';
import type { GetItemOptions } from '../types/options.js';
import type { GetItemResult } from '../types/results.js';
import { toKeyMap } from '../types/key.js';

/**
 * Retrieves a single item from a DynamoDB table by its primary key.
 *
 * Uses GetItem operation to fetch one item with optional consistent reads,
 * projection expressions, and consumed capacity tracking.
 *
 * @template T - Type of the item to retrieve
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to read from
 * @param key - Primary key of the item (partition key and optional sort key)
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @param options - Get operation options (consistency, projection, etc.)
 * @returns Result containing the item (if found) and consumed capacity
 *
 * @example
 * ```typescript
 * // Get item with partition key only
 * const result = await getItem<User>(
 *   docClient,
 *   'Users',
 *   { partitionKey: 'user-123' },
 *   'userId',
 *   undefined
 * );
 *
 * if (result.item) {
 *   console.log('User found:', result.item);
 * } else {
 *   console.log('User not found');
 * }
 *
 * // Get item with composite key and consistent read
 * const result = await getItem<Order>(
 *   docClient,
 *   'Orders',
 *   { partitionKey: 'user-123', sortKey: 'order-456' },
 *   'userId',
 *   'orderId',
 *   { consistentRead: true }
 * );
 *
 * // Get specific attributes only
 * const result = await getItem<User>(
 *   docClient,
 *   'Users',
 *   { partitionKey: 'user-123' },
 *   'userId',
 *   undefined,
 *   { projection: 'email,name,createdAt' }
 * );
 * ```
 */
export async function getItem<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  key: Key,
  pkName: string,
  skName: string | undefined,
  options: GetItemOptions = {}
): Promise<GetItemResult<T>> {
  // Convert key to DynamoDB format
  const keyMap = toKeyMap(key, pkName, skName);

  // Build expression attribute names for projection
  const expressionAttributeNames: Record<string, string> = {
    ...options.expressionNames,
  };

  // Build projection expression
  let projectionExpression: string | undefined;
  if (options.projection) {
    const projectionAttrs = options.projection.split(',').map((attr) => attr.trim());
    projectionAttrs.forEach((attr, index) => {
      expressionAttributeNames[`#proj${index}`] = attr;
    });
    projectionExpression = projectionAttrs
      .map((_, index) => `#proj${index}`)
      .join(', ');
  }

  // Build the GetCommand
  const command = new GetCommand({
    TableName: tableName,
    Key: keyMap,
    ConsistentRead: options.consistentRead ?? false,
    ProjectionExpression: projectionExpression,
    ExpressionAttributeNames:
      Object.keys(expressionAttributeNames).length > 0
        ? expressionAttributeNames
        : undefined,
    ReturnConsumedCapacity: options.returnConsumedCapacity ? 'TOTAL' : 'NONE',
  });

  // Execute the command
  const response = await docClient.send(command);

  // Return the result
  return {
    item: response.Item as T | undefined,
    consumedCapacity: response.ConsumedCapacity
      ? {
          tableCapacity: response.ConsumedCapacity.CapacityUnits,
          globalSecondaryIndexCapacity: response.ConsumedCapacity.GlobalSecondaryIndexes
            ? Object.fromEntries(
                Object.entries(response.ConsumedCapacity.GlobalSecondaryIndexes).map(
                  ([name, capacity]) => [name, capacity.CapacityUnits || 0]
                )
              )
            : undefined,
        }
      : undefined,
  };
}

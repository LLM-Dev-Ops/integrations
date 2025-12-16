/**
 * DynamoDB PutItem Operation
 *
 * Implements item creation and replacement operations for DynamoDB tables.
 * Provides conditional writes and return value capabilities.
 */

import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AttributeValue } from '../types/key.js';
import type { PutItemOptions } from '../types/options.js';
import type { PutItemResult } from '../types/results.js';

/**
 * Creates a new item or replaces an existing item in a DynamoDB table.
 *
 * Uses PutItem operation to write an item with optional condition expressions
 * to prevent overwrites and return old values capability.
 *
 * @template T - Type of the item being written
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to write to
 * @param item - Item to put (must include partition key and sort key if applicable)
 * @param options - Put operation options (conditions, return values, etc.)
 * @returns Result containing old item (if requested) and consumed capacity
 *
 * @example
 * ```typescript
 * // Simple put operation
 * const result = await putItem<User>(
 *   docClient,
 *   'Users',
 *   {
 *     userId: 'user-123',
 *     email: 'user@example.com',
 *     name: 'John Doe',
 *     createdAt: new Date().toISOString()
 *   }
 * );
 *
 * // Conditional put - only if item doesn't exist
 * const result = await putItem<User>(
 *   docClient,
 *   'Users',
 *   { userId: 'user-123', email: 'user@example.com' },
 *   {
 *     conditionExpression: 'attribute_not_exists(#pk)',
 *     expressionNames: { '#pk': 'userId' }
 *   }
 * );
 *
 * // Put with return old values
 * const result = await putItem<User>(
 *   docClient,
 *   'Users',
 *   { userId: 'user-123', email: 'newemail@example.com' },
 *   { returnOldValues: true }
 * );
 *
 * if (result.oldItem) {
 *   console.log('Replaced item:', result.oldItem);
 * }
 *
 * // Put with complex condition
 * const result = await putItem<Product>(
 *   docClient,
 *   'Products',
 *   { productId: 'prod-123', price: 29.99, stock: 100 },
 *   {
 *     conditionExpression: 'attribute_not_exists(#pk) OR #version = :expectedVersion',
 *     expressionNames: { '#pk': 'productId', '#version': 'version' },
 *     expressionValues: { ':expectedVersion': 5 }
 *   }
 * );
 * ```
 */
export async function putItem<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  item: T,
  options: PutItemOptions = {}
): Promise<PutItemResult<T>> {
  // Build expression attribute names
  const expressionAttributeNames: Record<string, string> | undefined =
    options.expressionNames && Object.keys(options.expressionNames).length > 0
      ? options.expressionNames
      : undefined;

  // Build expression attribute values
  const expressionAttributeValues: Record<string, AttributeValue> | undefined =
    options.expressionValues && Object.keys(options.expressionValues).length > 0
      ? options.expressionValues
      : undefined;

  // Build the PutCommand
  const command = new PutCommand({
    TableName: tableName,
    Item: item as Record<string, AttributeValue>,
    ConditionExpression: options.conditionExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: options.returnOldValues ? 'ALL_OLD' : 'NONE',
    ReturnConsumedCapacity: 'TOTAL',
  });

  // Execute the command
  const response = await docClient.send(command);

  // Return the result
  return {
    oldItem: response.Attributes as T | undefined,
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

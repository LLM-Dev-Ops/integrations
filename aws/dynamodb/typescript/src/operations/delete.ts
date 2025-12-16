/**
 * DynamoDB DeleteItem Operation
 *
 * Implements item deletion operations for DynamoDB tables.
 * Provides conditional deletes and return value capabilities.
 */

import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { AttributeValue, Key } from '../types/key.js';
import type { DeleteItemOptions } from '../types/options.js';
import type { DeleteItemResult } from '../types/results.js';
import { toKeyMap } from '../types/key.js';

/**
 * Deletes an item from a DynamoDB table by its primary key.
 *
 * Uses DeleteItem operation to remove an item with optional condition
 * expressions to prevent unintended deletes and return old values capability.
 *
 * @template T - Type of the item being deleted
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to delete from
 * @param key - Primary key of the item to delete
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @param options - Delete operation options (conditions, return values, etc.)
 * @returns Result containing deleted item (if requested) and consumed capacity
 *
 * @example
 * ```typescript
 * // Simple delete operation
 * const result = await deleteItem<User>(
 *   docClient,
 *   'Users',
 *   { partitionKey: 'user-123' },
 *   'userId',
 *   undefined
 * );
 *
 * // Delete with composite key
 * const result = await deleteItem<Order>(
 *   docClient,
 *   'Orders',
 *   { partitionKey: 'user-123', sortKey: 'order-456' },
 *   'userId',
 *   'orderId'
 * );
 *
 * // Delete with return old values
 * const result = await deleteItem<User>(
 *   docClient,
 *   'Users',
 *   { partitionKey: 'user-123' },
 *   'userId',
 *   undefined,
 *   { returnOldValues: true }
 * );
 *
 * if (result.oldItem) {
 *   console.log('Deleted user:', result.oldItem);
 * }
 *
 * // Conditional delete - only if status is 'inactive'
 * const result = await deleteItem<User>(
 *   docClient,
 *   'Users',
 *   { partitionKey: 'user-123' },
 *   'userId',
 *   undefined,
 *   {
 *     conditionExpression: '#status = :status',
 *     expressionNames: { '#status': 'status' },
 *     expressionValues: { ':status': 'inactive' }
 *   }
 * );
 *
 * // Conditional delete with existence check
 * const result = await deleteItem<Product>(
 *   docClient,
 *   'Products',
 *   { partitionKey: 'prod-123' },
 *   'productId',
 *   undefined,
 *   {
 *     conditionExpression: 'attribute_exists(#pk) AND #stock = :zero',
 *     expressionNames: { '#pk': 'productId', '#stock': 'stock' },
 *     expressionValues: { ':zero': 0 },
 *     returnOldValues: true
 *   }
 * );
 * ```
 */
export async function deleteItem<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  key: Key,
  pkName: string,
  skName: string | undefined,
  options: DeleteItemOptions = {}
): Promise<DeleteItemResult<T>> {
  // Convert key to DynamoDB format
  const keyMap = toKeyMap(key, pkName, skName);

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

  // Build the DeleteCommand
  const command = new DeleteCommand({
    TableName: tableName,
    Key: keyMap,
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

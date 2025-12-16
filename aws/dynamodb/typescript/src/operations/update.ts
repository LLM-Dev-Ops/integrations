/**
 * DynamoDB UpdateItem Operation
 *
 * Implements item update operations for DynamoDB tables.
 * Provides atomic updates with condition expressions and return value capabilities.
 */

import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { AttributeValue, Key } from '../types/key.js';
import type { UpdateItemOptions } from '../types/options.js';
import type { UpdateItemResult } from '../types/results.js';
import { toKeyMap } from '../types/key.js';

/**
 * Updates specific attributes of an existing item in a DynamoDB table.
 *
 * Uses UpdateItem operation to modify attributes atomically with optional
 * condition expressions and return value capabilities (new or old values).
 *
 * @template T - Type of the item being updated
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to update
 * @param key - Primary key of the item to update
 * @param pkName - Name of the partition key attribute
 * @param skName - Name of the sort key attribute (optional)
 * @param updateExpression - Update expression defining the modifications
 * @param expressionNames - Expression attribute names mapping
 * @param expressionValues - Expression attribute values for update
 * @param options - Update operation options (conditions, return values, etc.)
 * @returns Result containing updated attributes and consumed capacity
 *
 * @example
 * ```typescript
 * // Simple attribute update
 * const result = await updateItem<User>(
 *   docClient,
 *   'Users',
 *   { partitionKey: 'user-123' },
 *   'userId',
 *   undefined,
 *   'SET #email = :email, #updatedAt = :updatedAt',
 *   { '#email': 'email', '#updatedAt': 'updatedAt' },
 *   {
 *     ':email': 'newemail@example.com',
 *     ':updatedAt': new Date().toISOString()
 *   },
 *   { returnNewValues: true }
 * );
 *
 * console.log('Updated user:', result.attributes);
 *
 * // Increment counter
 * const result = await updateItem<Product>(
 *   docClient,
 *   'Products',
 *   { partitionKey: 'prod-123' },
 *   'productId',
 *   undefined,
 *   'ADD #viewCount :inc',
 *   { '#viewCount': 'viewCount' },
 *   { ':inc': 1 },
 *   { returnNewValues: true }
 * );
 *
 * // Conditional update
 * const result = await updateItem<Product>(
 *   docClient,
 *   'Products',
 *   { partitionKey: 'prod-123' },
 *   'productId',
 *   undefined,
 *   'SET #stock = #stock - :qty',
 *   { '#stock': 'stock' },
 *   { ':qty': 5, ':minStock': 0 },
 *   {
 *     conditionExpression: '#stock >= :qty',
 *     returnNewValues: true
 *   }
 * );
 *
 * // Complex update with multiple operations
 * const result = await updateItem<Order>(
 *   docClient,
 *   'Orders',
 *   { partitionKey: 'user-123', sortKey: 'order-456' },
 *   'userId',
 *   'orderId',
 *   'SET #status = :status, #shippedAt = :shippedAt REMOVE #pendingFlag ADD #version :inc',
 *   {
 *     '#status': 'status',
 *     '#shippedAt': 'shippedAt',
 *     '#pendingFlag': 'pending',
 *     '#version': 'version'
 *   },
 *   {
 *     ':status': 'shipped',
 *     ':shippedAt': new Date().toISOString(),
 *     ':inc': 1
 *   },
 *   { returnNewValues: true }
 * );
 * ```
 */
export async function updateItem<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  key: Key,
  pkName: string,
  skName: string | undefined,
  updateExpression: string,
  expressionNames: Record<string, string>,
  expressionValues: Record<string, AttributeValue>,
  options: UpdateItemOptions = {}
): Promise<UpdateItemResult<T>> {
  // Convert key to DynamoDB format
  const keyMap = toKeyMap(key, pkName, skName);

  // Determine return values based on options
  let returnValues: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW' = 'NONE';
  if (options.returnNewValues) {
    returnValues = 'ALL_NEW';
  } else if (options.returnOldValues) {
    returnValues = 'ALL_OLD';
  }

  // Build the UpdateCommand
  const command = new UpdateCommand({
    TableName: tableName,
    Key: keyMap,
    UpdateExpression: updateExpression,
    ExpressionAttributeNames:
      Object.keys(expressionNames).length > 0 ? expressionNames : undefined,
    ExpressionAttributeValues:
      Object.keys(expressionValues).length > 0 ? expressionValues : undefined,
    ConditionExpression: options.conditionExpression,
    ReturnValues: returnValues,
    ReturnConsumedCapacity: 'TOTAL',
  });

  // Execute the command
  const response = await docClient.send(command);

  // Return the result
  return {
    attributes: response.Attributes as T | undefined,
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

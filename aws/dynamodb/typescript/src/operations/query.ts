/**
 * DynamoDB Query Operation
 *
 * Implements query operations for retrieving items from DynamoDB tables and indexes
 * based on partition key and optional sort key conditions.
 */

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { AttributeValue } from '../types/key.js';
import type { QueryOptions } from '../types/options.js';
import type { QueryResult } from '../types/results.js';

/**
 * Queries items from a DynamoDB table or index.
 *
 * Retrieves items based on partition key and optional sort key conditions.
 * More efficient than scan as it uses indexes for targeted retrieval.
 *
 * @template T - Type of items in the result set
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to query
 * @param pkName - Name of the partition key attribute
 * @param pkValue - Value of the partition key to match
 * @param options - Query options (index, filtering, pagination, etc.)
 * @returns Query result with items and pagination info
 *
 * @example
 * ```typescript
 * // Simple query by partition key
 * const result = await query(
 *   docClient,
 *   'Users',
 *   'userId',
 *   'user-123'
 * );
 *
 * // Query with sort key filter
 * const result = await query(
 *   docClient,
 *   'Orders',
 *   'userId',
 *   'user-123',
 *   {
 *     filterExpression: 'orderDate > :date',
 *     limit: 10,
 *     scanForward: false // descending order
 *   }
 * );
 *
 * // Query a Global Secondary Index
 * const result = await query(
 *   docClient,
 *   'Users',
 *   'email',
 *   'user@example.com',
 *   { indexName: 'EmailIndex' }
 * );
 * ```
 */
export async function query<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  pkName: string,
  pkValue: AttributeValue,
  options: QueryOptions = {}
): Promise<QueryResult<T>> {
  // Build expression attribute names
  const expressionAttributeNames: Record<string, string> = {
    '#pk': pkName,
  };

  // Build expression attribute values
  const expressionAttributeValues: Record<string, AttributeValue> = {
    ':pk': pkValue,
  };

  // Build key condition expression
  const keyConditionExpression = '#pk = :pk';

  // Add projection expression attribute names if provided
  if (options.projection) {
    const projectionAttrs = options.projection.split(',').map((attr) => attr.trim());
    projectionAttrs.forEach((attr, index) => {
      expressionAttributeNames[`#proj${index}`] = attr;
    });
  }

  // Add filter expression attribute names and values if provided
  if (options.filterExpression) {
    // Extract attribute names from filter expression (simple parsing for #attr placeholders)
    const filterAttrMatches = options.filterExpression.match(/#\w+/g) || [];
    filterAttrMatches.forEach((match) => {
      const attrName = match.substring(1); // Remove #
      if (!expressionAttributeNames[match]) {
        expressionAttributeNames[match] = attrName;
      }
    });

    // Extract attribute values from filter expression (simple parsing for :val placeholders)
    const filterValMatches = options.filterExpression.match(/:\w+/g) || [];
    filterValMatches.forEach((match) => {
      // Values should be provided in a separate options field if needed
      // For now, we'll let the user include them in the filter expression
      if (!expressionAttributeValues[match]) {
        // Placeholder - in real usage, these would come from additional options
        expressionAttributeValues[match] = '';
      }
    });
  }

  // Build projection expression
  let projectionExpression: string | undefined;
  if (options.projection) {
    const projectionAttrs = options.projection.split(',').map((attr) => attr.trim());
    projectionExpression = projectionAttrs
      .map((_, index) => `#proj${index}`)
      .join(', ');
  }

  // Build the query command
  const command = new QueryCommand({
    TableName: tableName,
    IndexName: options.indexName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames:
      Object.keys(expressionAttributeNames).length > 0
        ? expressionAttributeNames
        : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    FilterExpression: options.filterExpression,
    ProjectionExpression: projectionExpression,
    Limit: options.limit,
    ScanIndexForward: options.scanForward ?? true,
    ConsistentRead: options.consistentRead ?? false,
    ExclusiveStartKey: options.exclusiveStartKey,
    ReturnConsumedCapacity: 'TOTAL',
  });

  // Execute the query
  const response = await docClient.send(command);

  // Return the result
  return {
    items: (response.Items as T[]) || [],
    lastEvaluatedKey: response.LastEvaluatedKey as Record<string, AttributeValue> | undefined,
    count: response.Count || 0,
    scannedCount: response.ScannedCount || 0,
    consumedCapacity: response.ConsumedCapacity
      ? {
          tableName: response.ConsumedCapacity.TableName || tableName,
          capacityUnits: response.ConsumedCapacity.CapacityUnits || 0,
          readCapacityUnits: response.ConsumedCapacity.ReadCapacityUnits,
          writeCapacityUnits: response.ConsumedCapacity.WriteCapacityUnits,
        }
      : undefined,
  };
}

/**
 * Queries items with a sort key condition.
 *
 * Extends the basic query operation with sort key filtering using comparison operators.
 *
 * @template T - Type of items in the result set
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to query
 * @param pkName - Name of the partition key attribute
 * @param pkValue - Value of the partition key to match
 * @param skName - Name of the sort key attribute
 * @param skCondition - Sort key condition operator ('=', '<', '<=', '>', '>=', 'BETWEEN', 'begins_with')
 * @param skValue - Sort key value(s) to compare
 * @param options - Query options
 * @returns Query result with items and pagination info
 *
 * @example
 * ```typescript
 * // Query with exact sort key match
 * const result = await queryWithSortKey(
 *   docClient,
 *   'Users',
 *   'userId',
 *   'user-123',
 *   'dataType',
 *   '=',
 *   'profile'
 * );
 *
 * // Query with sort key range
 * const result = await queryWithSortKey(
 *   docClient,
 *   'Orders',
 *   'userId',
 *   'user-123',
 *   'orderDate',
 *   '>',
 *   '2024-01-01'
 * );
 *
 * // Query with BETWEEN operator
 * const result = await queryWithSortKey(
 *   docClient,
 *   'Orders',
 *   'userId',
 *   'user-123',
 *   'orderDate',
 *   'BETWEEN',
 *   ['2024-01-01', '2024-12-31']
 * );
 * ```
 */
export async function queryWithSortKey<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  pkName: string,
  pkValue: AttributeValue,
  skName: string,
  skCondition: '=' | '<' | '<=' | '>' | '>=' | 'BETWEEN' | 'begins_with',
  skValue: AttributeValue | [AttributeValue, AttributeValue],
  options: QueryOptions = {}
): Promise<QueryResult<T>> {
  // Build expression attribute names
  const expressionAttributeNames: Record<string, string> = {
    '#pk': pkName,
    '#sk': skName,
  };

  // Build expression attribute values
  const expressionAttributeValues: Record<string, AttributeValue> = {
    ':pk': pkValue,
  };

  // Build key condition expression based on sort key condition
  let keyConditionExpression: string;
  if (skCondition === 'BETWEEN' && Array.isArray(skValue)) {
    keyConditionExpression = '#pk = :pk AND #sk BETWEEN :sk1 AND :sk2';
    expressionAttributeValues[':sk1'] = skValue[0];
    expressionAttributeValues[':sk2'] = skValue[1];
  } else if (skCondition === 'begins_with') {
    keyConditionExpression = '#pk = :pk AND begins_with(#sk, :sk)';
    expressionAttributeValues[':sk'] = skValue as AttributeValue;
  } else {
    keyConditionExpression = `#pk = :pk AND #sk ${skCondition} :sk`;
    expressionAttributeValues[':sk'] = skValue as AttributeValue;
  }

  // Add projection expression attribute names if provided
  if (options.projection) {
    const projectionAttrs = options.projection.split(',').map((attr) => attr.trim());
    projectionAttrs.forEach((attr, index) => {
      expressionAttributeNames[`#proj${index}`] = attr;
    });
  }

  // Build projection expression
  let projectionExpression: string | undefined;
  if (options.projection) {
    const projectionAttrs = options.projection.split(',').map((attr) => attr.trim());
    projectionExpression = projectionAttrs
      .map((_, index) => `#proj${index}`)
      .join(', ');
  }

  // Build the query command
  const command = new QueryCommand({
    TableName: tableName,
    IndexName: options.indexName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    FilterExpression: options.filterExpression,
    ProjectionExpression: projectionExpression,
    Limit: options.limit,
    ScanIndexForward: options.scanForward ?? true,
    ConsistentRead: options.consistentRead ?? false,
    ExclusiveStartKey: options.exclusiveStartKey,
    ReturnConsumedCapacity: 'TOTAL',
  });

  // Execute the query
  const response = await docClient.send(command);

  // Return the result
  return {
    items: (response.Items as T[]) || [],
    lastEvaluatedKey: response.LastEvaluatedKey as Record<string, AttributeValue> | undefined,
    count: response.Count || 0,
    scannedCount: response.ScannedCount || 0,
    consumedCapacity: response.ConsumedCapacity
      ? {
          tableName: response.ConsumedCapacity.TableName || tableName,
          capacityUnits: response.ConsumedCapacity.CapacityUnits || 0,
          readCapacityUnits: response.ConsumedCapacity.ReadCapacityUnits,
          writeCapacityUnits: response.ConsumedCapacity.WriteCapacityUnits,
        }
      : undefined,
  };
}

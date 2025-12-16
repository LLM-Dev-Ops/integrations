/**
 * DynamoDB Scan Operation
 *
 * Implements scan operations for retrieving all items from DynamoDB tables and indexes.
 * Includes support for parallel scanning for improved performance on large tables.
 */

import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { AttributeValue } from '../types/key.js';
import type { ScanOptions } from '../types/options.js';
import type { ScanResult } from '../types/results.js';

/**
 * Scans all items in a DynamoDB table or index.
 *
 * Retrieves all items, optionally filtered by filter expressions.
 * Less efficient than query but useful when you need to examine all items.
 *
 * @template T - Type of items in the result set
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to scan
 * @param options - Scan options (filtering, pagination, parallel scan, etc.)
 * @returns Scan result with items and pagination info
 *
 * @example
 * ```typescript
 * // Simple scan
 * const result = await scan(docClient, 'Users');
 *
 * // Scan with filter
 * const result = await scan(
 *   docClient,
 *   'Users',
 *   {
 *     filterExpression: 'age > :minAge',
 *     limit: 100
 *   }
 * );
 *
 * // Scan with projection
 * const result = await scan(
 *   docClient,
 *   'Users',
 *   {
 *     projection: 'userId, email, name',
 *     limit: 50
 *   }
 * );
 *
 * // Scan a Global Secondary Index
 * const result = await scan(
 *   docClient,
 *   'Users',
 *   { indexName: 'StatusIndex' }
 * );
 * ```
 */
export async function scan<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  options: ScanOptions = {}
): Promise<ScanResult<T>> {
  // Build expression attribute names
  const expressionAttributeNames: Record<string, string> = {};

  // Build expression attribute values
  const expressionAttributeValues: Record<string, AttributeValue> = {};

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

  // Build the scan command
  const command = new ScanCommand({
    TableName: tableName,
    IndexName: options.indexName,
    FilterExpression: options.filterExpression,
    ProjectionExpression: projectionExpression,
    ExpressionAttributeNames:
      Object.keys(expressionAttributeNames).length > 0
        ? expressionAttributeNames
        : undefined,
    ExpressionAttributeValues:
      Object.keys(expressionAttributeValues).length > 0
        ? expressionAttributeValues
        : undefined,
    Limit: options.limit,
    ExclusiveStartKey: options.exclusiveStartKey,
    Segment: options.segment,
    TotalSegments: options.totalSegments,
    ReturnConsumedCapacity: 'TOTAL',
  });

  // Execute the scan
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
 * Performs a parallel scan of a DynamoDB table.
 *
 * Divides the table into segments and scans each segment in parallel,
 * providing better performance for large tables. Each segment is scanned
 * independently and results are combined.
 *
 * @template T - Type of items in the result set
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to scan
 * @param totalSegments - Number of parallel segments (recommended: number of workers/threads)
 * @param options - Scan options (filtering, projection, etc.)
 * @returns Array of all scanned items from all segments
 *
 * @example
 * ```typescript
 * // Parallel scan with 4 segments
 * const items = await scanParallel(
 *   docClient,
 *   'Users',
 *   4
 * );
 *
 * // Parallel scan with filter
 * const items = await scanParallel(
 *   docClient,
 *   'Users',
 *   8,
 *   {
 *     filterExpression: 'accountStatus = :status',
 *     projection: 'userId, email'
 *   }
 * );
 * ```
 */
export async function scanParallel<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  totalSegments: number,
  options: ScanOptions = {}
): Promise<T[]> {
  // Validate totalSegments
  if (totalSegments < 1 || totalSegments > 1000000) {
    throw new Error('totalSegments must be between 1 and 1000000');
  }

  // Create array of promises for each segment
  const segmentPromises: Promise<T[]>[] = [];

  for (let segment = 0; segment < totalSegments; segment++) {
    // Scan this segment with pagination
    const segmentPromise = scanSegmentComplete<T>(
      docClient,
      tableName,
      segment,
      totalSegments,
      options
    );
    segmentPromises.push(segmentPromise);
  }

  // Execute all segments in parallel
  const segmentResults = await Promise.all(segmentPromises);

  // Flatten results from all segments
  const allItems = segmentResults.flat();

  return allItems;
}

/**
 * Scans a single segment completely, handling pagination automatically.
 *
 * Internal helper function for parallel scanning. Continues scanning
 * a segment until all pages are retrieved.
 *
 * @template T - Type of items in the result set
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to scan
 * @param segment - Segment number (0-based)
 * @param totalSegments - Total number of segments
 * @param options - Scan options
 * @returns Array of all items from this segment
 */
async function scanSegmentComplete<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  segment: number,
  totalSegments: number,
  options: ScanOptions
): Promise<T[]> {
  const items: T[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined = undefined;

  // Continue scanning until no more pages
  do {
    const result = await scan<T>(docClient, tableName, {
      ...options,
      segment,
      totalSegments,
      exclusiveStartKey: lastEvaluatedKey,
    });

    items.push(...result.items);
    lastEvaluatedKey = result.lastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Scans a table and collects all items by automatically handling pagination.
 *
 * Convenience function that performs a complete scan of a table,
 * automatically following pagination tokens until all items are retrieved.
 *
 * @template T - Type of items in the result set
 * @param docClient - DynamoDB Document Client instance
 * @param tableName - Name of the table to scan
 * @param options - Scan options (filtering, projection, etc.)
 * @returns Array of all scanned items
 *
 * @example
 * ```typescript
 * // Scan all items
 * const allUsers = await scanAll(docClient, 'Users');
 *
 * // Scan all items with filter
 * const activeUsers = await scanAll(
 *   docClient,
 *   'Users',
 *   {
 *     filterExpression: 'status = :status'
 *   }
 * );
 * ```
 */
export async function scanAll<T = Record<string, AttributeValue>>(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  options: ScanOptions = {}
): Promise<T[]> {
  const items: T[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined = undefined;

  // Continue scanning until no more pages
  do {
    const result = await scan<T>(docClient, tableName, {
      ...options,
      exclusiveStartKey: lastEvaluatedKey,
    });

    items.push(...result.items);
    lastEvaluatedKey = result.lastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * DynamoDB Key types and utilities following SPARC specification.
 *
 * Defines key structures for DynamoDB operations including partition keys,
 * sort keys, and attribute value types.
 */

// ============================================================================
// Attribute Value Types
// ============================================================================

/**
 * DynamoDB attribute value - supports all DynamoDB data types.
 *
 * Represents any valid DynamoDB attribute value including:
 * - Primitive types: string, number, boolean, null
 * - Binary data: Buffer
 * - Sets: Set<string>, Set<number>
 * - Complex types: arrays and nested objects
 */
export type AttributeValue = string | number | Buffer | boolean | null | AttributeValueSet | AttributeValueArray | AttributeValueMap;

/**
 * Set attribute value types.
 */
export type AttributeValueSet = Set<string> | Set<number>;

/**
 * Array attribute value type.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AttributeValueArray extends Array<AttributeValue> {}

/**
 * Map attribute value type (nested object).
 */
export interface AttributeValueMap {
  [key: string]: AttributeValue;
}

// ============================================================================
// Key Types
// ============================================================================

/**
 * DynamoDB key structure.
 *
 * Represents a primary key which can be:
 * - Simple: partition key only
 * - Composite: partition key + sort key
 */
export interface Key {
  /** Partition key (hash key) - required */
  partitionKey: AttributeValue;
  /** Sort key (range key) - optional */
  sortKey?: AttributeValue;
}

// ============================================================================
// Key Creation Utilities
// ============================================================================

/**
 * Creates a simple key with only a partition key.
 *
 * @param pk - Partition key value (string or number)
 * @returns Key object with partition key
 *
 * @example
 * ```typescript
 * const key = createKey('user-123');
 * // { partitionKey: 'user-123' }
 * ```
 */
export function createKey(pk: string | number): Key {
  return {
    partitionKey: pk,
  };
}

/**
 * Adds a sort key to an existing key.
 *
 * @param key - Existing key object
 * @param sk - Sort key value (string or number)
 * @returns New key object with sort key added
 *
 * @example
 * ```typescript
 * const key = createKey('user-123');
 * const compositeKey = withSortKey(key, 'profile');
 * // { partitionKey: 'user-123', sortKey: 'profile' }
 * ```
 */
export function withSortKey(key: Key, sk: string | number): Key {
  return {
    ...key,
    sortKey: sk,
  };
}

/**
 * Converts a Key object to a DynamoDB key attribute map.
 *
 * Maps the Key structure to actual DynamoDB table key attribute names.
 * Used to convert from the generic Key format to table-specific key names.
 *
 * @param key - Key object to convert
 * @param pkName - Name of the partition key attribute in the table
 * @param skName - Name of the sort key attribute in the table (optional)
 * @returns Record mapping attribute names to values
 *
 * @example
 * ```typescript
 * const key = { partitionKey: 'user-123', sortKey: 'profile' };
 * const keyMap = toKeyMap(key, 'userId', 'dataType');
 * // { userId: 'user-123', dataType: 'profile' }
 * ```
 */
export function toKeyMap(
  key: Key,
  pkName: string,
  skName?: string
): Record<string, AttributeValue> {
  const keyMap: Record<string, AttributeValue> = {
    [pkName]: key.partitionKey,
  };

  if (key.sortKey !== undefined && skName) {
    keyMap[skName] = key.sortKey;
  }

  return keyMap;
}

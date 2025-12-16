/**
 * DynamoDB Transaction Builder
 *
 * Fluent builder for constructing and executing transactional write operations.
 */

import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Key, AttributeValue } from '../types/key.js';
import { toKeyMap } from '../types/key.js';
import { parseCancellationReasons, formatCancellationMessage } from './errors.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of items allowed in a single transaction.
 * This is a DynamoDB service limit.
 */
const MAX_TRANSACT_ITEMS = 100;

// ============================================================================
// Update Expression Types
// ============================================================================

/**
 * Represents an update expression for updating item attributes.
 *
 * Update expressions use DynamoDB's UpdateExpression syntax:
 * - SET: Add or modify attributes
 * - REMOVE: Delete attributes
 * - ADD: Increment/decrement numbers or add to sets
 * - DELETE: Remove from sets
 */
export interface UpdateExpression {
  /** The update expression string (e.g., "SET #name = :name, #count = #count + :inc") */
  expression: string;
  /** Expression attribute names mapping (for reserved words) */
  expressionNames?: Record<string, string>;
  /** Expression attribute values used in the expression */
  expressionValues?: Record<string, AttributeValue>;
}

// ============================================================================
// Transaction Builder
// ============================================================================

/**
 * Fluent builder for constructing transactional write operations.
 *
 * Provides a chainable API for adding put, update, delete, and condition check
 * operations to a transaction. All operations in a transaction succeed or fail
 * together atomically.
 *
 * @example
 * ```typescript
 * const transaction = new TransactionBuilder(docClient)
 *   .put('users', { userId: '123', name: 'John' })
 *   .update('accounts', { partitionKey: 'acct-1' }, 'accountId', undefined, {
 *     expression: 'SET balance = balance - :amount',
 *     expressionValues: { ':amount': 100 }
 *   })
 *   .delete('sessions', { partitionKey: 'sess-1' }, 'sessionId', undefined);
 *
 * await transaction.execute();
 * ```
 */
export class TransactionBuilder {
  private docClient: DynamoDBDocumentClient;
  private writeItems: TransactWriteCommandInput['TransactItems'] = [];
  private clientRequestToken?: string;

  /**
   * Creates a new transaction builder.
   *
   * @param docClient - DynamoDB Document Client instance
   */
  constructor(docClient: DynamoDBDocumentClient) {
    this.docClient = docClient;
  }

  // ==========================================================================
  // Put Operations
  // ==========================================================================

  /**
   * Adds a put operation to the transaction.
   *
   * Puts an item into a table. If an item with the same key exists,
   * it will be replaced unless a condition is specified.
   *
   * @param tableName - Name of the table to put the item in
   * @param item - Item to put in the table
   * @param condition - Optional condition expression that must be true
   * @param expressionNames - Optional expression attribute names
   * @param expressionValues - Optional expression attribute values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.put('users', {
   *   userId: '123',
   *   name: 'John',
   *   email: 'john@example.com'
   * });
   * ```
   */
  put<T extends Record<string, AttributeValue>>(
    tableName: string,
    item: T,
    condition?: string,
    expressionNames?: Record<string, string>,
    expressionValues?: Record<string, AttributeValue>
  ): TransactionBuilder {
    const putItem: any = {
      Put: {
        TableName: tableName,
        Item: item,
      },
    };

    if (condition) {
      putItem.Put.ConditionExpression = condition;
    }

    if (expressionNames && Object.keys(expressionNames).length > 0) {
      putItem.Put.ExpressionAttributeNames = expressionNames;
    }

    if (expressionValues && Object.keys(expressionValues).length > 0) {
      putItem.Put.ExpressionAttributeValues = expressionValues;
    }

    this.writeItems.push(putItem);
    return this;
  }

  /**
   * Adds a put operation that only succeeds if the item doesn't exist.
   *
   * Useful for create-only operations where you want to ensure
   * you're not overwriting an existing item.
   *
   * @param tableName - Name of the table to put the item in
   * @param item - Item to put in the table
   * @param pkName - Name of the partition key attribute
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.putIfNotExists('users', {
   *   userId: '123',
   *   name: 'John'
   * }, 'userId');
   * ```
   */
  putIfNotExists<T extends Record<string, AttributeValue>>(
    tableName: string,
    item: T,
    pkName: string
  ): TransactionBuilder {
    return this.put(
      tableName,
      item,
      `attribute_not_exists(#pk)`,
      { '#pk': pkName }
    );
  }

  // ==========================================================================
  // Update Operations
  // ==========================================================================

  /**
   * Adds an update operation to the transaction.
   *
   * Updates an existing item's attributes. The item must exist unless
   * you're using an update expression that creates it.
   *
   * @param tableName - Name of the table containing the item
   * @param key - Key of the item to update
   * @param pkName - Name of the partition key attribute
   * @param skName - Name of the sort key attribute (if applicable)
   * @param updateExpression - Update expression specifying the changes
   * @param condition - Optional condition expression
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.update(
   *   'users',
   *   { partitionKey: 'user-123' },
   *   'userId',
   *   undefined,
   *   {
   *     expression: 'SET #count = #count + :inc',
   *     expressionNames: { '#count': 'loginCount' },
   *     expressionValues: { ':inc': 1 }
   *   }
   * );
   * ```
   */
  update(
    tableName: string,
    key: Key,
    pkName: string,
    skName: string | undefined,
    updateExpression: UpdateExpression,
    condition?: string
  ): TransactionBuilder {
    const updateItem: any = {
      Update: {
        TableName: tableName,
        Key: toKeyMap(key, pkName, skName),
        UpdateExpression: updateExpression.expression,
      },
    };

    if (updateExpression.expressionNames && Object.keys(updateExpression.expressionNames).length > 0) {
      updateItem.Update.ExpressionAttributeNames = updateExpression.expressionNames;
    }

    if (updateExpression.expressionValues && Object.keys(updateExpression.expressionValues).length > 0) {
      updateItem.Update.ExpressionAttributeValues = updateExpression.expressionValues;
    }

    if (condition) {
      updateItem.Update.ConditionExpression = condition;
    }

    this.writeItems.push(updateItem);
    return this;
  }

  // ==========================================================================
  // Delete Operations
  // ==========================================================================

  /**
   * Adds a delete operation to the transaction.
   *
   * Deletes an item from a table. The delete succeeds even if
   * the item doesn't exist unless a condition is specified.
   *
   * @param tableName - Name of the table to delete from
   * @param key - Key of the item to delete
   * @param pkName - Name of the partition key attribute
   * @param skName - Name of the sort key attribute (if applicable)
   * @param condition - Optional condition expression
   * @param expressionNames - Optional expression attribute names
   * @param expressionValues - Optional expression attribute values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.delete(
   *   'users',
   *   { partitionKey: 'user-123' },
   *   'userId',
   *   undefined
   * );
   * ```
   */
  delete(
    tableName: string,
    key: Key,
    pkName: string,
    skName: string | undefined,
    condition?: string,
    expressionNames?: Record<string, string>,
    expressionValues?: Record<string, AttributeValue>
  ): TransactionBuilder {
    const deleteItem: any = {
      Delete: {
        TableName: tableName,
        Key: toKeyMap(key, pkName, skName),
      },
    };

    if (condition) {
      deleteItem.Delete.ConditionExpression = condition;
    }

    if (expressionNames && Object.keys(expressionNames).length > 0) {
      deleteItem.Delete.ExpressionAttributeNames = expressionNames;
    }

    if (expressionValues && Object.keys(expressionValues).length > 0) {
      deleteItem.Delete.ExpressionAttributeValues = expressionValues;
    }

    this.writeItems.push(deleteItem);
    return this;
  }

  // ==========================================================================
  // Condition Check Operations
  // ==========================================================================

  /**
   * Adds a condition check to the transaction.
   *
   * Checks that a condition is true for an item without modifying it.
   * Useful for ensuring invariants across multiple items in a transaction.
   *
   * @param tableName - Name of the table containing the item
   * @param key - Key of the item to check
   * @param pkName - Name of the partition key attribute
   * @param skName - Name of the sort key attribute (if applicable)
   * @param condition - Condition expression that must be true
   * @param expressionNames - Optional expression attribute names
   * @param expressionValues - Optional expression attribute values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.conditionCheck(
   *   'accounts',
   *   { partitionKey: 'acct-1' },
   *   'accountId',
   *   undefined,
   *   'balance >= :minBalance',
   *   undefined,
   *   { ':minBalance': 100 }
   * );
   * ```
   */
  conditionCheck(
    tableName: string,
    key: Key,
    pkName: string,
    skName: string | undefined,
    condition: string,
    expressionNames?: Record<string, string>,
    expressionValues?: Record<string, AttributeValue>
  ): TransactionBuilder {
    const conditionCheckItem: any = {
      ConditionCheck: {
        TableName: tableName,
        Key: toKeyMap(key, pkName, skName),
        ConditionExpression: condition,
      },
    };

    if (expressionNames && Object.keys(expressionNames).length > 0) {
      conditionCheckItem.ConditionCheck.ExpressionAttributeNames = expressionNames;
    }

    if (expressionValues && Object.keys(expressionValues).length > 0) {
      conditionCheckItem.ConditionCheck.ExpressionAttributeValues = expressionValues;
    }

    this.writeItems.push(conditionCheckItem);
    return this;
  }

  // ==========================================================================
  // Idempotency
  // ==========================================================================

  /**
   * Sets an idempotency token for the transaction.
   *
   * If you retry a transaction with the same token within 10 minutes,
   * DynamoDB will return the result of the original transaction instead
   * of executing it again.
   *
   * @param token - Unique idempotency token (max 36 characters)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const requestId = crypto.randomUUID();
   * builder.withIdempotencyToken(requestId);
   * ```
   */
  withIdempotencyToken(token: string): TransactionBuilder {
    this.clientRequestToken = token;
    return this;
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Executes the transaction.
   *
   * All operations succeed or fail together atomically. If any operation
   * fails (e.g., condition check), the entire transaction is canceled and
   * no changes are made.
   *
   * @throws {Error} If transaction has no items or exceeds 100 items
   * @throws {TransactionCanceledException} If any operation fails
   *
   * @example
   * ```typescript
   * try {
   *   await transaction.execute();
   *   console.log('Transaction succeeded');
   * } catch (error) {
   *   if (error.name === 'TransactionCanceledException') {
   *     const reasons = parseCancellationReasons(error);
   *     console.error('Transaction failed:', reasons);
   *   }
   * }
   * ```
   */
  async execute(): Promise<void> {
    // Validate transaction has items
    if (this.writeItems.length === 0) {
      throw new Error('Transaction must have at least one operation');
    }

    // Validate transaction doesn't exceed maximum items
    if (this.writeItems.length > MAX_TRANSACT_ITEMS) {
      throw new Error(
        `Transaction cannot exceed ${MAX_TRANSACT_ITEMS} items (attempted ${this.writeItems.length})`
      );
    }

    // Build command input
    const input: TransactWriteCommandInput = {
      TransactItems: this.writeItems,
    };

    // Add idempotency token if provided
    if (this.clientRequestToken) {
      input.ClientRequestToken = this.clientRequestToken;
    }

    // Execute transaction
    try {
      const command = new TransactWriteCommand(input);
      await this.docClient.send(command);
    } catch (error: any) {
      // Enhance TransactionCanceledException with parsed reasons
      if (
        error.name === 'TransactionCanceledException' ||
        error.__type === 'com.amazon.coral.service#TransactionCanceledException'
      ) {
        const reasons = parseCancellationReasons(error);
        const message = formatCancellationMessage(reasons);

        // Enhance the error with formatted message
        const enhancedError = new Error(message);
        enhancedError.name = 'TransactionCanceledException';
        (enhancedError as any).cancellationReasons = reasons;
        (enhancedError as any).originalError = error;

        throw enhancedError;
      }

      // Re-throw other errors
      throw error;
    }
  }
}

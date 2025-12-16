/**
 * DynamoDB Transactions
 *
 * Transaction support for atomic multi-item operations.
 */

export { TransactionBuilder } from './builder.js';
export type { UpdateExpression } from './builder.js';
export { parseCancellationReasons, formatCancellationMessage } from './errors.js';
export type { CancellationReason } from './errors.js';

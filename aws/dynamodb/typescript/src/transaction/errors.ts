/**
 * DynamoDB Transaction Error Handling
 *
 * Error parsing and handling utilities for transaction operations.
 */

// ============================================================================
// Cancellation Reason Types
// ============================================================================

/**
 * Represents a single cancellation reason for a transaction item.
 *
 * Provides detailed information about why a specific item in a transaction
 * was canceled (e.g., condition check failure, validation error).
 */
export interface CancellationReason {
  /** Error code (e.g., 'ConditionalCheckFailed', 'ValidationError') */
  code?: string;
  /** Human-readable error message */
  message?: string;
  /** The item that caused the cancellation */
  item?: Record<string, any>;
}

// ============================================================================
// Error Parsing Functions
// ============================================================================

/**
 * Parses cancellation reasons from a TransactionCanceledException.
 *
 * DynamoDB provides detailed cancellation reasons for each item in a failed
 * transaction. This function extracts and structures those reasons for
 * easier debugging and error handling.
 *
 * @param error - The error object from AWS SDK
 * @returns Array of cancellation reasons, one per transaction item
 *
 * @example
 * ```typescript
 * try {
 *   await transaction.execute();
 * } catch (error) {
 *   const reasons = parseCancellationReasons(error);
 *   reasons.forEach((reason, index) => {
 *     if (reason.code) {
 *       console.log(`Item ${index} failed: ${reason.code} - ${reason.message}`);
 *     }
 *   });
 * }
 * ```
 */
export function parseCancellationReasons(error: any): CancellationReason[] {
  // Check if this is a TransactionCanceledException
  if (
    !error ||
    (error.name !== 'TransactionCanceledException' &&
      error.__type !== 'com.amazon.coral.service#TransactionCanceledException')
  ) {
    return [];
  }

  // Extract cancellation reasons from the error
  const cancellationReasons = error.CancellationReasons || [];

  return cancellationReasons.map((reason: any) => {
    const parsedReason: CancellationReason = {};

    // Extract error code
    if (reason.Code) {
      parsedReason.code = reason.Code;
    }

    // Extract error message
    if (reason.Message) {
      parsedReason.message = reason.Message;
    }

    // Extract the item that caused the failure (if available)
    if (reason.Item) {
      parsedReason.item = reason.Item;
    }

    return parsedReason;
  });
}

/**
 * Formats cancellation reasons into a human-readable error message.
 *
 * Converts an array of cancellation reasons into a formatted string
 * suitable for error messages and logging.
 *
 * @param reasons - Array of cancellation reasons
 * @returns Formatted error message string
 *
 * @example
 * ```typescript
 * const reasons = parseCancellationReasons(error);
 * const message = formatCancellationMessage(reasons);
 * throw new Error(message);
 * ```
 */
export function formatCancellationMessage(reasons: CancellationReason[]): string {
  if (reasons.length === 0) {
    return 'Transaction canceled';
  }

  const messages = reasons
    .map((reason, index) => {
      if (!reason.code) {
        return `Item ${index}: No error`;
      }
      const msg = reason.message || 'Unknown error';
      return `Item ${index}: [${reason.code}] ${msg}`;
    })
    .filter((msg) => !msg.includes('No error'));

  if (messages.length === 0) {
    return 'Transaction canceled';
  }

  return `Transaction canceled:\n${messages.join('\n')}`;
}

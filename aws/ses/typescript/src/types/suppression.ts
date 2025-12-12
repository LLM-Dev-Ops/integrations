/**
 * AWS SES Suppression Types
 *
 * This module contains type definitions for suppression list management in AWS SES v2.
 */

/**
 * The reason an email address is on the suppression list.
 */
export type SuppressionReason = 'BOUNCE' | 'COMPLAINT';

/**
 * Represents a suppressed email destination.
 */
export interface SuppressedDestination {
  /** The email address that is on the suppression list */
  emailAddress: string;
  /** The reason the email address is on the suppression list */
  reason: SuppressionReason;
  /** The date and time when the email address was added to the suppression list */
  lastUpdateTime: Date;
  /** Additional attributes about the suppressed destination */
  attributes?: SuppressedDestinationAttributes;
}

/**
 * Represents attributes of a suppressed destination.
 */
export interface SuppressedDestinationAttributes {
  /** The unique message ID of the email that caused the address to be added */
  messageId?: string;
  /** The feedback ID if the email was a complaint */
  feedbackId?: string;
}

/**
 * Represents a summary of a suppressed destination.
 */
export interface SuppressedDestinationSummary {
  /** The email address that is on the suppression list */
  emailAddress: string;
  /** The reason the email address is on the suppression list */
  reason: SuppressionReason;
  /** The date and time when the email address was added to the suppression list */
  lastUpdateTime: Date;
}

/**
 * Represents account-level suppression settings.
 */
export interface SuppressionAttributes {
  /** List of suppression reasons that are in effect at the account level */
  suppressedReasons?: SuppressionReason[];
}

/**
 * Represents options for suppression list management.
 */
export interface SuppressionListDestination {
  /** The reason to use for suppression */
  suppressionListImportAction: SuppressionListImportAction;
}

/**
 * The action to take when importing a suppression list.
 */
export type SuppressionListImportAction = 'DELETE' | 'PUT';

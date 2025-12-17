/**
 * HubSpot Webhook Types
 * Type definitions for webhook events and handlers
 */

import type { ObjectType, Properties } from './objects.js';

/**
 * Webhook event structure received from HubSpot
 */
export interface WebhookEvent {
  /** Unique event ID */
  eventId: number;

  /** Subscription ID that triggered this event */
  subscriptionId: number;

  /** Portal (account) ID */
  portalId: number;

  /** App ID (for app-based webhooks) */
  appId?: number;

  /** When the event occurred (Unix timestamp in milliseconds) */
  occurredAt: number;

  /** Event subscription type (e.g., "contact.creation") */
  subscriptionType: string;

  /** Delivery attempt number */
  attemptNumber: number;

  /** Object ID that triggered the event */
  objectId: number;

  /** Changed property name (for propertyChange events) */
  propertyName?: string;

  /** New property value (for propertyChange events) */
  propertyValue?: string;

  /** Source of the change */
  changeSource: ChangeSource;

  /** Flag indicating if this event was triggered by a user */
  changeFlag?: string;

  /** Message ID (for conversation/messaging events) */
  messageId?: string;

  /** Message type (for conversation events) */
  messageType?: string;
}

/**
 * Source of the change that triggered the webhook
 */
export type ChangeSource =
  | 'CRM'
  | 'INTEGRATION'
  | 'IMPORT'
  | 'MIGRATION'
  | 'FORM'
  | 'AUTOMATION'
  | 'WORKFLOW'
  | 'API'
  | string;

/**
 * Webhook subscription types
 */
export type WebhookSubscriptionType =
  // Contact events
  | 'contact.creation'
  | 'contact.deletion'
  | 'contact.propertyChange'
  | 'contact.privacyDeletion'
  // Company events
  | 'company.creation'
  | 'company.deletion'
  | 'company.propertyChange'
  // Deal events
  | 'deal.creation'
  | 'deal.deletion'
  | 'deal.propertyChange'
  // Ticket events
  | 'ticket.creation'
  | 'ticket.deletion'
  | 'ticket.propertyChange'
  // Product events
  | 'product.creation'
  | 'product.deletion'
  | 'product.propertyChange'
  // Line item events
  | 'line_item.creation'
  | 'line_item.deletion'
  | 'line_item.propertyChange'
  // Conversation events
  | 'conversation.creation'
  | 'conversation.deletion'
  | 'conversation.newMessage'
  | 'conversation.propertyChange'
  // Custom object events
  | string;

/**
 * Webhook request from HubSpot
 */
export interface WebhookRequest {
  /** HTTP method (POST) */
  method: string;

  /** Request URL path */
  url: string;

  /** Request headers */
  headers: WebhookHeaders;

  /** Raw request body (JSON string) */
  body: string;

  /** Parsed body (array of events or single event) */
  parsedBody?: WebhookEvent | WebhookEvent[];
}

/**
 * Webhook request headers
 */
export interface WebhookHeaders {
  /** HubSpot signature (v3) for validation */
  'x-hubspot-signature-v3'?: string;

  /** Older v1 signature (deprecated) */
  'x-hubspot-signature'?: string;

  /** Request timestamp (Unix timestamp in milliseconds) */
  'x-hubspot-request-timestamp'?: string;

  /** Content type */
  'content-type'?: string;

  /** User agent */
  'user-agent'?: string;

  /** Additional headers */
  [key: string]: string | undefined;
}

/**
 * Webhook response to send back to HubSpot
 */
export interface WebhookResponse {
  /** HTTP status code */
  statusCode: number;

  /** Response body */
  body?: unknown;

  /** Processing results (for logging/debugging) */
  results?: WebhookProcessingResult[];
}

/**
 * Result of processing a webhook event
 */
export interface WebhookProcessingResult {
  /** Event ID that was processed */
  eventId: number;

  /** Processing status */
  status: 'processed' | 'failed' | 'duplicate' | 'expired' | 'skipped';

  /** Error information (if failed) */
  error?: Error | string;

  /** Processing timestamp */
  processedAt?: Date;

  /** Processing duration in milliseconds */
  duration?: number;
}

/**
 * Webhook handler function type
 */
export type WebhookHandler = (event: WebhookEvent) => Promise<void> | void;

/**
 * Webhook subscription definition
 */
export interface WebhookSubscription {
  /** Subscription ID */
  id: number;

  /** Subscription type */
  subscriptionType: WebhookSubscriptionType;

  /** Target URL for webhook delivery */
  targetUrl: string;

  /** Whether the subscription is active */
  active: boolean;

  /** Created timestamp */
  createdAt?: Date;

  /** Updated timestamp */
  updatedAt?: Date;
}

/**
 * Input for creating a webhook subscription
 */
export interface CreateWebhookSubscriptionInput {
  /** Subscription type */
  subscriptionType: WebhookSubscriptionType;

  /** Target URL */
  targetUrl: string;

  /** Whether active (default: true) */
  active?: boolean;

  /** Property name (for propertyChange subscriptions) */
  propertyName?: string;
}

/**
 * Webhook validation result
 */
export interface WebhookValidationResult {
  /** Whether the signature is valid */
  valid: boolean;

  /** Validation error message (if invalid) */
  error?: string;

  /** Timestamp validation result */
  timestampValid?: boolean;

  /** Signature validation result */
  signatureValid?: boolean;

  /** Timestamp skew in milliseconds */
  timestampSkew?: number;
}

/**
 * Webhook error types
 */
export class WebhookError extends Error {
  constructor(
    message: string,
    public eventId?: number,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

/**
 * Invalid signature error
 */
export class InvalidSignatureError extends WebhookError {
  constructor(message = 'Invalid webhook signature') {
    super(message, undefined, 401);
    this.name = 'InvalidSignatureError';
  }
}

/**
 * Expired event error
 */
export class ExpiredEventError extends WebhookError {
  constructor(eventId: number, age: number) {
    super(`Event ${eventId} is too old (${age}ms)`, eventId, 400);
    this.name = 'ExpiredEventError';
  }
}

/**
 * Duplicate event error
 */
export class DuplicateEventError extends WebhookError {
  constructor(eventId: number) {
    super(`Event ${eventId} already processed`, eventId, 200);
    this.name = 'DuplicateEventError';
  }
}

/**
 * Webhook event payload for specific object types
 */
export interface TypedWebhookEvent<T extends ObjectType = ObjectType> extends WebhookEvent {
  /** Object type being affected */
  objectType?: T;

  /** Full object data (if available) */
  objectData?: {
    id: string;
    properties: Properties;
  };
}

/**
 * Batch webhook events (HubSpot sends arrays)
 */
export type WebhookBatch = WebhookEvent[];

/**
 * Webhook retry configuration
 */
export interface WebhookRetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;

  /** Initial retry delay in milliseconds */
  initialDelay: number;

  /** Backoff multiplier */
  backoffMultiplier: number;

  /** Maximum delay between retries */
  maxDelay: number;
}

/**
 * Webhook delivery status
 */
export interface WebhookDeliveryStatus {
  /** Subscription ID */
  subscriptionId: number;

  /** Event ID */
  eventId: number;

  /** Delivery attempt number */
  attemptNumber: number;

  /** Delivery status */
  status: 'pending' | 'delivered' | 'failed' | 'retrying';

  /** HTTP status code received */
  statusCode?: number;

  /** Response body */
  response?: string;

  /** Error message (if failed) */
  error?: string;

  /** Last attempt timestamp */
  lastAttemptAt?: Date;

  /** Next retry timestamp (if retrying) */
  nextRetryAt?: Date;
}

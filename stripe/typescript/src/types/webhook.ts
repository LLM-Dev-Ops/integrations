/**
 * Webhook event types as per Stripe API specification
 */
import type { Timestamp } from './common.js';

/**
 * Stripe webhook event types
 */
export type WebhookEventType =
  // Payment Intent events
  | 'payment_intent.created'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'payment_intent.canceled'
  | 'payment_intent.processing'
  | 'payment_intent.requires_action'
  | 'payment_intent.amount_capturable_updated'
  | 'payment_intent.partially_funded'
  // Charge events
  | 'charge.succeeded'
  | 'charge.failed'
  | 'charge.refunded'
  | 'charge.updated'
  | 'charge.captured'
  | 'charge.pending'
  | 'charge.expired'
  | 'charge.dispute.created'
  | 'charge.dispute.closed'
  | 'charge.dispute.updated'
  // Customer events
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'customer.source.created'
  | 'customer.source.deleted'
  | 'customer.source.expiring'
  | 'customer.source.updated'
  // Subscription events
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.paused'
  | 'customer.subscription.pending_update_applied'
  | 'customer.subscription.pending_update_expired'
  | 'customer.subscription.resumed'
  | 'customer.subscription.trial_will_end'
  // Invoice events
  | 'invoice.created'
  | 'invoice.updated'
  | 'invoice.deleted'
  | 'invoice.finalized'
  | 'invoice.finalization_failed'
  | 'invoice.marked_uncollectible'
  | 'invoice.overdue'
  | 'invoice.paid'
  | 'invoice.payment_action_required'
  | 'invoice.payment_failed'
  | 'invoice.payment_succeeded'
  | 'invoice.sent'
  | 'invoice.upcoming'
  | 'invoice.voided'
  // Invoice item events
  | 'invoiceitem.created'
  | 'invoiceitem.deleted'
  // Checkout events
  | 'checkout.session.async_payment_failed'
  | 'checkout.session.async_payment_succeeded'
  | 'checkout.session.completed'
  | 'checkout.session.expired'
  // Payment method events
  | 'payment_method.attached'
  | 'payment_method.automatically_updated'
  | 'payment_method.detached'
  | 'payment_method.updated'
  // Setup intent events
  | 'setup_intent.canceled'
  | 'setup_intent.created'
  | 'setup_intent.requires_action'
  | 'setup_intent.setup_failed'
  | 'setup_intent.succeeded'
  // Price events
  | 'price.created'
  | 'price.deleted'
  | 'price.updated'
  // Product events
  | 'product.created'
  | 'product.deleted'
  | 'product.updated'
  // Billing portal events
  | 'billing_portal.configuration.created'
  | 'billing_portal.configuration.updated'
  | 'billing_portal.session.created'
  // Other event types
  | string;

/**
 * Webhook event object
 */
export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  object: 'event';
  api_version: string;
  created: Timestamp;
  data: {
    object: T;
    previous_attributes?: Partial<T>;
  };
  livemode: boolean;
  pending_webhooks: number;
  request?: {
    id?: string;
    idempotency_key?: string;
  };
  type: WebhookEventType;
}

/**
 * Webhook payload for incoming webhooks
 */
export interface WebhookPayload {
  rawBody: Buffer | string;
  signature: string;
}

/**
 * Parsed webhook signature header
 */
export interface WebhookSignatureHeader {
  timestamp: Timestamp;
  signatures: string[];
}

/**
 * Webhook handler function type
 */
export type WebhookHandler<T = Record<string, unknown>> = (
  event: WebhookEvent<T>
) => Promise<void>;

/**
 * Webhook handler registry entry
 */
export interface WebhookHandlerEntry<T = Record<string, unknown>> {
  eventType: WebhookEventType;
  handler: WebhookHandler<T>;
}

/**
 * Event types constants for type-safe usage
 */
export const EventTypes = {
  // Payment Intent events
  PAYMENT_INTENT_CREATED: 'payment_intent.created',
  PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
  PAYMENT_INTENT_PAYMENT_FAILED: 'payment_intent.payment_failed',
  PAYMENT_INTENT_CANCELED: 'payment_intent.canceled',
  PAYMENT_INTENT_PROCESSING: 'payment_intent.processing',
  PAYMENT_INTENT_REQUIRES_ACTION: 'payment_intent.requires_action',
  PAYMENT_INTENT_AMOUNT_CAPTURABLE_UPDATED: 'payment_intent.amount_capturable_updated',

  // Charge events
  CHARGE_SUCCEEDED: 'charge.succeeded',
  CHARGE_FAILED: 'charge.failed',
  CHARGE_REFUNDED: 'charge.refunded',
  CHARGE_CAPTURED: 'charge.captured',
  CHARGE_DISPUTE_CREATED: 'charge.dispute.created',
  CHARGE_DISPUTE_CLOSED: 'charge.dispute.closed',

  // Customer events
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_DELETED: 'customer.deleted',

  // Subscription events
  SUBSCRIPTION_CREATED: 'customer.subscription.created',
  SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  SUBSCRIPTION_PAUSED: 'customer.subscription.paused',
  SUBSCRIPTION_RESUMED: 'customer.subscription.resumed',
  SUBSCRIPTION_TRIAL_WILL_END: 'customer.subscription.trial_will_end',

  // Invoice events
  INVOICE_CREATED: 'invoice.created',
  INVOICE_FINALIZED: 'invoice.finalized',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
  INVOICE_UPCOMING: 'invoice.upcoming',
  INVOICE_VOIDED: 'invoice.voided',
  INVOICE_MARKED_UNCOLLECTIBLE: 'invoice.marked_uncollectible',

  // Checkout events
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  CHECKOUT_SESSION_EXPIRED: 'checkout.session.expired',
  CHECKOUT_SESSION_ASYNC_PAYMENT_SUCCEEDED: 'checkout.session.async_payment_succeeded',
  CHECKOUT_SESSION_ASYNC_PAYMENT_FAILED: 'checkout.session.async_payment_failed',

  // Payment method events
  PAYMENT_METHOD_ATTACHED: 'payment_method.attached',
  PAYMENT_METHOD_DETACHED: 'payment_method.detached',
  PAYMENT_METHOD_UPDATED: 'payment_method.updated',

  // Setup intent events
  SETUP_INTENT_SUCCEEDED: 'setup_intent.succeeded',
  SETUP_INTENT_CANCELED: 'setup_intent.canceled',
  SETUP_INTENT_REQUIRES_ACTION: 'setup_intent.requires_action',
  SETUP_INTENT_SETUP_FAILED: 'setup_intent.setup_failed',
} as const;

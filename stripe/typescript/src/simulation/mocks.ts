/**
 * Mock event generators for testing
 */
import type { WebhookEvent } from '../types/webhook.js';
import type { PaymentIntent } from '../types/payment-intent.js';
import type { Subscription } from '../types/subscription.js';
import type { Invoice } from '../types/invoice.js';
import type { Currency } from '../types/common.js';

/**
 * Creates a mock payment intent object
 */
export function mockPaymentIntent(
  overrides: Partial<PaymentIntent> = {}
): PaymentIntent {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `pi_mock_${Math.random().toString(36).substring(7)}`,
    object: 'payment_intent',
    amount: 1000,
    amount_capturable: 0,
    amount_received: 0,
    capture_method: 'automatic',
    confirmation_method: 'automatic',
    currency: 'usd',
    livemode: false,
    created: now,
    payment_method_types: ['card'],
    status: 'requires_payment_method',
    ...overrides,
  };
}

/**
 * Creates a mock subscription object
 */
export function mockSubscription(
  overrides: Partial<Subscription> = {}
): Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `sub_mock_${Math.random().toString(36).substring(7)}`,
    object: 'subscription',
    application: null,
    automatic_tax: { enabled: false },
    billing_cycle_anchor: now,
    cancel_at_period_end: false,
    collection_method: 'charge_automatically',
    currency: 'usd',
    current_period_end: now + 2592000, // +30 days
    current_period_start: now,
    customer: `cus_mock_${Math.random().toString(36).substring(7)}`,
    livemode: false,
    created: now,
    items: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/subscription_items',
    },
    start_date: now,
    status: 'active',
    ...overrides,
  } as Subscription;
}

/**
 * Creates a mock invoice object
 */
export function mockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `in_mock_${Math.random().toString(36).substring(7)}`,
    object: 'invoice',
    amount_due: 1000,
    amount_paid: 0,
    amount_remaining: 1000,
    amount_shipping: 0,
    attempt_count: 0,
    attempted: false,
    automatic_tax: { enabled: false },
    collection_method: 'charge_automatically',
    currency: 'usd',
    customer: `cus_mock_${Math.random().toString(36).substring(7)}`,
    livemode: false,
    created: now,
    lines: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/invoices/lines',
    },
    paid: false,
    paid_out_of_band: false,
    payment_settings: {},
    period_end: now,
    period_start: now - 2592000, // -30 days
    post_payment_credit_notes_amount: 0,
    pre_payment_credit_notes_amount: 0,
    starting_balance: 0,
    status_transitions: {},
    subtotal: 1000,
    total: 1000,
    ...overrides,
  } as Invoice;
}

/**
 * Creates a mock webhook event
 */
export function mockWebhookEvent<T = Record<string, unknown>>(
  type: string,
  data: T,
  overrides: Partial<WebhookEvent<T>> = {}
): WebhookEvent<T> {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `evt_mock_${Math.random().toString(36).substring(7)}`,
    object: 'event',
    api_version: '2024-12-18.acacia',
    created: now,
    data: {
      object: data,
    },
    livemode: false,
    pending_webhooks: 0,
    type,
    ...overrides,
  };
}

/**
 * Creates a mock payment_intent.succeeded event
 */
export function mockPaymentIntentSucceededEvent(
  amount: number = 1000,
  currency: Currency = 'usd'
): WebhookEvent<PaymentIntent> {
  const paymentIntent = mockPaymentIntent({
    amount,
    currency,
    amount_received: amount,
    status: 'succeeded',
  });

  return mockWebhookEvent('payment_intent.succeeded', paymentIntent);
}

/**
 * Creates a mock payment_intent.payment_failed event
 */
export function mockPaymentIntentFailedEvent(
  amount: number = 1000,
  currency: Currency = 'usd',
  declineCode: string = 'generic_decline'
): WebhookEvent<PaymentIntent> {
  const paymentIntent = mockPaymentIntent({
    amount,
    currency,
    status: 'requires_payment_method',
    last_payment_error: {
      type: 'card_error',
      code: 'card_declined',
      decline_code: declineCode,
      message: 'Your card was declined.',
    },
  });

  return mockWebhookEvent('payment_intent.payment_failed', paymentIntent);
}

/**
 * Creates a mock customer.subscription.created event
 */
export function mockSubscriptionCreatedEvent(
  status: 'active' | 'trialing' = 'active'
): WebhookEvent<Subscription> {
  const subscription = mockSubscription({ status });
  return mockWebhookEvent('customer.subscription.created', subscription);
}

/**
 * Creates a mock customer.subscription.deleted event
 */
export function mockSubscriptionDeletedEvent(): WebhookEvent<Subscription> {
  const subscription = mockSubscription({ status: 'canceled' });
  return mockWebhookEvent('customer.subscription.deleted', subscription);
}

/**
 * Creates a mock invoice.paid event
 */
export function mockInvoicePaidEvent(
  amount: number = 1000,
  currency: Currency = 'usd'
): WebhookEvent<Invoice> {
  const invoice = mockInvoice({
    amount_due: amount,
    amount_paid: amount,
    amount_remaining: 0,
    currency,
    paid: true,
    status: 'paid',
  });

  return mockWebhookEvent('invoice.paid', invoice);
}

/**
 * Creates a mock invoice.payment_failed event
 */
export function mockInvoicePaymentFailedEvent(
  amount: number = 1000,
  currency: Currency = 'usd'
): WebhookEvent<Invoice> {
  const invoice = mockInvoice({
    amount_due: amount,
    currency,
    paid: false,
    status: 'open',
    attempt_count: 1,
    attempted: true,
  });

  return mockWebhookEvent('invoice.payment_failed', invoice);
}

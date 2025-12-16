/**
 * Subscription types as per Stripe API specification
 */
import type {
  Currency,
  Metadata,
  Timestamp,
  StripeObject,
  PaginationParams,
  Expandable,
} from './common.js';

/**
 * Subscription status values
 */
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/**
 * Collection method for subscription invoices
 */
export type CollectionMethod = 'charge_automatically' | 'send_invoice';

/**
 * Proration behavior for subscription updates
 */
export type ProrationBehavior =
  | 'create_prorations'
  | 'none'
  | 'always_invoice';

/**
 * Subscription billing cycle anchor behavior
 */
export type BillingCycleAnchor = 'now' | 'unchanged' | Timestamp;

/**
 * Payment behavior for subscription creation
 */
export type PaymentBehavior =
  | 'allow_incomplete'
  | 'default_incomplete'
  | 'error_if_incomplete'
  | 'pending_if_incomplete';

/**
 * Subscription Item
 */
export interface SubscriptionItem extends StripeObject {
  object: 'subscription_item';
  billing_thresholds?: {
    usage_gte: number;
  };
  price: Price;
  quantity?: number;
  subscription: string;
  tax_rates?: TaxRate[];
}

/**
 * Price object
 */
export interface Price extends StripeObject {
  object: 'price';
  active: boolean;
  billing_scheme: 'per_unit' | 'tiered';
  currency: Currency;
  nickname?: string;
  product: Expandable<string>;
  recurring?: {
    aggregate_usage?: 'sum' | 'last_during_period' | 'last_ever' | 'max';
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
    usage_type: 'metered' | 'licensed';
  };
  type: 'one_time' | 'recurring';
  unit_amount?: number;
  unit_amount_decimal?: string;
}

/**
 * Tax rate object
 */
export interface TaxRate extends StripeObject {
  object: 'tax_rate';
  active: boolean;
  country?: string;
  description?: string;
  display_name: string;
  inclusive: boolean;
  jurisdiction?: string;
  percentage: number;
  state?: string;
  tax_type?: string;
}

/**
 * Subscription object
 */
export interface Subscription extends StripeObject {
  object: 'subscription';
  application?: string;
  application_fee_percent?: number;
  automatic_tax: {
    enabled: boolean;
  };
  billing_cycle_anchor: Timestamp;
  billing_thresholds?: {
    amount_gte?: number;
    reset_billing_cycle_anchor?: boolean;
  };
  cancel_at?: Timestamp;
  cancel_at_period_end: boolean;
  canceled_at?: Timestamp;
  cancellation_details?: {
    comment?: string;
    feedback?: string;
    reason?: string;
  };
  collection_method: CollectionMethod;
  currency: Currency;
  current_period_end: Timestamp;
  current_period_start: Timestamp;
  customer: Expandable<string>;
  days_until_due?: number;
  default_payment_method?: Expandable<string>;
  default_source?: Expandable<string>;
  default_tax_rates?: TaxRate[];
  description?: string;
  discount?: Discount;
  ended_at?: Timestamp;
  items: {
    object: 'list';
    data: SubscriptionItem[];
    has_more: boolean;
    url: string;
  };
  latest_invoice?: Expandable<string>;
  next_pending_invoice_item_invoice?: Timestamp;
  on_behalf_of?: string;
  pause_collection?: {
    behavior: 'keep_as_draft' | 'mark_uncollectible' | 'void';
    resumes_at?: Timestamp;
  };
  payment_settings?: PaymentSettings;
  pending_invoice_item_interval?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
  };
  pending_setup_intent?: Expandable<string>;
  pending_update?: PendingUpdate;
  schedule?: Expandable<string>;
  start_date: Timestamp;
  status: SubscriptionStatus;
  test_clock?: Expandable<string>;
  transfer_data?: {
    amount_percent?: number;
    destination: string;
  };
  trial_end?: Timestamp;
  trial_settings?: {
    end_behavior: {
      missing_payment_method: 'cancel' | 'create_invoice' | 'pause';
    };
  };
  trial_start?: Timestamp;
}

/**
 * Discount object
 */
export interface Discount extends StripeObject {
  object: 'discount';
  checkout_session?: string;
  coupon: Coupon;
  customer?: Expandable<string>;
  end?: Timestamp;
  invoice?: string;
  invoice_item?: string;
  promotion_code?: Expandable<string>;
  start: Timestamp;
  subscription?: string;
}

/**
 * Coupon object
 */
export interface Coupon extends StripeObject {
  object: 'coupon';
  amount_off?: number;
  currency?: Currency;
  duration: 'forever' | 'once' | 'repeating';
  duration_in_months?: number;
  max_redemptions?: number;
  name?: string;
  percent_off?: number;
  redeem_by?: Timestamp;
  times_redeemed: number;
  valid: boolean;
}

/**
 * Payment settings for subscription
 */
export interface PaymentSettings {
  payment_method_options?: {
    card?: {
      mandate_options?: Record<string, unknown>;
      request_three_d_secure?: 'any' | 'automatic';
    };
  };
  payment_method_types?: string[];
  save_default_payment_method?: 'off' | 'on_subscription';
}

/**
 * Pending subscription update
 */
export interface PendingUpdate {
  billing_cycle_anchor?: Timestamp;
  expires_at: Timestamp;
  subscription_items?: SubscriptionItem[];
  trial_end?: Timestamp;
  trial_from_plan?: boolean;
}

/**
 * Subscription item parameters for create/update
 */
export interface SubscriptionItemParams {
  id?: string;
  price?: string;
  quantity?: number;
  billing_thresholds?: {
    usage_gte: number;
  };
  metadata?: Metadata;
  tax_rates?: string[];
  deleted?: boolean;
}

/**
 * Create Subscription request parameters
 */
export interface CreateSubscriptionRequest {
  customer: string;
  items: SubscriptionItemParams[];
  add_invoice_items?: {
    price?: string;
    quantity?: number;
    tax_rates?: string[];
  }[];
  application_fee_percent?: number;
  automatic_tax?: {
    enabled: boolean;
  };
  backdate_start_date?: Timestamp;
  billing_cycle_anchor?: Timestamp;
  billing_thresholds?: {
    amount_gte?: number;
    reset_billing_cycle_anchor?: boolean;
  };
  cancel_at?: Timestamp;
  cancel_at_period_end?: boolean;
  collection_method?: CollectionMethod;
  coupon?: string;
  currency?: Currency;
  days_until_due?: number;
  default_payment_method?: string;
  default_source?: string;
  default_tax_rates?: string[];
  description?: string;
  metadata?: Metadata;
  off_session?: boolean;
  on_behalf_of?: string;
  payment_behavior?: PaymentBehavior;
  payment_settings?: PaymentSettings;
  pending_invoice_item_interval?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
  };
  promotion_code?: string;
  proration_behavior?: ProrationBehavior;
  transfer_data?: {
    amount_percent?: number;
    destination: string;
  };
  trial_end?: Timestamp | 'now';
  trial_from_plan?: boolean;
  trial_period_days?: number;
  trial_settings?: {
    end_behavior: {
      missing_payment_method: 'cancel' | 'create_invoice' | 'pause';
    };
  };
}

/**
 * Update Subscription request parameters
 */
export interface UpdateSubscriptionRequest {
  add_invoice_items?: {
    price?: string;
    quantity?: number;
    tax_rates?: string[];
  }[];
  application_fee_percent?: number;
  automatic_tax?: {
    enabled: boolean;
  };
  billing_cycle_anchor?: BillingCycleAnchor;
  billing_thresholds?: {
    amount_gte?: number;
    reset_billing_cycle_anchor?: boolean;
  } | '';
  cancel_at?: Timestamp | '';
  cancel_at_period_end?: boolean;
  cancellation_details?: {
    comment?: string;
    feedback?: string;
  };
  collection_method?: CollectionMethod;
  coupon?: string;
  days_until_due?: number;
  default_payment_method?: string;
  default_source?: string | '';
  default_tax_rates?: string[] | '';
  description?: string | '';
  items?: SubscriptionItemParams[];
  metadata?: Metadata;
  off_session?: boolean;
  on_behalf_of?: string | '';
  pause_collection?: {
    behavior: 'keep_as_draft' | 'mark_uncollectible' | 'void';
    resumes_at?: Timestamp;
  } | '';
  payment_behavior?: PaymentBehavior;
  payment_settings?: PaymentSettings;
  pending_invoice_item_interval?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
  } | '';
  promotion_code?: string;
  proration_behavior?: ProrationBehavior;
  proration_date?: Timestamp;
  transfer_data?: {
    amount_percent?: number;
    destination: string;
  } | '';
  trial_end?: Timestamp | 'now';
  trial_from_plan?: boolean;
  trial_settings?: {
    end_behavior: {
      missing_payment_method: 'cancel' | 'create_invoice' | 'pause';
    };
  };
}

/**
 * Cancel Subscription request parameters
 */
export interface CancelSubscriptionRequest {
  cancellation_details?: {
    comment?: string;
    feedback?: string;
  };
  invoice_now?: boolean;
  prorate?: boolean;
}

/**
 * List Subscriptions parameters
 */
export interface ListSubscriptionsParams extends PaginationParams {
  customer?: string;
  price?: string;
  status?: SubscriptionStatus | 'all' | 'ended';
  collection_method?: CollectionMethod;
  created?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
  current_period_end?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
  current_period_start?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
}

/**
 * Invoice types as per Stripe API specification
 */
import type {
  Currency,
  Metadata,
  Timestamp,
  StripeObject,
  PaginationParams,
  Expandable,
  Address,
} from './common.js';
import type { Discount, TaxRate } from './subscription.js';

/**
 * Invoice status values
 */
export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'uncollectible'
  | 'void';

/**
 * Invoice billing reason
 */
export type InvoiceBillingReason =
  | 'subscription_create'
  | 'subscription_cycle'
  | 'subscription_update'
  | 'subscription'
  | 'manual'
  | 'upcoming'
  | 'subscription_threshold'
  | 'quote_accept';

/**
 * Invoice collection method
 */
export type InvoiceCollectionMethod = 'charge_automatically' | 'send_invoice';

/**
 * Invoice line item
 */
export interface InvoiceLineItem extends StripeObject {
  object: 'line_item';
  amount: number;
  amount_excluding_tax?: number;
  currency: Currency;
  description?: string;
  discount_amounts?: {
    amount: number;
    discount: Expandable<Discount>;
  }[];
  discountable: boolean;
  discounts?: Expandable<Discount>[];
  invoice_item?: string;
  period: {
    end: Timestamp;
    start: Timestamp;
  };
  plan?: {
    id: string;
    active: boolean;
    amount?: number;
    currency?: Currency;
    interval?: string;
    interval_count?: number;
    nickname?: string;
    product?: Expandable<string>;
  };
  price?: {
    id: string;
    active: boolean;
    currency: Currency;
    nickname?: string;
    product: Expandable<string>;
    type: 'one_time' | 'recurring';
    unit_amount?: number;
    unit_amount_decimal?: string;
  };
  proration: boolean;
  proration_details?: {
    credited_items?: {
      invoice: string;
      invoice_line_items: string[];
    };
  };
  quantity?: number;
  subscription?: string;
  subscription_item?: string;
  tax_amounts?: {
    amount: number;
    inclusive: boolean;
    tax_rate: Expandable<TaxRate>;
    taxability_reason?: string;
    taxable_amount?: number;
  }[];
  tax_rates?: TaxRate[];
  type: 'invoiceitem' | 'subscription';
  unit_amount_excluding_tax?: string;
}

/**
 * Invoice payment settings
 */
export interface InvoicePaymentSettings {
  default_mandate?: string;
  payment_method_options?: {
    card?: {
      installments?: {
        enabled: boolean;
      };
      request_three_d_secure?: 'any' | 'automatic';
    };
  };
  payment_method_types?: string[];
}

/**
 * Invoice rendering options
 */
export interface InvoiceRenderingOptions {
  amount_tax_display?: 'exclude_tax' | 'include_inclusive_tax';
}

/**
 * Invoice custom field
 */
export interface InvoiceCustomField {
  name: string;
  value: string;
}

/**
 * Invoice threshold reason
 */
export interface InvoiceThresholdReason {
  amount_gte?: number;
  item_reasons?: {
    line_item_ids: string[];
    usage_gte: number;
  }[];
}

/**
 * Invoice object
 */
export interface Invoice extends StripeObject {
  object: 'invoice';
  account_country?: string;
  account_name?: string;
  account_tax_ids?: Expandable<string>[];
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  amount_shipping: number;
  application?: Expandable<string>;
  application_fee_amount?: number;
  attempt_count: number;
  attempted: boolean;
  auto_advance?: boolean;
  automatic_tax: {
    enabled: boolean;
    status?: 'complete' | 'failed' | 'requires_location_inputs';
  };
  billing_reason?: InvoiceBillingReason;
  charge?: Expandable<string>;
  collection_method: InvoiceCollectionMethod;
  currency: Currency;
  custom_fields?: InvoiceCustomField[];
  customer: Expandable<string>;
  customer_address?: Address;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_shipping?: {
    address: Address;
    name: string;
    phone?: string;
  };
  customer_tax_exempt?: 'none' | 'exempt' | 'reverse';
  customer_tax_ids?: {
    type: string;
    value: string;
  }[];
  default_payment_method?: Expandable<string>;
  default_source?: Expandable<string>;
  default_tax_rates?: TaxRate[];
  description?: string;
  discount?: Discount;
  discounts?: Expandable<Discount>[];
  due_date?: Timestamp;
  effective_at?: Timestamp;
  ending_balance?: number;
  footer?: string;
  from_invoice?: {
    action: string;
    invoice: Expandable<string>;
  };
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  last_finalization_error?: {
    type: string;
    code?: string;
    message?: string;
    param?: string;
  };
  latest_revision?: Expandable<string>;
  lines: {
    object: 'list';
    data: InvoiceLineItem[];
    has_more: boolean;
    url: string;
  };
  next_payment_attempt?: Timestamp;
  number?: string;
  on_behalf_of?: Expandable<string>;
  paid: boolean;
  paid_out_of_band: boolean;
  payment_intent?: Expandable<string>;
  payment_settings: InvoicePaymentSettings;
  period_end: Timestamp;
  period_start: Timestamp;
  post_payment_credit_notes_amount: number;
  pre_payment_credit_notes_amount: number;
  quote?: Expandable<string>;
  receipt_number?: string;
  rendering?: InvoiceRenderingOptions;
  shipping_cost?: {
    amount_subtotal: number;
    amount_tax: number;
    amount_total: number;
    shipping_rate?: Expandable<string>;
  };
  shipping_details?: {
    address: Address;
    name: string;
    phone?: string;
  };
  starting_balance: number;
  statement_descriptor?: string;
  status?: InvoiceStatus;
  status_transitions: {
    finalized_at?: Timestamp;
    marked_uncollectible_at?: Timestamp;
    paid_at?: Timestamp;
    voided_at?: Timestamp;
  };
  subscription?: Expandable<string>;
  subscription_details?: {
    metadata?: Metadata;
  };
  subscription_proration_date?: Timestamp;
  subtotal: number;
  subtotal_excluding_tax?: number;
  tax?: number;
  test_clock?: Expandable<string>;
  threshold_reason?: InvoiceThresholdReason;
  total: number;
  total_discount_amounts?: {
    amount: number;
    discount: Expandable<Discount>;
  }[];
  total_excluding_tax?: number;
  total_tax_amounts?: {
    amount: number;
    inclusive: boolean;
    tax_rate: Expandable<TaxRate>;
    taxability_reason?: string;
    taxable_amount?: number;
  }[];
  transfer_data?: {
    amount?: number;
    destination: Expandable<string>;
  };
  webhooks_delivered_at?: Timestamp;
}

/**
 * Finalize Invoice request parameters
 */
export interface FinalizeInvoiceRequest {
  auto_advance?: boolean;
}

/**
 * Pay Invoice request parameters
 */
export interface PayInvoiceRequest {
  forgive?: boolean;
  mandate?: string;
  off_session?: boolean;
  paid_out_of_band?: boolean;
  payment_method?: string;
  source?: string;
}

/**
 * Void Invoice request parameters
 */
export interface VoidInvoiceRequest {
  // No parameters currently
}

/**
 * Mark Invoice Uncollectible request parameters
 */
export interface MarkUncollectibleRequest {
  // No parameters currently
}

/**
 * Upcoming Invoice request parameters
 */
export interface UpcomingInvoiceRequest {
  customer?: string;
  subscription?: string;
  coupon?: string;
  currency?: Currency;
  subscription_items?: {
    id?: string;
    price?: string;
    quantity?: number;
    deleted?: boolean;
  }[];
  subscription_billing_cycle_anchor?: Timestamp | 'now' | 'unchanged';
  subscription_cancel_at?: Timestamp | 'now';
  subscription_cancel_at_period_end?: boolean;
  subscription_cancel_now?: boolean;
  subscription_proration_behavior?: 'create_prorations' | 'none' | 'always_invoice';
  subscription_proration_date?: Timestamp;
  subscription_start_date?: Timestamp;
  subscription_trial_end?: Timestamp | 'now';
  subscription_trial_from_plan?: boolean;
}

/**
 * List Invoices parameters
 */
export interface ListInvoicesParams extends PaginationParams {
  customer?: string;
  subscription?: string;
  status?: InvoiceStatus;
  collection_method?: InvoiceCollectionMethod;
  created?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
  due_date?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
}

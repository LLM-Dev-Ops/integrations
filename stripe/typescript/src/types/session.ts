/**
 * Checkout Session and Billing Portal types as per Stripe API specification
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
import type { Discount } from './subscription.js';

/**
 * Checkout Session mode
 */
export type CheckoutMode = 'payment' | 'subscription' | 'setup';

/**
 * Checkout Session status
 */
export type CheckoutSessionStatus = 'open' | 'complete' | 'expired';

/**
 * Checkout Session payment status
 */
export type CheckoutPaymentStatus = 'paid' | 'unpaid' | 'no_payment_required';

/**
 * Checkout Session submit type
 */
export type CheckoutSubmitType = 'auto' | 'pay' | 'book' | 'donate';

/**
 * Checkout Session UI mode
 */
export type CheckoutUIMode = 'hosted' | 'embedded';

/**
 * Checkout Session billing address collection
 */
export type BillingAddressCollection = 'auto' | 'required';

/**
 * Customer creation mode
 */
export type CustomerCreation = 'always' | 'if_required';

/**
 * Checkout line item
 */
export interface CheckoutLineItem {
  price: string;
  quantity: number;
  adjustable_quantity?: {
    enabled: boolean;
    maximum?: number;
    minimum?: number;
  };
  dynamic_tax_rates?: string[];
  tax_rates?: string[];
}

/**
 * Checkout Session shipping address collection
 */
export interface ShippingAddressCollection {
  allowed_countries: string[];
}

/**
 * Checkout Session consent collection
 */
export interface ConsentCollection {
  payment_method_reuse_agreement?: {
    position: 'auto' | 'hidden';
  };
  promotions?: 'auto' | 'none';
  terms_of_service?: 'none' | 'required';
}

/**
 * Checkout Session customer details
 */
export interface CustomerDetails {
  address?: Address;
  email?: string;
  name?: string;
  phone?: string;
  tax_exempt?: 'none' | 'exempt' | 'reverse';
  tax_ids?: {
    type: string;
    value: string;
  }[];
}

/**
 * Checkout Session shipping details
 */
export interface ShippingDetails {
  address: Address;
  name: string;
}

/**
 * Checkout Session phone number collection
 */
export interface PhoneNumberCollection {
  enabled: boolean;
}

/**
 * Checkout Session tax ID collection
 */
export interface TaxIdCollection {
  enabled: boolean;
}

/**
 * Checkout Session subscription data
 */
export interface SubscriptionData {
  trial_period_days?: number;
  trial_end?: Timestamp;
  metadata?: Metadata;
  description?: string;
  application_fee_percent?: number;
  billing_cycle_anchor?: Timestamp;
}

/**
 * Checkout Session payment intent data
 */
export interface PaymentIntentData {
  capture_method?: 'automatic' | 'manual';
  description?: string;
  metadata?: Metadata;
  receipt_email?: string;
  setup_future_usage?: 'on_session' | 'off_session';
  shipping?: {
    address: Address;
    name: string;
    phone?: string;
  };
  statement_descriptor?: string;
  statement_descriptor_suffix?: string;
  transfer_data?: {
    amount?: number;
    destination: string;
  };
  transfer_group?: string;
}

/**
 * Checkout Session object
 */
export interface CheckoutSession extends StripeObject {
  object: 'checkout.session';
  after_expiration?: {
    recovery?: {
      allow_promotion_codes: boolean;
      enabled: boolean;
      expires_at?: Timestamp;
      url?: string;
    };
  };
  allow_promotion_codes?: boolean;
  amount_subtotal?: number;
  amount_total?: number;
  automatic_tax: {
    enabled: boolean;
    status?: 'complete' | 'failed' | 'requires_location_inputs';
  };
  billing_address_collection?: BillingAddressCollection;
  cancel_url?: string;
  client_reference_id?: string;
  client_secret?: string;
  consent?: {
    promotions?: 'opt_in' | 'opt_out';
    terms_of_service?: 'accepted';
  };
  consent_collection?: ConsentCollection;
  currency?: Currency;
  custom_fields?: {
    dropdown?: {
      options: { label: string; value: string }[];
      value?: string;
    };
    key: string;
    label: { custom?: string; type: 'custom' };
    numeric?: { maximum_length?: number; minimum_length?: number; value?: string };
    optional: boolean;
    text?: { maximum_length?: number; minimum_length?: number; value?: string };
    type: 'dropdown' | 'numeric' | 'text';
  }[];
  custom_text?: {
    after_submit?: { message: string };
    shipping_address?: { message: string };
    submit?: { message: string };
    terms_of_service_acceptance?: { message: string };
  };
  customer?: Expandable<string>;
  customer_creation?: CustomerCreation;
  customer_details?: CustomerDetails;
  customer_email?: string;
  expires_at: Timestamp;
  invoice?: Expandable<string>;
  invoice_creation?: {
    enabled: boolean;
    invoice_data?: {
      account_tax_ids?: Expandable<string>[];
      custom_fields?: { name: string; value: string }[];
      description?: string;
      footer?: string;
      metadata?: Metadata;
      rendering_options?: { amount_tax_display?: 'exclude_tax' | 'include_inclusive_tax' };
    };
  };
  line_items?: {
    object: 'list';
    data: {
      id: string;
      object: 'item';
      amount_discount: number;
      amount_subtotal: number;
      amount_tax: number;
      amount_total: number;
      currency: Currency;
      description: string;
      price: {
        id: string;
        currency: Currency;
        unit_amount?: number;
      };
      quantity?: number;
    }[];
    has_more: boolean;
    url: string;
  };
  locale?: string;
  mode: CheckoutMode;
  payment_intent?: Expandable<string>;
  payment_link?: Expandable<string>;
  payment_method_collection?: 'always' | 'if_required';
  payment_method_configuration_details?: {
    id: string;
    parent?: string;
  };
  payment_method_options?: Record<string, unknown>;
  payment_method_types?: string[];
  payment_status: CheckoutPaymentStatus;
  phone_number_collection?: PhoneNumberCollection;
  recovered_from?: string;
  setup_intent?: Expandable<string>;
  shipping_address_collection?: ShippingAddressCollection;
  shipping_cost?: {
    amount_subtotal: number;
    amount_tax: number;
    amount_total: number;
    shipping_rate?: Expandable<string>;
  };
  shipping_details?: ShippingDetails;
  shipping_options?: {
    shipping_amount: number;
    shipping_rate: Expandable<string>;
  }[];
  status?: CheckoutSessionStatus;
  submit_type?: CheckoutSubmitType;
  subscription?: Expandable<string>;
  success_url?: string;
  tax_id_collection?: TaxIdCollection;
  total_details?: {
    amount_discount: number;
    amount_shipping?: number;
    amount_tax: number;
  };
  ui_mode?: CheckoutUIMode;
  url?: string;
}

/**
 * Create Checkout Session request parameters
 */
export interface CreateCheckoutSessionRequest {
  mode: CheckoutMode;
  success_url?: string;
  cancel_url?: string;
  return_url?: string;
  ui_mode?: CheckoutUIMode;
  customer?: string;
  customer_email?: string;
  customer_creation?: CustomerCreation;
  client_reference_id?: string;
  line_items?: CheckoutLineItem[];
  metadata?: Metadata;
  allow_promotion_codes?: boolean;
  automatic_tax?: {
    enabled: boolean;
  };
  billing_address_collection?: BillingAddressCollection;
  consent_collection?: ConsentCollection;
  discounts?: {
    coupon?: string;
    promotion_code?: string;
  }[];
  expires_at?: Timestamp;
  locale?: string;
  payment_intent_data?: PaymentIntentData;
  payment_method_collection?: 'always' | 'if_required';
  payment_method_types?: string[];
  phone_number_collection?: PhoneNumberCollection;
  shipping_address_collection?: ShippingAddressCollection;
  shipping_options?: {
    shipping_rate?: string;
    shipping_rate_data?: {
      display_name: string;
      type: 'fixed_amount';
      fixed_amount: {
        amount: number;
        currency: Currency;
      };
      delivery_estimate?: {
        minimum?: { unit: 'business_day' | 'day' | 'hour' | 'week' | 'month'; value: number };
        maximum?: { unit: 'business_day' | 'day' | 'hour' | 'week' | 'month'; value: number };
      };
    };
  }[];
  submit_type?: CheckoutSubmitType;
  subscription_data?: SubscriptionData;
  tax_id_collection?: TaxIdCollection;
}

/**
 * List Checkout Sessions parameters
 */
export interface ListCheckoutSessionsParams extends PaginationParams {
  customer?: string;
  customer_details?: {
    email: string;
  };
  payment_intent?: string;
  payment_link?: string;
  subscription?: string;
  status?: CheckoutSessionStatus;
  created?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
}

/**
 * Expire Checkout Session request parameters
 */
export interface ExpireCheckoutSessionRequest {
  // No parameters currently
}

/**
 * Billing Portal Session object
 */
export interface BillingPortalSession extends StripeObject {
  object: 'billing_portal.session';
  configuration: Expandable<string>;
  customer: string;
  flow?: {
    type: 'payment_method_update' | 'subscription_cancel' | 'subscription_update' | 'subscription_update_confirm';
    after_completion?: {
      type: 'portal_homepage' | 'redirect';
      redirect?: { return_url: string };
    };
    subscription_cancel?: {
      retention?: {
        type: 'coupon_offer';
        coupon_offer: { coupon: string };
      };
      subscription: string;
    };
    subscription_update?: {
      subscription: string;
    };
    subscription_update_confirm?: {
      discounts?: { coupon?: string; promotion_code?: string }[];
      items: { id: string; price: string; quantity?: number }[];
      subscription: string;
    };
  };
  locale?: string;
  on_behalf_of?: string;
  return_url?: string;
  url: string;
}

/**
 * Create Billing Portal Session request parameters
 */
export interface CreateBillingPortalSessionRequest {
  customer: string;
  return_url?: string;
  configuration?: string;
  locale?: string;
  on_behalf_of?: string;
  flow_data?: {
    type: 'payment_method_update' | 'subscription_cancel' | 'subscription_update' | 'subscription_update_confirm';
    after_completion?: {
      type: 'portal_homepage' | 'redirect';
      redirect?: { return_url: string };
    };
    subscription_cancel?: {
      retention?: {
        type: 'coupon_offer';
        coupon_offer: { coupon: string };
      };
      subscription: string;
    };
    subscription_update?: {
      subscription: string;
    };
    subscription_update_confirm?: {
      discounts?: { coupon?: string; promotion_code?: string }[];
      items: { id?: string; price: string; quantity?: number }[];
      subscription: string;
    };
  };
}

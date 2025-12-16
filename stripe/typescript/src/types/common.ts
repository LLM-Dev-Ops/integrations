/**
 * Common types used across the Stripe integration module
 */

/**
 * Supported currencies in ISO 4217 format
 */
export type Currency =
  | 'usd'
  | 'eur'
  | 'gbp'
  | 'jpy'
  | 'cad'
  | 'aud'
  | 'chf'
  | 'cny'
  | 'inr'
  | 'brl'
  | 'mxn'
  | 'sgd'
  | 'hkd'
  | 'nzd'
  | 'sek'
  | 'nok'
  | 'dkk'
  | 'pln'
  | 'czk'
  | 'thb'
  | 'krw';

/**
 * Metadata object for Stripe resources
 */
export type Metadata = Record<string, string>;

/**
 * Pagination parameters for list requests
 */
export interface PaginationParams {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
}

/**
 * Paginated list response
 */
export interface PaginatedList<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  url: string;
}

/**
 * Timestamp type (Unix timestamp in seconds)
 */
export type Timestamp = number;

/**
 * Address type for Stripe resources
 */
export interface Address {
  city?: string;
  country?: string;
  line1?: string;
  line2?: string;
  postal_code?: string;
  state?: string;
}

/**
 * Billing details type
 */
export interface BillingDetails {
  address?: Address;
  email?: string;
  name?: string;
  phone?: string;
}

/**
 * Shipping details type
 */
export interface Shipping {
  address: Address;
  name: string;
  phone?: string;
  carrier?: string;
  tracking_number?: string;
}

/**
 * Payment method types supported by Stripe
 */
export type PaymentMethodType =
  | 'card'
  | 'card_present'
  | 'sepa_debit'
  | 'bancontact'
  | 'ideal'
  | 'sofort'
  | 'giropay'
  | 'eps'
  | 'p24'
  | 'alipay'
  | 'wechat_pay'
  | 'au_becs_debit'
  | 'bacs_debit'
  | 'us_bank_account'
  | 'acss_debit'
  | 'klarna'
  | 'affirm'
  | 'afterpay_clearpay'
  | 'link';

/**
 * Base Stripe object interface
 */
export interface StripeObject {
  id: string;
  object: string;
  livemode: boolean;
  created?: Timestamp;
  metadata?: Metadata;
}

/**
 * Request options for API calls
 */
export interface RequestOptions {
  idempotencyKey?: string;
  stripeAccount?: string;
  timeout?: number;
}

/**
 * Expandable field type
 */
export type Expandable<T> = string | T;

/**
 * Deleted object response
 */
export interface DeletedObject {
  id: string;
  object: string;
  deleted: true;
}

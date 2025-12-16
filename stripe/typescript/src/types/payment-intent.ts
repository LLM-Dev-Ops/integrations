/**
 * Payment Intent types as per Stripe API specification
 */
import type {
  Currency,
  Metadata,
  Timestamp,
  BillingDetails,
  Shipping,
  PaymentMethodType,
  StripeObject,
  PaginationParams,
  Expandable,
} from './common.js';

/**
 * Payment Intent status values
 */
export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded';

/**
 * Capture method for payment intents
 */
export type CaptureMethod = 'automatic' | 'manual' | 'automatic_async';

/**
 * Confirmation method for payment intents
 */
export type ConfirmationMethod = 'automatic' | 'manual';

/**
 * Cancellation reason for payment intents
 */
export type CancellationReason =
  | 'duplicate'
  | 'fraudulent'
  | 'requested_by_customer'
  | 'abandoned';

/**
 * Setup future usage setting
 */
export type SetupFutureUsage = 'on_session' | 'off_session';

/**
 * Payment Intent object
 */
export interface PaymentIntent extends StripeObject {
  object: 'payment_intent';
  amount: number;
  amount_capturable: number;
  amount_received: number;
  application?: string;
  application_fee_amount?: number;
  automatic_payment_methods?: {
    enabled: boolean;
    allow_redirects?: 'always' | 'never';
  };
  canceled_at?: Timestamp;
  cancellation_reason?: CancellationReason;
  capture_method: CaptureMethod;
  client_secret?: string;
  confirmation_method: ConfirmationMethod;
  currency: Currency;
  customer?: Expandable<string>;
  description?: string;
  invoice?: Expandable<string>;
  last_payment_error?: PaymentError;
  latest_charge?: Expandable<string>;
  next_action?: NextAction;
  on_behalf_of?: string;
  payment_method?: Expandable<string>;
  payment_method_options?: PaymentMethodOptions;
  payment_method_types: PaymentMethodType[];
  processing?: ProcessingInfo;
  receipt_email?: string;
  setup_future_usage?: SetupFutureUsage;
  shipping?: Shipping;
  source?: string;
  statement_descriptor?: string;
  statement_descriptor_suffix?: string;
  status: PaymentIntentStatus;
  transfer_data?: TransferData;
  transfer_group?: string;
}

/**
 * Payment error details
 */
export interface PaymentError {
  type: string;
  code?: string;
  decline_code?: string;
  message?: string;
  param?: string;
  payment_method?: {
    id: string;
    type: PaymentMethodType;
  };
}

/**
 * Next action required for payment completion
 */
export interface NextAction {
  type: string;
  redirect_to_url?: {
    url: string;
    return_url: string;
  };
  use_stripe_sdk?: Record<string, unknown>;
}

/**
 * Payment method options
 */
export interface PaymentMethodOptions {
  card?: {
    capture_method?: CaptureMethod;
    installments?: {
      enabled: boolean;
    };
    mandate_options?: Record<string, unknown>;
    network?: string;
    request_three_d_secure?: 'any' | 'automatic' | 'challenge';
  };
}

/**
 * Processing information
 */
export interface ProcessingInfo {
  card?: {
    customer_notification?: string;
  };
}

/**
 * Transfer data for destination charges
 */
export interface TransferData {
  destination: string;
  amount?: number;
}

/**
 * Create Payment Intent request parameters
 */
export interface CreatePaymentIntentRequest {
  amount: number;
  currency: Currency;
  customer?: string;
  description?: string;
  metadata?: Metadata;
  payment_method?: string;
  payment_method_types?: PaymentMethodType[];
  automatic_payment_methods?: {
    enabled: boolean;
    allow_redirects?: 'always' | 'never';
  };
  capture_method?: CaptureMethod;
  confirmation_method?: ConfirmationMethod;
  confirm?: boolean;
  receipt_email?: string;
  setup_future_usage?: SetupFutureUsage;
  shipping?: Shipping;
  statement_descriptor?: string;
  statement_descriptor_suffix?: string;
  transfer_data?: TransferData;
  transfer_group?: string;
  off_session?: boolean;
  application_fee_amount?: number;
}

/**
 * Update Payment Intent request parameters
 */
export interface UpdatePaymentIntentRequest {
  amount?: number;
  currency?: Currency;
  customer?: string;
  description?: string;
  metadata?: Metadata;
  payment_method?: string;
  payment_method_types?: PaymentMethodType[];
  receipt_email?: string;
  setup_future_usage?: SetupFutureUsage;
  shipping?: Shipping;
  statement_descriptor?: string;
  statement_descriptor_suffix?: string;
  transfer_data?: TransferData;
  transfer_group?: string;
}

/**
 * Confirm Payment Intent request parameters
 */
export interface ConfirmPaymentIntentRequest {
  payment_method?: string;
  receipt_email?: string;
  return_url?: string;
  setup_future_usage?: SetupFutureUsage;
  shipping?: Shipping;
  off_session?: boolean;
  mandate_data?: {
    customer_acceptance: {
      type: 'online' | 'offline';
      accepted_at?: Timestamp;
      online?: {
        ip_address: string;
        user_agent: string;
      };
    };
  };
}

/**
 * Capture Payment Intent request parameters
 */
export interface CapturePaymentIntentRequest {
  amount_to_capture?: number;
  application_fee_amount?: number;
  statement_descriptor?: string;
  statement_descriptor_suffix?: string;
  transfer_data?: TransferData;
}

/**
 * Cancel Payment Intent request parameters
 */
export interface CancelPaymentIntentRequest {
  cancellation_reason?: CancellationReason;
}

/**
 * List Payment Intents parameters
 */
export interface ListPaymentIntentsParams extends PaginationParams {
  customer?: string;
  created?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
}

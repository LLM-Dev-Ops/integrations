/**
 * Customer types as per Stripe API specification
 */
import type {
  Currency,
  Metadata,
  Timestamp,
  StripeObject,
  PaginationParams,
  Expandable,
  Address,
  DeletedObject,
} from './common.js';
import type { Discount } from './subscription.js';

/**
 * Customer tax exempt status
 */
export type CustomerTaxExempt = 'none' | 'exempt' | 'reverse';

/**
 * Customer invoice settings
 */
export interface CustomerInvoiceSettings {
  custom_fields?: {
    name: string;
    value: string;
  }[];
  default_payment_method?: Expandable<string>;
  footer?: string;
  rendering_options?: {
    amount_tax_display?: 'exclude_tax' | 'include_inclusive_tax';
  };
}

/**
 * Customer shipping address
 */
export interface CustomerShipping {
  address: Address;
  name: string;
  phone?: string;
}

/**
 * Customer tax ID
 */
export interface CustomerTaxId extends StripeObject {
  object: 'tax_id';
  country?: string;
  customer?: Expandable<string>;
  type: string;
  value: string;
  verification?: {
    status: 'pending' | 'verified' | 'unverified' | 'unavailable';
    verified_address?: string;
    verified_name?: string;
  };
}

/**
 * Customer object
 */
export interface Customer extends StripeObject {
  object: 'customer';
  address?: Address;
  balance: number;
  cash_balance?: {
    object: 'cash_balance';
    available?: Record<Currency, number>;
    customer: string;
    settings: {
      reconciliation_mode: 'automatic' | 'manual';
    };
  };
  currency?: Currency;
  default_source?: Expandable<string>;
  delinquent?: boolean;
  description?: string;
  discount?: Discount;
  email?: string;
  invoice_credit_balance?: Record<Currency, number>;
  invoice_prefix?: string;
  invoice_settings: CustomerInvoiceSettings;
  name?: string;
  next_invoice_sequence?: number;
  phone?: string;
  preferred_locales?: string[];
  shipping?: CustomerShipping;
  sources?: {
    object: 'list';
    data: Record<string, unknown>[];
    has_more: boolean;
    url: string;
  };
  subscriptions?: {
    object: 'list';
    data: Record<string, unknown>[];
    has_more: boolean;
    url: string;
  };
  tax?: {
    automatic_tax: 'supported' | 'not_collecting' | 'unrecognized_location' | 'failed';
    ip_address?: string;
    location?: {
      country: string;
      source: 'ip_address' | 'payment_method' | 'billing_address' | 'shipping_destination';
      state?: string;
    };
  };
  tax_exempt?: CustomerTaxExempt;
  tax_ids?: {
    object: 'list';
    data: CustomerTaxId[];
    has_more: boolean;
    url: string;
  };
  test_clock?: Expandable<string>;
}

/**
 * Deleted Customer object
 */
export interface DeletedCustomer extends DeletedObject {
  object: 'customer';
}

/**
 * Create Customer request parameters
 */
export interface CreateCustomerRequest {
  address?: Address;
  balance?: number;
  cash_balance?: {
    settings?: {
      reconciliation_mode?: 'automatic' | 'manual';
    };
  };
  coupon?: string;
  description?: string;
  email?: string;
  invoice_prefix?: string;
  invoice_settings?: {
    custom_fields?: {
      name: string;
      value: string;
    }[];
    default_payment_method?: string;
    footer?: string;
    rendering_options?: {
      amount_tax_display?: 'exclude_tax' | 'include_inclusive_tax';
    };
  };
  metadata?: Metadata;
  name?: string;
  next_invoice_sequence?: number;
  payment_method?: string;
  phone?: string;
  preferred_locales?: string[];
  promotion_code?: string;
  shipping?: CustomerShipping;
  source?: string;
  tax?: {
    ip_address?: string;
  };
  tax_exempt?: CustomerTaxExempt;
  tax_id_data?: {
    type: string;
    value: string;
  }[];
  test_clock?: string;
}

/**
 * Update Customer request parameters
 */
export interface UpdateCustomerRequest {
  address?: Address | '';
  balance?: number;
  cash_balance?: {
    settings?: {
      reconciliation_mode?: 'automatic' | 'manual';
    };
  };
  coupon?: string | '';
  default_source?: string;
  description?: string | '';
  email?: string | '';
  invoice_prefix?: string;
  invoice_settings?: {
    custom_fields?: {
      name: string;
      value: string;
    }[] | '';
    default_payment_method?: string;
    footer?: string | '';
    rendering_options?: {
      amount_tax_display?: 'exclude_tax' | 'include_inclusive_tax';
    } | '';
  };
  metadata?: Metadata;
  name?: string | '';
  next_invoice_sequence?: number;
  phone?: string | '';
  preferred_locales?: string[];
  promotion_code?: string;
  shipping?: CustomerShipping | '';
  source?: string;
  tax?: {
    ip_address?: string | '';
  };
  tax_exempt?: CustomerTaxExempt | '';
}

/**
 * List Customers parameters
 */
export interface ListCustomersParams extends PaginationParams {
  email?: string;
  created?: {
    gt?: Timestamp;
    gte?: Timestamp;
    lt?: Timestamp;
    lte?: Timestamp;
  };
  test_clock?: string;
}

/**
 * Search Customers parameters
 */
export interface SearchCustomersParams {
  query: string;
  limit?: number;
  page?: string;
}

/**
 * Search Customers response
 */
export interface SearchCustomersResponse {
  object: 'search_result';
  data: Customer[];
  has_more: boolean;
  next_page?: string;
  total_count?: number;
  url: string;
}

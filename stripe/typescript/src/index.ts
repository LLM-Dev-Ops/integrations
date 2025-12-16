/**
 * @integrations/stripe
 *
 * Production-ready TypeScript client for the Stripe API
 *
 * @example
 * ```typescript
 * import { createClient, createClientFromEnv } from '@integrations/stripe';
 *
 * // Create client with explicit configuration
 * const client = createClient({
 *   apiKey: 'sk_test_...',
 *   webhookSecret: 'whsec_...',
 * });
 *
 * // Or create from environment variables
 * const client = createClientFromEnv();
 *
 * // Create a payment intent
 * const paymentIntent = await client.paymentIntents.create({
 *   amount: 1000,
 *   currency: 'usd',
 * });
 * ```
 */

// Client exports
export {
  createClient,
  createClientFromEnv,
  builder,
  StripeClientBuilder,
  StripeClientImpl,
  type StripeClient,
  type SessionsAPI,
  type HealthCheckResult,
} from './client/index.js';

// Configuration exports
export {
  validateConfig,
  createConfigFromEnv,
  StripeConfigBuilder,
  DEFAULT_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_IDEMPOTENCY_CACHE_TTL,
  DEFAULT_IDEMPOTENCY_CACHE_SIZE,
  DEFAULT_WEBHOOK_TOLERANCE,
  type StripeConfig,
  type NormalizedStripeConfig,
  type SimulationMode,
  type IdempotencyStrategy,
  type CircuitBreakerConfig,
  type IdempotencyConfig,
  type SimulationConfig,
} from './config/index.js';

// Error exports
export { StripeError, type StripeErrorParams } from './errors/error.js';
export {
  ConfigurationError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NetworkError,
  ServerError,
  NotFoundError,
  CardError,
  IdempotencyError,
  WebhookSignatureError,
  WebhookProcessingError,
  SimulationError,
  TimeoutError,
} from './errors/categories.js';

// Type exports
export type {
  // Common types
  Currency,
  Metadata,
  PaginationParams,
  PaginatedList,
  Timestamp,
  Address,
  BillingDetails,
  Shipping,
  PaymentMethodType,
  StripeObject,
  RequestOptions,
  Expandable,
  DeletedObject,

  // Payment Intent types
  PaymentIntentStatus,
  CaptureMethod,
  ConfirmationMethod,
  CancellationReason,
  SetupFutureUsage,
  PaymentIntent,
  PaymentError,
  NextAction,
  PaymentMethodOptions,
  CreatePaymentIntentRequest,
  UpdatePaymentIntentRequest,
  ConfirmPaymentIntentRequest,
  CapturePaymentIntentRequest,
  CancelPaymentIntentRequest,
  ListPaymentIntentsParams,

  // Subscription types
  SubscriptionStatus,
  CollectionMethod,
  ProrationBehavior,
  BillingCycleAnchor,
  PaymentBehavior,
  SubscriptionItem,
  Price,
  TaxRate,
  Subscription,
  Discount,
  Coupon,
  PaymentSettings,
  SubscriptionItemParams,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  CancelSubscriptionRequest,
  ListSubscriptionsParams,

  // Invoice types
  InvoiceStatus,
  InvoiceBillingReason,
  InvoiceCollectionMethod,
  InvoiceLineItem,
  InvoicePaymentSettings,
  Invoice,
  FinalizeInvoiceRequest,
  PayInvoiceRequest,
  UpcomingInvoiceRequest,
  ListInvoicesParams,

  // Webhook types
  WebhookEventType,
  WebhookEvent,
  WebhookPayload,
  WebhookSignatureHeader,
  WebhookHandler,
  WebhookHandlerEntry,

  // Session types
  CheckoutMode,
  CheckoutSessionStatus,
  CheckoutPaymentStatus,
  CheckoutLineItem,
  CheckoutSession,
  CreateCheckoutSessionRequest,
  ListCheckoutSessionsParams,
  BillingPortalSession,
  CreateBillingPortalSessionRequest,

  // Customer types
  CustomerTaxExempt,
  CustomerInvoiceSettings,
  Customer,
  DeletedCustomer,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  ListCustomersParams,
  SearchCustomersParams,
  SearchCustomersResponse,
} from './types/index.js';

export { EventTypes } from './types/index.js';

// Service exports
export type {
  PaymentIntentsService,
  SubscriptionsService,
  InvoicesService,
  WebhookService,
  CheckoutSessionsService,
  BillingPortalSessionsService,
  CustomersService,
} from './services/index.js';

export {
  WebhookHandlerRegistry,
  parseSignatureHeader,
  computeSignature,
  verifySignature,
  generateSignatureHeader,
} from './services/index.js';

// Auth exports
export type { AuthManager } from './auth/index.js';
export { BearerAuthManager, createAuthManager, SecretString } from './auth/index.js';

// Transport exports
export type { HttpRequestOptions, HttpTransport } from './transport/index.js';
export { FetchHttpTransport, createHttpTransport } from './transport/index.js';

// Idempotency exports
export type { IdempotencyManager, IdempotencyCacheStats } from './idempotency/index.js';
export {
  DefaultIdempotencyManager,
  createIdempotencyManager,
  withIdempotency,
} from './idempotency/index.js';

// Resilience exports
export type {
  RetryConfig,
  CircuitState,
  ResilienceConfig,
  ResilienceOrchestrator,
} from './resilience/index.js';
export {
  RetryExecutor,
  createDefaultRetryConfig,
  CircuitBreaker,
  CircuitOpenError,
  createDefaultCircuitBreakerConfig,
  DefaultResilienceOrchestrator,
  PassthroughResilienceOrchestrator,
  createDefaultResilienceConfig,
} from './resilience/index.js';

// Simulation exports
export type { RecordedOperation, RecordingStorage, ReplayMatch } from './simulation/index.js';
export {
  SimulationRecorder,
  SimulationReplayer,
  FileRecordingStorage,
  InMemoryRecordingStorage,
  mockPaymentIntent,
  mockSubscription,
  mockInvoice,
  mockWebhookEvent,
  mockPaymentIntentSucceededEvent,
  mockPaymentIntentFailedEvent,
  mockSubscriptionCreatedEvent,
  mockSubscriptionDeletedEvent,
  mockInvoicePaidEvent,
  mockInvoicePaymentFailedEvent,
} from './simulation/index.js';

// Version
export const VERSION = '1.0.0';

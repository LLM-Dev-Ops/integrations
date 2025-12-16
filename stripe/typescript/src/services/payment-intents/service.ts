/**
 * Payment Intents service implementation
 */
import type { HttpTransport, HttpRequestOptions } from '../../transport/http.js';
import type { IdempotencyManager } from '../../idempotency/manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  PaymentIntent,
  CreatePaymentIntentRequest,
  UpdatePaymentIntentRequest,
  ConfirmPaymentIntentRequest,
  CapturePaymentIntentRequest,
  CancelPaymentIntentRequest,
  ListPaymentIntentsParams,
  PaginatedList,
  RequestOptions,
} from '../../types/index.js';

// Helper function to convert typed objects to Record<string, unknown>
function toBody<T extends object>(obj: T): Record<string, unknown> {
  return obj as unknown as Record<string, unknown>;
}

/**
 * Payment Intents service interface
 */
export interface PaymentIntentsService {
  /**
   * Creates a new payment intent
   */
  create(request: CreatePaymentIntentRequest, options?: RequestOptions): Promise<PaymentIntent>;

  /**
   * Retrieves an existing payment intent
   */
  retrieve(id: string, options?: RequestOptions): Promise<PaymentIntent>;

  /**
   * Updates an existing payment intent
   */
  update(
    id: string,
    request: UpdatePaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent>;

  /**
   * Confirms a payment intent
   */
  confirm(
    id: string,
    request?: ConfirmPaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent>;

  /**
   * Captures a payment intent
   */
  capture(
    id: string,
    request?: CapturePaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent>;

  /**
   * Cancels a payment intent
   */
  cancel(
    id: string,
    request?: CancelPaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent>;

  /**
   * Lists payment intents
   */
  list(params?: ListPaymentIntentsParams, options?: RequestOptions): Promise<PaginatedList<PaymentIntent>>;
}

/**
 * Payment Intents service implementation
 */
export class PaymentIntentsServiceImpl implements PaymentIntentsService {
  private readonly transport: HttpTransport;
  private readonly idempotency: IdempotencyManager;
  private readonly resilience: ResilienceOrchestrator;

  constructor(
    transport: HttpTransport,
    idempotency: IdempotencyManager,
    resilience: ResilienceOrchestrator
  ) {
    this.transport = transport;
    this.idempotency = idempotency;
    this.resilience = resilience;
  }

  /**
   * Creates a new payment intent
   */
  async create(
    request: CreatePaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent> {
    const idempotencyKey =
      options?.idempotencyKey ?? this.idempotency.generateKey('payment_intents.create', toBody(request));

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<PaymentIntent>('/payment_intents', toBody(request), httpOptions)
    );
  }

  /**
   * Retrieves an existing payment intent
   */
  async retrieve(id: string, options?: RequestOptions): Promise<PaymentIntent> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<PaymentIntent>(`/payment_intents/${id}`, undefined, httpOptions)
    );
  }

  /**
   * Updates an existing payment intent
   */
  async update(
    id: string,
    request: UpdatePaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('payment_intents.update', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<PaymentIntent>(
        `/payment_intents/${id}`,
        request as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Confirms a payment intent
   */
  async confirm(
    id: string,
    request?: ConfirmPaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('payment_intents.confirm', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<PaymentIntent>(
        `/payment_intents/${id}/confirm`,
        (request ?? {}) as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Captures a payment intent
   */
  async capture(
    id: string,
    request?: CapturePaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('payment_intents.capture', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<PaymentIntent>(
        `/payment_intents/${id}/capture`,
        (request ?? {}) as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Cancels a payment intent
   */
  async cancel(
    id: string,
    request?: CancelPaymentIntentRequest,
    options?: RequestOptions
  ): Promise<PaymentIntent> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('payment_intents.cancel', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<PaymentIntent>(
        `/payment_intents/${id}/cancel`,
        (request ?? {}) as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Lists payment intents
   */
  async list(
    params?: ListPaymentIntentsParams,
    options?: RequestOptions
  ): Promise<PaginatedList<PaymentIntent>> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<PaginatedList<PaymentIntent>>(
        '/payment_intents',
        params as Record<string, unknown>,
        httpOptions
      )
    );
  }
}

/**
 * Subscriptions service implementation
 */
import type { HttpTransport, HttpRequestOptions } from '../../transport/http.js';
import type { IdempotencyManager } from '../../idempotency/manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  Subscription,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  CancelSubscriptionRequest,
  ListSubscriptionsParams,
  PaginatedList,
  RequestOptions,
} from '../../types/index.js';

// Helper function to convert typed objects to Record<string, unknown>
function toBody<T extends object>(obj: T): Record<string, unknown> {
  return obj as unknown as Record<string, unknown>;
}

/**
 * Subscriptions service interface
 */
export interface SubscriptionsService {
  /**
   * Creates a new subscription
   */
  create(request: CreateSubscriptionRequest, options?: RequestOptions): Promise<Subscription>;

  /**
   * Retrieves an existing subscription
   */
  retrieve(id: string, options?: RequestOptions): Promise<Subscription>;

  /**
   * Updates an existing subscription
   */
  update(
    id: string,
    request: UpdateSubscriptionRequest,
    options?: RequestOptions
  ): Promise<Subscription>;

  /**
   * Cancels a subscription
   */
  cancel(
    id: string,
    atPeriodEnd?: boolean,
    options?: RequestOptions
  ): Promise<Subscription>;

  /**
   * Cancels a subscription with detailed options
   */
  cancelWithDetails(
    id: string,
    request?: CancelSubscriptionRequest,
    options?: RequestOptions
  ): Promise<Subscription>;

  /**
   * Pauses a subscription
   */
  pause(
    id: string,
    resumesAt?: number,
    options?: RequestOptions
  ): Promise<Subscription>;

  /**
   * Resumes a paused subscription
   */
  resume(id: string, options?: RequestOptions): Promise<Subscription>;

  /**
   * Lists subscriptions
   */
  list(params?: ListSubscriptionsParams, options?: RequestOptions): Promise<PaginatedList<Subscription>>;

  /**
   * Deletes the discount on a subscription
   */
  deleteDiscount(id: string, options?: RequestOptions): Promise<{ id: string; deleted: true }>;
}

/**
 * Subscriptions service implementation
 */
export class SubscriptionsServiceImpl implements SubscriptionsService {
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
   * Creates a new subscription
   */
  async create(
    request: CreateSubscriptionRequest,
    options?: RequestOptions
  ): Promise<Subscription> {
    const idempotencyKey =
      options?.idempotencyKey ?? this.idempotency.generateKey('subscriptions.create', toBody(request));

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Subscription>('/subscriptions', toBody(request), httpOptions)
    );
  }

  /**
   * Retrieves an existing subscription
   */
  async retrieve(id: string, options?: RequestOptions): Promise<Subscription> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<Subscription>(`/subscriptions/${id}`, undefined, httpOptions)
    );
  }

  /**
   * Updates an existing subscription
   */
  async update(
    id: string,
    request: UpdateSubscriptionRequest,
    options?: RequestOptions
  ): Promise<Subscription> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('subscriptions.update', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Subscription>(
        `/subscriptions/${id}`,
        request as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Cancels a subscription
   */
  async cancel(
    id: string,
    atPeriodEnd: boolean = false,
    options?: RequestOptions
  ): Promise<Subscription> {
    if (atPeriodEnd) {
      // Cancel at period end by updating the subscription
      return this.update(id, { cancel_at_period_end: true }, options);
    }

    // Immediate cancellation
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('subscriptions.cancel', { id, atPeriodEnd });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.delete<Subscription>(`/subscriptions/${id}`, httpOptions)
    );
  }

  /**
   * Cancels a subscription with detailed options
   */
  async cancelWithDetails(
    id: string,
    request?: CancelSubscriptionRequest,
    options?: RequestOptions
  ): Promise<Subscription> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('subscriptions.cancel', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    // Use POST with parameters for detailed cancellation
    if (request && Object.keys(request).length > 0) {
      return this.resilience.execute(() =>
        this.transport.post<Subscription>(
          `/subscriptions/${id}`,
          { ...request, cancel_at_period_end: true } as Record<string, unknown>,
          httpOptions
        )
      );
    }

    return this.resilience.execute(() =>
      this.transport.delete<Subscription>(`/subscriptions/${id}`, httpOptions)
    );
  }

  /**
   * Pauses a subscription
   */
  async pause(
    id: string,
    resumesAt?: number,
    options?: RequestOptions
  ): Promise<Subscription> {
    const pauseCollection: Record<string, unknown> = {
      behavior: 'void',
    };

    if (resumesAt) {
      pauseCollection.resumes_at = resumesAt;
    }

    return this.update(id, { pause_collection: pauseCollection as any }, options);
  }

  /**
   * Resumes a paused subscription
   */
  async resume(id: string, options?: RequestOptions): Promise<Subscription> {
    return this.update(id, { pause_collection: '' }, options);
  }

  /**
   * Lists subscriptions
   */
  async list(
    params?: ListSubscriptionsParams,
    options?: RequestOptions
  ): Promise<PaginatedList<Subscription>> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<PaginatedList<Subscription>>(
        '/subscriptions',
        params as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Deletes the discount on a subscription
   */
  async deleteDiscount(
    id: string,
    options?: RequestOptions
  ): Promise<{ id: string; deleted: true }> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.delete<{ id: string; deleted: true }>(
        `/subscriptions/${id}/discount`,
        httpOptions
      )
    );
  }
}

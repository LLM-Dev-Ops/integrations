/**
 * Checkout Sessions service implementation
 */
import type { HttpTransport, HttpRequestOptions } from '../../transport/http.js';
import type { IdempotencyManager } from '../../idempotency/manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  CheckoutSession,
  CreateCheckoutSessionRequest,
  ListCheckoutSessionsParams,
  PaginatedList,
  RequestOptions,
} from '../../types/index.js';

// Helper function to convert typed objects to Record<string, unknown>
function toBody<T extends object>(obj: T): Record<string, unknown> {
  return obj as unknown as Record<string, unknown>;
}

/**
 * Checkout Sessions service interface
 */
export interface CheckoutSessionsService {
  /**
   * Creates a new checkout session
   */
  create(
    request: CreateCheckoutSessionRequest,
    options?: RequestOptions
  ): Promise<CheckoutSession>;

  /**
   * Retrieves an existing checkout session
   */
  retrieve(id: string, options?: RequestOptions): Promise<CheckoutSession>;

  /**
   * Lists checkout sessions
   */
  list(
    params?: ListCheckoutSessionsParams,
    options?: RequestOptions
  ): Promise<PaginatedList<CheckoutSession>>;

  /**
   * Expires a checkout session
   */
  expire(id: string, options?: RequestOptions): Promise<CheckoutSession>;

  /**
   * Lists line items for a checkout session
   */
  listLineItems(
    id: string,
    params?: { limit?: number; starting_after?: string; ending_before?: string },
    options?: RequestOptions
  ): Promise<PaginatedList<unknown>>;
}

/**
 * Checkout Sessions service implementation
 */
export class CheckoutSessionsServiceImpl implements CheckoutSessionsService {
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
   * Creates a new checkout session
   */
  async create(
    request: CreateCheckoutSessionRequest,
    options?: RequestOptions
  ): Promise<CheckoutSession> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('checkout.sessions.create', toBody(request));

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<CheckoutSession>(
        '/checkout/sessions',
        toBody(request),
        httpOptions
      )
    );
  }

  /**
   * Retrieves an existing checkout session
   */
  async retrieve(id: string, options?: RequestOptions): Promise<CheckoutSession> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<CheckoutSession>(
        `/checkout/sessions/${id}`,
        undefined,
        httpOptions
      )
    );
  }

  /**
   * Lists checkout sessions
   */
  async list(
    params?: ListCheckoutSessionsParams,
    options?: RequestOptions
  ): Promise<PaginatedList<CheckoutSession>> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<PaginatedList<CheckoutSession>>(
        '/checkout/sessions',
        params as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Expires a checkout session
   */
  async expire(id: string, options?: RequestOptions): Promise<CheckoutSession> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('checkout.sessions.expire', { id });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<CheckoutSession>(
        `/checkout/sessions/${id}/expire`,
        {},
        httpOptions
      )
    );
  }

  /**
   * Lists line items for a checkout session
   */
  async listLineItems(
    id: string,
    params?: { limit?: number; starting_after?: string; ending_before?: string },
    options?: RequestOptions
  ): Promise<PaginatedList<unknown>> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<PaginatedList<unknown>>(
        `/checkout/sessions/${id}/line_items`,
        params as Record<string, unknown>,
        httpOptions
      )
    );
  }
}

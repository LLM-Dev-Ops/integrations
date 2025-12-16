/**
 * Invoices service implementation
 */
import type { HttpTransport, HttpRequestOptions } from '../../transport/http.js';
import type { IdempotencyManager } from '../../idempotency/manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  Invoice,
  FinalizeInvoiceRequest,
  PayInvoiceRequest,
  UpcomingInvoiceRequest,
  ListInvoicesParams,
  PaginatedList,
  RequestOptions,
} from '../../types/index.js';

/**
 * Invoices service interface
 */
export interface InvoicesService {
  /**
   * Retrieves an existing invoice
   */
  retrieve(id: string, options?: RequestOptions): Promise<Invoice>;

  /**
   * Retrieves an upcoming invoice
   */
  upcoming(params: UpcomingInvoiceRequest, options?: RequestOptions): Promise<Invoice>;

  /**
   * Lists invoices
   */
  list(params?: ListInvoicesParams, options?: RequestOptions): Promise<PaginatedList<Invoice>>;

  /**
   * Finalizes a draft invoice
   */
  finalize(
    id: string,
    request?: FinalizeInvoiceRequest,
    options?: RequestOptions
  ): Promise<Invoice>;

  /**
   * Pays an invoice
   */
  pay(
    id: string,
    request?: PayInvoiceRequest,
    options?: RequestOptions
  ): Promise<Invoice>;

  /**
   * Voids an invoice
   */
  void(id: string, options?: RequestOptions): Promise<Invoice>;

  /**
   * Marks an invoice as uncollectible
   */
  markUncollectible(id: string, options?: RequestOptions): Promise<Invoice>;

  /**
   * Sends an invoice for manual payment
   */
  send(id: string, options?: RequestOptions): Promise<Invoice>;
}

/**
 * Invoices service implementation
 */
export class InvoicesServiceImpl implements InvoicesService {
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
   * Retrieves an existing invoice
   */
  async retrieve(id: string, options?: RequestOptions): Promise<Invoice> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<Invoice>(`/invoices/${id}`, undefined, httpOptions)
    );
  }

  /**
   * Retrieves an upcoming invoice
   */
  async upcoming(
    params: UpcomingInvoiceRequest,
    options?: RequestOptions
  ): Promise<Invoice> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<Invoice>('/invoices/upcoming', params as Record<string, unknown>, httpOptions)
    );
  }

  /**
   * Lists invoices
   */
  async list(
    params?: ListInvoicesParams,
    options?: RequestOptions
  ): Promise<PaginatedList<Invoice>> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<PaginatedList<Invoice>>(
        '/invoices',
        params as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Finalizes a draft invoice
   */
  async finalize(
    id: string,
    request?: FinalizeInvoiceRequest,
    options?: RequestOptions
  ): Promise<Invoice> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('invoices.finalize', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Invoice>(
        `/invoices/${id}/finalize`,
        (request ?? {}) as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Pays an invoice
   */
  async pay(
    id: string,
    request?: PayInvoiceRequest,
    options?: RequestOptions
  ): Promise<Invoice> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('invoices.pay', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Invoice>(
        `/invoices/${id}/pay`,
        (request ?? {}) as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Voids an invoice
   */
  async void(id: string, options?: RequestOptions): Promise<Invoice> {
    const idempotencyKey =
      options?.idempotencyKey ?? this.idempotency.generateKey('invoices.void', { id });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Invoice>(`/invoices/${id}/void`, {}, httpOptions)
    );
  }

  /**
   * Marks an invoice as uncollectible
   */
  async markUncollectible(id: string, options?: RequestOptions): Promise<Invoice> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('invoices.mark_uncollectible', { id });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Invoice>(`/invoices/${id}/mark_uncollectible`, {}, httpOptions)
    );
  }

  /**
   * Sends an invoice for manual payment
   */
  async send(id: string, options?: RequestOptions): Promise<Invoice> {
    const idempotencyKey =
      options?.idempotencyKey ?? this.idempotency.generateKey('invoices.send', { id });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Invoice>(`/invoices/${id}/send`, {}, httpOptions)
    );
  }
}

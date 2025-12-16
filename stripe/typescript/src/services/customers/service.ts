/**
 * Customers service implementation
 */
import type { HttpTransport, HttpRequestOptions } from '../../transport/http.js';
import type { IdempotencyManager } from '../../idempotency/manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  Customer,
  DeletedCustomer,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  ListCustomersParams,
  SearchCustomersParams,
  SearchCustomersResponse,
  PaginatedList,
  RequestOptions,
} from '../../types/index.js';

// Helper function to convert typed objects to Record<string, unknown>
function toBody<T extends object>(obj: T): Record<string, unknown> {
  return obj as unknown as Record<string, unknown>;
}

/**
 * Customers service interface
 */
export interface CustomersService {
  /**
   * Creates a new customer
   */
  create(request?: CreateCustomerRequest, options?: RequestOptions): Promise<Customer>;

  /**
   * Retrieves an existing customer
   */
  retrieve(id: string, options?: RequestOptions): Promise<Customer>;

  /**
   * Updates an existing customer
   */
  update(
    id: string,
    request: UpdateCustomerRequest,
    options?: RequestOptions
  ): Promise<Customer>;

  /**
   * Deletes a customer
   */
  delete(id: string, options?: RequestOptions): Promise<DeletedCustomer>;

  /**
   * Lists customers
   */
  list(params?: ListCustomersParams, options?: RequestOptions): Promise<PaginatedList<Customer>>;

  /**
   * Searches customers
   */
  search(
    params: SearchCustomersParams,
    options?: RequestOptions
  ): Promise<SearchCustomersResponse>;
}

/**
 * Customers service implementation
 */
export class CustomersServiceImpl implements CustomersService {
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
   * Creates a new customer
   */
  async create(
    request?: CreateCustomerRequest,
    options?: RequestOptions
  ): Promise<Customer> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('customers.create', toBody(request ?? {}));

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Customer>(
        '/customers',
        toBody(request ?? {}),
        httpOptions
      )
    );
  }

  /**
   * Retrieves an existing customer
   */
  async retrieve(id: string, options?: RequestOptions): Promise<Customer> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<Customer>(`/customers/${id}`, undefined, httpOptions)
    );
  }

  /**
   * Updates an existing customer
   */
  async update(
    id: string,
    request: UpdateCustomerRequest,
    options?: RequestOptions
  ): Promise<Customer> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('customers.update', { id, ...request });

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<Customer>(
        `/customers/${id}`,
        request as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Deletes a customer
   */
  async delete(id: string, options?: RequestOptions): Promise<DeletedCustomer> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.delete<DeletedCustomer>(`/customers/${id}`, httpOptions)
    );
  }

  /**
   * Lists customers
   */
  async list(
    params?: ListCustomersParams,
    options?: RequestOptions
  ): Promise<PaginatedList<Customer>> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<PaginatedList<Customer>>(
        '/customers',
        params as Record<string, unknown>,
        httpOptions
      )
    );
  }

  /**
   * Searches customers
   */
  async search(
    params: SearchCustomersParams,
    options?: RequestOptions
  ): Promise<SearchCustomersResponse> {
    const httpOptions: HttpRequestOptions = {
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.get<SearchCustomersResponse>(
        '/customers/search',
        toBody(params),
        httpOptions
      )
    );
  }
}

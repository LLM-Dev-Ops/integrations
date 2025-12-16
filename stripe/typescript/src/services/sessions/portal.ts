/**
 * Billing Portal Sessions service implementation
 */
import type { HttpTransport, HttpRequestOptions } from '../../transport/http.js';
import type { IdempotencyManager } from '../../idempotency/manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  BillingPortalSession,
  CreateBillingPortalSessionRequest,
  RequestOptions,
} from '../../types/index.js';

// Helper function to convert typed objects to Record<string, unknown>
function toBody<T extends object>(obj: T): Record<string, unknown> {
  return obj as unknown as Record<string, unknown>;
}

/**
 * Billing Portal Sessions service interface
 */
export interface BillingPortalSessionsService {
  /**
   * Creates a new billing portal session
   */
  create(
    request: CreateBillingPortalSessionRequest,
    options?: RequestOptions
  ): Promise<BillingPortalSession>;
}

/**
 * Billing Portal Sessions service implementation
 */
export class BillingPortalSessionsServiceImpl implements BillingPortalSessionsService {
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
   * Creates a new billing portal session
   */
  async create(
    request: CreateBillingPortalSessionRequest,
    options?: RequestOptions
  ): Promise<BillingPortalSession> {
    const idempotencyKey =
      options?.idempotencyKey ??
      this.idempotency.generateKey('billing_portal.sessions.create', toBody(request));

    const httpOptions: HttpRequestOptions = {
      idempotencyKey,
      stripeAccount: options?.stripeAccount,
      timeout: options?.timeout,
    };

    return this.resilience.execute(() =>
      this.transport.post<BillingPortalSession>(
        '/billing_portal/sessions',
        toBody(request),
        httpOptions
      )
    );
  }
}

/**
 * Main Stripe client implementation
 */
import type { NormalizedStripeConfig, StripeConfig } from '../config/config.js';
import { validateConfig, createConfigFromEnv } from '../config/config.js';
import { createAuthManager, type AuthManager } from '../auth/auth-manager.js';
import { createHttpTransport, type HttpTransport } from '../transport/http.js';
import { createIdempotencyManager, type IdempotencyManager } from '../idempotency/manager.js';
import {
  DefaultResilienceOrchestrator,
  PassthroughResilienceOrchestrator,
  type ResilienceOrchestrator,
} from '../resilience/orchestrator.js';
import { PaymentIntentsServiceImpl, type PaymentIntentsService } from '../services/payment-intents/index.js';
import { SubscriptionsServiceImpl, type SubscriptionsService } from '../services/subscriptions/index.js';
import { InvoicesServiceImpl, type InvoicesService } from '../services/invoices/index.js';
import { WebhookServiceImpl, type WebhookService } from '../services/webhooks/index.js';
import { CheckoutSessionsServiceImpl, type CheckoutSessionsService } from '../services/sessions/checkout.js';
import { BillingPortalSessionsServiceImpl, type BillingPortalSessionsService } from '../services/sessions/portal.js';
import { CustomersServiceImpl, type CustomersService } from '../services/customers/index.js';

/**
 * Sessions API interface combining checkout and billing portal
 */
export interface SessionsAPI {
  /**
   * Creates a checkout session
   */
  createCheckout: CheckoutSessionsService['create'];

  /**
   * Retrieves a checkout session
   */
  retrieveCheckout: CheckoutSessionsService['retrieve'];

  /**
   * Lists checkout sessions
   */
  listCheckout: CheckoutSessionsService['list'];

  /**
   * Expires a checkout session
   */
  expireCheckout: CheckoutSessionsService['expire'];

  /**
   * Creates a billing portal session
   */
  createBillingPortal: BillingPortalSessionsService['create'];
}

/**
 * Main Stripe client interface
 */
export interface StripeClient {
  /**
   * Payment Intents API
   */
  readonly paymentIntents: PaymentIntentsService;

  /**
   * Subscriptions API
   */
  readonly subscriptions: SubscriptionsService;

  /**
   * Invoices API
   */
  readonly invoices: InvoicesService;

  /**
   * Customers API
   */
  readonly customers: CustomersService;

  /**
   * Sessions API (Checkout and Billing Portal)
   */
  readonly sessions: SessionsAPI;

  /**
   * Webhooks API
   */
  webhooks(): WebhookService;

  /**
   * Gets the current configuration
   */
  getConfig(): Readonly<NormalizedStripeConfig>;

  /**
   * Gets the HTTP transport instance
   */
  getTransport(): HttpTransport;

  /**
   * Gets the auth manager instance
   */
  getAuthManager(): AuthManager;

  /**
   * Gets the idempotency manager instance
   */
  getIdempotencyManager(): IdempotencyManager;

  /**
   * Gets the resilience orchestrator instance
   */
  getResilienceOrchestrator(): ResilienceOrchestrator;

  /**
   * Performs a health check
   */
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  apiVersion: string;
  error?: string;
}

/**
 * Stripe client implementation
 */
export class StripeClientImpl implements StripeClient {
  private readonly config: NormalizedStripeConfig;
  private readonly authManager: AuthManager;
  private readonly transport: HttpTransport;
  private readonly idempotency: IdempotencyManager;
  private readonly resilience: ResilienceOrchestrator;
  private readonly webhookService?: WebhookService;

  // Service instances
  readonly paymentIntents: PaymentIntentsService;
  readonly subscriptions: SubscriptionsService;
  readonly invoices: InvoicesService;
  readonly customers: CustomersService;
  readonly sessions: SessionsAPI;

  constructor(config: StripeConfig) {
    this.config = validateConfig(config);

    // Initialize auth manager
    this.authManager = createAuthManager(this.config);

    // Initialize HTTP transport
    this.transport = createHttpTransport(
      this.config.baseUrl,
      this.authManager,
      this.config.timeout,
      this.config.fetch
    );

    // Initialize idempotency manager
    this.idempotency = createIdempotencyManager(this.config.idempotency);

    // Initialize resilience orchestrator
    if (this.config.circuitBreaker.enabled) {
      this.resilience = DefaultResilienceOrchestrator.create({
        retry: {
          maxRetries: this.config.maxRetries,
          baseDelayMs: 500,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        },
        circuitBreaker: this.config.circuitBreaker,
      });
    } else {
      this.resilience = new PassthroughResilienceOrchestrator();
    }

    // Initialize webhook service if secret is provided
    if (this.config.webhookSecret) {
      this.webhookService = new WebhookServiceImpl(
        this.config.webhookSecret,
        this.config.webhookTolerance
      );
    }

    // Initialize services
    this.paymentIntents = new PaymentIntentsServiceImpl(
      this.transport,
      this.idempotency,
      this.resilience
    );

    this.subscriptions = new SubscriptionsServiceImpl(
      this.transport,
      this.idempotency,
      this.resilience
    );

    this.invoices = new InvoicesServiceImpl(
      this.transport,
      this.idempotency,
      this.resilience
    );

    this.customers = new CustomersServiceImpl(
      this.transport,
      this.idempotency,
      this.resilience
    );

    // Initialize sessions API
    const checkoutSessions = new CheckoutSessionsServiceImpl(
      this.transport,
      this.idempotency,
      this.resilience
    );

    const billingPortalSessions = new BillingPortalSessionsServiceImpl(
      this.transport,
      this.idempotency,
      this.resilience
    );

    this.sessions = {
      createCheckout: checkoutSessions.create.bind(checkoutSessions),
      retrieveCheckout: checkoutSessions.retrieve.bind(checkoutSessions),
      listCheckout: checkoutSessions.list.bind(checkoutSessions),
      expireCheckout: checkoutSessions.expire.bind(checkoutSessions),
      createBillingPortal: billingPortalSessions.create.bind(billingPortalSessions),
    };
  }

  /**
   * Gets the webhook service
   */
  webhooks(): WebhookService {
    if (!this.webhookService) {
      throw new Error('Webhook secret not configured. Provide webhookSecret in config.');
    }
    return this.webhookService;
  }

  /**
   * Gets the current configuration
   */
  getConfig(): Readonly<NormalizedStripeConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Gets the HTTP transport instance
   */
  getTransport(): HttpTransport {
    return this.transport;
  }

  /**
   * Gets the auth manager instance
   */
  getAuthManager(): AuthManager {
    return this.authManager;
  }

  /**
   * Gets the idempotency manager instance
   */
  getIdempotencyManager(): IdempotencyManager {
    return this.idempotency;
  }

  /**
   * Gets the resilience orchestrator instance
   */
  getResilienceOrchestrator(): ResilienceOrchestrator {
    return this.resilience;
  }

  /**
   * Performs a health check by retrieving balance
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      // Use balance endpoint for health check (lightweight, always available)
      await this.transport.get('/balance');

      return {
        healthy: true,
        latencyMs: Date.now() - start,
        apiVersion: this.config.apiVersion,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        apiVersion: this.config.apiVersion,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * Creates a new Stripe client with the provided configuration
 */
export function createClient(config: StripeConfig): StripeClient {
  return new StripeClientImpl(config);
}

/**
 * Creates a new Stripe client using environment variables
 */
export function createClientFromEnv(overrides?: Partial<StripeConfig>): StripeClient {
  const config = createConfigFromEnv(overrides);
  return createClient(config);
}

/**
 * Stripe client builder for fluent configuration
 */
export class StripeClientBuilder {
  private config: Partial<StripeConfig> = {};

  /**
   * Sets the API key
   */
  apiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    return this;
  }

  /**
   * Sets the webhook secret
   */
  webhookSecret(webhookSecret: string): this {
    this.config.webhookSecret = webhookSecret;
    return this;
  }

  /**
   * Sets the API version
   */
  apiVersion(apiVersion: string): this {
    this.config.apiVersion = apiVersion;
    return this;
  }

  /**
   * Sets the timeout
   */
  timeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets max retries
   */
  maxRetries(maxRetries: number): this {
    this.config.maxRetries = maxRetries;
    return this;
  }

  /**
   * Builds the client
   */
  build(): StripeClient {
    if (!this.config.apiKey) {
      throw new Error('API key is required. Use apiKey() to set it.');
    }
    return createClient(this.config as StripeConfig);
  }
}

/**
 * Creates a new Stripe client builder
 */
export function builder(): StripeClientBuilder {
  return new StripeClientBuilder();
}

/**
 * Webhook management and payload verification for Airtable API.
 *
 * Provides webhook lifecycle management (create, list, refresh, delete)
 * and secure webhook payload verification using HMAC-SHA256.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookConfig, SecretString } from '../config/index.js';
import {
  WebhookMissingSignatureError,
  WebhookInvalidSignatureError,
  WebhookUnknownError,
  ValidationError,
} from '../errors/index.js';
import { Logger, NoopLogger, MetricsCollector, NoopMetricsCollector, MetricNames } from '../observability/index.js';

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook data types that can be monitored.
 */
export type WebhookDataType = 'tableData' | 'tableFields' | 'tableMetadata';

/**
 * Record change types.
 */
export type WebhookChangeType = 'created' | 'changed' | 'destroyed';

/**
 * Request to create a new webhook.
 */
export interface CreateWebhookRequest {
  /** URL to send webhook notifications to (optional) */
  notificationUrl?: string;
  /** Data types to watch for changes */
  dataTypes: WebhookDataType[];
  /** Scope for record changes (optional filter) */
  recordChangeScope?: string;
}

/**
 * Webhook registration information.
 */
export interface Webhook {
  /** Unique webhook identifier */
  id: string;
  /** MAC secret in base64 format for signature verification */
  macSecretBase64: string;
  /** URL where notifications are sent (optional) */
  notificationUrl?: string;
  /** Cursor for fetching next payload batch */
  cursorForNextPayload: number;
  /** ISO 8601 timestamp when webhook expires */
  expirationTime: string;
  /** Whether webhook is currently enabled */
  isHookEnabled: boolean;
}

/**
 * Webhook notification payload structure.
 */
export interface WebhookPayload {
  /** Base information */
  base: {
    /** Base ID */
    id: string;
  };
  /** Webhook information */
  webhook: {
    /** Webhook ID */
    id: string;
  };
  /** ISO 8601 timestamp of the event */
  timestamp: string;
}

/**
 * Record change information.
 */
export interface ChangedRecord {
  /** Record ID */
  id: string;
  /** Type of change */
  changeType: WebhookChangeType;
  /** List of field names that changed (optional) */
  changedFields?: string[];
}

/**
 * Batch of webhook changes.
 */
export interface WebhookChanges {
  /** Cursor position for this batch */
  cursor: number;
  /** Whether more changes might be available */
  mightHaveMore: boolean;
  /** Array of change payloads */
  payloads: Array<{
    /** Timestamp of the change batch */
    timestamp: string;
    /** Transaction number in the base */
    baseTransactionNumber: number;
    /** Records that changed */
    changedRecords: ChangedRecord[];
  }>;
}

// ============================================================================
// HTTP Client Interface
// ============================================================================

/**
 * Minimal HTTP client interface for webhook operations.
 * This allows the webhook service to make HTTP requests without
 * depending on the full Airtable client implementation.
 */
export interface AirtableClient {
  /**
   * Make a GET request.
   * @param path - Request path
   * @returns Response data
   */
  get<T>(path: string): Promise<T>;

  /**
   * Make a POST request.
   * @param path - Request path
   * @param body - Request body
   * @returns Response data
   */
  post<T>(path: string, body?: unknown): Promise<T>;

  /**
   * Make a DELETE request.
   * @param path - Request path
   * @returns Response data
   */
  delete<T>(path: string): Promise<T>;
}

// ============================================================================
// Webhook Service Interface
// ============================================================================

/**
 * Service for managing Airtable webhooks.
 */
export interface WebhookService {
  /**
   * Creates a new webhook for a base.
   * @param baseId - Base ID to create webhook for
   * @param request - Webhook creation parameters
   * @returns Created webhook information including secret
   */
  createWebhook(baseId: string, request: CreateWebhookRequest): Promise<Webhook>;

  /**
   * Lists all webhooks for a base.
   * @param baseId - Base ID to list webhooks for
   * @returns Array of webhook information
   */
  listWebhooks(baseId: string): Promise<Webhook[]>;

  /**
   * Refreshes a webhook to extend its expiration time.
   * @param baseId - Base ID
   * @param webhookId - Webhook ID to refresh
   * @returns Updated webhook information
   */
  refreshWebhook(baseId: string, webhookId: string): Promise<Webhook>;

  /**
   * Deletes a webhook.
   * @param baseId - Base ID
   * @param webhookId - Webhook ID to delete
   */
  deleteWebhook(baseId: string, webhookId: string): Promise<void>;

  /**
   * Fetches changes from a webhook.
   * @param baseId - Base ID
   * @param webhookId - Webhook ID
   * @param cursor - Optional cursor to fetch from specific position
   * @returns Batch of webhook changes
   */
  fetchChanges(baseId: string, webhookId: string, cursor?: number): Promise<WebhookChanges>;
}

// ============================================================================
// Webhook Service Implementation
// ============================================================================

/**
 * Implementation of webhook management service.
 */
export class WebhookServiceImpl implements WebhookService {
  private readonly client: AirtableClient;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;

  constructor(
    client: AirtableClient,
    logger: Logger = new NoopLogger(),
    metrics: MetricsCollector = new NoopMetricsCollector()
  ) {
    this.client = client;
    this.logger = logger;
    this.metrics = metrics;
  }

  async createWebhook(baseId: string, request: CreateWebhookRequest): Promise<Webhook> {
    this.logger.info('Creating webhook', { baseId, dataTypes: request.dataTypes });

    if (!request.dataTypes || request.dataTypes.length === 0) {
      throw new ValidationError('At least one dataType is required');
    }

    const path = `/bases/${baseId}/webhooks`;
    const body = {
      notificationUrl: request.notificationUrl,
      specification: {
        options: {
          filters: {
            dataTypes: request.dataTypes,
            ...(request.recordChangeScope && { recordChangeScope: request.recordChangeScope }),
          },
        },
      },
    };

    try {
      const response = await this.client.post<Webhook>(path, body);
      this.metrics.increment(MetricNames.WEBHOOK_EVENTS, 1, { operation: 'create' });
      this.logger.info('Webhook created successfully', { baseId, webhookId: response.id });
      return response;
    } catch (error) {
      this.logger.error('Failed to create webhook', { baseId, error });
      throw error;
    }
  }

  async listWebhooks(baseId: string): Promise<Webhook[]> {
    this.logger.debug('Listing webhooks', { baseId });

    const path = `/bases/${baseId}/webhooks`;

    try {
      const response = await this.client.get<{ webhooks: Webhook[] }>(path);
      this.logger.debug('Webhooks retrieved', { baseId, count: response.webhooks.length });
      return response.webhooks;
    } catch (error) {
      this.logger.error('Failed to list webhooks', { baseId, error });
      throw error;
    }
  }

  async refreshWebhook(baseId: string, webhookId: string): Promise<Webhook> {
    this.logger.info('Refreshing webhook', { baseId, webhookId });

    const path = `/bases/${baseId}/webhooks/${webhookId}/refresh`;

    try {
      const response = await this.client.post<Webhook>(path);
      this.metrics.increment(MetricNames.WEBHOOK_EVENTS, 1, { operation: 'refresh' });
      this.logger.info('Webhook refreshed successfully', { baseId, webhookId });
      return response;
    } catch (error) {
      this.logger.error('Failed to refresh webhook', { baseId, webhookId, error });
      throw error;
    }
  }

  async deleteWebhook(baseId: string, webhookId: string): Promise<void> {
    this.logger.info('Deleting webhook', { baseId, webhookId });

    const path = `/bases/${baseId}/webhooks/${webhookId}`;

    try {
      await this.client.delete<void>(path);
      this.metrics.increment(MetricNames.WEBHOOK_EVENTS, 1, { operation: 'delete' });
      this.logger.info('Webhook deleted successfully', { baseId, webhookId });
    } catch (error) {
      this.logger.error('Failed to delete webhook', { baseId, webhookId, error });
      throw error;
    }
  }

  async fetchChanges(baseId: string, webhookId: string, cursor?: number): Promise<WebhookChanges> {
    this.logger.debug('Fetching webhook changes', { baseId, webhookId, cursor });

    const cursorParam = cursor !== undefined ? `?cursor=${cursor}` : '';
    const path = `/bases/${baseId}/webhooks/${webhookId}/payloads${cursorParam}`;

    try {
      const response = await this.client.get<WebhookChanges>(path);
      this.metrics.increment(MetricNames.WEBHOOK_EVENTS, 1, { operation: 'fetch_changes' });
      this.logger.debug('Webhook changes retrieved', {
        baseId,
        webhookId,
        cursor,
        payloadCount: response.payloads.length,
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to fetch webhook changes', { baseId, webhookId, cursor, error });
      throw error;
    }
  }
}

// ============================================================================
// Webhook Processor (Incoming Webhook Verification)
// ============================================================================

/**
 * Processor for verifying and parsing incoming webhook payloads.
 * Implements HMAC-SHA256 signature verification for security.
 */
export class WebhookProcessor {
  private readonly secrets: Map<string, Buffer> = new Map();
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly timestampToleranceMs: number;

  constructor(
    config?: WebhookConfig,
    logger: Logger = new NoopLogger(),
    metrics: MetricsCollector = new NoopMetricsCollector()
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.timestampToleranceMs = config?.timestampToleranceMs ?? 300000; // 5 minutes default

    // Convert secrets to buffers for efficient HMAC computation
    if (config?.secrets) {
      config.secrets.forEach((secret, webhookId) => {
        this.registerSecret(webhookId, secret.expose());
      });
    }
  }

  /**
   * Registers a webhook secret for verification.
   * @param webhookId - Webhook identifier
   * @param secretBase64 - Base64-encoded MAC secret
   */
  registerSecret(webhookId: string, secretBase64: string): void {
    try {
      const secretBuffer = Buffer.from(secretBase64, 'base64');
      this.secrets.set(webhookId, secretBuffer);
      this.logger.debug('Webhook secret registered', { webhookId });
    } catch (error) {
      this.logger.error('Failed to register webhook secret', { webhookId, error });
      throw new ValidationError('Invalid base64 secret format');
    }
  }

  /**
   * Verifies and parses an incoming webhook payload.
   * @param headers - HTTP request headers
   * @param body - Raw request body (string or Buffer)
   * @returns Parsed webhook payload
   * @throws WebhookMissingSignatureError if signature header is missing
   * @throws WebhookInvalidSignatureError if signature verification fails
   * @throws WebhookUnknownError if webhook ID is not registered
   */
  verifyAndParse(headers: Record<string, string>, body: string | Buffer): WebhookPayload {
    this.logger.debug('Verifying webhook payload');

    // Get and validate signature header
    const macHeader = headers['x-airtable-content-mac'] || headers['X-Airtable-Content-MAC'];
    if (!macHeader) {
      this.metrics.increment(MetricNames.WEBHOOK_VERIFICATION_FAILURES, 1, { reason: 'missing_signature' });
      throw new WebhookMissingSignatureError();
    }

    // Convert body to Buffer if needed
    const bodyBuffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;

    // Parse the payload to get webhook ID
    let payload: WebhookPayload;
    try {
      const bodyString = bodyBuffer.toString('utf8');
      payload = JSON.parse(bodyString) as WebhookPayload;
    } catch (error) {
      this.logger.error('Failed to parse webhook payload', { error });
      this.metrics.increment(MetricNames.WEBHOOK_VERIFICATION_FAILURES, 1, { reason: 'invalid_json' });
      throw new ValidationError('Invalid JSON payload');
    }

    // Verify webhook is registered
    const webhookId = payload.webhook.id;
    if (!this.secrets.has(webhookId)) {
      this.logger.warn('Webhook ID not registered', { webhookId });
      this.metrics.increment(MetricNames.WEBHOOK_VERIFICATION_FAILURES, 1, { reason: 'unknown_webhook' });
      throw new WebhookUnknownError(webhookId);
    }

    // Verify signature
    if (!this.verifySignature(webhookId, macHeader, bodyBuffer)) {
      this.logger.warn('Webhook signature verification failed', { webhookId });
      this.metrics.increment(MetricNames.WEBHOOK_VERIFICATION_FAILURES, 1, { reason: 'invalid_signature' });
      throw new WebhookInvalidSignatureError();
    }

    // Verify timestamp (if configured)
    if (this.timestampToleranceMs > 0) {
      const payloadTime = new Date(payload.timestamp).getTime();
      const now = Date.now();
      const age = now - payloadTime;

      if (age > this.timestampToleranceMs) {
        this.logger.warn('Webhook payload timestamp too old', { webhookId, age });
        this.metrics.increment(MetricNames.WEBHOOK_VERIFICATION_FAILURES, 1, { reason: 'expired_timestamp' });
        throw new ValidationError(`Webhook payload timestamp is too old (${age}ms > ${this.timestampToleranceMs}ms)`);
      }
    }

    this.logger.info('Webhook payload verified successfully', { webhookId, baseId: payload.base.id });
    this.metrics.increment(MetricNames.WEBHOOK_EVENTS, 1, { operation: 'verified' });

    return payload;
  }

  /**
   * Verifies HMAC signature using constant-time comparison.
   * @param webhookId - Webhook identifier
   * @param macHeader - MAC header value (format: "hmac-sha256=<base64_signature>")
   * @param bodyBuffer - Raw request body as Buffer
   * @returns True if signature is valid
   */
  private verifySignature(webhookId: string, macHeader: string, bodyBuffer: Buffer): boolean {
    // Extract signature from header
    const parts = macHeader.split('=');
    if (parts.length !== 2 || parts[0] !== 'hmac-sha256') {
      this.logger.warn('Invalid MAC header format', { webhookId, macHeader });
      return false;
    }

    const providedSignature = parts[1];

    // Get secret for this webhook
    const secret = this.secrets.get(webhookId);
    if (!secret) {
      return false;
    }

    // Compute HMAC-SHA256
    const hmac = createHmac('sha256', secret);
    hmac.update(bodyBuffer);
    const computedSignature = hmac.digest('base64');

    // Use timing-safe comparison to prevent timing attacks
    try {
      const providedBuffer = Buffer.from(providedSignature, 'base64');
      const computedBuffer = Buffer.from(computedSignature, 'base64');

      // Ensure buffers are same length before comparison
      if (providedBuffer.length !== computedBuffer.length) {
        return false;
      }

      return timingSafeEqual(providedBuffer, computedBuffer);
    } catch (error) {
      this.logger.error('Signature comparison failed', { webhookId, error });
      return false;
    }
  }

  /**
   * Removes a registered webhook secret.
   * @param webhookId - Webhook identifier to unregister
   */
  unregisterSecret(webhookId: string): void {
    this.secrets.delete(webhookId);
    this.logger.debug('Webhook secret unregistered', { webhookId });
  }

  /**
   * Gets the number of registered webhook secrets.
   * @returns Count of registered webhooks
   */
  getRegisteredCount(): number {
    return this.secrets.size;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a webhook service instance.
 * @param client - HTTP client for making API requests
 * @param logger - Optional logger instance
 * @param metrics - Optional metrics collector
 * @returns WebhookService instance
 */
export function createWebhookService(
  client: AirtableClient,
  logger?: Logger,
  metrics?: MetricsCollector
): WebhookService {
  return new WebhookServiceImpl(client, logger, metrics);
}

/**
 * Creates a webhook processor for verifying incoming webhooks.
 * @param config - Optional webhook configuration with secrets
 * @param logger - Optional logger instance
 * @param metrics - Optional metrics collector
 * @returns WebhookProcessor instance
 */
export function createWebhookProcessor(
  config?: WebhookConfig,
  logger?: Logger,
  metrics?: MetricsCollector
): WebhookProcessor {
  return new WebhookProcessor(config, logger, metrics);
}

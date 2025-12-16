/**
 * Webhook handler implementation following SPARC specification.
 *
 * Provides webhook validation, event parsing, and handler dispatch.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookConfig, DEFAULT_WEBHOOK_CONFIG } from '../config/index.js';
import {
  WebhookEvent,
  WebhookEventType,
  JiraIssue,
  JiraComment,
  ChangelogItem,
} from '../types/index.js';
import {
  WebhookSignatureInvalidError,
  WebhookTimestampExpiredError,
  WebhookPayloadInvalidError,
} from '../errors/index.js';
import { Logger, NoopLogger, MetricsCollector, NoopMetricsCollector, MetricNames } from '../observability/index.js';

// ============================================================================
// Webhook Handler Interface
// ============================================================================

/**
 * Webhook request structure.
 */
export interface WebhookRequest {
  /** Request headers */
  headers: Record<string, string | string[] | undefined>;
  /** Raw request body */
  body: Buffer | string;
  /** Timestamp of receipt (optional, defaults to now) */
  receivedAt?: Date;
}

/**
 * Webhook response.
 */
export interface WebhookResponse {
  /** Whether the event was processed */
  processed: boolean;
  /** Whether the event was a duplicate */
  duplicate: boolean;
  /** Parsed event (if processed) */
  event?: WebhookEvent;
  /** Error message (if not processed) */
  error?: string;
}

/**
 * Event handler function type.
 */
export type EventHandler<T = void> = (event: WebhookEvent) => Promise<T>;

/**
 * Webhook handler interface.
 */
export interface WebhookHandler {
  /** Handle a webhook request */
  handle(request: WebhookRequest): Promise<WebhookResponse>;
  /** Validate a webhook signature */
  validateSignature(request: WebhookRequest): void;
  /** Parse a webhook event */
  parseEvent(body: string | Buffer): WebhookEvent;
  /** Register an event handler */
  on(eventType: WebhookEventType, handler: EventHandler): void;
  /** Remove an event handler */
  off(eventType: WebhookEventType, handler: EventHandler): void;
}

// ============================================================================
// Idempotency Cache
// ============================================================================

/**
 * Simple in-memory idempotency cache.
 */
class IdempotencyCache {
  private readonly cache: Map<string, number> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  /**
   * Checks if an ID has been seen recently.
   */
  has(id: string): boolean {
    const timestamp = this.cache.get(id);
    if (timestamp === undefined) {
      return false;
    }
    if (Date.now() - timestamp > this.ttlMs) {
      this.cache.delete(id);
      return false;
    }
    return true;
  }

  /**
   * Adds an ID to the cache.
   */
  add(id: string): void {
    this.cache.set(id, Date.now());
    this.cleanup();
  }

  /**
   * Cleans up expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.cache.delete(id);
      }
    }
  }
}

// ============================================================================
// Webhook Handler Implementation
// ============================================================================

/**
 * Webhook handler options.
 */
export interface WebhookHandlerOptions {
  /** Webhook configuration */
  config?: Partial<WebhookConfig>;
  /** Logger instance */
  logger?: Logger;
  /** Metrics collector */
  metrics?: MetricsCollector;
}

/**
 * Webhook handler implementation.
 */
export class WebhookHandlerImpl implements WebhookHandler {
  private readonly config: WebhookConfig;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly idempotencyCache: IdempotencyCache;
  private readonly handlers: Map<WebhookEventType, Set<EventHandler>> = new Map();

  constructor(options: WebhookHandlerOptions = {}) {
    this.config = { ...DEFAULT_WEBHOOK_CONFIG, ...options.config };
    this.logger = options.logger ?? new NoopLogger();
    this.metrics = options.metrics ?? new NoopMetricsCollector();
    this.idempotencyCache = new IdempotencyCache(this.config.idempotencyTtlMs);
  }

  /**
   * Handles a webhook request.
   */
  async handle(request: WebhookRequest): Promise<WebhookResponse> {
    try {
      // Validate signature
      if (this.config.secrets.length > 0) {
        this.validateSignature(request);
      }

      // Validate timestamp
      this.validateTimestamp(request);

      // Parse event
      const event = this.parseEvent(request.body);

      // Check idempotency
      const webhookId = this.getWebhookId(request);
      if (webhookId && this.idempotencyCache.has(webhookId)) {
        this.logger.debug('Duplicate webhook received', { webhookId });
        return {
          processed: false,
          duplicate: true,
          event,
        };
      }

      // Add to idempotency cache
      if (webhookId) {
        this.idempotencyCache.add(webhookId);
      }

      // Dispatch to handlers
      await this.dispatchEvent(event);

      this.metrics.increment(MetricNames.WEBHOOK_EVENTS_TOTAL, 1, {
        event_type: event.webhookEvent,
      });

      this.logger.info('Webhook processed', {
        eventType: event.webhookEvent,
        issueKey: event.issue?.key,
      });

      return {
        processed: true,
        duplicate: false,
        event,
      };
    } catch (error) {
      if (error instanceof WebhookSignatureInvalidError ||
          error instanceof WebhookTimestampExpiredError) {
        this.metrics.increment(MetricNames.WEBHOOK_VALIDATION_FAILURES, 1, {
          reason: (error as Error).constructor.name,
        });
      }

      this.logger.error('Webhook processing failed', {
        error: (error as Error).message,
      });

      return {
        processed: false,
        duplicate: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Validates webhook signature using HMAC-SHA256.
   */
  validateSignature(request: WebhookRequest): void {
    const signatureHeader = this.getHeader(request.headers, 'x-hub-signature') ||
                           this.getHeader(request.headers, 'x-atlassian-webhook-signature');

    if (!signatureHeader) {
      throw new WebhookSignatureInvalidError();
    }

    const signature = String(signatureHeader);

    // Parse signature format: "sha256=<hex>"
    const [algorithm, providedSig] = signature.split('=');
    if (!algorithm || !providedSig) {
      throw new WebhookSignatureInvalidError();
    }

    const body = typeof request.body === 'string'
      ? request.body
      : request.body.toString('utf8');

    // Try all configured secrets (for rotation support)
    for (const secret of this.config.secrets) {
      try {
        const expectedSig = this.computeSignature(algorithm, secret, body);

        // Constant-time comparison
        const providedBuffer = Buffer.from(providedSig, 'hex');
        const expectedBuffer = Buffer.from(expectedSig, 'hex');

        if (providedBuffer.length === expectedBuffer.length &&
            timingSafeEqual(providedBuffer, expectedBuffer)) {
          return; // Valid signature
        }
      } catch {
        // Try next secret
        continue;
      }
    }

    throw new WebhookSignatureInvalidError();
  }

  /**
   * Parses a webhook event from the request body.
   */
  parseEvent(body: string | Buffer): WebhookEvent {
    try {
      const bodyStr = typeof body === 'string' ? body : body.toString('utf8');
      const parsed = JSON.parse(bodyStr);

      // Validate required fields
      if (!parsed.webhookEvent) {
        throw new WebhookPayloadInvalidError('Missing webhookEvent field');
      }

      return parsed as WebhookEvent;
    } catch (error) {
      if (error instanceof WebhookPayloadInvalidError) {
        throw error;
      }
      throw new WebhookPayloadInvalidError(`Failed to parse payload: ${(error as Error).message}`);
    }
  }

  /**
   * Registers an event handler.
   */
  on(eventType: WebhookEventType, handler: EventHandler): void {
    let handlers = this.handlers.get(eventType);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(eventType, handlers);
    }
    handlers.add(handler);
  }

  /**
   * Removes an event handler.
   */
  off(eventType: WebhookEventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private validateTimestamp(request: WebhookRequest): void {
    const timestampHeader = this.getHeader(request.headers, 'x-atlassian-webhook-timestamp');

    if (!timestampHeader) {
      // Timestamp validation is optional if no header present
      return;
    }

    const timestamp = parseInt(String(timestampHeader), 10);
    if (isNaN(timestamp)) {
      throw new WebhookTimestampExpiredError(0, this.config.maxEventAgeMs);
    }

    const receivedAt = request.receivedAt ?? new Date();
    const ageMs = receivedAt.getTime() - timestamp;

    if (ageMs > this.config.maxEventAgeMs) {
      throw new WebhookTimestampExpiredError(ageMs, this.config.maxEventAgeMs);
    }
  }

  private getWebhookId(request: WebhookRequest): string | undefined {
    const id = this.getHeader(request.headers, 'x-atlassian-webhook-identifier');
    return id ? String(id) : undefined;
  }

  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined {
    // Headers are case-insensitive
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerName) {
        return Array.isArray(value) ? value[0] : value;
      }
    }
    return undefined;
  }

  private computeSignature(algorithm: string, secret: string, body: string): string {
    const normalizedAlgorithm = algorithm.toLowerCase().replace('-', '');

    if (normalizedAlgorithm !== 'sha256' && normalizedAlgorithm !== 'sha1') {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    const hmac = createHmac(normalizedAlgorithm, secret);
    hmac.update(body);
    return hmac.digest('hex');
  }

  private async dispatchEvent(event: WebhookEvent): Promise<void> {
    const handlers = this.handlers.get(event.webhookEvent);

    if (!handlers || handlers.size === 0) {
      this.logger.debug('No handlers registered for event', {
        eventType: event.webhookEvent,
      });
      return;
    }

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error('Event handler failed', {
          eventType: event.webhookEvent,
          error: (error as Error).message,
        });
      }
    });

    await Promise.all(promises);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a webhook handler instance.
 */
export function createWebhookHandler(options?: WebhookHandlerOptions): WebhookHandler {
  return new WebhookHandlerImpl(options);
}

// ============================================================================
// Event Helper Types
// ============================================================================

/**
 * Issue created event helper.
 */
export interface IssueCreatedEvent {
  issue: JiraIssue;
  user?: WebhookEvent['user'];
  timestamp: number;
}

/**
 * Issue updated event helper.
 */
export interface IssueUpdatedEvent {
  issue: JiraIssue;
  changelog?: {
    id: string;
    items: ChangelogItem[];
  };
  user?: WebhookEvent['user'];
  timestamp: number;
}

/**
 * Status changed event helper.
 */
export interface StatusChangedEvent {
  issue: JiraIssue;
  fromStatus: string;
  toStatus: string;
  user?: WebhookEvent['user'];
  timestamp: number;
}

/**
 * Extracts status change from an update event.
 */
export function extractStatusChange(event: WebhookEvent): StatusChangedEvent | null {
  if (event.webhookEvent !== 'jira:issue_updated' || !event.changelog || !event.issue) {
    return null;
  }

  const statusChange = event.changelog.items.find(item => item.field === 'status');
  if (!statusChange) {
    return null;
  }

  return {
    issue: event.issue,
    fromStatus: statusChange.fromString ?? '',
    toStatus: statusChange.toString ?? '',
    user: event.user,
    timestamp: event.timestamp,
  };
}

/**
 * Checks if an event is an issue created event.
 */
export function isIssueCreatedEvent(event: WebhookEvent): event is WebhookEvent & { issue: JiraIssue } {
  return event.webhookEvent === 'jira:issue_created' && event.issue !== undefined;
}

/**
 * Checks if an event is an issue updated event.
 */
export function isIssueUpdatedEvent(event: WebhookEvent): event is WebhookEvent & { issue: JiraIssue } {
  return event.webhookEvent === 'jira:issue_updated' && event.issue !== undefined;
}

/**
 * Checks if an event is an issue deleted event.
 */
export function isIssueDeletedEvent(event: WebhookEvent): event is WebhookEvent & { issue: JiraIssue } {
  return event.webhookEvent === 'jira:issue_deleted' && event.issue !== undefined;
}

/**
 * Checks if an event is a comment event.
 */
export function isCommentEvent(event: WebhookEvent): event is WebhookEvent & { comment: JiraComment } {
  return (
    event.webhookEvent === 'comment_created' ||
    event.webhookEvent === 'comment_updated' ||
    event.webhookEvent === 'comment_deleted'
  ) && event.comment !== undefined;
}

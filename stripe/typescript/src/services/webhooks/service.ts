/**
 * Webhook service implementation
 */
import { verifySignature, generateSignatureHeader } from './signature.js';
import { WebhookHandlerRegistry } from './handlers.js';
import { WebhookSignatureError, WebhookProcessingError } from '../../errors/categories.js';
import type {
  WebhookEvent,
  WebhookEventType,
  WebhookPayload,
  WebhookHandler,
} from '../../types/webhook.js';

/**
 * Webhook service interface
 */
export interface WebhookService {
  /**
   * Verifies and parses a webhook payload
   */
  verifyAndParse(
    payload: WebhookPayload,
    tolerance?: number
  ): WebhookEvent;

  /**
   * Processes an event through registered handlers
   */
  processEvent(event: WebhookEvent): Promise<void>;

  /**
   * Registers a handler for a specific event type
   */
  on<T = Record<string, unknown>>(
    eventType: WebhookEventType,
    handler: WebhookHandler<T>
  ): this;

  /**
   * Registers a handler for all events
   */
  onAll<T = Record<string, unknown>>(handler: WebhookHandler<T>): this;

  /**
   * Checks if an event has been processed
   */
  hasProcessed(eventId: string): boolean;

  /**
   * Gets registered event types
   */
  getRegisteredEventTypes(): WebhookEventType[];

  /**
   * Generates a signature header for testing
   */
  generateTestSignature(payload: string | Buffer, timestamp?: number): string;
}

/**
 * Webhook service implementation
 */
export class WebhookServiceImpl implements WebhookService {
  private readonly webhookSecret: string;
  private readonly defaultTolerance: number;
  private readonly registry: WebhookHandlerRegistry;

  constructor(
    webhookSecret: string,
    defaultTolerance: number = 300
  ) {
    if (!webhookSecret) {
      throw new WebhookSignatureError('Webhook secret is required');
    }

    this.webhookSecret = webhookSecret;
    this.defaultTolerance = defaultTolerance;
    this.registry = new WebhookHandlerRegistry();
  }

  /**
   * Verifies and parses a webhook payload
   */
  verifyAndParse(
    payload: WebhookPayload,
    tolerance?: number
  ): WebhookEvent {
    const { rawBody, signature } = payload;

    // Convert Buffer to string if needed
    const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    // Verify signature
    verifySignature(
      rawBody,
      signature,
      this.webhookSecret,
      tolerance ?? this.defaultTolerance
    );

    // Parse the event
    let event: WebhookEvent;
    try {
      event = JSON.parse(bodyString) as WebhookEvent;
    } catch (error) {
      throw new WebhookProcessingError(
        'Failed to parse webhook payload as JSON',
        undefined,
        { parseError: (error as Error).message }
      );
    }

    // Validate event structure
    if (!event.id || !event.type || !event.data) {
      throw new WebhookProcessingError(
        'Invalid webhook event structure',
        event.id,
        { hasId: !!event.id, hasType: !!event.type, hasData: !!event.data }
      );
    }

    return event;
  }

  /**
   * Processes an event through registered handlers
   */
  async processEvent(event: WebhookEvent): Promise<void> {
    return this.registry.processEvent(event);
  }

  /**
   * Registers a handler for a specific event type
   */
  on<T = Record<string, unknown>>(
    eventType: WebhookEventType,
    handler: WebhookHandler<T>
  ): this {
    this.registry.on(eventType, handler);
    return this;
  }

  /**
   * Registers a handler for all events
   */
  onAll<T = Record<string, unknown>>(handler: WebhookHandler<T>): this {
    this.registry.onAll(handler);
    return this;
  }

  /**
   * Checks if an event has been processed
   */
  hasProcessed(eventId: string): boolean {
    return this.registry.hasProcessed(eventId);
  }

  /**
   * Gets registered event types
   */
  getRegisteredEventTypes(): WebhookEventType[] {
    return this.registry.getRegisteredEventTypes();
  }

  /**
   * Generates a signature header for testing
   */
  generateTestSignature(payload: string | Buffer, timestamp?: number): string {
    return generateSignatureHeader(payload, this.webhookSecret, timestamp);
  }
}

/**
 * Creates a webhook service
 */
export function createWebhookService(
  webhookSecret: string,
  defaultTolerance?: number
): WebhookService {
  return new WebhookServiceImpl(webhookSecret, defaultTolerance);
}

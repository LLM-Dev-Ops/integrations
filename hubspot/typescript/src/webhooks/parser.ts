/**
 * Webhook Event Parser
 *
 * Parses HubSpot webhook payloads into typed event objects
 */

import type { WebhookEvent, WebhookEventType } from '../types/webhooks.js';

/**
 * Error thrown when webhook payload is malformed
 */
export class MalformedPayloadError extends Error {
  constructor(message: string, public readonly payload?: unknown) {
    super(message);
    this.name = 'MalformedPayloadError';
  }
}

/**
 * Raw webhook event from HubSpot
 */
interface RawWebhookEvent {
  eventId?: number;
  subscriptionId?: number;
  portalId?: number;
  appId?: number;
  occurredAt?: number;
  subscriptionType?: string;
  attemptNumber?: number;
  objectId?: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
  sourceId?: string;
  // Association events
  fromObjectId?: number;
  toObjectId?: number;
  associationType?: string;
}

/**
 * Parse webhook event type from subscription type string
 *
 * @param subscriptionType - HubSpot subscription type (e.g., "contact.creation")
 * @returns Parsed webhook event type
 */
export function parseEventType(subscriptionType: string): WebhookEventType {
  const parts = subscriptionType.split('.');
  if (parts.length !== 2) {
    return {
      objectType: 'unknown',
      action: subscriptionType as 'creation' | 'propertyChange' | 'deletion' | 'merge',
    };
  }

  return {
    objectType: parts[0] as string,
    action: parts[1] as 'creation' | 'propertyChange' | 'deletion' | 'merge',
  };
}

/**
 * Parse a single webhook event
 *
 * @param raw - Raw event from HubSpot
 * @returns Parsed webhook event
 * @throws {MalformedPayloadError} if event is malformed
 */
export function parseEvent(raw: RawWebhookEvent): WebhookEvent {
  if (!raw.eventId) {
    throw new MalformedPayloadError('Missing eventId in webhook event', raw);
  }

  if (!raw.subscriptionType) {
    throw new MalformedPayloadError('Missing subscriptionType in webhook event', raw);
  }

  const eventType = parseEventType(raw.subscriptionType);

  return {
    eventId: raw.eventId,
    subscriptionId: raw.subscriptionId ?? 0,
    portalId: raw.portalId ?? 0,
    appId: raw.appId ?? 0,
    occurredAt: raw.occurredAt ?? Date.now(),
    eventType,
    subscriptionType: raw.subscriptionType,
    attemptNumber: raw.attemptNumber ?? 0,
    objectId: raw.objectId ?? raw.fromObjectId ?? 0,
    propertyName: raw.propertyName,
    propertyValue: raw.propertyValue,
    changeSource: raw.changeSource,
    sourceId: raw.sourceId,
    // Association-specific fields
    fromObjectId: raw.fromObjectId,
    toObjectId: raw.toObjectId,
    associationType: raw.associationType,
  };
}

/**
 * Parse webhook payload (can be single event or array)
 *
 * @param body - Raw request body (string or object)
 * @returns Array of parsed webhook events
 * @throws {MalformedPayloadError} if payload cannot be parsed
 */
export function parseWebhookPayload(body: string | unknown): WebhookEvent[] {
  let data: unknown;

  // Parse JSON if string
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body);
    } catch {
      throw new MalformedPayloadError('Invalid JSON in webhook payload', body);
    }
  } else {
    data = body;
  }

  // Handle array of events
  if (Array.isArray(data)) {
    return data.map((raw) => parseEvent(raw as RawWebhookEvent));
  }

  // Handle single event (wrapped or not)
  if (typeof data === 'object' && data !== null) {
    return [parseEvent(data as RawWebhookEvent)];
  }

  throw new MalformedPayloadError('Invalid webhook payload format', data);
}

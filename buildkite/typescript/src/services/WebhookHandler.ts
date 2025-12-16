/**
 * Buildkite Webhook Handler
 * @module services/WebhookHandler
 */

import { BuildkiteError } from '../errors.js';
import type { WebhookPayload, BuildkiteWebhookEvent } from '../types/webhook.js';

/** Constant-time string comparison for security */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export class WebhookHandler {
  /** Validate webhook token */
  validateToken(tokenHeader: string, expectedToken: string): boolean {
    if (!tokenHeader || !expectedToken) {
      return false;
    }
    return timingSafeEqual(tokenHeader, expectedToken);
  }

  /** Process webhook event */
  processEvent(payload: string | Buffer, tokenHeader: string, expectedToken: string): WebhookPayload {
    // Validate token
    if (!this.validateToken(tokenHeader, expectedToken)) {
      throw BuildkiteError.invalidWebhookToken();
    }

    // Parse payload
    const data = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString('utf-8'));

    // Map event type
    const eventType = this.parseEventType(data.event);

    return {
      event: eventType,
      build: data.build,
      job: data.job,
      agent: data.agent,
      pipeline: data.pipeline,
      sender: data.sender,
    };
  }

  /** Parse webhook event type string */
  private parseEventType(eventString: string): BuildkiteWebhookEvent {
    const eventMap: Record<string, BuildkiteWebhookEvent> = {
      'build.scheduled': 'build.scheduled' as BuildkiteWebhookEvent,
      'build.running': 'build.running' as BuildkiteWebhookEvent,
      'build.finished': 'build.finished' as BuildkiteWebhookEvent,
      'build.canceled': 'build.canceled' as BuildkiteWebhookEvent,
      'job.scheduled': 'job.scheduled' as BuildkiteWebhookEvent,
      'job.started': 'job.started' as BuildkiteWebhookEvent,
      'job.finished': 'job.finished' as BuildkiteWebhookEvent,
      'job.activated': 'job.activated' as BuildkiteWebhookEvent,
      'agent.connected': 'agent.connected' as BuildkiteWebhookEvent,
      'agent.disconnected': 'agent.disconnected' as BuildkiteWebhookEvent,
      'agent.stopped': 'agent.stopped' as BuildkiteWebhookEvent,
      'agent.lost': 'agent.lost' as BuildkiteWebhookEvent,
    };

    return eventMap[eventString] || eventString as BuildkiteWebhookEvent;
  }
}

/**
 * Slack API Integration - TypeScript
 *
 * A comprehensive TypeScript client for the Slack API with support for:
 * - Web API (conversations, messages, users, files, reactions, pins, views)
 * - Socket Mode (real-time events via WebSocket)
 * - Events API (webhook-based event delivery)
 * - Incoming Webhooks and Slash Commands
 * - Resilience (retry, circuit breaker, rate limiting)
 * - Observability (logging, metrics, tracing)
 */

// Core exports
export * from './errors';
export * from './config';
export * from './types';
export * from './auth';
export * from './transport';
export * from './client';

// Services
export * from './services';

// Resilience
export * from './resilience';

// Real-time
export * from './events';
export * from './webhooks';
export * from './socket-mode';

// Observability
export * from './observability';

// Testing utilities
export * from './mocks';
export * from './fixtures';

// Convenience re-exports
import { SlackClient, createClient, createClientFromConfig } from './client';
import { SlackConfig, SlackConfigBuilder, createConfigFromEnv } from './config';
import { createServices, SlackServices } from './services';
import { createResilience, ResilienceOrchestrator } from './resilience';
import { createEventDispatcher, EventDispatcher } from './events';
import { createSocketModeClient, SocketModeClient } from './socket-mode';
import { createIncomingWebhook, createWebhookHandler, IncomingWebhook, WebhookHandler } from './webhooks';
import { createObservability, ObservabilityConfig } from './observability';

// Constants
export const DEFAULT_BASE_URL = 'https://slack.com/api';
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Full Slack client with all services
 */
export interface Slack {
  client: SlackClient;
  services: SlackServices;
  resilience: ResilienceOrchestrator;
}

/**
 * Create full Slack client with services
 */
export function createSlack(tokenOrConfig: string | SlackConfig): Slack {
  const config = typeof tokenOrConfig === 'string'
    ? { token: tokenOrConfig, baseUrl: 'https://slack.com/api' }
    : tokenOrConfig;

  const client = createClientFromConfig(config);
  const services = createServices(client);
  const resilience = createResilience();

  return {
    client,
    services,
    resilience,
  };
}

/**
 * Create Slack from environment variables
 */
export function createSlackFromEnv(): Slack {
  const config = createConfigFromEnv();
  return createSlack(config);
}

// Default export
export default {
  createSlack,
  createSlackFromEnv,
  createClient,
  createClientFromConfig,
  createConfigFromEnv,
  createServices,
  createResilience,
  createEventDispatcher,
  createSocketModeClient,
  createIncomingWebhook,
  createWebhookHandler,
  createObservability,
  SlackConfigBuilder,
};

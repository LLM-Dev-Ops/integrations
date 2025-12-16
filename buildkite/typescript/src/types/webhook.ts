/**
 * Buildkite webhook event types.
 *
 * @module types/webhook
 */

import type { Build, Creator, PipelineRef } from './build.js';
import type { Job } from './job.js';
import type { Agent } from './agent.js';

/**
 * Buildkite webhook event types.
 */
export enum BuildkiteWebhookEvent {
  /** Build was scheduled. */
  BuildScheduled = 'build.scheduled',
  /** Build started running. */
  BuildRunning = 'build.running',
  /** Build finished. */
  BuildFinished = 'build.finished',
  /** Build was canceled. */
  BuildCanceled = 'build.canceled',
  /** Job was scheduled. */
  JobScheduled = 'job.scheduled',
  /** Job started. */
  JobStarted = 'job.started',
  /** Job finished. */
  JobFinished = 'job.finished',
  /** Job was activated. */
  JobActivated = 'job.activated',
  /** Agent connected. */
  AgentConnected = 'agent.connected',
  /** Agent disconnected. */
  AgentDisconnected = 'agent.disconnected',
  /** Agent stopped. */
  AgentStopped = 'agent.stopped',
  /** Agent connection lost. */
  AgentLost = 'agent.lost',
}

/**
 * Webhook payload.
 */
export interface WebhookPayload {
  /** Event type. */
  readonly event: BuildkiteWebhookEvent;
  /** Build information (for build events). */
  readonly build?: Build;
  /** Job information (for job events). */
  readonly job?: Job;
  /** Agent information (for agent events). */
  readonly agent?: Agent;
  /** Pipeline reference. */
  readonly pipeline: PipelineRef;
  /** Event sender. */
  readonly sender: Creator;
}

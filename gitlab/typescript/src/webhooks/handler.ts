/**
 * GitLab Webhook Handler
 *
 * Processes GitLab webhook events with validation, routing, and type-safe event handling.
 * Supports pipeline and job webhook events from GitLab CI/CD.
 */

import { WebhookValidator, WebhookRequest } from './validator';
import {
  InvalidWebhookEventError,
  UnknownWebhookEventError,
  SerializationError,
} from '../errors';
import { Pipeline, PipelineStatus, Job, JobStatus, User, Project } from '../types';

/**
 * Response status for webhook processing
 */
export interface WebhookResponse {
  /**
   * Processing status
   * - processed: Event was successfully handled
   * - ignored: Event was not handled (no registered handlers or unsupported event type)
   * - error: An error occurred during processing
   */
  readonly status: 'processed' | 'ignored' | 'error';

  /**
   * Optional message providing additional context
   */
  readonly message?: string;
}

/**
 * Base webhook event structure from GitLab
 */
export interface WebhookEvent {
  /**
   * Type of object (e.g., 'pipeline', 'build')
   */
  readonly object_kind: string;

  /**
   * User who triggered the event
   */
  readonly user?: User;

  /**
   * Project associated with the event
   */
  readonly project?: Project;

  /**
   * Commit associated with the event
   */
  readonly commit?: {
    readonly id: string;
    readonly message: string;
    readonly timestamp: string;
    readonly url: string;
    readonly author: {
      readonly name: string;
      readonly email: string;
    };
  };
}

/**
 * Pipeline webhook event payload
 *
 * Sent when a pipeline is created, updated, or completes.
 * GitLab sends this event with object_kind='pipeline'.
 */
export interface PipelineWebhookEvent extends WebhookEvent {
  readonly object_kind: 'pipeline';

  /**
   * Pipeline details
   */
  readonly object_attributes: {
    readonly id: number;
    readonly iid?: number;
    readonly ref: string;
    readonly sha: string;
    readonly status: PipelineStatus;
    readonly created_at: string;
    readonly updated_at: string;
    readonly started_at?: string;
    readonly finished_at?: string;
    readonly duration?: number;
    readonly queued_duration?: number;
    readonly coverage?: string;
    readonly source?: string;
    readonly detailed_status?: string;
    readonly stages?: readonly string[];
    readonly variables?: readonly {
      readonly key: string;
      readonly value: string;
    }[];
  };

  /**
   * Merge request that triggered the pipeline (if applicable)
   */
  readonly merge_request?: {
    readonly id: number;
    readonly iid: number;
    readonly title: string;
    readonly source_branch: string;
    readonly target_branch: string;
    readonly state: string;
    readonly merge_status: string;
    readonly url: string;
  };

  /**
   * Jobs in the pipeline
   */
  readonly builds?: readonly {
    readonly id: number;
    readonly name: string;
    readonly stage: string;
    readonly status: JobStatus;
    readonly created_at: string;
    readonly started_at?: string;
    readonly finished_at?: string;
    readonly duration?: number;
    readonly allow_failure: boolean;
    readonly user?: User;
  }[];
}

/**
 * Job (build) webhook event payload
 *
 * Sent when a job is created, started, or completes.
 * GitLab sends this event with object_kind='build'.
 */
export interface JobWebhookEvent extends WebhookEvent {
  readonly object_kind: 'build';

  /**
   * Job ID
   */
  readonly build_id: number;

  /**
   * Job name
   */
  readonly build_name: string;

  /**
   * Job stage
   */
  readonly build_stage: string;

  /**
   * Job status
   */
  readonly build_status: JobStatus;

  /**
   * Job start time
   */
  readonly build_started_at?: string;

  /**
   * Job finish time
   */
  readonly build_finished_at?: string;

  /**
   * Job duration in seconds
   */
  readonly build_duration?: number;

  /**
   * Whether the job is allowed to fail
   */
  readonly build_allow_failure: boolean;

  /**
   * Job failure reason
   */
  readonly build_failure_reason?: string;

  /**
   * Git reference (branch/tag)
   */
  readonly ref: string;

  /**
   * Commit SHA
   */
  readonly sha: string;

  /**
   * Whether this is a tag
   */
  readonly tag?: boolean;

  /**
   * Pipeline ID this job belongs to
   */
  readonly pipeline_id?: number;

  /**
   * Runner that executed the job
   */
  readonly runner?: {
    readonly id: number;
    readonly description: string;
    readonly active: boolean;
    readonly is_shared: boolean;
  };

  /**
   * Environment the job deploys to
   */
  readonly environment?: {
    readonly name: string;
    readonly action: string;
    readonly deployment_tier?: string;
  };
}

/**
 * Event handler function type
 */
export type WebhookEventHandler<T = WebhookEvent> = (event: T) => Promise<void>;

/**
 * Webhook handler for processing GitLab webhook events.
 *
 * Provides:
 * - Request validation via WebhookValidator
 * - Event type routing (pipeline, job, etc.)
 * - Type-safe event handlers
 * - Error handling and response formatting
 *
 * @example
 * ```typescript
 * const validator = new WebhookValidator({
 *   expectedTokens: ['my-secret-token']
 * });
 *
 * const handler = new WebhookHandler(validator);
 *
 * // Register pipeline event handler
 * handler.onPipelineEvent(async (event) => {
 *   console.log(`Pipeline ${event.object_attributes.id} status: ${event.object_attributes.status}`);
 * });
 *
 * // Register job event handler
 * handler.onJobEvent(async (event) => {
 *   console.log(`Job ${event.build_name} status: ${event.build_status}`);
 * });
 *
 * // Handle incoming webhook
 * const response = await handler.handle({
 *   headers: { 'x-gitlab-token': 'my-secret-token', 'x-gitlab-event': 'Pipeline Hook' },
 *   body: pipelineEventPayload
 * });
 * ```
 */
export class WebhookHandler {
  private pipelineHandlers: WebhookEventHandler<PipelineWebhookEvent>[] = [];
  private jobHandlers: WebhookEventHandler<JobWebhookEvent>[] = [];

  /**
   * Create a new webhook handler
   *
   * @param validator - WebhookValidator instance for request validation
   */
  constructor(private readonly validator: WebhookValidator) {}

  /**
   * Register a handler for pipeline events.
   *
   * The handler will be called whenever a pipeline webhook event is received.
   * Multiple handlers can be registered and will be called in order.
   *
   * @param handler - Function to handle pipeline events
   *
   * @example
   * ```typescript
   * handler.onPipelineEvent(async (event) => {
   *   if (event.object_attributes.status === 'success') {
   *     console.log('Pipeline succeeded!');
   *   }
   * });
   * ```
   */
  onPipelineEvent(handler: WebhookEventHandler<PipelineWebhookEvent>): void {
    this.pipelineHandlers.push(handler);
  }

  /**
   * Register a handler for job (build) events.
   *
   * The handler will be called whenever a job webhook event is received.
   * Multiple handlers can be registered and will be called in order.
   *
   * @param handler - Function to handle job events
   *
   * @example
   * ```typescript
   * handler.onJobEvent(async (event) => {
   *   if (event.build_status === 'failed') {
   *     console.log(`Job ${event.build_name} failed: ${event.build_failure_reason}`);
   *   }
   * });
   * ```
   */
  onJobEvent(handler: WebhookEventHandler<JobWebhookEvent>): void {
    this.jobHandlers.push(handler);
  }

  /**
   * Handle an incoming webhook request.
   *
   * Performs validation, parses the event, routes to appropriate handlers,
   * and returns a response indicating the processing status.
   *
   * @param request - The webhook request to process
   * @returns Response indicating processing status
   *
   * @example
   * ```typescript
   * const response = await handler.handle({
   *   headers: {
   *     'x-gitlab-token': 'my-secret-token',
   *     'x-gitlab-event': 'Pipeline Hook'
   *   },
   *   body: '{"object_kind":"pipeline",...}'
   * });
   *
   * if (response.status === 'processed') {
   *   console.log('Event processed successfully');
   * }
   * ```
   */
  async handle(request: WebhookRequest): Promise<WebhookResponse> {
    try {
      // 1. Validate the request (token, payload size, IP)
      this.validator.validate(request);

      // 2. Extract event type from headers
      const eventType = this.extractEventType(request.headers);

      // 3. Parse the body
      const body = this.parseBody(request.body);

      // 4. Route to appropriate handler based on object_kind
      await this.routeEvent(body, eventType);

      return {
        status: 'processed',
        message: `Successfully processed ${eventType} event`,
      };
    } catch (error) {
      // If it's an unknown/unsupported event, return ignored status
      if (error instanceof UnknownWebhookEventError) {
        return {
          status: 'ignored',
          message: error.message,
        };
      }

      // For other errors, return error status
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Extract the event type from request headers.
   *
   * GitLab sends the event type in the X-Gitlab-Event header.
   * Example values: 'Pipeline Hook', 'Job Hook', 'Push Hook', etc.
   *
   * @param headers - Request headers
   * @returns The event type
   * @throws {InvalidWebhookEventError} If event header is missing
   */
  private extractEventType(headers: Record<string, string>): string {
    const eventType =
      headers['x-gitlab-event'] ||
      headers['X-Gitlab-Event'] ||
      headers['X-GitLab-Event'];

    if (!eventType) {
      throw new InvalidWebhookEventError('Missing X-Gitlab-Event header');
    }

    return eventType;
  }

  /**
   * Parse the request body.
   *
   * Handles both string and object bodies, ensuring we have a parsed object.
   *
   * @param body - Request body (string or object)
   * @returns Parsed body as an object
   * @throws {SerializationError} If body cannot be parsed
   */
  private parseBody(body: string | object): any {
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch (error) {
        throw new SerializationError(
          'Failed to parse webhook payload as JSON',
          error instanceof Error ? error : undefined
        );
      }
    }

    return body;
  }

  /**
   * Route the event to the appropriate handler(s).
   *
   * Determines the event type based on object_kind and calls registered handlers.
   *
   * @param event - Parsed event object
   * @param eventType - Event type from X-Gitlab-Event header
   * @throws {UnknownWebhookEventError} If event type is not supported
   */
  private async routeEvent(event: any, eventType: string): Promise<void> {
    const objectKind = event.object_kind;

    if (!objectKind) {
      throw new InvalidWebhookEventError('Missing object_kind in webhook payload');
    }

    switch (objectKind) {
      case 'pipeline':
        await this.handlePipelineEvent(this.parsePipelineEvent(event));
        break;

      case 'build':
        await this.handleJobEvent(this.parseJobEvent(event));
        break;

      default:
        // Event type not supported by this handler
        throw new UnknownWebhookEventError(objectKind);
    }
  }

  /**
   * Handle pipeline events by calling all registered pipeline handlers.
   *
   * @param event - The pipeline event
   */
  private async handlePipelineEvent(event: PipelineWebhookEvent): Promise<void> {
    if (this.pipelineHandlers.length === 0) {
      // No handlers registered, event is ignored
      return;
    }

    // Execute all handlers in sequence
    for (const handler of this.pipelineHandlers) {
      await handler(event);
    }
  }

  /**
   * Handle job events by calling all registered job handlers.
   *
   * @param event - The job event
   */
  private async handleJobEvent(event: JobWebhookEvent): Promise<void> {
    if (this.jobHandlers.length === 0) {
      // No handlers registered, event is ignored
      return;
    }

    // Execute all handlers in sequence
    for (const handler of this.jobHandlers) {
      await handler(event);
    }
  }

  /**
   * Parse and validate a pipeline webhook event.
   *
   * Ensures the event has the required structure for a pipeline event.
   *
   * @param body - Raw event object
   * @returns Typed pipeline event
   * @throws {InvalidWebhookEventError} If event structure is invalid
   */
  private parsePipelineEvent(body: any): PipelineWebhookEvent {
    if (!body.object_attributes) {
      throw new InvalidWebhookEventError(
        'Pipeline event missing object_attributes'
      );
    }

    if (typeof body.object_attributes.id !== 'number') {
      throw new InvalidWebhookEventError(
        'Pipeline event object_attributes.id must be a number'
      );
    }

    // Return the event with proper typing
    return body as PipelineWebhookEvent;
  }

  /**
   * Parse and validate a job webhook event.
   *
   * Ensures the event has the required structure for a job event.
   *
   * @param body - Raw event object
   * @returns Typed job event
   * @throws {InvalidWebhookEventError} If event structure is invalid
   */
  private parseJobEvent(body: any): JobWebhookEvent {
    if (typeof body.build_id !== 'number') {
      throw new InvalidWebhookEventError(
        'Job event missing or invalid build_id'
      );
    }

    if (typeof body.build_name !== 'string') {
      throw new InvalidWebhookEventError(
        'Job event missing or invalid build_name'
      );
    }

    if (typeof body.build_status !== 'string') {
      throw new InvalidWebhookEventError(
        'Job event missing or invalid build_status'
      );
    }

    // Return the event with proper typing
    return body as JobWebhookEvent;
  }
}

/**
 * Docker Hub webhook handler implementation following SPARC specification.
 *
 * Provides webhook validation, event parsing, and handler dispatch for Docker Hub push events.
 */

import { z } from 'zod';
import { DockerHubError, DockerHubErrorKind } from '../errors.js';

// ============================================================================
// Webhook Payload Schemas
// ============================================================================

/**
 * Zod schema for push data in webhook payload.
 */
const PushDataPayloadSchema = z.object({
  pushedAt: z.number().int().positive(),
  pusher: z.string().min(1),
  tag: z.string().min(1),
  images: z.array(z.string()),
});

/**
 * Zod schema for repository data in webhook payload.
 */
const RepositoryPayloadSchema = z.object({
  commentCount: z.number().int().nonnegative(),
  dateCreated: z.number().int().positive(),
  description: z.string(),
  dockerfile: z.string(),
  fullDescription: z.string(),
  isOfficial: z.boolean(),
  isPrivate: z.boolean(),
  isTrusted: z.boolean(),
  name: z.string().min(1),
  namespace: z.string().min(1),
  owner: z.string().min(1),
  repoName: z.string().min(1),
  repoUrl: z.string().url(),
  starCount: z.number().int().nonnegative(),
  status: z.string(),
});

/**
 * Zod schema for the complete webhook payload.
 */
const WebhookPayloadSchema = z.object({
  callbackUrl: z.string().url(),
  pushData: PushDataPayloadSchema,
  repository: RepositoryPayloadSchema,
});

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Push data in webhook payload.
 */
export interface WebhookPayload {
  callbackUrl: string;
  pushData: {
    pushedAt: number;
    pusher: string;
    tag: string;
    images: string[];
  };
  repository: {
    commentCount: number;
    dateCreated: number;
    description: string;
    dockerfile: string;
    fullDescription: string;
    isOfficial: boolean;
    isPrivate: boolean;
    isTrusted: boolean;
    name: string;
    namespace: string;
    owner: string;
    repoName: string;
    repoUrl: string;
    starCount: number;
    status: string;
  };
}

/**
 * Webhook event type.
 */
export type WebhookEventType = 'push' | 'delete';

/**
 * Parsed webhook event.
 */
export interface WebhookEvent {
  /** Event type */
  type: WebhookEventType;
  /** Repository name */
  repository: string;
  /** Repository namespace */
  namespace: string;
  /** Tag that was pushed */
  tag: string;
  /** Username of the pusher */
  pusher: string;
  /** Event timestamp */
  timestamp: Date;
  /** List of image digests */
  images: string[];
}

// ============================================================================
// Webhook Handler Interface
// ============================================================================

/**
 * Webhook handler interface.
 */
export interface WebhookHandler {
  /**
   * Parses raw webhook payload.
   *
   * @param body - Raw request body (string or bytes)
   * @returns Parsed webhook payload
   * @throws DockerHubError if payload is invalid
   */
  parsePayload(body: string | Uint8Array): WebhookPayload;

  /**
   * Converts webhook payload to event.
   *
   * @param payload - Parsed webhook payload
   * @returns Webhook event
   */
  toEvent(payload: WebhookPayload): WebhookEvent;

  /**
   * Handles webhook by parsing and converting to event.
   *
   * @param body - Raw request body
   * @returns Webhook event
   * @throws DockerHubError if handling fails
   */
  handle(body: string | Uint8Array): Promise<WebhookEvent>;
}

// ============================================================================
// Webhook Handler Implementation
// ============================================================================

/**
 * Docker Hub webhook handler implementation.
 */
export class WebhookHandlerImpl implements WebhookHandler {
  /**
   * Parses raw webhook payload.
   *
   * Docker Hub doesn't use cryptographic signatures like GitHub,
   * so we validate the payload structure instead.
   *
   * @param body - Raw request body (string or bytes)
   * @returns Parsed webhook payload
   * @throws DockerHubError if payload is invalid or malformed
   */
  parsePayload(body: string | Uint8Array): WebhookPayload {
    try {
      // Convert Uint8Array to string if needed
      const bodyStr = typeof body === 'string' ? body : new TextDecoder().decode(body);

      // Validate non-empty body
      if (!bodyStr || bodyStr.trim().length === 0) {
        throw new DockerHubError(
          DockerHubErrorKind.Unknown,
          'Webhook payload is empty',
          { statusCode: 400 }
        );
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyStr);
      } catch (error) {
        throw new DockerHubError(
          DockerHubErrorKind.Unknown,
          `Failed to parse webhook payload as JSON: ${error instanceof Error ? error.message : String(error)}`,
          { statusCode: 400, cause: error instanceof Error ? error : undefined }
        );
      }

      // Validate against schema
      const result = WebhookPayloadSchema.safeParse(parsed);
      if (!result.success) {
        const errors = result.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');

        throw new DockerHubError(
          DockerHubErrorKind.Unknown,
          `Invalid webhook payload structure: ${errors}`,
          { statusCode: 400, details: errors }
        );
      }

      return result.data as WebhookPayload;
    } catch (error) {
      // Re-throw DockerHubError as-is
      if (error instanceof DockerHubError) {
        throw error;
      }

      // Wrap unexpected errors
      throw new DockerHubError(
        DockerHubErrorKind.Unknown,
        `Unexpected error parsing webhook payload: ${error instanceof Error ? error.message : String(error)}`,
        { statusCode: 500, cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Converts webhook payload to event.
   *
   * Transforms the Docker Hub webhook payload format into a normalized event.
   * Handles timestamp conversion from Unix epoch to Date objects.
   *
   * @param payload - Parsed webhook payload
   * @returns Webhook event
   */
  toEvent(payload: WebhookPayload): WebhookEvent {
    // Convert Unix timestamp (seconds) to Date
    const timestamp = new Date(payload.pushData.pushedAt * 1000);

    // Docker Hub webhooks are currently push-only
    // In the future, delete events might be added
    const eventType: WebhookEventType = 'push';

    return {
      type: eventType,
      repository: payload.repository.name,
      namespace: payload.repository.namespace,
      tag: payload.pushData.tag,
      pusher: payload.pushData.pusher,
      timestamp,
      images: payload.pushData.images,
    };
  }

  /**
   * Handles webhook by parsing and converting to event.
   *
   * This is the main entry point for webhook processing.
   * It combines parsing and event conversion into a single async operation.
   *
   * @param body - Raw request body
   * @returns Webhook event
   * @throws DockerHubError if handling fails
   */
  async handle(body: string | Uint8Array): Promise<WebhookEvent> {
    try {
      // Parse the payload
      const payload = this.parsePayload(body);

      // Convert to event
      const event = this.toEvent(payload);

      return event;
    } catch (error) {
      // Re-throw DockerHubError as-is
      if (error instanceof DockerHubError) {
        throw error;
      }

      // Wrap unexpected errors
      throw new DockerHubError(
        DockerHubErrorKind.Unknown,
        `Failed to handle webhook: ${error instanceof Error ? error.message : String(error)}`,
        { statusCode: 500, cause: error instanceof Error ? error : undefined }
      );
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a webhook handler instance.
 *
 * @returns New webhook handler
 */
export function createWebhookHandler(): WebhookHandler {
  return new WebhookHandlerImpl();
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates that a webhook payload has required fields.
 *
 * @param payload - Payload to validate
 * @throws DockerHubError if validation fails
 */
export function validateWebhookPayload(payload: unknown): asserts payload is WebhookPayload {
  const result = WebhookPayloadSchema.safeParse(payload);
  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');

    throw new DockerHubError(
      DockerHubErrorKind.Unknown,
      `Invalid webhook payload: ${errors}`,
      { statusCode: 400, details: errors }
    );
  }
}

/**
 * Type guard to check if a value is a valid webhook payload.
 *
 * @param value - Value to check
 * @returns True if value is a valid webhook payload
 */
export function isWebhookPayload(value: unknown): value is WebhookPayload {
  return WebhookPayloadSchema.safeParse(value).success;
}

/**
 * Type guard to check if an event is a push event.
 *
 * @param event - Event to check
 * @returns True if event is a push event
 */
export function isPushEvent(event: WebhookEvent): boolean {
  return event.type === 'push';
}

/**
 * Type guard to check if an event is a delete event.
 *
 * @param event - Event to check
 * @returns True if event is a delete event
 */
export function isDeleteEvent(event: WebhookEvent): boolean {
  return event.type === 'delete';
}

// ============================================================================
// Event Helper Functions
// ============================================================================

/**
 * Extracts the full repository name (namespace/repository) from an event.
 *
 * @param event - Webhook event
 * @returns Full repository name
 */
export function getFullRepositoryName(event: WebhookEvent): string {
  return `${event.namespace}/${event.repository}`;
}

/**
 * Extracts the full image reference (namespace/repository:tag) from an event.
 *
 * @param event - Webhook event
 * @returns Full image reference
 */
export function getImageReference(event: WebhookEvent): string {
  return `${event.namespace}/${event.repository}:${event.tag}`;
}

/**
 * Checks if an event is for a private repository.
 *
 * Note: This information is not directly available in the event.
 * You need to check the original payload's repository.isPrivate field.
 *
 * @param payload - Original webhook payload
 * @returns True if repository is private
 */
export function isPrivateRepository(payload: WebhookPayload): boolean {
  return payload.repository.isPrivate;
}

/**
 * Checks if an event is for an official Docker Hub image.
 *
 * @param payload - Original webhook payload
 * @returns True if repository is official
 */
export function isOfficialImage(payload: WebhookPayload): boolean {
  return payload.repository.isOfficial;
}

/**
 * Checks if an event is for a trusted repository.
 *
 * @param payload - Original webhook payload
 * @returns True if repository is trusted
 */
export function isTrustedRepository(payload: WebhookPayload): boolean {
  return payload.repository.isTrusted;
}

/**
 * Extracts repository metadata from webhook payload.
 *
 * @param payload - Webhook payload
 * @returns Repository metadata object
 */
export function extractRepositoryMetadata(payload: WebhookPayload): {
  namespace: string;
  name: string;
  owner: string;
  description: string;
  isPrivate: boolean;
  isOfficial: boolean;
  isTrusted: boolean;
  starCount: number;
  url: string;
} {
  return {
    namespace: payload.repository.namespace,
    name: payload.repository.name,
    owner: payload.repository.owner,
    description: payload.repository.description,
    isPrivate: payload.repository.isPrivate,
    isOfficial: payload.repository.isOfficial,
    isTrusted: payload.repository.isTrusted,
    starCount: payload.repository.starCount,
    url: payload.repository.repoUrl,
  };
}

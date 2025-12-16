/**
 * GitLab Webhook Handling Module
 *
 * Handles incoming GitLab webhook events with validation and parsing.
 * Supports all major webhook event types including push, merge requests,
 * pipelines, jobs, issues, notes, and tag pushes.
 *
 * @example
 * ```typescript
 * const handler = createWebhookHandler('my-secret-token');
 *
 * // In your webhook endpoint
 * app.post('/webhook', (req, res) => {
 *   try {
 *     const event = handler.handle(req.headers, req.body);
 *     console.log(`Received ${event.type} event`);
 *     // Process event...
 *     res.status(200).send('OK');
 *   } catch (error) {
 *     console.error('Webhook error:', error);
 *     res.status(400).send('Bad Request');
 *   }
 * });
 * ```
 */

import {
  WebhookValidationError,
  InvalidWebhookEventError,
  UnknownWebhookEventError,
} from '../errors.js';
import { PipelineStatus, JobStatus } from '../types.js';

// ============================================================================
// Webhook Action Enums
// ============================================================================

/**
 * Actions that can occur on a merge request
 */
export type MergeRequestAction =
  | 'open'
  | 'close'
  | 'reopen'
  | 'update'
  | 'approved'
  | 'unapproved'
  | 'merge';

/**
 * Actions that can occur on an issue
 */
export type IssueAction = 'open' | 'close' | 'reopen' | 'update';

// ============================================================================
// Webhook Resource Types
// ============================================================================

/**
 * Simplified project information in webhook payloads
 */
export interface WebhookProject {
  readonly id: number;
  readonly name: string;
  readonly path_with_namespace: string;
  readonly web_url: string;
  readonly default_branch: string;
}

/**
 * Simplified user information in webhook payloads
 */
export interface WebhookUser {
  readonly id: number;
  readonly username: string;
  readonly name: string;
  readonly email?: string;
  readonly avatar_url: string;
}

/**
 * Commit information in webhook payloads
 */
export interface WebhookCommit {
  readonly id: string;
  readonly message: string;
  readonly title: string;
  readonly timestamp: string;
  readonly author: {
    readonly name: string;
    readonly email: string;
  };
  readonly url: string;
}

/**
 * Merge request information in webhook payloads
 */
export interface WebhookMergeRequest {
  readonly id: number;
  readonly iid: number;
  readonly title: string;
  readonly description: string;
  readonly state: string;
  readonly source_branch: string;
  readonly target_branch: string;
  readonly url: string;
}

/**
 * Pipeline information in webhook payloads
 */
export interface WebhookPipeline {
  readonly id: number;
  readonly ref: string;
  readonly sha: string;
  readonly status: string;
  readonly url: string;
}

/**
 * Job information in webhook payloads
 */
export interface WebhookJob {
  readonly id: number;
  readonly name: string;
  readonly stage: string;
  readonly status: string;
  readonly started_at?: string;
  readonly finished_at?: string;
}

/**
 * Issue information in webhook payloads
 */
export interface WebhookIssue {
  readonly id: number;
  readonly iid: number;
  readonly title: string;
  readonly description?: string;
  readonly state: string;
  readonly url: string;
}

/**
 * Note (comment) information in webhook payloads
 */
export interface WebhookNote {
  readonly id: number;
  readonly body: string;
  readonly noteable_id: number;
  readonly noteable_type: string;
  readonly url: string;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * Push event - triggered when commits are pushed to a branch
 */
export interface PushEvent {
  readonly type: 'push';
  readonly ref: string;
  readonly before: string;
  readonly after: string;
  readonly commits: readonly WebhookCommit[];
  readonly project: WebhookProject;
  readonly user: WebhookUser;
}

/**
 * Merge request event - triggered by merge request actions
 */
export interface MergeRequestEvent {
  readonly type: 'merge_request';
  readonly action: MergeRequestAction;
  readonly merge_request: WebhookMergeRequest;
  readonly project: WebhookProject;
  readonly user: WebhookUser;
}

/**
 * Pipeline event - triggered when pipeline status changes
 */
export interface PipelineEvent {
  readonly type: 'pipeline';
  readonly status: PipelineStatus;
  readonly pipeline: WebhookPipeline;
  readonly project: WebhookProject;
  readonly builds: readonly WebhookJob[];
}

/**
 * Job event - triggered when job status changes
 */
export interface JobEvent {
  readonly type: 'job';
  readonly status: JobStatus;
  readonly job: WebhookJob;
  readonly project: WebhookProject;
}

/**
 * Issue event - triggered by issue actions
 */
export interface IssueEvent {
  readonly type: 'issue';
  readonly action: IssueAction;
  readonly issue: WebhookIssue;
  readonly project: WebhookProject;
  readonly user: WebhookUser;
}

/**
 * Note event - triggered when comments are added
 */
export interface NoteEvent {
  readonly type: 'note';
  readonly note: WebhookNote;
  readonly noteable_type: 'Issue' | 'MergeRequest' | 'Commit' | 'Snippet';
  readonly project: WebhookProject;
  readonly user: WebhookUser;
}

/**
 * Tag push event - triggered when tags are pushed
 */
export interface TagPushEvent {
  readonly type: 'tag_push';
  readonly ref: string;
  readonly before: string;
  readonly after: string;
  readonly project: WebhookProject;
  readonly user: WebhookUser;
}

/**
 * Union type for all webhook events
 * Discriminated by the 'type' field
 */
export type WebhookEvent =
  | PushEvent
  | MergeRequestEvent
  | PipelineEvent
  | JobEvent
  | IssueEvent
  | NoteEvent
  | TagPushEvent;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Get header value from Headers object or plain object
 *
 * @param headers - Headers object or plain object
 * @param name - Header name (case-insensitive)
 * @returns Header value or undefined
 */
function getHeader(
  headers: Headers | Record<string, string>,
  name: string
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) || undefined;
  }

  // Check for exact match first
  if (headers[name]) {
    return headers[name];
  }

  // Try case-insensitive match
  const lowerName = name.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === lowerName) {
      return headers[key];
    }
  }

  return undefined;
}

// ============================================================================
// WebhookHandler Class
// ============================================================================

/**
 * Handler for GitLab webhook events
 *
 * Validates webhook signatures and parses webhook payloads into typed events.
 * Supports optional secret token validation for security.
 *
 * @example
 * ```typescript
 * const handler = new WebhookHandler('my-secret-token');
 * const event = handler.handle(req.headers, req.body);
 *
 * switch (event.type) {
 *   case 'push':
 *     console.log(`Push to ${event.ref} with ${event.commits.length} commits`);
 *     break;
 *   case 'merge_request':
 *     console.log(`MR ${event.action}: ${event.merge_request.title}`);
 *     break;
 *   // ... handle other event types
 * }
 * ```
 */
export class WebhookHandler {
  private readonly secretToken?: string;

  /**
   * Create a new webhook handler
   *
   * @param secretToken - Optional secret token for webhook validation
   */
  constructor(secretToken?: string) {
    this.secretToken = secretToken;
  }

  /**
   * Validate webhook request using X-Gitlab-Token header
   *
   * @param headers - Request headers
   * @param body - Request body (unused but included for API consistency)
   * @throws {WebhookValidationError} If validation fails
   */
  validate(headers: Headers | Record<string, string>, body?: string | Buffer): void {
    // If no secret token is configured, skip validation
    if (!this.secretToken) {
      return;
    }

    const token = getHeader(headers, 'X-Gitlab-Token');

    if (!token) {
      throw new WebhookValidationError('Missing X-Gitlab-Token header');
    }

    // Use constant-time comparison to prevent timing attacks
    if (!constantTimeEqual(token, this.secretToken)) {
      throw new WebhookValidationError('Invalid webhook token');
    }
  }

  /**
   * Parse webhook payload into a typed event
   *
   * @param headers - Request headers
   * @param body - Request body (string, Buffer, or parsed JSON object)
   * @returns Parsed webhook event
   * @throws {WebhookValidationError} If validation fails
   * @throws {InvalidWebhookEventError} If X-Gitlab-Event header is missing
   * @throws {UnknownWebhookEventError} If event type is not supported
   */
  parse(
    headers: Headers | Record<string, string>,
    body: string | Buffer | object
  ): WebhookEvent {
    // Validate first
    this.validate(headers, typeof body === 'string' || Buffer.isBuffer(body) ? body : undefined);

    // Get event type from header
    const eventHeader = getHeader(headers, 'X-Gitlab-Event');
    if (!eventHeader) {
      throw new InvalidWebhookEventError('Missing X-Gitlab-Event header');
    }

    // Parse body if it's a string or Buffer
    let payload: any;
    if (typeof body === 'string') {
      try {
        payload = JSON.parse(body);
      } catch (error) {
        throw new InvalidWebhookEventError('Invalid JSON in request body');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        payload = JSON.parse(body.toString('utf-8'));
      } catch (error) {
        throw new InvalidWebhookEventError('Invalid JSON in request body');
      }
    } else {
      payload = body;
    }

    // Route to appropriate parser based on event type
    switch (eventHeader) {
      case 'Push Hook':
        return this.parsePushEvent(payload);
      case 'Merge Request Hook':
        return this.parseMergeRequestEvent(payload);
      case 'Pipeline Hook':
        return this.parsePipelineEvent(payload);
      case 'Job Hook':
        return this.parseJobEvent(payload);
      case 'Issue Hook':
        return this.parseIssueEvent(payload);
      case 'Note Hook':
        return this.parseNoteEvent(payload);
      case 'Tag Push Hook':
        return this.parseTagPushEvent(payload);
      default:
        throw new UnknownWebhookEventError(eventHeader);
    }
  }

  /**
   * Convenience method that combines validate and parse
   *
   * @param headers - Request headers
   * @param body - Request body (string, Buffer, or parsed JSON object)
   * @returns Parsed webhook event
   * @throws {WebhookValidationError} If validation fails
   * @throws {InvalidWebhookEventError} If X-Gitlab-Event header is missing
   * @throws {UnknownWebhookEventError} If event type is not supported
   */
  handle(
    headers: Headers | Record<string, string>,
    body: string | Buffer | object
  ): WebhookEvent {
    return this.parse(headers, body);
  }

  // ==========================================================================
  // Private Event Parsers
  // ==========================================================================

  /**
   * Parse push event payload
   */
  private parsePushEvent(payload: any): PushEvent {
    return {
      type: 'push',
      ref: payload.ref,
      before: payload.before,
      after: payload.after,
      commits: (payload.commits || []).map((c: any) => ({
        id: c.id,
        message: c.message,
        title: c.title,
        timestamp: c.timestamp,
        author: {
          name: c.author.name,
          email: c.author.email,
        },
        url: c.url,
      })),
      project: {
        id: payload.project.id,
        name: payload.project.name,
        path_with_namespace: payload.project.path_with_namespace,
        web_url: payload.project.web_url,
        default_branch: payload.project.default_branch,
      },
      user: {
        id: payload.user_id,
        username: payload.user_username,
        name: payload.user_name,
        email: payload.user_email,
        avatar_url: payload.user_avatar,
      },
    };
  }

  /**
   * Parse merge request event payload
   */
  private parseMergeRequestEvent(payload: any): MergeRequestEvent {
    // Map GitLab's action to our enum
    let action: MergeRequestAction;
    const objectAttributes = payload.object_attributes || {};

    // GitLab uses 'object_attributes.action' for the action
    const rawAction = objectAttributes.action || payload.action;

    switch (rawAction) {
      case 'open':
        action = 'open';
        break;
      case 'close':
        action = 'close';
        break;
      case 'reopen':
        action = 'reopen';
        break;
      case 'update':
        action = 'update';
        break;
      case 'approved':
        action = 'approved';
        break;
      case 'unapproved':
        action = 'unapproved';
        break;
      case 'merge':
        action = 'merge';
        break;
      default:
        action = 'update'; // Default to update for unknown actions
    }

    return {
      type: 'merge_request',
      action,
      merge_request: {
        id: objectAttributes.id,
        iid: objectAttributes.iid,
        title: objectAttributes.title,
        description: objectAttributes.description || '',
        state: objectAttributes.state,
        source_branch: objectAttributes.source_branch,
        target_branch: objectAttributes.target_branch,
        url: objectAttributes.url,
      },
      project: {
        id: payload.project.id,
        name: payload.project.name,
        path_with_namespace: payload.project.path_with_namespace,
        web_url: payload.project.web_url,
        default_branch: payload.project.default_branch,
      },
      user: {
        id: payload.user.id,
        username: payload.user.username,
        name: payload.user.name,
        email: payload.user.email,
        avatar_url: payload.user.avatar_url,
      },
    };
  }

  /**
   * Parse pipeline event payload
   */
  private parsePipelineEvent(payload: any): PipelineEvent {
    const objectAttributes = payload.object_attributes || {};

    return {
      type: 'pipeline',
      status: objectAttributes.status as PipelineStatus,
      pipeline: {
        id: objectAttributes.id,
        ref: objectAttributes.ref,
        sha: objectAttributes.sha,
        status: objectAttributes.status,
        url: objectAttributes.url || `${payload.project.web_url}/-/pipelines/${objectAttributes.id}`,
      },
      project: {
        id: payload.project.id,
        name: payload.project.name,
        path_with_namespace: payload.project.path_with_namespace,
        web_url: payload.project.web_url,
        default_branch: payload.project.default_branch,
      },
      builds: (payload.builds || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        stage: b.stage,
        status: b.status,
        started_at: b.started_at,
        finished_at: b.finished_at,
      })),
    };
  }

  /**
   * Parse job event payload
   */
  private parseJobEvent(payload: any): JobEvent {
    return {
      type: 'job',
      status: payload.build_status as JobStatus,
      job: {
        id: payload.build_id,
        name: payload.build_name,
        stage: payload.build_stage,
        status: payload.build_status,
        started_at: payload.build_started_at,
        finished_at: payload.build_finished_at,
      },
      project: {
        id: payload.project_id,
        name: payload.project_name,
        path_with_namespace: payload.repository?.path_with_namespace || `${payload.project_name}`,
        web_url: payload.repository?.homepage || '',
        default_branch: payload.ref?.split('/').pop() || 'main',
      },
    };
  }

  /**
   * Parse issue event payload
   */
  private parseIssueEvent(payload: any): IssueEvent {
    const objectAttributes = payload.object_attributes || {};

    // Map GitLab's action to our enum
    let action: IssueAction;
    const rawAction = objectAttributes.action || payload.action;

    switch (rawAction) {
      case 'open':
        action = 'open';
        break;
      case 'close':
        action = 'close';
        break;
      case 'reopen':
        action = 'reopen';
        break;
      case 'update':
        action = 'update';
        break;
      default:
        action = 'update'; // Default to update for unknown actions
    }

    return {
      type: 'issue',
      action,
      issue: {
        id: objectAttributes.id,
        iid: objectAttributes.iid,
        title: objectAttributes.title,
        description: objectAttributes.description,
        state: objectAttributes.state,
        url: objectAttributes.url,
      },
      project: {
        id: payload.project.id,
        name: payload.project.name,
        path_with_namespace: payload.project.path_with_namespace,
        web_url: payload.project.web_url,
        default_branch: payload.project.default_branch,
      },
      user: {
        id: payload.user.id,
        username: payload.user.username,
        name: payload.user.name,
        email: payload.user.email,
        avatar_url: payload.user.avatar_url,
      },
    };
  }

  /**
   * Parse note event payload
   */
  private parseNoteEvent(payload: any): NoteEvent {
    const objectAttributes = payload.object_attributes || {};

    // Map GitLab's noteable_type to our enum
    let noteableType: 'Issue' | 'MergeRequest' | 'Commit' | 'Snippet';
    switch (objectAttributes.noteable_type) {
      case 'Issue':
        noteableType = 'Issue';
        break;
      case 'MergeRequest':
        noteableType = 'MergeRequest';
        break;
      case 'Commit':
        noteableType = 'Commit';
        break;
      case 'Snippet':
        noteableType = 'Snippet';
        break;
      default:
        noteableType = 'Issue'; // Default to Issue
    }

    return {
      type: 'note',
      note: {
        id: objectAttributes.id,
        body: objectAttributes.note,
        noteable_id: objectAttributes.noteable_id,
        noteable_type: objectAttributes.noteable_type,
        url: objectAttributes.url,
      },
      noteable_type: noteableType,
      project: {
        id: payload.project.id,
        name: payload.project.name,
        path_with_namespace: payload.project.path_with_namespace,
        web_url: payload.project.web_url,
        default_branch: payload.project.default_branch,
      },
      user: {
        id: payload.user.id,
        username: payload.user.username,
        name: payload.user.name,
        email: payload.user.email,
        avatar_url: payload.user.avatar_url,
      },
    };
  }

  /**
   * Parse tag push event payload
   */
  private parseTagPushEvent(payload: any): TagPushEvent {
    return {
      type: 'tag_push',
      ref: payload.ref,
      before: payload.before,
      after: payload.after,
      project: {
        id: payload.project.id,
        name: payload.project.name,
        path_with_namespace: payload.project.path_with_namespace,
        web_url: payload.project.web_url,
        default_branch: payload.project.default_branch,
      },
      user: {
        id: payload.user_id,
        username: payload.user_username,
        name: payload.user_name,
        email: payload.user_email,
        avatar_url: payload.user_avatar,
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new webhook handler instance
 *
 * @param secretToken - Optional secret token for webhook validation
 * @returns WebhookHandler instance
 *
 * @example
 * ```typescript
 * const handler = createWebhookHandler(process.env.GITLAB_WEBHOOK_SECRET);
 * ```
 */
export function createWebhookHandler(secretToken?: string): WebhookHandler {
  return new WebhookHandler(secretToken);
}

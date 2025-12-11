/**
 * GitHub Webhooks Module
 *
 * Provides webhook verification, event types, and processing
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Webhook event types
 */
export enum WebhookEventType {
  BRANCH_PROTECTION_RULE = 'branch_protection_rule',
  CHECK_RUN = 'check_run',
  CHECK_SUITE = 'check_suite',
  CODE_SCANNING_ALERT = 'code_scanning_alert',
  COMMIT_COMMENT = 'commit_comment',
  CREATE = 'create',
  DELETE = 'delete',
  DEPLOY_KEY = 'deploy_key',
  DEPLOYMENT = 'deployment',
  DEPLOYMENT_STATUS = 'deployment_status',
  DISCUSSION = 'discussion',
  DISCUSSION_COMMENT = 'discussion_comment',
  FORK = 'fork',
  GITHUB_APP_AUTHORIZATION = 'github_app_authorization',
  GOLLUM = 'gollum',
  INSTALLATION = 'installation',
  INSTALLATION_REPOSITORIES = 'installation_repositories',
  ISSUE_COMMENT = 'issue_comment',
  ISSUES = 'issues',
  LABEL = 'label',
  MARKETPLACE_PURCHASE = 'marketplace_purchase',
  MEMBER = 'member',
  MEMBERSHIP = 'membership',
  META = 'meta',
  MILESTONE = 'milestone',
  ORGANIZATION = 'organization',
  ORG_BLOCK = 'org_block',
  PACKAGE = 'package',
  PAGE_BUILD = 'page_build',
  PING = 'ping',
  PROJECT = 'project',
  PROJECT_CARD = 'project_card',
  PROJECT_COLUMN = 'project_column',
  PUBLIC = 'public',
  PULL_REQUEST = 'pull_request',
  PULL_REQUEST_REVIEW = 'pull_request_review',
  PULL_REQUEST_REVIEW_COMMENT = 'pull_request_review_comment',
  PULL_REQUEST_REVIEW_THREAD = 'pull_request_review_thread',
  PUSH = 'push',
  RELEASE = 'release',
  REPOSITORY = 'repository',
  REPOSITORY_DISPATCH = 'repository_dispatch',
  REPOSITORY_IMPORT = 'repository_import',
  REPOSITORY_VULNERABILITY_ALERT = 'repository_vulnerability_alert',
  SECRET_SCANNING_ALERT = 'secret_scanning_alert',
  SECURITY_ADVISORY = 'security_advisory',
  SPONSORSHIP = 'sponsorship',
  STAR = 'star',
  STATUS = 'status',
  TEAM = 'team',
  TEAM_ADD = 'team_add',
  WATCH = 'watch',
  WORKFLOW_DISPATCH = 'workflow_dispatch',
  WORKFLOW_JOB = 'workflow_job',
  WORKFLOW_RUN = 'workflow_run',
}

/**
 * Common webhook event properties
 */
export interface WebhookEvent {
  action?: string;
  sender: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    type: string;
  };
  repository?: {
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    private: boolean;
    owner: {
      login: string;
      id: number;
      type: string;
    };
    html_url: string;
    description: string | null;
    fork: boolean;
    created_at: string;
    updated_at: string;
    pushed_at: string;
    default_branch: string;
  };
  organization?: {
    login: string;
    id: number;
    node_id: string;
    url: string;
    description: string;
  };
  installation?: {
    id: number;
    node_id: string;
  };
}

/**
 * Push event payload
 */
export interface PushEvent extends WebhookEvent {
  ref: string;
  before: string;
  after: string;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  base_ref: string | null;
  compare: string;
  commits: Array<{
    id: string;
    tree_id: string;
    distinct: boolean;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  head_commit: {
    id: string;
    tree_id: string;
    distinct: boolean;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  } | null;
  pusher: {
    name: string;
    email: string;
  };
}

/**
 * Pull request event payload
 */
export interface PullRequestEvent extends WebhookEvent {
  action:
    | 'assigned'
    | 'unassigned'
    | 'labeled'
    | 'unlabeled'
    | 'opened'
    | 'edited'
    | 'closed'
    | 'reopened'
    | 'synchronize'
    | 'converted_to_draft'
    | 'ready_for_review'
    | 'locked'
    | 'unlocked'
    | 'review_requested'
    | 'review_request_removed'
    | 'auto_merge_enabled'
    | 'auto_merge_disabled';
  number: number;
  pull_request: {
    id: number;
    node_id: string;
    number: number;
    state: 'open' | 'closed';
    locked: boolean;
    title: string;
    body: string | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    merge_commit_sha: string | null;
    draft: boolean;
    user: {
      login: string;
      id: number;
      type: string;
    };
    head: {
      label: string;
      ref: string;
      sha: string;
      repo: {
        id: number;
        name: string;
        full_name: string;
      } | null;
    };
    base: {
      label: string;
      ref: string;
      sha: string;
      repo: {
        id: number;
        name: string;
        full_name: string;
      };
    };
    merged: boolean;
    mergeable: boolean | null;
    mergeable_state: string;
    merged_by: {
      login: string;
      id: number;
    } | null;
    comments: number;
    review_comments: number;
    commits: number;
    additions: number;
    deletions: number;
    changed_files: number;
  };
}

/**
 * Issue event payload
 */
export interface IssueEvent extends WebhookEvent {
  action:
    | 'opened'
    | 'edited'
    | 'deleted'
    | 'pinned'
    | 'unpinned'
    | 'closed'
    | 'reopened'
    | 'assigned'
    | 'unassigned'
    | 'labeled'
    | 'unlabeled'
    | 'locked'
    | 'unlocked'
    | 'transferred'
    | 'milestoned'
    | 'demilestoned';
  issue: {
    id: number;
    node_id: string;
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    locked: boolean;
    user: {
      login: string;
      id: number;
      type: string;
    };
    labels: Array<{
      id: number;
      node_id: string;
      name: string;
      color: string;
      default: boolean;
      description: string | null;
    }>;
    assignee: {
      login: string;
      id: number;
    } | null;
    assignees: Array<{
      login: string;
      id: number;
    }>;
    milestone: {
      id: number;
      number: number;
      title: string;
      description: string | null;
      state: 'open' | 'closed';
    } | null;
    comments: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
  };
}

/**
 * Issue comment event payload
 */
export interface IssueCommentEvent extends WebhookEvent {
  action: 'created' | 'edited' | 'deleted';
  issue: IssueEvent['issue'];
  comment: {
    id: number;
    node_id: string;
    url: string;
    html_url: string;
    body: string;
    user: {
      login: string;
      id: number;
      type: string;
    };
    created_at: string;
    updated_at: string;
  };
}

/**
 * Release event payload
 */
export interface ReleaseEvent extends WebhookEvent {
  action: 'published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: {
    id: number;
    node_id: string;
    tag_name: string;
    target_commitish: string;
    name: string | null;
    draft: boolean;
    prerelease: boolean;
    created_at: string;
    published_at: string | null;
    body: string | null;
    author: {
      login: string;
      id: number;
      type: string;
    };
    assets: Array<{
      id: number;
      name: string;
      label: string | null;
      content_type: string;
      state: string;
      size: number;
      download_count: number;
      created_at: string;
      updated_at: string;
      browser_download_url: string;
    }>;
  };
}

/**
 * Workflow run event payload
 */
export interface WorkflowRunEvent extends WebhookEvent {
  action: 'completed' | 'requested' | 'in_progress';
  workflow_run: {
    id: number;
    name: string;
    node_id: string;
    head_branch: string;
    head_sha: string;
    run_number: number;
    event: string;
    status: string | null;
    conclusion: string | null;
    workflow_id: number;
    check_suite_id: number;
    check_suite_node_id: string;
    url: string;
    html_url: string;
    created_at: string;
    updated_at: string;
    run_attempt: number;
    run_started_at: string;
  };
  workflow: {
    id: number;
    node_id: string;
    name: string;
    path: string;
    state: string;
    created_at: string;
    updated_at: string;
    url: string;
    html_url: string;
    badge_url: string;
  } | null;
}

/**
 * Ping event payload
 */
export interface PingEvent extends WebhookEvent {
  zen: string;
  hook_id: number;
  hook: {
    type: string;
    id: number;
    name: string;
    active: boolean;
    events: string[];
    config: {
      url: string;
      content_type: string;
      insecure_ssl: string;
    };
    updated_at: string;
    created_at: string;
  };
}

/**
 * Webhook verification result
 */
export interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Webhook verifier
 */
export class WebhookVerifier {
  /**
   * Verify webhook signature
   */
  static verify(signature: string, payload: string | Buffer, secret: string): VerificationResult {
    if (!signature) {
      return { valid: false, error: 'Missing signature' };
    }

    if (!secret) {
      return { valid: false, error: 'Missing secret' };
    }

    try {
      const expectedSignature = this.computeSignature(secret, payload);

      // GitHub uses sha256 and sends signature as "sha256=<hex>"
      if (!signature.startsWith('sha256=')) {
        return { valid: false, error: 'Invalid signature format' };
      }

      const receivedHex = signature.substring(7);
      const expectedHex = expectedSignature.substring(7);

      if (receivedHex.length !== expectedHex.length) {
        return { valid: false, error: 'Signature length mismatch' };
      }

      // Use timing-safe comparison to prevent timing attacks
      const receivedBuffer = Buffer.from(receivedHex, 'hex');
      const expectedBuffer = Buffer.from(expectedHex, 'hex');

      const valid = timingSafeEqual(receivedBuffer, expectedBuffer);

      return { valid, error: valid ? undefined : 'Signature mismatch' };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Compute HMAC signature
   */
  static computeSignature(secret: string, payload: string | Buffer): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }
}

/**
 * Compute webhook signature (standalone function)
 */
export function computeSignature(secret: string, payload: string | Buffer): string {
  return WebhookVerifier.computeSignature(secret, payload);
}

/**
 * Webhook handler interface
 */
export interface WebhookHandler<T = unknown> {
  /**
   * Handle webhook event
   */
  handle(event: T, eventType: string): Promise<void> | void;

  /**
   * Optional event type filter
   */
  eventType?: WebhookEventType | WebhookEventType[];

  /**
   * Optional action filter
   */
  action?: string | string[];
}

/**
 * Webhook processor options
 */
export interface WebhookProcessorOptions {
  /**
   * Secret for webhook verification
   */
  secret?: string;

  /**
   * Skip signature verification (not recommended for production)
   */
  skipVerification?: boolean;

  /**
   * Custom error handler
   */
  onError?: (error: Error, event: unknown) => void;
}

/**
 * Webhook processor
 */
export class WebhookProcessor {
  private handlers: Map<string, WebhookHandler[]> = new Map();

  constructor(private readonly options: WebhookProcessorOptions = {}) {}

  /**
   * Register a webhook handler
   */
  on<T = unknown>(
    eventType: WebhookEventType | WebhookEventType[] | '*',
    handler: WebhookHandler<T> | ((event: T, eventType: string) => Promise<void> | void)
  ): this {
    const eventTypes = eventType === '*' ? ['*'] : Array.isArray(eventType) ? eventType : [eventType];

    const handlerObj: WebhookHandler<T> =
      typeof handler === 'function' ? { handle: handler } : handler;

    for (const type of eventTypes) {
      const existingHandlers = this.handlers.get(type) || [];
      existingHandlers.push(handlerObj as WebhookHandler);
      this.handlers.set(type, existingHandlers);
    }

    return this;
  }

  /**
   * Process webhook event
   */
  async process(
    payload: string | Buffer,
    eventType: string,
    signature?: string
  ): Promise<void> {
    // Verify signature if secret is provided and verification is not skipped
    if (this.options.secret && !this.options.skipVerification) {
      if (!signature) {
        throw new Error('Webhook signature is required');
      }

      const verification = WebhookVerifier.verify(signature, payload, this.options.secret);
      if (!verification.valid) {
        throw new Error(`Webhook verification failed: ${verification.error}`);
      }
    }

    // Parse payload
    let event: unknown;
    try {
      event = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
    } catch (error) {
      throw new Error('Failed to parse webhook payload');
    }

    // Get handlers for this event type
    const specificHandlers = this.handlers.get(eventType) || [];
    const wildcardHandlers = this.handlers.get('*') || [];
    const allHandlers = [...specificHandlers, ...wildcardHandlers];

    if (allHandlers.length === 0) {
      return; // No handlers registered for this event
    }

    // Get action from event if present
    const action = (event as WebhookEvent).action;

    // Execute handlers
    for (const handler of allHandlers) {
      // Check if handler has action filter
      if (handler.action) {
        const allowedActions = Array.isArray(handler.action) ? handler.action : [handler.action];
        if (action && !allowedActions.includes(action)) {
          continue; // Skip this handler
        }
      }

      try {
        await handler.handle(event, eventType);
      } catch (error) {
        if (this.options.onError) {
          this.options.onError(error instanceof Error ? error : new Error(String(error)), event);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Remove all handlers for an event type
   */
  removeHandlers(eventType: WebhookEventType | '*'): void {
    this.handlers.delete(eventType);
  }

  /**
   * Clear all handlers
   */
  clearHandlers(): void {
    this.handlers.clear();
  }
}

/**
 * Create a webhook processor
 */
export function createWebhookProcessor(options?: WebhookProcessorOptions): WebhookProcessor {
  return new WebhookProcessor(options);
}

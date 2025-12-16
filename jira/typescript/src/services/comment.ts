/**
 * Comment service implementation following SPARC specification.
 *
 * Provides CRUD operations for issue comments.
 */

import { JiraClient } from '../client/index.js';
import {
  JiraComment,
  IssueKeyOrId,
  AddCommentInput,
  CommentVisibility,
  textToAdf,
  AdfDocument,
  isValidIssueKey,
  isNumericId,
} from '../types/index.js';
import { InvalidIssueKeyError, ResourceNotFoundError } from '../errors/index.js';

// ============================================================================
// Comment Service Interface
// ============================================================================

/**
 * Options for listing comments.
 */
export interface ListCommentsOptions {
  /** Start index for pagination */
  startAt?: number;
  /** Maximum results to return */
  maxResults?: number;
  /** Order by (created, -created) */
  orderBy?: 'created' | '-created';
  /** Expand options */
  expand?: ('renderedBody')[];
}

/**
 * Paginated comments result.
 */
export interface CommentsResult {
  /** Comments */
  comments: JiraComment[];
  /** Start index */
  startAt: number;
  /** Max results */
  maxResults: number;
  /** Total available */
  total: number;
}

/**
 * Comment service interface.
 */
export interface CommentService {
  /** List comments for an issue */
  list(issueKeyOrId: IssueKeyOrId, options?: ListCommentsOptions): Promise<CommentsResult>;
  /** Get a specific comment */
  get(issueKeyOrId: IssueKeyOrId, commentId: string): Promise<JiraComment>;
  /** Add a comment to an issue */
  add(issueKeyOrId: IssueKeyOrId, input: AddCommentInput): Promise<JiraComment>;
  /** Update a comment */
  update(issueKeyOrId: IssueKeyOrId, commentId: string, body: string | AdfDocument): Promise<JiraComment>;
  /** Delete a comment */
  delete(issueKeyOrId: IssueKeyOrId, commentId: string): Promise<void>;
}

// ============================================================================
// Comment Service Implementation
// ============================================================================

/**
 * Comment service implementation.
 */
export class CommentServiceImpl implements CommentService {
  private readonly client: JiraClient;

  constructor(client: JiraClient) {
    this.client = client;
  }

  /**
   * Lists comments for an issue.
   */
  async list(issueKeyOrId: IssueKeyOrId, options: ListCommentsOptions = {}): Promise<CommentsResult> {
    return this.client.tracer.withSpan(
      'jira.comment.list',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        const query: Record<string, string | number> = {};
        if (options.startAt !== undefined) {
          query.startAt = options.startAt;
        }
        if (options.maxResults !== undefined) {
          query.maxResults = options.maxResults;
        }
        if (options.orderBy) {
          query.orderBy = options.orderBy;
        }
        if (options.expand?.length) {
          query.expand = options.expand.join(',');
        }

        return this.client.get<CommentsResult>(
          `/issue/${issueKeyOrId}/comment`,
          query
        );
      },
      { operation: 'listComments' }
    );
  }

  /**
   * Gets a specific comment.
   */
  async get(issueKeyOrId: IssueKeyOrId, commentId: string): Promise<JiraComment> {
    return this.client.tracer.withSpan(
      'jira.comment.get',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));
        span.setAttribute('comment_id', commentId);

        this.validateIssueKeyOrId(issueKeyOrId);

        return this.client.get<JiraComment>(
          `/issue/${issueKeyOrId}/comment/${commentId}`
        );
      },
      { operation: 'getComment' }
    );
  }

  /**
   * Adds a comment to an issue.
   */
  async add(issueKeyOrId: IssueKeyOrId, input: AddCommentInput): Promise<JiraComment> {
    return this.client.tracer.withSpan(
      'jira.comment.add',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        const body: Record<string, unknown> = {
          body: typeof input.body === 'string' ? textToAdf(input.body) : input.body,
        };

        if (input.visibility) {
          body.visibility = input.visibility;
        }

        const comment = await this.client.post<JiraComment>(
          `/issue/${issueKeyOrId}/comment`,
          body
        );

        this.client.logger.info('Comment added', {
          issue: this.redactIssueKey(issueKeyOrId),
          commentId: comment.id,
        });

        return comment;
      },
      { operation: 'addComment' }
    );
  }

  /**
   * Updates a comment.
   */
  async update(
    issueKeyOrId: IssueKeyOrId,
    commentId: string,
    body: string | AdfDocument
  ): Promise<JiraComment> {
    return this.client.tracer.withSpan(
      'jira.comment.update',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));
        span.setAttribute('comment_id', commentId);

        this.validateIssueKeyOrId(issueKeyOrId);

        const requestBody = {
          body: typeof body === 'string' ? textToAdf(body) : body,
        };

        const comment = await this.client.put<JiraComment>(
          `/issue/${issueKeyOrId}/comment/${commentId}`,
          requestBody
        );

        this.client.logger.info('Comment updated', {
          issue: this.redactIssueKey(issueKeyOrId),
          commentId,
        });

        return comment;
      },
      { operation: 'updateComment' }
    );
  }

  /**
   * Deletes a comment.
   */
  async delete(issueKeyOrId: IssueKeyOrId, commentId: string): Promise<void> {
    return this.client.tracer.withSpan(
      'jira.comment.delete',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));
        span.setAttribute('comment_id', commentId);

        this.validateIssueKeyOrId(issueKeyOrId);

        await this.client.delete(`/issue/${issueKeyOrId}/comment/${commentId}`);

        this.client.logger.info('Comment deleted', {
          issue: this.redactIssueKey(issueKeyOrId),
          commentId,
        });
      },
      { operation: 'deleteComment' }
    );
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private validateIssueKeyOrId(value: string): void {
    if (!isValidIssueKey(value) && !isNumericId(value)) {
      throw new InvalidIssueKeyError(value);
    }
  }

  private redactIssueKey(key: string): string {
    return key.replace(/\d+$/, '***');
  }
}

/**
 * Creates a comment service instance.
 */
export function createCommentService(client: JiraClient): CommentService {
  return new CommentServiceImpl(client);
}

/**
 * Issue service implementation following SPARC specification.
 *
 * Provides CRUD operations for issues and workflow transitions.
 */

import { JiraClient } from '../client/index.js';
import {
  JiraIssue,
  IssueKeyOrId,
  CreateIssueInput,
  UpdateIssueInput,
  TransitionInput,
  JiraTransition,
  IssueChangelog,
  textToAdf,
  AdfDocument,
  isValidIssueKey,
  isNumericId,
  validateSummary,
} from '../types/index.js';
import {
  ValidationError,
  InvalidIssueKeyError,
  TransitionNotFoundError,
  AlreadyInStatusError,
  IssueNotFoundError,
} from '../errors/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// Issue Service Interface
// ============================================================================

/**
 * Options for getting an issue.
 */
export interface GetIssueOptions {
  /** Fields to return (default: all) */
  fields?: string[];
  /** Expand options */
  expand?: ('changelog' | 'names' | 'renderedFields' | 'transitions' | 'operations')[];
}

/**
 * Options for updating an issue.
 */
export interface UpdateIssueOptions {
  /** Whether to notify users of the update */
  notifyUsers?: boolean;
  /** Override screen security */
  overrideScreenSecurity?: boolean;
  /** Override editable flag */
  overrideEditableFlag?: boolean;
}

/**
 * Transition result.
 */
export interface TransitionResult {
  /** Whether the transition was executed */
  transitioned: boolean;
  /** Previous status name */
  fromStatus?: string;
  /** New status name */
  toStatus?: string;
}

/**
 * Issue service interface.
 */
export interface IssueService {
  /** Create a new issue */
  create(input: CreateIssueInput): Promise<JiraIssue>;
  /** Get an issue by key or ID */
  get(issueKeyOrId: IssueKeyOrId, options?: GetIssueOptions): Promise<JiraIssue>;
  /** Update an issue */
  update(issueKeyOrId: IssueKeyOrId, input: UpdateIssueInput, options?: UpdateIssueOptions): Promise<void>;
  /** Delete an issue */
  delete(issueKeyOrId: IssueKeyOrId, deleteSubtasks?: boolean): Promise<void>;
  /** Get available transitions for an issue */
  getTransitions(issueKeyOrId: IssueKeyOrId): Promise<JiraTransition[]>;
  /** Transition an issue to a new status */
  transition(issueKeyOrId: IssueKeyOrId, input: TransitionInput): Promise<void>;
  /** Transition an issue by target status name */
  transitionByName(issueKeyOrId: IssueKeyOrId, statusName: string, fields?: Record<string, unknown>): Promise<TransitionResult>;
  /** Get issue changelog */
  getChangelog(issueKeyOrId: IssueKeyOrId, startAt?: number, maxResults?: number): Promise<IssueChangelog>;
}

// ============================================================================
// Issue Service Implementation
// ============================================================================

/**
 * Issue service implementation.
 */
export class IssueServiceImpl implements IssueService {
  private readonly client: JiraClient;

  constructor(client: JiraClient) {
    this.client = client;
  }

  /**
   * Creates a new issue.
   */
  async create(input: CreateIssueInput): Promise<JiraIssue> {
    return this.client.tracer.withSpan(
      'jira.issue.create',
      async (span) => {
        const projectKey = typeof input.project === 'string' ? input.project : input.project.id;
        span.setAttribute('project', projectKey);

        // Validate input
        const summaryErrors = validateSummary(input.summary);
        if (summaryErrors.length > 0) {
          throw new ValidationError(summaryErrors);
        }

        // Build request body
        const fields = this.buildCreateFields(input);

        // Create the issue
        const response = await this.client.post<{ id: string; key: string; self: string }>(
          '/issue',
          { fields }
        );

        this.client.logger.info('Issue created', { key: response.key });
        this.client.metrics.increment(MetricNames.ISSUES_CREATED, 1, { project: projectKey });

        // Fetch the full issue
        return this.get(response.key);
      },
      { operation: 'createIssue' }
    );
  }

  /**
   * Gets an issue by key or ID.
   */
  async get(issueKeyOrId: IssueKeyOrId, options?: GetIssueOptions): Promise<JiraIssue> {
    return this.client.tracer.withSpan(
      'jira.issue.get',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        const query: Record<string, string> = {};
        if (options?.fields?.length) {
          query.fields = options.fields.join(',');
        }
        if (options?.expand?.length) {
          query.expand = options.expand.join(',');
        }

        return this.client.get<JiraIssue>(`/issue/${issueKeyOrId}`, query);
      },
      { operation: 'getIssue' }
    );
  }

  /**
   * Updates an issue.
   */
  async update(
    issueKeyOrId: IssueKeyOrId,
    input: UpdateIssueInput,
    options?: UpdateIssueOptions
  ): Promise<void> {
    return this.client.tracer.withSpan(
      'jira.issue.update',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        // Validate summary if provided
        if (input.summary !== undefined) {
          const summaryErrors = validateSummary(input.summary);
          if (summaryErrors.length > 0) {
            throw new ValidationError(summaryErrors);
          }
        }

        // Build request body
        const body = this.buildUpdateBody(input);

        // Build query parameters
        const query: Record<string, string | boolean> = {};
        if (options?.notifyUsers === false) {
          query.notifyUsers = false;
        }
        if (options?.overrideScreenSecurity) {
          query.overrideScreenSecurity = true;
        }
        if (options?.overrideEditableFlag) {
          query.overrideEditableFlag = true;
        }

        await this.client.put<void>(`/issue/${issueKeyOrId}`, body);

        this.client.logger.info('Issue updated', { issue: this.redactIssueKey(issueKeyOrId) });
        this.client.metrics.increment(MetricNames.ISSUES_UPDATED);
      },
      { operation: 'updateIssue' }
    );
  }

  /**
   * Deletes an issue.
   */
  async delete(issueKeyOrId: IssueKeyOrId, deleteSubtasks: boolean = false): Promise<void> {
    return this.client.tracer.withSpan(
      'jira.issue.delete',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        const query = deleteSubtasks ? { deleteSubtasks: 'true' } : undefined;
        await this.client.delete(`/issue/${issueKeyOrId}${query ? '?deleteSubtasks=true' : ''}`);

        this.client.logger.info('Issue deleted', { issue: this.redactIssueKey(issueKeyOrId) });
        this.client.metrics.increment(MetricNames.ISSUES_DELETED);
      },
      { operation: 'deleteIssue' }
    );
  }

  /**
   * Gets available transitions for an issue.
   */
  async getTransitions(issueKeyOrId: IssueKeyOrId): Promise<JiraTransition[]> {
    return this.client.tracer.withSpan(
      'jira.issue.transitions',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        const response = await this.client.get<{ transitions: JiraTransition[] }>(
          `/issue/${issueKeyOrId}/transitions`,
          { expand: 'transitions.fields' }
        );

        span.setAttribute('transition_count', response.transitions.length);
        return response.transitions;
      },
      { operation: 'getTransitions' }
    );
  }

  /**
   * Transitions an issue to a new status.
   */
  async transition(issueKeyOrId: IssueKeyOrId, input: TransitionInput): Promise<void> {
    return this.client.tracer.withSpan(
      'jira.issue.transition',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        // Get current issue for logging
        const currentIssue = await this.get(issueKeyOrId);
        const fromStatus = currentIssue.fields.status.name;

        // Resolve transition ID
        const transitionId = typeof input.transition === 'string'
          ? input.transition
          : input.transition.id;

        // Validate transition is available
        const transitions = await this.getTransitions(issueKeyOrId);
        const transition = transitions.find(t => t.id === transitionId || t.name.toLowerCase() === transitionId.toLowerCase());

        if (!transition) {
          throw new TransitionNotFoundError(transitionId);
        }

        span.setAttribute('from_status', fromStatus);
        span.setAttribute('to_status', transition.to.name);

        // Build request body
        const body: Record<string, unknown> = {
          transition: { id: transition.id },
        };

        if (input.fields) {
          body.fields = input.fields;
        }

        if (input.comment) {
          const commentBody = typeof input.comment === 'string'
            ? textToAdf(input.comment)
            : input.comment;
          body.update = {
            comment: [{ add: { body: commentBody } }],
          };
        }

        await this.client.post<void>(`/issue/${issueKeyOrId}/transitions`, body);

        this.client.logger.info('Issue transitioned', {
          issue: this.redactIssueKey(issueKeyOrId),
          from: fromStatus,
          to: transition.to.name,
        });

        this.client.metrics.increment(MetricNames.TRANSITIONS_TOTAL, 1, {
          from_status: fromStatus,
          to_status: transition.to.name,
        });
      },
      { operation: 'transition' }
    );
  }

  /**
   * Transitions an issue by target status name (idempotent).
   */
  async transitionByName(
    issueKeyOrId: IssueKeyOrId,
    statusName: string,
    fields?: Record<string, unknown>
  ): Promise<TransitionResult> {
    return this.client.tracer.withSpan(
      'jira.issue.transitionByName',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));
        span.setAttribute('target_status', statusName);

        // Get current issue
        const issue = await this.get(issueKeyOrId);
        const currentStatus = issue.fields.status.name;

        // Check if already in target status
        if (currentStatus.toLowerCase() === statusName.toLowerCase()) {
          this.client.logger.debug('Issue already in target status', {
            issue: this.redactIssueKey(issueKeyOrId),
            status: statusName,
          });
          return {
            transitioned: false,
            fromStatus: currentStatus,
            toStatus: currentStatus,
          };
        }

        // Find transition to target status
        const transitions = await this.getTransitions(issueKeyOrId);
        const transition = transitions.find(
          t => t.to.name.toLowerCase() === statusName.toLowerCase()
        );

        if (!transition) {
          throw new TransitionNotFoundError(statusName);
        }

        // Execute transition
        await this.transition(issueKeyOrId, {
          transition: { id: transition.id },
          fields,
        });

        return {
          transitioned: true,
          fromStatus: currentStatus,
          toStatus: transition.to.name,
        };
      },
      { operation: 'transitionByName' }
    );
  }

  /**
   * Gets issue changelog.
   */
  async getChangelog(
    issueKeyOrId: IssueKeyOrId,
    startAt: number = 0,
    maxResults: number = 100
  ): Promise<IssueChangelog> {
    return this.client.tracer.withSpan(
      'jira.issue.changelog',
      async (span) => {
        span.setAttribute('issue', this.redactIssueKey(issueKeyOrId));

        this.validateIssueKeyOrId(issueKeyOrId);

        return this.client.get<IssueChangelog>(
          `/issue/${issueKeyOrId}/changelog`,
          { startAt, maxResults }
        );
      },
      { operation: 'getChangelog' }
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
    // Redact the numeric part for privacy
    return key.replace(/\d+$/, '***');
  }

  private buildCreateFields(input: CreateIssueInput): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    // Project
    if (typeof input.project === 'string') {
      fields.project = { key: input.project };
    } else {
      fields.project = input.project;
    }

    // Issue type
    if (typeof input.issueType === 'string') {
      fields.issuetype = { name: input.issueType };
    } else {
      fields.issuetype = input.issueType;
    }

    // Summary
    fields.summary = input.summary;

    // Description
    if (input.description !== undefined) {
      fields.description = typeof input.description === 'string'
        ? textToAdf(input.description)
        : input.description;
    }

    // Priority
    if (input.priority !== undefined) {
      if (typeof input.priority === 'string') {
        fields.priority = { name: input.priority };
      } else {
        fields.priority = input.priority;
      }
    }

    // Assignee
    if (input.assignee !== undefined) {
      if (typeof input.assignee === 'string') {
        fields.assignee = { accountId: input.assignee };
      } else {
        fields.assignee = input.assignee;
      }
    }

    // Labels
    if (input.labels !== undefined) {
      fields.labels = input.labels;
    }

    // Components
    if (input.components !== undefined) {
      fields.components = input.components.map(c =>
        typeof c === 'string' ? { name: c } : c
      );
    }

    // Fix versions
    if (input.fixVersions !== undefined) {
      fields.fixVersions = input.fixVersions.map(v =>
        typeof v === 'string' ? { name: v } : v
      );
    }

    // Due date
    if (input.dueDate !== undefined) {
      fields.duedate = input.dueDate;
    }

    // Parent
    if (input.parent !== undefined) {
      if (typeof input.parent === 'string') {
        fields.parent = { key: input.parent };
      } else {
        fields.parent = input.parent;
      }
    }

    // Custom fields
    if (input.customFields) {
      for (const [key, value] of Object.entries(input.customFields)) {
        const fieldKey = key.startsWith('customfield_') ? key : `customfield_${key}`;
        fields[fieldKey] = value;
      }
    }

    return fields;
  }

  private buildUpdateBody(input: UpdateIssueInput): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    if (input.summary !== undefined) {
      fields.summary = input.summary;
    }

    if (input.description !== undefined) {
      fields.description = input.description === null
        ? null
        : typeof input.description === 'string'
          ? textToAdf(input.description)
          : input.description;
    }

    if (input.priority !== undefined) {
      if (typeof input.priority === 'string') {
        fields.priority = { name: input.priority };
      } else {
        fields.priority = input.priority;
      }
    }

    if (input.assignee !== undefined) {
      if (input.assignee === null) {
        fields.assignee = null;
      } else if (typeof input.assignee === 'string') {
        fields.assignee = { accountId: input.assignee };
      } else {
        fields.assignee = input.assignee;
      }
    }

    if (input.labels !== undefined) {
      fields.labels = input.labels;
    }

    if (input.components !== undefined) {
      fields.components = input.components.map(c =>
        typeof c === 'string' ? { name: c } : c
      );
    }

    if (input.fixVersions !== undefined) {
      fields.fixVersions = input.fixVersions.map(v =>
        typeof v === 'string' ? { name: v } : v
      );
    }

    if (input.dueDate !== undefined) {
      fields.duedate = input.dueDate;
    }

    if (input.customFields) {
      for (const [key, value] of Object.entries(input.customFields)) {
        const fieldKey = key.startsWith('customfield_') ? key : `customfield_${key}`;
        fields[fieldKey] = value;
      }
    }

    return { fields };
  }
}

/**
 * Creates an issue service instance.
 */
export function createIssueService(client: JiraClient): IssueService {
  return new IssueServiceImpl(client);
}

/**
 * Jira type definitions following SPARC specification.
 *
 * Core types for issue management, workflow transitions, and API interactions.
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Jira issue key format (e.g., "PROJ-123").
 */
export type IssueKey = string;

/**
 * Jira issue ID (numeric string).
 */
export type IssueId = string;

/**
 * Issue key or ID - used for flexible lookups.
 */
export type IssueKeyOrId = IssueKey | IssueId;

/**
 * Jira project key format (e.g., "PROJ").
 */
export type ProjectKey = string;

/**
 * Account ID for Jira users.
 */
export type AccountId = string;

// ============================================================================
// User Types
// ============================================================================

/**
 * Jira user representation.
 */
export interface JiraUser {
  /** Unique account ID */
  accountId: AccountId;
  /** Display name */
  displayName: string;
  /** Email address (may be hidden based on privacy settings) */
  emailAddress?: string;
  /** Avatar URLs at various sizes */
  avatarUrls?: {
    '16x16'?: string;
    '24x24'?: string;
    '32x32'?: string;
    '48x48'?: string;
  };
  /** Whether the user is active */
  active?: boolean;
  /** User's timezone */
  timeZone?: string;
  /** Account type (atlassian, app, customer) */
  accountType?: 'atlassian' | 'app' | 'customer';
}

// ============================================================================
// Project Types
// ============================================================================

/**
 * Jira project representation.
 */
export interface JiraProject {
  /** Project ID */
  id: string;
  /** Project key */
  key: ProjectKey;
  /** Project name */
  name: string;
  /** Self URL */
  self?: string;
  /** Avatar URLs */
  avatarUrls?: Record<string, string>;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * Status category (maps to workflow states).
 */
export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'DONE';

/**
 * Status category details from Jira API.
 */
export interface StatusCategoryDetails {
  /** Category ID */
  id: number;
  /** Category key */
  key: string;
  /** Category color name */
  colorName: string;
  /** Category name */
  name: string;
}

/**
 * Jira status representation.
 */
export interface JiraStatus {
  /** Status ID */
  id: string;
  /** Status name */
  name: string;
  /** Status description */
  description?: string;
  /** Status category */
  statusCategory: StatusCategoryDetails;
  /** Self URL */
  self?: string;
}

/**
 * Maps Jira status category key to our normalized category.
 */
export function normalizeStatusCategory(key: string): StatusCategory {
  switch (key.toLowerCase()) {
    case 'new':
    case 'undefined':
      return 'TODO';
    case 'indeterminate':
      return 'IN_PROGRESS';
    case 'done':
      return 'DONE';
    default:
      return 'TODO';
  }
}

// ============================================================================
// Priority Types
// ============================================================================

/**
 * Jira priority representation.
 */
export interface JiraPriority {
  /** Priority ID */
  id: string;
  /** Priority name */
  name: string;
  /** Icon URL */
  iconUrl?: string;
  /** Self URL */
  self?: string;
}

// ============================================================================
// Issue Type
// ============================================================================

/**
 * Jira issue type representation.
 */
export interface JiraIssueType {
  /** Issue type ID */
  id: string;
  /** Issue type name */
  name: string;
  /** Issue type description */
  description?: string;
  /** Icon URL */
  iconUrl?: string;
  /** Whether this is a subtask type */
  subtask: boolean;
  /** Self URL */
  self?: string;
}

// ============================================================================
// Component and Version Types
// ============================================================================

/**
 * Jira component representation.
 */
export interface JiraComponent {
  /** Component ID */
  id: string;
  /** Component name */
  name: string;
  /** Component description */
  description?: string;
  /** Self URL */
  self?: string;
}

/**
 * Jira version (fix version / affects version).
 */
export interface JiraVersion {
  /** Version ID */
  id: string;
  /** Version name */
  name: string;
  /** Version description */
  description?: string;
  /** Whether the version is archived */
  archived?: boolean;
  /** Whether the version is released */
  released?: boolean;
  /** Release date */
  releaseDate?: string;
  /** Self URL */
  self?: string;
}

// ============================================================================
// Atlassian Document Format (ADF) Types
// ============================================================================

/**
 * ADF node types.
 */
export type AdfNodeType =
  | 'doc'
  | 'paragraph'
  | 'text'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'codeBlock'
  | 'blockquote'
  | 'rule'
  | 'hardBreak'
  | 'table'
  | 'tableRow'
  | 'tableHeader'
  | 'tableCell'
  | 'panel'
  | 'mention'
  | 'emoji'
  | 'inlineCard'
  | 'mediaGroup'
  | 'mediaSingle'
  | 'media';

/**
 * ADF text mark types.
 */
export type AdfMarkType =
  | 'strong'
  | 'em'
  | 'strike'
  | 'code'
  | 'underline'
  | 'link'
  | 'textColor'
  | 'subsup';

/**
 * ADF mark definition.
 */
export interface AdfMark {
  type: AdfMarkType;
  attrs?: Record<string, unknown>;
}

/**
 * ADF node definition.
 */
export interface AdfNode {
  type: AdfNodeType;
  content?: AdfNode[];
  text?: string;
  marks?: AdfMark[];
  attrs?: Record<string, unknown>;
}

/**
 * ADF document structure.
 */
export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfNode[];
}

/**
 * Converts plain text to ADF document.
 */
export function textToAdf(text: string): AdfDocument {
  const paragraphs = text.split('\n\n').filter(p => p.trim());

  return {
    version: 1,
    type: 'doc',
    content: paragraphs.map(para => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para }],
    })),
  };
}

/**
 * Extracts plain text from ADF document.
 */
export function adfToText(doc: AdfDocument): string {
  const extractText = (node: AdfNode): string => {
    if (node.text) return node.text;
    if (!node.content) return '';
    return node.content.map(extractText).join('');
  };

  return doc.content.map(extractText).join('\n\n');
}

/**
 * Validates ADF document structure.
 */
export function validateAdf(doc: AdfDocument, maxDepth: number = 10): boolean {
  if (doc.version !== 1 || doc.type !== 'doc') return false;
  if (!Array.isArray(doc.content)) return false;

  const checkDepth = (node: AdfNode, depth: number): boolean => {
    if (depth > maxDepth) return false;
    if (node.text && node.text.length > 100000) return false;
    if (!node.content) return true;
    return node.content.every(child => checkDepth(child, depth + 1));
  };

  return doc.content.every(node => checkDepth(node, 1));
}

// ============================================================================
// Issue Fields Types
// ============================================================================

/**
 * Jira issue fields structure.
 */
export interface IssueFields {
  /** Issue summary (title) */
  summary: string;
  /** Issue description (ADF format) */
  description?: AdfDocument | null;
  /** Issue status */
  status: JiraStatus;
  /** Issue priority */
  priority?: JiraPriority;
  /** Issue type */
  issuetype: JiraIssueType;
  /** Project */
  project: JiraProject;
  /** Assignee */
  assignee?: JiraUser | null;
  /** Reporter */
  reporter?: JiraUser;
  /** Labels */
  labels?: string[];
  /** Components */
  components?: JiraComponent[];
  /** Fix versions */
  fixVersions?: JiraVersion[];
  /** Affects versions */
  versions?: JiraVersion[];
  /** Created timestamp */
  created: string;
  /** Updated timestamp */
  updated: string;
  /** Resolution date */
  resolutiondate?: string | null;
  /** Due date */
  duedate?: string | null;
  /** Parent issue (for subtasks) */
  parent?: {
    id: string;
    key: IssueKey;
    fields?: {
      summary?: string;
      status?: JiraStatus;
      issuetype?: JiraIssueType;
    };
  };
  /** Custom fields (keyed by field ID, e.g., "customfield_10001") */
  [key: `customfield_${string}`]: unknown;
}

// ============================================================================
// Issue Types
// ============================================================================

/**
 * Jira issue representation.
 */
export interface JiraIssue {
  /** Issue ID */
  id: IssueId;
  /** Issue key */
  key: IssueKey;
  /** Self URL */
  self: string;
  /** Issue fields */
  fields: IssueFields;
  /** Changelog (if expanded) */
  changelog?: IssueChangelog;
}

/**
 * Changelog entry.
 */
export interface ChangelogItem {
  /** Field name */
  field: string;
  /** Field type */
  fieldtype: string;
  /** Field ID */
  fieldId?: string;
  /** Original value */
  from?: string | null;
  /** Original display string */
  fromString?: string | null;
  /** New value */
  to?: string | null;
  /** New display string */
  toString?: string | null;
}

/**
 * Changelog history entry.
 */
export interface ChangelogHistory {
  /** History ID */
  id: string;
  /** Author of the change */
  author: JiraUser;
  /** When the change occurred */
  created: string;
  /** List of changes */
  items: ChangelogItem[];
}

/**
 * Issue changelog.
 */
export interface IssueChangelog {
  /** Start index */
  startAt: number;
  /** Max results */
  maxResults: number;
  /** Total available */
  total: number;
  /** Changelog histories */
  histories: ChangelogHistory[];
}

// ============================================================================
// Transition Types
// ============================================================================

/**
 * Field requirements for a transition.
 */
export interface TransitionField {
  /** Field ID */
  fieldId: string;
  /** Whether the field is required */
  required: boolean;
  /** Field name */
  name: string;
  /** Allowed values (if applicable) */
  allowedValues?: unknown[];
  /** Default value */
  defaultValue?: unknown;
}

/**
 * Workflow transition.
 */
export interface JiraTransition {
  /** Transition ID */
  id: string;
  /** Transition name */
  name: string;
  /** Target status */
  to: JiraStatus;
  /** Whether user has permission */
  hasScreen: boolean;
  /** Whether this is a global transition */
  isGlobal: boolean;
  /** Whether this is an initial transition */
  isInitial: boolean;
  /** Whether this is conditional */
  isConditional: boolean;
  /** Required fields */
  fields?: Record<string, TransitionField>;
}

// ============================================================================
// Comment Types
// ============================================================================

/**
 * Comment visibility restriction.
 */
export interface CommentVisibility {
  /** Visibility type */
  type: 'group' | 'role';
  /** Visibility value (group name or role ID) */
  value: string;
}

/**
 * Jira comment.
 */
export interface JiraComment {
  /** Comment ID */
  id: string;
  /** Self URL */
  self: string;
  /** Comment body (ADF format) */
  body: AdfDocument;
  /** Author */
  author: JiraUser;
  /** Update author */
  updateAuthor?: JiraUser;
  /** Created timestamp */
  created: string;
  /** Updated timestamp */
  updated: string;
  /** Visibility restriction */
  visibility?: CommentVisibility;
}

// ============================================================================
// Attachment Types
// ============================================================================

/**
 * Jira attachment.
 */
export interface JiraAttachment {
  /** Attachment ID */
  id: string;
  /** Self URL */
  self: string;
  /** Filename */
  filename: string;
  /** Author */
  author: JiraUser;
  /** Created timestamp */
  created: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Content URL */
  content: string;
  /** Thumbnail URL (for images) */
  thumbnail?: string;
}

// ============================================================================
// Issue Link Types
// ============================================================================

/**
 * Issue link type.
 */
export interface IssueLinkType {
  /** Link type ID */
  id: string;
  /** Link type name */
  name: string;
  /** Inward description (e.g., "is blocked by") */
  inward: string;
  /** Outward description (e.g., "blocks") */
  outward: string;
  /** Self URL */
  self?: string;
}

/**
 * Issue link.
 */
export interface JiraIssueLink {
  /** Link ID */
  id: string;
  /** Self URL */
  self?: string;
  /** Link type */
  type: IssueLinkType;
  /** Inward issue */
  inwardIssue?: {
    id: string;
    key: IssueKey;
    self: string;
    fields?: {
      summary?: string;
      status?: JiraStatus;
      issuetype?: JiraIssueType;
    };
  };
  /** Outward issue */
  outwardIssue?: {
    id: string;
    key: IssueKey;
    self: string;
    fields?: {
      summary?: string;
      status?: JiraStatus;
      issuetype?: JiraIssueType;
    };
  };
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Search result structure.
 */
export interface SearchResult {
  /** Start index */
  startAt: number;
  /** Max results per page */
  maxResults: number;
  /** Total results available */
  total: number;
  /** Returned issues */
  issues: JiraIssue[];
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * Webhook event types.
 */
export type WebhookEventType =
  | 'jira:issue_created'
  | 'jira:issue_updated'
  | 'jira:issue_deleted'
  | 'comment_created'
  | 'comment_updated'
  | 'comment_deleted'
  | 'issuelink_created'
  | 'issuelink_deleted'
  | 'attachment_created'
  | 'attachment_deleted'
  | 'worklog_created'
  | 'worklog_updated'
  | 'worklog_deleted'
  | 'sprint_created'
  | 'sprint_updated'
  | 'sprint_deleted'
  | 'sprint_started'
  | 'sprint_closed';

/**
 * Webhook event payload.
 */
export interface WebhookEvent {
  /** Timestamp of the event */
  timestamp: number;
  /** Webhook event type string */
  webhookEvent: WebhookEventType;
  /** Issue event type name (for issue events) */
  issue_event_type_name?: string;
  /** User who triggered the event */
  user?: JiraUser;
  /** Issue (for issue-related events) */
  issue?: JiraIssue;
  /** Comment (for comment events) */
  comment?: JiraComment;
  /** Changelog (for update events) */
  changelog?: {
    id: string;
    items: ChangelogItem[];
  };
}

// ============================================================================
// Input Types for Creating/Updating
// ============================================================================

/**
 * Input for creating an issue.
 */
export interface CreateIssueInput {
  /** Project key or ID */
  project: ProjectKey | { id: string };
  /** Issue type name or ID */
  issueType: string | { id: string };
  /** Issue summary */
  summary: string;
  /** Issue description (plain text or ADF) */
  description?: string | AdfDocument;
  /** Priority name or ID */
  priority?: string | { id: string };
  /** Assignee account ID */
  assignee?: AccountId | { accountId: AccountId };
  /** Labels */
  labels?: string[];
  /** Components */
  components?: Array<string | { id: string }>;
  /** Fix versions */
  fixVersions?: Array<string | { id: string }>;
  /** Due date (YYYY-MM-DD format) */
  dueDate?: string;
  /** Parent issue key (for subtasks) */
  parent?: IssueKey | { key: IssueKey };
  /** Custom fields */
  customFields?: Record<string, unknown>;
}

/**
 * Input for updating an issue.
 */
export interface UpdateIssueInput {
  /** Updated summary */
  summary?: string;
  /** Updated description */
  description?: string | AdfDocument | null;
  /** Updated priority */
  priority?: string | { id: string };
  /** Updated assignee */
  assignee?: AccountId | { accountId: AccountId } | null;
  /** Updated labels */
  labels?: string[];
  /** Updated components */
  components?: Array<string | { id: string }>;
  /** Updated fix versions */
  fixVersions?: Array<string | { id: string }>;
  /** Updated due date */
  dueDate?: string | null;
  /** Custom field updates */
  customFields?: Record<string, unknown>;
}

/**
 * Input for transitioning an issue.
 */
export interface TransitionInput {
  /** Transition ID or name */
  transition: string | { id: string };
  /** Fields to set during transition */
  fields?: Record<string, unknown>;
  /** Comment to add with transition */
  comment?: string | AdfDocument;
}

/**
 * Input for adding a comment.
 */
export interface AddCommentInput {
  /** Comment body (plain text or ADF) */
  body: string | AdfDocument;
  /** Visibility restriction */
  visibility?: CommentVisibility;
}

/**
 * Input for creating an issue link.
 */
export interface CreateLinkInput {
  /** Link type name or ID */
  type: string | { id: string };
  /** Inward issue key */
  inwardIssue: IssueKey;
  /** Outward issue key */
  outwardIssue: IssueKey;
  /** Optional comment */
  comment?: string | AdfDocument;
}

// ============================================================================
// Bulk Operation Types
// ============================================================================

/**
 * Result of a bulk operation.
 */
export interface BulkOperationResult<T> {
  /** Successfully processed items */
  successes: T[];
  /** Failed items with errors */
  failures: Array<{
    /** Input that failed */
    input: unknown;
    /** Error message */
    error: string;
    /** Error code */
    errorCode?: string;
  }>;
}

/**
 * Bulk create result with issue keys.
 */
export interface BulkCreateResult {
  /** Created issues */
  issues: Array<{
    id: IssueId;
    key: IssueKey;
    self: string;
  }>;
  /** Errors for failed creates */
  errors: Array<{
    status: number;
    elementErrors: {
      errorMessages: string[];
      errors: Record<string, string>;
    };
  }>;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Issue key regex pattern.
 */
export const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/;

/**
 * Project key regex pattern.
 */
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Validates an issue key format.
 */
export function isValidIssueKey(key: string): boolean {
  return ISSUE_KEY_PATTERN.test(key) && key.length <= 50;
}

/**
 * Validates a project key format.
 */
export function isValidProjectKey(key: string): boolean {
  return PROJECT_KEY_PATTERN.test(key) && key.length <= 10;
}

/**
 * Checks if a value is an issue key (vs numeric ID).
 */
export function isIssueKey(value: string): boolean {
  return ISSUE_KEY_PATTERN.test(value);
}

/**
 * Checks if a value is a numeric ID.
 */
export function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Summary validation constants.
 */
export const MAX_SUMMARY_LENGTH = 255;

/**
 * Validates issue summary.
 */
export function validateSummary(summary: string): string[] {
  const errors: string[] = [];

  if (!summary || summary.trim().length === 0) {
    errors.push('Summary cannot be empty');
  }
  if (summary.length > MAX_SUMMARY_LENGTH) {
    errors.push(`Summary exceeds maximum length of ${MAX_SUMMARY_LENGTH} characters`);
  }
  // Check for control characters (except newlines and tabs)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(summary)) {
    errors.push('Summary contains invalid control characters');
  }

  return errors;
}

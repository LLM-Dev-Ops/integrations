/**
 * Jira Integration Module for LLM Dev Ops Platform
 *
 * Provides complete Jira REST API integration including:
 * - Issue CRUD operations
 * - Workflow transitions
 * - JQL search
 * - Comment management
 * - Bulk operations
 * - Webhook handling
 *
 * Following SPARC specification for production-grade implementation.
 *
 * @module @llmdevops/jira-integration
 * @version 1.0.0
 */

// ============================================================================
// Configuration
// ============================================================================

export {
  JiraConfig,
  JiraConfigBuilder,
  AuthMethod,
  RateLimitConfig,
  RetryConfig,
  CircuitBreakerConfig,
  CacheConfig,
  WebhookConfig,
  BulkConfig,
  SimulationMode,
  SecretString,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_WEBHOOK_CONFIG,
  DEFAULT_BULK_CONFIG,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  JIRA_API_V3,
} from './config/index.js';

// ============================================================================
// Types
// ============================================================================

export {
  // Base types
  IssueKey,
  IssueId,
  IssueKeyOrId,
  ProjectKey,
  AccountId,

  // User types
  JiraUser,

  // Project types
  JiraProject,

  // Status types
  StatusCategory,
  StatusCategoryDetails,
  JiraStatus,
  normalizeStatusCategory,

  // Priority types
  JiraPriority,

  // Issue type
  JiraIssueType,

  // Component and version types
  JiraComponent,
  JiraVersion,

  // ADF types
  AdfNodeType,
  AdfMarkType,
  AdfMark,
  AdfNode,
  AdfDocument,
  textToAdf,
  adfToText,
  validateAdf,

  // Issue types
  IssueFields,
  JiraIssue,
  ChangelogItem,
  ChangelogHistory,
  IssueChangelog,

  // Transition types
  TransitionField,
  JiraTransition,

  // Comment types
  CommentVisibility,
  JiraComment,

  // Attachment types
  JiraAttachment,

  // Link types
  IssueLinkType,
  JiraIssueLink,

  // Search types
  SearchResult,

  // Webhook types
  WebhookEventType,
  WebhookEvent,

  // Input types
  CreateIssueInput,
  UpdateIssueInput,
  TransitionInput,
  AddCommentInput,
  CreateLinkInput,

  // Bulk types
  BulkOperationResult,
  BulkCreateResult,

  // Validation
  ISSUE_KEY_PATTERN,
  PROJECT_KEY_PATTERN,
  isValidIssueKey,
  isValidProjectKey,
  isIssueKey,
  isNumericId,
  MAX_SUMMARY_LENGTH,
  validateSummary,
} from './types/index.js';

// ============================================================================
// Errors
// ============================================================================

export {
  // Error codes
  JiraErrorCode,

  // Base error
  JiraError,
  JiraApiErrorResponse,

  // Configuration errors
  ConfigurationError,
  NoAuthenticationError,

  // Authentication errors
  AuthenticationError,
  TokenExpiredError,
  TokenRefreshFailedError,

  // Access errors
  PermissionDeniedError,
  IssueNotFoundError,
  ProjectNotFoundError,
  ResourceNotFoundError,

  // Validation errors
  ValidationError,
  InvalidIssueKeyError,
  InvalidJqlError,
  RequiredFieldMissingError,
  FieldNotEditableError,

  // Workflow errors
  WorkflowError,
  TransitionNotAllowedError,
  TransitionNotFoundError,
  AlreadyInStatusError,

  // Rate limiting errors
  RateLimitedError,
  RateLimitTimeoutError,

  // Network/server errors
  NetworkError,
  TimeoutError,
  ServerError,
  ServiceUnavailableError,

  // Webhook errors
  WebhookSignatureInvalidError,
  WebhookTimestampExpiredError,
  WebhookPayloadInvalidError,

  // Simulation errors
  SimulationNoMatchError,
  SimulationLoadError,

  // Bulk operation errors
  BulkOperationPartialFailureError,

  // Circuit breaker errors
  CircuitBreakerOpenError,

  // Error utilities
  parseJiraApiError,
  isJiraError,
  isRetryableError,
  getRetryDelayMs,
} from './errors/index.js';

// ============================================================================
// Authentication
// ============================================================================

export {
  AuthProvider,
  Headers,
  ApiTokenAuthProvider,
  OAuthAuthProvider,
  ConnectJwtAuthProvider,
  createAuthProvider,
} from './auth/index.js';

// ============================================================================
// Client
// ============================================================================

export {
  JiraClient,
  HttpMethod,
  RequestOptions,
  Response,
  createJiraClient,
  createJiraClientFromEnv,
} from './client/index.js';

// ============================================================================
// Resilience
// ============================================================================

export {
  RateLimiter,
  CircuitBreaker,
  CircuitBreakerState,
  RetryExecutor,
  RetryHooks,
  ResilienceOrchestrator,
  ResilientExecuteOptions,
  createRetryExecutor,
} from './resilience/index.js';

// ============================================================================
// Observability
// ============================================================================

export {
  // Logger
  LogLevel,
  Logger,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  LogEntry,

  // Metrics
  MetricNames,
  MetricsCollector,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  MetricEntry,

  // Tracer
  SpanStatus,
  SpanContext,
  Tracer,
  NoopTracer,
  InMemoryTracer,
  InMemorySpanContext,

  // Container
  Observability,
  createNoopObservability,
  createInMemoryObservability,
  createConsoleObservability,
} from './observability/index.js';

// ============================================================================
// Services
// ============================================================================

export {
  // Issue service
  IssueService,
  IssueServiceImpl,
  GetIssueOptions,
  UpdateIssueOptions,
  TransitionResult,
  createIssueService,

  // Search service
  SearchService,
  SearchServiceImpl,
  SearchOptions,
  PaginatedSearchResult,
  FieldDefinition,
  createSearchService,

  // Comment service
  CommentService,
  CommentServiceImpl,
  ListCommentsOptions,
  CommentsResult,
  createCommentService,

  // Bulk service
  BulkService,
  BulkServiceImpl,
  BulkUpdateSpec,
  BulkTransitionSpec,
  BulkTransitionResult,
  createBulkService,
} from './services/index.js';

// ============================================================================
// Webhook
// ============================================================================

export {
  WebhookHandler,
  WebhookHandlerImpl,
  WebhookHandlerOptions,
  WebhookRequest,
  WebhookResponse,
  EventHandler,
  createWebhookHandler,

  // Event helpers
  IssueCreatedEvent,
  IssueUpdatedEvent,
  StatusChangedEvent,
  extractStatusChange,
  isIssueCreatedEvent,
  isIssueUpdatedEvent,
  isIssueDeletedEvent,
  isCommentEvent,
} from './webhook/index.js';

// ============================================================================
// Convenience Factory
// ============================================================================

import { JiraClient, createJiraClient } from './client/index.js';
import { JiraConfig, JiraConfigBuilder } from './config/index.js';
import { Observability, createNoopObservability } from './observability/index.js';
import {
  IssueService,
  createIssueService,
  SearchService,
  createSearchService,
  CommentService,
  createCommentService,
  BulkService,
  createBulkService,
} from './services/index.js';
import { WebhookHandler, createWebhookHandler, WebhookHandlerOptions } from './webhook/index.js';

/**
 * Complete Jira integration client with all services.
 */
export interface JiraIntegration {
  /** Core API client */
  client: JiraClient;
  /** Issue operations */
  issues: IssueService;
  /** JQL search */
  search: SearchService;
  /** Comment operations */
  comments: CommentService;
  /** Bulk operations */
  bulk: BulkService;
  /** Webhook handler */
  webhooks: WebhookHandler;
}

/**
 * Creates a complete Jira integration with all services.
 */
export function createJiraIntegration(
  config: JiraConfig,
  options?: {
    observability?: Observability;
    webhookOptions?: WebhookHandlerOptions;
  }
): JiraIntegration {
  const observability = options?.observability ?? createNoopObservability();
  const client = createJiraClient(config, observability);

  return {
    client,
    issues: createIssueService(client),
    search: createSearchService(client),
    comments: createCommentService(client),
    bulk: createBulkService(client),
    webhooks: createWebhookHandler({
      config: config.webhookConfig,
      logger: observability.logger,
      metrics: observability.metrics,
      ...options?.webhookOptions,
    }),
  };
}

/**
 * Creates a Jira integration from environment variables.
 */
export function createJiraIntegrationFromEnv(options?: {
  observability?: Observability;
  webhookOptions?: WebhookHandlerOptions;
}): JiraIntegration {
  const config = JiraConfigBuilder.fromEnv().build();
  return createJiraIntegration(config, options);
}

/**
 * HubSpot API Integration
 *
 * A TypeScript client for the HubSpot CRM API.
 *
 * Features:
 * - CRM object CRUD operations (contacts, companies, deals, tickets)
 * - Batch operations with automatic chunking
 * - Search with filters and pagination
 * - Association management
 * - Pipeline operations
 * - Engagement tracking (notes, calls, meetings, tasks)
 * - Webhook processing with signature validation
 * - Rate limiting with token bucket algorithm
 * - OAuth token management with automatic refresh
 *
 * @example
 * ```typescript
 * import { HubSpotClient } from '@integrations/hubspot';
 *
 * const client = new HubSpotClient({
 *   accessToken: 'your-access-token',
 *   portalId: 'your-portal-id',
 * });
 *
 * // Create a contact
 * const contact = await client.contacts.create({
 *   email: 'john@example.com',
 *   firstname: 'John',
 *   lastname: 'Doe',
 * });
 *
 * // Search for contacts
 * const results = await client.contacts.search({
 *   filters: [{ propertyName: 'email', operator: 'CONTAINS_TOKEN', value: '@example.com' }],
 * });
 * ```
 *
 * @packageDocumentation
 */

// ==================== Main Client ====================
export { HubSpotClient } from './client.js';
export type { HubSpotConfig, ObjectOperations } from './client.js';

// ==================== Types ====================

// Configuration types
export type {
  Tokens,
  RateLimitConfig,
  TokenManagerConfig,
  WebhookConfig,
  HttpClientConfig,
  ProxyConfig,
} from './types/config.js';

// CRM object types
export type {
  ObjectType,
  CrmObject,
  Properties,
  GetOptions,
  ObjectRef,
  CreateInput,
  UpdateInput,
  AssociationInput,
  Association,
  ContactProperties,
  CompanyProperties,
  DealProperties,
  TicketProperties,
  ProductProperties,
  LineItemProperties,
  QuoteProperties,
} from './types/objects.js';

// Batch types
export type {
  BatchResult,
  BatchError,
  ErrorCategory,
  ErrorContext,
  BatchReadInput,
  BatchArchiveInput,
  BatchOptions,
  BatchCreateRequest,
  BatchReadRequest,
  BatchUpdateRequest,
  BatchArchiveRequest,
  BatchUpsertInput,
  BatchProgress,
  BatchMetadata,
  ChunkContext,
} from './types/batch.js';

// Search types
export type {
  SearchQuery,
  FilterGroup,
  FilterClause,
  FilterOperator,
  SortClause,
  SortDirection,
  SearchResult,
  SearchPaging,
  SearchPage,
  SearchRequest,
  SearchOptions,
  TextSearchQuery,
  PropertyBoost,
  AggregationRequest,
  AggregationResult,
  AggregationBucket,
  SearchIteratorState,
} from './types/search.js';

// Association types
export type {
  AssociationType,
  AssociationCategory,
  BatchAssociationInput,
  AssociationObjectRef,
  AssociationTypeSpec,
  AssociationLabel,
  BatchCreateAssociationsRequest,
  BatchDeleteAssociationsRequest,
  BatchAssociationResult,
  AssociationResult,
  AssociationError,
  AssociationSchema,
  GetAssociationsOptions,
  AssociationList,
  ObjectAssociationDefinition,
} from './types/associations.js';
export { StandardAssociationTypeId } from './types/associations.js';

// Pipeline types
export type {
  PipelineObjectType,
  Pipeline,
  PipelineStage,
  StageMetadata,
  TicketState,
  CreatePipelineInput,
  CreateStageInput,
  UpdatePipelineInput,
  UpdateStageInput,
  PipelineAudit,
  PipelineSettings,
  PipelineVisibility,
  PipelineStatistics,
  StageStatistics,
  PipelineMove,
} from './types/pipelines.js';
export { DealStage, TicketStage } from './types/pipelines.js';

// Engagement types
export type {
  EngagementType,
  Engagement,
  EngagementProperties,
  EmailDirection,
  EmailStatus,
  CallStatus,
  TaskStatus,
  TaskPriority,
  TaskType,
  CreateNoteInput,
  CreateEmailInput,
  CreateCallInput,
  CreateMeetingInput,
  CreateTaskInput,
  EngagementMetadata,
  EngagementAttachment,
} from './types/engagements.js';

// Webhook types
export type {
  WebhookEvent,
  ChangeSource,
  WebhookSubscriptionType,
  WebhookRequest,
  WebhookHeaders,
  WebhookResponse,
  WebhookProcessingResult,
  WebhookHandler,
  WebhookSubscription,
  CreateWebhookSubscriptionInput,
  WebhookValidationResult,
  TypedWebhookEvent,
  WebhookBatch,
  WebhookRetryConfig,
  WebhookDeliveryStatus,
} from './types/webhooks.js';

// Rate limit types
export type {
  RateLimitStatus,
  RateLimitHealth,
  RateLimitExceededInfo,
  RateLimitHeaders,
  RetryConfig,
  TokenBucket,
  RateLimitType,
  PendingRequest,
  QueuedRequest,
  RateLimitStatistics,
  LimitTypeStats,
  RateLimitThresholds,
  RateLimitEvent,
  AdaptiveRateLimitAdjustment,
  RateLimiterState,
} from './types/rate-limit.js';

// ==================== Errors ====================
export {
  HubSpotError,
  // Authentication errors
  AuthenticationError,
  InvalidTokenError,
  ExpiredTokenError,
  InsufficientScopesError,
  // Rate limit errors
  RateLimitError,
  DailyLimitExceededError,
  BurstLimitExceededError,
  SearchLimitExceededError,
  // Validation errors
  ValidationError,
  InvalidPropertyError,
  MissingRequiredError,
  InvalidFormatError,
  DuplicateValueError,
  // Object errors
  ObjectError,
  ObjectNotFoundError,
  ObjectArchivedError,
  AssociationNotAllowedError,
  PipelineStageInvalidError,
  // Webhook errors
  WebhookError,
  InvalidSignatureError,
  ExpiredEventError,
  MalformedPayloadError,
  // Network errors
  NetworkError,
  TimeoutError,
  ConnectionFailedError,
  ServiceUnavailableError,
} from './errors.js';

// Error parsing utilities
export {
  parseHubSpotError,
  parseNetworkError,
  isRetryable,
  isClientError,
  isServerError,
  getRetryDelay,
} from './error-parser.js';

// ==================== HTTP Client ====================
export { HttpClient, HttpError } from './http/client.js';
export type {
  HttpMethod,
  HttpRequestOptions,
  HttpResponse,
} from './http/client.js';

// Retry utilities
export { shouldRetry, calculateBackoff, parseRetryAfter } from './http/retry.js';

// ==================== Rate Limiting ====================
export { RateLimiter, DailyLimitExceededError as RateLimiterDailyLimitError } from './rate-limiter.js';

// ==================== Token Management ====================
export { TokenManager, TokenRefreshError } from './token-manager.js';

// ==================== Webhooks ====================
export { WebhookProcessor } from './webhooks/processor.js';
export type { WebhookProcessorConfig } from './webhooks/processor.js';

export { validateSignatureV3, validateSignatureV1 } from './webhooks/signature.js';
export { parseWebhookPayload, parseEvent, parseEventType } from './webhooks/parser.js';
export { ProcessedEventsCache } from './webhooks/dedup.js';
export { WebhookRouter } from './webhooks/router.js';

// ==================== Operations (for advanced use) ====================
export {
  // Object operations
  createObject,
  getObject,
  updateObject,
  deleteObject,
  isValidObjectType,
  parseObjectResponse,
  // Batch operations
  batchCreate,
  batchRead,
  batchUpdate,
  batchArchive,
  splitIntoChunks,
  parseBatchResponse,
  // Search operations
  searchObjects,
  searchAll,
  searchByProperty,
  searchByEmail,
  searchByDomain,
  buildSearchBody,
  parseSearchResponse,
  MAX_SEARCH_LIMIT,
  // Association operations
  createAssociation,
  getAssociations,
  deleteAssociation,
  batchAssociate,
  batchDisassociate,
  getAllAssociations,
  ASSOCIATION_TYPES,
  // Pipeline operations
  getPipelines,
  getPipeline,
  getPipelineStages,
  moveToPipelineStage,
  getCurrentPipelineStage,
  validatePipelineStage,
  // Engagement operations
  createEngagement,
  getEngagement,
  updateEngagement,
  deleteEngagement,
  createNote,
  createTask,
  logCall,
} from './operations/index.js';
export type { RequestExecutor, RequestOptions } from './operations/index.js';

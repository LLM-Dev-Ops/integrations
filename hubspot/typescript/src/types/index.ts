/**
 * HubSpot API Integration Types
 * Centralized export of all type definitions
 */

// Configuration types
export type {
  Logger,
  MetricsClient,
  HubSpotConfig,
  Tokens,
  RateLimitConfig,
  TokenManagerConfig,
  WebhookConfig,
  HttpClientConfig,
  ProxyConfig,
} from './config.js';

// CRM Object types
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
} from './objects.js';

// Batch operation types
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
} from './batch.js';

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
} from './search.js';

// Association types
export type {
  Association as AssociationType,
  AssociationType as AssociationTypeDefinition,
  AssociationCategory,
  AssociationInput as AssociationInputType,
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
} from './associations.js';

// Export the enum separately to avoid conflicts
export { StandardAssociationTypeId } from './associations.js';

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
} from './pipelines.js';

// Export enums
export { DealStage, TicketStage } from './pipelines.js';

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
} from './engagements.js';

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
} from './webhooks.js';

// Export webhook error classes
export {
  WebhookError,
  InvalidSignatureError,
  ExpiredEventError,
  DuplicateEventError,
} from './webhooks.js';

// Rate limit types
export type {
  RateLimitStatus,
  DailyRateLimit,
  BurstRateLimit,
  SearchRateLimit,
  RateLimitHealth,
  RateLimitExceededInfo,
  RateLimitHeaders,
  RateLimitConfig as RateLimitConfiguration,
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
} from './rate-limit.js';

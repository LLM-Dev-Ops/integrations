/**
 * Salesforce API TypeScript Type Definitions
 *
 * Comprehensive type definitions for interacting with the Salesforce REST API,
 * including SObject operations, queries, CRUD operations, Composite API,
 * Bulk API 2.0, Platform Events, and organizational limits.
 */

// ============================================================================
// SObject Types
// ============================================================================

/**
 * Represents a Salesforce SObject record with standard attributes
 * and dynamic fields.
 */
export interface SObjectRecord {
  /** The unique identifier for the record */
  Id?: string;

  /** Metadata attributes about the record */
  attributes?: {
    /** The API name of the SObject type */
    type: string;
    /** The URL to access this record via the API */
    url: string;
  };

  /** Dynamic fields - any additional SObject fields */
  [field: string]: unknown;
}

/**
 * Describes the metadata for a Salesforce SObject type.
 * Contains comprehensive information about the object's structure,
 * capabilities, and relationships.
 */
export interface SObjectDescribe {
  /** The API name of the SObject */
  name: string;

  /** The user-friendly label for the SObject */
  label: string;

  /** The plural form of the label */
  labelPlural: string;

  /** Array of field metadata for all fields on the object */
  fields: SObjectField[];

  /** Whether this is a custom object */
  custom: boolean;

  /** Whether the object can be created */
  createable: boolean;

  /** Whether the object can be updated */
  updateable: boolean;

  /** Whether the object can be deleted */
  deletable: boolean;

  /** Whether the object can be queried */
  queryable: boolean;

  /** Whether the object can be searched */
  searchable: boolean;

  /** Whether the object can be merged */
  mergeable: boolean;

  /** Whether the object can be undeleted */
  undeletable: boolean;

  /** Whether the object supports triggers */
  triggerable: boolean;

  /** The URL to access this object's describe information */
  urls: Record<string, string>;

  /** Array of child relationships */
  childRelationships?: ChildRelationship[];

  /** Array of record type information */
  recordTypeInfos?: RecordTypeInfo[];
}

/**
 * Describes the metadata for a field on a Salesforce SObject.
 */
export interface SObjectField {
  /** The API name of the field */
  name: string;

  /** The user-friendly label for the field */
  label: string;

  /** The data type of the field */
  type: FieldType;

  /** The maximum length of the field value */
  length: number;

  /** The number of digits to the right of the decimal point */
  precision?: number;

  /** The number of digits to the left of the decimal point */
  scale?: number;

  /** Whether the field can be created */
  createable: boolean;

  /** Whether the field can be updated */
  updateable: boolean;

  /** Whether the field is required */
  nillable: boolean;

  /** Whether the field is a custom field */
  custom: boolean;

  /** Whether the field is an external ID */
  externalId: boolean;

  /** Whether the field is unique */
  unique: boolean;

  /** Whether the field is case-sensitive */
  caseSensitive: boolean;

  /** Whether the field is sortable */
  sortable: boolean;

  /** Whether the field is filterable */
  filterable: boolean;

  /** The default value for the field */
  defaultValue?: unknown;

  /** For picklist fields, the available values */
  picklistValues?: PicklistValue[];

  /** For reference fields, the API names of the referenced SObject types */
  referenceTo?: string[];

  /** For reference fields, the name of the relationship */
  relationshipName?: string;

  /** Whether this is a calculated field */
  calculated?: boolean;

  /** The formula for calculated fields */
  calculatedFormula?: string;
}

/**
 * Represents the data type of a Salesforce field.
 */
export type FieldType =
  | 'id'
  | 'string'
  | 'boolean'
  | 'int'
  | 'double'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'time'
  | 'email'
  | 'phone'
  | 'url'
  | 'textarea'
  | 'picklist'
  | 'multipicklist'
  | 'reference'
  | 'location'
  | 'address'
  | 'percent'
  | 'encryptedstring'
  | 'base64'
  | 'combobox'
  | 'anyType';

/**
 * Represents a picklist value option.
 */
export interface PicklistValue {
  /** Whether this value is active */
  active: boolean;

  /** Whether this is the default value */
  defaultValue: boolean;

  /** The display label for the value */
  label: string;

  /** The API value */
  value: string;

  /** Valid picklist values for dependent picklists */
  validFor?: number[];
}

/**
 * Describes a child relationship on a Salesforce SObject.
 */
export interface ChildRelationship {
  /** The API name of the child SObject */
  childSObject: string;

  /** The field on the child object that references the parent */
  field: string;

  /** The relationship name used in queries */
  relationshipName: string | null;

  /** Whether this is a cascading delete */
  cascadeDelete: boolean;
}

/**
 * Information about a record type.
 */
export interface RecordTypeInfo {
  /** The record type ID */
  recordTypeId: string;

  /** The record type name */
  name: string;

  /** Whether this record type is available to the current user */
  available: boolean;

  /** Whether this is the default record type */
  defaultRecordTypeMapping: boolean;

  /** Whether this is the master record type */
  master: boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Represents the result of a SOQL query.
 *
 * @template T The type of records returned by the query
 */
export interface QueryResult<T = SObjectRecord> {
  /** The total number of records matching the query */
  totalSize: number;

  /** Whether all records have been retrieved */
  done: boolean;

  /** URL to retrieve the next batch of records (if done is false) */
  nextRecordsUrl?: string;

  /** The records returned by the query */
  records: T[];
}

/**
 * Represents the execution plan for a SOQL query.
 * Used for query optimization and performance analysis.
 */
export interface QueryExplainPlan {
  /** Array of execution plan items */
  plans: QueryPlanItem[];

  /** The source query */
  sourceQuery?: string;
}

/**
 * Represents a single item in a query execution plan.
 */
export interface QueryPlanItem {
  /** The cardinality (estimated number of rows) */
  cardinality: number;

  /** Array of fields used in the plan */
  fields: string[];

  /** The leading operation type (e.g., "Index", "TableScan") */
  leadingOperationType: string;

  /** The relative cost of this operation */
  relativeCost: number;

  /** The SObject type being queried */
  sobjectType: string;

  /** Additional notes about the plan */
  notes?: QueryPlanNote[];
}

/**
 * Represents a note in a query execution plan.
 */
export interface QueryPlanNote {
  /** The description of the note */
  description: string;

  /** The fields related to this note */
  fields: string[];

  /** The table name related to this note */
  tableEnumOrId: string;
}

// ============================================================================
// CRUD Types
// ============================================================================

/**
 * Represents the result of creating a record.
 */
export interface CreateResult {
  /** The ID of the created record */
  id: string;

  /** Whether the creation was successful */
  success: boolean;

  /** Array of errors if the creation failed */
  errors: SalesforceFieldError[];
}

/**
 * Represents the result of updating a record.
 */
export interface UpdateResult {
  /** The ID of the updated record */
  id: string;

  /** Whether the update was successful */
  success: boolean;

  /** Array of errors if the update failed */
  errors: SalesforceFieldError[];
}

/**
 * Represents the result of an upsert operation.
 */
export interface UpsertResult {
  /** The ID of the upserted record */
  id: string;

  /** Whether the upsert was successful */
  success: boolean;

  /** Whether a new record was created (true) or an existing record was updated (false) */
  created: boolean;

  /** Array of errors if the upsert failed */
  errors: SalesforceFieldError[];
}

/**
 * Represents the result of deleting a record.
 */
export interface DeleteResult {
  /** The ID of the deleted record */
  id: string;

  /** Whether the deletion was successful */
  success: boolean;

  /** Array of errors if the deletion failed */
  errors: SalesforceFieldError[];
}

/**
 * Represents an error that occurred on a specific field during a DML operation.
 */
export interface SalesforceFieldError {
  /** The status code of the error */
  statusCode: string;

  /** The error message */
  message: string;

  /** The fields that caused the error */
  fields: string[];
}

// ============================================================================
// Composite Types
// ============================================================================

/**
 * Represents a single request in a Composite API batch.
 * Allows multiple operations to be executed in a single API call.
 */
export interface CompositeRequest {
  /** The HTTP method for the request */
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

  /** The relative URL for the request */
  url: string;

  /** A unique identifier for this subrequest */
  referenceId: string;

  /** The request body (for POST, PATCH, PUT requests) */
  body?: unknown;

  /** HTTP headers for this subrequest */
  httpHeaders?: Record<string, string>;
}

/**
 * Represents the response from a Composite API request.
 */
export interface CompositeResponse {
  /** Array of responses for each subrequest */
  compositeResponse: CompositeSubResponse[];
}

/**
 * Represents the response for a single subrequest in a Composite API batch.
 */
export interface CompositeSubResponse {
  /** The response body */
  body: unknown;

  /** HTTP headers from the response */
  httpHeaders: Record<string, string>;

  /** The HTTP status code */
  httpStatusCode: number;

  /** The reference ID from the original request */
  referenceId: string;
}

/**
 * Represents a Composite Graph request for executing complex operations
 * with dependencies between subrequests.
 */
export interface CompositeGraphRequest {
  /** Array of graph subrequests */
  graphs: CompositeGraphSubRequest[];
}

/**
 * Represents a single subrequest in a Composite Graph.
 */
export interface CompositeGraphSubRequest {
  /** A unique identifier for this graph */
  graphId: string;

  /** Array of composite requests in this graph */
  compositeRequest: CompositeRequest[];
}

// ============================================================================
// Bulk API 2.0 Types
// ============================================================================

/**
 * Represents information about a Bulk API 2.0 job.
 */
export interface BulkJobInfo {
  /** The unique identifier for the job */
  id: string;

  /** The type of operation for this job */
  operation: BulkOperation;

  /** The API name of the SObject being processed */
  object: string;

  /** The current state of the job */
  state: BulkJobState;

  /** The external ID field name for upsert operations */
  externalIdFieldName?: string;

  /** The user who created the job */
  createdById: string;

  /** When the job was created */
  createdDate: string;

  /** When the job was last modified */
  systemModstamp: string;

  /** The column delimiter for CSV data */
  columnDelimiter?: ColumnDelimiter;

  /** The line ending format for CSV data */
  lineEnding?: LineEnding;

  /** The API version used for this job */
  apiVersion?: string;

  /** The number of records processed so far */
  numberRecordsProcessed?: number;

  /** The number of records that failed */
  numberRecordsFailed?: number;

  /** The total processing time in milliseconds */
  totalProcessingTime?: number;

  /** The time spent processing the API request */
  apiActiveProcessingTime?: number;

  /** The time spent processing the apex logic */
  apexProcessingTime?: number;

  /** The number of retries attempted */
  retries?: number;

  /** The concurrency mode for the job */
  concurrencyMode?: ConcurrencyMode;

  /** The content type of the job data */
  contentType?: ContentType;
}

/**
 * The type of operation for a Bulk API job.
 */
export type BulkOperation =
  | 'insert'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'hardDelete'
  | 'query';

/**
 * The state of a Bulk API job.
 */
export type BulkJobState =
  | 'Open'
  | 'UploadComplete'
  | 'InProgress'
  | 'Aborted'
  | 'JobComplete'
  | 'Failed';

/**
 * The column delimiter for CSV data in Bulk API jobs.
 */
export type ColumnDelimiter =
  | 'BACKQUOTE'
  | 'CARET'
  | 'COMMA'
  | 'PIPE'
  | 'SEMICOLON'
  | 'TAB';

/**
 * The line ending format for CSV data in Bulk API jobs.
 */
export type LineEnding =
  | 'LF'
  | 'CRLF';

/**
 * The concurrency mode for a Bulk API job.
 */
export type ConcurrencyMode =
  | 'Parallel'
  | 'Serial';

/**
 * The content type of job data.
 */
export type ContentType =
  | 'CSV';

/**
 * Represents the results of a Bulk API job.
 * Contains successful, failed, and unprocessed records.
 */
export interface BulkJobResult {
  /** Records that were processed successfully */
  successfulResults: BulkRecordResult[];

  /** Records that failed to process */
  failedResults: BulkRecordResult[];

  /** Records that were not processed */
  unprocessedRecords: BulkRecordResult[];
}

/**
 * Represents a single record result from a Bulk API job.
 * Uses sf__ prefixed fields for Salesforce-specific metadata.
 */
export interface BulkRecordResult {
  /** The ID of the record (for successful operations) */
  sf__Id?: string;

  /** Whether the record was created (for upsert operations) */
  sf__Created?: boolean;

  /** The error message if the record failed to process */
  sf__Error?: string;

  /** Dynamic fields from the original record */
  [field: string]: unknown;
}

/**
 * Options for creating a Bulk API 2.0 job.
 */
export interface BulkJobCreateRequest {
  /** The type of operation */
  operation: BulkOperation;

  /** The API name of the SObject */
  object: string;

  /** The external ID field name (required for upsert operations) */
  externalIdFieldName?: string;

  /** The column delimiter for CSV data */
  columnDelimiter?: ColumnDelimiter;

  /** The line ending format for CSV data */
  lineEnding?: LineEnding;

  /** The content type of the job data */
  contentType?: ContentType;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Represents a Salesforce Platform Event.
 * Platform events follow the event-driven architecture pattern.
 */
export interface PlatformEvent {
  /** The replay ID for the event */
  replayId?: string;

  /** When the event was created */
  CreatedDate?: string;

  /** The ID of the user who created the event */
  CreatedById?: string;

  /** Dynamic event fields */
  [field: string]: unknown;
}

/**
 * Represents the result of publishing a platform event.
 */
export interface PublishResult {
  /** The ID of the published event */
  id: string;

  /** Whether the publish was successful */
  success: boolean;

  /** Array of error messages if the publish failed */
  errors: string[];
}

/**
 * Represents a request to subscribe to platform events or change data capture.
 */
export interface SubscribeRequest {
  /** The name of the topic or channel to subscribe to */
  topicName: string;

  /** The replay preset for determining where to start in the event stream */
  replayPreset: ReplayPreset;

  /** The number of events requested per fetch */
  numRequested: number;

  /** The replay ID to start from (required when replayPreset is CUSTOM) */
  replayId?: string;
}

/**
 * The replay preset for event subscriptions.
 * Determines where in the event stream to start receiving events.
 */
export type ReplayPreset =
  | 'LATEST'    // Start from the latest events
  | 'EARLIEST'  // Start from the earliest available events
  | 'CUSTOM';   // Start from a specific replay ID

/**
 * Represents an event message received from a subscription.
 */
export interface EventMessage<T = PlatformEvent> {
  /** The channel the event was received on */
  channel: string;

  /** The replay ID for this event */
  replayId: number;

  /** The event payload */
  payload: T;
}

// ============================================================================
// Limits Types
// ============================================================================

/**
 * Represents the organizational limits for a Salesforce instance.
 * Contains information about API usage, storage, and other resource limits.
 */
export interface SalesforceLimits {
  /** Dynamic limit entries by limit name */
  [limitName: string]: LimitInfo;
}

/**
 * Information about a specific organizational limit.
 */
export interface LimitInfo {
  /** The maximum allowed value for this limit */
  Max: number;

  /** The remaining available value for this limit */
  Remaining: number;
}

/**
 * Common organizational limits with typed accessors.
 */
export interface CommonLimits {
  /** Daily API request limit */
  DailyApiRequests?: LimitInfo;

  /** Daily asynchronous Apex executions */
  DailyAsyncApexExecutions?: LimitInfo;

  /** Daily bulk API requests */
  DailyBulkApiRequests?: LimitInfo;

  /** Daily durable streaming API events */
  DailyDurableStreamingApiEvents?: LimitInfo;

  /** Daily generic streaming API events */
  DailyGenericStreamingApiEvents?: LimitInfo;

  /** Data storage limit */
  DataStorageMB?: LimitInfo;

  /** File storage limit */
  FileStorageMB?: LimitInfo;

  /** Hourly published platform events */
  HourlyPublishedPlatformEvents?: LimitInfo;

  /** Hourly time-based workflow actions */
  HourlyTimeBasedWorkflow?: LimitInfo;

  /** Mass email limit */
  MassEmail?: LimitInfo;

  /** Single email limit */
  SingleEmail?: LimitInfo;
}

// ============================================================================
// Auth Token Types
// ============================================================================

/**
 * Represents the response from a Salesforce OAuth token request.
 * Contains the access token and instance information needed for API calls.
 */
export interface TokenResponse {
  /** The access token for authenticating API requests */
  access_token: string;

  /** The Salesforce instance URL for API requests */
  instance_url: string;

  /** The type of token (typically "Bearer") */
  token_type: string;

  /** Timestamp when the token was issued (in milliseconds) */
  issued_at: string;

  /** Cryptographic signature for verifying the token */
  signature: string;

  /** The refresh token for obtaining new access tokens (if applicable) */
  refresh_token?: string;

  /** The scope of access granted by the token */
  scope?: string;

  /** The unique identifier for the authenticated user */
  id?: string;
}

/**
 * OAuth 2.0 grant types supported by Salesforce.
 */
export type GrantType =
  | 'password'              // Username-password flow
  | 'authorization_code'    // Web server flow
  | 'refresh_token'         // Refresh token flow
  | 'client_credentials'    // Client credentials flow
  | 'urn:ietf:params:oauth:grant-type:jwt-bearer'; // JWT bearer token flow

/**
 * Request parameters for OAuth token endpoint.
 */
export interface TokenRequest {
  /** The OAuth grant type */
  grant_type: GrantType;

  /** The client ID from the connected app */
  client_id: string;

  /** The client secret from the connected app */
  client_secret?: string;

  /** The username (for password grant) */
  username?: string;

  /** The password (for password grant) */
  password?: string;

  /** The authorization code (for authorization_code grant) */
  code?: string;

  /** The redirect URI (for authorization_code grant) */
  redirect_uri?: string;

  /** The refresh token (for refresh_token grant) */
  refresh_token?: string;

  /** The JWT assertion (for JWT bearer grant) */
  assertion?: string;
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Represents API version information.
 */
export interface ApiVersion {
  /** The version label (e.g., "Spring '24") */
  label: string;

  /** The URL for this API version */
  url: string;

  /** The version number (e.g., "59.0") */
  version: string;
}

/**
 * Represents global describe information for all SObjects.
 */
export interface GlobalDescribe {
  /** Encoding format */
  encoding: string;

  /** Maximum batch size for API calls */
  maxBatchSize: number;

  /** Array of SObject describe results */
  sobjects: SObjectDescribeBasic[];
}

/**
 * Basic SObject describe information from global describe.
 */
export interface SObjectDescribeBasic {
  /** The API name of the SObject */
  name: string;

  /** The user-friendly label */
  label: string;

  /** The plural form of the label */
  labelPlural: string;

  /** Whether this is a custom object */
  custom: boolean;

  /** The key prefix for record IDs */
  keyPrefix: string;

  /** URLs for accessing this object */
  urls: Record<string, string>;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Represents the result of a SOSL (Salesforce Object Search Language) search.
 */
export interface SearchResult {
  /** Array of search records grouped by SObject type */
  searchRecords: SearchRecord[];
}

/**
 * Represents search records for a specific SObject type.
 */
export interface SearchRecord {
  /** The SObject type attributes */
  attributes: {
    /** The SObject type name */
    type: string;

    /** The URL to access this record */
    url: string;
  };

  /** The record ID */
  Id: string;

  /** Dynamic fields returned by the search */
  [field: string]: unknown;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Represents a reference to another SObject record.
 */
export interface RecordReference {
  /** The type of SObject being referenced */
  type: string;

  /** The ID of the referenced record */
  id: string;
}

/**
 * Options for controlling query behavior.
 */
export interface QueryOptions {
  /** Whether to include all records (including deleted and archived) */
  includeAllRecords?: boolean;

  /** The batch size for retrieving records */
  batchSize?: number;
}

/**
 * Represents pagination information for a query.
 */
export interface PaginationInfo {
  /** The current page number */
  page: number;

  /** The number of records per page */
  pageSize: number;

  /** The total number of records */
  totalRecords: number;

  /** The total number of pages */
  totalPages: number;

  /** Whether there is a next page */
  hasNext: boolean;

  /** Whether there is a previous page */
  hasPrevious: boolean;
}

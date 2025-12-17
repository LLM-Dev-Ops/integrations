/**
 * Airtable API type definitions following SPARC specification.
 *
 * Core types for record management, field types, and API interactions.
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Airtable Base ID format (e.g., "appXXXXXXXXXXXXXX").
 */
export type BaseId = string;

/**
 * Airtable Table ID format (e.g., "tblXXXXXXXXXXXXXX").
 */
export type TableId = string;

/**
 * Airtable Record ID format (e.g., "recXXXXXXXXXXXXXX").
 */
export type RecordId = string;

/**
 * Airtable Field ID format (e.g., "fldXXXXXXXXXXXXXX").
 */
export type FieldId = string;

/**
 * Airtable View ID format (e.g., "viwXXXXXXXXXXXXXX").
 */
export type ViewId = string;

/**
 * Airtable Webhook ID.
 */
export type WebhookId = string;

// ============================================================================
// Field Value Types
// ============================================================================

/**
 * User reference in Airtable.
 */
export interface UserRef {
  /** User ID */
  id: string;
  /** User email address */
  email: string;
  /** User display name */
  name?: string;
}

/**
 * Thumbnail sizes for attachments.
 */
export interface Thumbnails {
  /** Small thumbnail */
  small?: {
    url: string;
    width: number;
    height: number;
  };
  /** Large thumbnail */
  large?: {
    url: string;
    width: number;
    height: number;
  };
  /** Full size thumbnail */
  full?: {
    url: string;
    width: number;
    height: number;
  };
}

/**
 * Attachment field value.
 */
export interface Attachment {
  /** Attachment ID */
  id: string;
  /** URL to the file */
  url: string;
  /** Filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Thumbnail URLs (for images) */
  thumbnails?: Thumbnails;
  /** Width of the image (if applicable) */
  width?: number;
  /** Height of the image (if applicable) */
  height?: number;
}

/**
 * Currency value with symbol.
 */
export interface CurrencyValue {
  /** Numeric value */
  value: number;
  /** Currency symbol (e.g., "$", "€") */
  symbol: string;
}

/**
 * Barcode field value.
 */
export interface BarcodeValue {
  /** Barcode text/data */
  text: string;
  /** Barcode type (e.g., "upce", "ean13", "code128") */
  type?: string;
}

/**
 * Formula result types.
 */
export type FormulaResult = string | number | boolean | null | Error;

/**
 * Base field value types (non-recursive).
 */
export type BaseFieldValue =
  | string // Text, Long Text, URL, Email, Phone, Date, DateTime, Single Select
  | number // Number, Currency, Percent, Duration, Rating
  | boolean // Checkbox
  | string[] // Multiple Select
  | UserRef // User (single collaborator)
  | UserRef[] // User (multiple collaborators)
  | Attachment[] // Attachments
  | RecordId[] // Linked Records
  | CurrencyValue // Currency
  | BarcodeValue // Barcode
  | null; // Null/empty field

/**
 * Rollup result types (can be aggregated value or array of values).
 */
export type RollupResult = number | BaseFieldValue[];

/**
 * All possible field value types in Airtable.
 * Includes recursive types for lookups and rollups.
 */
export type FieldValue =
  | BaseFieldValue
  | BaseFieldValue[] // Lookup (multiple values)
  | FormulaResult // Formula
  | Error; // Formula error result

// ============================================================================
// Record Types
// ============================================================================

/**
 * Airtable record representation.
 */
export interface Record {
  /** Record ID */
  id: RecordId;
  /** Record creation timestamp (ISO 8601) */
  createdTime: string;
  /** Record fields (field name to value mapping) */
  fields: {
    [fieldName: string]: FieldValue;
  };
}

/**
 * Deleted record representation.
 */
export interface DeletedRecord {
  /** Record ID */
  id: RecordId;
  /** Deletion confirmation flag */
  deleted: true;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Sort direction.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Field to sort by.
 */
export interface SortField {
  /** Field name or ID */
  field: string;
  /** Sort direction */
  direction: SortDirection;
}

/**
 * Cell format for API responses.
 */
export type CellFormat = 'json' | 'string';

/**
 * Request parameters for listing records.
 */
export interface ListRecordsRequest {
  /** Filter formula (Airtable formula syntax) */
  filterByFormula?: string;
  /** Sort fields */
  sort?: SortField[];
  /** Specific fields to return (field names or IDs) */
  fields?: string[];
  /** View ID or name to use */
  view?: string;
  /** Maximum number of records per page (1-100) */
  pageSize?: number;
  /** Pagination offset token */
  offset?: string;
  /** Cell format for response ('json' or 'string') */
  cellFormat?: CellFormat;
  /** Timezone for date/time values (e.g., "America/New_York") */
  timeZone?: string;
  /** User locale for formatting (e.g., "en-US") */
  userLocale?: string;
}

/**
 * Response from listing records.
 */
export interface ListRecordsResponse {
  /** Array of records */
  records: Record[];
  /** Pagination offset token (if more records available) */
  offset?: string;
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Permission levels for bases.
 */
export enum PermissionLevel {
  None = 'none',
  Read = 'read',
  Comment = 'comment',
  Edit = 'edit',
  Create = 'create',
}

/**
 * Airtable base metadata.
 */
export interface Base {
  /** Base ID */
  id: BaseId;
  /** Base name */
  name: string;
  /** User's permission level for this base */
  permissionLevel: PermissionLevel;
}

/**
 * Field type enumeration.
 */
export enum FieldType {
  SingleLineText = 'singleLineText',
  MultilineText = 'multilineText',
  RichText = 'richText',
  Checkbox = 'checkbox',
  SingleSelect = 'singleSelect',
  MultipleSelects = 'multipleSelects',
  Date = 'date',
  DateTime = 'dateTime',
  Number = 'number',
  Currency = 'currency',
  Percent = 'percent',
  Duration = 'duration',
  Rating = 'rating',
  PhoneNumber = 'phoneNumber',
  Email = 'email',
  Url = 'url',
  Attachment = 'multipleAttachments',
  LinkedRecord = 'multipleRecordLinks',
  Lookup = 'multipleLookupValues',
  Formula = 'formula',
  Rollup = 'rollup',
  Count = 'count',
  CreatedTime = 'createdTime',
  LastModifiedTime = 'lastModifiedTime',
  CreatedBy = 'createdBy',
  LastModifiedBy = 'lastModifiedBy',
  Barcode = 'barcode',
  Button = 'button',
  SingleCollaborator = 'singleCollaborator',
  MultipleCollaborators = 'multipleCollaborators',
  AutoNumber = 'autoNumber',
  ExternalSyncSource = 'externalSyncSource',
}

/**
 * Field schema definition.
 */
export interface FieldSchema {
  /** Field ID */
  id: FieldId;
  /** Field name */
  name: string;
  /** Field type */
  type: FieldType;
  /** Field-specific options (varies by type) */
  options?: {
    /** For select fields: array of choice objects */
    choices?: Array<{
      id: string;
      name: string;
      color?: string;
    }>;
    /** For linked records: linked table ID */
    linkedTableId?: TableId;
    /** For lookup/rollup: field ID in linked table */
    fieldIdInLinkedTable?: FieldId;
    /** For lookup: record link field ID */
    recordLinkFieldId?: FieldId;
    /** For rollup: aggregation function */
    aggregationFunction?: string;
    /** For number/currency: precision */
    precision?: number;
    /** For currency: symbol */
    symbol?: string;
    /** For date: date format */
    dateFormat?: {
      name: string;
      format: string;
    };
    /** For time: time format */
    timeFormat?: {
      name: string;
      format: string;
    };
    /** For rating: max value */
    max?: number;
    /** For rating: icon */
    icon?: string;
    /** For rating: color */
    color?: string;
    /** For formula: formula string */
    formula?: string;
    /** For duration: duration format */
    durationFormat?: string;
    [key: string]: unknown;
  };
  /** Description of the field */
  description?: string;
}

/**
 * View type enumeration.
 */
export enum ViewType {
  Grid = 'grid',
  Form = 'form',
  Calendar = 'calendar',
  Gallery = 'gallery',
  Kanban = 'kanban',
  Timeline = 'timeline',
  Block = 'block',
  GanttChart = 'ganttChart',
}

/**
 * View schema definition.
 */
export interface ViewSchema {
  /** View ID */
  id: ViewId;
  /** View name */
  name: string;
  /** View type */
  type: ViewType;
}

/**
 * Table schema definition.
 */
export interface TableSchema {
  /** Table ID */
  id: TableId;
  /** Table name */
  name: string;
  /** Primary field ID */
  primaryFieldId: FieldId;
  /** Array of field schemas */
  fields: FieldSchema[];
  /** Array of view schemas */
  views: ViewSchema[];
  /** Table description */
  description?: string;
}

// ============================================================================
// Input Types for Creating/Updating
// ============================================================================

/**
 * Input for creating a record.
 */
export interface CreateRecordInput {
  /** Field values for the new record */
  fields: {
    [fieldName: string]: FieldValue;
  };
}

/**
 * Input for updating a record.
 */
export interface UpdateRecordInput {
  /** Field values to update */
  fields: {
    [fieldName: string]: FieldValue;
  };
}

/**
 * Record update with ID for batch operations.
 */
export interface RecordUpdate {
  /** Record ID to update */
  id: RecordId;
  /** Field values to update */
  fields: {
    [fieldName: string]: FieldValue;
  };
}

/**
 * Request for upserting records.
 */
export interface UpsertRequest {
  /** Records to upsert */
  records: Array<{
    fields: {
      [fieldName: string]: FieldValue;
    };
  }>;
  /** Fields to merge on (unique identifier fields) */
  fieldsToMergeOn: string[];
}

/**
 * Result from upsert operation.
 */
export interface UpsertResult {
  /** All records after upsert */
  records: Record[];
  /** IDs of newly created records */
  createdRecords: RecordId[];
  /** IDs of updated records */
  updatedRecords: RecordId[];
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook notification specification.
 */
export interface WebhookNotification {
  /** Whether to notify on all changes */
  all?: boolean;
  /** Specific data types to notify on */
  dataTypes?: Array<'tableData' | 'tableFields' | 'tableMetadata'>;
}

/**
 * Webhook specification for creation.
 */
export interface WebhookSpec {
  /** Notification options */
  notificationUrl: string;
  /** What to watch */
  specification: {
    /** Specific filters */
    filters?: {
      /** Data types to watch */
      dataTypes?: string[];
      /** Record change scope */
      recordChangeScope?: string;
      /** Watch data in specific view */
      watchDataInViewId?: ViewId;
      /** Include cell values in previous record data */
      includeCellValuesInFieldIds?: FieldId[] | 'all';
      /** Include previous cell values */
      includePreviousCellValues?: boolean;
      /** Include previous field definitions */
      includePreviousFieldDefinitions?: boolean;
    };
  };
}

/**
 * Webhook change type.
 */
export type WebhookChangeType =
  | 'tableCreated'
  | 'tableUpdated'
  | 'tableDeleted'
  | 'recordCreated'
  | 'recordUpdated'
  | 'recordDeleted'
  | 'fieldCreated'
  | 'fieldUpdated'
  | 'fieldDeleted';

/**
 * Webhook payload for notifications.
 */
export interface WebhookPayload {
  /** Base ID */
  base: {
    id: BaseId;
  };
  /** Webhook ID */
  webhook: {
    id: WebhookId;
  };
  /** Timestamp of the change */
  timestamp: string;
  /** Change type */
  changeType: WebhookChangeType;
  /** Table that changed */
  table?: {
    id: TableId;
    name: string;
  };
  /** Record data (for record changes) */
  record?: {
    id: RecordId;
    cellValuesByFieldId?: { [key: FieldId]: FieldValue };
    previousCellValuesByFieldId?: { [key: FieldId]: FieldValue };
  };
  /** Field data (for field changes) */
  field?: {
    id: FieldId;
    name: string;
    type: FieldType;
    previousType?: FieldType;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Airtable API error response.
 */
export interface AirtableError {
  /** Error type */
  type: string;
  /** Error message */
  message: string;
}

/**
 * Batch operation error.
 */
export interface BatchError {
  /** Error details */
  error: AirtableError;
  /** Index of the failed item in the batch */
  index?: number;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Base ID prefix.
 */
export const BASE_ID_PREFIX = 'app';

/**
 * Table ID prefix.
 */
export const TABLE_ID_PREFIX = 'tbl';

/**
 * Record ID prefix.
 */
export const RECORD_ID_PREFIX = 'rec';

/**
 * Field ID prefix.
 */
export const FIELD_ID_PREFIX = 'fld';

/**
 * View ID prefix.
 */
export const VIEW_ID_PREFIX = 'viw';

/**
 * Maximum batch size for create/update/delete operations.
 */
export const MAX_BATCH_SIZE = 10;

/**
 * Minimum page size for list operations.
 */
export const MIN_PAGE_SIZE = 1;

/**
 * Maximum page size for list operations.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Default page size for list operations.
 */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * Validates a Base ID format.
 *
 * @param id - The ID to validate
 * @returns True if the ID is a valid Base ID
 */
export function isValidBaseId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(BASE_ID_PREFIX) && id.length === 17;
}

/**
 * Validates a Table ID format.
 *
 * @param id - The ID to validate
 * @returns True if the ID is a valid Table ID
 */
export function isValidTableId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(TABLE_ID_PREFIX) && id.length === 17;
}

/**
 * Validates a Record ID format.
 *
 * @param id - The ID to validate
 * @returns True if the ID is a valid Record ID
 */
export function isValidRecordId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(RECORD_ID_PREFIX) && id.length === 17;
}

/**
 * Validates a Field ID format.
 *
 * @param id - The ID to validate
 * @returns True if the ID is a valid Field ID
 */
export function isValidFieldId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(FIELD_ID_PREFIX) && id.length === 17;
}

/**
 * Validates a View ID format.
 *
 * @param id - The ID to validate
 * @returns True if the ID is a valid View ID
 */
export function isValidViewId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(VIEW_ID_PREFIX) && id.length === 17;
}

/**
 * Validates batch size for operations.
 *
 * @param count - Number of items in the batch
 * @throws Error if batch size exceeds maximum
 */
export function validateBatchSize(count: number): void {
  if (count > MAX_BATCH_SIZE) {
    throw new Error(
      `Batch size ${count} exceeds maximum of ${MAX_BATCH_SIZE}. ` +
        `Split your operation into multiple batches.`
    );
  }
  if (count < 1) {
    throw new Error('Batch size must be at least 1');
  }
}

/**
 * Validates and clamps page size to valid range.
 *
 * @param size - Requested page size
 * @returns Clamped page size (1-100)
 */
export function validatePageSize(size: number): number {
  if (size < MIN_PAGE_SIZE) {
    return MIN_PAGE_SIZE;
  }
  if (size > MAX_PAGE_SIZE) {
    return MAX_PAGE_SIZE;
  }
  return Math.floor(size);
}

/**
 * Validates field name.
 *
 * @param name - Field name to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateFieldName(name: string): string[] {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('Field name cannot be empty');
  }
  if (name.length > 255) {
    errors.push('Field name exceeds maximum length of 255 characters');
  }

  return errors;
}

/**
 * Checks if a value is a valid Airtable date string.
 *
 * @param value - Value to check
 * @returns True if value is a valid ISO date string
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // Check ISO date format (YYYY-MM-DD)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(value)) return false;
  // Validate it's a real date
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Checks if a value is a valid Airtable datetime string.
 *
 * @param value - Value to check
 * @returns True if value is a valid ISO datetime string
 */
export function isValidDateTimeString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // Check ISO datetime format
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.includes('T');
}

/**
 * Type guard for UserRef.
 *
 * @param value - Value to check
 * @returns True if value is a UserRef
 */
export function isUserRef(value: unknown): value is UserRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'email' in value &&
    typeof (value as UserRef).id === 'string' &&
    typeof (value as UserRef).email === 'string'
  );
}

/**
 * Type guard for Attachment.
 *
 * @param value - Value to check
 * @returns True if value is an Attachment
 */
export function isAttachment(value: unknown): value is Attachment {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'url' in value &&
    'filename' in value &&
    typeof (value as Attachment).id === 'string' &&
    typeof (value as Attachment).url === 'string' &&
    typeof (value as Attachment).filename === 'string'
  );
}

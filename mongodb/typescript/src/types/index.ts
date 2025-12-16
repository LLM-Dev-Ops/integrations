/**
 * MongoDB type definitions following SPARC specification.
 *
 * Provider-agnostic document database interfaces for collections, queries,
 * and aggregation pipelines.
 */

// ============================================================================
// Base Document Types
// ============================================================================

/**
 * ObjectId type - MongoDB ObjectId as string representation.
 * Format: 24-character hexadecimal string.
 */
export type ObjectId = string;

/**
 * Base document interface with optional _id field.
 */
export interface Document {
  /** Document ID - typically an ObjectId */
  _id?: ObjectId;
  /** Allow arbitrary fields */
  [key: string]: unknown;
}

/**
 * Utility type to add _id to a document type.
 * Ensures _id is always present.
 */
export type WithId<T extends Document> = T & { _id: ObjectId };

/**
 * Document with automatic timestamps.
 */
export interface DocumentWithTimestamps extends Document {
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

// ============================================================================
// Filter and Query Types
// ============================================================================

/**
 * MongoDB comparison operators.
 */
export interface ComparisonOperators<T> {
  /** Matches values equal to a specified value */
  $eq?: T;
  /** Matches values not equal to a specified value */
  $ne?: T;
  /** Matches values greater than a specified value */
  $gt?: T;
  /** Matches values greater than or equal to a specified value */
  $gte?: T;
  /** Matches values less than a specified value */
  $lt?: T;
  /** Matches values less than or equal to a specified value */
  $lte?: T;
  /** Matches any of the values in an array */
  $in?: T[];
  /** Matches none of the values in an array */
  $nin?: T[];
}

/**
 * MongoDB logical operators.
 */
export interface LogicalOperators<T> {
  /** Joins query clauses with AND */
  $and?: Filter<T>[];
  /** Joins query clauses with OR */
  $or?: Filter<T>[];
  /** Inverts the effect of a query expression */
  $not?: Filter<T>;
  /** Joins query clauses with NOR */
  $nor?: Filter<T>[];
}

/**
 * MongoDB element operators.
 */
export interface ElementOperators {
  /** Matches documents that have the specified field */
  $exists?: boolean;
  /** Selects documents if a field is of the specified type */
  $type?: string | number | Array<string | number>;
}

/**
 * MongoDB array operators.
 */
export interface ArrayOperators<T> {
  /** Matches arrays that contain all elements specified in the query */
  $all?: T[];
  /** Matches documents where array size equals specified value */
  $size?: number;
  /** Selects documents if element in the array field matches */
  $elemMatch?: Filter<T>;
}

/**
 * MongoDB evaluation operators.
 */
export interface EvaluationOperators {
  /** Performs a modulo operation and selects matching documents */
  $mod?: [number, number];
  /** Selects documents where values match a regex */
  $regex?: string | RegExp;
  /** Options for $regex */
  $options?: string;
  /** Matches documents that satisfy a JavaScript expression */
  $where?: string | ((this: unknown) => boolean);
  /** Performs text search */
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacriticSensitive?: boolean;
  };
}

/**
 * Field-level query operators.
 */
export type FieldQueryOperators<T> = ComparisonOperators<T> &
  ElementOperators &
  EvaluationOperators &
  (T extends unknown[] ? ArrayOperators<T[number]> : Record<string, never>);

/**
 * MongoDB filter - query object for matching documents.
 */
export type Filter<T> = {
  [P in keyof T]?: T[P] | FieldQueryOperators<T[P]>;
} & LogicalOperators<T>;

/**
 * Update operators for $set, $unset, etc.
 */
export interface UpdateOperators<T> {
  /** Sets the value of a field */
  $set?: Partial<T>;
  /** Removes the specified field */
  $unset?: Partial<Record<keyof T, '' | 1 | true>>;
  /** Increments the value of a field by a specified amount */
  $inc?: Partial<Record<keyof T, number>>;
  /** Multiplies the value of a field by a specified amount */
  $mul?: Partial<Record<keyof T, number>>;
  /** Renames a field */
  $rename?: Partial<Record<keyof T, string>>;
  /** Sets the value of a field if update results in insert */
  $setOnInsert?: Partial<T>;
  /** Only updates if specified value is less than existing */
  $min?: Partial<T>;
  /** Only updates if specified value is greater than existing */
  $max?: Partial<T>;
  /** Sets the value of a field to current date */
  $currentDate?: Partial<Record<keyof T, true | { $type: 'date' | 'timestamp' }>>;
}

/**
 * Array update operators.
 */
export interface ArrayUpdateOperators<T> {
  /** Adds elements to an array */
  $push?: Partial<T> | { $each?: unknown[]; $position?: number; $slice?: number; $sort?: 1 | -1 };
  /** Adds elements to array only if they don't exist */
  $addToSet?: Partial<T> | { $each?: unknown[] };
  /** Removes first or last item of an array */
  $pop?: Partial<Record<keyof T, 1 | -1>>;
  /** Removes all array elements that match */
  $pull?: Partial<T>;
  /** Removes all matching values from array */
  $pullAll?: Partial<Record<keyof T, unknown[]>>;
}

/**
 * Complete update filter type.
 */
export type UpdateFilter<T> = UpdateOperators<T> & ArrayUpdateOperators<T>;

/**
 * Sort order values.
 */
export type SortOrder = 1 | -1 | 'asc' | 'desc' | 'ascending' | 'descending';

/**
 * Sort specification for queries.
 */
export type Sort<T> = {
  [P in keyof T]?: SortOrder;
} & {
  /** Text score for text search */
  $textScore?: { $meta: 'textScore' };
};

/**
 * Projection specification - select which fields to return.
 */
export type Projection<T> = {
  [P in keyof T]?: 0 | 1 | boolean;
} & {
  /** Always allow _id projection control */
  _id?: 0 | 1 | boolean;
};

// ============================================================================
// Options Types
// ============================================================================

/**
 * Options for find operations.
 */
export interface FindOptions<T = Document> {
  /** Limits the fields to return */
  projection?: Projection<T>;
  /** Specifies the sort order */
  sort?: Sort<T>;
  /** Number of documents to skip */
  skip?: number;
  /** Maximum number of documents to return */
  limit?: number;
  /** Hint for which index to use */
  hint?: string | Document;
  /** Maximum time in milliseconds */
  maxTimeMs?: number;
  /** Include a comment in the query */
  comment?: string;
  /** Return key only (no document data) */
  returnKey?: boolean;
  /** Show disk location of results */
  showRecordId?: boolean;
  /** Partial filter expression for partial index */
  partialFilterExpression?: Filter<T>;
}

/**
 * Options for findOne operations.
 */
export interface FindOneOptions<T = Document> extends Omit<FindOptions<T>, 'limit'> {}

/**
 * Options for insert one operations.
 */
export interface InsertOneOptions {
  /** Bypass document validation */
  bypassDocumentValidation?: boolean;
  /** Include comment with the operation */
  comment?: string;
}

/**
 * Options for insert many operations.
 */
export interface InsertManyOptions extends InsertOneOptions {
  /** Whether to perform ordered or unordered insert */
  ordered?: boolean;
}

/**
 * Options for update operations.
 */
export interface UpdateOptions {
  /** Create a document if no match is found */
  upsert?: boolean;
  /** Bypass document validation */
  bypassDocumentValidation?: boolean;
  /** Hint for which index to use */
  hint?: string | Document;
  /** Array filters for update operations */
  arrayFilters?: Filter<unknown>[];
  /** Include comment with the operation */
  comment?: string;
}

/**
 * Options for delete operations.
 */
export interface DeleteOptions {
  /** Hint for which index to use */
  hint?: string | Document;
  /** Include comment with the operation */
  comment?: string;
}

/**
 * Options for replace operations.
 */
export interface ReplaceOptions {
  /** Create a document if no match is found */
  upsert?: boolean;
  /** Bypass document validation */
  bypassDocumentValidation?: boolean;
  /** Hint for which index to use */
  hint?: string | Document;
  /** Include comment with the operation */
  comment?: string;
}

/**
 * Options for count operations.
 */
export interface CountOptions {
  /** Number of documents to skip */
  skip?: number;
  /** Maximum number of documents to count */
  limit?: number;
  /** Hint for which index to use */
  hint?: string | Document;
  /** Maximum time in milliseconds */
  maxTimeMs?: number;
  /** Include comment with the operation */
  comment?: string;
}

/**
 * Options for distinct operations.
 */
export interface DistinctOptions {
  /** Maximum time in milliseconds */
  maxTimeMs?: number;
  /** Include comment with the operation */
  comment?: string;
}

/**
 * Options for aggregate operations.
 */
export interface AggregateOptions {
  /** Allow writing to temporary files */
  allowDiskUse?: boolean;
  /** Maximum time in milliseconds */
  maxTimeMs?: number;
  /** Hint for which index to use */
  hint?: string | Document;
  /** Number of documents per batch */
  batchSize?: number;
  /** Include comment with the operation */
  comment?: string;
  /** Bypass document validation */
  bypassDocumentValidation?: boolean;
  /** Read concern level */
  readConcern?: { level: 'local' | 'majority' | 'linearizable' | 'available' | 'snapshot' };
  /** Collation options */
  collation?: CollationOptions;
}

/**
 * Collation options for string comparison.
 */
export interface CollationOptions {
  /** Locale string */
  locale: string;
  /** Case level */
  caseLevel?: boolean;
  /** Case first */
  caseFirst?: 'upper' | 'lower' | 'off';
  /** Strength */
  strength?: 1 | 2 | 3 | 4 | 5;
  /** Numeric ordering */
  numericOrdering?: boolean;
  /** Alternate */
  alternate?: 'non-ignorable' | 'shifted';
  /** Max variable */
  maxVariable?: 'punct' | 'space';
  /** Backwards */
  backwards?: boolean;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of insertOne operation.
 */
export interface InsertOneResult {
  /** The inserted document ID */
  insertedId: ObjectId;
  /** Whether the operation was acknowledged */
  acknowledged: boolean;
}

/**
 * Result of insertMany operation.
 */
export interface InsertManyResult {
  /** Map of index to inserted ID */
  insertedIds: Record<number, ObjectId>;
  /** Number of documents inserted */
  insertedCount: number;
  /** Whether the operation was acknowledged */
  acknowledged: boolean;
}

/**
 * Result of update operations.
 */
export interface UpdateResult {
  /** Number of documents matched */
  matchedCount: number;
  /** Number of documents modified */
  modifiedCount: number;
  /** ID of upserted document (if upsert occurred) */
  upsertedId?: ObjectId;
  /** Number of documents upserted */
  upsertedCount: number;
  /** Whether the operation was acknowledged */
  acknowledged: boolean;
}

/**
 * Result of delete operations.
 */
export interface DeleteResult {
  /** Number of documents deleted */
  deletedCount: number;
  /** Whether the operation was acknowledged */
  acknowledged: boolean;
}

/**
 * Bulk write operation types.
 */
export interface InsertOneOperation<T> {
  insertOne: { document: T };
}

export interface UpdateOneOperation<T> {
  updateOne: { filter: Filter<T>; update: UpdateFilter<T>; upsert?: boolean };
}

export interface UpdateManyOperation<T> {
  updateMany: { filter: Filter<T>; update: UpdateFilter<T>; upsert?: boolean };
}

export interface DeleteOneOperation<T> {
  deleteOne: { filter: Filter<T> };
}

export interface DeleteManyOperation<T> {
  deleteMany: { filter: Filter<T> };
}

export interface ReplaceOneOperation<T> {
  replaceOne: { filter: Filter<T>; replacement: T; upsert?: boolean };
}

/**
 * Union of all bulk write operations.
 */
export type BulkWriteOperation<T> =
  | InsertOneOperation<T>
  | UpdateOneOperation<T>
  | UpdateManyOperation<T>
  | DeleteOneOperation<T>
  | DeleteManyOperation<T>
  | ReplaceOneOperation<T>;

/**
 * Result of bulkWrite operation.
 */
export interface BulkWriteResult {
  /** Number of documents inserted */
  insertedCount: number;
  /** Number of documents matched */
  matchedCount: number;
  /** Number of documents modified */
  modifiedCount: number;
  /** Number of documents deleted */
  deletedCount: number;
  /** Number of documents upserted */
  upsertedCount: number;
  /** Map of index to upserted ID */
  upsertedIds: Record<number, ObjectId>;
  /** Whether the operation was acknowledged */
  acknowledged: boolean;
}

// ============================================================================
// Index Types
// ============================================================================

/**
 * Index direction and special types.
 */
export type IndexDirection = 1 | -1 | '2d' | '2dsphere' | 'text' | 'hashed' | 'geoHaystack';

/**
 * Index specification - defines fields and their sort order.
 */
export type IndexSpecification = Record<string, IndexDirection>;

/**
 * Options for creating indexes.
 */
export interface CreateIndexOptions {
  /** Create a unique index */
  unique?: boolean;
  /** Create a sparse index */
  sparse?: boolean;
  /** TTL in seconds (for TTL indexes) */
  expireAfterSeconds?: number;
  /** Create index in background (deprecated) */
  background?: boolean;
  /** Index name */
  name?: string;
  /** Partial filter expression */
  partialFilterExpression?: Document;
  /** Storage engine options */
  storageEngine?: Document;
  /** Collation options */
  collation?: CollationOptions;
  /** Wildcard projection */
  wildcardProjection?: Document;
  /** Hidden index */
  hidden?: boolean;
  /** Text index version */
  textIndexVersion?: number;
  /** 2dsphere index version */
  '2dsphereIndexVersion'?: number;
  /** Default language for text index */
  default_language?: string;
  /** Language override field for text index */
  language_override?: string;
  /** Weights for text index */
  weights?: Document;
}

/**
 * Index description with metadata.
 */
export interface IndexDescription {
  /** Index name */
  name: string;
  /** Index key specification */
  key: IndexSpecification;
  /** Whether index is unique */
  unique?: boolean;
  /** Whether index is sparse */
  sparse?: boolean;
  /** TTL value */
  expireAfterSeconds?: number;
  /** Partial filter expression */
  partialFilterExpression?: Document;
  /** Index version */
  v?: number;
  /** Collation */
  collation?: CollationOptions;
}

// ============================================================================
// Aggregation Types
// ============================================================================

/**
 * $match stage - filters documents.
 */
export interface MatchStage<T = Document> {
  $match: Filter<T>;
}

/**
 * $group stage - groups documents by expression.
 */
export interface GroupStage {
  $group: {
    _id: unknown;
    [field: string]: unknown;
  };
}

/**
 * $project stage - reshapes documents.
 */
export interface ProjectStage<T = Document> {
  $project: Projection<T> & {
    [newField: string]: unknown;
  };
}

/**
 * $sort stage - sorts documents.
 */
export interface SortStage<T = Document> {
  $sort: Sort<T>;
}

/**
 * $limit stage - limits number of documents.
 */
export interface LimitStage {
  $limit: number;
}

/**
 * $skip stage - skips number of documents.
 */
export interface SkipStage {
  $skip: number;
}

/**
 * $lookup stage - performs left outer join.
 */
export interface LookupStage {
  $lookup: {
    from: string;
    localField?: string;
    foreignField?: string;
    let?: Document;
    pipeline?: PipelineStage[];
    as: string;
  };
}

/**
 * $unwind stage - deconstructs array field.
 */
export interface UnwindStage {
  $unwind: string | {
    path: string;
    includeArrayIndex?: string;
    preserveNullAndEmptyArrays?: boolean;
  };
}

/**
 * $addFields stage - adds new fields.
 */
export interface AddFieldsStage {
  $addFields: Document;
}

/**
 * $replaceRoot stage - replaces document root.
 */
export interface ReplaceRootStage {
  $replaceRoot: {
    newRoot: unknown;
  };
}

/**
 * $facet stage - processes multiple pipelines.
 */
export interface FacetStage {
  $facet: Record<string, PipelineStage[]>;
}

/**
 * $bucket stage - categorizes documents into buckets.
 */
export interface BucketStage {
  $bucket: {
    groupBy: unknown;
    boundaries: unknown[];
    default?: unknown;
    output?: Document;
  };
}

/**
 * $count stage - counts documents.
 */
export interface CountStage {
  $count: string;
}

/**
 * $out stage - writes results to collection.
 */
export interface OutStage {
  $out: string | {
    db: string;
    coll: string;
  };
}

/**
 * $merge stage - merges results into collection.
 */
export interface MergeStage {
  $merge: {
    into: string | { db: string; coll: string };
    on?: string | string[];
    let?: Document;
    whenMatched?: 'replace' | 'keepExisting' | 'merge' | 'fail' | PipelineStage[];
    whenNotMatched?: 'insert' | 'discard' | 'fail';
  };
}

/**
 * $sample stage - randomly selects documents.
 */
export interface SampleStage {
  $sample: { size: number };
}

/**
 * $redact stage - restricts document contents.
 */
export interface RedactStage {
  $redact: unknown;
}

/**
 * Union of all aggregation pipeline stages.
 */
export type PipelineStage<T = Document> =
  | MatchStage<T>
  | GroupStage
  | ProjectStage<T>
  | SortStage<T>
  | LimitStage
  | SkipStage
  | LookupStage
  | UnwindStage
  | AddFieldsStage
  | ReplaceRootStage
  | FacetStage
  | BucketStage
  | CountStage
  | OutStage
  | MergeStage
  | SampleStage
  | RedactStage;

/**
 * Result type for aggregation operations.
 */
export type AggregationCursor<T> = AsyncIterable<T> & {
  /** Convert cursor to array */
  toArray(): Promise<T[]>;
  /** Check if cursor has next */
  hasNext(): Promise<boolean>;
  /** Get next document */
  next(): Promise<T | null>;
  /** Close cursor */
  close(): Promise<void>;
};

// ============================================================================
// Change Stream Types
// ============================================================================

/**
 * Operation types for change streams.
 */
export type OperationType =
  | 'insert'
  | 'update'
  | 'replace'
  | 'delete'
  | 'invalidate'
  | 'drop'
  | 'dropDatabase'
  | 'rename';

/**
 * Resume token for change streams.
 */
export type ResumeToken = Document;

/**
 * Options for watching change streams.
 */
export interface ChangeStreamOptions {
  /** Return the full document on update operations */
  fullDocument?: 'default' | 'updateLookup' | 'whenAvailable' | 'required';
  /** Return the full document before it was modified */
  fullDocumentBeforeChange?: 'off' | 'whenAvailable' | 'required';
  /** Resume token to start after */
  resumeAfter?: ResumeToken;
  /** Start after this token */
  startAfter?: ResumeToken;
  /** Start at this operation time */
  startAtOperationTime?: Date;
  /** Maximum await time */
  maxAwaitTimeMs?: number;
  /** Batch size */
  batchSize?: number;
  /** Collation */
  collation?: CollationOptions;
  /** Include comment */
  comment?: string;
}

/**
 * Document key identifier in change events.
 */
export interface DocumentKey {
  _id: ObjectId;
  [key: string]: unknown;
}

/**
 * Update description for update events.
 */
export interface UpdateDescription {
  /** Updated fields */
  updatedFields?: Document;
  /** Removed fields */
  removedFields?: string[];
  /** Truncated arrays */
  truncatedArrays?: Array<{
    field: string;
    newSize: number;
  }>;
}

/**
 * Change event from change stream.
 */
export interface ChangeEvent<T = Document> {
  /** Resume token for this event */
  _id: ResumeToken;
  /** Type of operation */
  operationType: OperationType;
  /** Cluster time of the event */
  clusterTime: Date;
  /** Transaction number (for multi-document transactions) */
  txnNumber?: number;
  /** Logical session ID */
  lsid?: Document;
  /** Namespace (database and collection) */
  ns: {
    db: string;
    coll: string;
  };
  /** Document key */
  documentKey?: DocumentKey;
  /** Full document (for insert, replace, and update with fullDocument) */
  fullDocument?: T;
  /** Full document before change */
  fullDocumentBeforeChange?: T;
  /** Update description (for update operations) */
  updateDescription?: UpdateDescription;
  /** Renamed collection name (for rename operations) */
  to?: {
    db: string;
    coll: string;
  };
}

/**
 * Change stream cursor.
 */
export type ChangeStreamCursor<T = Document> = AsyncIterable<ChangeEvent<T>> & {
  /** Get next change event */
  next(): Promise<ChangeEvent<T> | null>;
  /** Check if cursor has next */
  hasNext(): Promise<boolean>;
  /** Close the cursor */
  close(): Promise<void>;
  /** Get resume token */
  resumeToken: ResumeToken;
};

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * ObjectId regex pattern - 24 hex characters.
 */
export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Validates ObjectId format.
 */
export function isValidObjectId(id: string): boolean {
  return typeof id === 'string' && OBJECT_ID_PATTERN.test(id);
}

/**
 * Generates a new ObjectId string.
 * Note: This is a client-side generation and should match MongoDB's algorithm.
 */
export function generateObjectId(): ObjectId {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const randomValue = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0');
  const counter = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0');
  const processId = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');

  return timestamp + randomValue + processId + counter;
}

/**
 * Extracts timestamp from ObjectId.
 */
export function getObjectIdTimestamp(id: ObjectId): Date | null {
  if (!isValidObjectId(id)) return null;
  const timestamp = parseInt(id.substring(0, 8), 16);
  return new Date(timestamp * 1000);
}

/**
 * Validates a document structure.
 * Returns array of validation error messages.
 */
export function validateDocument(doc: unknown): string[] {
  const errors: string[] = [];

  if (typeof doc !== 'object' || doc === null) {
    errors.push('Document must be a non-null object');
    return errors;
  }

  const document = doc as Document;

  // Check for _id validity if present
  if (document._id !== undefined) {
    if (typeof document._id !== 'string') {
      errors.push('Document _id must be a string (ObjectId)');
    } else if (!isValidObjectId(document._id)) {
      errors.push('Document _id is not a valid ObjectId format');
    }
  }

  // Check for invalid field names
  for (const key of Object.keys(document)) {
    // Field names cannot start with $
    if (key.startsWith('$')) {
      errors.push(`Field name "${key}" cannot start with $`);
    }
    // Field names cannot contain .
    if (key.includes('.')) {
      errors.push(`Field name "${key}" cannot contain dots`);
    }
    // Check field name length
    if (key.length === 0) {
      errors.push('Field name cannot be empty');
    }
    if (key.length > 1024) {
      errors.push(`Field name "${key}" exceeds maximum length of 1024 characters`);
    }
  }

  // Check for circular references (basic check)
  try {
    JSON.stringify(document);
  } catch (e) {
    if (e instanceof TypeError && e.message.includes('circular')) {
      errors.push('Document contains circular references');
    }
  }

  return errors;
}

/**
 * Validates a filter object.
 * Returns array of validation error messages.
 */
export function validateFilter<T extends Document>(filter: Filter<T>): string[] {
  const errors: string[] = [];

  if (typeof filter !== 'object' || filter === null) {
    errors.push('Filter must be a non-null object');
    return errors;
  }

  // Basic structure validation
  try {
    JSON.stringify(filter);
  } catch (e) {
    if (e instanceof TypeError && e.message.includes('circular')) {
      errors.push('Filter contains circular references');
    }
  }

  return errors;
}

/**
 * Validates an update filter.
 * Returns array of validation error messages.
 */
export function validateUpdateFilter<T extends Document>(update: UpdateFilter<T>): string[] {
  const errors: string[] = [];

  if (typeof update !== 'object' || update === null) {
    errors.push('Update filter must be a non-null object');
    return errors;
  }

  const updateObj = update as Record<string, unknown>;
  const keys = Object.keys(updateObj);

  // Update must contain at least one operator
  if (keys.length === 0) {
    errors.push('Update filter cannot be empty');
    return errors;
  }

  // All top-level keys must be operators (start with $)
  const invalidKeys = keys.filter(key => !key.startsWith('$'));
  if (invalidKeys.length > 0) {
    errors.push(
      `Update filter must only contain update operators. Invalid keys: ${invalidKeys.join(', ')}`
    );
  }

  // Validate known operators
  const validOperators = [
    '$set',
    '$unset',
    '$inc',
    '$mul',
    '$rename',
    '$setOnInsert',
    '$min',
    '$max',
    '$currentDate',
    '$push',
    '$addToSet',
    '$pop',
    '$pull',
    '$pullAll',
  ];

  const unknownOperators = keys.filter(
    key => key.startsWith('$') && !validOperators.includes(key)
  );
  if (unknownOperators.length > 0) {
    errors.push(`Unknown update operators: ${unknownOperators.join(', ')}`);
  }

  return errors;
}

/**
 * Validates pipeline stages.
 * Returns array of validation error messages.
 */
export function validatePipeline(pipeline: PipelineStage[]): string[] {
  const errors: string[] = [];

  if (!Array.isArray(pipeline)) {
    errors.push('Pipeline must be an array');
    return errors;
  }

  if (pipeline.length === 0) {
    errors.push('Pipeline cannot be empty');
    return errors;
  }

  pipeline.forEach((stage, index) => {
    if (typeof stage !== 'object' || stage === null) {
      errors.push(`Stage ${index} must be a non-null object`);
      return;
    }

    const stageKeys = Object.keys(stage);
    if (stageKeys.length !== 1) {
      errors.push(`Stage ${index} must have exactly one stage operator`);
      return;
    }

    const operator = stageKeys[0]!;
    if (!operator.startsWith('$')) {
      errors.push(`Stage ${index} operator must start with $ (got "${operator}")`);
    }
  });

  return errors;
}

/**
 * Maximum document size in bytes (16MB for MongoDB).
 */
export const MAX_DOCUMENT_SIZE = 16 * 1024 * 1024;

/**
 * Estimates document size in bytes.
 */
export function estimateDocumentSize(doc: Document): number {
  try {
    return new TextEncoder().encode(JSON.stringify(doc)).length;
  } catch {
    return 0;
  }
}

/**
 * Checks if document exceeds maximum size.
 */
export function isDocumentTooLarge(doc: Document): boolean {
  return estimateDocumentSize(doc) > MAX_DOCUMENT_SIZE;
}

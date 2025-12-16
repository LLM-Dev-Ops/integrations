/**
 * Field data types supported by Milvus.
 */
export enum FieldType {
  Bool = 'Bool',
  Int8 = 'Int8',
  Int16 = 'Int16',
  Int32 = 'Int32',
  Int64 = 'Int64',
  Float = 'Float',
  Double = 'Double',
  String = 'String',
  VarChar = 'VarChar',
  Json = 'JSON',
  Array = 'Array',
  FloatVector = 'FloatVector',
  Float16Vector = 'Float16Vector',
  BFloat16Vector = 'BFloat16Vector',
  BinaryVector = 'BinaryVector',
  SparseFloatVector = 'SparseFloatVector',
}

/**
 * Load state of a collection or partition.
 */
export enum LoadState {
  NotLoad = 'NotLoad',
  Loading = 'Loading',
  Loaded = 'Loaded',
  LoadFailed = 'LoadFailed',
}

/**
 * Schema definition for a field in a collection.
 */
export interface FieldSchema {
  /** Field name */
  name: string;
  /** Field data type */
  dataType: FieldType;
  /** Whether this is the primary key field */
  isPrimary: boolean;
  /** Whether this field is used as partition key */
  isPartitionKey: boolean;
  /** Auto-generate IDs (for primary key fields) */
  isAutoId: boolean;
  /** Maximum length for VarChar fields */
  maxLength?: number;
  /** Vector dimension for vector fields */
  dimension?: number;
  /** Element type for Array fields */
  elementType?: FieldType;
  /** Maximum capacity for Array fields */
  maxCapacity?: number;
}

/**
 * Schema definition for a collection.
 */
export interface CollectionSchema {
  /** Fields in the collection */
  fields: FieldSchema[];
  /** Whether dynamic fields are enabled */
  enableDynamicField: boolean;
  /** Collection description */
  description?: string;
}

/**
 * Information about a collection.
 */
export interface CollectionInfo {
  /** Collection name */
  name: string;
  /** Collection description */
  description: string;
  /** Collection schema */
  schema: CollectionSchema;
  /** Number of entities in the collection */
  numEntities: bigint;
  /** Current load state */
  loadState: LoadState;
  /** Creation timestamp */
  createdTimestamp: bigint;
}

/**
 * Statistics for a collection.
 */
export interface CollectionStats {
  /** Number of rows/entities */
  rowCount: bigint;
}

/**
 * Information about a partition.
 */
export interface PartitionInfo {
  /** Partition name */
  name: string;
  /** Number of entities */
  numEntities: bigint;
  /** Current load state */
  loadState: LoadState;
}

/**
 * Statistics for a partition.
 */
export interface PartitionStats {
  /** Number of rows/entities */
  rowCount: bigint;
}

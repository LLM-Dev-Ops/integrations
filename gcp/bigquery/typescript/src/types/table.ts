/**
 * Table and table reference types for BigQuery.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

import { TableSchema, parseTableSchema, serializeTableSchema } from "./schema.js";

/**
 * Table reference identifying a BigQuery table.
 */
export interface TableReference {
  /** GCP project ID. */
  projectId: string;

  /** Dataset ID. */
  datasetId: string;

  /** Table ID. */
  tableId: string;
}

/**
 * Time partitioning type enumeration.
 */
export enum TimePartitioningType {
  DAY = "DAY",
  HOUR = "HOUR",
  MONTH = "MONTH",
  YEAR = "YEAR",
}

/**
 * Time partitioning configuration.
 */
export interface TimePartitioning {
  /** Partitioning type. */
  type: TimePartitioningType;

  /** Partitioning field name. */
  field?: string;

  /** Partition expiration in milliseconds. */
  expirationMs?: string;

  /** Require partition filter. */
  requirePartitionFilter?: boolean;
}

/**
 * Range partitioning configuration.
 */
export interface RangePartitioning {
  /** Field to partition on. */
  field: string;

  /** Range start value. */
  start: number;

  /** Range end value. */
  end: number;

  /** Interval size. */
  interval: number;
}

/**
 * Clustering configuration.
 */
export interface Clustering {
  /** Fields to cluster by (up to 4). */
  fields: string[];
}

/**
 * Table encryption configuration.
 */
export interface EncryptionConfiguration {
  /** KMS key name. */
  kmsKeyName: string;
}

/**
 * Complete table metadata and configuration.
 */
export interface Table {
  /** Table reference. */
  tableReference: TableReference;

  /** Table schema. */
  schema?: TableSchema;

  /** Friendly name. */
  friendlyName?: string;

  /** Description. */
  description?: string;

  /** Labels. */
  labels?: Record<string, string>;

  /** Creation time. */
  creationTime?: Date;

  /** Last modified time. */
  lastModifiedTime?: Date;

  /** Time partitioning. */
  timePartitioning?: TimePartitioning;

  /** Range partitioning. */
  rangePartitioning?: RangePartitioning;

  /** Clustering. */
  clustering?: Clustering;

  /** Number of rows. */
  numRows?: bigint;

  /** Number of bytes. */
  numBytes?: bigint;

  /** Expiration time. */
  expirationTime?: Date;

  /** Encryption configuration. */
  encryptionConfiguration?: EncryptionConfiguration;

  /** ETag. */
  etag?: string;

  /** Self link. */
  selfLink?: string;

  /** Table type (TABLE, VIEW, EXTERNAL, MATERIALIZED_VIEW). */
  type?: string;

  /** Location. */
  location?: string;
}

/**
 * Parse table reference from BigQuery JSON response.
 */
export function parseTableReference(json: Record<string, unknown>): TableReference {
  return {
    projectId: json.projectId as string,
    datasetId: json.datasetId as string,
    tableId: json.tableId as string,
  };
}

/**
 * Parse time partitioning from BigQuery JSON response.
 */
export function parseTimePartitioning(json: Record<string, unknown>): TimePartitioning {
  const result: TimePartitioning = {
    type: (json.type as TimePartitioningType) ?? TimePartitioningType.DAY,
  };

  if (json.field) {
    result.field = json.field as string;
  }

  if (json.expirationMs) {
    result.expirationMs = json.expirationMs as string;
  }

  if (json.requirePartitionFilter !== undefined) {
    result.requirePartitionFilter = json.requirePartitionFilter as boolean;
  }

  return result;
}

/**
 * Parse range partitioning from BigQuery JSON response.
 */
export function parseRangePartitioning(json: Record<string, unknown>): RangePartitioning {
  const range = json.range as Record<string, unknown>;
  return {
    field: json.field as string,
    start: parseInt(range.start as string, 10),
    end: parseInt(range.end as string, 10),
    interval: parseInt(range.interval as string, 10),
  };
}

/**
 * Parse clustering from BigQuery JSON response.
 */
export function parseClustering(json: Record<string, unknown>): Clustering {
  return {
    fields: (json.fields as string[]) ?? [],
  };
}

/**
 * Parse encryption configuration from BigQuery JSON response.
 */
export function parseEncryptionConfiguration(
  json: Record<string, unknown>
): EncryptionConfiguration {
  return {
    kmsKeyName: json.kmsKeyName as string,
  };
}

/**
 * Parse date from BigQuery timestamp (milliseconds since epoch).
 */
function parseTimestamp(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const ms = parseInt(value, 10);
  return isNaN(ms) ? undefined : new Date(ms);
}

/**
 * Parse table from BigQuery JSON response.
 */
export function parseTable(json: Record<string, unknown>): Table {
  const table: Table = {
    tableReference: parseTableReference(json.tableReference as Record<string, unknown>),
  };

  if (json.schema) {
    table.schema = parseTableSchema(json.schema as Record<string, unknown>);
  }

  if (json.friendlyName) {
    table.friendlyName = json.friendlyName as string;
  }

  if (json.description) {
    table.description = json.description as string;
  }

  if (json.labels) {
    table.labels = json.labels as Record<string, string>;
  }

  if (json.creationTime) {
    table.creationTime = parseTimestamp(json.creationTime as string);
  }

  if (json.lastModifiedTime) {
    table.lastModifiedTime = parseTimestamp(json.lastModifiedTime as string);
  }

  if (json.timePartitioning) {
    table.timePartitioning = parseTimePartitioning(
      json.timePartitioning as Record<string, unknown>
    );
  }

  if (json.rangePartitioning) {
    table.rangePartitioning = parseRangePartitioning(
      json.rangePartitioning as Record<string, unknown>
    );
  }

  if (json.clustering) {
    table.clustering = parseClustering(json.clustering as Record<string, unknown>);
  }

  if (json.numRows) {
    table.numRows = BigInt(json.numRows as string);
  }

  if (json.numBytes) {
    table.numBytes = BigInt(json.numBytes as string);
  }

  if (json.expirationTime) {
    table.expirationTime = parseTimestamp(json.expirationTime as string);
  }

  if (json.encryptionConfiguration) {
    table.encryptionConfiguration = parseEncryptionConfiguration(
      json.encryptionConfiguration as Record<string, unknown>
    );
  }

  if (json.etag) {
    table.etag = json.etag as string;
  }

  if (json.selfLink) {
    table.selfLink = json.selfLink as string;
  }

  if (json.type) {
    table.type = json.type as string;
  }

  if (json.location) {
    table.location = json.location as string;
  }

  return table;
}

/**
 * Serialize table reference to BigQuery JSON format.
 */
export function serializeTableReference(ref: TableReference): Record<string, unknown> {
  return {
    projectId: ref.projectId,
    datasetId: ref.datasetId,
    tableId: ref.tableId,
  };
}

/**
 * Serialize time partitioning to BigQuery JSON format.
 */
export function serializeTimePartitioning(partitioning: TimePartitioning): Record<string, unknown> {
  const json: Record<string, unknown> = {
    type: partitioning.type,
  };

  if (partitioning.field) {
    json.field = partitioning.field;
  }

  if (partitioning.expirationMs) {
    json.expirationMs = partitioning.expirationMs;
  }

  if (partitioning.requirePartitionFilter !== undefined) {
    json.requirePartitionFilter = partitioning.requirePartitionFilter;
  }

  return json;
}

/**
 * Serialize range partitioning to BigQuery JSON format.
 */
export function serializeRangePartitioning(partitioning: RangePartitioning): Record<string, unknown> {
  return {
    field: partitioning.field,
    range: {
      start: partitioning.start.toString(),
      end: partitioning.end.toString(),
      interval: partitioning.interval.toString(),
    },
  };
}

/**
 * Serialize clustering to BigQuery JSON format.
 */
export function serializeClustering(clustering: Clustering): Record<string, unknown> {
  return {
    fields: clustering.fields,
  };
}

/**
 * Serialize encryption configuration to BigQuery JSON format.
 */
export function serializeEncryptionConfiguration(
  config: EncryptionConfiguration
): Record<string, unknown> {
  return {
    kmsKeyName: config.kmsKeyName,
  };
}

/**
 * Format a table reference as a string.
 */
export function formatTableReference(ref: TableReference): string {
  return `${ref.projectId}.${ref.datasetId}.${ref.tableId}`;
}

/**
 * Parse a table reference from a string (project.dataset.table).
 */
export function parseTableReferenceString(str: string): TableReference | null {
  const parts = str.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null;
  }
  return {
    projectId: parts[0],
    datasetId: parts[1],
    tableId: parts[2],
  };
}

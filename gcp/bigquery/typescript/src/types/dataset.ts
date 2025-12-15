/**
 * Dataset and dataset reference types for BigQuery.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

/**
 * Dataset reference identifying a BigQuery dataset.
 */
export interface DatasetReference {
  /** GCP project ID. */
  projectId: string;

  /** Dataset ID. */
  datasetId: string;
}

/**
 * Dataset access entry.
 */
export interface DatasetAccessEntry {
  /** Role (READER, WRITER, OWNER). */
  role?: string;

  /** User email. */
  userByEmail?: string;

  /** Group email. */
  groupByEmail?: string;

  /** Domain. */
  domain?: string;

  /** Special group (projectReaders, projectWriters, projectOwners, allAuthenticatedUsers). */
  specialGroup?: string;

  /** IAM member. */
  iamMember?: string;

  /** View reference. */
  view?: {
    projectId: string;
    datasetId: string;
    tableId: string;
  };

  /** Routine reference. */
  routine?: {
    projectId: string;
    datasetId: string;
    routineId: string;
  };
}

/**
 * Dataset encryption configuration.
 */
export interface DatasetEncryptionConfiguration {
  /** KMS key name. */
  kmsKeyName: string;
}

/**
 * Complete dataset metadata and configuration.
 */
export interface Dataset {
  /** Dataset reference. */
  datasetReference: DatasetReference;

  /** Friendly name. */
  friendlyName?: string;

  /** Description. */
  description?: string;

  /** Labels. */
  labels?: Record<string, string>;

  /** Location. */
  location?: string;

  /** Default table expiration in milliseconds. */
  defaultTableExpirationMs?: string;

  /** Default partition expiration in milliseconds. */
  defaultPartitionExpirationMs?: string;

  /** Access control entries. */
  access?: DatasetAccessEntry[];

  /** Creation time. */
  creationTime?: Date;

  /** Last modified time. */
  lastModifiedTime?: Date;

  /** Encryption configuration. */
  defaultEncryptionConfiguration?: DatasetEncryptionConfiguration;

  /** ETag. */
  etag?: string;

  /** Self link. */
  selfLink?: string;
}

/**
 * Parse dataset reference from BigQuery JSON response.
 */
export function parseDatasetReference(json: Record<string, unknown>): DatasetReference {
  return {
    projectId: json.projectId as string,
    datasetId: json.datasetId as string,
  };
}

/**
 * Parse dataset access entry from BigQuery JSON response.
 */
export function parseDatasetAccessEntry(json: Record<string, unknown>): DatasetAccessEntry {
  const entry: DatasetAccessEntry = {};

  if (json.role) {
    entry.role = json.role as string;
  }

  if (json.userByEmail) {
    entry.userByEmail = json.userByEmail as string;
  }

  if (json.groupByEmail) {
    entry.groupByEmail = json.groupByEmail as string;
  }

  if (json.domain) {
    entry.domain = json.domain as string;
  }

  if (json.specialGroup) {
    entry.specialGroup = json.specialGroup as string;
  }

  if (json.iamMember) {
    entry.iamMember = json.iamMember as string;
  }

  if (json.view) {
    const view = json.view as Record<string, unknown>;
    entry.view = {
      projectId: view.projectId as string,
      datasetId: view.datasetId as string,
      tableId: view.tableId as string,
    };
  }

  if (json.routine) {
    const routine = json.routine as Record<string, unknown>;
    entry.routine = {
      projectId: routine.projectId as string,
      datasetId: routine.datasetId as string,
      routineId: routine.routineId as string,
    };
  }

  return entry;
}

/**
 * Parse dataset encryption configuration from BigQuery JSON response.
 */
export function parseDatasetEncryptionConfiguration(
  json: Record<string, unknown>
): DatasetEncryptionConfiguration {
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
 * Parse dataset from BigQuery JSON response.
 */
export function parseDataset(json: Record<string, unknown>): Dataset {
  const dataset: Dataset = {
    datasetReference: parseDatasetReference(json.datasetReference as Record<string, unknown>),
  };

  if (json.friendlyName) {
    dataset.friendlyName = json.friendlyName as string;
  }

  if (json.description) {
    dataset.description = json.description as string;
  }

  if (json.labels) {
    dataset.labels = json.labels as Record<string, string>;
  }

  if (json.location) {
    dataset.location = json.location as string;
  }

  if (json.defaultTableExpirationMs) {
    dataset.defaultTableExpirationMs = json.defaultTableExpirationMs as string;
  }

  if (json.defaultPartitionExpirationMs) {
    dataset.defaultPartitionExpirationMs = json.defaultPartitionExpirationMs as string;
  }

  if (json.access) {
    dataset.access = (json.access as Record<string, unknown>[]).map(parseDatasetAccessEntry);
  }

  if (json.creationTime) {
    dataset.creationTime = parseTimestamp(json.creationTime as string);
  }

  if (json.lastModifiedTime) {
    dataset.lastModifiedTime = parseTimestamp(json.lastModifiedTime as string);
  }

  if (json.defaultEncryptionConfiguration) {
    dataset.defaultEncryptionConfiguration = parseDatasetEncryptionConfiguration(
      json.defaultEncryptionConfiguration as Record<string, unknown>
    );
  }

  if (json.etag) {
    dataset.etag = json.etag as string;
  }

  if (json.selfLink) {
    dataset.selfLink = json.selfLink as string;
  }

  return dataset;
}

/**
 * Serialize dataset reference to BigQuery JSON format.
 */
export function serializeDatasetReference(ref: DatasetReference): Record<string, unknown> {
  return {
    projectId: ref.projectId,
    datasetId: ref.datasetId,
  };
}

/**
 * Serialize dataset access entry to BigQuery JSON format.
 */
export function serializeDatasetAccessEntry(entry: DatasetAccessEntry): Record<string, unknown> {
  const json: Record<string, unknown> = {};

  if (entry.role) {
    json.role = entry.role;
  }

  if (entry.userByEmail) {
    json.userByEmail = entry.userByEmail;
  }

  if (entry.groupByEmail) {
    json.groupByEmail = entry.groupByEmail;
  }

  if (entry.domain) {
    json.domain = entry.domain;
  }

  if (entry.specialGroup) {
    json.specialGroup = entry.specialGroup;
  }

  if (entry.iamMember) {
    json.iamMember = entry.iamMember;
  }

  if (entry.view) {
    json.view = {
      projectId: entry.view.projectId,
      datasetId: entry.view.datasetId,
      tableId: entry.view.tableId,
    };
  }

  if (entry.routine) {
    json.routine = {
      projectId: entry.routine.projectId,
      datasetId: entry.routine.datasetId,
      routineId: entry.routine.routineId,
    };
  }

  return json;
}

/**
 * Format a dataset reference as a string.
 */
export function formatDatasetReference(ref: DatasetReference): string {
  return `${ref.projectId}.${ref.datasetId}`;
}

/**
 * Parse a dataset reference from a string (project.dataset).
 */
export function parseDatasetReferenceString(str: string): DatasetReference | null {
  const parts = str.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return {
    projectId: parts[0],
    datasetId: parts[1],
  };
}

/**
 * Schema types for BigQuery tables.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

/**
 * BigQuery field type enumeration.
 *
 * Includes all standard SQL types and BigQuery-specific types.
 */
export enum FieldType {
  STRING = "STRING",
  BYTES = "BYTES",
  INTEGER = "INTEGER",
  INT64 = "INT64",
  FLOAT = "FLOAT",
  FLOAT64 = "FLOAT64",
  NUMERIC = "NUMERIC",
  BIGNUMERIC = "BIGNUMERIC",
  BOOLEAN = "BOOLEAN",
  BOOL = "BOOL",
  TIMESTAMP = "TIMESTAMP",
  DATE = "DATE",
  TIME = "TIME",
  DATETIME = "DATETIME",
  GEOGRAPHY = "GEOGRAPHY",
  JSON = "JSON",
  STRUCT = "RECORD",
  ARRAY = "REPEATED",
}

/**
 * Field mode enumeration.
 */
export enum FieldMode {
  NULLABLE = "NULLABLE",
  REQUIRED = "REQUIRED",
  REPEATED = "REPEATED",
}

/**
 * Table field schema with support for nested and repeated fields.
 */
export interface TableFieldSchema {
  /** Field name. */
  name: string;

  /** Field type. */
  type: FieldType;

  /** Field mode (nullable, required, repeated). */
  mode?: FieldMode;

  /** Field description. */
  description?: string;

  /** Nested fields (for STRUCT/RECORD types). */
  fields?: TableFieldSchema[];

  /** Policy tags for column-level security. */
  policyTags?: {
    names: string[];
  };

  /** Maximum length for STRING or BYTES fields. */
  maxLength?: number;

  /** Precision for NUMERIC or BIGNUMERIC fields. */
  precision?: number;

  /** Scale for NUMERIC or BIGNUMERIC fields. */
  scale?: number;
}

/**
 * Complete table schema definition.
 */
export interface TableSchema {
  /** Array of field definitions. */
  fields: TableFieldSchema[];
}

/**
 * Parse field type from string.
 */
export function parseFieldType(value: string): FieldType {
  const normalized = value.toUpperCase();
  return (FieldType as Record<string, FieldType>)[normalized] ?? FieldType.STRING;
}

/**
 * Parse field mode from string.
 */
export function parseFieldMode(value: string | undefined): FieldMode {
  if (!value) {
    return FieldMode.NULLABLE;
  }
  const normalized = value.toUpperCase();
  return (FieldMode as Record<string, FieldMode>)[normalized] ?? FieldMode.NULLABLE;
}

/**
 * Parse table field schema from BigQuery JSON response.
 */
export function parseTableFieldSchema(json: Record<string, unknown>): TableFieldSchema {
  const field: TableFieldSchema = {
    name: json.name as string,
    type: parseFieldType(json.type as string),
    mode: parseFieldMode(json.mode as string | undefined),
  };

  if (json.description) {
    field.description = json.description as string;
  }

  if (json.fields) {
    field.fields = (json.fields as Record<string, unknown>[]).map(parseTableFieldSchema);
  }

  if (json.policyTags) {
    const policyTags = json.policyTags as Record<string, unknown>;
    field.policyTags = {
      names: (policyTags.names as string[]) ?? [],
    };
  }

  if (json.maxLength) {
    field.maxLength = parseInt(json.maxLength as string, 10);
  }

  if (json.precision) {
    field.precision = parseInt(json.precision as string, 10);
  }

  if (json.scale) {
    field.scale = parseInt(json.scale as string, 10);
  }

  return field;
}

/**
 * Parse table schema from BigQuery JSON response.
 */
export function parseTableSchema(json: Record<string, unknown>): TableSchema {
  const fields = (json.fields as Record<string, unknown>[]) ?? [];
  return {
    fields: fields.map(parseTableFieldSchema),
  };
}

/**
 * Serialize table field schema to BigQuery JSON format.
 */
export function serializeTableFieldSchema(field: TableFieldSchema): Record<string, unknown> {
  const json: Record<string, unknown> = {
    name: field.name,
    type: field.type,
  };

  if (field.mode) {
    json.mode = field.mode;
  }

  if (field.description) {
    json.description = field.description;
  }

  if (field.fields) {
    json.fields = field.fields.map(serializeTableFieldSchema);
  }

  if (field.policyTags) {
    json.policyTags = {
      names: field.policyTags.names,
    };
  }

  if (field.maxLength !== undefined) {
    json.maxLength = field.maxLength.toString();
  }

  if (field.precision !== undefined) {
    json.precision = field.precision.toString();
  }

  if (field.scale !== undefined) {
    json.scale = field.scale.toString();
  }

  return json;
}

/**
 * Serialize table schema to BigQuery JSON format.
 */
export function serializeTableSchema(schema: TableSchema): Record<string, unknown> {
  return {
    fields: schema.fields.map(serializeTableFieldSchema),
  };
}

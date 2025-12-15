/**
 * Load Service Types
 *
 * Types specific to BigQuery batch data loading operations.
 * Following the SPARC specification for Google BigQuery integration.
 */

import { TableSchema } from "../../types/schema.js";
import { TableReference } from "../../types/table.js";

/**
 * Source format for load jobs.
 */
export type SourceFormat =
  | "CSV"
  | "NEWLINE_DELIMITED_JSON"
  | "AVRO"
  | "PARQUET"
  | "ORC"
  | "DATASTORE_BACKUP";

/**
 * Write disposition for load jobs.
 */
export type WriteDisposition = "WRITE_TRUNCATE" | "WRITE_APPEND" | "WRITE_EMPTY";

/**
 * Create disposition for load jobs.
 */
export type CreateDisposition = "CREATE_IF_NEEDED" | "CREATE_NEVER";

/**
 * Schema update options for load jobs.
 */
export type SchemaUpdateOption = "ALLOW_FIELD_ADDITION" | "ALLOW_FIELD_RELAXATION";

/**
 * Load job configuration.
 */
export interface LoadJobConfig {
  /**
   * URIs of source files in GCS (e.g., gs://bucket/path/file.csv).
   * Required for GCS loads, omitted for buffer loads.
   */
  sourceUris?: string[];

  /**
   * Source format (CSV, JSON, Avro, Parquet, ORC, or Datastore backup).
   * Default: CSV for files with .csv extension, NEWLINE_DELIMITED_JSON for .json.
   */
  sourceFormat?: SourceFormat;

  /**
   * Table schema for the destination table.
   * Required if autodetect is false and table doesn't exist.
   */
  schema?: TableSchema;

  /**
   * Destination table reference.
   */
  destinationTable: TableReference;

  /**
   * Write disposition (WRITE_TRUNCATE, WRITE_APPEND, or WRITE_EMPTY).
   * Default: WRITE_APPEND.
   */
  writeDisposition?: WriteDisposition;

  /**
   * Create disposition (CREATE_IF_NEEDED or CREATE_NEVER).
   * Default: CREATE_IF_NEEDED.
   */
  createDisposition?: CreateDisposition;

  /**
   * Number of rows at the top of a CSV file to skip.
   * Default: 0.
   */
  skipLeadingRows?: number;

  /**
   * Field delimiter for CSV files.
   * Default: comma (,).
   */
  fieldDelimiter?: string;

  /**
   * Quote character for CSV files.
   * Default: double quote (").
   */
  quote?: string;

  /**
   * Allow quoted newlines in CSV data.
   * Default: false.
   */
  allowQuotedNewlines?: boolean;

  /**
   * Allow jagged rows (rows with missing trailing optional columns) in CSV.
   * Default: false.
   */
  allowJaggedRows?: boolean;

  /**
   * Character encoding of the data.
   * Default: UTF-8.
   */
  encoding?: string;

  /**
   * Maximum number of bad records to tolerate before the entire job fails.
   * Default: 0.
   */
  maxBadRecords?: number;

  /**
   * Automatically infer schema from source data.
   * Default: false.
   */
  autodetect?: boolean;

  /**
   * String that represents a null value in CSV files.
   * Default: empty string.
   */
  nullMarker?: string;

  /**
   * Schema update options (e.g., ALLOW_FIELD_ADDITION).
   * Allows schema evolution during load.
   */
  schemaUpdateOptions?: SchemaUpdateOption[];
}

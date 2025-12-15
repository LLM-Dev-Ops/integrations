/**
 * Export Service Types
 *
 * Types specific to BigQuery data export operations.
 * Following the SPARC specification for Google BigQuery integration.
 */

import { TableReference } from "../../types/table.js";

/**
 * Destination format for export.
 */
export type DestinationFormat =
  | "CSV"
  | "NEWLINE_DELIMITED_JSON"
  | "AVRO"
  | "PARQUET";

/**
 * Compression type for export.
 */
export type Compression = "NONE" | "GZIP" | "DEFLATE" | "SNAPPY" | "ZSTD";

/**
 * Export job configuration.
 */
export interface ExportJobConfig {
  /** Source table to export from. */
  sourceTable: TableReference;

  /** Destination URIs in GCS (gs://bucket/path). */
  destinationUris: string[];

  /** Destination format (default: NEWLINE_DELIMITED_JSON). */
  destinationFormat?: DestinationFormat;

  /** Compression type (default: NONE). */
  compression?: Compression;

  /** Field delimiter for CSV format (default: ','). */
  fieldDelimiter?: string;

  /** Print header row for CSV format (default: true). */
  printHeader?: boolean;

  /** Use Avro logical types (default: false). */
  useAvroLogicalTypes?: boolean;
}

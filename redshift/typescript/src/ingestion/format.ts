/**
 * Redshift File Format Specifications
 *
 * Helper functions for building file format specifications for COPY operations.
 * @module @llmdevops/redshift-integration/ingestion/format
 */

// ============================================================================
// Format Types
// ============================================================================

/**
 * Supported data formats for COPY operations.
 */
export type DataFormat = 'CSV' | 'JSON' | 'AVRO' | 'PARQUET' | 'ORC';

// ============================================================================
// CSV Format Options
// ============================================================================

/**
 * CSV format options for COPY operations.
 */
export interface CsvFormatOptions {
  /** Field delimiter character (default: ',') */
  delimiter?: string;
  /** Quote character (default: '"') */
  quoteChar?: string;
  /** Escape character (default: '\') */
  escapeChar?: string;
  /** String to interpret as NULL */
  nullAs?: string;
  /** Treat empty fields as NULL (default: false) */
  emptyAsNull?: boolean;
  /** Date format string */
  dateFormat?: string;
  /** Time format string */
  timeFormat?: string;
  /** Timestamp format string */
  timestampFormat?: string;
  /** Character encoding (default: 'UTF8') */
  encoding?: 'UTF8' | 'UTF16' | 'UTF16LE' | 'UTF16BE';
  /** Accept invalid UTF-8 characters (default: false) */
  acceptInvChars?: boolean;
  /** Number of header rows to skip */
  ignoreHeader?: number;
  /** Compression type */
  compression?: 'GZIP' | 'BZIP2' | 'LZOP' | 'ZSTD' | 'AUTO' | 'NONE';
  /** Remove trailing spaces from VARCHAR columns */
  trimBlanks?: boolean;
  /** Remove trailing whitespace from character fields */
  blankAsNull?: boolean;
}

// ============================================================================
// JSON Format Options
// ============================================================================

/**
 * JSON format options for COPY operations.
 */
export interface JsonFormatOptions {
  /** JSONPaths file for column mapping (S3 path) */
  jsonpaths?: string;
  /** Auto-detect JSON format (default: false) */
  autoDetect?: boolean;
  /** Maximum JSON object length in bytes */
  maxJsonLength?: number;
  /** Compression type */
  compression?: 'GZIP' | 'BZIP2' | 'LZOP' | 'ZSTD' | 'AUTO' | 'NONE';
  /** Character encoding (default: 'UTF8') */
  encoding?: 'UTF8' | 'UTF16' | 'UTF16LE' | 'UTF16BE';
  /** Accept invalid UTF-8 characters (default: false) */
  acceptInvChars?: boolean;
}

// ============================================================================
// Parquet Format Options
// ============================================================================

/**
 * Parquet format options for COPY operations.
 * Parquet uses column mapping from the file schema.
 */
export interface ParquetFormatOptions {
  /** Compression type (typically handled by Parquet internally) */
  compression?: 'AUTO' | 'NONE';
  /** Character encoding for string columns */
  encoding?: 'UTF8' | 'UTF16' | 'UTF16LE' | 'UTF16BE';
}

// ============================================================================
// AVRO Format Options
// ============================================================================

/**
 * AVRO format options for COPY operations.
 */
export interface AvroFormatOptions {
  /** Compression type */
  compression?: 'AUTO' | 'NONE';
  /** Character encoding */
  encoding?: 'UTF8' | 'UTF16' | 'UTF16LE' | 'UTF16BE';
}

// ============================================================================
// ORC Format Options
// ============================================================================

/**
 * ORC format options for COPY operations.
 */
export interface OrcFormatOptions {
  /** Compression type */
  compression?: 'AUTO' | 'NONE';
  /** Character encoding */
  encoding?: 'UTF8' | 'UTF16' | 'UTF16LE' | 'UTF16BE';
}

// ============================================================================
// Format Utilities
// ============================================================================

/**
 * Converts format and options to SQL COPY clause.
 *
 * @param format - Data format type
 * @param options - Format-specific options
 * @returns SQL clause string for COPY command
 *
 * @example
 * ```typescript
 * const clause = formatToSqlClause('CSV', {
 *   delimiter: '|',
 *   ignoreHeader: 1,
 *   nullAs: 'NULL'
 * });
 * // Returns: "FORMAT AS CSV DELIMITER '|' IGNOREHEADER 1 NULL AS 'NULL'"
 * ```
 */
export function formatToSqlClause(
  format: DataFormat,
  options?: CsvFormatOptions | JsonFormatOptions | ParquetFormatOptions | AvroFormatOptions | OrcFormatOptions
): string {
  const parts: string[] = [];

  // Add format type
  parts.push(`FORMAT AS ${format}`);

  if (!options) {
    return parts.join(' ');
  }

  // CSV-specific options
  if (format === 'CSV' && isCsvOptions(options)) {
    if (options.delimiter !== undefined) {
      parts.push(`DELIMITER '${escapeSqlString(options.delimiter)}'`);
    }
    if (options.quoteChar !== undefined) {
      parts.push(`QUOTE '${escapeSqlString(options.quoteChar)}'`);
    }
    if (options.escapeChar !== undefined) {
      parts.push(`ESCAPE`);
    }
    if (options.nullAs !== undefined) {
      parts.push(`NULL AS '${escapeSqlString(options.nullAs)}'`);
    }
    if (options.emptyAsNull !== undefined && options.emptyAsNull) {
      parts.push(`EMPTYASNULL`);
    }
    if (options.blankAsNull !== undefined && options.blankAsNull) {
      parts.push(`BLANKSASNULL`);
    }
    if (options.dateFormat !== undefined) {
      parts.push(`DATEFORMAT '${escapeSqlString(options.dateFormat)}'`);
    }
    if (options.timeFormat !== undefined) {
      parts.push(`TIMEFORMAT '${escapeSqlString(options.timeFormat)}'`);
    }
    if (options.timestampFormat !== undefined) {
      parts.push(`TIMEFORMAT '${escapeSqlString(options.timestampFormat)}'`);
    }
    if (options.encoding !== undefined && options.encoding !== 'UTF8') {
      parts.push(`ENCODING ${options.encoding}`);
    }
    if (options.acceptInvChars !== undefined && options.acceptInvChars) {
      parts.push(`ACCEPTINVCHARS`);
    }
    if (options.ignoreHeader !== undefined && options.ignoreHeader > 0) {
      parts.push(`IGNOREHEADER ${options.ignoreHeader}`);
    }
    if (options.trimBlanks !== undefined && options.trimBlanks) {
      parts.push(`TRIMBLANKS`);
    }
    if (options.compression !== undefined && options.compression !== 'AUTO') {
      parts.push(`GZIP`); // Redshift uses specific compression flags
    }
  }

  // JSON-specific options
  if (format === 'JSON' && isJsonOptions(options)) {
    if (options.jsonpaths !== undefined) {
      parts.push(`JSON '${escapeSqlString(options.jsonpaths)}'`);
    } else if (options.autoDetect !== undefined && options.autoDetect) {
      parts.push(`JSON 'auto'`);
    }
    if (options.maxJsonLength !== undefined) {
      parts.push(`MAXJSONSIZE ${options.maxJsonLength}`);
    }
    if (options.encoding !== undefined && options.encoding !== 'UTF8') {
      parts.push(`ENCODING ${options.encoding}`);
    }
    if (options.acceptInvChars !== undefined && options.acceptInvChars) {
      parts.push(`ACCEPTINVCHARS`);
    }
    if (options.compression === 'GZIP') {
      parts.push(`GZIP`);
    } else if (options.compression === 'BZIP2') {
      parts.push(`BZIP2`);
    } else if (options.compression === 'LZOP') {
      parts.push(`LZOP`);
    } else if (options.compression === 'ZSTD') {
      parts.push(`ZSTD`);
    }
  }

  // AVRO format (minimal options)
  if (format === 'AVRO') {
    if (isAvroOptions(options) && options.encoding !== undefined && options.encoding !== 'UTF8') {
      parts.push(`ENCODING ${options.encoding}`);
    }
  }

  // PARQUET format (minimal options)
  if (format === 'PARQUET') {
    if (isParquetOptions(options) && options.encoding !== undefined && options.encoding !== 'UTF8') {
      parts.push(`ENCODING ${options.encoding}`);
    }
  }

  // ORC format (minimal options)
  if (format === 'ORC') {
    if (isOrcOptions(options) && options.encoding !== undefined && options.encoding !== 'UTF8') {
      parts.push(`ENCODING ${options.encoding}`);
    }
  }

  return parts.join(' ');
}

/**
 * Escapes single quotes in SQL strings.
 *
 * @param str - String to escape
 * @returns Escaped string
 */
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Type guard for CSV format options.
 */
function isCsvOptions(options: unknown): options is CsvFormatOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('delimiter' in options ||
      'quoteChar' in options ||
      'nullAs' in options ||
      'emptyAsNull' in options ||
      'ignoreHeader' in options)
  );
}

/**
 * Type guard for JSON format options.
 */
function isJsonOptions(options: unknown): options is JsonFormatOptions {
  return (
    typeof options === 'object' &&
    options !== null &&
    ('jsonpaths' in options || 'autoDetect' in options || 'maxJsonLength' in options)
  );
}

/**
 * Type guard for Parquet format options.
 */
function isParquetOptions(options: unknown): options is ParquetFormatOptions {
  return typeof options === 'object' && options !== null && 'compression' in options;
}

/**
 * Type guard for AVRO format options.
 */
function isAvroOptions(options: unknown): options is AvroFormatOptions {
  return typeof options === 'object' && options !== null;
}

/**
 * Type guard for ORC format options.
 */
function isOrcOptions(options: unknown): options is OrcFormatOptions {
  return typeof options === 'object' && options !== null;
}

// ============================================================================
// Predefined Formats
// ============================================================================

/**
 * Predefined CSV format with comma delimiter.
 */
export const CSV_COMMA: CsvFormatOptions = {
  delimiter: ',',
  ignoreHeader: 1,
  emptyAsNull: true,
};

/**
 * Predefined CSV format with pipe delimiter.
 */
export const CSV_PIPE: CsvFormatOptions = {
  delimiter: '|',
  ignoreHeader: 1,
  emptyAsNull: true,
};

/**
 * Predefined CSV format with tab delimiter.
 */
export const CSV_TAB: CsvFormatOptions = {
  delimiter: '\t',
  ignoreHeader: 1,
  emptyAsNull: true,
};

/**
 * Predefined JSON format with auto-detection.
 */
export const JSON_AUTO: JsonFormatOptions = {
  autoDetect: true,
  compression: 'AUTO',
};

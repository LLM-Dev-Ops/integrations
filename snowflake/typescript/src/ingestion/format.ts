/**
 * Snowflake File Format Specifications
 *
 * Helper functions for building file format specifications.
 * @module @llmdevops/snowflake-integration/ingestion/format
 */

import type { FileFormat, FormatType } from '../types/index.js';

/**
 * Builder for file format specifications.
 */
export class FileFormatBuilder {
  private format: Partial<FileFormat> = {};

  /**
   * Creates a new file format builder.
   */
  constructor(formatType: FormatType) {
    this.format.formatType = formatType;
  }

  /**
   * Sets compression type.
   */
  compression(
    compression: 'AUTO' | 'GZIP' | 'BZ2' | 'BROTLI' | 'ZSTD' | 'DEFLATE' | 'RAW_DEFLATE' | 'NONE'
  ): this {
    this.format.compression = compression;
    return this;
  }

  /**
   * Sets skip header rows (CSV).
   */
  skipHeader(rows: number): this {
    this.format.skipHeader = rows;
    return this;
  }

  /**
   * Sets field delimiter (CSV).
   */
  fieldDelimiter(delimiter: string): this {
    this.format.fieldDelimiter = delimiter;
    return this;
  }

  /**
   * Sets record delimiter.
   */
  recordDelimiter(delimiter: string): this {
    this.format.recordDelimiter = delimiter;
    return this;
  }

  /**
   * Sets field optionally enclosed by (CSV).
   */
  fieldOptionallyEnclosedBy(char: string): this {
    this.format.fieldOptionallyEnclosedBy = char;
    return this;
  }

  /**
   * Sets NULL if values.
   */
  nullIf(values: string[]): this {
    this.format.nullIf = values;
    return this;
  }

  /**
   * Sets empty field as null.
   */
  emptyFieldAsNull(enabled: boolean): this {
    this.format.emptyFieldAsNull = enabled;
    return this;
  }

  /**
   * Sets skip blank lines.
   */
  skipBlankLines(enabled: boolean): this {
    this.format.skipBlankLines = enabled;
    return this;
  }

  /**
   * Sets date format.
   */
  dateFormat(format: string): this {
    this.format.dateFormat = format;
    return this;
  }

  /**
   * Sets time format.
   */
  timeFormat(format: string): this {
    this.format.timeFormat = format;
    return this;
  }

  /**
   * Sets timestamp format.
   */
  timestampFormat(format: string): this {
    this.format.timestampFormat = format;
    return this;
  }

  /**
   * Sets binary format.
   */
  binaryFormat(format: 'HEX' | 'BASE64' | 'UTF8'): this {
    this.format.binaryFormat = format;
    return this;
  }

  /**
   * Sets escape character.
   */
  escape(char: string): this {
    this.format.escape = char;
    return this;
  }

  /**
   * Sets escape unenclosed field.
   */
  escapeUnenclosedField(char: string): this {
    this.format.escapeUnenclosedField = char;
    return this;
  }

  /**
   * Sets trim space.
   */
  trimSpace(enabled: boolean): this {
    this.format.trimSpace = enabled;
    return this;
  }

  /**
   * Sets error on column count mismatch (CSV).
   */
  errorOnColumnCountMismatch(enabled: boolean): this {
    this.format.errorOnColumnCountMismatch = enabled;
    return this;
  }

  /**
   * Sets strip outer array (JSON).
   */
  stripOuterArray(enabled: boolean): this {
    this.format.stripOuterArray = enabled;
    return this;
  }

  /**
   * Sets strip null values (JSON).
   */
  stripNullValues(enabled: boolean): this {
    this.format.stripNullValues = enabled;
    return this;
  }

  /**
   * Sets enable octal (JSON).
   */
  enableOctal(enabled: boolean): this {
    this.format.enableOctal = enabled;
    return this;
  }

  /**
   * Sets allow duplicate (JSON).
   */
  allowDuplicate(enabled: boolean): this {
    this.format.allowDuplicate = enabled;
    return this;
  }

  /**
   * Builds the file format specification.
   */
  build(): FileFormat {
    return this.format as FileFormat;
  }
}

/**
 * Creates a CSV file format builder.
 */
export function csv(): FileFormatBuilder {
  return new FileFormatBuilder('CSV');
}

/**
 * Creates a JSON file format builder.
 */
export function json(): FileFormatBuilder {
  return new FileFormatBuilder('JSON');
}

/**
 * Creates an AVRO file format builder.
 */
export function avro(): FileFormatBuilder {
  return new FileFormatBuilder('AVRO');
}

/**
 * Creates an ORC file format builder.
 */
export function orc(): FileFormatBuilder {
  return new FileFormatBuilder('ORC');
}

/**
 * Creates a PARQUET file format builder.
 */
export function parquet(): FileFormatBuilder {
  return new FileFormatBuilder('PARQUET');
}

/**
 * Creates an XML file format builder.
 */
export function xml(): FileFormatBuilder {
  return new FileFormatBuilder('XML');
}

/**
 * Serializes a file format to SQL clause.
 */
export function formatToSql(format: FileFormat): string {
  const parts: string[] = [`TYPE = ${format.formatType}`];

  if (format.compression !== undefined) {
    parts.push(`COMPRESSION = ${format.compression}`);
  }

  // CSV-specific options
  if (format.formatType === 'CSV') {
    if (format.skipHeader !== undefined) {
      parts.push(`SKIP_HEADER = ${format.skipHeader}`);
    }
    if (format.fieldDelimiter !== undefined) {
      parts.push(`FIELD_DELIMITER = '${format.fieldDelimiter}'`);
    }
    if (format.fieldOptionallyEnclosedBy !== undefined) {
      parts.push(`FIELD_OPTIONALLY_ENCLOSED_BY = '${format.fieldOptionallyEnclosedBy}'`);
    }
    if (format.errorOnColumnCountMismatch !== undefined) {
      parts.push(`ERROR_ON_COLUMN_COUNT_MISMATCH = ${format.errorOnColumnCountMismatch}`);
    }
  }

  // JSON-specific options
  if (format.formatType === 'JSON') {
    if (format.stripOuterArray !== undefined) {
      parts.push(`STRIP_OUTER_ARRAY = ${format.stripOuterArray}`);
    }
    if (format.stripNullValues !== undefined) {
      parts.push(`STRIP_NULL_VALUES = ${format.stripNullValues}`);
    }
    if (format.enableOctal !== undefined) {
      parts.push(`ENABLE_OCTAL = ${format.enableOctal}`);
    }
    if (format.allowDuplicate !== undefined) {
      parts.push(`ALLOW_DUPLICATE = ${format.allowDuplicate}`);
    }
  }

  // Common options
  if (format.recordDelimiter !== undefined) {
    parts.push(`RECORD_DELIMITER = '${format.recordDelimiter}'`);
  }
  if (format.nullIf !== undefined && format.nullIf.length > 0) {
    const nullIfValues = format.nullIf.map((v) => `'${v}'`).join(', ');
    parts.push(`NULL_IF = (${nullIfValues})`);
  }
  if (format.emptyFieldAsNull !== undefined) {
    parts.push(`EMPTY_FIELD_AS_NULL = ${format.emptyFieldAsNull}`);
  }
  if (format.skipBlankLines !== undefined) {
    parts.push(`SKIP_BLANK_LINES = ${format.skipBlankLines}`);
  }
  if (format.dateFormat !== undefined) {
    parts.push(`DATE_FORMAT = '${format.dateFormat}'`);
  }
  if (format.timeFormat !== undefined) {
    parts.push(`TIME_FORMAT = '${format.timeFormat}'`);
  }
  if (format.timestampFormat !== undefined) {
    parts.push(`TIMESTAMP_FORMAT = '${format.timestampFormat}'`);
  }
  if (format.binaryFormat !== undefined) {
    parts.push(`BINARY_FORMAT = ${format.binaryFormat}`);
  }
  if (format.escape !== undefined) {
    parts.push(`ESCAPE = '${format.escape}'`);
  }
  if (format.escapeUnenclosedField !== undefined) {
    parts.push(`ESCAPE_UNENCLOSED_FIELD = '${format.escapeUnenclosedField}'`);
  }
  if (format.trimSpace !== undefined) {
    parts.push(`TRIM_SPACE = ${format.trimSpace}`);
  }

  return parts.join(' ');
}

/**
 * Predefined CSV format with comma delimiter.
 */
export const CSV_COMMA: FileFormat = {
  formatType: 'CSV',
  fieldDelimiter: ',',
  skipHeader: 1,
  compression: 'AUTO',
};

/**
 * Predefined CSV format with pipe delimiter.
 */
export const CSV_PIPE: FileFormat = {
  formatType: 'CSV',
  fieldDelimiter: '|',
  skipHeader: 1,
  compression: 'AUTO',
};

/**
 * Predefined CSV format with tab delimiter.
 */
export const CSV_TAB: FileFormat = {
  formatType: 'CSV',
  fieldDelimiter: '\\t',
  skipHeader: 1,
  compression: 'AUTO',
};

/**
 * Predefined JSON format with auto compression.
 */
export const JSON_AUTO: FileFormat = {
  formatType: 'JSON',
  compression: 'AUTO',
  stripOuterArray: false,
};

/**
 * Predefined JSON array format.
 */
export const JSON_ARRAY: FileFormat = {
  formatType: 'JSON',
  compression: 'AUTO',
  stripOuterArray: true,
};

/**
 * Predefined Parquet format.
 */
export const PARQUET_AUTO: FileFormat = {
  formatType: 'PARQUET',
  compression: 'AUTO',
};

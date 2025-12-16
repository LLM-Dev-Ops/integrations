/**
 * Field path validation for Google Cloud Firestore.
 *
 * Following the SPARC specification and Firestore requirements:
 * - Must be non-empty
 * - Cannot start with "__" (reserved prefix)
 * - Cannot contain forbidden characters: '/', '\0', '\n', '\r'
 * - Maximum depth: 20 levels
 * - Each segment maximum length: 1500 characters
 *
 * Field paths can be simple (e.g., "name") or nested (e.g., "address.city").
 */

import { InvalidArgumentError, FieldPathTooDeepError } from "../error/index.js";
import type { FieldValue } from "../types/field-value.js";

/**
 * Maximum nesting depth for field paths.
 * Firestore limits nested fields to 20 levels.
 */
export const MAX_FIELD_DEPTH = 20;

/**
 * Maximum length for a single field path segment.
 */
export const MAX_FIELD_SEGMENT_LENGTH = 1500;

/**
 * Reserved field name prefix.
 * Field names starting with "__" are reserved for system use.
 */
const RESERVED_PREFIX = "__";

/**
 * Forbidden characters in field paths.
 */
const FORBIDDEN_CHARS = ["/", "\0", "\n", "\r"];

/**
 * Validated field path result.
 */
export interface ValidatedFieldPath {
  /** Original field path */
  path: string;
  /** Path segments (split by dots) */
  segments: string[];
  /** Depth of the field path */
  depth: number;
  /** Whether this is a top-level field */
  isTopLevel: boolean;
}

/**
 * Validate a field path according to Firestore rules.
 *
 * A valid field path must:
 * - Be non-empty
 * - Not start with "__" (reserved for system)
 * - Not contain forbidden characters: '/', '\0', '\n', '\r'
 * - Not exceed maximum depth (20 levels)
 * - Each segment must not exceed 1500 characters
 *
 * @param path - Field path to validate
 * @throws {InvalidArgumentError} If the field path is invalid
 * @throws {FieldPathTooDeepError} If the field path exceeds maximum depth
 *
 * @example
 * ```typescript
 * validateFieldPath("name"); // Valid
 * validateFieldPath("address.city"); // Valid
 * validateFieldPath("user.profile.settings.theme"); // Valid
 * validateFieldPath(""); // Throws: Cannot be empty
 * validateFieldPath("__internal"); // Throws: Reserved prefix
 * validateFieldPath("path/with/slash"); // Throws: Forbidden character
 * ```
 */
export function validateFieldPath(path: string): void {
  // Check for empty or whitespace-only paths
  if (!path || path.trim().length === 0) {
    throw new InvalidArgumentError("Field path cannot be empty", {
      argumentName: "fieldPath",
    });
  }

  // Check for reserved prefix
  if (path.startsWith(RESERVED_PREFIX)) {
    throw new InvalidArgumentError(
      `Field path "${path}" cannot start with "${RESERVED_PREFIX}" (reserved for system use)`,
      { argumentName: "fieldPath" }
    );
  }

  // Check for forbidden characters
  for (const char of FORBIDDEN_CHARS) {
    if (path.includes(char)) {
      const charName = char === "\0" ? "\\0" : char === "\n" ? "\\n" : char === "\r" ? "\\r" : char;
      throw new InvalidArgumentError(
        `Field path "${path}" cannot contain forbidden character "${charName}"`,
        { argumentName: "fieldPath" }
      );
    }
  }

  // Check for consecutive dots
  if (path.includes("..")) {
    throw new InvalidArgumentError(
      `Field path "${path}" cannot contain consecutive dots (..)`,
      { argumentName: "fieldPath" }
    );
  }

  // Check for leading or trailing dots
  if (path.startsWith(".") || path.endsWith(".")) {
    throw new InvalidArgumentError(
      `Field path "${path}" cannot start or end with a dot (.)`,
      { argumentName: "fieldPath" }
    );
  }

  // Split into segments and validate each
  const segments = path.split(".");

  // Check depth
  if (segments.length > MAX_FIELD_DEPTH) {
    throw new FieldPathTooDeepError(
      `Field path "${path}" exceeds maximum depth of ${MAX_FIELD_DEPTH} levels (got ${segments.length})`,
      segments.length
    );
  }

  // Validate each segment
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;

    // Check for empty segments
    if (segment.length === 0) {
      throw new InvalidArgumentError(
        `Field path "${path}" has empty segment at position ${i}`,
        { argumentName: "fieldPath" }
      );
    }

    // Check segment length
    if (segment.length > MAX_FIELD_SEGMENT_LENGTH) {
      throw new InvalidArgumentError(
        `Field path segment "${segment}" at position ${i} exceeds maximum length of ${MAX_FIELD_SEGMENT_LENGTH} characters (got ${segment.length})`,
        { argumentName: "fieldPath" }
      );
    }

    // Nested segments should also not start with "__"
    if (i > 0 && segment.startsWith(RESERVED_PREFIX)) {
      throw new InvalidArgumentError(
        `Field path segment "${segment}" at position ${i} cannot start with "${RESERVED_PREFIX}" (reserved for system use)`,
        { argumentName: "fieldPath" }
      );
    }
  }
}

/**
 * Check if a field path is valid without throwing.
 *
 * @param path - Field path to check
 * @returns True if the field path is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidFieldPath("name"); // true
 * isValidFieldPath("address.city"); // true
 * isValidFieldPath(""); // false
 * isValidFieldPath("__internal"); // false
 * ```
 */
export function isValidFieldPath(path: string): boolean {
  try {
    validateFieldPath(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize a field path by removing or replacing invalid characters.
 *
 * This function attempts to make an invalid path valid by:
 * - Replacing "/" with "_"
 * - Removing forbidden characters (\0, \n, \r)
 * - Removing consecutive dots
 * - Trimming leading/trailing dots
 * - Adding prefix if starts with "__"
 * - Truncating segments that are too long
 *
 * @param path - Field path to sanitize
 * @returns Sanitized field path
 *
 * @example
 * ```typescript
 * sanitizeFieldPath("path/with/slash"); // "path_with_slash"
 * sanitizeFieldPath("__internal"); // "x__internal"
 * sanitizeFieldPath("..double"); // "double"
 * ```
 */
export function sanitizeFieldPath(path: string): ValidatedFieldPath {
  if (!path || path.trim().length === 0) {
    throw new InvalidArgumentError("Cannot sanitize empty field path", {
      argumentName: "fieldPath",
    });
  }

  let sanitized = path;

  // Replace forbidden characters
  sanitized = sanitized.replace(/\//g, "_");
  sanitized = sanitized.replace(/\0/g, "");
  sanitized = sanitized.replace(/\n/g, "");
  sanitized = sanitized.replace(/\r/g, "");

  // Remove consecutive dots
  sanitized = sanitized.replace(/\.{2,}/g, ".");

  // Remove leading/trailing dots
  sanitized = sanitized.replace(/^\.|\.$/g, "");

  // Handle reserved prefix at the start
  if (sanitized.startsWith(RESERVED_PREFIX)) {
    sanitized = "x" + sanitized;
  }

  // Split into segments and process
  let segments = sanitized.split(".");

  // Truncate segments that are too long
  segments = segments.map((segment, index) => {
    if (segment.length > MAX_FIELD_SEGMENT_LENGTH) {
      return segment.substring(0, MAX_FIELD_SEGMENT_LENGTH);
    }

    // Handle reserved prefix in nested segments
    if (index > 0 && segment.startsWith(RESERVED_PREFIX)) {
      return "x" + segment;
    }

    return segment;
  });

  // Limit depth
  if (segments.length > MAX_FIELD_DEPTH) {
    segments = segments.slice(0, MAX_FIELD_DEPTH);
  }

  const finalPath = segments.join(".");

  return {
    path: finalPath,
    segments,
    depth: segments.length,
    isTopLevel: segments.length === 1,
  };
}

/**
 * Expand a field path into an array of segments.
 *
 * @param path - Field path to expand
 * @returns Array of field path segments
 * @throws {InvalidArgumentError} If the field path is invalid
 *
 * @example
 * ```typescript
 * expandFieldPath("name"); // ["name"]
 * expandFieldPath("address.city"); // ["address", "city"]
 * expandFieldPath("user.profile.settings.theme");
 * // Returns: ["user", "profile", "settings", "theme"]
 * ```
 */
export function expandFieldPath(path: string): string[] {
  validateFieldPath(path);
  return path.split(".");
}

/**
 * Join field path segments into a single path.
 *
 * @param segments - Field path segments
 * @returns Joined field path
 * @throws {InvalidArgumentError} If the resulting path is invalid
 *
 * @example
 * ```typescript
 * joinFieldPath(["address", "city"]); // "address.city"
 * joinFieldPath(["user", "profile", "settings"]);
 * // Returns: "user.profile.settings"
 * ```
 */
export function joinFieldPath(segments: string[]): string {
  if (segments.length === 0) {
    throw new InvalidArgumentError("Cannot join empty segments array", {
      argumentName: "segments",
    });
  }

  const path = segments.join(".");
  validateFieldPath(path);
  return path;
}

/**
 * Get the parent field path for a nested field.
 * Returns null if this is a top-level field.
 *
 * @param path - Field path
 * @returns Parent field path or null
 * @throws {InvalidArgumentError} If the field path is invalid
 *
 * @example
 * ```typescript
 * getParentFieldPath("name"); // null
 * getParentFieldPath("address.city"); // "address"
 * getParentFieldPath("user.profile.settings");
 * // Returns: "user.profile"
 * ```
 */
export function getParentFieldPath(path: string): string | null {
  const segments = expandFieldPath(path);

  if (segments.length === 1) {
    return null;
  }

  return segments.slice(0, -1).join(".");
}

/**
 * Get the field name (last segment) from a field path.
 *
 * @param path - Field path
 * @returns Field name
 * @throws {InvalidArgumentError} If the field path is invalid
 *
 * @example
 * ```typescript
 * getFieldName("name"); // "name"
 * getFieldName("address.city"); // "city"
 * getFieldName("user.profile.settings.theme"); // "theme"
 * ```
 */
export function getFieldName(path: string): string {
  const segments = expandFieldPath(path);
  return segments[segments.length - 1]!;
}

/**
 * Check if a field path is a top-level field.
 *
 * @param path - Field path
 * @returns True if this is a top-level field
 * @throws {InvalidArgumentError} If the field path is invalid
 *
 * @example
 * ```typescript
 * isTopLevelField("name"); // true
 * isTopLevelField("address.city"); // false
 * ```
 */
export function isTopLevelField(path: string): boolean {
  const segments = expandFieldPath(path);
  return segments.length === 1;
}

/**
 * Validate nested map depth to ensure it doesn't exceed Firestore limits.
 *
 * Firestore limits nested field depth to 20 levels. This function validates
 * that a FieldValue (especially MapValue) doesn't exceed this limit.
 *
 * @param value - Field value to validate
 * @param currentDepth - Current depth (used for recursion)
 * @throws {FieldPathTooDeepError} If the value exceeds maximum depth
 *
 * @example
 * ```typescript
 * const shallowMap = {
 *   mapValue: {
 *     fields: {
 *       name: { stringValue: "John" },
 *       age: { integerValue: 30 }
 *     }
 *   }
 * };
 * validateNestedMapDepth(shallowMap); // OK
 *
 * // A deeply nested structure would throw if depth > 20
 * ```
 */
export function validateNestedMapDepth(
  value: FieldValue,
  currentDepth: number = 0
): void {
  if (currentDepth > MAX_FIELD_DEPTH) {
    throw new FieldPathTooDeepError(
      `Nested map exceeds maximum depth of ${MAX_FIELD_DEPTH} levels`,
      currentDepth
    );
  }

  // Check if this is a map value
  if ("mapValue" in value && value.mapValue.fields) {
    const fields = value.mapValue.fields;

    // Recursively validate each nested field
    for (const fieldValue of Object.values(fields)) {
      validateNestedMapDepth(fieldValue, currentDepth + 1);
    }
  }

  // Check if this is an array value
  if ("arrayValue" in value && value.arrayValue.values) {
    const values = value.arrayValue.values;

    // Recursively validate each array element
    for (const arrayValue of values) {
      validateNestedMapDepth(arrayValue, currentDepth + 1);
    }
  }
}

/**
 * Get the depth of a field value structure.
 *
 * @param value - Field value to measure
 * @returns Depth of the field value
 *
 * @example
 * ```typescript
 * const simpleValue = { stringValue: "hello" };
 * getFieldValueDepth(simpleValue); // 0
 *
 * const nestedValue = {
 *   mapValue: {
 *     fields: {
 *       nested: {
 *         mapValue: {
 *           fields: {
 *             deep: { stringValue: "value" }
 *           }
 *         }
 *       }
 *     }
 *   }
 * };
 * getFieldValueDepth(nestedValue); // 2
 * ```
 */
export function getFieldValueDepth(value: FieldValue): number {
  if ("mapValue" in value && value.mapValue.fields) {
    const fields = value.mapValue.fields;
    let maxDepth = 0;

    for (const fieldValue of Object.values(fields)) {
      const depth = getFieldValueDepth(fieldValue);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth + 1;
  }

  if ("arrayValue" in value && value.arrayValue.values) {
    const values = value.arrayValue.values;
    let maxDepth = 0;

    for (const arrayValue of values) {
      const depth = getFieldValueDepth(arrayValue);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth + 1;
  }

  return 0;
}

/**
 * Check if a field path represents a nested field.
 *
 * @param path - Field path to check
 * @returns True if the field path is nested
 * @throws {InvalidArgumentError} If the field path is invalid
 *
 * @example
 * ```typescript
 * isNestedField("name"); // false
 * isNestedField("address.city"); // true
 * ```
 */
export function isNestedField(path: string): boolean {
  return !isTopLevelField(path);
}

/**
 * Create a field path from segments with validation.
 *
 * @param segments - Field path segments
 * @returns Validated field path
 * @throws {InvalidArgumentError} If the segments produce an invalid path
 *
 * @example
 * ```typescript
 * createFieldPath("address", "city"); // "address.city"
 * createFieldPath("user", "profile", "name"); // "user.profile.name"
 * ```
 */
export function createFieldPath(...segments: string[]): string {
  return joinFieldPath(segments);
}

/**
 * Escape a field name that contains special characters.
 * In Firestore, field names with dots need to be accessed using bracket notation
 * in queries, but this function returns the properly formatted path.
 *
 * @param fieldName - Field name to escape
 * @returns Escaped field name
 *
 * @example
 * ```typescript
 * escapeFieldName("normal"); // "normal"
 * escapeFieldName("field.with.dots"); // "`field.with.dots`"
 * ```
 */
export function escapeFieldName(fieldName: string): string {
  // If the field name contains a dot, it needs to be quoted
  if (fieldName.includes(".")) {
    return `\`${fieldName}\``;
  }
  return fieldName;
}

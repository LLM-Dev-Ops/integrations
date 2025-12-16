/**
 * Document ID validation for Google Cloud Firestore.
 *
 * Following the SPARC specification and Firestore requirements:
 * - Must be 1-1500 characters
 * - Cannot be "." or ".." (reserved)
 * - Cannot start with "__" (reserved prefix)
 * - Cannot contain "/" (would create subcollection)
 * - Should warn about special characters
 */

import { InvalidArgumentError } from "../error/index.js";

/**
 * Reserved document IDs that cannot be used.
 */
const RESERVED_IDS = new Set([".", ".."]);

/**
 * Reserved prefix for system-managed documents.
 */
const RESERVED_PREFIX = "__";

/**
 * Characters that should trigger warnings but are technically allowed.
 * These can cause issues with certain clients or URL encoding.
 */
const SPECIAL_CHARS = new Set(["#", "[", "]", "*", "?"]);

/**
 * Minimum document ID length.
 */
export const MIN_DOCUMENT_ID_LENGTH = 1;

/**
 * Maximum document ID length.
 */
export const MAX_DOCUMENT_ID_LENGTH = 1500;

/**
 * Alphanumeric characters used for ID generation.
 * Firestore uses [A-Za-z0-9] for auto-generated IDs.
 */
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Length of auto-generated document IDs.
 * Firestore generates 20-character IDs.
 */
const GENERATED_ID_LENGTH = 20;

/**
 * Validate a document ID according to Firestore rules.
 *
 * @param id - Document ID to validate
 * @throws {InvalidArgumentError} If the document ID is invalid
 *
 * @example
 * ```typescript
 * validateDocumentId("user123"); // Valid
 * validateDocumentId("my-document"); // Valid
 * validateDocumentId(""); // Throws: Document ID cannot be empty
 * validateDocumentId("."); // Throws: Reserved document ID
 * validateDocumentId("__private"); // Throws: Reserved prefix
 * validateDocumentId("users/123"); // Throws: Cannot contain /
 * ```
 */
export function validateDocumentId(id: string): void {
  // Check for empty or whitespace-only IDs
  if (!id || id.trim().length === 0) {
    throw new InvalidArgumentError("Document ID cannot be empty", {
      argumentName: "documentId",
    });
  }

  // Check length constraints
  if (id.length < MIN_DOCUMENT_ID_LENGTH) {
    throw new InvalidArgumentError(
      `Document ID must be at least ${MIN_DOCUMENT_ID_LENGTH} character(s)`,
      { argumentName: "documentId" }
    );
  }

  if (id.length > MAX_DOCUMENT_ID_LENGTH) {
    throw new InvalidArgumentError(
      `Document ID exceeds maximum length of ${MAX_DOCUMENT_ID_LENGTH} characters (got ${id.length})`,
      { argumentName: "documentId" }
    );
  }

  // Check for reserved IDs
  if (RESERVED_IDS.has(id)) {
    throw new InvalidArgumentError(
      `Document ID "${id}" is reserved and cannot be used`,
      { argumentName: "documentId" }
    );
  }

  // Check for reserved prefix
  if (id.startsWith(RESERVED_PREFIX)) {
    throw new InvalidArgumentError(
      `Document ID cannot start with "${RESERVED_PREFIX}" (reserved for system use)`,
      { argumentName: "documentId" }
    );
  }

  // Check for forward slash (would create subcollection)
  if (id.includes("/")) {
    throw new InvalidArgumentError(
      'Document ID cannot contain "/" character (use collection paths for subcollections)',
      { argumentName: "documentId" }
    );
  }

  // Check for null character
  if (id.includes("\0")) {
    throw new InvalidArgumentError(
      "Document ID cannot contain null character (\\0)",
      { argumentName: "documentId" }
    );
  }

  // Warn about special characters (log to console in production)
  const specialChars = Array.from(SPECIAL_CHARS);
  for (const char of specialChars) {
    if (id.includes(char)) {
      console.warn(
        `Warning: Document ID "${id}" contains special character "${char}" which may cause issues with URL encoding or certain clients`
      );
      break; // Only warn once per ID
    }
  }
}

/**
 * Check if a document ID is valid without throwing.
 *
 * @param id - Document ID to check
 * @returns True if the document ID is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidDocumentId("user123"); // true
 * isValidDocumentId(""); // false
 * isValidDocumentId("."); // false
 * isValidDocumentId("__private"); // false
 * ```
 */
export function isValidDocumentId(id: string): boolean {
  try {
    validateDocumentId(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random document ID in Firestore format.
 *
 * Generates a 20-character alphanumeric ID matching Firestore's auto-ID format.
 * Uses cryptographically secure random number generation when available.
 *
 * @returns A randomly generated document ID
 *
 * @example
 * ```typescript
 * const id = generateDocumentId();
 * console.log(id); // "a1b2c3d4e5f6g7h8i9j0"
 * console.log(id.length); // 20
 * ```
 */
export function generateDocumentId(): string {
  let id = "";

  // Use crypto.getRandomValues if available (browser/Node.js 15+)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const randomBytes = new Uint8Array(GENERATED_ID_LENGTH);
    crypto.getRandomValues(randomBytes);

    for (let i = 0; i < GENERATED_ID_LENGTH; i++) {
      id += ALPHANUMERIC[randomBytes[i]! % ALPHANUMERIC.length];
    }
  } else {
    // Fallback to Math.random()
    for (let i = 0; i < GENERATED_ID_LENGTH; i++) {
      const randomIndex = Math.floor(Math.random() * ALPHANUMERIC.length);
      id += ALPHANUMERIC[randomIndex];
    }
  }

  return id;
}

/**
 * Sanitize a document ID by removing invalid characters.
 *
 * This function attempts to make an invalid ID valid by:
 * - Replacing "/" with "-"
 * - Removing null characters
 * - Trimming to maximum length
 * - Replacing reserved IDs with a safe alternative
 * - Adding prefix if starts with "__"
 *
 * Note: This may not preserve the original meaning of the ID.
 * Use with caution and validate the result.
 *
 * @param id - Document ID to sanitize
 * @returns Sanitized document ID
 *
 * @example
 * ```typescript
 * sanitizeDocumentId("users/123"); // "users-123"
 * sanitizeDocumentId("."); // "dot"
 * sanitizeDocumentId("__private"); // "x__private"
 * sanitizeDocumentId("a".repeat(2000)); // Truncated to 1500 chars
 * ```
 */
export function sanitizeDocumentId(id: string): string {
  if (!id || id.trim().length === 0) {
    return generateDocumentId();
  }

  let sanitized = id;

  // Replace forward slashes
  sanitized = sanitized.replace(/\//g, "-");

  // Remove null characters
  sanitized = sanitized.replace(/\0/g, "");

  // Handle reserved IDs
  if (RESERVED_IDS.has(sanitized)) {
    sanitized = sanitized === "." ? "dot" : "dotdot";
  }

  // Handle reserved prefix
  if (sanitized.startsWith(RESERVED_PREFIX)) {
    sanitized = "x" + sanitized;
  }

  // Trim to maximum length
  if (sanitized.length > MAX_DOCUMENT_ID_LENGTH) {
    sanitized = sanitized.substring(0, MAX_DOCUMENT_ID_LENGTH);
  }

  // Ensure not empty after sanitization
  if (sanitized.length === 0) {
    return generateDocumentId();
  }

  return sanitized;
}

/**
 * Check if a document ID contains special characters that may cause issues.
 *
 * @param id - Document ID to check
 * @returns List of special characters found in the ID
 *
 * @example
 * ```typescript
 * getSpecialCharacters("user#123"); // ["#"]
 * getSpecialCharacters("doc[1]"); // ["[", "]"]
 * getSpecialCharacters("normal"); // []
 * ```
 */
export function getSpecialCharacters(id: string): string[] {
  const found: string[] = [];
  const specialChars = Array.from(SPECIAL_CHARS);
  for (const char of specialChars) {
    if (id.includes(char)) {
      found.push(char);
    }
  }
  return found;
}

/**
 * Check if a document ID is auto-generated format.
 *
 * Firestore auto-generated IDs are 20 alphanumeric characters.
 *
 * @param id - Document ID to check
 * @returns True if the ID matches the auto-generated format
 *
 * @example
 * ```typescript
 * isAutoGeneratedId("a1b2c3d4e5f6g7h8i9j0"); // true
 * isAutoGeneratedId("user123"); // false (wrong length)
 * isAutoGeneratedId("a1b2c3d4e5f6g7h8i9j!"); // false (special char)
 * ```
 */
export function isAutoGeneratedId(id: string): boolean {
  if (id.length !== GENERATED_ID_LENGTH) {
    return false;
  }

  // Check if all characters are alphanumeric
  for (let i = 0; i < id.length; i++) {
    if (!ALPHANUMERIC.includes(id[i]!)) {
      return false;
    }
  }

  return true;
}

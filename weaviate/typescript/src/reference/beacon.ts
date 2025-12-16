/**
 * Beacon URL Handling
 *
 * Utilities for creating, parsing, and validating Weaviate beacon URLs.
 * Beacons are used to reference objects across classes in the format:
 * weaviate://localhost/ClassName/uuid
 *
 * @module @llmdevops/weaviate-integration/reference/beacon
 */

import type { UUID } from '../types/property.js';
import type { BeaconComponents } from './types.js';

/**
 * Default host for beacon URLs
 */
const DEFAULT_HOST = 'localhost';

/**
 * Beacon URL regex pattern
 * Format: weaviate://host/ClassName/uuid
 */
const BEACON_PATTERN = /^weaviate:\/\/([^/]+)\/([^/]+)\/(.+)$/;

/**
 * UUID regex pattern (RFC 4122)
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a beacon URL from class name and ID
 *
 * @param className - The class name
 * @param id - The object UUID
 * @param host - Optional host (defaults to "localhost")
 * @returns Beacon URL string
 *
 * @example
 * ```typescript
 * const beacon = createBeacon("Author", "550e8400-..." as UUID);
 * // Returns: "weaviate://localhost/Author/550e8400-..."
 * ```
 */
export function createBeacon(
  className: string,
  id: UUID,
  host: string = DEFAULT_HOST
): string {
  if (!className || className.trim().length === 0) {
    throw new Error('Class name is required');
  }

  if (!id || id.trim().length === 0) {
    throw new Error('ID is required');
  }

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new Error(`Invalid UUID format: ${id}`);
  }

  return `weaviate://${host}/${className}/${id}`;
}

/**
 * Parse a beacon URL into its components
 *
 * @param beacon - The beacon string to parse
 * @returns Parsed components or null if invalid
 *
 * @example
 * ```typescript
 * const parsed = parseBeacon("weaviate://localhost/Author/550e8400-...");
 * // Returns: { host: "localhost", className: "Author", id: "550e8400-..." }
 * ```
 */
export function parseBeacon(beacon: string): BeaconComponents | null {
  if (!beacon || typeof beacon !== 'string') {
    return null;
  }

  const match = beacon.match(BEACON_PATTERN);
  if (!match) {
    return null;
  }

  const [, host, className, id] = match;

  // Validate UUID format
  if (!isValidUUID(id)) {
    return null;
  }

  return {
    host,
    className,
    id: id as UUID,
  };
}

/**
 * Validate a beacon URL format
 *
 * @param beacon - The beacon string to validate
 * @returns True if the beacon is valid
 *
 * @example
 * ```typescript
 * validateBeacon("weaviate://localhost/Author/550e8400-..."); // true
 * validateBeacon("invalid-beacon"); // false
 * ```
 */
export function validateBeacon(beacon: string): boolean {
  return parseBeacon(beacon) !== null;
}

/**
 * Check if a string is a valid beacon format
 * (Alias for validateBeacon)
 *
 * @param beacon - The beacon string to check
 * @returns True if the beacon is valid
 */
export function isValidBeaconFormat(beacon: string): boolean {
  return validateBeacon(beacon);
}

/**
 * Extract class name from a beacon URL
 *
 * @param beacon - The beacon string
 * @returns Class name or null if invalid
 *
 * @example
 * ```typescript
 * extractClassFromBeacon("weaviate://localhost/Author/550e8400-...");
 * // Returns: "Author"
 * ```
 */
export function extractClassFromBeacon(beacon: string): string | null {
  const parsed = parseBeacon(beacon);
  return parsed ? parsed.className : null;
}

/**
 * Extract ID from a beacon URL
 *
 * @param beacon - The beacon string
 * @returns Object ID or null if invalid
 *
 * @example
 * ```typescript
 * extractIdFromBeacon("weaviate://localhost/Author/550e8400-...");
 * // Returns: "550e8400-..." as UUID
 * ```
 */
export function extractIdFromBeacon(beacon: string): UUID | null {
  const parsed = parseBeacon(beacon);
  return parsed ? parsed.id : null;
}

/**
 * Extract host from a beacon URL
 *
 * @param beacon - The beacon string
 * @returns Host or null if invalid
 *
 * @example
 * ```typescript
 * extractHostFromBeacon("weaviate://localhost/Author/550e8400-...");
 * // Returns: "localhost"
 * ```
 */
export function extractHostFromBeacon(beacon: string): string | null {
  const parsed = parseBeacon(beacon);
  return parsed ? parsed.host : null;
}

/**
 * Convert multiple beacons to an array of beacon components
 *
 * @param beacons - Array of beacon strings
 * @returns Array of parsed components (filters out invalid beacons)
 */
export function parseBeacons(beacons: string[]): BeaconComponents[] {
  return beacons
    .map((beacon) => parseBeacon(beacon))
    .filter((parsed): parsed is BeaconComponents => parsed !== null);
}

/**
 * Validate array of beacons
 *
 * @param beacons - Array of beacon strings
 * @returns True if all beacons are valid
 */
export function validateBeacons(beacons: string[]): boolean {
  return beacons.every((beacon) => validateBeacon(beacon));
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Validate UUID format (RFC 4122)
 *
 * @param uuid - The UUID string to validate
 * @returns True if valid UUID format
 */
function isValidUUID(uuid: string): boolean {
  return UUID_PATTERN.test(uuid);
}

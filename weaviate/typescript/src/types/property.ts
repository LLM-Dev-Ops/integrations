/**
 * Weaviate property value types
 *
 * This module defines all supported property value types in Weaviate,
 * including primitives, arrays, and complex types.
 */

/**
 * Geographic coordinates
 */
export interface GeoCoordinates {
  /**
   * Latitude in decimal degrees
   */
  latitude: number;

  /**
   * Longitude in decimal degrees
   */
  longitude: number;
}

/**
 * Phone number with formatting information
 */
export interface PhoneNumber {
  /**
   * Original input string
   */
  input: string;

  /**
   * International format (e.g., +1 555-123-4567)
   */
  international: string;

  /**
   * Country code (optional, e.g., US)
   */
  countryCode?: string;

  /**
   * National format (optional)
   */
  national?: string;

  /**
   * Whether the number is valid
   */
  valid?: boolean;
}

/**
 * Branded type for UUID strings
 */
export type UUID = string & { readonly __brand: 'UUID' };

/**
 * Reference to another Weaviate object
 */
export interface ObjectReference {
  /**
   * Beacon string (e.g., weaviate://localhost/ClassName/uuid)
   */
  beacon: string;

  /**
   * Referenced object's class name
   */
  className: string;

  /**
   * Referenced object's UUID
   */
  id: UUID;

  /**
   * Optional href for the reference
   */
  href?: string;
}

/**
 * Union type representing all possible Weaviate property values
 *
 * Weaviate supports a rich type system including:
 * - Primitives: text, numbers, booleans, dates
 * - Arrays: of any primitive type
 * - Complex types: geo coordinates, phone numbers, blobs
 * - References: to other objects
 *
 * @example
 * ```typescript
 * // Text property
 * const title: PropertyValue = "Hello World";
 *
 * // Number array
 * const scores: PropertyValue = [95, 87, 92];
 *
 * // Geo coordinates
 * const location: PropertyValue = {
 *   latitude: 37.7749,
 *   longitude: -122.4194
 * };
 *
 * // Object references
 * const refs: PropertyValue = [
 *   {
 *     beacon: "weaviate://localhost/Author/123",
 *     className: "Author",
 *     id: "123" as UUID
 *   }
 * ];
 * ```
 */
export type PropertyValue =
  | string // Text
  | string[] // TextArray
  | number // Int or Number (i64 or f64)
  | number[] // IntArray or NumberArray
  | boolean // Boolean
  | boolean[] // BooleanArray
  | Date // Date
  | Date[] // DateArray
  | UUID // Uuid
  | UUID[] // UuidArray
  | GeoCoordinates // GeoCoordinates
  | PhoneNumber // PhoneNumber
  | Uint8Array // Blob (binary data)
  | ObjectReference[] // References to other objects
  | null; // Null value

/**
 * Map of property names to their values
 */
export type Properties = Record<string, PropertyValue>;

/**
 * Type guard to check if a value is a GeoCoordinates object
 *
 * @param value - The value to check
 * @returns True if the value is GeoCoordinates
 */
export function isGeoCoordinates(value: unknown): value is GeoCoordinates {
  return (
    typeof value === 'object' &&
    value !== null &&
    'latitude' in value &&
    'longitude' in value &&
    typeof (value as GeoCoordinates).latitude === 'number' &&
    typeof (value as GeoCoordinates).longitude === 'number'
  );
}

/**
 * Type guard to check if a value is a PhoneNumber object
 *
 * @param value - The value to check
 * @returns True if the value is PhoneNumber
 */
export function isPhoneNumber(value: unknown): value is PhoneNumber {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    'international' in value &&
    typeof (value as PhoneNumber).input === 'string' &&
    typeof (value as PhoneNumber).international === 'string'
  );
}

/**
 * Type guard to check if a value is an ObjectReference
 *
 * @param value - The value to check
 * @returns True if the value is ObjectReference
 */
export function isObjectReference(value: unknown): value is ObjectReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'beacon' in value &&
    'className' in value &&
    'id' in value &&
    typeof (value as ObjectReference).beacon === 'string' &&
    typeof (value as ObjectReference).className === 'string' &&
    typeof (value as ObjectReference).id === 'string'
  );
}

/**
 * Type guard to check if a value is an array of ObjectReferences
 *
 * @param value - The value to check
 * @returns True if the value is ObjectReference[]
 */
export function isObjectReferenceArray(
  value: unknown
): value is ObjectReference[] {
  return (
    Array.isArray(value) && value.every((item) => isObjectReference(item))
  );
}

/**
 * Creates a UUID branded type from a string
 *
 * @param id - The UUID string
 * @returns Branded UUID type
 */
export function createUUID(id: string): UUID {
  return id as UUID;
}

/**
 * Validates a UUID string format
 *
 * @param id - The string to validate
 * @returns True if the string is a valid UUID
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

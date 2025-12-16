/**
 * Object serialization utilities
 *
 * Handles conversion between internal WeaviateObject types and API wire format.
 * Supports proper handling of dates, geo coordinates, phone numbers, and references.
 */

import type { WeaviateObject, UUID, Properties, PropertyValue } from '../types/index.js';
import type {
  GeoCoordinates,
  PhoneNumber,
  ObjectReference,
} from '../types/property.js';
import {
  isGeoCoordinates,
  isPhoneNumber,
  isObjectReference,
  isObjectReferenceArray,
  createUUID,
} from '../types/property.js';
import type { ObjectApiResponse, CreateObjectRequest, UpdateObjectRequest } from './types.js';

// ============================================================================
// Object Serialization
// ============================================================================

/**
 * Serialize a WeaviateObject to API request format
 *
 * @param obj - The Weaviate object to serialize
 * @returns API request object
 */
export function serializeObject(obj: WeaviateObject): CreateObjectRequest {
  return {
    id: obj.id,
    class: obj.className,
    properties: serializeProperties(obj.properties),
    vector: obj.vector,
    tenant: obj.tenant,
  };
}

/**
 * Deserialize API response to WeaviateObject
 *
 * @param data - API response data
 * @returns Weaviate object
 */
export function deserializeObject(data: ObjectApiResponse): WeaviateObject {
  return {
    id: createUUID(data.id),
    className: data.class,
    properties: deserializeProperties(data.properties),
    vector: data.vector,
    tenant: data.tenant,
    creationTime: data.creationTimeUnix
      ? new Date(data.creationTimeUnix)
      : undefined,
    updateTime: data.lastUpdateTimeUnix
      ? new Date(data.lastUpdateTimeUnix)
      : undefined,
    additional: data.additional,
  };
}

/**
 * Serialize object for update request
 *
 * @param className - Class name
 * @param id - Object ID
 * @param properties - Properties to update
 * @param vector - Optional vector
 * @returns API update request
 */
export function serializeUpdateRequest(
  className: string,
  id: UUID,
  properties?: Properties,
  vector?: number[]
): UpdateObjectRequest {
  const request: UpdateObjectRequest = {
    id,
    class: className,
  };

  if (properties) {
    request.properties = serializeProperties(properties);
  }

  if (vector) {
    request.vector = vector;
  }

  return request;
}

// ============================================================================
// Properties Serialization
// ============================================================================

/**
 * Serialize properties object to API format
 *
 * @param properties - Properties to serialize
 * @returns Serialized properties
 */
export function serializeProperties(properties: Properties): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    serialized[key] = serializePropertyValue(value);
  }

  return serialized;
}

/**
 * Deserialize properties from API format
 *
 * @param data - API properties data
 * @returns Deserialized properties
 */
export function deserializeProperties(data: Record<string, unknown>): Properties {
  const properties: Properties = {};

  for (const [key, value] of Object.entries(data)) {
    properties[key] = deserializePropertyValue(value);
  }

  return properties;
}

// ============================================================================
// Property Value Serialization
// ============================================================================

/**
 * Serialize a single property value
 *
 * @param value - Property value to serialize
 * @returns Serialized value
 */
export function serializePropertyValue(value: PropertyValue): unknown {
  // Null values
  if (value === null || value === undefined) {
    return null;
  }

  // Date values - convert to ISO 8601 string
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Date array
  if (Array.isArray(value) && value.length > 0 && value[0] instanceof Date) {
    return (value as Date[]).map((d) => d.toISOString());
  }

  // GeoCoordinates
  if (isGeoCoordinates(value)) {
    return {
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  // PhoneNumber
  if (isPhoneNumber(value)) {
    return {
      input: value.input,
      internationalFormatted: value.international,
      countryCode: value.countryCode,
      nationalFormatted: value.national,
      valid: value.valid,
    };
  }

  // ObjectReference array
  if (isObjectReferenceArray(value)) {
    return value.map((ref) => ({
      beacon: ref.beacon,
      href: ref.href,
    }));
  }

  // Blob (Uint8Array) - convert to base64
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }

  // Primitive values and arrays
  return value;
}

/**
 * Deserialize a single property value
 *
 * @param data - API property value
 * @param dataType - Optional data type hint
 * @returns Deserialized property value
 */
export function deserializePropertyValue(
  data: unknown,
  dataType?: string
): PropertyValue {
  // Null values
  if (data === null || data === undefined) {
    return null;
  }

  // Date values - parse ISO 8601 string
  if (dataType === 'date' && typeof data === 'string') {
    return new Date(data);
  }

  // Date array
  if (dataType === 'date[]' && Array.isArray(data)) {
    return data.map((d) => new Date(d as string));
  }

  // GeoCoordinates
  if (
    dataType === 'geoCoordinates' &&
    typeof data === 'object' &&
    data !== null &&
    'latitude' in data &&
    'longitude' in data
  ) {
    return {
      latitude: (data as { latitude: number }).latitude,
      longitude: (data as { longitude: number }).longitude,
    } as GeoCoordinates;
  }

  // PhoneNumber
  if (
    dataType === 'phoneNumber' &&
    typeof data === 'object' &&
    data !== null &&
    'input' in data
  ) {
    const phone = data as {
      input: string;
      internationalFormatted?: string;
      countryCode?: string;
      nationalFormatted?: string;
      valid?: boolean;
    };
    return {
      input: phone.input,
      international: phone.internationalFormatted ?? phone.input,
      countryCode: phone.countryCode,
      national: phone.nationalFormatted,
      valid: phone.valid,
    } as PhoneNumber;
  }

  // ObjectReference array (cross-references)
  if (Array.isArray(data) && data.length > 0 && isReferenceObject(data[0])) {
    return data.map((ref) => parseReference(ref)) as ObjectReference[];
  }

  // Blob - parse base64
  if (dataType === 'blob' && typeof data === 'string') {
    return new Uint8Array(Buffer.from(data, 'base64'));
  }

  // UUID values
  if (dataType === 'uuid' && typeof data === 'string') {
    return createUUID(data);
  }

  // UUID array
  if (dataType === 'uuid[]' && Array.isArray(data)) {
    return data.map((id) => createUUID(id as string));
  }

  // Primitive values and arrays - return as-is
  return data as PropertyValue;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an object is a reference object from API
 *
 * @param obj - Object to check
 * @returns True if object is a reference
 */
function isReferenceObject(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('beacon' in obj || 'href' in obj)
  );
}

/**
 * Parse a reference object from API format
 *
 * @param data - Reference data
 * @returns ObjectReference
 */
function parseReference(data: unknown): ObjectReference {
  const ref = data as {
    beacon?: string;
    href?: string;
    class?: string;
  };

  // Parse beacon to extract className and id
  let className = ref.class ?? '';
  let id = '';

  if (ref.beacon) {
    const match = ref.beacon.match(/weaviate:\/\/localhost\/([^/]+)\/(.+)/);
    if (match) {
      className = match[1];
      id = match[2];
    }
  }

  return {
    beacon: ref.beacon ?? '',
    className,
    id: createUUID(id),
    href: ref.href,
  };
}

/**
 * Build include parameter string for API requests
 *
 * @param includeVector - Whether to include vector
 * @param includeClassification - Whether to include classification
 * @returns Include parameter string
 */
export function buildIncludeParams(
  includeVector?: boolean,
  includeClassification?: boolean
): string | undefined {
  const includes: string[] = [];

  if (includeVector) {
    includes.push('vector');
  }

  if (includeClassification) {
    includes.push('classification');
  }

  return includes.length > 0 ? includes.join(',') : undefined;
}

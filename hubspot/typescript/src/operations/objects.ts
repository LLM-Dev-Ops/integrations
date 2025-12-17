/**
 * CRM Object Operations
 *
 * CRUD operations for HubSpot CRM objects (contacts, companies, deals, tickets, etc.)
 */

import type {
  ObjectType,
  CrmObject,
  Properties,
  GetOptions,
} from '../types/objects.js';
import type { AssociationInput } from '../types/associations.js';

/**
 * Request options for executing API calls
 */
export interface RequestExecutor {
  executeRequest<T>(options: RequestOptions): Promise<T>;
}

/**
 * Request options for API calls
 */
export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint: string;
  params?: Record<string, string>;
  body?: unknown;
  operation: string;
  objectType?: string;
}

/**
 * API response for object operations
 */
interface ObjectApiResponse {
  id: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

/**
 * Valid object types in HubSpot CRM
 */
const VALID_OBJECT_TYPES = new Set<string>([
  'contacts',
  'companies',
  'deals',
  'tickets',
  'products',
  'line_items',
  'quotes',
  'calls',
  'emails',
  'meetings',
  'notes',
  'tasks',
]);

/**
 * Validate that the object type is supported
 */
function isValidObjectType(type: string): boolean {
  return VALID_OBJECT_TYPES.has(type) || type.startsWith('p_'); // Custom objects start with p_
}

/**
 * Parse an API response into a CrmObject
 */
function parseObjectResponse(response: ObjectApiResponse, type: ObjectType): CrmObject {
  return {
    id: response.id,
    type,
    properties: response.properties as Properties,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
    archived: response.archived ?? false,
  };
}

/**
 * Create a new CRM object
 */
export async function createObject(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  properties: Properties,
  associations?: AssociationInput[]
): Promise<CrmObject> {
  if (!isValidObjectType(type)) {
    throw new Error(`Invalid object type: ${type}`);
  }

  const endpoint = `/crm/${apiVersion}/objects/${type}`;
  const body: Record<string, unknown> = { properties };

  if (associations && associations.length > 0) {
    body.associations = associations.map((a) => ({
      to: { id: a.toId },
      types: [
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: a.associationType,
        },
      ],
    }));
  }

  const response = await executor.executeRequest<ObjectApiResponse>({
    method: 'POST',
    endpoint,
    body,
    operation: 'createObject',
    objectType: type,
  });

  return parseObjectResponse(response, type);
}

/**
 * Get a CRM object by ID
 */
export async function getObject(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  id: string,
  options?: GetOptions
): Promise<CrmObject | null> {
  const endpoint = `/crm/${apiVersion}/objects/${type}/${id}`;

  const params: Record<string, string> = {};
  if (options?.properties) {
    params.properties = options.properties.join(',');
  }
  if (options?.associations) {
    params.associations = options.associations.join(',');
  }
  if (options?.archived) {
    params.archived = 'true';
  }

  try {
    const response = await executor.executeRequest<ObjectApiResponse>({
      method: 'GET',
      endpoint,
      params: Object.keys(params).length > 0 ? params : undefined,
      operation: 'getObject',
      objectType: type,
    });

    return parseObjectResponse(response, type);
  } catch (error: unknown) {
    // Return null for 404 errors
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Update a CRM object
 */
export async function updateObject(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  id: string,
  properties: Properties
): Promise<CrmObject> {
  const endpoint = `/crm/${apiVersion}/objects/${type}/${id}`;

  const response = await executor.executeRequest<ObjectApiResponse>({
    method: 'PATCH',
    endpoint,
    body: { properties },
    operation: 'updateObject',
    objectType: type,
  });

  return parseObjectResponse(response, type);
}

/**
 * Delete (archive) a CRM object
 */
export async function deleteObject(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  id: string
): Promise<void> {
  const endpoint = `/crm/${apiVersion}/objects/${type}/${id}`;

  await executor.executeRequest<void>({
    method: 'DELETE',
    endpoint,
    operation: 'deleteObject',
    objectType: type,
  });
}

export { isValidObjectType, parseObjectResponse };

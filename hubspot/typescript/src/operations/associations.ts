/**
 * Association Operations
 *
 * Create, read, and delete associations between HubSpot CRM objects
 */

import type { ObjectType } from '../types/objects.js';
import type {
  ObjectRef,
  Association,
  AssociationInput,
  BatchAssociationResult,
} from '../types/associations.js';
import type { RequestExecutor } from './objects.js';

/**
 * API response for getting associations
 */
interface GetAssociationsApiResponse {
  results: Array<{
    id: string;
    type?: string;
  }>;
}

/**
 * API response for batch association operations
 */
interface BatchAssociationApiResponse {
  status?: string;
  results?: Array<{
    from: { id: string };
    to: { id: string };
    type: string;
  }>;
  errors?: Array<{
    message: string;
    category: string;
    context?: Record<string, unknown>;
  }>;
}

/**
 * Create an association between two objects
 */
export async function createAssociation(
  executor: RequestExecutor,
  apiVersion: string,
  from: ObjectRef,
  to: ObjectRef,
  associationType: string
): Promise<void> {
  const endpoint = `/crm/${apiVersion}/associations/${from.type}/${to.type}/batch/create`;

  const body = {
    inputs: [
      {
        from: { id: from.id },
        to: { id: to.id },
        type: associationType,
      },
    ],
  };

  await executor.executeRequest<void>({
    method: 'POST',
    endpoint,
    body,
    operation: 'createAssociation',
  });
}

/**
 * Get associations for an object
 */
export async function getAssociations(
  executor: RequestExecutor,
  apiVersion: string,
  from: ObjectRef,
  toType: ObjectType
): Promise<Association[]> {
  const endpoint = `/crm/${apiVersion}/objects/${from.type}/${from.id}/associations/${toType}`;

  const response = await executor.executeRequest<GetAssociationsApiResponse>({
    method: 'GET',
    endpoint,
    operation: 'getAssociations',
  });

  return response.results.map((r) => ({
    toObjectId: r.id,
    toObjectType: toType,
    associationTypes: r.type ? [r.type] : [],
  }));
}

/**
 * Delete an association between two objects
 */
export async function deleteAssociation(
  executor: RequestExecutor,
  apiVersion: string,
  from: ObjectRef,
  to: ObjectRef,
  associationType: string
): Promise<void> {
  const endpoint = `/crm/${apiVersion}/associations/${from.type}/${to.type}/batch/archive`;

  const body = {
    inputs: [
      {
        from: { id: from.id },
        to: { id: to.id },
        type: associationType,
      },
    ],
  };

  await executor.executeRequest<void>({
    method: 'POST',
    endpoint,
    body,
    operation: 'deleteAssociation',
  });
}

/**
 * Create multiple associations in batch
 */
export async function batchAssociate(
  executor: RequestExecutor,
  apiVersion: string,
  fromType: ObjectType,
  toType: ObjectType,
  associations: AssociationInput[]
): Promise<BatchAssociationResult> {
  if (associations.length === 0) {
    return { results: [], errors: [] };
  }

  const endpoint = `/crm/${apiVersion}/associations/${fromType}/${toType}/batch/create`;

  const body = {
    inputs: associations.map((a) => ({
      from: { id: a.fromId },
      to: { id: a.toId },
      type: a.associationType,
    })),
  };

  const response = await executor.executeRequest<BatchAssociationApiResponse>({
    method: 'POST',
    endpoint,
    body,
    operation: 'batchAssociate',
  });

  return {
    results: response.results ?? [],
    errors: response.errors ?? [],
  };
}

/**
 * Delete multiple associations in batch
 */
export async function batchDisassociate(
  executor: RequestExecutor,
  apiVersion: string,
  fromType: ObjectType,
  toType: ObjectType,
  associations: AssociationInput[]
): Promise<BatchAssociationResult> {
  if (associations.length === 0) {
    return { results: [], errors: [] };
  }

  const endpoint = `/crm/${apiVersion}/associations/${fromType}/${toType}/batch/archive`;

  const body = {
    inputs: associations.map((a) => ({
      from: { id: a.fromId },
      to: { id: a.toId },
      type: a.associationType,
    })),
  };

  await executor.executeRequest<void>({
    method: 'POST',
    endpoint,
    body,
    operation: 'batchDisassociate',
  });

  return { results: [], errors: [] };
}

/**
 * Get all associations between two object types for a specific object
 */
export async function getAllAssociations(
  executor: RequestExecutor,
  apiVersion: string,
  from: ObjectRef,
  toTypes: ObjectType[]
): Promise<Map<ObjectType, Association[]>> {
  const result = new Map<ObjectType, Association[]>();

  // Fetch associations for each type in parallel
  const promises = toTypes.map(async (toType) => {
    const associations = await getAssociations(executor, apiVersion, from, toType);
    return { toType, associations };
  });

  const results = await Promise.all(promises);

  for (const { toType, associations } of results) {
    result.set(toType, associations);
  }

  return result;
}

/**
 * Common association type IDs for HubSpot
 */
export const ASSOCIATION_TYPES = {
  // Contact associations
  CONTACT_TO_COMPANY: 'contact_to_company',
  CONTACT_TO_DEAL: 'contact_to_deal',
  CONTACT_TO_TICKET: 'contact_to_ticket',

  // Company associations
  COMPANY_TO_CONTACT: 'company_to_contact',
  COMPANY_TO_DEAL: 'company_to_deal',
  COMPANY_TO_TICKET: 'company_to_ticket',

  // Deal associations
  DEAL_TO_CONTACT: 'deal_to_contact',
  DEAL_TO_COMPANY: 'deal_to_company',
  DEAL_TO_LINE_ITEM: 'deal_to_line_item',

  // Ticket associations
  TICKET_TO_CONTACT: 'ticket_to_contact',
  TICKET_TO_COMPANY: 'ticket_to_company',

  // Engagement associations
  ENGAGEMENT_TO_CONTACT: 'engagement_to_contact',
  ENGAGEMENT_TO_COMPANY: 'engagement_to_company',
  ENGAGEMENT_TO_DEAL: 'engagement_to_deal',
} as const;

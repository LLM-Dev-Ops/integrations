/**
 * Batch Operations
 *
 * Bulk create, read, update, and archive operations for HubSpot CRM objects
 */

import type {
  ObjectType,
  CrmObject,
  Properties,
} from '../types/objects.js';
import type {
  BatchResult,
  BatchError,
  CreateInput,
  UpdateInput,
} from '../types/batch.js';
import type { RequestExecutor, RequestOptions } from './objects.js';
import { parseObjectResponse } from './objects.js';

/**
 * Default batch size for HubSpot API
 */
const DEFAULT_BATCH_SIZE = 100;

/**
 * API response for batch operations
 */
interface BatchApiResponse {
  status: string;
  results?: Array<{
    id: string;
    properties: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    archived?: boolean;
  }>;
  errors?: Array<{
    id?: string;
    message: string;
    category: string;
    context?: Record<string, unknown>;
  }>;
}

/**
 * Split an array into chunks of specified size
 */
function splitIntoChunks<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Parse batch API response into BatchResult
 */
function parseBatchResponse(response: BatchApiResponse, type: ObjectType): BatchResult {
  const results: CrmObject[] = [];
  const errors: BatchError[] = [];

  if (response.results) {
    for (const item of response.results) {
      results.push(parseObjectResponse(item, type));
    }
  }

  if (response.errors) {
    for (const error of response.errors) {
      errors.push({
        id: error.id,
        message: error.message,
        category: error.category,
        context: error.context,
      });
    }
  }

  return { results, errors, status: response.status };
}

/**
 * Batch create objects
 */
export async function batchCreate(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  inputs: CreateInput[],
  batchSize: number = DEFAULT_BATCH_SIZE,
  waitForSlot?: () => Promise<void>
): Promise<BatchResult> {
  if (inputs.length === 0) {
    return { results: [], errors: [] };
  }

  if (inputs.length <= batchSize) {
    return executeBatchCreate(executor, apiVersion, type, inputs);
  }

  // Split into chunks and process sequentially
  const chunks = splitIntoChunks(inputs, batchSize);
  const allResults: CrmObject[] = [];
  const allErrors: BatchError[] = [];

  for (const chunk of chunks) {
    if (waitForSlot) {
      await waitForSlot();
    }
    const result = await executeBatchCreate(executor, apiVersion, type, chunk);
    allResults.push(...result.results);
    allErrors.push(...result.errors);
  }

  return { results: allResults, errors: allErrors };
}

/**
 * Execute a single batch create request
 */
async function executeBatchCreate(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  inputs: CreateInput[]
): Promise<BatchResult> {
  const endpoint = `/crm/${apiVersion}/objects/${type}/batch/create`;

  const response = await executor.executeRequest<BatchApiResponse>({
    method: 'POST',
    endpoint,
    body: {
      inputs: inputs.map((input) => ({
        properties: input.properties,
        associations: input.associations?.map((a) => ({
          to: { id: a.toId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: a.associationType,
            },
          ],
        })),
      })),
    },
    operation: 'batchCreate',
    objectType: type,
  });

  return parseBatchResponse(response, type);
}

/**
 * Batch read objects by IDs
 */
export async function batchRead(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  ids: string[],
  properties?: string[],
  batchSize: number = DEFAULT_BATCH_SIZE,
  waitForSlot?: () => Promise<void>
): Promise<BatchResult> {
  if (ids.length === 0) {
    return { results: [], errors: [] };
  }

  // Deduplicate IDs
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length <= batchSize) {
    return executeBatchRead(executor, apiVersion, type, uniqueIds, properties);
  }

  // Split into chunks and process sequentially
  const chunks = splitIntoChunks(uniqueIds, batchSize);
  const allResults: CrmObject[] = [];
  const allErrors: BatchError[] = [];

  for (const chunk of chunks) {
    if (waitForSlot) {
      await waitForSlot();
    }
    const result = await executeBatchRead(executor, apiVersion, type, chunk, properties);
    allResults.push(...result.results);
    allErrors.push(...result.errors);
  }

  return { results: allResults, errors: allErrors };
}

/**
 * Execute a single batch read request
 */
async function executeBatchRead(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  ids: string[],
  properties?: string[]
): Promise<BatchResult> {
  const endpoint = `/crm/${apiVersion}/objects/${type}/batch/read`;

  const response = await executor.executeRequest<BatchApiResponse>({
    method: 'POST',
    endpoint,
    body: {
      inputs: ids.map((id) => ({ id })),
      properties: properties ?? [],
    },
    operation: 'batchRead',
    objectType: type,
  });

  return parseBatchResponse(response, type);
}

/**
 * Batch update objects
 */
export async function batchUpdate(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  inputs: UpdateInput[],
  batchSize: number = DEFAULT_BATCH_SIZE,
  waitForSlot?: () => Promise<void>
): Promise<BatchResult> {
  if (inputs.length === 0) {
    return { results: [], errors: [] };
  }

  // Validate all inputs have IDs
  for (const input of inputs) {
    if (!input.id) {
      throw new Error('All update inputs must have id');
    }
  }

  if (inputs.length <= batchSize) {
    return executeBatchUpdate(executor, apiVersion, type, inputs);
  }

  // Split into chunks and process sequentially
  const chunks = splitIntoChunks(inputs, batchSize);
  const allResults: CrmObject[] = [];
  const allErrors: BatchError[] = [];

  for (const chunk of chunks) {
    if (waitForSlot) {
      await waitForSlot();
    }
    const result = await executeBatchUpdate(executor, apiVersion, type, chunk);
    allResults.push(...result.results);
    allErrors.push(...result.errors);
  }

  return { results: allResults, errors: allErrors };
}

/**
 * Execute a single batch update request
 */
async function executeBatchUpdate(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  inputs: UpdateInput[]
): Promise<BatchResult> {
  const endpoint = `/crm/${apiVersion}/objects/${type}/batch/update`;

  const response = await executor.executeRequest<BatchApiResponse>({
    method: 'POST',
    endpoint,
    body: {
      inputs: inputs.map((input) => ({
        id: input.id,
        properties: input.properties,
      })),
    },
    operation: 'batchUpdate',
    objectType: type,
  });

  return parseBatchResponse(response, type);
}

/**
 * Batch archive objects
 */
export async function batchArchive(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  ids: string[],
  batchSize: number = DEFAULT_BATCH_SIZE,
  waitForSlot?: () => Promise<void>
): Promise<BatchResult> {
  if (ids.length === 0) {
    return { results: [], errors: [] };
  }

  if (ids.length <= batchSize) {
    return executeBatchArchive(executor, apiVersion, type, ids);
  }

  // Split into chunks and process sequentially
  const chunks = splitIntoChunks(ids, batchSize);
  const allResults: CrmObject[] = [];
  const allErrors: BatchError[] = [];

  for (const chunk of chunks) {
    if (waitForSlot) {
      await waitForSlot();
    }
    const result = await executeBatchArchive(executor, apiVersion, type, chunk);
    allResults.push(...result.results);
    allErrors.push(...result.errors);
  }

  return { results: allResults, errors: allErrors };
}

/**
 * Execute a single batch archive request
 */
async function executeBatchArchive(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  ids: string[]
): Promise<BatchResult> {
  const endpoint = `/crm/${apiVersion}/objects/${type}/batch/archive`;

  await executor.executeRequest<void>({
    method: 'POST',
    endpoint,
    body: {
      inputs: ids.map((id) => ({ id })),
    },
    operation: 'batchArchive',
    objectType: type,
  });

  // Archive doesn't return results, so we return empty
  return { results: [], errors: [] };
}

export { splitIntoChunks, parseBatchResponse };

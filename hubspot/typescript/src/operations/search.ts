/**
 * Search Operations
 *
 * Search and filter CRM objects in HubSpot
 */

import type {
  ObjectType,
  CrmObject,
} from '../types/objects.js';
import type {
  SearchQuery,
  SearchResult,
  FilterClause,
  SortClause,
} from '../types/search.js';
import type { RequestExecutor } from './objects.js';
import { parseObjectResponse } from './objects.js';

/**
 * Maximum search results per request
 */
const MAX_SEARCH_LIMIT = 100;

/**
 * API response for search operations
 */
interface SearchApiResponse {
  results: Array<{
    id: string;
    properties: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    archived?: boolean;
  }>;
  total: number;
  paging?: {
    next?: {
      after: string;
    };
  };
}

/**
 * Build the search request body from a SearchQuery
 */
function buildSearchBody(query: SearchQuery): Record<string, unknown> {
  const body: Record<string, unknown> = {
    limit: Math.min(query.limit ?? 10, MAX_SEARCH_LIMIT),
  };

  if (query.after) {
    body.after = query.after;
  }

  // Build filter groups
  if (query.filters && query.filters.length > 0) {
    body.filterGroups = [
      {
        filters: query.filters.map((f) => ({
          propertyName: f.property,
          operator: f.operator,
          value: f.value,
          values: f.values,
          highValue: f.highValue,
        })),
      },
    ];
  }

  // Add sorting
  if (query.sorts && query.sorts.length > 0) {
    body.sorts = query.sorts.map((s) => ({
      propertyName: s.property,
      direction: s.direction ?? 'ASCENDING',
    }));
  }

  // Specify properties to return
  if (query.properties) {
    body.properties = query.properties;
  }

  return body;
}

/**
 * Parse search API response into SearchResult
 */
function parseSearchResponse(response: SearchApiResponse, type: ObjectType): SearchResult {
  const results = response.results.map((r) => parseObjectResponse(r, type));

  return {
    results,
    total: response.total,
    paging: response.paging
      ? {
          next: response.paging.next?.after,
        }
      : null,
  };
}

/**
 * Search CRM objects with filters and pagination
 */
export async function searchObjects(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  query: SearchQuery
): Promise<SearchResult> {
  if (query.limit && query.limit > MAX_SEARCH_LIMIT) {
    throw new Error(`Search limit cannot exceed ${MAX_SEARCH_LIMIT}`);
  }

  const endpoint = `/crm/${apiVersion}/objects/${type}/search`;
  const body = buildSearchBody(query);

  const response = await executor.executeRequest<SearchApiResponse>({
    method: 'POST',
    endpoint,
    body,
    operation: 'searchObjects',
    objectType: type,
  });

  return parseSearchResponse(response, type);
}

/**
 * Async generator that iterates through all search results
 */
export async function* searchAll(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  query: SearchQuery,
  waitForSlot?: () => Promise<void>
): AsyncGenerator<CrmObject, void, undefined> {
  let cursor = query.after;

  while (true) {
    if (waitForSlot) {
      await waitForSlot();
    }

    const result = await searchObjects(executor, apiVersion, type, {
      ...query,
      limit: MAX_SEARCH_LIMIT,
      after: cursor,
    });

    for (const object of result.results) {
      yield object;
    }

    if (!result.paging?.next) {
      break;
    }

    cursor = result.paging.next;
  }
}

/**
 * Search by a single property value
 */
export async function searchByProperty(
  executor: RequestExecutor,
  apiVersion: string,
  type: ObjectType,
  property: string,
  value: string | number | boolean,
  options?: {
    properties?: string[];
    limit?: number;
  }
): Promise<SearchResult> {
  return searchObjects(executor, apiVersion, type, {
    filters: [
      {
        property,
        operator: 'EQ',
        value,
      },
    ],
    properties: options?.properties,
    limit: options?.limit,
  });
}

/**
 * Search by email address (common use case for contacts)
 */
export async function searchByEmail(
  executor: RequestExecutor,
  apiVersion: string,
  email: string,
  properties?: string[]
): Promise<CrmObject | null> {
  const result = await searchObjects(executor, apiVersion, 'contacts', {
    filters: [
      {
        property: 'email',
        operator: 'EQ',
        value: email,
      },
    ],
    properties,
    limit: 1,
  });

  return result.results[0] ?? null;
}

/**
 * Search by domain (common use case for companies)
 */
export async function searchByDomain(
  executor: RequestExecutor,
  apiVersion: string,
  domain: string,
  properties?: string[]
): Promise<CrmObject | null> {
  const result = await searchObjects(executor, apiVersion, 'companies', {
    filters: [
      {
        property: 'domain',
        operator: 'EQ',
        value: domain,
      },
    ],
    properties,
    limit: 1,
  });

  return result.results[0] ?? null;
}

export { buildSearchBody, parseSearchResponse, MAX_SEARCH_LIMIT };

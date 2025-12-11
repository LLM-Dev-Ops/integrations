/**
 * GitHub GraphQL Service
 *
 * Client for GitHub's GraphQL API v4
 */

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * GraphQL request
 */
export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

/**
 * GraphQL response
 */
export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

/**
 * GraphQL error
 */
export interface GraphQLError {
  message: string;
  locations?: Array<{
    line: number;
    column: number;
  }>;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
}

/**
 * Rate limit info from GraphQL
 */
export interface RateLimitInfo {
  limit: number;
  cost: number;
  remaining: number;
  resetAt: string;
  nodeCount: number;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
  requestedQueryCost: number;
  actualQueryCost: number;
}

/**
 * GitHub GraphQL Client
 *
 * Provides methods to execute GraphQL queries and mutations with rate limit tracking
 */
export class GraphQLClient {
  private rateLimitStatus: RateLimitStatus | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  /**
   * Execute a GraphQL query
   */
  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<GraphQLResponse<T>> {
    return this.execute<T>({ query, variables }, options);
  }

  /**
   * Execute a GraphQL mutation
   */
  async mutation<T = unknown>(
    mutation: string,
    variables?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<GraphQLResponse<T>> {
    return this.execute<T>({ query: mutation, variables }, options);
  }

  /**
   * Execute a GraphQL request
   */
  async execute<T = unknown>(
    request: GraphQLRequest,
    options?: RequestOptions
  ): Promise<GraphQLResponse<T>> {
    this.validateRequest(request);

    const response = await this.request<GraphQLResponse<T>>(request, options);

    // Track rate limit information from extensions
    if (response.extensions?.cost) {
      this.rateLimitStatus = {
        maximumAvailable: response.extensions.cost.throttleStatus.maximumAvailable,
        currentlyAvailable: response.extensions.cost.throttleStatus.currentlyAvailable,
        restoreRate: response.extensions.cost.throttleStatus.restoreRate,
        requestedQueryCost: response.extensions.cost.requestedQueryCost,
        actualQueryCost: response.extensions.cost.actualQueryCost,
      };
    }

    return response;
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus | null {
    return this.rateLimitStatus;
  }

  /**
   * Get rate limit info using a query
   */
  async getRateLimit(options?: RequestOptions): Promise<RateLimitInfo> {
    const query = `
      query {
        rateLimit {
          limit
          cost
          remaining
          resetAt
          nodeCount
        }
      }
    `;

    const response = await this.query<{ rateLimit: RateLimitInfo }>(query, undefined, options);

    if (!response.data?.rateLimit) {
      throw new Error('Failed to retrieve rate limit information');
    }

    return response.data.rateLimit;
  }

  /**
   * Execute a paginated query
   *
   * Automatically fetches all pages using cursor-based pagination
   */
  async *paginate<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: {
      pageSize?: number;
      maxPages?: number;
      requestOptions?: RequestOptions;
    }
  ): AsyncGenerator<T[], void, unknown> {
    const pageSize = options?.pageSize || 100;
    const maxPages = options?.maxPages || Infinity;
    let hasNextPage = true;
    let endCursor: string | null = null;
    let pageCount = 0;

    while (hasNextPage && pageCount < maxPages) {
      const paginatedVariables = {
        ...variables,
        first: pageSize,
        after: endCursor,
      };

      const response = await this.query<{
        [key: string]: {
          pageInfo: {
            hasNextPage: boolean;
            endCursor: string | null;
          };
          nodes: T[];
        };
      }>(query, paginatedVariables, options?.requestOptions);

      if (response.errors && response.errors.length > 0) {
        throw new Error(`GraphQL query failed: ${response.errors[0].message}`);
      }

      if (!response.data) {
        break;
      }

      // Find the first connection in the response
      const connection = Object.values(response.data).find(
        (value): value is { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: T[] } =>
          typeof value === 'object' &&
          value !== null &&
          'pageInfo' in value &&
          'nodes' in value
      );

      if (!connection) {
        break;
      }

      yield connection.nodes;

      hasNextPage = connection.pageInfo.hasNextPage;
      endCursor = connection.pageInfo.endCursor;
      pageCount++;
    }
  }

  /**
   * Validate GraphQL request
   */
  private validateRequest(request: GraphQLRequest): void {
    if (!request) {
      throw new Error('Request is required');
    }

    if (!request.query || typeof request.query !== 'string' || request.query.trim() === '') {
      throw new Error('Query is required and must be a non-empty string');
    }

    if (request.variables !== undefined && typeof request.variables !== 'object') {
      throw new Error('Variables must be an object');
    }

    if (request.operationName !== undefined && typeof request.operationName !== 'string') {
      throw new Error('Operation name must be a string');
    }
  }

  /**
   * Make an HTTP request to the GraphQL endpoint
   */
  private async request<T>(
    body: GraphQLRequest,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}/graphql`;
    const controller = new AbortController();
    const signal = options?.signal || controller.signal;

    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        body: JSON.stringify(body),
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.message || `GitHub GraphQL API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Check for GraphQL errors
      if (data.errors && data.errors.length > 0) {
        // Return the response even with errors, let the caller handle them
        return data as T;
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
      }

      throw error;
    }
  }

  /**
   * Create a batch request
   *
   * Combines multiple queries into a single request using aliases
   */
  createBatchRequest(queries: Array<{ alias: string; query: string }>): string {
    return queries
      .map(({ alias, query }) => {
        const trimmedQuery = query.trim();
        // Remove outer braces if present
        const innerQuery = trimmedQuery.startsWith('{') && trimmedQuery.endsWith('}')
          ? trimmedQuery.slice(1, -1)
          : trimmedQuery;
        return `${alias}: ${innerQuery}`;
      })
      .join('\n');
  }

  /**
   * Parse batch response
   *
   * Extracts individual query results from a batch request response
   */
  parseBatchResponse<T extends Record<string, unknown>>(
    response: GraphQLResponse<T>
  ): Map<string, unknown> {
    const results = new Map<string, unknown>();

    if (response.data) {
      for (const [key, value] of Object.entries(response.data)) {
        results.set(key, value);
      }
    }

    return results;
  }
}

/**
 * Create a GraphQL client instance
 */
export function createGraphQLClient(baseUrl: string, token: string): GraphQLClient {
  return new GraphQLClient(baseUrl, token);
}

/**
 * Common GraphQL query fragments
 */
export const fragments = {
  /**
   * Repository fields fragment
   */
  repository: `
    fragment RepositoryFields on Repository {
      id
      name
      nameWithOwner
      description
      url
      createdAt
      updatedAt
      pushedAt
      isFork
      isPrivate
      isArchived
      stargazerCount
      forkCount
      watchers {
        totalCount
      }
      primaryLanguage {
        name
        color
      }
    }
  `,

  /**
   * User fields fragment
   */
  user: `
    fragment UserFields on User {
      id
      login
      name
      email
      avatarUrl
      bio
      company
      location
      websiteUrl
      createdAt
      updatedAt
    }
  `,

  /**
   * Issue fields fragment
   */
  issue: `
    fragment IssueFields on Issue {
      id
      number
      title
      body
      state
      createdAt
      updatedAt
      closedAt
      url
      author {
        login
      }
      labels(first: 10) {
        nodes {
          id
          name
          color
          description
        }
      }
    }
  `,

  /**
   * Pull request fields fragment
   */
  pullRequest: `
    fragment PullRequestFields on PullRequest {
      id
      number
      title
      body
      state
      createdAt
      updatedAt
      closedAt
      mergedAt
      url
      author {
        login
      }
      baseRefName
      headRefName
      merged
      mergeable
      additions
      deletions
      changedFiles
    }
  `,
};

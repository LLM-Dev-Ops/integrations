/**
 * Search service implementation following SPARC specification.
 *
 * Provides JQL search functionality with pagination.
 */

import { JiraClient } from '../client/index.js';
import { JiraIssue, SearchResult } from '../types/index.js';
import { InvalidJqlError } from '../errors/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// Search Service Interface
// ============================================================================

/**
 * Search options.
 */
export interface SearchOptions {
  /** Start index for pagination (default: 0) */
  startAt?: number;
  /** Maximum results to return (default: 50, max: 100) */
  maxResults?: number;
  /** Fields to include in response */
  fields?: string[];
  /** Expand options */
  expand?: string[];
  /** Validate JQL syntax before executing */
  validateQuery?: boolean;
  /** Properties to include */
  properties?: string[];
}

/**
 * Paginated search result.
 */
export interface PaginatedSearchResult extends SearchResult {
  /** Whether this is the last page */
  isLast: boolean;
  /** Get next page (if available) */
  nextPage?: () => Promise<PaginatedSearchResult>;
}

/**
 * Search service interface.
 */
export interface SearchService {
  /** Search issues using JQL */
  search(jql: string, options?: SearchOptions): Promise<PaginatedSearchResult>;
  /** Search and return all matching issues */
  searchAll(jql: string, options?: Omit<SearchOptions, 'startAt' | 'maxResults'>): Promise<JiraIssue[]>;
  /** Validate JQL syntax */
  validateJql(jql: string): Promise<boolean>;
  /** Get field definitions */
  getFields(): Promise<FieldDefinition[]>;
}

/**
 * Field definition from Jira.
 */
export interface FieldDefinition {
  /** Field ID */
  id: string;
  /** Field name */
  name: string;
  /** Whether it's a custom field */
  custom: boolean;
  /** Whether it's orderable */
  orderable: boolean;
  /** Whether it's navigable */
  navigable: boolean;
  /** Whether it's searchable */
  searchable: boolean;
  /** Schema information */
  schema?: {
    type: string;
    system?: string;
    custom?: string;
    customId?: number;
  };
}

// ============================================================================
// JQL Validation
// ============================================================================

/**
 * Dangerous patterns that could indicate JQL injection.
 */
const DANGEROUS_PATTERNS = [
  /\/\*/,     // SQL-style comments
  /\*\//,     // SQL-style comments
  /;/,        // Statement separator
  /\bUNION\b/i,
  /\bSELECT\b/i,
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
];

/**
 * Validates JQL for potential injection attacks.
 */
function validateJqlSafety(jql: string): void {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(jql)) {
      throw new InvalidJqlError(jql, 'JQL contains potentially dangerous pattern');
    }
  }

  if (jql.length > 10000) {
    throw new InvalidJqlError(jql, 'JQL query exceeds maximum length');
  }

  // Check for balanced parentheses
  let depth = 0;
  for (const char of jql) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) {
      throw new InvalidJqlError(jql, 'Unbalanced parentheses in JQL');
    }
  }
  if (depth !== 0) {
    throw new InvalidJqlError(jql, 'Unbalanced parentheses in JQL');
  }

  // Check for balanced quotes
  const singleQuotes = (jql.match(/'/g) || []).length;
  const doubleQuotes = (jql.match(/"/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    throw new InvalidJqlError(jql, 'Unbalanced single quotes in JQL');
  }
  if (doubleQuotes % 2 !== 0) {
    throw new InvalidJqlError(jql, 'Unbalanced double quotes in JQL');
  }
}

// ============================================================================
// Search Service Implementation
// ============================================================================

/**
 * Search service implementation.
 */
export class SearchServiceImpl implements SearchService {
  private readonly client: JiraClient;
  private fieldsCache: FieldDefinition[] | null = null;
  private fieldsCacheTime: number = 0;

  constructor(client: JiraClient) {
    this.client = client;
  }

  /**
   * Searches issues using JQL.
   */
  async search(jql: string, options: SearchOptions = {}): Promise<PaginatedSearchResult> {
    return this.client.tracer.withSpan(
      'jira.search',
      async (span) => {
        span.setAttribute('jql_length', jql.length);

        // Validate JQL
        if (options.validateQuery !== false) {
          validateJqlSafety(jql);
        }

        const startAt = options.startAt ?? 0;
        const maxResults = Math.min(options.maxResults ?? 50, 100);

        const body: Record<string, unknown> = {
          jql,
          startAt,
          maxResults,
        };

        if (options.fields?.length) {
          body.fields = options.fields;
        }

        if (options.expand?.length) {
          body.expand = options.expand;
        }

        if (options.properties?.length) {
          body.properties = options.properties;
        }

        const result = await this.client.post<SearchResult>('/search', body);

        span.setAttribute('result_count', result.issues.length);
        span.setAttribute('total', result.total);

        this.client.metrics.increment(MetricNames.SEARCH_QUERIES_TOTAL);
        this.client.metrics.increment(MetricNames.SEARCH_RESULTS_TOTAL, result.issues.length);

        const isLast = startAt + result.issues.length >= result.total;

        const paginatedResult: PaginatedSearchResult = {
          ...result,
          isLast,
        };

        // Add next page function if not last
        if (!isLast) {
          paginatedResult.nextPage = () =>
            this.search(jql, {
              ...options,
              startAt: startAt + maxResults,
            });
        }

        return paginatedResult;
      },
      { operation: 'search' }
    );
  }

  /**
   * Searches and returns all matching issues.
   */
  async searchAll(
    jql: string,
    options: Omit<SearchOptions, 'startAt' | 'maxResults'> = {}
  ): Promise<JiraIssue[]> {
    return this.client.tracer.withSpan(
      'jira.searchAll',
      async (span) => {
        span.setAttribute('jql_length', jql.length);

        const allIssues: JiraIssue[] = [];
        let startAt = 0;
        const maxResults = 100;

        while (true) {
          const result = await this.search(jql, {
            ...options,
            startAt,
            maxResults,
          });

          allIssues.push(...result.issues);

          if (result.isLast) {
            break;
          }

          startAt += maxResults;
        }

        span.setAttribute('total_issues', allIssues.length);
        this.client.logger.debug('Search all completed', { total: allIssues.length });

        return allIssues;
      },
      { operation: 'searchAll' }
    );
  }

  /**
   * Validates JQL syntax.
   */
  async validateJql(jql: string): Promise<boolean> {
    try {
      validateJqlSafety(jql);

      // Use Jira's JQL validation endpoint
      await this.client.post<{ queries: unknown[] }>('/jql/parse', {
        queries: [jql],
      });

      return true;
    } catch (error) {
      if (error instanceof InvalidJqlError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets field definitions from Jira.
   */
  async getFields(): Promise<FieldDefinition[]> {
    const cacheConfig = this.client.configuration.cacheConfig;
    const now = Date.now();

    // Return cached fields if still valid
    if (cacheConfig.enabled && this.fieldsCache && now - this.fieldsCacheTime < cacheConfig.fieldsTtlMs) {
      return this.fieldsCache;
    }

    const fields = await this.client.get<FieldDefinition[]>('/field');

    // Update cache
    if (cacheConfig.enabled) {
      this.fieldsCache = fields;
      this.fieldsCacheTime = now;
    }

    return fields;
  }
}

/**
 * Creates a search service instance.
 */
export function createSearchService(client: JiraClient): SearchService {
  return new SearchServiceImpl(client);
}

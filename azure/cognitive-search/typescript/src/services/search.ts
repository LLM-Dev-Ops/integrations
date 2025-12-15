/**
 * Azure Cognitive Search - Search Service
 *
 * Provides vector, keyword, hybrid, and semantic search capabilities.
 */

import type { HttpTransport } from '../transport/index.js';
import type {
  VectorSearchRequest,
  KeywordSearchRequest,
  HybridSearchRequest,
  SemanticSearchRequest,
  SuggestRequest,
  AutocompleteRequest,
  SearchResults,
  SearchResult,
  SuggestResults,
  AutocompleteResults,
  Caption,
  Answer,
  FacetValue,
} from '../types/index.js';

/** Raw Azure search response */
interface AzureSearchResponse {
  '@odata.count'?: number;
  '@odata.nextLink'?: string;
  '@search.facets'?: Record<string, Array<{ value: unknown; count: number }>>;
  '@search.answers'?: Array<{
    text: string;
    highlights?: string;
    score: number;
    key?: string;
  }>;
  value: Array<{
    '@search.score': number;
    '@search.rerankerScore'?: number;
    '@search.highlights'?: Record<string, string[]>;
    '@search.captions'?: Array<{ text: string; highlights?: string }>;
    [key: string]: unknown;
  }>;
}

/** Raw Azure suggest response */
interface AzureSuggestResponse {
  value: Array<{
    '@search.text': string;
    [key: string]: unknown;
  }>;
}

/** Raw Azure autocomplete response */
interface AzureAutocompleteResponse {
  value: Array<{
    text: string;
    queryPlusText: string;
  }>;
}

/**
 * Search service for Azure Cognitive Search
 */
export class SearchService {
  private readonly transport: HttpTransport;
  private readonly keyFieldMap: Map<string, string> = new Map();

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  /**
   * Set the key field for an index (used for result ID extraction)
   */
  setKeyField(index: string, keyField: string): void {
    this.keyFieldMap.set(index, keyField);
  }

  /**
   * Perform vector search (pure k-NN)
   */
  async vectorSearch(request: VectorSearchRequest): Promise<SearchResults> {
    const body = this.buildVectorSearchBody(request);
    return this.executeSearch(request.index, body);
  }

  /**
   * Perform keyword search (simple or full Lucene)
   */
  async keywordSearch(request: KeywordSearchRequest): Promise<SearchResults> {
    const body = this.buildKeywordSearchBody(request);
    return this.executeSearch(request.index, body);
  }

  /**
   * Perform hybrid search (vector + keyword with RRF fusion)
   */
  async hybridSearch(request: HybridSearchRequest): Promise<SearchResults> {
    const body = this.buildHybridSearchBody(request);
    return this.executeSearch(request.index, body);
  }

  /**
   * Perform semantic search with reranking
   */
  async semanticSearch(request: SemanticSearchRequest): Promise<SearchResults> {
    const body = this.buildSemanticSearchBody(request);
    return this.executeSearch(request.index, body);
  }

  /**
   * Get suggestions based on partial text
   */
  async suggest(request: SuggestRequest): Promise<SuggestResults> {
    const body = {
      search: request.searchText,
      suggesterName: request.suggesterName,
      filter: request.filter,
      select: request.select?.join(','),
      top: request.top ?? 5,
      fuzzy: request.fuzzy ?? false,
      highlightPreTag: request.highlightPreTag,
      highlightPostTag: request.highlightPostTag,
    };

    const response = await this.transport.request<AzureSuggestResponse>({
      method: 'POST',
      path: `/indexes/${encodeURIComponent(request.index)}/docs/suggest`,
      body,
      timeout: request.timeout,
      signal: request.signal,
    });

    return this.parseSuggestResults(response.data);
  }

  /**
   * Get autocomplete suggestions
   */
  async autocomplete(request: AutocompleteRequest): Promise<AutocompleteResults> {
    const body = {
      search: request.searchText,
      suggesterName: request.suggesterName,
      autocompleteMode: request.autocompleteMode ?? 'oneTerm',
      filter: request.filter,
      top: request.top ?? 5,
      fuzzy: request.fuzzy ?? false,
    };

    const response = await this.transport.request<AzureAutocompleteResponse>({
      method: 'POST',
      path: `/indexes/${encodeURIComponent(request.index)}/docs/autocomplete`,
      body,
      timeout: request.timeout,
      signal: request.signal,
    });

    return {
      results: response.data.value.map((item) => ({
        text: item.text,
        queryPlusText: item.queryPlusText,
      })),
    };
  }

  // ========================================================================
  // Private Methods - Request Body Builders
  // ========================================================================

  private buildVectorSearchBody(request: VectorSearchRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      vectorQueries: [
        {
          kind: 'vector',
          vector: request.vector,
          fields: request.vectorField,
          k: request.k,
          exhaustive: request.exhaustive ?? false,
        },
      ],
      select: request.select?.join(','),
      filter: request.filter,
      top: request.k,
      count: request.includeCount ?? false,
    };

    if (request.scoringProfile) {
      body['scoringProfile'] = request.scoringProfile;
    }

    if (request.facets && request.facets.length > 0) {
      body['facets'] = request.facets;
    }

    return body;
  }

  private buildKeywordSearchBody(request: KeywordSearchRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      search: request.query,
      searchMode: request.searchMode ?? 'any',
      queryType: request.queryType ?? 'simple',
      searchFields: request.searchFields?.join(','),
      select: request.select?.join(','),
      filter: request.filter,
      orderby: request.orderBy,
      top: request.top ?? 10,
      skip: request.skip ?? 0,
      count: request.includeCount ?? false,
    };

    if (request.highlightFields && request.highlightFields.length > 0) {
      body['highlight'] = request.highlightFields.join(',');
      body['highlightPreTag'] = request.highlightPreTag ?? '<em>';
      body['highlightPostTag'] = request.highlightPostTag ?? '</em>';
    }

    if (request.scoringProfile) {
      body['scoringProfile'] = request.scoringProfile;
    }

    if (request.facets && request.facets.length > 0) {
      body['facets'] = request.facets;
    }

    return body;
  }

  private buildHybridSearchBody(request: HybridSearchRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      search: request.keywordQuery,
      searchMode: 'any',
      searchFields: request.searchFields?.join(','),
      vectorQueries: [
        {
          kind: 'vector',
          vector: request.vector,
          fields: request.vectorField,
          k: request.k,
        },
      ],
      select: request.select?.join(','),
      filter: request.filter,
      top: request.top ?? 10,
      count: request.includeCount ?? false,
    };

    // Add semantic reranking if configured
    if (request.semanticConfig) {
      body['queryType'] = 'semantic';
      body['semanticConfiguration'] = request.semanticConfig;
    }

    if (request.scoringProfile) {
      body['scoringProfile'] = request.scoringProfile;
    }

    if (request.facets && request.facets.length > 0) {
      body['facets'] = request.facets;
    }

    return body;
  }

  private buildSemanticSearchBody(request: SemanticSearchRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      search: request.query,
      queryType: 'semantic',
      semanticConfiguration: request.semanticConfig,
      select: request.select?.join(','),
      filter: request.filter,
      top: request.top ?? 10,
      count: request.includeCount ?? false,
    };

    // Add captions
    if (request.captions && request.captions !== 'none') {
      body['captions'] = request.captions;
    }

    // Add answers
    if (request.answers && request.answers !== 'none') {
      body['answers'] = request.answers;
      if (request.answerCount) {
        body['answersCount'] = request.answerCount;
      }
    }

    // Add vector search for hybrid semantic
    if (request.vector && request.vectorField) {
      body['vectorQueries'] = [
        {
          kind: 'vector',
          vector: request.vector,
          fields: request.vectorField,
          k: request.k ?? 50,
        },
      ];
    }

    return body;
  }

  // ========================================================================
  // Private Methods - Execution & Parsing
  // ========================================================================

  private async executeSearch(index: string, body: Record<string, unknown>): Promise<SearchResults> {
    const response = await this.transport.request<AzureSearchResponse>({
      method: 'POST',
      path: `/indexes/${encodeURIComponent(index)}/docs/search`,
      body,
    });

    return this.parseSearchResults(index, response.data);
  }

  private parseSearchResults(index: string, data: AzureSearchResponse): SearchResults {
    const keyField = this.keyFieldMap.get(index) ?? 'id';

    const results: SearchResult[] = data.value.map((item) => {
      // Extract search-specific fields
      const score = item['@search.score'];
      const rerankerScore = item['@search.rerankerScore'];
      const highlights = item['@search.highlights'];
      const searchCaptions = item['@search.captions'];

      // Build document without search fields
      const document: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        if (!key.startsWith('@search.')) {
          document[key] = value;
        }
      }

      // Extract ID from document
      const id = String(document[keyField] ?? document['id'] ?? '');

      // Parse captions
      let captions: Caption[] | undefined;
      if (searchCaptions && searchCaptions.length > 0) {
        captions = searchCaptions.map((c) => ({
          text: c.text,
          highlights: c.highlights,
        }));
      }

      return {
        id,
        score,
        rerankerScore,
        highlights,
        captions,
        document,
      };
    });

    // Parse facets
    let facets: Record<string, FacetValue[]> | undefined;
    if (data['@search.facets']) {
      facets = {};
      for (const [field, values] of Object.entries(data['@search.facets'])) {
        facets[field] = values.map((v) => ({
          value: v.value as string | number | boolean,
          count: v.count,
        }));
      }
    }

    // Parse answers
    let answers: Answer[] | undefined;
    if (data['@search.answers'] && data['@search.answers'].length > 0) {
      answers = data['@search.answers'].map((a) => ({
        text: a.text,
        highlights: a.highlights,
        score: a.score,
        key: a.key,
      }));
    }

    return {
      results,
      count: data['@odata.count'],
      facets,
      answers,
      nextLink: data['@odata.nextLink'],
    };
  }

  private parseSuggestResults(data: AzureSuggestResponse): SuggestResults {
    return {
      results: data.value.map((item) => {
        const text = item['@search.text'];
        const document: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(item)) {
          if (!key.startsWith('@search.')) {
            document[key] = value;
          }
        }
        return { text, document };
      }),
    };
  }
}

/** Create a search service */
export function createSearchService(transport: HttpTransport): SearchService {
  return new SearchService(transport);
}

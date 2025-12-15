/**
 * Azure Cognitive Search - Query Builders
 *
 * Fluent API for building search queries.
 */

import type { SearchService } from '../services/search.js';
import type {
  SearchResults,
  VectorSearchRequest,
  KeywordSearchRequest,
  HybridSearchRequest,
} from '../types/index.js';

/**
 * Base query builder with common options
 */
abstract class BaseQueryBuilder<T extends BaseQueryBuilder<T>> {
  protected _index: string;
  protected _filter?: string;
  protected _select: string[] = [];
  protected _top?: number;
  protected _skip?: number;
  protected _includeCount = false;
  protected _scoringProfile?: string;
  protected _facets: string[] = [];
  protected _timeout?: number;
  protected _signal?: AbortSignal;

  constructor(index: string) {
    this._index = index;
  }

  /** Add OData filter expression */
  filter(expression: string): T {
    this._filter = expression;
    return this as unknown as T;
  }

  /** Select specific fields */
  select(fields: string[]): T {
    this._select = fields;
    return this as unknown as T;
  }

  /** Limit number of results */
  top(n: number): T {
    this._top = n;
    return this as unknown as T;
  }

  /** Skip results for pagination */
  skip(n: number): T {
    this._skip = n;
    return this as unknown as T;
  }

  /** Include total count in results */
  includeCount(include = true): T {
    this._includeCount = include;
    return this as unknown as T;
  }

  /** Apply a scoring profile */
  scoringProfile(profile: string): T {
    this._scoringProfile = profile;
    return this as unknown as T;
  }

  /** Add facets */
  facets(facets: string[]): T {
    this._facets = facets;
    return this as unknown as T;
  }

  /** Set request timeout */
  timeout(ms: number): T {
    this._timeout = ms;
    return this as unknown as T;
  }

  /** Set abort signal */
  signal(signal: AbortSignal): T {
    this._signal = signal;
    return this as unknown as T;
  }
}

/**
 * Vector search query builder
 */
export class VectorQueryBuilder extends BaseQueryBuilder<VectorQueryBuilder> {
  private readonly searchService: SearchService;
  private _vector: number[];
  private _vectorField: string;
  private _k: number;
  private _exhaustive = false;

  constructor(searchService: SearchService, index: string, vector: number[]) {
    super(index);
    this.searchService = searchService;
    this._vector = vector;
    this._vectorField = 'contentVector';
    this._k = 10;
  }

  /** Set the vector field to search */
  field(field: string): this {
    this._vectorField = field;
    return this;
  }

  /** Set number of nearest neighbors */
  k(k: number): this {
    this._k = k;
    return this;
  }

  /** Use exhaustive KNN instead of approximate */
  exhaustive(value = true): this {
    this._exhaustive = value;
    return this;
  }

  /** Execute the search */
  async execute(): Promise<SearchResults> {
    const request: VectorSearchRequest = {
      index: this._index,
      vector: this._vector,
      vectorField: this._vectorField,
      k: this._k,
      exhaustive: this._exhaustive,
      filter: this._filter,
      select: this._select.length > 0 ? this._select : undefined,
      top: this._top,
      skip: this._skip,
      includeCount: this._includeCount,
      scoringProfile: this._scoringProfile,
      facets: this._facets.length > 0 ? this._facets : undefined,
      timeout: this._timeout,
      signal: this._signal,
    };

    return this.searchService.vectorSearch(request);
  }
}

/**
 * Keyword search query builder
 */
export class KeywordQueryBuilder extends BaseQueryBuilder<KeywordQueryBuilder> {
  private readonly searchService: SearchService;
  private _query: string;
  private _searchFields?: string[];
  private _queryType: 'simple' | 'full' = 'simple';
  private _searchMode: 'any' | 'all' = 'any';
  private _highlightFields?: string[];
  private _highlightPreTag?: string;
  private _highlightPostTag?: string;
  private _orderBy?: string;

  constructor(searchService: SearchService, index: string, query: string) {
    super(index);
    this.searchService = searchService;
    this._query = query;
    this._top = 10;
  }

  /** Set fields to search in */
  searchFields(fields: string[]): this {
    this._searchFields = fields;
    return this;
  }

  /** Use full Lucene query syntax */
  fullSyntax(): this {
    this._queryType = 'full';
    return this;
  }

  /** Require all terms to match */
  matchAll(): this {
    this._searchMode = 'all';
    return this;
  }

  /** Highlight matching content */
  highlight(fields: string[], preTag = '<em>', postTag = '</em>'): this {
    this._highlightFields = fields;
    this._highlightPreTag = preTag;
    this._highlightPostTag = postTag;
    return this;
  }

  /** Order results */
  orderBy(expression: string): this {
    this._orderBy = expression;
    return this;
  }

  /** Execute the search */
  async execute(): Promise<SearchResults> {
    const request: KeywordSearchRequest = {
      index: this._index,
      query: this._query,
      searchFields: this._searchFields,
      queryType: this._queryType,
      searchMode: this._searchMode,
      filter: this._filter,
      select: this._select.length > 0 ? this._select : undefined,
      top: this._top ?? 10,
      skip: this._skip ?? 0,
      includeCount: this._includeCount,
      scoringProfile: this._scoringProfile,
      facets: this._facets.length > 0 ? this._facets : undefined,
      highlightFields: this._highlightFields,
      highlightPreTag: this._highlightPreTag,
      highlightPostTag: this._highlightPostTag,
      orderBy: this._orderBy,
      timeout: this._timeout,
      signal: this._signal,
    };

    return this.searchService.keywordSearch(request);
  }
}

/**
 * Hybrid search query builder
 */
export class HybridQueryBuilder extends BaseQueryBuilder<HybridQueryBuilder> {
  private readonly searchService: SearchService;
  private _keywordQuery: string;
  private _vector: number[];
  private _vectorField: string;
  private _searchFields?: string[];
  private _k: number;
  private _semanticConfig?: string;

  constructor(searchService: SearchService, index: string, keywordQuery: string, vector: number[]) {
    super(index);
    this.searchService = searchService;
    this._keywordQuery = keywordQuery;
    this._vector = vector;
    this._vectorField = 'contentVector';
    this._k = 50;
    this._top = 10;
  }

  /** Set the vector field */
  vectorField(field: string): this {
    this._vectorField = field;
    return this;
  }

  /** Set fields to search for keywords */
  searchFields(fields: string[]): this {
    this._searchFields = fields;
    return this;
  }

  /** Set k for vector search */
  k(k: number): this {
    this._k = k;
    return this;
  }

  /** Enable semantic reranking */
  semanticConfig(config: string): this {
    this._semanticConfig = config;
    return this;
  }

  /** Execute the search */
  async execute(): Promise<SearchResults> {
    const request: HybridSearchRequest = {
      index: this._index,
      keywordQuery: this._keywordQuery,
      vector: this._vector,
      vectorField: this._vectorField,
      k: this._k,
      searchFields: this._searchFields,
      filter: this._filter,
      select: this._select.length > 0 ? this._select : undefined,
      top: this._top ?? 10,
      skip: this._skip,
      includeCount: this._includeCount,
      scoringProfile: this._scoringProfile,
      facets: this._facets.length > 0 ? this._facets : undefined,
      semanticConfig: this._semanticConfig,
      timeout: this._timeout,
      signal: this._signal,
    };

    return this.searchService.hybridSearch(request);
  }
}

/**
 * Index-bound search builder factory
 */
export class IndexBoundSearchBuilder {
  private readonly searchService: SearchService;
  private readonly index: string;

  constructor(searchService: SearchService, index: string) {
    this.searchService = searchService;
    this.index = index;
  }

  /** Start a vector search */
  vector(vector: number[]): VectorQueryBuilder {
    return new VectorQueryBuilder(this.searchService, this.index, vector);
  }

  /** Start a keyword search */
  keyword(query: string): KeywordQueryBuilder {
    return new KeywordQueryBuilder(this.searchService, this.index, query);
  }

  /** Start a hybrid search */
  hybrid(query: string, vector: number[]): HybridQueryBuilder {
    return new HybridQueryBuilder(this.searchService, this.index, query, vector);
  }
}

/** Create an index-bound search builder */
export function inIndex(searchService: SearchService, index: string): IndexBoundSearchBuilder {
  return new IndexBoundSearchBuilder(searchService, index);
}

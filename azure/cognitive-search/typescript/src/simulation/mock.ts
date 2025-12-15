/**
 * Azure Cognitive Search Mock Client
 *
 * Mock implementation for testing without live Azure services.
 */

import type { SearchResults, SearchResult, SuggestResults, AutocompleteResults, Document } from '../types/index.js';
import type { BatchIndexResult, IndexResult } from '../types/responses.js';

/** Search pattern for matching requests */
export interface SearchPattern {
  type: 'vector' | 'keyword' | 'hybrid' | 'semantic';
  index?: string;
  query?: string;
  vectorLength?: number;
}

/** Mock search service */
export class MockSearchService {
  private responses: Map<string, SearchResults> = new Map();

  /** Configure a response for a pattern */
  when(pattern: SearchPattern): MockResponseBuilder {
    return new MockResponseBuilder(this, pattern);
  }

  /** Register a response */
  registerResponse(pattern: SearchPattern, response: SearchResults): void {
    const key = this.patternKey(pattern);
    this.responses.set(key, response);
  }

  /** Get response for pattern */
  getResponse(pattern: SearchPattern): SearchResults | undefined {
    // Try exact match first
    const exactKey = this.patternKey(pattern);
    const exact = this.responses.get(exactKey);
    if (exact) return exact;

    // Try without index
    const withoutIndex = this.patternKey({ ...pattern, index: undefined });
    return this.responses.get(withoutIndex);
  }

  /** Execute a mock vector search */
  async vectorSearch(index: string, vector: number[]): Promise<SearchResults> {
    const pattern: SearchPattern = { type: 'vector', index, vectorLength: vector.length };
    const response = this.getResponse(pattern);
    return response ?? this.emptyResults();
  }

  /** Execute a mock keyword search */
  async keywordSearch(index: string, query: string): Promise<SearchResults> {
    const pattern: SearchPattern = { type: 'keyword', index, query };
    const response = this.getResponse(pattern);
    return response ?? this.emptyResults();
  }

  /** Execute a mock hybrid search */
  async hybridSearch(index: string, query: string, vector: number[]): Promise<SearchResults> {
    const pattern: SearchPattern = { type: 'hybrid', index, query, vectorLength: vector.length };
    const response = this.getResponse(pattern);
    return response ?? this.emptyResults();
  }

  /** Reset all mocked responses */
  reset(): void {
    this.responses.clear();
  }

  private patternKey(pattern: SearchPattern): string {
    const parts: string[] = [pattern.type];
    if (pattern.index) parts.push(`index:${pattern.index}`);
    if (pattern.query) parts.push(`query:${pattern.query}`);
    if (pattern.vectorLength) parts.push(`veclen:${pattern.vectorLength}`);
    return parts.join('|');
  }

  private emptyResults(): SearchResults {
    return { results: [] };
  }
}

/** Builder for mock responses */
export class MockResponseBuilder {
  private readonly service: MockSearchService;
  private readonly pattern: SearchPattern;

  constructor(service: MockSearchService, pattern: SearchPattern) {
    this.service = service;
    this.pattern = pattern;
  }

  /** Return specific results */
  thenReturn(results: SearchResults): void {
    this.service.registerResponse(this.pattern, results);
  }

  /** Return empty results */
  thenReturnEmpty(): void {
    this.service.registerResponse(this.pattern, { results: [] });
  }

  /** Return a single result */
  thenReturnOne(result: SearchResult): void {
    this.service.registerResponse(this.pattern, { results: [result] });
  }
}

/** Mock document service */
export class MockDocumentService {
  private documents: Map<string, Map<string, Document>> = new Map();
  private indexResults: Map<string, BatchIndexResult> = new Map();

  /** Store a document */
  setDocument(index: string, key: string, document: Document): void {
    let indexDocs = this.documents.get(index);
    if (!indexDocs) {
      indexDocs = new Map();
      this.documents.set(index, indexDocs);
    }
    indexDocs.set(key, document);
  }

  /** Get a document */
  async lookup(index: string, key: string): Promise<Document | null> {
    const indexDocs = this.documents.get(index);
    return indexDocs?.get(key) ?? null;
  }

  /** Configure batch index result */
  setBatchResult(index: string, result: BatchIndexResult): void {
    this.indexResults.set(index, result);
  }

  /** Execute mock batch index */
  async indexBatch(index: string, count: number): Promise<BatchIndexResult> {
    const configured = this.indexResults.get(index);
    if (configured) return configured;

    // Default success
    const results: IndexResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push({
        key: `doc-${i}`,
        succeeded: true,
        statusCode: 201,
      });
    }

    return {
      results,
      successCount: count,
      failureCount: 0,
    };
  }

  /** Reset all mocked data */
  reset(): void {
    this.documents.clear();
    this.indexResults.clear();
  }
}

/** Mock ACS client for testing */
export class MockAcsClient {
  public readonly search: MockSearchService;
  public readonly documents: MockDocumentService;

  constructor() {
    this.search = new MockSearchService();
    this.documents = new MockDocumentService();
  }

  /** Reset all mocked data */
  reset(): void {
    this.search.reset();
    this.documents.reset();
  }

  /** Create with preset search response */
  withSearchResponse(pattern: SearchPattern, results: SearchResults): this {
    this.search.registerResponse(pattern, results);
    return this;
  }

  /** Create with preset document */
  withDocument(index: string, key: string, document: Document): this {
    this.documents.setDocument(index, key, document);
    return this;
  }
}

/** Create a mock client */
export function createMockClient(): MockAcsClient {
  return new MockAcsClient();
}

/** Helper to create a mock search result */
export function mockSearchResult(
  id: string,
  score: number,
  document: Record<string, unknown>
): SearchResult {
  return { id, score, document };
}

/** Helper to create mock search results */
export function mockSearchResults(results: SearchResult[], count?: number): SearchResults {
  return {
    results,
    count,
  };
}

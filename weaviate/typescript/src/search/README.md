# Weaviate Search Module

Complete search operations service for the Weaviate TypeScript integration. Provides vector similarity search, semantic text search, hybrid search, and BM25 keyword search with comprehensive validation, observability, and result handling.

## Features

- **Vector Similarity Search** (`nearVector`) - Find objects similar to a query vector
- **Semantic Text Search** (`nearText`) - Search using natural language with automatic vectorization
- **Object Similarity Search** (`nearObject`) - Find objects similar to a reference object
- **Hybrid Search** (`hybrid`) - Combine BM25 keyword search with vector similarity
- **BM25 Keyword Search** (`bm25`) - Traditional keyword-based search
- **Paginated Iteration** - Efficiently process large result sets in chunks
- **Result Utilities** - Filter, sort, merge, and deduplicate search results
- **Full Observability** - Tracing, metrics, and logging for all operations
- **Resilience** - Built-in retry logic and circuit breakers
- **Validation** - Comprehensive input validation and schema checking

## Installation

```typescript
import {
  SearchService,
  createSearchIterator,
  filterByCertainty,
  sortByScore,
} from './search/index.js';
```

## Quick Start

### Creating a Search Service

```typescript
import { SearchService } from './search/index.js';

const searchService = new SearchService({
  graphqlExecutor,
  observability,
  schemaCache,
  resilience,
});
```

### Vector Search

```typescript
const results = await searchService.nearVector('Article', {
  vector: [0.1, 0.2, 0.3, ...], // Your embedding vector
  limit: 10,
  certainty: 0.7, // Minimum similarity threshold
  properties: ['title', 'content', 'author'],
  includeVector: false,
});

console.log(`Found ${results.objects.length} results`);
for (const hit of results.objects) {
  console.log(`${hit.properties.title} - certainty: ${hit.certainty}`);
}
```

### Text Semantic Search

```typescript
const results = await searchService.nearText('Article', {
  concepts: ['artificial intelligence', 'machine learning'],
  limit: 10,
  certainty: 0.7,
  properties: ['title', 'content'],
  moveTo: {
    concepts: ['deep learning'],
    force: 0.5,
  },
  moveAway: {
    concepts: ['basic programming'],
    force: 0.3,
  },
});
```

### Hybrid Search

```typescript
const results = await searchService.hybrid('Article', {
  query: 'machine learning tutorial',
  alpha: 0.5, // 50% vector, 50% BM25
  limit: 10,
  fusionType: FusionType.RankedFusion,
  properties: ['title', 'content'],
});
```

### BM25 Keyword Search

```typescript
const results = await searchService.bm25('Article', {
  query: 'machine learning',
  properties: ['title', 'content'], // Search in these fields
  limit: 10,
  returnProperties: ['title', 'author'],
});
```

### Object Similarity

```typescript
const results = await searchService.nearObject('Article', {
  id: '123e4567-e89b-12d3-a456-426614174000' as UUID,
  limit: 10,
  certainty: 0.7,
  properties: ['title', 'content'],
});
```

## Pagination

### Using Iterator

```typescript
const iterator = createSearchIterator(
  searchService,
  'Article',
  {
    vector: [0.1, 0.2, 0.3],
    limit: 100,
    properties: ['title'],
  },
  {
    pageSize: 20,
    maxResults: 100,
  }
);

// Automatic iteration
for await (const hits of iterator) {
  console.log(`Fetched ${hits.length} results`);
  for (const hit of hits) {
    console.log(`  - ${hit.properties.title}`);
  }
}
```

### Manual Pagination

```typescript
const iterator = createSearchIterator(searchService, 'Article', query, {
  pageSize: 20,
});

// Fetch first page
const firstPage = await iterator.next();
console.log(`First page: ${firstPage.value.length} results`);

// Fetch second page
const secondPage = await iterator.next();
console.log(`Second page: ${secondPage.value.length} results`);

// Check if more available
if (iterator.hasMore()) {
  console.log('More results available');
}
```

### Collect All Results

```typescript
// Warning: Loads all results into memory
const allResults = await iterator.collect();
console.log(`Total results: ${allResults.length}`);
```

## Result Processing

### Filtering

```typescript
import {
  filterByCertainty,
  filterByDistance,
  filterByScore,
} from './search/index.js';

// Filter by minimum certainty
const highQuality = filterByCertainty(results.objects, 0.8);

// Filter by maximum distance
const closeResults = filterByDistance(results.objects, 0.3);

// Filter by minimum score
const topScoring = filterByScore(results.objects, 0.9);
```

### Sorting

```typescript
import {
  sortByScore,
  sortByDistance,
  sortByProperty,
} from './search/index.js';

// Sort by relevance score (highest first)
const byScore = sortByScore(results.objects);

// Sort by distance (closest first)
const byDistance = sortByDistance(results.objects);

// Sort by property value
const byTitle = sortByProperty(results.objects, 'title', true);
```

### Deduplication and Merging

```typescript
import { deduplicateHits, mergeSearchResults } from './search/index.js';

// Remove duplicate results
const unique = deduplicateHits(results.objects);

// Merge multiple search results
const merged = mergeSearchResults([results1, results2], true);
```

## Advanced Features

### Multi-Tenant Search

```typescript
const results = await searchService.nearVector('Article', {
  vector: [0.1, 0.2, 0.3],
  limit: 10,
  tenant: 'tenant-123', // Specify tenant
  properties: ['title'],
});
```

### Search with Filters

```typescript
const results = await searchService.nearVector('Article', {
  vector: [0.1, 0.2, 0.3],
  limit: 10,
  filter: {
    operator: 'And',
    operands: [
      {
        operator: 'Equal',
        path: ['author'],
        value: { type: 'text', value: 'John Doe' },
      },
      {
        operator: 'GreaterThan',
        path: ['wordCount'],
        value: { type: 'int', value: 1000 },
      },
    ],
  },
  properties: ['title', 'author'],
});
```

### Grouped Results

```typescript
const results = await searchService.nearVector('Article', {
  vector: [0.1, 0.2, 0.3],
  limit: 10,
  groupBy: {
    path: ['category'],
    groups: 3, // Return top 3 groups
    objectsPerGroup: 5, // 5 objects per group
  },
  properties: ['title', 'category'],
});

if (results.groups) {
  for (const group of results.groups) {
    console.log(`Group: ${group.groupedBy.value}`);
    console.log(`  Objects: ${group.hits.length}`);
  }
}
```

### Adaptive Hybrid Search

```typescript
import { determineOptimalAlpha } from './search/hybrid.js';

const userQuery = 'comprehensive guide to neural networks';
const alpha = determineOptimalAlpha(userQuery); // Adaptive alpha based on query

const results = await searchService.hybrid('Article', {
  query: userQuery,
  alpha,
  limit: 10,
  fusionType: FusionType.RankedFusion,
});
```

## API Reference

### SearchService

Main service class for executing searches.

#### Methods

- `nearVector(className, query)` - Vector similarity search
- `nearObject(className, query)` - Object similarity search
- `nearText(className, query)` - Semantic text search
- `hybrid(className, query)` - Hybrid search (BM25 + vector)
- `bm25(className, query)` - BM25 keyword search

### SearchIterator

Iterator for paginated search results.

#### Methods

- `next()` - Fetch next page of results
- `hasMore()` - Check if more results available
- `reset()` - Reset to beginning
- `collect()` - Collect all remaining results
- `forEach(fn)` - Iterate through all results

### Utility Functions

#### Validation

- `validateVectorDimensions(vector, schema)` - Validate vector dimensions
- `validateVectorizer(className, schema)` - Validate text vectorizer
- `validateNearVectorQuery(query)` - Validate near vector query
- `validateNearTextQuery(query)` - Validate near text query
- `validateHybridQuery(query)` - Validate hybrid query

#### Query Building

- `buildNearVectorQuery(className, query)` - Build near vector GraphQL
- `buildNearTextQuery(className, query)` - Build near text GraphQL
- `buildHybridQuery(className, query)` - Build hybrid GraphQL

#### Result Processing

- `filterByCertainty(hits, minCertainty)` - Filter by certainty
- `filterByDistance(hits, maxDistance)` - Filter by distance
- `filterByScore(hits, minScore)` - Filter by score
- `sortByScore(hits, descending)` - Sort by score
- `sortByDistance(hits, ascending)` - Sort by distance
- `sortByProperty(hits, property, ascending)` - Sort by property
- `deduplicateHits(hits)` - Remove duplicates
- `mergeSearchResults(results, deduplicate)` - Merge results
- `paginateHits(hits, page, pageSize)` - Paginate results

## Types

### NearVectorQuery

```typescript
interface NearVectorQuery {
  className: string;
  vector: Vector;
  certainty?: number;
  distance?: number;
  limit: number;
  offset?: number;
  filter?: WhereFilter;
  properties?: string[];
  includeVector?: boolean;
  tenant?: string;
  groupBy?: GroupByConfig;
  autocut?: number;
}
```

### NearTextQuery

```typescript
interface NearTextQuery {
  className: string;
  concepts: string[];
  certainty?: number;
  distance?: number;
  moveTo?: MoveParams;
  moveAway?: MoveParams;
  limit: number;
  offset?: number;
  filter?: WhereFilter;
  properties?: string[];
  includeVector?: boolean;
  tenant?: string;
  groupBy?: GroupByConfig;
  autocut?: number;
}
```

### HybridQuery

```typescript
interface HybridQuery {
  className: string;
  query: string;
  vector?: Vector;
  alpha: number; // 0.0 = pure BM25, 1.0 = pure vector
  fusionType?: FusionType;
  limit: number;
  offset?: number;
  filter?: WhereFilter;
  properties?: string[];
  includeVector?: boolean;
  tenant?: string;
  searchProperties?: string[];
  groupBy?: GroupByConfig;
}
```

### BM25Query

```typescript
interface BM25Query {
  className: string;
  query: string;
  properties?: string[];
  limit: number;
  offset?: number;
  filter?: WhereFilter;
  returnProperties?: string[];
  includeVector?: boolean;
  tenant?: string;
  groupBy?: GroupByConfig;
}
```

### SearchResult

```typescript
interface SearchResult {
  objects: SearchHit[];
  totalCount?: number;
  groups?: SearchGroup[];
}
```

### SearchHit

```typescript
interface SearchHit {
  id: UUID;
  className: string;
  properties: Properties;
  vector?: Vector;
  score?: number;
  certainty?: number;
  distance?: number;
  explainScore?: string;
  additional?: Record<string, unknown>;
}
```

## Error Handling

```typescript
try {
  const results = await searchService.nearVector('Article', query);
} catch (error) {
  if (error instanceof Error) {
    console.error(`Search failed: ${error.message}`);

    if (error.message.includes('dimension')) {
      // Vector dimension mismatch
    } else if (error.message.includes('class not found')) {
      // Class does not exist
    } else if (error.message.includes('vectorizer')) {
      // Vectorizer not configured
    }
  }
}
```

## Best Practices

1. **Choose the Right Search Type**
   - Use `nearVector` when you have pre-computed embeddings
   - Use `nearText` for natural language queries with automatic vectorization
   - Use `hybrid` for best of both keyword and semantic search
   - Use `bm25` for pure keyword search

2. **Optimize Query Parameters**
   - Set appropriate `limit` values (avoid fetching more than needed)
   - Use `certainty` or `distance` thresholds to filter low-quality results
   - Leverage `properties` to return only needed fields
   - Set `includeVector: false` unless you need the vectors

3. **Pagination**
   - Use `SearchIterator` for large result sets
   - Set reasonable `pageSize` (typically 20-100)
   - Avoid loading all results into memory at once

4. **Hybrid Search Alpha**
   - `alpha = 0.0` - Pure BM25 (keyword search)
   - `alpha = 0.5` - Balanced (recommended default)
   - `alpha = 1.0` - Pure vector (semantic search)
   - Use `determineOptimalAlpha()` for adaptive selection

5. **Performance**
   - Enable schema caching to reduce validation overhead
   - Use filters to reduce result set size
   - Consider using `autocut` for adaptive result limiting
   - Batch process results using iterators

## Examples

See `examples.ts` for comprehensive usage examples including:
- Basic searches
- Pagination strategies
- Result processing
- Error handling
- Multi-tenant searches
- Grouped results
- Adaptive hybrid search

## License

Part of the Weaviate TypeScript integration module.

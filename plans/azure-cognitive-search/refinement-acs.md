# Azure Cognitive Search Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure-cognitive-search`

---

## 1. Core Client Interface (Rust)

### 1.1 AcsClient

```rust
pub struct AcsClient {
    config: AcsConfig,
    auth: Arc<dyn AcsAuthProvider>,
    transport: Arc<HttpTransport>,
    circuit_breaker: Arc<CircuitBreaker>,
}

impl AcsClient {
    pub fn new(config: AcsConfig) -> Result<Self, AcsError>;
    pub fn builder() -> AcsClientBuilder;
    pub fn search(&self) -> SearchService;
    pub fn documents(&self) -> DocumentService;
    pub fn indexes(&self) -> IndexService;
    pub fn as_vector_store(&self, index: &str, config: VectorStoreConfig) -> AcsVectorStore;
    pub fn mock() -> MockAcsClient;
}

pub struct AcsClientBuilder {
    service_name: Option<String>,
    credentials: Option<AcsCredentials>,
    api_version: String,
    timeout: Duration,
    retry_config: RetryConfig,
    circuit_breaker_config: CircuitBreakerConfig,
}

impl AcsClientBuilder {
    pub fn new() -> Self;
    pub fn service_name(self, name: impl Into<String>) -> Self;
    pub fn api_key(self, key: impl Into<String>) -> Self;
    pub fn entra_id(self, token_provider: impl TokenProvider) -> Self;
    pub fn api_version(self, version: impl Into<String>) -> Self;
    pub fn timeout(self, timeout: Duration) -> Self;
    pub fn retry_config(self, config: RetryConfig) -> Self;
    pub fn build(self) -> Result<AcsClient, AcsError>;
}
```

### 1.2 Configuration Types

```rust
#[derive(Clone, Debug)]
pub struct AcsConfig {
    pub service_name: String,
    pub credentials: AcsCredentials,
    pub api_version: String,
    pub timeout: Duration,
    pub retry_config: RetryConfig,
    pub circuit_breaker_config: CircuitBreakerConfig,
}

#[derive(Clone)]
pub enum AcsCredentials {
    ApiKey(SecretString),
    EntraId(Arc<dyn TokenProvider>),
}

#[derive(Clone, Debug)]
pub struct VectorStoreConfig {
    pub index_name: String,
    pub vector_field: String,
    pub key_field: String,
    pub content_field: String,
    pub metadata_field: Option<String>,
    pub dimensions: usize,
}

impl Default for AcsConfig {
    fn default() -> Self {
        Self {
            service_name: String::new(),
            credentials: AcsCredentials::ApiKey(SecretString::new("")),
            api_version: "2024-07-01".into(),
            timeout: Duration::from_secs(30),
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
        }
    }
}
```

---

## 2. Search Service Interface

### 2.1 SearchService

```rust
#[async_trait]
pub trait SearchServiceTrait: Send + Sync {
    async fn vector_search(&self, req: VectorSearchRequest) -> Result<SearchResults, AcsError>;
    async fn keyword_search(&self, req: KeywordSearchRequest) -> Result<SearchResults, AcsError>;
    async fn hybrid_search(&self, req: HybridSearchRequest) -> Result<SearchResults, AcsError>;
    async fn semantic_search(&self, req: SemanticSearchRequest) -> Result<SearchResults, AcsError>;
    async fn suggest(&self, req: SuggestRequest) -> Result<SuggestResults, AcsError>;
    async fn autocomplete(&self, req: AutocompleteRequest) -> Result<AutocompleteResults, AcsError>;
}

pub struct SearchService {
    client: Arc<AcsClientInner>,
}

impl SearchService {
    pub fn in_index(&self, index: impl Into<String>) -> IndexBoundSearchService;
}

pub struct IndexBoundSearchService {
    service: SearchService,
    index: String,
}

impl IndexBoundSearchService {
    pub fn vector(&self, vector: Vec<f32>) -> VectorQueryBuilder;
    pub fn keyword(&self, query: impl Into<String>) -> KeywordQueryBuilder;
    pub fn hybrid(&self, query: impl Into<String>, vector: Vec<f32>) -> HybridQueryBuilder;
}
```

### 2.2 Query Builders

```rust
pub struct VectorQueryBuilder {
    service: IndexBoundSearchService,
    request: VectorSearchRequest,
}

impl VectorQueryBuilder {
    pub fn field(self, field: impl Into<String>) -> Self;
    pub fn k(self, k: usize) -> Self;
    pub fn filter(self, filter: impl Into<String>) -> Self;
    pub fn select(self, fields: Vec<String>) -> Self;
    pub fn scoring_profile(self, profile: impl Into<String>) -> Self;
    pub fn exhaustive(self, exhaustive: bool) -> Self;
    pub async fn execute(self) -> Result<SearchResults, AcsError>;
}

pub struct HybridQueryBuilder {
    service: IndexBoundSearchService,
    request: HybridSearchRequest,
}

impl HybridQueryBuilder {
    pub fn vector_field(self, field: impl Into<String>) -> Self;
    pub fn search_fields(self, fields: Vec<String>) -> Self;
    pub fn k(self, k: usize) -> Self;
    pub fn top(self, top: usize) -> Self;
    pub fn filter(self, filter: impl Into<String>) -> Self;
    pub fn select(self, fields: Vec<String>) -> Self;
    pub fn scoring_profile(self, profile: impl Into<String>) -> Self;
    pub fn semantic_config(self, config: impl Into<String>) -> Self;
    pub async fn execute(self) -> Result<SearchResults, AcsError>;
}
```

---

## 3. Request/Response Types

### 3.1 Search Requests

```rust
#[derive(Clone, Debug)]
pub struct VectorSearchRequest {
    pub index: String,
    pub vector: Vec<f32>,
    pub vector_field: String,
    pub k: usize,
    pub filter: Option<String>,
    pub select: Vec<String>,
    pub scoring_profile: Option<String>,
    pub exhaustive: bool,
}

#[derive(Clone, Debug)]
pub struct KeywordSearchRequest {
    pub index: String,
    pub query: String,
    pub search_fields: Option<Vec<String>>,
    pub query_type: QueryType,
    pub search_mode: SearchMode,
    pub filter: Option<String>,
    pub order_by: Option<String>,
    pub select: Vec<String>,
    pub top: usize,
    pub skip: usize,
    pub include_count: bool,
    pub facets: Vec<String>,
    pub highlight_fields: Option<Vec<String>>,
    pub scoring_profile: Option<String>,
}

#[derive(Clone, Debug)]
pub struct HybridSearchRequest {
    pub index: String,
    pub keyword_query: String,
    pub vector: Vec<f32>,
    pub vector_field: String,
    pub search_fields: Option<Vec<String>>,
    pub k: usize,
    pub top: usize,
    pub filter: Option<String>,
    pub select: Vec<String>,
    pub scoring_profile: Option<String>,
    pub semantic_config: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SemanticSearchRequest {
    pub index: String,
    pub query: String,
    pub semantic_config: String,
    pub vector: Option<Vec<f32>>,
    pub vector_field: Option<String>,
    pub k: Option<usize>,
    pub filter: Option<String>,
    pub select: Vec<String>,
    pub top: usize,
    pub captions: CaptionType,
    pub answers: Option<AnswerType>,
}

#[derive(Clone, Debug, Default)]
pub enum QueryType {
    #[default]
    Simple,
    Full,
    Semantic,
}

#[derive(Clone, Debug, Default)]
pub enum SearchMode {
    #[default]
    Any,
    All,
}

#[derive(Clone, Debug, Default)]
pub enum CaptionType {
    #[default]
    None,
    Extractive,
}

#[derive(Clone, Debug)]
pub enum AnswerType {
    None,
    Extractive { count: usize },
}
```

### 3.2 Search Results

```rust
#[derive(Clone, Debug)]
pub struct SearchResults {
    pub results: Vec<SearchResult>,
    pub count: Option<u64>,
    pub facets: Option<HashMap<String, Vec<FacetValue>>>,
    pub answers: Option<Vec<Answer>>,
    pub next_link: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SearchResult {
    pub id: String,
    pub score: f64,
    pub reranker_score: Option<f64>,
    pub highlights: Option<HashMap<String, Vec<String>>>,
    pub captions: Option<Vec<Caption>>,
    pub document: serde_json::Value,
}

#[derive(Clone, Debug)]
pub struct Caption {
    pub text: String,
    pub highlights: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Answer {
    pub text: String,
    pub highlights: Option<String>,
    pub score: f64,
    pub key: Option<String>,
}

#[derive(Clone, Debug)]
pub struct FacetValue {
    pub value: serde_json::Value,
    pub count: u64,
}
```

### 3.3 Document Types

```rust
#[derive(Clone, Debug)]
pub struct IndexDocumentRequest {
    pub index: String,
    pub action: IndexAction,
    pub document: serde_json::Value,
}

#[derive(Clone, Debug)]
pub enum IndexAction {
    Upload,
    Merge,
    MergeOrUpload,
    Delete,
}

#[derive(Clone, Debug)]
pub struct BatchIndexRequest {
    pub index: String,
    pub documents: Vec<(IndexAction, serde_json::Value)>,
}

#[derive(Clone, Debug)]
pub struct IndexResult {
    pub key: String,
    pub succeeded: bool,
    pub status_code: u16,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug)]
pub struct BatchIndexResult {
    pub results: Vec<IndexResult>,
    pub success_count: usize,
    pub failure_count: usize,
}

impl BatchIndexResult {
    pub fn all_succeeded(&self) -> bool {
        self.failure_count == 0
    }

    pub fn failed_keys(&self) -> Vec<&str> {
        self.results.iter()
            .filter(|r| !r.succeeded)
            .map(|r| r.key.as_str())
            .collect()
    }
}

#[derive(Clone, Debug)]
pub struct LookupRequest {
    pub index: String,
    pub key: String,
    pub select: Option<Vec<String>>,
}
```

---

## 4. VectorStore Implementation

```rust
use shared::vector_memory::{VectorStore, VectorDocument, VectorQuery, VectorSearchResult};

pub struct AcsVectorStore {
    client: Arc<AcsClientInner>,
    config: VectorStoreConfig,
}

#[async_trait]
impl VectorStore for AcsVectorStore {
    async fn upsert(&self, documents: Vec<VectorDocument>) -> Result<(), VectorStoreError> {
        let acs_docs: Vec<_> = documents.iter().map(|doc| {
            let mut json = serde_json::json!({
                self.config.key_field.clone(): doc.id,
                self.config.content_field.clone(): doc.content,
                self.config.vector_field.clone(): doc.vector,
            });
            if let Some(ref meta_field) = self.config.metadata_field {
                json[meta_field] = serde_json::to_value(&doc.metadata)?;
            }
            (IndexAction::MergeOrUpload, json)
        }).collect();

        let result = self.client.documents().index_batch(BatchIndexRequest {
            index: self.config.index_name.clone(),
            documents: acs_docs,
        }).await?;

        if !result.all_succeeded() {
            return Err(VectorStoreError::PartialFailure {
                succeeded: result.success_count,
                failed: result.failure_count,
            });
        }
        Ok(())
    }

    async fn search(&self, query: VectorQuery) -> Result<Vec<VectorSearchResult>, VectorStoreError> {
        let filter = query.filter.map(|f| self.build_filter(f));

        let results = self.client.search().vector_search(VectorSearchRequest {
            index: self.config.index_name.clone(),
            vector: query.vector,
            vector_field: self.config.vector_field.clone(),
            k: query.top_k,
            filter,
            select: vec![
                self.config.key_field.clone(),
                self.config.content_field.clone(),
            ],
            ..Default::default()
        }).await?;

        Ok(results.results.iter().map(|r| VectorSearchResult {
            id: r.document[&self.config.key_field].as_str().unwrap().to_string(),
            content: r.document[&self.config.content_field].as_str().unwrap().to_string(),
            score: r.score,
            metadata: self.extract_metadata(&r.document),
        }).collect())
    }

    async fn delete(&self, ids: Vec<String>) -> Result<(), VectorStoreError> {
        let docs: Vec<_> = ids.iter().map(|id| {
            (IndexAction::Delete, serde_json::json!({ self.config.key_field.clone(): id }))
        }).collect();

        self.client.documents().index_batch(BatchIndexRequest {
            index: self.config.index_name.clone(),
            documents: docs,
        }).await?;
        Ok(())
    }

    async fn get(&self, id: &str) -> Result<Option<VectorDocument>, VectorStoreError> {
        let result = self.client.documents().lookup(LookupRequest {
            index: self.config.index_name.clone(),
            key: id.to_string(),
            select: None,
        }).await?;

        Ok(result.map(|doc| VectorDocument {
            id: doc[&self.config.key_field].as_str().unwrap().to_string(),
            content: doc[&self.config.content_field].as_str().unwrap().to_string(),
            vector: serde_json::from_value(doc[&self.config.vector_field].clone()).unwrap(),
            metadata: self.extract_metadata(&doc),
        }))
    }
}
```

---

## 5. Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum AcsError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Index error: {0}")]
    Index(#[from] IndexError),

    #[error("Document error: {0}")]
    Document(#[from] DocumentError),

    #[error("Query error: {0}")]
    Query(#[from] QueryError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),
}

impl AcsError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            AcsError::Server(ServerError::ServiceBusy { .. })
                | AcsError::Server(ServerError::ServiceUnavailable { .. })
                | AcsError::Network(NetworkError::Timeout { .. })
                | AcsError::Network(NetworkError::ConnectionFailed { .. })
        )
    }

    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            AcsError::Server(ServerError::ServiceBusy { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum QueryError {
    #[error("Invalid filter: {reason}")]
    InvalidFilter { reason: String },

    #[error("Vector dimension mismatch: expected {expected}, got {actual}")]
    VectorDimensionMismatch { expected: usize, actual: usize },

    #[error("Invalid order by: {reason}")]
    InvalidOrderBy { reason: String },

    #[error("Syntax error: {message}")]
    SyntaxError { message: String },
}

#[derive(Debug, thiserror::Error)]
pub enum DocumentError {
    #[error("Document not found: {key}")]
    NotFound { key: String },

    #[error("Key field missing")]
    KeyFieldMissing,

    #[error("Validation failed: {reason}")]
    ValidationFailed { reason: String },

    #[error("Partial failure: {success_count} succeeded, {failure_count} failed")]
    PartialFailure { success_count: usize, failure_count: usize },
}
```

---

## 6. TypeScript Interfaces

```typescript
interface AcsClient {
  readonly search: SearchService;
  readonly documents: DocumentService;
  readonly indexes: IndexService;
  asVectorStore(config: VectorStoreConfig): AcsVectorStore;
}

interface SearchService {
  vectorSearch(req: VectorSearchRequest): Promise<SearchResults>;
  keywordSearch(req: KeywordSearchRequest): Promise<SearchResults>;
  hybridSearch(req: HybridSearchRequest): Promise<SearchResults>;
  semanticSearch(req: SemanticSearchRequest): Promise<SearchResults>;
  suggest(req: SuggestRequest): Promise<SuggestResults>;
  autocomplete(req: AutocompleteRequest): Promise<AutocompleteResults>;
  inIndex(index: string): IndexBoundSearchService;
}

interface IndexBoundSearchService {
  vector(vector: number[]): VectorQueryBuilder;
  keyword(query: string): KeywordQueryBuilder;
  hybrid(query: string, vector: number[]): HybridQueryBuilder;
}

interface VectorQueryBuilder {
  field(field: string): VectorQueryBuilder;
  k(k: number): VectorQueryBuilder;
  filter(filter: string): VectorQueryBuilder;
  select(fields: string[]): VectorQueryBuilder;
  execute(): Promise<SearchResults>;
}

// VectorStore implementation
interface AcsVectorStore extends VectorStore {
  upsert(documents: VectorDocument[]): Promise<void>;
  search(query: VectorQuery): Promise<VectorSearchResult[]>;
  delete(ids: string[]): Promise<void>;
  get(id: string): Promise<VectorDocument | null>;
}

// Types
interface VectorSearchRequest {
  index: string;
  vector: number[];
  vectorField: string;
  k: number;
  filter?: string;
  select: string[];
  scoringProfile?: string;
  exhaustive?: boolean;
}

interface HybridSearchRequest {
  index: string;
  keywordQuery: string;
  vector: number[];
  vectorField: string;
  searchFields?: string[];
  k: number;
  top: number;
  filter?: string;
  select: string[];
  semanticConfig?: string;
}

interface SearchResults {
  results: SearchResult[];
  count?: number;
  facets?: Record<string, FacetValue[]>;
  answers?: Answer[];
}

interface SearchResult {
  id: string;
  score: number;
  rerankerScore?: number;
  highlights?: Record<string, string[]>;
  captions?: Caption[];
  document: Record<string, unknown>;
}

interface VectorStoreConfig {
  indexName: string;
  vectorField: string;
  keyField: string;
  contentField: string;
  metadataField?: string;
  dimensions: number;
}
```

---

## 7. Integration Patterns

### 7.1 Hybrid Search with Semantic Reranking

```rust
let client = AcsClient::builder()
    .service_name("my-search-service")
    .api_key(env::var("ACS_API_KEY")?)
    .build()?;

let results = client.search()
    .in_index("products")
    .hybrid("wireless headphones", embedding_vector)
    .vector_field("descriptionVector")
    .search_fields(vec!["title".into(), "description".into()])
    .k(50)
    .top(10)
    .filter("category eq 'Electronics' and price lt 200")
    .semantic_config("my-semantic-config")
    .execute()
    .await?;

for result in results.results {
    println!("Score: {}, Reranker: {:?}", result.score, result.reranker_score);
    if let Some(captions) = result.captions {
        for caption in captions {
            println!("Caption: {}", caption.text);
        }
    }
}
```

### 7.2 VectorStore for RAG Pipeline

```rust
use shared::vector_memory::VectorStore;

// Create vector store from ACS
let vector_store = client.as_vector_store(VectorStoreConfig {
    index_name: "documents".into(),
    vector_field: "contentVector".into(),
    key_field: "id".into(),
    content_field: "content".into(),
    metadata_field: Some("metadata".into()),
    dimensions: 1536,
});

// Upsert documents
let docs = vec![
    VectorDocument {
        id: "doc1".into(),
        content: "Azure Cognitive Search is a cloud search service...".into(),
        vector: embed("Azure Cognitive Search is a cloud search service...").await?,
        metadata: json!({"source": "docs", "category": "azure"}),
    },
];
vector_store.upsert(docs).await?;

// Search for RAG context
let query_vector = embed("How does vector search work?").await?;
let results = vector_store.search(VectorQuery {
    vector: query_vector,
    top_k: 5,
    filter: Some(MetadataFilter::eq("category", "azure")),
}).await?;

// Use results as context for LLM
let context: String = results.iter()
    .map(|r| r.content.clone())
    .collect::<Vec<_>>()
    .join("\n\n");
```

### 7.3 Batch Document Indexing

```rust
// Index large dataset in batches
let documents: Vec<serde_json::Value> = load_documents()?;

let batch_request = BatchIndexRequest {
    index: "products".into(),
    documents: documents.into_iter()
        .map(|doc| (IndexAction::MergeOrUpload, doc))
        .collect(),
};

let result = client.documents().index_batch(batch_request).await?;

println!("Indexed {} documents, {} failed", result.success_count, result.failure_count);

if !result.all_succeeded() {
    for key in result.failed_keys() {
        println!("Failed to index: {}", key);
    }
}
```

---

## 8. Mock/Simulation Usage

```rust
#[tokio::test]
async fn test_hybrid_search() {
    let mock = AcsClient::mock()
        .with_search_response(
            SearchPattern::hybrid("headphones"),
            SearchResults {
                results: vec![
                    SearchResult {
                        id: "prod-1".into(),
                        score: 0.95,
                        reranker_score: Some(3.2),
                        document: json!({"title": "Wireless Headphones", "price": 149}),
                        ..Default::default()
                    },
                ],
                count: Some(1),
                ..Default::default()
            }
        );

    let results = mock.search()
        .in_index("products")
        .hybrid("headphones", vec![0.1; 1536])
        .execute()
        .await
        .unwrap();

    assert_eq!(results.results.len(), 1);
    assert_eq!(results.results[0].id, "prod-1");
}

#[tokio::test]
async fn test_vector_store_upsert() {
    let mock = AcsClient::mock()
        .expect_index_batch("documents", 2);

    let store = mock.as_vector_store(VectorStoreConfig {
        index_name: "documents".into(),
        vector_field: "vector".into(),
        key_field: "id".into(),
        content_field: "content".into(),
        ..Default::default()
    });

    store.upsert(vec![
        VectorDocument { id: "1".into(), content: "test".into(), vector: vec![0.1; 1536], ..Default::default() },
        VectorDocument { id: "2".into(), content: "test2".into(), vector: vec![0.2; 1536], ..Default::default() },
    ]).await.unwrap();

    mock.verify().unwrap();
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement phase |

---

**Next Phase:** Completion - Acceptance criteria verification, test coverage requirements, security checklist, and release criteria.

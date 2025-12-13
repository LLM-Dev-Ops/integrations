# Google Docs Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/docs`

---

## 1. Final File Structure

### 1.1 Rust Implementation

```
integrations/
└── google/
    └── docs/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs
            │   ├── client.rs
            │   ├── config.rs
            │   ├── error.rs
            │   ├── validation.rs
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── document/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   ├── reader.rs
            │   │   │   └── updater.rs
            │   │   ├── revision/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   └── diff.rs
            │   │   ├── suggestion/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs
            │   │   ├── comment/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs
            │   │   ├── named_range/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   └── extractor.rs
            │   │   └── export/
            │   │       ├── mod.rs
            │   │       ├── service.rs
            │   │       └── markdown.rs
            │   │
            │   ├── builder/
            │   │   ├── mod.rs
            │   │   ├── content.rs
            │   │   ├── request.rs
            │   │   └── style.rs
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── http.rs
            │   │   └── auth.rs
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── document.rs
            │   │   ├── element.rs
            │   │   ├── request.rs
            │   │   ├── response.rs
            │   │   ├── comment.rs
            │   │   ├── revision.rs
            │   │   └── style.rs
            │   │
            │   └── simulation/
            │       ├── mod.rs
            │       ├── mock_client.rs
            │       ├── document_model.rs
            │       └── replay.rs
            │
            └── tests/
                ├── unit/
                │   ├── document_tests.rs
                │   ├── named_range_tests.rs
                │   ├── revision_tests.rs
                │   ├── comment_tests.rs
                │   ├── export_tests.rs
                │   ├── builder_tests.rs
                │   └── validation_tests.rs
                ├── integration/
                │   ├── document_workflow.rs
                │   ├── named_range_workflow.rs
                │   └── export_workflow.rs
                └── fixtures/
                    ├── documents/
                    ├── requests/
                    └── responses/
```

### 1.2 TypeScript Implementation

```
integrations/
└── google/
    └── docs/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── README.md
            ├── src/
            │   ├── index.ts
            │   ├── client.ts
            │   ├── config.ts
            │   ├── error.ts
            │   ├── validation.ts
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── document.ts
            │   │   ├── revision.ts
            │   │   ├── suggestion.ts
            │   │   ├── comment.ts
            │   │   ├── namedRange.ts
            │   │   └── export.ts
            │   │
            │   ├── builder/
            │   │   ├── index.ts
            │   │   ├── content.ts
            │   │   └── style.ts
            │   │
            │   ├── types/
            │   │   └── index.ts
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   └── mockClient.ts
            │   │
            │   └── utils/
            │       └── markdown.ts
            │
            └── tests/
```

---

## 2. Cargo.toml

```toml
[package]
name = "integrations-google-docs"
version = "0.1.0"
edition = "2021"
authors = ["LLM Dev Ops Team"]
description = "Google Docs integration for LLM Dev Ops platform"
license = "MIT"
repository = "https://github.com/org/integrations"
keywords = ["google", "docs", "documents", "api"]
categories = ["api-bindings", "asynchronous"]

[features]
default = ["rustls"]
rustls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]
simulation = []

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["rt-multi-thread", "macros", "sync", "fs"] }

# HTTP client
reqwest = { version = "0.11", default-features = false, features = ["json", "gzip", "stream"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Security
secrecy = { version = "0.8", features = ["serde"] }

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Async traits
async-trait = "0.1"

# Time handling
chrono = { version = "0.4", features = ["serde"] }

# Tracing
tracing = "0.1"

# Shared modules (workspace dependencies)
google-auth = { path = "../../auth" }
shared-resilience = { path = "../../../shared/resilience" }
shared-observability = { path = "../../../shared/observability" }

# UUID generation
uuid = { version = "1.6", features = ["v4"] }

# URL handling
url = "2.5"

# Text diffing
similar = "2.4"

# LRU cache
lru = "0.12"

# Temp file handling
tempfile = "3.9"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
claims = "0.7"
proptest = "1.4"
test-case = "3.3"
```

---

## 3. Package.json

```json
{
  "name": "@integrations/google-docs",
  "version": "0.1.0",
  "description": "Google Docs integration for LLM Dev Ops platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write src/**/*.ts"
  },
  "dependencies": {
    "googleapis": "^130.0.0",
    "google-auth-library": "^9.4.0",
    "axios": "^1.6.0",
    "axios-retry": "^4.0.0",
    "zod": "^3.22.0",
    "lru-cache": "^10.1.0",
    "diff": "^5.1.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/diff": "^5.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.55.0",
    "jest": "^29.7.0",
    "nock": "^13.4.0",
    "prettier": "^3.1.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  },
  "peerDependencies": {
    "@integrations/google-auth": "^0.1.0",
    "@integrations/shared-resilience": "^0.1.0",
    "@integrations/shared-observability": "^0.1.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "MIT"
}
```

---

## 4. Implementation Order

### Phase 1: Core Types
1. `types/style.rs` - TextStyle, ParagraphStyle, DocumentStyle
2. `types/element.rs` - StructuralElement, ParagraphElement, TextRun
3. `types/document.rs` - Document, Body, NamedRange
4. `types/request.rs` - Request enum, all request types
5. `types/response.rs` - BatchUpdateResponse, Reply types
6. `types/comment.rs` - Comment, Reply, User
7. `types/revision.rs` - Revision, RevisionList
8. `error.rs` - DocsError enum
9. `validation.rs` - Input validators

### Phase 2: Configuration and Transport
10. `config.rs` - GoogleDocsConfig
11. `transport/auth.rs` - Auth integration with google/auth
12. `transport/http.rs` - HTTP client with resilience

### Phase 3: Content Builder
13. `builder/style.rs` - TextStyleBuilder, ParagraphStyleBuilder
14. `builder/request.rs` - Request builders
15. `builder/content.rs` - ContentBuilder fluent API

### Phase 4: Services
16. `services/document/reader.rs` - Document reading
17. `services/document/updater.rs` - Batch updates
18. `services/document/service.rs` - DocumentService

19. `services/revision/diff.rs` - Text diff computation
20. `services/revision/service.rs` - RevisionService

21. `services/suggestion/service.rs` - SuggestionService

22. `services/comment/service.rs` - CommentService

23. `services/named_range/extractor.rs` - Content extraction
24. `services/named_range/service.rs` - NamedRangeService

25. `services/export/markdown.rs` - Markdown converter
26. `services/export/service.rs` - ExportService

### Phase 5: Client Facade
27. `client.rs` - DocsClient facade
28. `lib.rs` - Public exports

### Phase 6: Simulation
29. `simulation/document_model.rs` - In-memory document
30. `simulation/mock_client.rs` - MockDocsClient
31. `simulation/replay.rs` - Operation replay

### Phase 7: Tests
32. Unit tests for all components
33. Integration tests
34. Property-based tests

---

## 5. Public API Summary

### 5.1 Rust Public Exports (lib.rs)

```rust
//! Google Docs Integration Module
//!
//! Provides a thin adapter layer for reading and writing Google Docs,
//! supporting document-based workflows like prompt authoring, report
//! generation, reviews, and collaboration.
//!
//! # Example
//! ```rust
//! use integrations_google_docs::{DocsClient, GoogleDocsConfig, ContentBuilder};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = GoogleDocsConfig::from_env()?;
//!     let client = DocsClient::new(config).await?;
//!
//!     // Read a document
//!     let doc = client.documents().get("doc-id").await?;
//!     println!("Title: {}", doc.title);
//!
//!     // Update content
//!     let requests = ContentBuilder::new()
//!         .insert_text("Hello World", Location::at_end())
//!         .build();
//!     client.documents().batch_update("doc-id", requests).await?;
//!
//!     Ok(())
//! }
//! ```

// Re-export main client
pub use client::DocsClient;
pub use config::GoogleDocsConfig;
pub use error::{DocsError, DocsResult};

// Services
pub mod services {
    pub use crate::services::document::DocumentService;
    pub use crate::services::revision::{RevisionService, RevisionDiff};
    pub use crate::services::suggestion::SuggestionService;
    pub use crate::services::comment::CommentService;
    pub use crate::services::named_range::{NamedRangeService, NamedRangeContent};
    pub use crate::services::export::{ExportService, ExportFormat};
}

// Builder
pub mod builder {
    pub use crate::builder::content::ContentBuilder;
    pub use crate::builder::style::{TextStyleBuilder, ParagraphStyleBuilder};
    pub use crate::builder::request::*;
}

// Types
pub mod types {
    pub use crate::types::document::{Document, Body, NamedRange};
    pub use crate::types::element::{StructuralElement, Paragraph, TextRun, Table};
    pub use crate::types::request::{Request, Location, Range, WriteControl};
    pub use crate::types::response::BatchUpdateResponse;
    pub use crate::types::comment::{Comment, Reply, User};
    pub use crate::types::revision::{Revision, RevisionList};
    pub use crate::types::style::{TextStyle, ParagraphStyle};
}

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub mod simulation {
    pub use crate::simulation::mock_client::MockDocsClient;
    pub use crate::simulation::document_model::LocalDocumentModel;
    pub use crate::simulation::replay::DocumentReplay;
}
```

### 5.2 TypeScript Public Exports (index.ts)

```typescript
// Main client
export { DocsClient } from './client';
export { GoogleDocsConfig } from './config';
export { DocsError, DocsErrorCode } from './error';

// Services
export { DocumentService } from './services/document';
export { RevisionService, RevisionDiff } from './services/revision';
export { SuggestionService, Suggestion } from './services/suggestion';
export { CommentService } from './services/comment';
export { NamedRangeService, NamedRangeContent } from './services/namedRange';
export { ExportService, ExportFormat } from './services/export';

// Builder
export { ContentBuilder } from './builder/content';
export { TextStyleBuilder, ParagraphStyleBuilder } from './builder/style';

// Types
export {
  Document,
  Body,
  NamedRange,
  StructuralElement,
  Paragraph,
  TextRun,
  Table,
  Request,
  Location,
  Range,
  WriteControl,
  BatchUpdateResponse,
  Comment,
  Reply,
  User,
  Revision,
  RevisionList,
  TextStyle,
  ParagraphStyle,
} from './types';

// Simulation
export { MockDocsClient } from './simulation/mockClient';
```

---

## 6. Usage Examples

### 6.1 Reading Documents

```rust
use integrations_google_docs::{DocsClient, GoogleDocsConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GoogleDocsConfig::from_env()?;
    let client = DocsClient::new(config).await?;

    // Get full document
    let doc = client.documents().get("1abc...xyz").await?;
    println!("Title: {}", doc.title);
    println!("Revision: {}", doc.revision_id);

    // Extract plain text content
    let text = client.documents().get_content("1abc...xyz").await?;
    println!("Content: {}", text);

    // Get document with suggestions shown
    let doc_with_suggestions = client.documents()
        .get_with_options("1abc...xyz", GetDocumentOptions {
            suggestions_view_mode: Some(SuggestionsViewMode::PreviewSuggestionsAccepted),
            ..Default::default()
        })
        .await?;

    Ok(())
}
```

### 6.2 Updating Documents

```rust
use integrations_google_docs::{
    DocsClient, GoogleDocsConfig,
    builder::{ContentBuilder, TextStyleBuilder},
    types::{Location, Range},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GoogleDocsConfig::from_env()?;
    let client = DocsClient::new(config).await?;

    // Build update requests using fluent API
    let requests = ContentBuilder::new()
        // Insert text at the beginning
        .insert_text("# Report Title\n\n", Location::at_index(1))
        // Insert text at the end
        .insert_text("\n\nGenerated by LLM Dev Ops", Location::at_end())
        // Apply bold styling to title
        .update_text_style(
            Range::new(1, 15),
            TextStyleBuilder::new().bold(true).font_size(18).build()
        )
        // Create a named range for later updates
        .create_named_range("report_body", Range::new(16, 100))
        .build();

    // Apply updates
    let response = client.documents()
        .batch_update("1abc...xyz", requests)
        .await?;

    println!("Applied {} updates", response.replies.len());

    Ok(())
}
```

### 6.3 Working with Named Ranges

```rust
use integrations_google_docs::{DocsClient, GoogleDocsConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GoogleDocsConfig::from_env()?;
    let client = DocsClient::new(config).await?;

    let doc_id = "1abc...xyz";

    // List all named ranges
    let ranges = client.named_ranges().list(doc_id).await?;
    for range in &ranges {
        println!("Range: {} ({} segments)", range.name, range.ranges.len());
    }

    // Get content from a specific named range
    let content = client.named_ranges()
        .get_content(doc_id, "prompt_template")
        .await?;
    println!("Template content: {}", content.content);

    // Update named range content
    client.named_ranges()
        .update_content(doc_id, "prompt_template", "New prompt template text")
        .await?;

    // Create a new named range
    let new_range = client.named_ranges()
        .create(doc_id, "output_section", Range::new(200, 500))
        .await?;
    println!("Created range: {}", new_range.named_range_id);

    Ok(())
}
```

### 6.4 Revision History

```rust
use integrations_google_docs::{DocsClient, GoogleDocsConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GoogleDocsConfig::from_env()?;
    let client = DocsClient::new(config).await?;

    let doc_id = "1abc...xyz";

    // List revisions
    let revisions = client.revisions().list(doc_id).await?;
    for rev in &revisions.revisions {
        println!(
            "Revision {} by {} at {}",
            rev.revision_id,
            rev.last_modifying_user.display_name,
            rev.modified_time
        );
    }

    // Compare two revisions
    if revisions.revisions.len() >= 2 {
        let diff = client.revisions()
            .compare(
                doc_id,
                &revisions.revisions[0].revision_id,
                &revisions.revisions[1].revision_id
            )
            .await?;

        println!("Additions: {}", diff.additions);
        println!("Deletions: {}", diff.deletions);
    }

    // Get content at a specific revision
    let old_content = client.revisions()
        .get_content(doc_id, &revisions.revisions[0].revision_id)
        .await?;

    Ok(())
}
```

### 6.5 Comments and Collaboration

```rust
use integrations_google_docs::{DocsClient, GoogleDocsConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GoogleDocsConfig::from_env()?;
    let client = DocsClient::new(config).await?;

    let doc_id = "1abc...xyz";

    // List all comments
    let comments = client.comments().list(doc_id).await?;
    for comment in &comments.comments {
        println!(
            "Comment by {}: {} (resolved: {})",
            comment.author.display_name,
            comment.content,
            comment.resolved
        );

        for reply in &comment.replies {
            println!("  Reply by {}: {}", reply.author.display_name, reply.content);
        }
    }

    // Add a comment
    let new_comment = client.comments()
        .create(doc_id, "Please review this section", None)
        .await?;

    // Reply to a comment
    client.comments()
        .reply(doc_id, &new_comment.comment_id, "LGTM!")
        .await?;

    // Resolve a comment
    client.comments()
        .resolve(doc_id, &new_comment.comment_id)
        .await?;

    Ok(())
}
```

### 6.6 Exporting Documents

```rust
use integrations_google_docs::{
    DocsClient, GoogleDocsConfig,
    services::ExportFormat,
};
use std::fs;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GoogleDocsConfig::from_env()?;
    let client = DocsClient::new(config).await?;

    let doc_id = "1abc...xyz";

    // Export as PDF
    let pdf_bytes = client.export().as_pdf(doc_id).await?;
    fs::write("document.pdf", pdf_bytes)?;

    // Export as DOCX
    let docx_bytes = client.export().as_docx(doc_id).await?;
    fs::write("document.docx", docx_bytes)?;

    // Export as Markdown (local conversion)
    let markdown = client.export().as_markdown(doc_id).await?;
    println!("Markdown:\n{}", markdown);

    // Export as plain text
    let text = client.export().as_plain_text(doc_id).await?;
    println!("Plain text:\n{}", text);

    Ok(())
}
```

### 6.7 Simulation and Testing

```rust
use integrations_google_docs::simulation::{MockDocsClient, LocalDocumentModel};
use integrations_google_docs::builder::ContentBuilder;
use integrations_google_docs::types::Location;

#[tokio::test]
async fn test_document_workflow() {
    // Create mock client with pre-loaded document
    let mut mock = MockDocsClient::new();
    mock.add_document(LocalDocumentModel::new("doc-1", "Test Document"));

    // Test reading
    let doc = mock.documents().get("doc-1").await.unwrap();
    assert_eq!(doc.title, "Test Document");

    // Test updating
    let requests = ContentBuilder::new()
        .insert_text("Hello", Location::at_start())
        .build();

    let response = mock.documents()
        .batch_update("doc-1", requests)
        .await
        .unwrap();

    assert_eq!(response.replies.len(), 1);

    // Verify content was updated
    let updated = mock.documents().get("doc-1").await.unwrap();
    let content = extract_text(&updated);
    assert!(content.contains("Hello"));

    // Check operation log
    let log = mock.get_operation_log();
    assert_eq!(log.len(), 3); // get, batch_update, get
}

#[tokio::test]
async fn test_error_injection() {
    let mut mock = MockDocsClient::new();

    // Configure error injection
    mock.inject_error("get_document", DocsError::DocumentNotFound("test".into()));

    // Verify error is returned
    let result = mock.documents().get("any-id").await;
    assert!(matches!(result, Err(DocsError::DocumentNotFound(_))));
}
```

---

## 7. Configuration Reference

### 7.1 Environment Variables

```bash
# Authentication (one of these required)
GOOGLE_DOCS_CREDENTIALS_PATH=/path/to/service-account.json
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json  # ADC

# OAuth scopes (optional, defaults shown)
GOOGLE_DOCS_SCOPES=https://www.googleapis.com/auth/documents,https://www.googleapis.com/auth/drive

# API settings (optional)
GOOGLE_DOCS_API_BASE_URL=https://docs.googleapis.com
GOOGLE_DOCS_API_VERSION=v1

# Resilience (optional)
GOOGLE_DOCS_MAX_RETRIES=3
GOOGLE_DOCS_REQUEST_TIMEOUT_MS=30000
GOOGLE_DOCS_BATCH_SIZE_LIMIT=100

# Caching (optional)
GOOGLE_DOCS_CACHE_TTL_SECONDS=30
GOOGLE_DOCS_CACHE_MAX_ENTRIES=100

# Export (optional)
GOOGLE_DOCS_EXPORT_TEMP_DIR=/tmp/docs-exports
GOOGLE_DOCS_EXPORT_CLEANUP_SECONDS=300

# Testing
GOOGLE_DOCS_E2E_TESTS=false
```

### 7.2 Programmatic Configuration

```rust
use integrations_google_docs::{GoogleDocsConfig, CredentialSource};
use std::time::Duration;
use std::path::PathBuf;

let config = GoogleDocsConfig {
    credentials: CredentialSource::ServiceAccount(
        PathBuf::from("/path/to/service-account.json")
    ),
    scopes: vec![
        "https://www.googleapis.com/auth/documents".to_string(),
        "https://www.googleapis.com/auth/drive".to_string(),
    ],
    api_version: "v1".to_string(),
    base_url: "https://docs.googleapis.com".to_string(),
    max_retries: 3,
    request_timeout: Duration::from_secs(30),
    batch_size_limit: 100,
    cache_ttl: Duration::from_secs(30),
    cache_max_entries: 100,
    include_suggestions: true,
};

let client = DocsClient::new(config).await?;
```

---

## 8. Error Reference

```rust
#[derive(Debug, thiserror::Error)]
pub enum DocsError {
    // Document errors
    #[error("Document not found: {0}")]
    DocumentNotFound(String),

    #[error("Access denied to document: {0}")]
    AccessDenied(String),

    #[error("Document is read-only: {0}")]
    ReadOnlyDocument(String),

    #[error("Document too large: {0}")]
    DocumentTooLarge(String),

    // Update errors
    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Invalid range: {0}")]
    InvalidRange(String),

    #[error("Batch too large: {0} requests (max {1})")]
    BatchTooLarge(usize, usize),

    #[error("Conflicting revision for document: {0}")]
    ConflictingRevision(String, Option<String>),

    #[error("Conflict resolution failed after {1} attempts: {0}")]
    ConflictResolutionFailed(String, u32),

    // Named range errors
    #[error("Named range not found: {0}")]
    NamedRangeNotFound(String),

    #[error("Named range already exists: {0}")]
    NamedRangeExists(String),

    // Revision errors
    #[error("Revision not found: {0}")]
    RevisionNotFound(String),

    // Comment errors
    #[error("Comment not found: {0}")]
    CommentNotFound(String),

    // Suggestion errors
    #[error("Suggestion not found: {0}")]
    SuggestionNotFound(String),

    // Export errors
    #[error("Export not available for document: {0}")]
    ExportNotAvailable(String),

    #[error("Unsupported export format: {0:?}")]
    UnsupportedExportFormat(ExportFormat),

    // API errors
    #[error("Authentication failed")]
    AuthenticationFailed,

    #[error("Quota exceeded, retry after {0} seconds")]
    QuotaExceeded(u64),

    #[error("Service unavailable")]
    ServiceUnavailable,

    #[error("Internal error: {0:?}")]
    InternalError(Option<String>),

    // Network errors
    #[error("Request timeout")]
    Timeout,

    #[error("Network error: {0}")]
    NetworkError(String),
}

impl DocsError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            DocsError::QuotaExceeded(_)
                | DocsError::ServiceUnavailable
                | DocsError::Timeout
                | DocsError::NetworkError(_)
                | DocsError::InternalError(_)
        )
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            DocsError::DocumentNotFound(_) => "DOCUMENT_NOT_FOUND",
            DocsError::AccessDenied(_) => "ACCESS_DENIED",
            DocsError::InvalidRange(_) => "INVALID_RANGE",
            DocsError::ConflictingRevision(..) => "CONFLICTING_REVISION",
            DocsError::NamedRangeNotFound(_) => "NAMED_RANGE_NOT_FOUND",
            DocsError::QuotaExceeded(_) => "QUOTA_EXCEEDED",
            // ... other codes
            _ => "UNKNOWN_ERROR",
        }
    }
}
```

---

## 9. Acceptance Criteria

### 9.1 Functional Requirements

| Requirement | Acceptance Criteria | Test Coverage |
|-------------|---------------------|---------------|
| Document read | Get full document with all elements | Unit + Integration |
| Batch update | Apply 20+ request types | Unit + Integration |
| Revision history | List, get, compare revisions | Unit + Integration |
| Suggestions | List, accept, reject suggestions | Unit + Integration |
| Comments | Full CRUD with replies | Unit + Integration |
| Named ranges | Create, read, update, delete | Unit + Integration |
| Export | PDF, DOCX, Markdown, plain text | Unit + Integration |
| Simulation | MockDocsClient for all operations | Unit |

### 9.2 Non-Functional Requirements

| Requirement | Acceptance Criteria | Validation |
|-------------|---------------------|------------|
| Performance | Read < 500ms p95, Update < 1s p95 | Load test |
| Reliability | Retry with backoff, circuit breaker | Integration test |
| Security | Token protection, content not logged | Security review |
| Observability | Metrics, traces, structured logs | Manual verification |
| Code coverage | >90% unit test coverage | CI gate |

### 9.3 API Compatibility

| API | Version | Compatibility |
|-----|---------|---------------|
| Google Docs API | v1 | Full |
| Google Drive API | v3 | Revisions, Comments, Export |
| OAuth 2.0 | RFC 6749 | Via google/auth |

---

## 10. SPARC Completion Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-google-docs.md | Complete |
| 2. Pseudocode | pseudocode-google-docs.md | Complete |
| 3. Architecture | architecture-google-docs.md | Complete |
| 4. Refinement | refinement-google-docs.md | Complete |
| 5. Completion | completion-google-docs.md | Complete |

---

## 11. Next Steps

1. **Create directory structure** - Set up Rust and TypeScript project scaffolding
2. **Implement core types** - Start with Phase 1 types and error handling
3. **Integrate google/auth** - Set up authentication delegation
4. **Build services incrementally** - Follow implementation order
5. **Write tests alongside code** - Maintain >90% coverage
6. **Document as you build** - Keep README current

---

*Phase 5: Completion - Complete*
*SPARC Process for Google Docs Integration - Complete*

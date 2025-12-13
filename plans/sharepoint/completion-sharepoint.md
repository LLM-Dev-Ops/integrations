# SharePoint Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/sharepoint`

---

## 1. Final File Structure

### 1.1 Rust Implementation

```
integrations/
└── microsoft/
    └── sharepoint/
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
            │   │   ├── site/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   └── resolver.rs
            │   │   ├── library/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   ├── upload.rs
            │   │   │   └── download.rs
            │   │   ├── list/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   └── fields.rs
            │   │   ├── version/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs
            │   │   ├── metadata/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs
            │   │   ├── search/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs
            │   │   ├── webhook/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   └── handler.rs
            │   │   └── permission/
            │   │       ├── mod.rs
            │   │       └── service.rs
            │   │
            │   ├── query/
            │   │   ├── mod.rs
            │   │   ├── builder.rs
            │   │   └── filter.rs
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── graph.rs
            │   │   ├── auth.rs
            │   │   └── upload_session.rs
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── site.rs
            │   │   ├── drive.rs
            │   │   ├── list.rs
            │   │   ├── version.rs
            │   │   ├── search.rs
            │   │   ├── webhook.rs
            │   │   └── permission.rs
            │   │
            │   └── simulation/
            │       ├── mod.rs
            │       ├── mock_client.rs
            │       ├── site_model.rs
            │       └── replay.rs
            │
            └── tests/
                ├── unit/
                │   ├── site_tests.rs
                │   ├── library_tests.rs
                │   ├── list_tests.rs
                │   ├── version_tests.rs
                │   ├── search_tests.rs
                │   ├── webhook_tests.rs
                │   ├── query_builder_tests.rs
                │   └── validation_tests.rs
                ├── integration/
                │   ├── upload_download.rs
                │   ├── list_crud.rs
                │   └── webhook_flow.rs
                └── fixtures/
                    ├── sites/
                    ├── items/
                    └── responses/
```

### 1.2 TypeScript Implementation

```
integrations/
└── microsoft/
    └── sharepoint/
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
            │   │   ├── site.ts
            │   │   ├── library.ts
            │   │   ├── list.ts
            │   │   ├── version.ts
            │   │   ├── metadata.ts
            │   │   ├── search.ts
            │   │   ├── webhook.ts
            │   │   └── permission.ts
            │   │
            │   ├── query/
            │   │   ├── index.ts
            │   │   └── builder.ts
            │   │
            │   ├── types/
            │   │   └── index.ts
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   └── mockClient.ts
            │   │
            │   └── utils/
            │       └── upload.ts
            │
            └── tests/
```

---

## 2. Cargo.toml

```toml
[package]
name = "integrations-microsoft-sharepoint"
version = "0.1.0"
edition = "2021"
authors = ["LLM Dev Ops Team"]
description = "SharePoint integration for LLM Dev Ops platform"
license = "MIT"
repository = "https://github.com/org/integrations"
keywords = ["microsoft", "sharepoint", "graph", "documents", "lists"]
categories = ["api-bindings", "asynchronous"]

[features]
default = ["rustls"]
rustls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]
simulation = []

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["rt-multi-thread", "macros", "sync", "fs", "io-util"] }
futures = "0.3"

# HTTP client
reqwest = { version = "0.11", default-features = false, features = ["json", "gzip", "stream", "multipart"] }

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
azure-auth = { path = "../../azure/auth" }
shared-resilience = { path = "../../../shared/resilience" }
shared-observability = { path = "../../../shared/observability" }

# UUID generation
uuid = { version = "1.6", features = ["v4", "serde"] }

# URL handling
url = "2.5"

# LRU cache
lru = "0.12"

# Bytes handling
bytes = "1.5"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
claims = "0.7"
proptest = "1.4"
test-case = "3.3"
tempfile = "3.9"
```

---

## 3. Package.json

```json
{
  "name": "@integrations/microsoft-sharepoint",
  "version": "0.1.0",
  "description": "SharePoint integration for LLM Dev Ops platform",
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
    "@azure/identity": "^4.0.0",
    "@microsoft/microsoft-graph-client": "^3.0.0",
    "axios": "^1.6.0",
    "axios-retry": "^4.0.0",
    "zod": "^3.22.0",
    "lru-cache": "^10.1.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
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
    "@integrations/azure-auth": "^0.1.0",
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
1. `types/site.rs` - Site, SubsiteInfo
2. `types/drive.rs` - DocumentLibrary, DriveItem, Folder
3. `types/list.rs` - List, ListItem, FieldValue, ListField
4. `types/version.rs` - FileVersion, VersionHistory
5. `types/search.rs` - SearchQuery, SearchResult
6. `types/webhook.rs` - Subscription, WebhookNotification
7. `types/permission.rs` - Permission types
8. `error.rs` - SharePointError enum
9. `validation.rs` - Input validators

### Phase 2: Configuration and Transport
10. `config.rs` - SharePointConfig
11. `transport/auth.rs` - Azure AD integration
12. `transport/graph.rs` - Graph API client
13. `transport/upload_session.rs` - Chunked upload

### Phase 3: Query Builder
14. `query/filter.rs` - OData filter expressions
15. `query/builder.rs` - Query builder fluent API

### Phase 4: Services
16. `services/site/resolver.rs` - URL to site ID
17. `services/site/service.rs` - SiteService

18. `services/library/upload.rs` - Upload strategies
19. `services/library/download.rs` - Download handling
20. `services/library/service.rs` - DocumentLibraryService

21. `services/list/fields.rs` - Field conversion
22. `services/list/service.rs` - ListService

23. `services/version/service.rs` - VersionService
24. `services/metadata/service.rs` - MetadataService
25. `services/search/service.rs` - SearchService

26. `services/webhook/handler.rs` - Notification handler
27. `services/webhook/service.rs` - WebhookService

28. `services/permission/service.rs` - PermissionService

### Phase 5: Client Facade
29. `client.rs` - SharePointClient facade
30. `lib.rs` - Public exports

### Phase 6: Simulation
31. `simulation/site_model.rs` - In-memory model
32. `simulation/mock_client.rs` - MockSharePointClient
33. `simulation/replay.rs` - Interaction replay

### Phase 7: Tests
34. Unit tests for all components
35. Integration tests
36. Property-based tests

---

## 5. Public API Summary

### 5.1 Rust Public Exports (lib.rs)

```rust
//! SharePoint Integration Module
//!
//! Provides a thin adapter layer for interacting with SharePoint Online,
//! supporting document libraries, lists, and collaborative content workflows.
//!
//! # Example
//! ```rust
//! use integrations_microsoft_sharepoint::{SharePointClient, SharePointConfig};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = SharePointConfig::from_env()?;
//!     let client = SharePointClient::new(config).await?;
//!
//!     // Get a site
//!     let site = client.sites()
//!         .get("https://contoso.sharepoint.com/sites/hr")
//!         .await?;
//!
//!     // List document libraries
//!     let libraries = client.libraries()
//!         .list(&site.id)
//!         .await?;
//!
//!     Ok(())
//! }
//! ```

// Re-export main client
pub use client::SharePointClient;
pub use config::SharePointConfig;
pub use error::{SharePointError, SharePointResult};

// Services
pub mod services {
    pub use crate::services::site::SiteService;
    pub use crate::services::library::{DocumentLibraryService, UploadOptions, ConflictBehavior};
    pub use crate::services::list::{ListService, ListItemQueryOptions};
    pub use crate::services::version::VersionService;
    pub use crate::services::metadata::MetadataService;
    pub use crate::services::search::{SearchService, SearchQuery};
    pub use crate::services::webhook::{WebhookService, NotificationHandler};
    pub use crate::services::permission::PermissionService;
}

// Query builder
pub mod query {
    pub use crate::query::builder::QueryBuilder;
    pub use crate::query::filter::{Filter, FilterOp};
}

// Types
pub mod types {
    pub use crate::types::site::{Site, SubsiteInfo};
    pub use crate::types::drive::{DocumentLibrary, DriveItem, DriveItemType, Folder};
    pub use crate::types::list::{List, ListItem, FieldValue, ListField, FieldType};
    pub use crate::types::version::{FileVersion, VersionHistory};
    pub use crate::types::search::{SearchResult, SearchRow};
    pub use crate::types::webhook::{Subscription, WebhookNotification, ChangeType};
    pub use crate::types::permission::{Permission, PermissionType};
}

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub mod simulation {
    pub use crate::simulation::mock_client::MockSharePointClient;
    pub use crate::simulation::site_model::SiteModel;
    pub use crate::simulation::replay::InteractionReplay;
}
```

### 5.2 TypeScript Public Exports (index.ts)

```typescript
// Main client
export { SharePointClient } from './client';
export { SharePointConfig } from './config';
export { SharePointError, SharePointErrorCode } from './error';

// Services
export { SiteService } from './services/site';
export { DocumentLibraryService, UploadOptions, ConflictBehavior } from './services/library';
export { ListService, ListItemQueryOptions } from './services/list';
export { VersionService } from './services/version';
export { MetadataService } from './services/metadata';
export { SearchService, SearchQuery } from './services/search';
export { WebhookService, NotificationHandler } from './services/webhook';
export { PermissionService } from './services/permission';

// Query builder
export { QueryBuilder, Filter, FilterOp } from './query';

// Types
export {
  Site,
  SubsiteInfo,
  DocumentLibrary,
  DriveItem,
  DriveItemType,
  Folder,
  List,
  ListItem,
  FieldValue,
  ListField,
  FieldType,
  FileVersion,
  VersionHistory,
  SearchResult,
  SearchRow,
  Subscription,
  WebhookNotification,
  ChangeType,
  Permission,
  PermissionType,
} from './types';

// Simulation
export { MockSharePointClient } from './simulation/mockClient';
```

---

## 6. Usage Examples

### 6.1 Site Navigation

```rust
use integrations_microsoft_sharepoint::{SharePointClient, SharePointConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SharePointConfig::from_env()?;
    let client = SharePointClient::new(config).await?;

    // Get site by URL
    let site = client.sites()
        .get("https://contoso.sharepoint.com/sites/engineering")
        .await?;

    println!("Site: {} ({})", site.title, site.id);

    // List subsites
    let subsites = client.sites()
        .list_subsites(&site.id)
        .await?;

    for subsite in &subsites {
        println!("  Subsite: {}", subsite.title);
    }

    // Search for sites
    let results = client.sites()
        .search("project")
        .await?;

    for site in &results {
        println!("Found: {} - {}", site.title, site.url);
    }

    Ok(())
}
```

### 6.2 Document Library Operations

```rust
use integrations_microsoft_sharepoint::{
    SharePointClient, SharePointConfig,
    services::{UploadOptions, ConflictBehavior},
};
use std::fs;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SharePointConfig::from_env()?;
    let client = SharePointClient::new(config).await?;

    let site_id = "site-uuid";

    // List document libraries
    let libraries = client.libraries().list(site_id).await?;

    for lib in &libraries {
        println!("Library: {} ({} items)", lib.title, lib.item_count);
    }

    let library_id = &libraries[0].id;

    // List items in library
    let items = client.libraries()
        .get_items(site_id, library_id, None)
        .await?;

    for item in &items.value {
        println!("  {} - {} bytes", item.name, item.size);
    }

    // Upload a file
    let content = fs::read("local-file.pdf")?;
    let uploaded = client.libraries()
        .upload(
            site_id,
            library_id,
            "/Documents/uploaded-file.pdf",
            content.into(),
            UploadOptions {
                conflict_behavior: Some(ConflictBehavior::Replace),
                ..Default::default()
            }
        )
        .await?;

    println!("Uploaded: {} ({})", uploaded.name, uploaded.id);

    // Download a file
    let downloaded = client.libraries()
        .download(site_id, library_id, &uploaded.id)
        .await?;

    fs::write("downloaded-file.pdf", downloaded)?;

    Ok(())
}
```

### 6.3 List Operations

```rust
use integrations_microsoft_sharepoint::{
    SharePointClient, SharePointConfig,
    types::FieldValue,
    query::QueryBuilder,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SharePointConfig::from_env()?;
    let client = SharePointClient::new(config).await?;

    let site_id = "site-uuid";
    let list_id = "list-uuid";

    // Get list items with filter
    let query = QueryBuilder::new()
        .filter("fields/Status eq 'Active'")
        .expand(&["fields"])
        .top(50)
        .orderby("fields/Created desc")
        .build();

    let items = client.lists()
        .get_items(site_id, list_id, Some(query))
        .await?;

    for item in &items.value {
        let title = item.fields.get("Title")
            .and_then(|v| v.as_text())
            .unwrap_or("Untitled");
        println!("Item: {}", title);
    }

    // Create a new list item
    let mut fields = std::collections::HashMap::new();
    fields.insert("Title".to_string(), FieldValue::Text("New Item".to_string()));
    fields.insert("Status".to_string(), FieldValue::Text("Active".to_string()));
    fields.insert("Priority".to_string(), FieldValue::Number(1.0));

    let created = client.lists()
        .create_item(site_id, list_id, fields)
        .await?;

    println!("Created item: {}", created.id);

    // Update the item
    let mut updates = std::collections::HashMap::new();
    updates.insert("Status".to_string(), FieldValue::Text("Completed".to_string()));

    client.lists()
        .update_item(site_id, list_id, &created.id, updates, Some(&created.e_tag))
        .await?;

    Ok(())
}
```

### 6.4 Version History

```rust
use integrations_microsoft_sharepoint::{SharePointClient, SharePointConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SharePointConfig::from_env()?;
    let client = SharePointClient::new(config).await?;

    let site_id = "site-uuid";
    let library_id = "library-uuid";
    let item_id = "item-uuid";

    // List versions
    let history = client.versions()
        .list(site_id, library_id, item_id)
        .await?;

    println!("Current version: {}", history.current_version);

    for version in &history.versions {
        println!(
            "  {} - {} by {} at {}",
            version.version_label,
            if version.is_current { "(current)" } else { "" },
            version.created_by.display_name,
            version.created
        );
    }

    // Download a specific version
    if history.versions.len() > 1 {
        let old_version = &history.versions[1];
        let content = client.versions()
            .get_content(site_id, library_id, item_id, &old_version.id)
            .await?;

        println!("Downloaded version {} ({} bytes)", old_version.version_label, content.len());
    }

    // Restore a previous version
    if history.versions.len() > 1 {
        let target_version = &history.versions[1];
        let restored = client.versions()
            .restore(site_id, library_id, item_id, &target_version.id)
            .await?;

        println!("Restored to version {}", target_version.version_label);
    }

    Ok(())
}
```

### 6.5 Search

```rust
use integrations_microsoft_sharepoint::{
    SharePointClient, SharePointConfig,
    services::SearchQuery,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SharePointConfig::from_env()?;
    let client = SharePointClient::new(config).await?;

    // Search for documents
    let query = SearchQuery {
        query_text: "project report filetype:docx".to_string(),
        select_properties: vec![
            "Title".to_string(),
            "Path".to_string(),
            "Author".to_string(),
            "LastModifiedTime".to_string(),
        ],
        row_limit: 50,
        ..Default::default()
    };

    let results = client.search().search(query).await?;

    println!("Found {} results:", results.total_rows);

    for row in &results.rows {
        println!(
            "  {} - {} (by {})",
            row.title,
            row.path,
            row.author.as_deref().unwrap_or("Unknown")
        );
    }

    Ok(())
}
```

### 6.6 Webhooks

```rust
use integrations_microsoft_sharepoint::{
    SharePointClient, SharePointConfig,
    services::{WebhookService, NotificationHandler},
    types::{WebhookNotification, ChangeType, DriveItem, ListItem},
};
use async_trait::async_trait;
use chrono::{Utc, Duration};

struct MyNotificationHandler;

#[async_trait]
impl NotificationHandler for MyNotificationHandler {
    async fn on_drive_item_change(&self, change: ChangeType, item: Option<DriveItem>) {
        match change {
            ChangeType::Created => {
                if let Some(item) = item {
                    println!("File created: {}", item.name);
                }
            }
            ChangeType::Updated => {
                if let Some(item) = item {
                    println!("File updated: {}", item.name);
                }
            }
            ChangeType::Deleted => {
                println!("File deleted");
            }
            _ => {}
        }
    }

    async fn on_list_item_change(&self, change: ChangeType, item: Option<ListItem>) {
        println!("List item changed: {:?}", change);
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SharePointConfig::from_env()?;
    let client = SharePointClient::new(config).await?;

    // Create a subscription
    let resource = "/sites/{site-id}/drives/{drive-id}/root";
    let expiry = Utc::now() + Duration::days(7);

    let subscription = client.webhooks()
        .create_subscription(
            resource.to_string(),
            "https://myapp.example.com/webhook".to_string(),
            expiry,
            Some("my-secret-state".to_string()),
        )
        .await?;

    println!("Created subscription: {}", subscription.id);
    println!("Expires: {}", subscription.expiration_date_time);

    // List subscriptions
    let subs = client.webhooks().list_subscriptions().await?;
    println!("Active subscriptions: {}", subs.len());

    // Renew before expiry
    let new_expiry = Utc::now() + Duration::days(14);
    client.webhooks()
        .update_subscription(&subscription.id, new_expiry)
        .await?;

    Ok(())
}
```

### 6.7 Simulation and Testing

```rust
use integrations_microsoft_sharepoint::simulation::MockSharePointClient;
use integrations_microsoft_sharepoint::types::{Site, DocumentLibrary, DriveItem};

#[tokio::test]
async fn test_document_workflow() {
    // Create mock client
    let mut mock = MockSharePointClient::new();

    // Configure mock data
    mock.add_site(Site {
        id: "site-1".to_string(),
        url: "https://contoso.sharepoint.com/sites/test".to_string(),
        title: "Test Site".to_string(),
        ..Default::default()
    });

    mock.add_library("site-1", DocumentLibrary {
        id: "lib-1".to_string(),
        name: "Documents".to_string(),
        title: "Documents".to_string(),
        item_count: 0,
        ..Default::default()
    });

    // Test operations
    let site = mock.sites().get("https://contoso.sharepoint.com/sites/test").await.unwrap();
    assert_eq!(site.title, "Test Site");

    let libraries = mock.libraries().list(&site.id).await.unwrap();
    assert_eq!(libraries.len(), 1);

    // Upload file
    let content = b"Hello, SharePoint!".to_vec();
    let item = mock.libraries()
        .upload(&site.id, "lib-1", "/test.txt", content.into(), Default::default())
        .await
        .unwrap();

    assert_eq!(item.name, "test.txt");

    // Verify operation log
    let log = mock.get_operation_log();
    assert_eq!(log.len(), 3); // get_site, list_libraries, upload
}

#[tokio::test]
async fn test_error_handling() {
    let mut mock = MockSharePointClient::new();

    // Inject error
    mock.inject_error("get_site", SharePointError::SiteNotFound("test".into()));

    let result = mock.sites().get("https://example.sharepoint.com/sites/test").await;
    assert!(matches!(result, Err(SharePointError::SiteNotFound(_))));
}
```

---

## 7. Configuration Reference

### 7.1 Environment Variables

```bash
# Required: Azure AD Authentication
SHAREPOINT_TENANT_ID=<tenant-id>
SHAREPOINT_CLIENT_ID=<client-id>
SHAREPOINT_CLIENT_SECRET=<client-secret>

# Alternative: Certificate authentication
SHAREPOINT_CERTIFICATE_PATH=/path/to/cert.pfx
SHAREPOINT_CERTIFICATE_PASSWORD=<password>

# Optional: Default site
SHAREPOINT_DEFAULT_SITE_URL=https://contoso.sharepoint.com/sites/default

# Optional: API settings
SHAREPOINT_USE_GRAPH_API=true
SHAREPOINT_API_VERSION=v1.0

# Optional: Resilience
SHAREPOINT_MAX_RETRIES=3
SHAREPOINT_REQUEST_TIMEOUT_MS=30000
SHAREPOINT_REQUESTS_PER_MINUTE=600

# Optional: Upload settings
SHAREPOINT_CHUNK_SIZE_BYTES=10485760
SHAREPOINT_LARGE_FILE_THRESHOLD=4194304

# Optional: Webhook settings
SHAREPOINT_WEBHOOK_ENDPOINT=https://myapp.example.com/webhook
SHAREPOINT_WEBHOOK_SECRET=<webhook-secret>

# Optional: Cache settings
SHAREPOINT_CACHE_TTL_SECONDS=300
SHAREPOINT_CACHE_MAX_ENTRIES=1000

# Testing
SHAREPOINT_E2E_TESTS=false
```

### 7.2 Programmatic Configuration

```rust
use integrations_microsoft_sharepoint::{SharePointConfig, CredentialSource};
use secrecy::SecretString;
use std::time::Duration;

let config = SharePointConfig {
    tenant_id: "tenant-uuid".to_string(),
    client_id: "client-uuid".to_string(),
    credentials: CredentialSource::ClientSecret(
        SecretString::new("secret".to_string())
    ),
    site_url: Some("https://contoso.sharepoint.com/sites/default".to_string()),
    api_version: "v1.0".to_string(),
    use_graph_api: true,
    max_retries: 3,
    request_timeout: Duration::from_secs(30),
    requests_per_minute: 600,
    chunk_size_bytes: 10 * 1024 * 1024,  // 10MB
    large_file_threshold: 4 * 1024 * 1024,  // 4MB
    webhook_endpoint: None,
    webhook_secret: None,
};

let client = SharePointClient::new(config).await?;
```

---

## 8. Error Reference

```rust
#[derive(Debug, thiserror::Error)]
pub enum SharePointError {
    // Resource errors
    #[error("Site not found: {0}")]
    SiteNotFound(String),

    #[error("Library not found: {0}")]
    LibraryNotFound(String),

    #[error("List not found: {0}")]
    ListNotFound(String),

    #[error("Item not found: {0}")]
    ItemNotFound(String),

    #[error("Version not found: {0}")]
    VersionNotFound(String),

    // Access errors
    #[error("Access denied: {0}")]
    AccessDenied(String),

    #[error("Unauthorized")]
    Unauthorized,

    // Conflict errors
    #[error("Version conflict: {0}")]
    VersionConflict(String),

    #[error("Item locked: {0}")]
    ItemLocked(String),

    #[error("Item checked out by: {0}")]
    ItemCheckedOut(String),

    // Quota errors
    #[error("Storage quota exceeded")]
    QuotaExceeded,

    #[error("File too large: {0} bytes")]
    FileTooLarge(u64),

    // Validation errors
    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Field validation error: {0}")]
    FieldValidation(String),

    #[error("Path too long: {0} characters")]
    PathTooLong(usize),

    // Upload errors
    #[error("Upload session expired")]
    UploadSessionExpired,

    #[error("Upload failed")]
    UploadFailed,

    #[error("Download not available")]
    DownloadNotAvailable,

    // Rate limiting
    #[error("Rate limited, retry after {0} seconds")]
    RateLimited(u64),

    // Webhook errors
    #[error("Webhook validation failed")]
    WebhookValidationFailed,

    #[error("Subscription expired: {0}")]
    SubscriptionExpired(String),

    // Network/service errors
    #[error("Request timeout")]
    Timeout,

    #[error("Service unavailable")]
    ServiceUnavailable,

    #[error("Network error: {0}")]
    NetworkError(String),
}

impl SharePointError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            SharePointError::RateLimited(_)
                | SharePointError::Timeout
                | SharePointError::ServiceUnavailable
                | SharePointError::NetworkError(_)
                | SharePointError::ItemLocked(_)
        )
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            SharePointError::SiteNotFound(_) => "SITE_NOT_FOUND",
            SharePointError::LibraryNotFound(_) => "LIBRARY_NOT_FOUND",
            SharePointError::ListNotFound(_) => "LIST_NOT_FOUND",
            SharePointError::ItemNotFound(_) => "ITEM_NOT_FOUND",
            SharePointError::AccessDenied(_) => "ACCESS_DENIED",
            SharePointError::VersionConflict(_) => "VERSION_CONFLICT",
            SharePointError::ItemLocked(_) => "ITEM_LOCKED",
            SharePointError::QuotaExceeded => "QUOTA_EXCEEDED",
            SharePointError::RateLimited(_) => "RATE_LIMITED",
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
| Site navigation | Get site, list subsites, search | Unit + Integration |
| Document libraries | List, upload, download, CRUD | Unit + Integration |
| Lists | CRUD operations, filtering | Unit + Integration |
| Version history | List, get, restore versions | Unit + Integration |
| Search | Query execution, pagination | Unit + Integration |
| Webhooks | Create, renew, process notifications | Unit + Integration |
| Permissions | Check effective permissions | Unit + Integration |
| Simulation | MockSharePointClient all operations | Unit |

### 9.2 Non-Functional Requirements

| Requirement | Acceptance Criteria | Validation |
|-------------|---------------------|------------|
| Performance | Operations < 1s p95, uploads scale linearly | Load test |
| Reliability | Retry with backoff, circuit breaker | Integration test |
| Security | Token protection, content not logged | Security review |
| Observability | Metrics, traces, structured logs | Manual verification |
| Code coverage | >90% unit test coverage | CI gate |

### 9.3 API Compatibility

| API | Version | Compatibility |
|-----|---------|---------------|
| Microsoft Graph API | v1.0 | Full |
| SharePoint REST API | 2019+ | Fallback operations |
| OAuth 2.0 | RFC 6749 | Via azure/auth |
| OData | 4.0 | Query support |

---

## 10. SPARC Completion Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-sharepoint.md | Complete |
| 2. Pseudocode | pseudocode-sharepoint.md | Complete |
| 3. Architecture | architecture-sharepoint.md | Complete |
| 4. Refinement | refinement-sharepoint.md | Complete |
| 5. Completion | completion-sharepoint.md | Complete |

---

## 11. Next Steps

1. **Create directory structure** - Set up Rust and TypeScript project scaffolding
2. **Implement core types** - Start with Phase 1 types and error handling
3. **Integrate azure/auth** - Set up authentication delegation
4. **Build services incrementally** - Follow implementation order
5. **Write tests alongside code** - Maintain >90% coverage
6. **Document as you build** - Keep README current

---

*Phase 5: Completion - Complete*
*SPARC Process for SharePoint Integration - Complete*

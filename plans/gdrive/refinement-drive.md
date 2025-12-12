# Google Drive Integration Module - Refinement Document

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Rust Standards](#2-rust-standards)
3. [TypeScript Standards](#3-typescript-standards)
4. [Google Drive Specific Patterns](#4-google-drive-specific-patterns)
5. [Testing Requirements](#5-testing-requirements)
6. [Coverage Targets](#6-coverage-targets)
7. [Performance Benchmarks](#7-performance-benchmarks)
8. [Documentation Standards](#8-documentation-standards)
9. [Review Criteria](#9-review-criteria)
10. [Quality Gates](#10-quality-gates)
11. [CI Configuration](#11-ci-configuration)
12. [Google Drive Specific Validation](#12-google-drive-specific-validation)

---

## 1. Code Standards

### 1.1 Naming Conventions

#### 1.1.1 General Principles

- **Clarity over brevity**: Names should be self-documenting
- **Consistency**: Follow language idioms (snake_case for Rust, camelCase for TypeScript)
- **Domain alignment**: Use Google Drive API terminology where applicable
- **No abbreviations**: Except for well-known terms (ID, URL, HTTP, etc.)

#### 1.1.2 Rust Naming

| Element | Convention | Example |
|---------|------------|---------|
| Modules | `snake_case` | `files_service`, `auth_provider` |
| Types | `PascalCase` | `GoogleDriveClient`, `FilesService` |
| Traits | `PascalCase` | `AuthProvider`, `HttpTransport` |
| Functions | `snake_case` | `create_file`, `get_storage_quota` |
| Constants | `SCREAMING_SNAKE_CASE` | `DEFAULT_CHUNK_SIZE`, `MAX_RETRIES` |
| Lifetime parameters | Single letter | `'a`, `'static` |
| Type parameters | `PascalCase` | `T`, `Item`, `Error` |
| Enum variants | `PascalCase` | `UploadType::Simple`, `Role::Reader` |

#### 1.1.3 TypeScript Naming

| Element | Convention | Example |
|---------|------------|---------|
| Interfaces | `PascalCase` | `GoogleDriveClient`, `FilesService` |
| Types | `PascalCase` | `DriveFile`, `Permission` |
| Classes | `PascalCase` | `OAuth2Provider`, `ResumableUpload` |
| Functions | `camelCase` | `createFile`, `getStorageQuota` |
| Variables | `camelCase` | `uploadChunkSize`, `maxRetries` |
| Constants | `SCREAMING_SNAKE_CASE` | `DEFAULT_CHUNK_SIZE`, `MAX_RETRIES` |
| Enum members | `PascalCase` | `UploadType.Simple`, `Role.Reader` |

#### 1.1.4 Error Naming

- Error types end with `Error`: `GoogleDriveError`, `AuthenticationError`
- Error variants describe the problem: `FileNotFound`, `InvalidToken`
- Use domain-specific terms: `StorageQuotaExceeded` not `OutOfSpace`

#### 1.1.5 Request/Response Types

| Pattern | Example |
|---------|---------|
| Request types | `Create{Resource}Request`, `Update{Resource}Request` |
| Response types | `{Resource}`, `{Resource}List` |
| Parameters | `List{Resource}Params`, `Get{Resource}Params` |

### 1.2 File Organization

#### 1.2.1 Rust Module Structure

```
google-drive/rust/
├── src/
│   ├── lib.rs                    # Public API, re-exports
│   ├── client.rs                 # Main client implementation
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error types
│   │   ├── mod.rs                # Public error types
│   │   ├── mapping.rs            # HTTP → error mapping
│   │   └── result.rs             # Result type aliases
│   ├── auth/                     # Authentication
│   │   ├── mod.rs                # AuthProvider trait
│   │   ├── oauth2.rs             # OAuth 2.0 implementation
│   │   ├── service_account.rs   # Service account implementation
│   │   └── token_cache.rs       # Token caching logic
│   ├── transport/                # HTTP transport
│   │   ├── mod.rs                # HttpTransport trait
│   │   ├── reqwest.rs            # Reqwest implementation
│   │   └── mock.rs               # Mock transport for testing
│   ├── services/                 # API services
│   │   ├── mod.rs                # Service trait re-exports
│   │   ├── files.rs              # Files service
│   │   ├── permissions.rs        # Permissions service
│   │   ├── comments.rs           # Comments service
│   │   ├── replies.rs            # Replies service
│   │   ├── revisions.rs          # Revisions service
│   │   ├── changes.rs            # Changes service
│   │   ├── drives.rs             # Drives service
│   │   └── about.rs              # About service
│   ├── upload/                   # Upload management
│   │   ├── mod.rs                # Upload types
│   │   ├── simple.rs             # Simple upload
│   │   ├── multipart.rs          # Multipart upload
│   │   └── resumable.rs          # Resumable upload
│   ├── types/                    # Type definitions
│   │   ├── mod.rs                # Type re-exports
│   │   ├── file.rs               # File types
│   │   ├── permission.rs         # Permission types
│   │   ├── comment.rs            # Comment types
│   │   ├── revision.rs           # Revision types
│   │   ├── change.rs             # Change types
│   │   ├── drive.rs              # Drive types
│   │   └── common.rs             # Common types
│   ├── pagination/               # Pagination utilities
│   │   ├── mod.rs                # Pagination traits
│   │   └── stream.rs             # Stream-based pagination
│   ├── resilience/               # Resilience integration
│   │   ├── mod.rs                # Resilience hooks
│   │   ├── retry.rs              # Retry logic
│   │   ├── circuit_breaker.rs   # Circuit breaker
│   │   └── rate_limit.rs        # Rate limiting
│   ├── validation/               # Input validation
│   │   ├── mod.rs                # Validation functions
│   │   ├── file_id.rs            # File ID validation
│   │   ├── query.rs              # Query syntax validation
│   │   └── mime_type.rs          # MIME type validation
│   └── telemetry/                # Observability
│       ├── mod.rs                # Telemetry helpers
│       ├── tracing.rs            # Tracing integration
│       ├── metrics.rs            # Metrics integration
│       └── logging.rs            # Logging integration
├── tests/                        # Integration tests
│   ├── common/                   # Test utilities
│   │   ├── mod.rs
│   │   ├── mock_server.rs        # Mock Drive server
│   │   └── test_data.rs          # Test fixtures
│   ├── auth_tests.rs             # Authentication tests
│   ├── files_tests.rs            # Files service tests
│   ├── permissions_tests.rs      # Permissions tests
│   ├── upload_tests.rs           # Upload tests
│   ├── pagination_tests.rs       # Pagination tests
│   └── resilience_tests.rs       # Resilience tests
├── benches/                      # Benchmarks
│   ├── serialization.rs          # Serialization benchmarks
│   ├── pagination.rs             # Pagination benchmarks
│   └── upload.rs                 # Upload benchmarks
├── examples/                     # Examples
│   ├── basic_usage.rs            # Simple file operations
│   ├── oauth2_auth.rs            # OAuth 2.0 setup
│   ├── service_account_auth.rs  # Service account setup
│   ├── resumable_upload.rs      # Large file upload
│   ├── streaming_download.rs    # Streaming download
│   └── change_tracking.rs       # Change notifications
├── Cargo.toml                    # Package manifest
└── README.md                     # Usage documentation
```

#### 1.2.2 TypeScript Module Structure

```
google-drive/typescript/
├── src/
│   ├── index.ts                  # Public API exports
│   ├── client.ts                 # Main client implementation
│   ├── config.ts                 # Configuration types
│   ├── errors/                   # Error types
│   │   ├── index.ts              # Public error types
│   │   ├── mapping.ts            # HTTP → error mapping
│   │   └── types.ts              # Error type definitions
│   ├── auth/                     # Authentication
│   │   ├── index.ts              # AuthProvider interface
│   │   ├── oauth2.ts             # OAuth 2.0 implementation
│   │   ├── serviceAccount.ts    # Service account implementation
│   │   └── tokenCache.ts        # Token caching logic
│   ├── transport/                # HTTP transport
│   │   ├── index.ts              # HttpTransport interface
│   │   ├── fetch.ts              # Fetch implementation
│   │   └── mock.ts               # Mock transport for testing
│   ├── services/                 # API services
│   │   ├── index.ts              # Service interface exports
│   │   ├── files.ts              # Files service
│   │   ├── permissions.ts        # Permissions service
│   │   ├── comments.ts           # Comments service
│   │   ├── replies.ts            # Replies service
│   │   ├── revisions.ts          # Revisions service
│   │   ├── changes.ts            # Changes service
│   │   ├── drives.ts             # Drives service
│   │   └── about.ts              # About service
│   ├── upload/                   # Upload management
│   │   ├── index.ts              # Upload types
│   │   ├── simple.ts             # Simple upload
│   │   ├── multipart.ts          # Multipart upload
│   │   └── resumable.ts          # Resumable upload
│   ├── types/                    # Type definitions
│   │   ├── index.ts              # Type exports
│   │   ├── file.ts               # File types
│   │   ├── permission.ts         # Permission types
│   │   ├── comment.ts            # Comment types
│   │   ├── revision.ts           # Revision types
│   │   ├── change.ts             # Change types
│   │   ├── drive.ts              # Drive types
│   │   └── common.ts             # Common types
│   ├── pagination/               # Pagination utilities
│   │   ├── index.ts              # Pagination interfaces
│   │   └── iterator.ts           # Async iterator pagination
│   ├── validation/               # Input validation
│   │   ├── index.ts              # Validation schemas
│   │   ├── fileId.ts             # File ID validation
│   │   ├── query.ts              # Query syntax validation
│   │   └── mimeType.ts           # MIME type validation
│   └── telemetry/                # Observability
│       ├── index.ts              # Telemetry helpers
│       └── tracing.ts            # Tracing integration
├── tests/                        # Tests
│   ├── unit/                     # Unit tests
│   │   ├── auth.test.ts
│   │   ├── validation.test.ts
│   │   └── errors.test.ts
│   ├── integration/              # Integration tests
│   │   ├── files.test.ts
│   │   ├── permissions.test.ts
│   │   ├── upload.test.ts
│   │   └── pagination.test.ts
│   └── helpers/                  # Test utilities
│       ├── mockServer.ts
│       └── testData.ts
├── examples/                     # Examples
│   ├── basicUsage.ts
│   ├── oauth2Auth.ts
│   ├── serviceAccountAuth.ts
│   ├── resumableUpload.ts
│   └── streamingDownload.ts
├── package.json                  # Package manifest
├── tsconfig.json                 # TypeScript config
├── eslint.config.js              # ESLint config
└── README.md                     # Usage documentation
```

### 1.3 Documentation Requirements

#### 1.3.1 Public API Documentation

All public interfaces, types, functions, and modules MUST have documentation:

**Rust:**
```rust
/// Creates a new file in Google Drive.
///
/// This method creates a file with only metadata. To upload content,
/// use `create_with_content()` or `create_resumable()`.
///
/// # Arguments
///
/// * `request` - File metadata and creation options
///
/// # Returns
///
/// Returns the created file metadata on success.
///
/// # Errors
///
/// * `GoogleDriveError::Authentication` - Invalid or expired credentials
/// * `GoogleDriveError::Authorization` - Insufficient permissions
/// * `GoogleDriveError::Quota` - Storage quota exceeded
/// * `GoogleDriveError::Request` - Invalid request parameters
///
/// # Example
///
/// ```
/// use google_drive::{GoogleDriveClient, CreateFileRequest};
///
/// # async fn example(client: &dyn GoogleDriveClient) -> Result<(), google_drive::GoogleDriveError> {
/// let request = CreateFileRequest::builder()
///     .name("document.txt")
///     .mime_type("text/plain")
///     .build();
///
/// let file = client.files().create(request).await?;
/// println!("Created file: {}", file.id);
/// # Ok(())
/// # }
/// ```
async fn create(&self, request: CreateFileRequest) -> Result<File, GoogleDriveError>;
```

**TypeScript:**
```typescript
/**
 * Creates a new file in Google Drive.
 *
 * This method creates a file with only metadata. To upload content,
 * use `createWithContent()` or `createResumable()`.
 *
 * @param request - File metadata and creation options
 * @returns The created file metadata
 *
 * @throws {@link AuthenticationError} Invalid or expired credentials
 * @throws {@link AuthorizationError} Insufficient permissions
 * @throws {@link QuotaError} Storage quota exceeded
 * @throws {@link RequestError} Invalid request parameters
 *
 * @example
 * ```typescript
 * const request = {
 *   name: 'document.txt',
 *   mimeType: 'text/plain'
 * };
 *
 * const file = await client.files.create(request);
 * console.log(`Created file: ${file.id}`);
 * ```
 */
create(request: CreateFileRequest): Promise<DriveFile>;
```

#### 1.3.2 Module Documentation

Each module MUST have a module-level doc comment:

**Rust:**
```rust
//! Files service implementation.
//!
//! Provides file operations for Google Drive including:
//! - Creating files with metadata only
//! - Uploading files (simple, multipart, resumable)
//! - Downloading file content
//! - Listing and searching files
//! - Updating file metadata and content
//! - Deleting files
//! - Copying and moving files
//!
//! # Examples
//!
//! Creating a file:
//!
//! ```
//! use google_drive::{GoogleDriveClient, CreateFileRequest};
//!
//! # async fn example(client: &dyn GoogleDriveClient) -> Result<(), google_drive::GoogleDriveError> {
//! let file = client.files()
//!     .create(CreateFileRequest::builder().name("doc.txt").build())
//!     .await?;
//! # Ok(())
//! # }
//! ```
```

**TypeScript:**
```typescript
/**
 * Files service implementation.
 *
 * Provides file operations for Google Drive including:
 * - Creating files with metadata only
 * - Uploading files (simple, multipart, resumable)
 * - Downloading file content
 * - Listing and searching files
 * - Updating file metadata and content
 * - Deleting files
 * - Copying and moving files
 *
 * @module services/files
 *
 * @example
 * Creating a file:
 * ```typescript
 * const file = await client.files.create({
 *   name: 'doc.txt'
 * });
 * ```
 */
```

#### 1.3.3 Internal Documentation

Internal (non-public) code SHOULD have documentation when:
- Logic is non-obvious
- Algorithm requires explanation
- Future maintainers need context
- Edge cases are handled

### 1.4 Error Handling Patterns

#### 1.4.1 Error Construction

**Rust:**
```rust
// Use thiserror for error types
#[derive(Debug, thiserror::Error)]
pub enum GoogleDriveError {
    #[error("File not found: {file_id}")]
    FileNotFound { file_id: String },

    #[error("Storage quota exceeded: {used}/{limit} bytes")]
    StorageQuotaExceeded {
        used: u64,
        limit: u64,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },
}

// Error context helpers
impl GoogleDriveError {
    pub fn file_not_found(file_id: impl Into<String>) -> Self {
        Self::FileNotFound {
            file_id: file_id.into(),
        }
    }
}
```

**TypeScript:**
```typescript
// Use Error subclasses
export class GoogleDriveError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class FileNotFoundError extends GoogleDriveError {
  constructor(public readonly fileId: string, cause?: Error) {
    super(`File not found: ${fileId}`, cause);
  }
}

export class StorageQuotaExceededError extends GoogleDriveError {
  constructor(
    public readonly used: number,
    public readonly limit: number,
    cause?: Error
  ) {
    super(`Storage quota exceeded: ${used}/${limit} bytes`, cause);
  }
}
```

#### 1.4.2 Error Propagation

**Rust:**
```rust
// Use `?` for error propagation
async fn get_file(&self, file_id: &str) -> Result<File, GoogleDriveError> {
    let response = self.transport
        .send(request)
        .await
        .map_err(|e| GoogleDriveError::Network(e.into()))?;

    // Map HTTP errors to domain errors
    if response.status == 404 {
        return Err(GoogleDriveError::file_not_found(file_id));
    }

    // Parse response
    let file: File = serde_json::from_slice(&response.body)
        .map_err(|e| GoogleDriveError::Response(e.into()))?;

    Ok(file)
}
```

**TypeScript:**
```typescript
// Explicit try-catch at API boundaries
async function getFile(fileId: string): Promise<DriveFile> {
  try {
    const response = await this.transport.send(request);

    // Map HTTP errors to domain errors
    if (response.status === 404) {
      throw new FileNotFoundError(fileId);
    }

    // Parse response
    return parseFile(response.body);
  } catch (error) {
    if (error instanceof GoogleDriveError) {
      throw error;
    }
    throw new NetworkError('Request failed', error);
  }
}
```

#### 1.4.3 Error Logging

- Log errors at the point where they can be handled
- Include context (file_id, operation, etc.)
- Use appropriate log levels
- Never log sensitive data (tokens, credentials)

```rust
// Rust
tracing::error!(
    file_id = %file_id,
    error = ?err,
    "Failed to get file metadata"
);
```

```typescript
// TypeScript
logger.error('Failed to get file metadata', {
  fileId,
  error: err.message,
  stack: err.stack
});
```

---

## 2. Rust Standards

### 2.1 Formatting (rustfmt)

#### 2.1.1 Configuration

Create `.rustfmt.toml` in the Rust project root:

```toml
# Edition
edition = "2021"

# Imports
imports_granularity = "Crate"
group_imports = "StdExternalCrate"
reorder_imports = true

# Line width
max_width = 100
comment_width = 80
wrap_comments = true

# Indentation
tab_spaces = 4
indent_style = "Block"

# Function formatting
fn_single_line = false
where_single_line = false

# Chain formatting
chain_width = 60

# Match formatting
match_arm_blocks = true
match_block_trailing_comma = true

# Misc
use_field_init_shorthand = true
use_try_shorthand = true
format_code_in_doc_comments = true
normalize_comments = true
normalize_doc_attributes = true
```

#### 2.1.2 Formatting Commands

```bash
# Format all files
cargo fmt

# Check formatting without modifying
cargo fmt -- --check

# Format with verbose output
cargo fmt -- --verbose
```

#### 2.1.3 Formatting Rules

- **Line length**: 100 characters for code, 80 for comments
- **Indentation**: 4 spaces (no tabs)
- **Import order**: std → external crates → internal modules
- **Trailing commas**: Required in multi-line match arms, arrays, structs
- **Function signatures**: Break at 100 characters
- **Chain calls**: Break at 60 characters

### 2.2 Linting (clippy)

#### 2.2.1 Configuration

Create `.clippy.toml` in the Rust project root:

```toml
# Cognitive complexity threshold
cognitive-complexity-threshold = 30

# Type complexity threshold
type-complexity-threshold = 500

# Single-char binding names threshold
single-char-binding-names-threshold = 4

# Too many arguments threshold
too-many-arguments-threshold = 7

# Too many lines threshold
too-many-lines-threshold = 200
```

Add to `Cargo.toml`:

```toml
[lints.clippy]
# Deny common mistakes
all = "deny"
correctness = "deny"
suspicious = "deny"
complexity = "warn"
perf = "warn"
style = "warn"

# Deny specific lints
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
todo = "deny"
unimplemented = "deny"

# Warn on documentation issues
missing_docs_in_private_items = "warn"
missing_errors_doc = "warn"
missing_panics_doc = "warn"

# Pedantic lints (warn)
pedantic = "warn"

# Allow some pedantic lints
module_name_repetitions = "allow"
missing_errors_doc = "allow"  # We document in traits

# Cargo lints
cargo = "warn"
```

#### 2.2.2 Clippy Commands

```bash
# Run clippy
cargo clippy

# Run clippy with all targets
cargo clippy --all-targets --all-features

# Fail on warnings
cargo clippy -- -D warnings

# Fix clippy warnings
cargo clippy --fix
```

#### 2.2.3 Allowed Exceptions

**In production code:**
```rust
// Never use unwrap/expect/panic in production paths
// Instead, return Result

// BAD:
let file = response.files.first().unwrap();

// GOOD:
let file = response.files.first()
    .ok_or(GoogleDriveError::FileNotFound { file_id: "unknown".into() })?;
```

**In test code:**
```rust
// Tests can use unwrap/expect for brevity
#[cfg(test)]
mod tests {
    #[test]
    fn test_parse_file() {
        let file: File = serde_json::from_str(JSON).unwrap();
        assert_eq!(file.id, "12345");
    }
}
```

**Temporary implementations:**
```rust
// Use #[allow] sparingly with justification
#[allow(clippy::todo)]  // TODO: Implement retry logic
pub async fn upload_with_retry(&self) -> Result<File, GoogleDriveError> {
    todo!("Retry logic pending integration-retry release")
}
```

### 2.3 Documentation (rustdoc)

#### 2.3.1 Documentation Standards

**All public items MUST have doc comments:**

```rust
/// Creates a new Google Drive client.
///
/// # Arguments
///
/// * `config` - Client configuration including auth and transport settings
///
/// # Returns
///
/// Returns a configured client ready for API calls.
///
/// # Errors
///
/// * `GoogleDriveError::Configuration` - Invalid configuration
///
/// # Example
///
/// ```
/// use google_drive::{GoogleDriveClient, GoogleDriveConfig};
///
/// let config = GoogleDriveConfig::default();
/// let client = GoogleDriveClient::new(config)?;
/// ```
pub fn new(config: GoogleDriveConfig) -> Result<Self, GoogleDriveError> {
    // ...
}
```

#### 2.3.2 Documentation Sections

Required sections for functions:
- **Summary**: One-line description
- **Arguments**: For each parameter
- **Returns**: What the function returns
- **Errors**: Which errors can occur
- **Examples**: At least one working example
- **Panics**: If function can panic (production code should not)
- **Safety**: If function is unsafe (should not be in public API)

#### 2.3.3 Documentation Commands

```bash
# Build documentation
cargo doc

# Build and open in browser
cargo doc --open

# Include private items
cargo doc --document-private-items

# Check for broken links
cargo doc --no-deps
```

#### 2.3.4 Documentation Tests

All examples in documentation MUST compile:

```rust
/// Example usage:
///
/// ```
/// use google_drive::GoogleDriveClient;
///
/// # async fn example() -> Result<(), google_drive::GoogleDriveError> {
/// let client = GoogleDriveClient::new(config)?;
/// let file = client.files().get("file_id", None).await?;
/// # Ok(())
/// # }
/// ```
```

Run doc tests:
```bash
cargo test --doc
```

### 2.4 Testing Patterns

#### 2.4.1 Unit Tests

**Organize tests in separate module:**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_id_validation() {
        assert!(is_valid_file_id("abc123XYZ-_"));
        assert!(!is_valid_file_id("invalid/id"));
    }

    #[tokio::test]
    async fn test_create_file() {
        let mock_transport = MockTransport::new();
        mock_transport.expect_send()
            .returning(|_| Ok(mock_response()));

        let client = create_test_client(mock_transport);
        let result = client.files().create(test_request()).await;

        assert!(result.is_ok());
    }
}
```

#### 2.4.2 Integration Tests

**Place in `tests/` directory:**

```rust
// tests/files_tests.rs
use google_drive::{GoogleDriveClient, GoogleDriveConfig};

#[tokio::test]
async fn test_create_and_get_file() {
    let client = create_test_client();

    // Create file
    let created = client.files()
        .create(CreateFileRequest::builder().name("test.txt").build())
        .await
        .expect("Failed to create file");

    // Get file
    let retrieved = client.files()
        .get(&created.id, None)
        .await
        .expect("Failed to get file");

    assert_eq!(created.id, retrieved.id);
}
```

#### 2.4.3 Mock Objects

**Use traits for mockability:**

```rust
#[cfg(test)]
pub mod mock {
    use super::*;
    use mockall::mock;

    mock! {
        pub Transport {}

        #[async_trait]
        impl HttpTransport for Transport {
            async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;
        }
    }
}
```

### 2.5 Safety Requirements

#### 2.5.1 No `unsafe` in Public API

- Public API MUST NOT contain `unsafe` code
- Internal `unsafe` MUST be justified and documented
- `unsafe` MUST be reviewed by two maintainers

#### 2.5.2 No Panics in Production Paths

**Forbidden patterns:**
```rust
// NEVER:
.unwrap()
.expect()
panic!()
todo!()
unimplemented!()
unreachable!()
```

**Allowed alternatives:**
```rust
// Use Result:
let value = option.ok_or(GoogleDriveError::MissingValue)?;

// Use default:
let value = option.unwrap_or_default();

// Use explicit error:
let value = match option {
    Some(v) => v,
    None => return Err(GoogleDriveError::MissingValue),
};
```

#### 2.5.3 Resource Management

**Always use RAII:**

```rust
// Automatic cleanup with Drop
pub struct ResumableUploadSession {
    upload_uri: String,
    client: Arc<HttpClient>,
}

impl Drop for ResumableUploadSession {
    fn drop(&mut self) {
        // Cleanup resources
        tracing::debug!(upload_uri = %self.upload_uri, "Dropping upload session");
    }
}
```

---

## 3. TypeScript Standards

### 3.1 ESLint Configuration

#### 3.1.1 ESLint Config File

Create `eslint.config.js`:

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Errors
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',

      // Warnings
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
      }],

      // Disabled
      '@typescript-eslint/no-non-null-assertion': 'off', // Use sparingly with justification
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  }
);
```

#### 3.1.2 ESLint Commands

```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Run on specific files
npx eslint src/**/*.ts
```

### 3.2 Prettier Formatting

#### 3.2.1 Prettier Config

Create `.prettierrc.json`:

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "proseWrap": "always"
}
```

#### 3.2.2 Prettier Commands

```bash
# Format all files
npm run format

# Check formatting
npm run format:check

# Format specific files
npx prettier --write src/**/*.ts
```

### 3.3 TSDoc Documentation

#### 3.3.1 TSDoc Standards

**All public APIs MUST have TSDoc comments:**

```typescript
/**
 * Creates a new file in Google Drive.
 *
 * This method creates a file with only metadata. To upload content,
 * use {@link createWithContent} or {@link createResumable}.
 *
 * @param request - File metadata and creation options
 * @returns Promise resolving to the created file metadata
 *
 * @throws {@link AuthenticationError} When credentials are invalid or expired
 * @throws {@link AuthorizationError} When insufficient permissions
 * @throws {@link QuotaError} When storage quota is exceeded
 * @throws {@link RequestError} When request parameters are invalid
 *
 * @example
 * Create a simple file:
 * ```typescript
 * const file = await client.files.create({
 *   name: 'document.txt',
 *   mimeType: 'text/plain'
 * });
 * console.log(`Created file: ${file.id}`);
 * ```
 *
 * @example
 * Create a file in a specific folder:
 * ```typescript
 * const file = await client.files.create({
 *   name: 'document.txt',
 *   parents: ['folder_id']
 * });
 * ```
 */
async create(request: CreateFileRequest): Promise<DriveFile> {
  // ...
}
```

#### 3.3.2 TSDoc Tags

Required tags:
- `@param` - For each parameter
- `@returns` - What is returned
- `@throws` - What errors can occur
- `@example` - At least one example
- `@deprecated` - If API is deprecated
- `@internal` - If not public API
- `@beta` - If API is experimental

Cross-references:
- `{@link Type}` - Link to type
- `{@link function}` - Link to function
- `@see OtherFunction` - See also reference

### 3.4 Type Safety Requirements

#### 3.4.1 Strict TypeScript Config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": false,

    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,

    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

#### 3.4.2 Type-Safe Error Handling

**Use discriminated unions:**

```typescript
type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function parseFile(data: unknown): Result<DriveFile, ValidationError> {
  try {
    const file = fileSchema.parse(data);
    return { ok: true, value: file };
  } catch (error) {
    return { ok: false, error: new ValidationError('Invalid file data', error) };
  }
}

// Usage
const result = parseFile(data);
if (result.ok) {
  console.log(result.value.id);
} else {
  console.error(result.error);
}
```

#### 3.4.3 Avoid `any`

**Never use `any` in public API:**

```typescript
// BAD:
function processFile(file: any): any {
  return file.id;
}

// GOOD:
function processFile(file: DriveFile): string {
  return file.id;
}

// For truly unknown data, use `unknown`:
function parseUnknown(data: unknown): DriveFile {
  if (!isValidFile(data)) {
    throw new ValidationError('Invalid file data');
  }
  return data;
}
```

### 3.5 Zod Validation Patterns

#### 3.5.1 Schema Definitions

**Define schemas for all external data:**

```typescript
import { z } from 'zod';

// File schema
export const fileSchema = z.object({
  kind: z.literal('drive#file'),
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  description: z.string().optional(),
  starred: z.boolean(),
  trashed: z.boolean(),
  parents: z.array(z.string()).optional(),
  properties: z.record(z.string()).optional(),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
  size: z.string().optional(),
  // ... more fields
});

export type DriveFile = z.infer<typeof fileSchema>;

// Request schema
export const createFileRequestSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().optional(),
  description: z.string().max(1000).optional(),
  parents: z.array(z.string()).max(10).optional(),
  properties: z.record(z.string()).optional(),
});

export type CreateFileRequest = z.infer<typeof createFileRequestSchema>;
```

#### 3.5.2 Validation Usage

**Validate at boundaries:**

```typescript
export class FilesService {
  async create(request: CreateFileRequest): Promise<DriveFile> {
    // Validate input
    const validatedRequest = createFileRequestSchema.parse(request);

    // Make API call
    const response = await this.transport.send({
      method: 'POST',
      url: '/files',
      body: validatedRequest,
    });

    // Validate output
    const file = fileSchema.parse(response.body);

    return file;
  }
}
```

#### 3.5.3 Custom Validators

**Create reusable validators:**

```typescript
// File ID validation
const fileIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid file ID format');

// Query syntax validation
const querySchema = z.string().refine(
  (q) => isValidQuery(q),
  'Invalid query syntax'
);

// MIME type validation
const mimeTypeSchema = z.string().refine(
  (mt) => isValidMimeType(mt),
  'Invalid MIME type'
);

// Chunk size validation
const chunkSizeSchema = z.number()
  .int()
  .positive()
  .multipleOf(256 * 1024, 'Chunk size must be multiple of 256KB');
```

---

## 4. Google Drive Specific Patterns

### 4.1 OAuth 2.0 Token Refresh Handling

#### 4.1.1 Token Management Strategy

**Proactive token refresh:**

```rust
pub struct OAuth2Provider {
    client_id: String,
    client_secret: SecretString,
    refresh_token: SecretString,
    cached_token: Arc<RwLock<Option<CachedToken>>>,
    token_refresh_margin: Duration, // Refresh before expiry
}

struct CachedToken {
    access_token: SecretString,
    expires_at: DateTime<Utc>,
}

impl OAuth2Provider {
    async fn get_access_token(&self) -> Result<AccessToken, AuthError> {
        let cached = self.cached_token.read().await;

        // Check if we have a valid cached token
        if let Some(token) = cached.as_ref() {
            let now = Utc::now();
            let refresh_threshold = token.expires_at - self.token_refresh_margin;

            if now < refresh_threshold {
                // Token still valid
                return Ok(AccessToken::from_cached(token));
            }
        }

        drop(cached); // Release read lock

        // Refresh token
        self.refresh_access_token().await
    }

    async fn refresh_access_token(&self) -> Result<AccessToken, AuthError> {
        let mut cached = self.cached_token.write().await;

        // Double-check after acquiring write lock
        if let Some(token) = cached.as_ref() {
            let now = Utc::now();
            if now < token.expires_at - self.token_refresh_margin {
                return Ok(AccessToken::from_cached(token));
            }
        }

        // Perform token refresh
        let response = self.request_token_refresh().await?;

        let new_token = CachedToken {
            access_token: SecretString::new(response.access_token),
            expires_at: Utc::now() + Duration::seconds(response.expires_in),
        };

        *cached = Some(new_token.clone());

        Ok(AccessToken::from_cached(&new_token))
    }
}
```

#### 4.1.2 Token Refresh Error Handling

```rust
async fn handle_auth_error(&self, error: &GoogleDriveError) -> Result<(), AuthError> {
    match error {
        GoogleDriveError::Authentication(AuthenticationError::ExpiredToken { .. }) => {
            // Clear cached token
            *self.cached_token.write().await = None;

            // Force refresh on next request
            Ok(())
        }
        GoogleDriveError::Authentication(AuthenticationError::InvalidToken { .. }) => {
            // Credentials are invalid, cannot recover
            Err(AuthError::InvalidCredentials)
        }
        _ => Ok(()),
    }
}
```

### 4.2 Service Account JWT Generation

#### 4.2.1 JWT Creation

**Rust implementation:**

```rust
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct ServiceAccountClaims {
    iss: String,        // Service account email
    sub: Option<String>, // Subject (for domain-wide delegation)
    aud: String,        // Token endpoint
    scope: String,      // Space-separated scopes
    iat: i64,           // Issued at
    exp: i64,           // Expires at
}

impl ServiceAccountProvider {
    fn create_jwt(&self) -> Result<String, AuthError> {
        let now = Utc::now().timestamp();

        let claims = ServiceAccountClaims {
            iss: self.service_account_email.clone(),
            sub: self.subject.clone(),
            aud: "https://oauth2.googleapis.com/token".to_string(),
            scope: self.scopes.join(" "),
            iat: now,
            exp: now + 3600, // 1 hour
        };

        let header = Header::new(Algorithm::RS256);

        let key = EncodingKey::from_rsa_pem(self.private_key.expose_secret().as_bytes())
            .map_err(|e| AuthError::InvalidPrivateKey(e.to_string()))?;

        encode(&header, &claims, &key)
            .map_err(|e| AuthError::JwtCreationFailed(e.to_string()))
    }

    async fn exchange_jwt_for_token(&self) -> Result<AccessToken, AuthError> {
        let jwt = self.create_jwt()?;

        let params = [
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt),
        ];

        let response = self.http_client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| AuthError::TokenExchangeFailed(e.to_string()))?;

        let token_response: TokenResponse = response.json().await
            .map_err(|e| AuthError::InvalidTokenResponse(e.to_string()))?;

        Ok(AccessToken {
            token: SecretString::new(token_response.access_token),
            token_type: token_response.token_type,
            expires_at: Utc::now() + Duration::seconds(token_response.expires_in),
            scopes: self.scopes.clone(),
        })
    }
}
```

**TypeScript implementation:**

```typescript
import { SignJWT } from 'jose';

export class ServiceAccountProvider implements AuthProvider {
  private async createJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const privateKey = await importPKCS8(
      this.credentials.privateKey,
      'RS256'
    );

    return new SignJWT({
      scope: this.credentials.scopes.join(' '),
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.credentials.clientEmail)
      .setSubject(this.credentials.subject)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  }

  private async exchangeJwtForToken(): Promise<AccessToken> {
    const jwt = await this.createJwt();

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new AuthenticationError('JWT exchange failed');
    }

    const data = await response.json();

    return {
      token: data.access_token,
      tokenType: data.token_type,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: this.credentials.scopes,
    };
  }
}
```

### 4.3 Resumable Upload Chunk Management

#### 4.3.1 Chunk Size Validation

```rust
const MIN_CHUNK_SIZE: usize = 256 * 1024; // 256 KB

fn validate_chunk_size(size: usize) -> Result<(), UploadError> {
    if size < MIN_CHUNK_SIZE {
        return Err(UploadError::ChunkTooSmall {
            size,
            minimum: MIN_CHUNK_SIZE,
        });
    }

    if size % MIN_CHUNK_SIZE != 0 {
        return Err(UploadError::InvalidChunkSize {
            size,
            message: format!("Chunk size must be multiple of {} bytes", MIN_CHUNK_SIZE),
        });
    }

    Ok(())
}
```

#### 4.3.2 Resumable Upload Session

```rust
pub struct ResumableUploadSession {
    upload_uri: String,
    total_size: u64,
    chunk_size: usize,
    transport: Arc<dyn HttpTransport>,
}

impl ResumableUploadSession {
    pub async fn upload_chunk(
        &self,
        chunk: Bytes,
        offset: u64,
    ) -> Result<UploadChunkResult, GoogleDriveError> {
        let chunk_len = chunk.len() as u64;
        let end = offset + chunk_len - 1;

        let request = HttpRequest {
            method: HttpMethod::PUT,
            url: Url::parse(&self.upload_uri)?,
            headers: {
                let mut headers = HeaderMap::new();
                headers.insert(
                    "Content-Length",
                    chunk_len.to_string().parse().unwrap(),
                );
                headers.insert(
                    "Content-Range",
                    format!("bytes {}-{}/{}", offset, end, self.total_size)
                        .parse()
                        .unwrap(),
                );
                headers
            },
            body: Some(RequestBody::Bytes(chunk)),
            timeout: None,
        };

        let response = self.transport.send(request).await?;

        match response.status.as_u16() {
            200 | 201 => {
                // Upload complete
                let file: File = serde_json::from_slice(&response.body)?;
                Ok(UploadChunkResult::Complete(file))
            }
            308 => {
                // More chunks needed
                let range_header = response.headers
                    .get("Range")
                    .and_then(|h| h.to_str().ok())
                    .ok_or(UploadError::MissingRangeHeader)?;

                let bytes_received = parse_range_header(range_header)?;
                Ok(UploadChunkResult::InProgress { bytes_received })
            }
            _ => {
                Err(map_upload_error(response))
            }
        }
    }

    pub async fn resume(&self) -> Result<UploadStatus, GoogleDriveError> {
        let request = HttpRequest {
            method: HttpMethod::PUT,
            url: Url::parse(&self.upload_uri)?,
            headers: {
                let mut headers = HeaderMap::new();
                headers.insert("Content-Length", "0".parse().unwrap());
                headers.insert(
                    "Content-Range",
                    format!("bytes */{}", self.total_size).parse().unwrap(),
                );
                headers
            },
            body: None,
            timeout: None,
        };

        let response = self.transport.send(request).await?;

        if response.status.as_u16() == 308 {
            let range_header = response.headers
                .get("Range")
                .and_then(|h| h.to_str().ok())
                .ok_or(UploadError::MissingRangeHeader)?;

            let bytes_received = parse_range_header(range_header)?;

            Ok(UploadStatus {
                bytes_received,
                total_size: self.total_size,
                is_complete: false,
            })
        } else {
            Err(UploadError::ResumeFailed.into())
        }
    }
}

fn parse_range_header(header: &str) -> Result<u64, UploadError> {
    // Parse "bytes=0-123456" to get 123457 (last byte + 1)
    let parts: Vec<&str> = header.split('=').collect();
    if parts.len() != 2 || parts[0] != "bytes" {
        return Err(UploadError::InvalidRangeHeader(header.to_string()));
    }

    let range_parts: Vec<&str> = parts[1].split('-').collect();
    if range_parts.len() != 2 {
        return Err(UploadError::InvalidRangeHeader(header.to_string()));
    }

    let end: u64 = range_parts[1].parse()
        .map_err(|_| UploadError::InvalidRangeHeader(header.to_string()))?;

    Ok(end + 1)
}
```

### 4.4 nextPageToken Pagination

#### 4.4.1 Pagination Iterator

**Rust implementation:**

```rust
use futures::stream::{Stream, StreamExt};
use pin_project::pin_project;

#[pin_project]
pub struct PaginationStream<T> {
    #[pin]
    state: PaginationState<T>,
}

enum PaginationState<T> {
    Ready {
        fetch_page: Box<dyn Fn(Option<String>) -> BoxFuture<'static, Result<Page<T>, GoogleDriveError>>>,
        next_token: Option<String>,
    },
    Fetching(BoxFuture<'static, Result<Page<T>, GoogleDriveError>>),
    Done,
}

struct Page<T> {
    items: Vec<T>,
    next_page_token: Option<String>,
}

impl<T> Stream for PaginationStream<T> {
    type Item = Result<T, GoogleDriveError>;

    fn poll_next(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        let mut this = self.as_mut().project();

        loop {
            match this.state.as_mut().get_mut() {
                PaginationState::Ready { fetch_page, next_token } => {
                    let token = next_token.take();
                    let future = fetch_page(token);
                    this.state.set(PaginationState::Fetching(future));
                }
                PaginationState::Fetching(future) => {
                    match future.as_mut().poll(cx) {
                        Poll::Ready(Ok(page)) => {
                            let next_token = page.next_page_token;
                            let mut items = page.items;

                            if let Some(item) = items.pop() {
                                this.state.set(PaginationState::Ready {
                                    fetch_page: /* ... */,
                                    next_token,
                                });
                                return Poll::Ready(Some(Ok(item)));
                            } else if next_token.is_some() {
                                this.state.set(PaginationState::Ready {
                                    fetch_page: /* ... */,
                                    next_token,
                                });
                            } else {
                                this.state.set(PaginationState::Done);
                                return Poll::Ready(None);
                            }
                        }
                        Poll::Ready(Err(err)) => {
                            this.state.set(PaginationState::Done);
                            return Poll::Ready(Some(Err(err)));
                        }
                        Poll::Pending => return Poll::Pending,
                    }
                }
                PaginationState::Done => return Poll::Ready(None),
            }
        }
    }
}
```

**TypeScript implementation:**

```typescript
export class PageIterator<T> implements AsyncIterable<T> {
  private nextPageToken?: string;
  private done = false;

  constructor(
    private fetchPage: (pageToken?: string) => Promise<Page<T>>
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (!this.done) {
      const page = await this.fetchPage(this.nextPageToken);

      for (const item of page.items) {
        yield item;
      }

      if (page.nextPageToken) {
        this.nextPageToken = page.nextPageToken;
      } else {
        this.done = true;
      }
    }
  }

  async nextPage(): Promise<T[] | null> {
    if (this.done) {
      return null;
    }

    const page = await this.fetchPage(this.nextPageToken);

    if (page.nextPageToken) {
      this.nextPageToken = page.nextPageToken;
    } else {
      this.done = true;
    }

    return page.items;
  }

  async collectAll(): Promise<T[]> {
    const results: T[] = [];

    for await (const item of this) {
      results.push(item);
    }

    return results;
  }
}
```

### 4.5 Query String Syntax Validation

#### 4.5.1 Query Parser

```rust
pub fn validate_query(query: &str) -> Result<(), RequestError> {
    let tokens = tokenize_query(query)?;
    parse_query_tokens(&tokens)?;
    Ok(())
}

#[derive(Debug, PartialEq)]
enum QueryToken {
    Field(String),
    Operator(Operator),
    Value(String),
    Paren(char),
    And,
    Or,
    Not,
}

#[derive(Debug, PartialEq)]
enum Operator {
    Equals,
    NotEquals,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
    Contains,
    In,
}

fn tokenize_query(query: &str) -> Result<Vec<QueryToken>, RequestError> {
    // Tokenization logic
    // Examples:
    // "name = 'document.txt'" -> [Field("name"), Operator(Equals), Value("document.txt")]
    // "'folder_id' in parents" -> [Value("folder_id"), Operator(In), Field("parents")]
    todo!()
}

fn parse_query_tokens(tokens: &[QueryToken]) -> Result<(), RequestError> {
    // Validate syntax
    // Check for:
    // - Balanced parentheses
    // - Valid operator usage
    // - Proper value quoting
    // - Valid field names
    todo!()
}
```

#### 4.5.2 Query Builder

```rust
pub struct QueryBuilder {
    clauses: Vec<String>,
}

impl QueryBuilder {
    pub fn new() -> Self {
        Self {
            clauses: Vec::new(),
        }
    }

    pub fn name_equals(mut self, name: &str) -> Self {
        self.clauses.push(format!("name = '{}'", escape_value(name)));
        self
    }

    pub fn mime_type(mut self, mime_type: &str) -> Self {
        self.clauses.push(format!("mimeType = '{}'", escape_value(mime_type)));
        self
    }

    pub fn in_folder(mut self, folder_id: &str) -> Self {
        self.clauses.push(format!("'{}' in parents", escape_value(folder_id)));
        self
    }

    pub fn not_trashed(mut self) -> Self {
        self.clauses.push("trashed = false".to_string());
        self
    }

    pub fn starred(mut self) -> Self {
        self.clauses.push("starred = true".to_string());
        self
    }

    pub fn modified_after(mut self, time: DateTime<Utc>) -> Self {
        self.clauses.push(format!(
            "modifiedTime > '{}'",
            time.to_rfc3339_opts(SecondsFormat::Secs, true)
        ));
        self
    }

    pub fn build(self) -> String {
        self.clauses.join(" and ")
    }
}

fn escape_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

// Usage:
// let query = QueryBuilder::new()
//     .in_folder("folder_id")
//     .not_trashed()
//     .mime_type("application/pdf")
//     .build();
// => "'folder_id' in parents and trashed = false and mimeType = 'application/pdf'"
```

### 4.6 MIME Type Handling

#### 4.6.1 MIME Type Constants

```rust
pub mod mime_types {
    pub const FOLDER: &str = "application/vnd.google-apps.folder";
    pub const DOCUMENT: &str = "application/vnd.google-apps.document";
    pub const SPREADSHEET: &str = "application/vnd.google-apps.spreadsheet";
    pub const PRESENTATION: &str = "application/vnd.google-apps.presentation";
    pub const DRAWING: &str = "application/vnd.google-apps.drawing";
    pub const FORM: &str = "application/vnd.google-apps.form";
    pub const SCRIPT: &str = "application/vnd.google-apps.script";
    pub const SHORTCUT: &str = "application/vnd.google-apps.shortcut";

    // Export formats
    pub const PDF: &str = "application/pdf";
    pub const DOCX: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    pub const XLSX: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    pub const PPTX: &str = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    pub const TEXT: &str = "text/plain";
    pub const HTML: &str = "text/html";
    pub const CSV: &str = "text/csv";
    pub const JSON: &str = "application/json";
}

pub fn is_google_workspace_file(mime_type: &str) -> bool {
    mime_type.starts_with("application/vnd.google-apps.")
}

pub fn is_exportable(mime_type: &str) -> bool {
    matches!(
        mime_type,
        mime_types::DOCUMENT
            | mime_types::SPREADSHEET
            | mime_types::PRESENTATION
            | mime_types::DRAWING
            | mime_types::SCRIPT
    )
}

pub fn get_export_formats(mime_type: &str) -> Vec<&'static str> {
    match mime_type {
        mime_types::DOCUMENT => vec![
            mime_types::PDF,
            mime_types::DOCX,
            mime_types::TEXT,
            mime_types::HTML,
        ],
        mime_types::SPREADSHEET => vec![
            mime_types::PDF,
            mime_types::XLSX,
            mime_types::CSV,
        ],
        mime_types::PRESENTATION => vec![
            mime_types::PDF,
            mime_types::PPTX,
        ],
        _ => vec![],
    }
}
```

### 4.7 File ID Validation Patterns

```rust
use regex::Regex;

lazy_static::lazy_static! {
    static ref FILE_ID_REGEX: Regex = Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap();
}

pub fn validate_file_id(file_id: &str) -> Result<(), RequestError> {
    if file_id.is_empty() {
        return Err(RequestError::InvalidParameter {
            parameter: "file_id".to_string(),
            message: "File ID cannot be empty".to_string(),
        });
    }

    if file_id.len() > 1024 {
        return Err(RequestError::InvalidParameter {
            parameter: "file_id".to_string(),
            message: "File ID too long".to_string(),
        });
    }

    if !FILE_ID_REGEX.is_match(file_id) {
        return Err(RequestError::InvalidParameter {
            parameter: "file_id".to_string(),
            message: "File ID contains invalid characters".to_string(),
        });
    }

    Ok(())
}
```

---

## 5. Testing Requirements

### 5.1 Unit Test Requirements

#### 5.1.1 Coverage Requirements

All modules MUST have unit tests covering:
- Happy path scenarios
- Error conditions
- Edge cases
- Boundary conditions
- Input validation

#### 5.1.2 Test Organization

```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod validation {
        use super::*;

        #[test]
        fn test_valid_file_id() {
            assert!(validate_file_id("abc123XYZ-_").is_ok());
        }

        #[test]
        fn test_invalid_file_id_empty() {
            assert!(validate_file_id("").is_err());
        }

        #[test]
        fn test_invalid_file_id_special_chars() {
            assert!(validate_file_id("invalid/id").is_err());
        }
    }

    mod auth {
        use super::*;

        #[tokio::test]
        async fn test_token_refresh() {
            // Test implementation
        }
    }
}
```

#### 5.1.3 Mock Objects

Use trait-based mocking:

```rust
#[cfg(test)]
mod tests {
    use mockall::mock;

    mock! {
        pub HttpTransport {}

        #[async_trait]
        impl HttpTransport for HttpTransport {
            async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;
        }
    }

    #[tokio::test]
    async fn test_create_file() {
        let mut mock_transport = MockHttpTransport::new();

        mock_transport
            .expect_send()
            .times(1)
            .returning(|req| {
                assert_eq!(req.method, HttpMethod::POST);
                assert_eq!(req.url.path(), "/drive/v3/files");

                Ok(HttpResponse {
                    status: StatusCode::OK,
                    headers: HeaderMap::new(),
                    body: serde_json::to_vec(&mock_file()).unwrap().into(),
                })
            });

        let client = create_test_client(Arc::new(mock_transport));
        let result = client.files().create(test_request()).await;

        assert!(result.is_ok());
    }
}
```

### 5.2 Integration Test Requirements

#### 5.2.1 Test Scenarios

Integration tests MUST cover:
- End-to-end API workflows
- Authentication flows (OAuth 2.0, Service Account)
- Upload scenarios (simple, multipart, resumable)
- Download scenarios (full, streaming, range)
- Pagination scenarios
- Error handling and recovery
- Resilience patterns (retry, circuit breaker)

#### 5.2.2 Test Environment

**Option 1: Mock Server**

Use a mock HTTP server for deterministic testing:

```rust
// tests/common/mock_server.rs
use wiremock::{Mock, MockServer, ResponseTemplate};

pub async fn setup_mock_server() -> MockServer {
    let mock_server = MockServer::start().await;

    // Setup auth endpoint
    Mock::given(method("POST"))
        .and(path("/oauth2/v4/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "mock_token",
            "token_type": "Bearer",
            "expires_in": 3600,
        })))
        .mount(&mock_server)
        .await;

    mock_server
}
```

**Option 2: Real API (with caution)**

For real API testing:
- Use dedicated test account
- Clean up resources after tests
- Run only in CI with proper credentials
- Never commit credentials

```rust
// tests/integration/files_tests.rs
#[tokio::test]
#[ignore] // Run only with --ignored flag
async fn test_create_and_delete_file_real_api() {
    let client = create_real_client();

    // Create
    let file = client.files()
        .create(CreateFileRequest::builder().name("test.txt").build())
        .await
        .expect("Failed to create file");

    // Cleanup
    client.files()
        .delete(&file.id, None)
        .await
        .expect("Failed to delete file");
}
```

### 5.3 Mock Transport Patterns

#### 5.3.1 Mock Transport Implementation

```rust
pub struct MockTransport {
    responses: Arc<Mutex<VecDeque<Result<HttpResponse, TransportError>>>>,
}

impl MockTransport {
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    pub fn add_response(&self, response: Result<HttpResponse, TransportError>) {
        self.responses.lock().unwrap().push_back(response);
    }

    pub fn add_success(&self, body: impl Serialize) {
        let response = HttpResponse {
            status: StatusCode::OK,
            headers: HeaderMap::new(),
            body: serde_json::to_vec(&body).unwrap().into(),
        };
        self.add_response(Ok(response));
    }

    pub fn add_error(&self, status: StatusCode, error: ApiError) {
        let response = HttpResponse {
            status,
            headers: HeaderMap::new(),
            body: serde_json::to_vec(&error).unwrap().into(),
        };
        self.add_response(Ok(response));
    }
}

#[async_trait]
impl HttpTransport for MockTransport {
    async fn send(&self, _request: HttpRequest) -> Result<HttpResponse, TransportError> {
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(Err(TransportError::NoMockResponse))
    }
}
```

### 5.4 Test Coverage Targets

#### 5.4.1 Minimum Coverage

**Per-module targets:**

| Module | Line Coverage | Branch Coverage |
|--------|---------------|-----------------|
| Core client | 85% | 80% |
| Authentication | 90% | 85% |
| Transport | 85% | 80% |
| Services | 85% | 80% |
| Upload | 85% | 80% |
| Error handling | 95% | 90% |
| Validation | 95% | 90% |
| Pagination | 85% | 80% |

**Overall target: >80%**

#### 5.4.2 Coverage Tools

**Rust:**
```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Run coverage
cargo tarpaulin --out Html --out Lcov

# View report
open tarpaulin-report.html
```

**TypeScript:**
```bash
# Using c8
npm test -- --coverage

# Generate HTML report
npm test -- --coverage --reporter=html

# View report
open coverage/index.html
```

---

## 6. Coverage Targets

### 6.1 Component Coverage Matrix

| Component | Target | Rationale |
|-----------|--------|-----------|
| Core client | 90% | Critical entry point, high test value |
| Authentication | 85% | Security-critical, complex logic |
| Transport | 80% | Well-abstracted, simple logic |
| Services | 85% | Main API surface, high usage |
| Error handling | 90% | Must handle all error cases |
| Upload management | 85% | Complex state machine |
| Pagination | 85% | Iterator logic requires testing |
| Validation | 90% | Input validation critical |
| Telemetry | 70% | Observability, lower risk |
| Type definitions | 60% | Mostly data structures |

### 6.2 Coverage Enforcement

#### 6.2.1 CI Integration

```yaml
# .github/workflows/ci.yml
- name: Run tests with coverage
  run: cargo tarpaulin --workspace --out Xml --out Lcov

- name: Check coverage thresholds
  run: |
    coverage=$(grep -oP 'line-rate="\K[^"]+' coverage.xml | head -1)
    threshold=0.80
    if (( $(echo "$coverage < $threshold" | bc -l) )); then
      echo "Coverage $coverage is below threshold $threshold"
      exit 1
    fi

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage.xml
    fail_ci_if_error: true
```

#### 6.2.2 Coverage Reports

Generate coverage reports in multiple formats:
- HTML for human review
- LCOV for CI integration
- Cobertura for IDE integration
- JSON for programmatic analysis

---

## 7. Performance Benchmarks

### 7.1 Benchmark Definitions

#### 7.1.1 Request Serialization

**Target: < 1ms (p50), < 5ms (p99)**

```rust
// benches/serialization.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_serialize_create_request(c: &mut Criterion) {
    let request = CreateFileRequest {
        name: "test.txt".to_string(),
        mime_type: Some("text/plain".to_string()),
        parents: Some(vec!["folder_id".to_string()]),
        ..Default::default()
    };

    c.bench_function("serialize create request", |b| {
        b.iter(|| {
            serde_json::to_vec(black_box(&request))
        });
    });
}

criterion_group!(benches, benchmark_serialize_create_request);
criterion_main!(benches);
```

#### 7.1.2 Response Deserialization

**Target: < 5ms (p50), < 20ms (p99)**

```rust
fn benchmark_deserialize_file(c: &mut Criterion) {
    let json = include_str!("../tests/data/file_response.json");

    c.bench_function("deserialize file", |b| {
        b.iter(|| {
            serde_json::from_str::<File>(black_box(json))
        });
    });
}
```

#### 7.1.3 Token Refresh

**Target: < 500ms (p50), < 2s (p99)**

```rust
#[tokio::main]
async fn benchmark_token_refresh(c: &mut Criterion) {
    let provider = create_test_oauth2_provider();

    c.bench_function("token refresh", |b| {
        b.iter(|| async {
            provider.refresh_token().await
        });
    });
}
```

#### 7.1.4 Pagination Iteration

**Target: < 1ms overhead (p50), < 5ms (p99)**

```rust
fn benchmark_pagination_stream(c: &mut Criterion) {
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let mock_client = create_mock_client_with_pages(10, 100);

    c.bench_function("pagination stream 1000 items", |b| {
        b.iter(|| {
            runtime.block_on(async {
                let stream = mock_client.files().list_all(None);
                let items: Vec<_> = stream.collect().await;
                items
            })
        });
    });
}
```

### 7.2 Benchmark Execution

```bash
# Run all benchmarks
cargo bench

# Run specific benchmark
cargo bench --bench serialization

# Save baseline
cargo bench --save-baseline main

# Compare against baseline
cargo bench --baseline main

# Generate HTML report
cargo bench -- --verbose
```

### 7.3 Performance Regression Detection

**CI Integration:**

```yaml
- name: Run benchmarks
  run: cargo bench --bench serialization -- --save-baseline PR-${{ github.event.pull_request.number }}

- name: Compare with main
  run: |
    cargo bench --bench serialization -- --baseline main --load-baseline PR-${{ github.event.pull_request.number }}

- name: Check for regressions
  run: |
    # Fail if performance degraded by >10%
    ./scripts/check_benchmark_regression.sh
```

---

## 8. Documentation Standards

### 8.1 API Documentation

#### 8.1.1 Required Elements

Every public API MUST document:
1. **Purpose**: What does it do?
2. **Parameters**: What inputs does it accept?
3. **Returns**: What does it return?
4. **Errors**: What can go wrong?
5. **Examples**: How to use it?
6. **See Also**: Related functions/types

#### 8.1.2 Documentation Template

**Rust:**
```rust
/// [One-line summary]
///
/// [Detailed description, multiple paragraphs if needed]
///
/// # Arguments
///
/// * `param1` - Description of param1
/// * `param2` - Description of param2
///
/// # Returns
///
/// Returns [description of return value]
///
/// # Errors
///
/// * `ErrorType1` - When [condition]
/// * `ErrorType2` - When [condition]
///
/// # Examples
///
/// [Example title]:
/// ```
/// [working code example]
/// ```
///
/// [Another example title]:
/// ```
/// [another working code example]
/// ```
///
/// # See Also
///
/// * [`related_function`]
/// * [`RelatedType`]
pub fn function_name() { }
```

**TypeScript:**
```typescript
/**
 * [One-line summary]
 *
 * [Detailed description]
 *
 * @param param1 - Description of param1
 * @param param2 - Description of param2
 * @returns Description of return value
 *
 * @throws {@link ErrorType1} When [condition]
 * @throws {@link ErrorType2} When [condition]
 *
 * @example
 * [Example title]:
 * ```typescript
 * [working code example]
 * ```
 *
 * @example
 * [Another example title]:
 * ```typescript
 * [another working code example]
 * ```
 *
 * @see {@link relatedFunction}
 * @see {@link RelatedType}
 */
function functionName(): ReturnType { }
```

### 8.2 Examples for Common Operations

#### 8.2.1 Required Examples

The following examples MUST be included in documentation:

1. **Authentication Setup**
   - OAuth 2.0 authentication
   - Service Account authentication

2. **File Operations**
   - Create file with metadata
   - Upload small file
   - Upload large file (resumable)
   - Download file
   - List files with query
   - Update file metadata
   - Delete file

3. **Folder Operations**
   - Create folder
   - List folder contents
   - Move file to folder

4. **Permissions**
   - Share file with user
   - Share folder with group
   - Make file public

5. **Advanced**
   - Streaming download
   - Resumable upload with progress
   - Pagination with async iterator
   - Change tracking

### 8.3 Error Handling Documentation

#### 8.3.1 Error Documentation Template

```rust
/// # Errors
///
/// This function can fail with the following errors:
///
/// ## Authentication Errors
///
/// * [`AuthenticationError::InvalidToken`] - Access token is invalid
/// * [`AuthenticationError::ExpiredToken`] - Access token has expired
///
/// **Recovery**: Call [`AuthProvider::refresh_token`] to obtain a new token
///
/// ## Authorization Errors
///
/// * [`AuthorizationError::InsufficientPermissions`] - User lacks required permissions
///
/// **Recovery**: Grant appropriate permissions or use different credentials
///
/// ## Resource Errors
///
/// * [`ResourceError::FileNotFound`] - File with given ID does not exist
///
/// **Recovery**: Verify file ID is correct and file has not been deleted
///
/// ## Quota Errors
///
/// * [`QuotaError::StorageQuotaExceeded`] - Account storage quota exceeded
///
/// **Recovery**: Free up space or upgrade storage plan
///
/// ## Network Errors
///
/// * [`NetworkError::Timeout`] - Request timed out
/// * [`NetworkError::ConnectionFailed`] - Network connection failed
///
/// **Recovery**: These errors are retryable. The client will automatically retry with exponential backoff.
```

### 8.4 Configuration Options

#### 8.4.1 Configuration Documentation

All configuration options MUST document:
- Purpose and effect
- Default value
- Valid range/values
- Performance implications
- Security implications

```rust
/// Configuration for the Google Drive client.
///
/// # Examples
///
/// Default configuration:
/// ```
/// use google_drive::GoogleDriveConfig;
///
/// let config = GoogleDriveConfig::default();
/// ```
///
/// Custom configuration:
/// ```
/// use google_drive::{GoogleDriveConfig, OAuth2Provider};
/// use std::time::Duration;
///
/// let config = GoogleDriveConfig {
///     auth_provider: Arc::new(OAuth2Provider::new(/* ... */)),
///     timeout: Duration::from_secs(60),
///     max_retries: 5,
///     upload_chunk_size: 8 * 1024 * 1024, // 8MB
///     ..Default::default()
/// };
/// ```
pub struct GoogleDriveConfig {
    /// Authentication provider for obtaining access tokens.
    ///
    /// This can be either an OAuth 2.0 provider or Service Account provider.
    ///
    /// **Required**: Yes
    pub auth_provider: Arc<dyn AuthProvider>,

    /// Request timeout duration.
    ///
    /// **Default**: 300 seconds (5 minutes)
    /// **Range**: 1 second to 3600 seconds
    /// **Performance**: Lower values fail faster but may timeout legitimate slow requests
    pub timeout: Duration,

    /// Maximum number of retry attempts for transient failures.
    ///
    /// **Default**: 3
    /// **Range**: 0 (no retries) to 10
    /// **Performance**: Higher values improve reliability but increase latency
    pub max_retries: u32,

    /// Chunk size for resumable uploads (in bytes).
    ///
    /// **Default**: 8,388,608 (8 MB)
    /// **Constraint**: Must be multiple of 262,144 (256 KB)
    /// **Performance**: Larger chunks reduce overhead but increase memory usage
    /// **Security**: N/A
    pub upload_chunk_size: usize,
}
```

---

## 9. Review Criteria

### 9.1 Code Review Checklist

#### 9.1.1 Functionality
- [ ] Code implements spec requirements correctly
- [ ] All acceptance criteria met
- [ ] Edge cases handled
- [ ] Error handling comprehensive
- [ ] No logic errors

#### 9.1.2 Code Quality
- [ ] Follows naming conventions
- [ ] Properly organized in modules
- [ ] No code duplication
- [ ] Functions are single-purpose
- [ ] Complexity is reasonable (<30 cognitive complexity)

#### 9.1.3 Testing
- [ ] Unit tests present and passing
- [ ] Integration tests present and passing
- [ ] Coverage meets targets
- [ ] Tests are meaningful (not just coverage)
- [ ] Test names are descriptive

#### 9.1.4 Documentation
- [ ] All public APIs documented
- [ ] Examples are working
- [ ] Error conditions documented
- [ ] Complex logic has comments
- [ ] Module-level docs present

#### 9.1.5 Performance
- [ ] No obvious performance issues
- [ ] Appropriate data structures used
- [ ] No unnecessary allocations
- [ ] Streaming used for large data
- [ ] Benchmarks passing

#### 9.1.6 Style
- [ ] `cargo fmt` / `prettier` passing
- [ ] `clippy` / `eslint` passing
- [ ] No compiler warnings
- [ ] Consistent style throughout

### 9.2 Security Review Checklist

#### 9.2.1 Credential Handling
- [ ] No credentials in logs
- [ ] No credentials in error messages
- [ ] Secrets use `SecretString` (Rust) or proper protection (TS)
- [ ] No credentials in debug output
- [ ] Credentials cleared from memory when done

#### 9.2.2 Input Validation
- [ ] All external input validated
- [ ] File IDs validated
- [ ] Query strings validated
- [ ] MIME types validated
- [ ] No SQL/command injection vectors

#### 9.2.3 Transport Security
- [ ] TLS 1.2+ enforced
- [ ] Certificate validation enabled
- [ ] No insecure HTTP
- [ ] No insecure fallbacks

#### 9.2.4 Authentication
- [ ] OAuth 2.0 implemented correctly
- [ ] Service Account JWT signed correctly
- [ ] Token refresh works
- [ ] Expired tokens handled
- [ ] Invalid tokens handled

#### 9.2.5 Authorization
- [ ] Scopes validated
- [ ] Permissions checked
- [ ] No privilege escalation
- [ ] Domain-wide delegation secured

### 9.3 Performance Review Checklist

#### 9.3.1 Latency
- [ ] Request serialization < 1ms (p50)
- [ ] Response deserialization < 5ms (p50)
- [ ] Token refresh < 500ms (p50)
- [ ] No blocking operations in async code

#### 9.3.2 Throughput
- [ ] Pagination doesn't block on every item
- [ ] Upload chunks at appropriate size
- [ ] Download uses streaming
- [ ] Connection pooling configured

#### 9.3.3 Resource Usage
- [ ] Memory usage bounded
- [ ] No memory leaks
- [ ] File handles closed
- [ ] Network connections reused

#### 9.3.4 Scalability
- [ ] Handles large file lists
- [ ] Handles large file uploads/downloads
- [ ] Concurrent requests supported
- [ ] Rate limiting respected

---

## 10. Quality Gates

### 10.1 Gate 1: Compilation/Build

**Rust:**
```bash
cargo build --all-targets --all-features
```

**TypeScript:**
```bash
npm run build
```

**Success Criteria:**
- No compilation errors
- No compiler warnings
- All type checks pass

### 10.2 Gate 2: Unit Tests Pass

**Rust:**
```bash
cargo test --lib
```

**TypeScript:**
```bash
npm run test:unit
```

**Success Criteria:**
- All unit tests pass
- No flaky tests
- Tests complete in < 30 seconds

### 10.3 Gate 3: Integration Tests Pass

**Rust:**
```bash
cargo test --test '*'
```

**TypeScript:**
```bash
npm run test:integration
```

**Success Criteria:**
- All integration tests pass
- Mock server tests pass
- Real API tests pass (in CI only)

### 10.4 Gate 4: Coverage Thresholds Met

```bash
# Rust
cargo tarpaulin --workspace --out Xml
./scripts/check_coverage.sh 80

# TypeScript
npm test -- --coverage
./scripts/check_coverage.sh 80
```

**Success Criteria:**
- Overall coverage > 80%
- Component coverage meets targets
- No critical paths uncovered

### 10.5 Gate 5: No Lint Errors

**Rust:**
```bash
cargo clippy --all-targets --all-features -- -D warnings
```

**TypeScript:**
```bash
npm run lint
```

**Success Criteria:**
- No clippy warnings
- No eslint errors
- Code formatted correctly

### 10.6 Gate 6: Documentation Complete

**Rust:**
```bash
cargo doc --no-deps --document-private-items
./scripts/check_doc_coverage.sh
```

**TypeScript:**
```bash
npm run docs
./scripts/check_doc_coverage.sh
```

**Success Criteria:**
- All public APIs documented
- Doc examples compile and run
- No broken links
- Doc coverage > 95%

### 10.7 Gate 7: Security Scan Clean

```bash
# Rust
cargo audit
cargo deny check

# TypeScript
npm audit
```

**Success Criteria:**
- No high/critical vulnerabilities
- All dependencies approved
- License compliance verified

---

## 11. CI Configuration

### 11.1 GitHub Actions Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  rust-test:
    name: Rust Tests
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        rust: [stable, beta, nightly]
        exclude:
          - os: windows-latest
            rust: nightly
          - os: macos-latest
            rust: nightly

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@master
        with:
          toolchain: ${{ matrix.rust }}
          components: rustfmt, clippy

      - name: Cache cargo registry
        uses: actions/cache@v3
        with:
          path: ~/.cargo/registry
          key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

      - name: Cache cargo index
        uses: actions/cache@v3
        with:
          path: ~/.cargo/git
          key: ${{ runner.os }}-cargo-index-${{ hashFiles('**/Cargo.lock') }}

      - name: Cache cargo build
        uses: actions/cache@v3
        with:
          path: target
          key: ${{ runner.os }}-cargo-build-target-${{ hashFiles('**/Cargo.lock') }}

      - name: Check formatting
        run: cargo fmt -- --check

      - name: Run clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Build
        run: cargo build --all-targets --all-features

      - name: Run tests
        run: cargo test --all-features

      - name: Run doc tests
        run: cargo test --doc

  rust-coverage:
    name: Rust Coverage
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install tarpaulin
        run: cargo install cargo-tarpaulin

      - name: Generate coverage
        run: cargo tarpaulin --workspace --out Xml --out Lcov

      - name: Check coverage threshold
        run: |
          coverage=$(grep -oP 'line-rate="\K[^"]+' cobertura.xml | head -1)
          threshold=0.80
          if (( $(echo "$coverage < $threshold" | bc -l) )); then
            echo "Coverage $coverage is below threshold $threshold"
            exit 1
          fi

      - name: Upload to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./cobertura.xml
          flags: rust
          fail_ci_if_error: true

  typescript-test:
    name: TypeScript Tests
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check formatting
        run: npm run format:check

      - name: Run linter
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Run tests with coverage
        run: npm test -- --coverage
        if: matrix.node == 20 && matrix.os == 'ubuntu-latest'

      - name: Check coverage threshold
        run: ./scripts/check_coverage.sh 80
        if: matrix.node == 20 && matrix.os == 'ubuntu-latest'

      - name: Upload to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: typescript
          fail_ci_if_error: true
        if: matrix.node == 20 && matrix.os == 'ubuntu-latest'

  security:
    name: Security Audit
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Rust security audit
        run: |
          cargo install cargo-audit
          cargo audit

      - name: TypeScript security audit
        run: npm audit --audit-level=high

  benchmarks:
    name: Performance Benchmarks
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run benchmarks
        run: cargo bench --bench serialization -- --save-baseline PR-${{ github.event.pull_request.number }}

      - name: Compare with main
        run: |
          git fetch origin main
          git checkout origin/main
          cargo bench --bench serialization -- --save-baseline main
          git checkout -
          cargo bench --bench serialization -- --baseline main
```

### 11.2 Test Matrix

#### 11.2.1 Rust Versions

Test on:
- Stable (MSRV: 1.70+)
- Beta
- Nightly (allow failures)

#### 11.2.2 Node Versions

Test on:
- Node 18 LTS
- Node 20 LTS
- Node 22 (current)

#### 11.2.3 Operating Systems

Test on:
- Ubuntu Latest
- Windows Latest
- macOS Latest

### 11.3 Automated Release Process

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-rust:
    name: Publish Rust Crate
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Publish to crates.io
        run: cargo publish --token ${{ secrets.CARGO_REGISTRY_TOKEN }}
        working-directory: ./rust

  publish-typescript:
    name: Publish NPM Package
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci
        working-directory: ./typescript

      - name: Build
        run: npm run build
        working-directory: ./typescript

      - name: Publish to NPM
        run: npm publish
        working-directory: ./typescript
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  create-release:
    name: Create GitHub Release
    runs-on: ubuntu-latest
    needs: [publish-rust, publish-typescript]

    steps:
      - uses: actions/checkout@v4

      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          draft: false
          prerelease: false
```

---

## 12. Google Drive Specific Validation

### 12.1 Upload Chunk Size Validation

**Requirement**: Chunk size MUST be multiple of 256KB

```rust
const MIN_CHUNK_SIZE: usize = 256 * 1024; // 256 KB

pub fn validate_chunk_size(size: usize) -> Result<(), UploadError> {
    if size < MIN_CHUNK_SIZE {
        return Err(UploadError::ChunkTooSmall {
            size,
            minimum: MIN_CHUNK_SIZE,
        });
    }

    if size % MIN_CHUNK_SIZE != 0 {
        return Err(UploadError::InvalidChunkSize {
            size,
            message: format!(
                "Chunk size must be multiple of {} bytes (256KB)",
                MIN_CHUNK_SIZE
            ),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_chunk_sizes() {
        assert!(validate_chunk_size(256 * 1024).is_ok());
        assert!(validate_chunk_size(512 * 1024).is_ok());
        assert!(validate_chunk_size(8 * 1024 * 1024).is_ok());
    }

    #[test]
    fn test_invalid_chunk_sizes() {
        assert!(validate_chunk_size(100 * 1024).is_err()); // Too small
        assert!(validate_chunk_size(300 * 1024).is_err()); // Not multiple
        assert!(validate_chunk_size(1024).is_err()); // Way too small
    }
}
```

### 12.2 File ID Pattern Validation

**Requirement**: File IDs must match pattern `^[a-zA-Z0-9_-]+$`

```rust
use regex::Regex;

lazy_static::lazy_static! {
    static ref FILE_ID_REGEX: Regex = Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap();
}

pub fn validate_file_id(file_id: &str) -> Result<(), RequestError> {
    if file_id.is_empty() {
        return Err(RequestError::InvalidParameter {
            parameter: "file_id".to_string(),
            message: "File ID cannot be empty".to_string(),
        });
    }

    if file_id.len() > 1024 {
        return Err(RequestError::InvalidParameter {
            parameter: "file_id".to_string(),
            message: "File ID too long (max 1024 characters)".to_string(),
        });
    }

    if !FILE_ID_REGEX.is_match(file_id) {
        return Err(RequestError::InvalidParameter {
            parameter: "file_id".to_string(),
            message: "File ID contains invalid characters (allowed: a-zA-Z0-9_-)".to_string(),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_file_ids() {
        assert!(validate_file_id("abc123").is_ok());
        assert!(validate_file_id("ABC-xyz_123").is_ok());
        assert!(validate_file_id("1-2_3").is_ok());
    }

    #[test]
    fn test_invalid_file_ids() {
        assert!(validate_file_id("").is_err()); // Empty
        assert!(validate_file_id("invalid/id").is_err()); // Slash
        assert!(validate_file_id("invalid id").is_err()); // Space
        assert!(validate_file_id("invalid.id").is_err()); // Dot
        assert!(validate_file_id(&"a".repeat(1025)).is_err()); // Too long
    }
}
```

### 12.3 Query Syntax Validation

**Requirement**: Validate query syntax before sending

```rust
pub fn validate_query_syntax(query: &str) -> Result<(), RequestError> {
    // Check balanced parentheses
    let mut depth = 0;
    for ch in query.chars() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return Err(RequestError::InvalidQuery {
                        query: query.to_string(),
                        message: "Unbalanced parentheses".to_string(),
                    });
                }
            }
            _ => {}
        }
    }

    if depth != 0 {
        return Err(RequestError::InvalidQuery {
            query: query.to_string(),
            message: "Unbalanced parentheses".to_string(),
        });
    }

    // Check for valid operators
    let valid_operators = [
        "=", "!=", "<", ">", "<=", ">=",
        "contains", "in", "and", "or", "not"
    ];

    // Check for proper quoting
    validate_query_quotes(query)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_queries() {
        assert!(validate_query_syntax("name = 'test.txt'").is_ok());
        assert!(validate_query_syntax("'folder_id' in parents").is_ok());
        assert!(validate_query_syntax("(name = 'test') and (trashed = false)").is_ok());
    }

    #[test]
    fn test_invalid_queries() {
        assert!(validate_query_syntax("(name = 'test'").is_err()); // Unbalanced
        assert!(validate_query_syntax("name = test").is_err()); // Unquoted value
    }
}
```

### 12.4 Scope Validation

**Requirement**: Validate OAuth scopes

```rust
pub mod scopes {
    pub const DRIVE: &str = "https://www.googleapis.com/auth/drive";
    pub const DRIVE_READONLY: &str = "https://www.googleapis.com/auth/drive.readonly";
    pub const DRIVE_FILE: &str = "https://www.googleapis.com/auth/drive.file";
    pub const DRIVE_APPDATA: &str = "https://www.googleapis.com/auth/drive.appdata";
    pub const DRIVE_METADATA: &str = "https://www.googleapis.com/auth/drive.metadata";
    pub const DRIVE_METADATA_READONLY: &str = "https://www.googleapis.com/auth/drive.metadata.readonly";

    pub fn is_valid_scope(scope: &str) -> bool {
        matches!(
            scope,
            DRIVE
                | DRIVE_READONLY
                | DRIVE_FILE
                | DRIVE_APPDATA
                | DRIVE_METADATA
                | DRIVE_METADATA_READONLY
        )
    }

    pub fn validate_scopes(scopes: &[String]) -> Result<(), ConfigurationError> {
        if scopes.is_empty() {
            return Err(ConfigurationError::MissingScope);
        }

        for scope in scopes {
            if !is_valid_scope(scope) {
                return Err(ConfigurationError::InvalidScope {
                    scope: scope.clone(),
                });
            }
        }

        Ok(())
    }
}
```

### 12.5 Rate Limit Response Handling

**Requirement**: Handle 403/429 with retry-after

```rust
async fn handle_rate_limit_response(
    response: &HttpResponse,
) -> Result<(), GoogleDriveError> {
    let retry_after = response.headers
        .get("Retry-After")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .map(Duration::from_secs);

    match response.status.as_u16() {
        403 => {
            let error: ApiError = serde_json::from_slice(&response.body)?;

            if error.is_rate_limit_error() {
                Err(GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
                    message: error.message,
                    retry_after,
                }))
            } else {
                Err(map_403_error(error))
            }
        }
        429 => {
            Err(GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
                message: "Rate limit exceeded".to_string(),
                retry_after,
            }))
        }
        _ => Ok(()),
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial refinement document |

---

**End of Refinement Phase**

*This document defines the coding standards, testing requirements, and quality gates for implementing the Google Drive integration module. All implementations MUST adhere to these standards.*

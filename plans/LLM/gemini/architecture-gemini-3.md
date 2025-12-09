# Architecture: Google Gemini Integration Module - Part 3

**Security, Deployment, and Testing Architecture**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** SPARC Phase 3

---

## Table of Contents

1. [Security Architecture](#1-security-architecture)
2. [Deployment Architecture](#2-deployment-architecture)
3. [Testing Architecture](#3-testing-architecture)
4. [Observability Architecture](#4-observability-architecture)
5. [Performance Considerations](#5-performance-considerations)
6. [API Endpoint Reference](#6-api-endpoint-reference)

---

## 1. Security Architecture

### 1.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Gemini API Key Authentication:
─────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  User Application                                                            │
│       │                                                                      │
│       │ GeminiClient::builder()                                             │
│       │     .api_key("AIza...")  // From env or secure storage             │
│       │     .build()                                                         │
│       ▼                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         AuthManager                                    │  │
│  │                                                                        │  │
│  │  api_key: SecretString  // Wrapped in SecretString for safety         │  │
│  │  auth_method: AuthMethod::Header                                       │  │
│  │                                                                        │  │
│  │  fn apply_auth(&self, request: &mut HttpRequest):                     │  │
│  │      MATCH self.auth_method:                                           │  │
│  │          Header => request.headers.insert(                            │  │
│  │              "x-goog-api-key",                                         │  │
│  │              self.api_key.expose_secret()                             │  │
│  │          ),                                                            │  │
│  │          QueryParam => request.url.query_pairs_mut().append_pair(     │  │
│  │              "key",                                                    │  │
│  │              self.api_key.expose_secret()                             │  │
│  │          )                                                             │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│       │                                                                      │
│       ▼                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Outgoing Request                                  │  │
│  │                                                                        │  │
│  │  POST /v1beta/models/gemini-1.5-pro:generateContent HTTP/1.1          │  │
│  │  Host: generativelanguage.googleapis.com                               │  │
│  │  x-goog-api-key: AIza...                                              │  │
│  │  Content-Type: application/json                                        │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL PROTECTION                                   │
└─────────────────────────────────────────────────────────────────────────────┘

SecretString Implementation:
───────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  SecretString Protection Mechanisms:                                         │
│                                                                              │
│  1. Memory Protection                                                        │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │ • Secret bytes stored in protected memory region                    │ │
│     │ • Zeroed on drop (SecretString implements Zeroize)                 │ │
│     │ • No accidental exposure through Debug trait                        │ │
│     │ • Clone only via explicit .clone() (not Copy)                       │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  2. Access Control                                                           │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │ • .expose_secret() required to access value                         │ │
│     │ • Explicit acknowledgment of secret handling                        │ │
│     │ • Minimizes attack surface for accidental logging                   │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  3. Serialization Safety                                                     │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │ • Serde serialize: "[REDACTED]" or custom impl                     │ │
│     │ • fmt::Debug: "SecretString([REDACTED])"                           │ │
│     │ • fmt::Display: "[REDACTED]"                                        │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Usage in Code:                                                              │
│                                                                              │
│  // Construction                                                             │
│  let api_key = SecretString::new(env::var("GEMINI_API_KEY")?);             │
│                                                                              │
│  // Safe: No exposure                                                        │
│  logger.info("Client created", { api_key: &api_key }); // Logs [REDACTED]  │
│                                                                              │
│  // Explicit exposure when needed                                            │
│  request.headers.insert("x-goog-api-key", api_key.expose_secret());        │
│                                                                              │
│  // Automatic zeroing when dropped                                           │
│  drop(api_key); // Memory zeroed                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Transport Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TRANSPORT SECURITY                                     │
└─────────────────────────────────────────────────────────────────────────────┘

TLS Configuration:
─────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  TLS Requirements:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  • Minimum Version: TLS 1.2                                          │    │
│  │  • Preferred: TLS 1.3                                                │    │
│  │  • Certificate Validation: Required (no skip_verify)                 │    │
│  │  • Certificate Chain: Full validation to root CA                     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Rust Configuration (reqwest with rustls):                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  reqwest::ClientBuilder::new()                                       │    │
│  │      .use_rustls_tls()                    // Use rustls backend     │    │
│  │      .min_tls_version(Version::TLS_1_2)   // Minimum TLS 1.2        │    │
│  │      .tls_built_in_root_certs(true)       // Use system root CAs    │    │
│  │      .danger_accept_invalid_certs(false)  // Never skip validation  │    │
│  │      .build()                                                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  TypeScript Configuration (Node.js fetch):                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  // Node.js uses OpenSSL with secure defaults                        │    │
│  │  // Enforce minimum TLS version via environment or custom agent      │    │
│  │  const httpsAgent = new https.Agent({                               │    │
│  │      minVersion: 'TLSv1.2',                                          │    │
│  │      rejectUnauthorized: true,  // Require valid certificate        │    │
│  │  });                                                                 │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INPUT VALIDATION                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Validation Layers:
─────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Layer 1: Type System Validation (Compile-time)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  // Rust: Strong typing prevents invalid states                      │    │
│  │  struct GenerationConfig {                                           │    │
│  │      temperature: Option<f32>,  // Must be f32, not string          │    │
│  │      max_output_tokens: Option<u32>,  // Must be positive           │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  // TypeScript: Type checking with strict mode                       │    │
│  │  interface GenerationConfig {                                        │    │
│  │      temperature?: number;  // Must be number                        │    │
│  │      maxOutputTokens?: number;                                       │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Layer 2: Value Range Validation (Runtime)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  fn validate_generation_config(config: &GenerationConfig) -> Result │    │
│  │                                                                      │    │
│  │  • temperature: 0.0 <= temp <= 2.0                                   │    │
│  │  • top_p: 0.0 <= top_p <= 1.0                                        │    │
│  │  • top_k: top_k >= 1                                                 │    │
│  │  • max_output_tokens: max_output_tokens >= 1                         │    │
│  │  • candidate_count: 1 <= count <= 8                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Layer 3: Content Validation (Runtime)                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  fn validate_content(content: &Content) -> Result                   │    │
│  │                                                                      │    │
│  │  • parts: non-empty                                                  │    │
│  │  • inline_data: valid base64, supported MIME type                   │    │
│  │  • file_data: valid HTTPS URI                                        │    │
│  │  • function_call: name non-empty                                     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Layer 4: MIME Type Validation                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Supported MIME Types:                                               │    │
│  │  • image/jpeg, image/png, image/gif, image/webp                     │    │
│  │  • audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac│   │
│  │  • video/mp4, video/mpeg, video/mov, video/avi, video/flv, video/webm│   │
│  │  • application/pdf                                                   │    │
│  │  • text/plain, text/html, text/css, text/javascript, etc.           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Deployment Architecture

### 2.1 Package Distribution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PACKAGE DISTRIBUTION                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Rust Crate Distribution:
───────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Publishing to crates.io (private registry):                                 │
│                                                                              │
│  [package]                                                                   │
│  name = "integrations-gemini"                                               │
│  version = "0.1.0"                                                          │
│  edition = "2021"                                                           │
│  publish = ["internal-registry"]  # Private registry                        │
│                                                                              │
│  Artifacts:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  integrations-gemini-0.1.0.crate                                    │    │
│  │  • Compiled library                                                  │    │
│  │  • Source code (for debug builds)                                    │    │
│  │  • Documentation                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Usage:                                                                      │
│  [dependencies]                                                              │
│  integrations-gemini = "0.1"                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

TypeScript Package Distribution:
───────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Publishing to npm (private registry):                                       │
│                                                                              │
│  {                                                                           │
│    "name": "@integrations/gemini",                                          │
│    "version": "0.1.0",                                                      │
│    "publishConfig": {                                                        │
│      "registry": "https://npm.internal.example.com",                        │
│      "access": "restricted"                                                  │
│    }                                                                         │
│  }                                                                           │
│                                                                              │
│  Artifacts:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  dist/                                                               │    │
│  │  ├── index.js       # CommonJS                                       │    │
│  │  ├── index.mjs      # ESM                                           │    │
│  │  ├── index.d.ts     # TypeScript declarations                       │    │
│  │  └── ...                                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Usage:                                                                      │
│  npm install @integrations/gemini                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEPENDENCY GRAPH                                      │
└─────────────────────────────────────────────────────────────────────────────┘

                           integrations-gemini
                                    │
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│ integrations- │        │ integrations- │        │ integrations- │
│    errors     │        │     retry     │        │circuit-breaker│
└───────┬───────┘        └───────┬───────┘        └───────┬───────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
        ┌───────────────────────────────────────────────────┐
        │                                                   │
        ▼                           ▼                       ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│ integrations- │        │ integrations- │        │ integrations- │
│  rate-limit   │        │   tracing     │        │   logging     │
└───────────────┘        └───────────────┘        └───────────────┘

        ┌───────────────────────────────────────────────────┐
        │                                                   │
        ▼                                                   ▼
┌───────────────┐                                ┌───────────────┐
│ integrations- │                                │ integrations- │
│    types      │                                │    config     │
└───────────────┘                                └───────────────┘


External Dependencies (Rust):
─────────────────────────────

┌───────────────┬───────────┬────────────────────────────────────┐
│   Crate       │  Version  │  Purpose                           │
├───────────────┼───────────┼────────────────────────────────────┤
│ tokio         │   1.35    │  Async runtime                     │
│ reqwest       │   0.12    │  HTTP client                       │
│ serde         │   1.0     │  Serialization                     │
│ serde_json    │   1.0     │  JSON serialization                │
│ secrecy       │   0.8     │  Secret management                 │
│ thiserror     │   1.0     │  Error handling                    │
│ bytes         │   1.5     │  Byte buffer handling              │
│ futures       │   0.3     │  Async utilities                   │
│ url           │   2.5     │  URL parsing                       │
│ base64        │   0.22    │  Base64 encoding                   │
└───────────────┴───────────┴────────────────────────────────────┘
```

### 2.3 Feature Flags

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FEATURE FLAGS                                        │
└─────────────────────────────────────────────────────────────────────────────┘

Rust Feature Flags:
──────────────────

[features]
default = ["rustls"]

# TLS Backend
rustls = ["reqwest/rustls-tls"]      # Default: Pure Rust TLS
native-tls = ["reqwest/native-tls"]  # Alternative: System TLS

# Optional Features
streaming = []                        # Enable streaming support (default on)
files = []                           # Enable file upload/management
cached-content = []                  # Enable cached content support

# Full Feature Set
full = ["streaming", "files", "cached-content"]


Usage:
─────

# Default (rustls, no optional features)
integrations-gemini = "0.1"

# With all features
integrations-gemini = { version = "0.1", features = ["full"] }

# With native TLS
integrations-gemini = { version = "0.1", features = ["native-tls"] }
```

---

## 3. Testing Architecture

### 3.1 Testing Pyramid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TESTING PYRAMID                                      │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   E2E       │  Few
                              │   Tests     │  (Manual/CI)
                              │             │
                              │ Real Gemini │
                              │ API calls   │
                              └──────┬──────┘
                                     │
                           ┌─────────┴─────────┐
                           │                   │
                           │   Integration     │  Some
                           │   Tests           │  (~20%)
                           │                   │
                           │ Mock server       │
                           │ (WireMock/MSW)    │
                           └─────────┬─────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
                 │            Unit Tests                 │  Many
                 │                                       │  (~80%)
                 │  Mocked dependencies                  │
                 │  London-School TDD                    │
                 │  Fast, deterministic                  │
                 │                                       │
                 └───────────────────────────────────────┘
```

### 3.2 Mock Architecture (London-School TDD)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MOCK ARCHITECTURE                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Trait-Based Mocking:
───────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Production Code:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  trait HttpTransport: Send + Sync {                                 │    │
│  │      async fn send(&self, request: HttpRequest)                     │    │
│  │          -> Result<HttpResponse, TransportError>;                   │    │
│  │                                                                      │    │
│  │      async fn send_streaming(&self, request: HttpRequest)           │    │
│  │          -> Result<ByteStream, TransportError>;                     │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  // Production implementation                                        │    │
│  │  struct ReqwestHttpTransport { client: reqwest::Client }            │    │
│  │  impl HttpTransport for ReqwestHttpTransport { ... }                │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Test Code:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  // Mock implementation (using mockall)                             │    │
│  │  #[automock]                                                         │    │
│  │  impl HttpTransport for MockHttpTransport { ... }                   │    │
│  │                                                                      │    │
│  │  #[test]                                                             │    │
│  │  async fn test_generate_content() {                                 │    │
│  │      // Arrange                                                      │    │
│  │      let mut mock_transport = MockHttpTransport::new();            │    │
│  │      mock_transport                                                 │    │
│  │          .expect_send()                                             │    │
│  │          .returning(|_| Ok(mock_success_response()));               │    │
│  │                                                                      │    │
│  │      let client = GeminiClient::with_transport(mock_transport);    │    │
│  │                                                                      │    │
│  │      // Act                                                          │    │
│  │      let result = client.content().generate_content(request).await;│    │
│  │                                                                      │    │
│  │      // Assert                                                       │    │
│  │      assert!(result.is_ok());                                        │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TEST CATEGORIES                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Unit Tests:
──────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Category              Tests                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Client Creation       • Builder with valid config                          │
│                        • Builder with missing API key                       │
│                        • Builder from environment                           │
│                        • Default configuration values                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  Request Validation    • Empty contents rejected                            │
│                        • Invalid temperature rejected                       │
│                        • Invalid MIME type rejected                         │
│                        • Missing function name rejected                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Request Building      • Correct endpoint path construction                │
│                        • Headers applied correctly                          │
│                        • JSON body serialization                            │
│                        • Multipart form building                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Response Parsing      • Success response parsing                          │
│                        • Error response parsing                             │
│                        • Rate limit header extraction                       │
│                        • Content blocked detection                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Streaming             • Chunked JSON parsing                              │
│                        • Incomplete chunk handling                          │
│                        • Stream error handling                              │
│                        • Accumulation of chunks                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Error Mapping         • HTTP 4xx to error types                           │
│                        • HTTP 5xx to error types                            │
│                        • Network errors to error types                      │
│                        • Retryable error detection                          │
└─────────────────────────────────────────────────────────────────────────────┘


Integration Tests:
─────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Category              Tests                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Full Request Flow     • Generate content end-to-end                       │
│                        • Streaming end-to-end                               │
│                        • Embeddings end-to-end                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Resilience            • Retry on 5xx                                       │
│                        • Retry on rate limit                                │
│                        • Circuit breaker opening                            │
│                        • Circuit breaker recovery                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Concurrency           • Parallel requests                                  │
│                        • Rate limit coordination                            │
│                        • Stream multiplexing                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Test Fixtures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST FIXTURES                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Response Fixtures:
─────────────────

pub mod fixtures {
    pub fn success_generate_response() -> GenerateContentResponse {
        GenerateContentResponse {
            candidates: Some(vec![Candidate {
                content: Content {
                    role: Some("model".to_string()),
                    parts: vec![Part::Text {
                        text: "Paris is the capital of France.".to_string()
                    }]
                },
                finish_reason: Some(FinishReason::Stop),
                safety_ratings: None,
                citation_metadata: None,
                token_count: Some(12),
                grounding_attributions: None,
                index: 0,
            }]),
            prompt_feedback: None,
            usage_metadata: Some(UsageMetadata {
                prompt_token_count: 8,
                candidates_token_count: 12,
                total_token_count: 20,
            }),
        }
    }

    pub fn streaming_chunks() -> Vec<GenerateContentChunk> {
        vec![
            GenerateContentChunk {
                candidates: Some(vec![Candidate { /* "Paris" */ }]),
                prompt_feedback: None,
                usage_metadata: None,
            },
            GenerateContentChunk {
                candidates: Some(vec![Candidate { /* " is" */ }]),
                prompt_feedback: None,
                usage_metadata: None,
            },
            GenerateContentChunk {
                candidates: Some(vec![Candidate { /* " the capital." */ }]),
                prompt_feedback: None,
                usage_metadata: Some(UsageMetadata { /* final usage */ }),
            },
        ]
    }

    pub fn rate_limit_error_response() -> HttpResponse {
        HttpResponse {
            status: StatusCode::TOO_MANY_REQUESTS,
            headers: HeaderMap::from([
                ("retry-after", "30"),
                ("x-ratelimit-remaining-requests", "0"),
            ]),
            body: json!({
                "error": {
                    "code": 429,
                    "message": "Rate limit exceeded",
                    "status": "RESOURCE_EXHAUSTED"
                }
            }).to_string().into(),
        }
    }
}
```

---

## 4. Observability Architecture

### 4.1 Metrics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            METRICS                                           │
└─────────────────────────────────────────────────────────────────────────────┘

Metric Definitions:
──────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Metric Name                        Type       Labels                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  gemini.requests.total              Counter    operation, status            │
│  gemini.requests.errors             Counter    operation, error_type        │
│  gemini.request.duration_ms         Histogram  operation, status            │
│  gemini.tokens.prompt               Histogram  model                        │
│  gemini.tokens.completion           Histogram  model                        │
│  gemini.tokens.total                Histogram  model                        │
│  gemini.file.upload.duration_ms     Histogram  mime_type                    │
│  gemini.file.upload.size_bytes      Histogram  mime_type                    │
│  gemini.retry.attempts              Counter    operation                    │
│  gemini.circuit_breaker.state       Gauge      -                            │
│  gemini.rate_limit.remaining        Gauge      type (requests/tokens)       │
│  gemini.stream.chunks               Counter    model                        │
│  gemini.stream.duration_ms          Histogram  model                        │
└─────────────────────────────────────────────────────────────────────────────┘


Example Prometheus Output:
────────────────────────

# HELP gemini_requests_total Total number of Gemini API requests
# TYPE gemini_requests_total counter
gemini_requests_total{operation="generateContent",status="success"} 1542
gemini_requests_total{operation="generateContent",status="error"} 23
gemini_requests_total{operation="embedContent",status="success"} 892

# HELP gemini_request_duration_ms Request duration in milliseconds
# TYPE gemini_request_duration_ms histogram
gemini_request_duration_ms_bucket{operation="generateContent",le="100"} 45
gemini_request_duration_ms_bucket{operation="generateContent",le="250"} 312
gemini_request_duration_ms_bucket{operation="generateContent",le="500"} 1124
gemini_request_duration_ms_bucket{operation="generateContent",le="+Inf"} 1542

# HELP gemini_tokens_total Token usage per request
# TYPE gemini_tokens_total histogram
gemini_tokens_prompt{model="gemini-1.5-pro"} 15234
gemini_tokens_completion{model="gemini-1.5-pro"} 28456
```

### 4.2 Tracing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             TRACING                                          │
└─────────────────────────────────────────────────────────────────────────────┘

Span Structure:
──────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  gemini.request (root span)                                                  │
│  ├── operation: "generateContent"                                            │
│  ├── model: "gemini-1.5-pro"                                                │
│  ├── request_id: "req-abc123"                                               │
│  │                                                                           │
│  ├── gemini.resilience                                                       │
│  │   ├── circuit_state: "closed"                                            │
│  │   ├── rate_limit_wait_ms: 0                                              │
│  │   └── retry_attempt: 1                                                   │
│  │                                                                           │
│  ├── gemini.http                                                            │
│  │   ├── http.method: "POST"                                                │
│  │   ├── http.url: "https://generativelanguage.googleapis.com/..."         │
│  │   ├── http.status_code: 200                                              │
│  │   └── http.response_content_length: 1234                                 │
│  │                                                                           │
│  └── gemini.parse                                                            │
│      ├── candidates_count: 1                                                 │
│      ├── prompt_tokens: 8                                                    │
│      └── completion_tokens: 12                                               │
│                                                                              │
│  Duration: 245ms                                                             │
│  Status: OK                                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘


Streaming Span:
──────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  gemini.stream (root span)                                                   │
│  ├── operation: "streamGenerateContent"                                      │
│  ├── model: "gemini-1.5-pro"                                                │
│  │                                                                           │
│  ├── event: chunk_received { chunk_num: 1 }                                 │
│  ├── event: chunk_received { chunk_num: 2 }                                 │
│  ├── event: chunk_received { chunk_num: 3 }                                 │
│  ├── ...                                                                     │
│  ├── event: stream_complete { total_chunks: 15, total_bytes: 4532 }        │
│  │                                                                           │
│  └── chunks_received: 15                                                     │
│      total_bytes: 4532                                                       │
│                                                                              │
│  Duration: 1250ms                                                            │
│  Status: OK                                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Logging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             LOGGING                                          │
└─────────────────────────────────────────────────────────────────────────────┘

Log Levels and Events:
─────────────────────

DEBUG:
  • Request building details
  • Response parsing details
  • Cache hits/misses
  • Retry decisions

INFO:
  • Request completed (operation, model, latency, tokens)
  • File uploaded (name, size, mime_type)
  • Cached content created

WARN:
  • Rate limit approaching
  • Retry attempt
  • Circuit breaker half-open
  • Unparsed buffer data

ERROR:
  • Request failed (error type, message)
  • Stream interrupted
  • Circuit breaker open
  • Authentication failure


Structured Log Format:
────────────────────

{
  "timestamp": "2025-12-09T10:30:45.123Z",
  "level": "INFO",
  "target": "integrations_gemini::services::content",
  "message": "Content generated",
  "fields": {
    "operation": "generateContent",
    "model": "gemini-1.5-pro",
    "prompt_tokens": 8,
    "completion_tokens": 12,
    "total_tokens": 20,
    "latency_ms": 245,
    "request_id": "req-abc123"
  },
  "span": {
    "name": "gemini.request",
    "trace_id": "abc123def456"
  }
}
```

---

## 5. Performance Considerations

### 5.1 Connection Pooling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION POOLING                                      │
└─────────────────────────────────────────────────────────────────────────────┘

HTTP/2 Connection Multiplexing:
─────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  GeminiClient                                                                │
│       │                                                                      │
│       │ Shared reqwest::Client                                              │
│       ▼                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       Connection Pool                                  │  │
│  │                                                                        │  │
│  │  ┌────────────────────────────────────────────────────────────────┐   │  │
│  │  │ HTTP/2 Connection to generativelanguage.googleapis.com         │   │  │
│  │  │                                                                 │   │  │
│  │  │  Stream 1: generateContent (request 1)                         │   │  │
│  │  │  Stream 3: generateContent (request 2)                         │   │  │
│  │  │  Stream 5: embedContent (request 3)                            │   │  │
│  │  │  Stream 7: streamGenerateContent (streaming)                   │   │  │
│  │  │                                                                 │   │  │
│  │  │  • Single TCP connection, multiple concurrent streams          │   │  │
│  │  │  • Automatic stream management                                  │   │  │
│  │  │  • Keep-alive maintained                                        │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                        │  │
│  │  Pool Configuration:                                                   │  │
│  │  • pool_idle_timeout: 90s                                             │  │
│  │  • pool_max_idle_per_host: 10                                         │  │
│  │  • http2_keep_alive_interval: 30s                                     │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Memory Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MEMORY MANAGEMENT                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Streaming Memory Optimization:
────────────────────────────

Non-Streaming (buffered):
┌─────────────────────────────────────────────────────────────────────────────┐
│  Memory: O(response_size)                                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Buffer: [entire response body buffered in memory]                    │   │
│  │ Size: potentially many MB for long responses                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Streaming (chunked):
┌─────────────────────────────────────────────────────────────────────────────┐
│  Memory: O(chunk_size)                                                       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Parser Buffer: [only current incomplete JSON object]                 │   │
│  │ Size: typically < 1KB                                                │   │
│  │                                                                       │   │
│  │ User processes chunk → chunk released → next chunk                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘


Lazy Service Initialization:
──────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Initial client creation: Only allocate shared infrastructure               │
│                                                                              │
│  GeminiClient {                                                              │
│    config: ✓ allocated                                                       │
│    transport: ✓ allocated                                                    │
│    auth_manager: ✓ allocated                                                 │
│    resilience: ✓ allocated                                                   │
│    content_service: OnceCell::new()  // Not allocated yet                   │
│    embeddings_service: OnceCell::new()  // Not allocated yet                │
│    models_service: OnceCell::new()  // Not allocated yet                    │
│    files_service: OnceCell::new()  // Not allocated yet                     │
│  }                                                                           │
│                                                                              │
│  First call to client.content():                                            │
│    content_service: ✓ now allocated (OnceCell::get_or_init)                │
│                                                                              │
│  Benefits:                                                                   │
│  • Faster startup time                                                       │
│  • Lower memory footprint if not all services used                          │
│  • Thread-safe initialization                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. API Endpoint Reference

### 6.1 Endpoints Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API ENDPOINTS                                         │
└─────────────────────────────────────────────────────────────────────────────┘

pub mod endpoints {
    // Base URLs
    pub const BASE_URL: &str = "https://generativelanguage.googleapis.com";
    pub const UPLOAD_BASE_URL: &str = "https://generativelanguage.googleapis.com/upload";

    // API Version
    pub const API_VERSION: &str = "v1beta";

    // Models
    pub const MODELS: &str = "/v1beta/models";

    pub fn model(name: &str) -> String {
        format!("/v1beta/{}", name)
    }

    // Content Generation
    pub fn generate_content(model: &str) -> String {
        format!("/v1beta/models/{}:generateContent", model)
    }

    pub fn stream_generate_content(model: &str) -> String {
        format!("/v1beta/models/{}:streamGenerateContent", model)
    }

    pub fn count_tokens(model: &str) -> String {
        format!("/v1beta/models/{}:countTokens", model)
    }

    // Embeddings
    pub fn embed_content(model: &str) -> String {
        format!("/v1beta/models/{}:embedContent", model)
    }

    pub fn batch_embed_contents(model: &str) -> String {
        format!("/v1beta/models/{}:batchEmbedContents", model)
    }

    // Files
    pub const FILES: &str = "/v1beta/files";

    pub fn file(name: &str) -> String {
        format!("/v1beta/{}", name)
    }

    // Cached Content
    pub const CACHED_CONTENTS: &str = "/v1beta/cachedContents";

    pub fn cached_content(name: &str) -> String {
        format!("/v1beta/{}", name)
    }
}
```

### 6.2 Endpoint Summary Table

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENDPOINT SUMMARY                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Service          Endpoint                           Method  Streaming      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Content          /models/{m}:generateContent        POST    No            │
│  Content          /models/{m}:streamGenerateContent  POST    Yes (chunked) │
│  Content          /models/{m}:countTokens            POST    No            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Embeddings       /models/{m}:embedContent           POST    No            │
│  Embeddings       /models/{m}:batchEmbedContents     POST    No            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Models           /models                            GET     No            │
│  Models           /models/{model}                    GET     No            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Files            /upload/v1beta/files               POST    No (multipart)│
│  Files            /files                             GET     No            │
│  Files            /files/{name}                      GET     No            │
│  Files            /files/{name}                      DELETE  No            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Cached Content   /cachedContents                    POST    No            │
│  Cached Content   /cachedContents                    GET     No            │
│  Cached Content   /cachedContents/{name}             GET     No            │
│  Cached Content   /cachedContents/{name}             PATCH   No            │
│  Cached Content   /cachedContents/{name}             DELETE  No            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Architecture Part 2](./architecture-gemini-2.md) | Architecture Part 3 | [Refinement](./refinement-gemini.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture part 3 |

---

**Architecture Phase Status: Part 3 COMPLETE**

*Security, deployment, and testing architecture documented.*

---

**End of Architecture Phase - Continue to Refinement Phase**

# Refinement: Cohere Integration Module

**Code Standards, Testing, Review Criteria, Quality Gates**

**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/cohere`
**SPARC Phase:** Refinement

---

## Table of Contents

1. [Overview](#1-overview)
2. [General Code Standards](#2-general-code-standards)
3. [Rust Code Standards](#3-rust-code-standards)
4. [TypeScript Code Standards](#4-typescript-code-standards)
5. [Testing Requirements](#5-testing-requirements)
6. [Coverage Targets](#6-coverage-targets)
7. [Performance Benchmarks](#7-performance-benchmarks)
8. [Documentation Standards](#8-documentation-standards)
9. [Review Criteria](#9-review-criteria)
10. [Quality Gates](#10-quality-gates)
11. [CI/CD Configuration](#11-cicd-configuration)
12. [Release Checklist](#12-release-checklist)

---

## 1. Overview

This document establishes the refinement standards for the Cohere integration module. All code contributions must adhere to these standards to maintain consistency, quality, and maintainability.

### 1.1 Guiding Principles

| Principle | Description |
|-----------|-------------|
| Consistency | Code follows established patterns throughout |
| Clarity | Code is self-documenting and easy to understand |
| Correctness | Code is thoroughly tested and handles edge cases |
| Performance | Code meets established performance benchmarks |
| Security | Code follows security best practices |

---

## 2. General Code Standards

### 2.1 Naming Conventions

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       NAMING CONVENTIONS                                 │
│                                                                          │
│  Types (structs, enums, traits/interfaces):                              │
│  ├── PascalCase                                                          │
│  ├── Descriptive nouns                                                   │
│  └── Examples: ChatRequest, CohereClient, EmbeddingType                  │
│                                                                          │
│  Functions/Methods:                                                      │
│  ├── snake_case (Rust) / camelCase (TypeScript)                          │
│  ├── Verb phrases                                                        │
│  └── Examples: send_request, parseResponse, buildHttpRequest             │
│                                                                          │
│  Constants:                                                              │
│  ├── SCREAMING_SNAKE_CASE                                                │
│  └── Examples: DEFAULT_TIMEOUT_MS, MAX_RETRY_ATTEMPTS                    │
│                                                                          │
│  Variables:                                                              │
│  ├── snake_case (Rust) / camelCase (TypeScript)                          │
│  ├── Descriptive names (no single letters except loop counters)          │
│  └── Examples: request_body, responseHandler, chatService                │
│                                                                          │
│  Files/Modules:                                                          │
│  ├── snake_case (Rust) / kebab-case (TypeScript)                         │
│  └── Examples: chat_service.rs, response-handler.ts                      │
│                                                                          │
│  Acronyms:                                                               │
│  ├── Treat as words in identifiers                                       │
│  └── Examples: HttpClient (not HTTPClient), SseParser (not SSEParser)    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Code Organization

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       CODE ORGANIZATION                                  │
│                                                                          │
│  File Structure:                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. License header / Copyright                                   │    │
│  │  2. Module documentation                                         │    │
│  │  3. Imports/Uses (grouped and sorted)                            │    │
│  │     a. Standard library                                          │    │
│  │     b. External crates/packages                                  │    │
│  │     c. Internal modules                                          │    │
│  │  4. Constants                                                    │    │
│  │  5. Type definitions (structs, enums)                            │    │
│  │  6. Trait/Interface definitions                                  │    │
│  │  7. Trait/Interface implementations                              │    │
│  │  8. Function implementations                                     │    │
│  │  9. Tests (inline or separate module)                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Maximum File Length: 500 lines (excluding tests)                        │
│  Maximum Function Length: 50 lines                                       │
│  Maximum Line Length: 100 characters                                     │
│  Maximum Parameters: 5 (use builder pattern for more)                    │
│  Maximum Nesting Depth: 4 levels                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Comment Standards

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       COMMENT STANDARDS                                  │
│                                                                          │
│  When to Comment:                                                        │
│  ├── Public API documentation (always)                                   │
│  ├── Complex algorithms (explain the "why")                              │
│  ├── Non-obvious business logic                                          │
│  ├── Workarounds and TODOs                                               │
│  └── Safety invariants (especially in unsafe code)                       │
│                                                                          │
│  When NOT to Comment:                                                    │
│  ├── Obvious code (let count = 0; // initialize count to zero)           │
│  ├── Instead of refactoring (if code needs explanation, simplify it)     │
│  └── Outdated information (update or remove)                             │
│                                                                          │
│  Comment Format:                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  /// Public API documentation (Rust doc comments)                │    │
│  │  ///                                                             │    │
│  │  /// # Arguments                                                 │    │
│  │  /// * `request` - The chat request to send                      │    │
│  │  ///                                                             │    │
│  │  /// # Returns                                                   │    │
│  │  /// The chat response or an error                               │    │
│  │  ///                                                             │    │
│  │  /// # Errors                                                    │    │
│  │  /// Returns `CohereError` if the request fails                  │    │
│  │  ///                                                             │    │
│  │  /// # Examples                                                  │    │
│  │  /// ```                                                         │    │
│  │  /// let response = client.chat().chat(request).await?;          │    │
│  │  /// ```                                                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  TODO Format:                                                            │
│  // TODO(username): Description of what needs to be done                 │
│  // FIXME(username): Description of bug to fix                           │
│  // HACK(username): Explanation of temporary workaround                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Error Handling Standards

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING STANDARDS                              │
│                                                                          │
│  Principles:                                                             │
│  ├── Use typed errors (no string-only errors)                            │
│  ├── Provide context at each layer                                       │
│  ├── Distinguish retryable from non-retryable                            │
│  ├── Never panic in library code                                         │
│  └── Log errors at appropriate levels                                    │
│                                                                          │
│  Error Message Format:                                                   │
│  ├── Start with lowercase                                                │
│  ├── No trailing punctuation                                             │
│  ├── Be specific and actionable                                          │
│  └── Include relevant values (redacted if sensitive)                     │
│                                                                          │
│  Good Examples:                                                          │
│  ├── "temperature must be between 0.0 and 1.0, got 1.5"                  │
│  ├── "rate limit exceeded, retry after 30 seconds"                       │
│  └── "failed to parse response: missing field 'text'"                    │
│                                                                          │
│  Bad Examples:                                                           │
│  ├── "Error occurred."                                                   │
│  ├── "Invalid input"                                                     │
│  └── "Something went wrong"                                              │
│                                                                          │
│  Rust Pattern:                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Use ? operator for propagation                               │    │
│  │  let response = transport.send(request).await?;                  │    │
│  │                                                                  │    │
│  │  // Add context when appropriate                                 │    │
│  │  let response = transport.send(request)                          │    │
│  │      .await                                                      │    │
│  │      .map_err(|e| e.context("failed to send chat request"))?;    │    │
│  │                                                                  │    │
│  │  // Never use unwrap() in library code                           │    │
│  │  // Use expect() only for invariants that are programmer errors  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  TypeScript Pattern:                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Use try/catch with typed errors                              │    │
│  │  try {                                                           │    │
│  │    const response = await transport.send(request);               │    │
│  │  } catch (error) {                                               │    │
│  │    if (error instanceof CohereError) {                           │    │
│  │      // Handle known error                                       │    │
│  │    }                                                             │    │
│  │    throw error; // Re-throw unknown errors                       │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Rust Code Standards

### 3.1 Rust-Specific Guidelines

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RUST-SPECIFIC GUIDELINES                              │
│                                                                          │
│  Formatting:                                                             │
│  ├── Use rustfmt with default settings                                   │
│  ├── Run `cargo fmt` before committing                                   │
│  └── Configure in rustfmt.toml if needed                                 │
│                                                                          │
│  Linting:                                                                │
│  ├── Use clippy with pedantic lints                                      │
│  ├── Run `cargo clippy -- -D warnings`                                   │
│  ├── Address all warnings (no #[allow] without justification)            │
│  └── Document any necessary #[allow] with reason                         │
│                                                                          │
│  Clippy Configuration (clippy.toml):                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  msrv = "1.75"                                                   │    │
│  │  cognitive-complexity-threshold = 15                             │    │
│  │  too-many-arguments-threshold = 5                                │    │
│  │  type-complexity-threshold = 250                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Required Clippy Lints:                                                  │
│  #![warn(clippy::pedantic)]                                              │
│  #![warn(clippy::nursery)]                                               │
│  #![deny(clippy::unwrap_used)]                                           │
│  #![deny(clippy::expect_used)] // except in tests                        │
│  #![deny(clippy::panic)]                                                 │
│  #![deny(unsafe_code)] // unless explicitly needed                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Rust Idioms

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RUST IDIOMS                                       │
│                                                                          │
│  Use Builder Pattern for Complex Types:                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Good: Builder pattern                                        │    │
│  │  let request = ChatRequest::builder()                            │    │
│  │      .message("Hello")                                           │    │
│  │      .model("command-r-plus")                                    │    │
│  │      .temperature(0.7)                                           │    │
│  │      .build()?;                                                  │    │
│  │                                                                  │    │
│  │  // Bad: Many optional parameters                                │    │
│  │  let request = ChatRequest::new(                                 │    │
│  │      "Hello", Some("command-r-plus"), Some(0.7), None, None...   │    │
│  │  );                                                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Use Type State Pattern for Compile-Time Safety:                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // States as zero-sized types                                   │    │
│  │  struct Unconfigured;                                            │    │
│  │  struct Configured;                                              │    │
│  │                                                                  │    │
│  │  struct ClientBuilder<S> {                                       │    │
│  │      config: Option<CohereConfig>,                               │    │
│  │      _state: PhantomData<S>,                                     │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  impl ClientBuilder<Unconfigured> {                              │    │
│  │      fn api_key(self, key: SecretString)                         │    │
│  │          -> ClientBuilder<Configured> { ... }                    │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  impl ClientBuilder<Configured> {                                │    │
│  │      fn build(self) -> Result<CohereClient, ConfigError> { ... } │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Prefer Iterators Over Loops:                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Good: Iterator chain                                         │    │
│  │  let valid_texts: Vec<_> = texts                                 │    │
│  │      .iter()                                                     │    │
│  │      .filter(|t| !t.is_empty())                                  │    │
│  │      .map(|t| t.trim())                                          │    │
│  │      .collect();                                                 │    │
│  │                                                                  │    │
│  │  // Acceptable: Explicit loop when clearer                       │    │
│  │  let mut results = Vec::new();                                   │    │
│  │  for text in texts {                                             │    │
│  │      if let Some(processed) = complex_processing(text)? {        │    │
│  │          results.push(processed);                                │    │
│  │      }                                                           │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Use derive Macros:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  #[derive(Debug, Clone, PartialEq, Eq, Hash)]                    │    │
│  │  pub struct ChatRequest {                                        │    │
│  │      // fields                                                   │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Use serde for serialization                                  │    │
│  │  #[derive(Debug, Clone, Serialize, Deserialize)]                 │    │
│  │  #[serde(rename_all = "snake_case")]                             │    │
│  │  pub struct ApiResponse {                                        │    │
│  │      // fields                                                   │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Async Rust Standards

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ASYNC RUST STANDARDS                                 │
│                                                                          │
│  Async Function Guidelines:                                              │
│  ├── Use async fn for public API                                         │
│  ├── Prefer tokio runtime features                                       │
│  ├── Use tokio::spawn for concurrent tasks                               │
│  └── Avoid blocking operations in async context                          │
│                                                                          │
│  Cancellation Safety:                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Document cancellation safety                                 │    │
│  │  /// # Cancel Safety                                             │    │
│  │  ///                                                             │    │
│  │  /// This method is cancel-safe. If cancelled, the request       │    │
│  │  /// may or may not have been sent to the API.                   │    │
│  │  pub async fn chat(&self, request: ChatRequest)                  │    │
│  │      -> Result<ChatResponse, CohereError>                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Timeout Handling:                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  use tokio::time::timeout;                                       │    │
│  │                                                                  │    │
│  │  let result = timeout(                                           │    │
│  │      Duration::from_secs(30),                                    │    │
│  │      transport.send(request)                                     │    │
│  │  ).await.map_err(|_| CohereError::Timeout {                      │    │
│  │      duration: Duration::from_secs(30)                           │    │
│  │  })??;                                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Stream Processing:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  use futures::StreamExt;                                         │    │
│  │                                                                  │    │
│  │  // Use while let for stream consumption                         │    │
│  │  while let Some(event) = stream.next().await {                   │    │
│  │      match event? {                                              │    │
│  │          Event::Text(text) => handle_text(text),                 │    │
│  │          Event::End(response) => return Ok(response),            │    │
│  │      }                                                           │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. TypeScript Code Standards

### 4.1 TypeScript-Specific Guidelines

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 TYPESCRIPT-SPECIFIC GUIDELINES                           │
│                                                                          │
│  Formatting:                                                             │
│  ├── Use Prettier with default settings                                  │
│  ├── Run `npx prettier --write src/` before committing                   │
│  └── Configure in .prettierrc if needed                                  │
│                                                                          │
│  Prettier Configuration (.prettierrc):                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  {                                                               │    │
│  │    "semi": true,                                                 │    │
│  │    "singleQuote": true,                                          │    │
│  │    "tabWidth": 2,                                                │    │
│  │    "trailingComma": "es5",                                       │    │
│  │    "printWidth": 100                                             │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Linting:                                                                │
│  ├── Use ESLint with TypeScript parser                                   │
│  ├── Run `npx eslint src/ --ext .ts`                                     │
│  └── Address all warnings                                                │
│                                                                          │
│  ESLint Configuration:                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  {                                                               │    │
│  │    "extends": [                                                  │    │
│  │      "eslint:recommended",                                       │    │
│  │      "plugin:@typescript-eslint/recommended",                    │    │
│  │      "plugin:@typescript-eslint/recommended-requiring-type-checking"│ │
│  │    ],                                                            │    │
│  │    "rules": {                                                    │    │
│  │      "@typescript-eslint/explicit-function-return-type": "error",│    │
│  │      "@typescript-eslint/no-explicit-any": "error",              │    │
│  │      "@typescript-eslint/no-unused-vars": "error",               │    │
│  │      "@typescript-eslint/strict-boolean-expressions": "error"    │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  TypeScript Configuration (tsconfig.json):                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  {                                                               │    │
│  │    "compilerOptions": {                                          │    │
│  │      "strict": true,                                             │    │
│  │      "noImplicitAny": true,                                      │    │
│  │      "strictNullChecks": true,                                   │    │
│  │      "noUnusedLocals": true,                                     │    │
│  │      "noUnusedParameters": true,                                 │    │
│  │      "noImplicitReturns": true,                                  │    │
│  │      "noFallthroughCasesInSwitch": true,                         │    │
│  │      "noUncheckedIndexedAccess": true,                           │    │
│  │      "exactOptionalPropertyTypes": true                          │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 TypeScript Idioms

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TYPESCRIPT IDIOMS                                    │
│                                                                          │
│  Use Strict Types:                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Good: Explicit types                                         │    │
│  │  interface ChatRequest {                                         │    │
│  │    message: string;                                              │    │
│  │    model?: string;                                               │    │
│  │    temperature?: number;                                         │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Good: Union types for finite options                         │    │
│  │  type EmbeddingType = 'float' | 'int8' | 'uint8' | 'binary';     │    │
│  │                                                                  │    │
│  │  // Bad: any type                                                │    │
│  │  function process(data: any) { ... }                             │    │
│  │                                                                  │    │
│  │  // Bad: Implicit any                                            │    │
│  │  function process(data) { ... }                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Use Type Guards:                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Type guard function                                          │    │
│  │  function isCohereError(error: unknown): error is CohereError {  │    │
│  │    return error instanceof CohereError;                          │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Usage                                                        │    │
│  │  try {                                                           │    │
│  │    await client.chat().chat(request);                            │    │
│  │  } catch (error) {                                               │    │
│  │    if (isCohereError(error)) {                                   │    │
│  │      console.log(error.isRetryable());                           │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Use Readonly for Immutability:                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  interface CohereConfig {                                        │    │
│  │    readonly apiKey: string;                                      │    │
│  │    readonly baseUrl: string;                                     │    │
│  │    readonly timeout: number;                                     │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Or use Readonly utility type                                 │    │
│  │  type ImmutableConfig = Readonly<CohereConfig>;                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Use Async/Await Properly:                                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // Good: async function with return type                        │    │
│  │  async function chat(request: ChatRequest): Promise<ChatResponse>│    │
│  │  {                                                               │    │
│  │    const response = await transport.send(request);               │    │
│  │    return parseResponse(response);                               │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  // Good: Parallel execution when independent                    │    │
│  │  const [chatResult, embedResult] = await Promise.all([           │    │
│  │    client.chat().chat(chatReq),                                  │    │
│  │    client.embed().embed(embedReq),                               │    │
│  │  ]);                                                             │    │
│  │                                                                  │    │
│  │  // Good: Error handling                                         │    │
│  │  try {                                                           │    │
│  │    return await operation();                                     │    │
│  │  } catch (error) {                                               │    │
│  │    // Handle or rethrow                                          │    │
│  │    throw new CohereError('operation failed', { cause: error });  │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Testing Requirements

### 5.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       TEST CATEGORIES                                    │
│                                                                          │
│  Unit Tests:                                                             │
│  ├── Test individual functions/methods in isolation                      │
│  ├── Mock all dependencies                                               │
│  ├── Fast execution (< 100ms each)                                       │
│  ├── No I/O or network calls                                             │
│  └── Cover edge cases and error conditions                               │
│                                                                          │
│  Integration Tests:                                                      │
│  ├── Test component interactions                                         │
│  ├── Use mock HTTP server (wiremock/nock)                                │
│  ├── Test full request/response pipeline                                 │
│  ├── Test error propagation through layers                               │
│  └── Moderate execution time (< 1s each)                                 │
│                                                                          │
│  Contract Tests:                                                         │
│  ├── Verify API compatibility with Cohere                                │
│  ├── Run against real API (with test credentials)                        │
│  ├── Validate request/response formats                                   │
│  ├── Run in CI with rate limiting consideration                          │
│  └── Mark as #[ignore] by default, run explicitly                        │
│                                                                          │
│  Property Tests (Optional but Recommended):                              │
│  ├── Use proptest/quickcheck (Rust) or fast-check (TypeScript)           │
│  ├── Test serialization round-trips                                      │
│  ├── Test validation with random inputs                                  │
│  └── Find edge cases automatically                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Test Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       TEST STRUCTURE                                     │
│                                                                          │
│  Naming Convention:                                                      │
│  test_<unit>_<scenario>_<expected_outcome>                               │
│                                                                          │
│  Examples:                                                               │
│  ├── test_chat_request_with_valid_message_succeeds                       │
│  ├── test_chat_request_with_empty_message_returns_validation_error       │
│  ├── test_retry_on_rate_limit_respects_retry_after_header                │
│  └── test_circuit_breaker_opens_after_threshold_failures                 │
│                                                                          │
│  AAA Pattern (Arrange-Act-Assert):                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  #[tokio::test]                                                  │    │
│  │  async fn test_chat_with_valid_request_returns_response() {      │    │
│  │      // Arrange                                                  │    │
│  │      let mock = MockHttpTransport::new();                        │    │
│  │      mock.queue_response(fixtures::chat_response("Hello!"));     │    │
│  │      let client = test_client(mock.clone());                     │    │
│  │                                                                  │    │
│  │      // Act                                                      │    │
│  │      let response = client.chat().chat(ChatRequest {             │    │
│  │          message: "Hi".into(),                                   │    │
│  │          ..Default::default()                                    │    │
│  │      }).await;                                                   │    │
│  │                                                                  │    │
│  │      // Assert                                                   │    │
│  │      assert!(response.is_ok());                                  │    │
│  │      assert_eq!(response.unwrap().text, "Hello!");               │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Test Isolation:                                                         │
│  ├── Each test is independent                                            │
│  ├── No shared mutable state between tests                               │
│  ├── Tests can run in any order                                          │
│  └── Tests can run in parallel                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Mock Guidelines

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       MOCK GUIDELINES                                    │
│                                                                          │
│  What to Mock:                                                           │
│  ├── HTTP transport (network I/O)                                        │
│  ├── External services                                                   │
│  ├── Time-dependent operations                                           │
│  └── Random number generation                                            │
│                                                                          │
│  What NOT to Mock:                                                       │
│  ├── Value objects (structs, enums)                                      │
│  ├── Pure functions                                                      │
│  ├── The unit under test                                                 │
│  └── Simple data transformations                                         │
│                                                                          │
│  Mock Verification:                                                      │
│  ├── Verify mock was called (when behavior depends on it)                │
│  ├── Verify call count (when important)                                  │
│  ├── Verify call arguments (when testing request building)               │
│  └── Don't over-verify (brittle tests)                                   │
│                                                                          │
│  Example:                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  #[tokio::test]                                                  │    │
│  │  async fn test_request_includes_auth_header() {                  │    │
│  │      let mock = MockHttpTransport::new();                        │    │
│  │      mock.queue_response(fixtures::success_response());          │    │
│  │      let client = test_client_with_key("test-key", mock.clone());│    │
│  │                                                                  │    │
│  │      let _ = client.chat().message("Hi", None).await;            │    │
│  │                                                                  │    │
│  │      // Verify the request included auth header                  │    │
│  │      let requests = mock.captured_requests();                    │    │
│  │      assert_eq!(requests.len(), 1);                              │    │
│  │      assert_eq!(                                                 │    │
│  │          requests[0].headers.get("Authorization"),               │    │
│  │          Some(&"Bearer test-key".to_string())                    │    │
│  │      );                                                          │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Coverage Targets

### 6.1 Coverage Requirements

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     COVERAGE REQUIREMENTS                                │
│                                                                          │
│  Overall Targets:                                                        │
│  ├── Line coverage: ≥ 80%                                               │
│  ├── Branch coverage: ≥ 70%                                             │
│  └── Function coverage: ≥ 90%                                           │
│                                                                          │
│  Critical Path Coverage: 100%                                            │
│  ├── Authentication flow                                                 │
│  ├── Error handling paths                                                │
│  ├── Request validation                                                  │
│  ├── Response parsing                                                    │
│  └── Retry logic                                                         │
│                                                                          │
│  Coverage by Module:                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Module                    Line    Branch    Function           │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  client/                   85%     75%       95%                │    │
│  │  config/                   90%     85%       100%               │    │
│  │  transport/                80%     70%       90%                │    │
│  │  services/chat             85%     75%       95%                │    │
│  │  services/embed            85%     75%       95%                │    │
│  │  services/rerank           85%     75%       95%                │    │
│  │  services/classify         85%     75%       95%                │    │
│  │  services/summarize        85%     75%       95%                │    │
│  │  services/tokenize         85%     75%       95%                │    │
│  │  services/models           80%     70%       90%                │    │
│  │  services/datasets         80%     70%       90%                │    │
│  │  services/connectors       80%     70%       90%                │    │
│  │  services/finetune         80%     70%       90%                │    │
│  │  streaming/                85%     75%       95%                │    │
│  │  resilience/               90%     85%       100%               │    │
│  │  error/                    95%     90%       100%               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Excluded from Coverage:                                                 │
│  ├── Examples (examples/)                                                │
│  ├── Debug implementations                                               │
│  ├── Unreachable code (panic paths)                                      │
│  └── Generated code                                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Coverage Tools

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       COVERAGE TOOLS                                     │
│                                                                          │
│  Rust:                                                                   │
│  ├── cargo tarpaulin (primary)                                           │
│  │   cargo tarpaulin --out Xml --output-dir coverage                     │
│  │                                                                  │    │
│  ├── llvm-cov (alternative)                                              │
│  │   cargo llvm-cov --html                                               │
│  │                                                                  │    │
│  └── grcov (CI integration)                                              │
│      RUSTFLAGS="-Cinstrument-coverage" cargo test                        │
│      grcov . -s . --binary-path ./target/debug -o coverage               │
│                                                                          │
│  TypeScript:                                                             │
│  ├── vitest coverage (primary)                                           │
│  │   npx vitest run --coverage                                           │
│  │                                                                  │    │
│  ├── c8 (alternative)                                                    │
│  │   npx c8 npm test                                                     │
│  │                                                                  │    │
│  └── Istanbul configuration:                                             │
│      {                                                                   │
│        "reporter": ["text", "html", "lcov"],                             │
│        "check": {                                                        │
│          "lines": 80,                                                    │
│          "branches": 70,                                                 │
│          "functions": 90                                                 │
│        }                                                                 │
│      }                                                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Performance Benchmarks

### 7.1 Performance Targets

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PERFORMANCE TARGETS                                  │
│                                                                          │
│  Latency Targets (client overhead only, excluding API):                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Operation                    p50        p95        p99         │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  Request serialization        < 1ms      < 2ms      < 5ms       │    │
│  │  Response deserialization     < 2ms      < 5ms      < 10ms      │    │
│  │  SSE event parsing            < 0.5ms    < 1ms      < 2ms       │    │
│  │  Validation                   < 0.5ms    < 1ms      < 2ms       │    │
│  │  Full pipeline overhead       < 5ms      < 10ms     < 20ms      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Throughput Targets (mock transport):                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Operation                    Requests/Second                   │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  Sequential requests          > 1,000 req/s                     │    │
│  │  Concurrent requests (10)     > 5,000 req/s                     │    │
│  │  Concurrent requests (100)    > 10,000 req/s                    │    │
│  │  Stream events processing     > 50,000 events/s                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Memory Targets:                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Metric                       Target                            │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  Client creation              < 1 MB                            │    │
│  │  Request object               < 10 KB (typical)                 │    │
│  │  Response object              < 100 KB (typical)                │    │
│  │  Stream buffer                < 64 KB per stream                │    │
│  │  No memory leaks              0 bytes leaked                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Benchmark Implementation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   BENCHMARK IMPLEMENTATION                               │
│                                                                          │
│  Rust (Criterion):                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  // benches/throughput.rs                                        │    │
│  │  use criterion::{criterion_group, criterion_main, Criterion};    │    │
│  │                                                                  │    │
│  │  fn bench_chat_serialization(c: &mut Criterion) {                │    │
│  │      let request = ChatRequest {                                 │    │
│  │          message: "Hello, world!".into(),                        │    │
│  │          model: Some("command-r-plus".into()),                   │    │
│  │          ..Default::default()                                    │    │
│  │      };                                                          │    │
│  │                                                                  │    │
│  │      c.bench_function("chat_request_serialize", |b| {            │    │
│  │          b.iter(|| serde_json::to_vec(&request))                 │    │
│  │      });                                                         │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  fn bench_concurrent_requests(c: &mut Criterion) {               │    │
│  │      let rt = tokio::runtime::Runtime::new().unwrap();           │    │
│  │      let client = test_client_with_mock();                       │    │
│  │                                                                  │    │
│  │      c.bench_function("concurrent_10_requests", |b| {            │    │
│  │          b.to_async(&rt).iter(|| async {                         │    │
│  │              let futures = (0..10).map(|_| {                     │    │
│  │                  client.chat().message("Hi", None)               │    │
│  │              });                                                 │    │
│  │              futures::future::join_all(futures).await            │    │
│  │          });                                                     │    │
│  │      });                                                         │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  criterion_group!(benches, bench_chat_serialization,             │    │
│  │                   bench_concurrent_requests);                    │    │
│  │  criterion_main!(benches);                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Running Benchmarks:                                                     │
│  cargo bench                                                             │
│  cargo bench -- --save-baseline main                                     │
│  cargo bench -- --baseline main                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Documentation Standards

### 8.1 API Documentation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    API DOCUMENTATION                                     │
│                                                                          │
│  Every Public Item Must Have:                                            │
│  ├── Summary line (first line of doc comment)                            │
│  ├── Detailed description (if not obvious from summary)                  │
│  ├── Arguments/Parameters documentation                                  │
│  ├── Return value documentation                                          │
│  ├── Error conditions documentation                                      │
│  └── At least one example (for important APIs)                           │
│                                                                          │
│  Rust Documentation Template:                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  /// Sends a chat request to the Cohere API.                     │    │
│  │  ///                                                             │    │
│  │  /// This method sends a chat message and returns the model's    │    │
│  │  /// response. It supports streaming, tool use, and RAG through  │    │
│  │  /// the request options.                                        │    │
│  │  ///                                                             │    │
│  │  /// # Arguments                                                 │    │
│  │  ///                                                             │    │
│  │  /// * `request` - The chat request containing the message and   │    │
│  │  ///   configuration options                                     │    │
│  │  ///                                                             │    │
│  │  /// # Returns                                                   │    │
│  │  ///                                                             │    │
│  │  /// Returns `Ok(ChatResponse)` on success, containing the       │    │
│  │  /// generated text and optional citations/tool calls.           │    │
│  │  ///                                                             │    │
│  │  /// # Errors                                                    │    │
│  │  ///                                                             │    │
│  │  /// Returns `Err(CohereError)` if:                              │    │
│  │  /// - The request validation fails (`ValidationError`)         │    │
│  │  /// - Authentication fails (`AuthenticationError`)             │    │
│  │  /// - Rate limit is exceeded (`RateLimitedError`)              │    │
│  │  /// - The API returns an error (`ApiError`)                    │    │
│  │  ///                                                             │    │
│  │  /// # Examples                                                  │    │
│  │  ///                                                             │    │
│  │  /// ```rust                                                     │    │
│  │  /// use integrations_cohere::{CohereClient, chat::ChatRequest}; │    │
│  │  ///                                                             │    │
│  │  /// #[tokio::main]                                              │    │
│  │  /// async fn main() -> Result<(), Box<dyn std::error::Error>> { │    │
│  │  ///     let client = CohereClient::from_env()?;                 │    │
│  │  ///                                                             │    │
│  │  ///     let response = client.chat().chat(ChatRequest {         │    │
│  │  ///         message: "Hello!".into(),                           │    │
│  │  ///         ..Default::default()                                │    │
│  │  ///     }).await?;                                              │    │
│  │  ///                                                             │    │
│  │  ///     println!("{}", response.text);                          │    │
│  │  ///     Ok(())                                                  │    │
│  │  /// }                                                           │    │
│  │  /// ```                                                         │    │
│  │  pub async fn chat(&self, request: ChatRequest)                  │    │
│  │      -> Result<ChatResponse, CohereError>                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 README Requirements

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     README REQUIREMENTS                                  │
│                                                                          │
│  Required Sections:                                                      │
│  ├── Title and badges                                                    │
│  ├── Description                                                         │
│  ├── Installation                                                        │
│  ├── Quick Start                                                         │
│  ├── Features                                                            │
│  ├── Configuration                                                       │
│  ├── API Overview                                                        │
│  ├── Examples                                                            │
│  ├── Error Handling                                                      │
│  ├── Contributing                                                        │
│  └── License                                                             │
│                                                                          │
│  Badges to Include:                                                      │
│  ├── Build status                                                        │
│  ├── Coverage                                                            │
│  ├── Version (crates.io / npm)                                           │
│  ├── Documentation                                                       │
│  └── License                                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Review Criteria

### 9.1 Code Review Checklist

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   CODE REVIEW CHECKLIST                                  │
│                                                                          │
│  Functionality:                                                          │
│  [ ] Code implements the intended feature correctly                      │
│  [ ] Edge cases are handled                                              │
│  [ ] Error cases are handled appropriately                               │
│  [ ] No regressions in existing functionality                            │
│                                                                          │
│  Code Quality:                                                           │
│  [ ] Follows naming conventions                                          │
│  [ ] Follows code organization standards                                 │
│  [ ] No unnecessary complexity                                           │
│  [ ] No code duplication                                                 │
│  [ ] Appropriate use of abstractions                                     │
│                                                                          │
│  Testing:                                                                │
│  [ ] New code has adequate test coverage                                 │
│  [ ] Tests follow testing standards                                      │
│  [ ] Tests are not flaky                                                 │
│  [ ] Edge cases are tested                                               │
│                                                                          │
│  Documentation:                                                          │
│  [ ] Public APIs are documented                                          │
│  [ ] Complex logic has comments                                          │
│  [ ] Examples are provided where helpful                                 │
│  [ ] CHANGELOG updated if needed                                         │
│                                                                          │
│  Security:                                                               │
│  [ ] No secrets in code                                                  │
│  [ ] Inputs are validated                                                │
│  [ ] Sensitive data handled securely                                     │
│  [ ] No injection vulnerabilities                                        │
│                                                                          │
│  Performance:                                                            │
│  [ ] No obvious performance issues                                       │
│  [ ] Appropriate data structures used                                    │
│  [ ] No unnecessary allocations                                          │
│  [ ] Async operations don't block                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 PR Requirements

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PR REQUIREMENTS                                     │
│                                                                          │
│  PR Title Format:                                                        │
│  <type>(<scope>): <description>                                          │
│                                                                          │
│  Types:                                                                  │
│  ├── feat: New feature                                                   │
│  ├── fix: Bug fix                                                        │
│  ├── docs: Documentation only                                            │
│  ├── style: Code style (formatting, etc.)                                │
│  ├── refactor: Code refactoring                                          │
│  ├── perf: Performance improvement                                       │
│  ├── test: Adding tests                                                  │
│  └── chore: Maintenance tasks                                            │
│                                                                          │
│  Examples:                                                               │
│  ├── feat(chat): add streaming support                                   │
│  ├── fix(embed): handle empty text array                                 │
│  ├── docs(readme): update installation instructions                      │
│  └── refactor(transport): simplify request builder                       │
│                                                                          │
│  PR Description Template:                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  ## Summary                                                      │    │
│  │  Brief description of the change                                 │    │
│  │                                                                  │    │
│  │  ## Motivation                                                   │    │
│  │  Why is this change needed?                                      │    │
│  │                                                                  │    │
│  │  ## Changes                                                      │    │
│  │  - List of changes made                                          │    │
│  │                                                                  │    │
│  │  ## Testing                                                      │    │
│  │  How was this tested?                                            │    │
│  │                                                                  │    │
│  │  ## Checklist                                                    │    │
│  │  - [ ] Tests added/updated                                       │    │
│  │  - [ ] Documentation updated                                     │    │
│  │  - [ ] CHANGELOG updated (if needed)                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Merge Requirements:                                                     │
│  ├── All CI checks passing                                               │
│  ├── At least 1 approving review                                         │
│  ├── No unresolved review comments                                       │
│  ├── Branch up to date with main                                         │
│  └── Squash merge (clean history)                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Quality Gates

### 10.1 CI Quality Gates

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CI QUALITY GATES                                    │
│                                                                          │
│  Gate 1: Formatting                                                      │
│  ├── Rust: cargo fmt --check                                             │
│  └── TypeScript: npx prettier --check src/                               │
│                                                                          │
│  Gate 2: Linting                                                         │
│  ├── Rust: cargo clippy -- -D warnings                                   │
│  └── TypeScript: npx eslint src/ --max-warnings 0                        │
│                                                                          │
│  Gate 3: Type Checking                                                   │
│  ├── Rust: cargo check --all-features                                    │
│  └── TypeScript: npx tsc --noEmit                                        │
│                                                                          │
│  Gate 4: Unit Tests                                                      │
│  ├── Rust: cargo test --lib                                              │
│  └── TypeScript: npm test                                                │
│                                                                          │
│  Gate 5: Integration Tests                                               │
│  ├── Rust: cargo test --test '*'                                         │
│  └── TypeScript: npm run test:integration                                │
│                                                                          │
│  Gate 6: Coverage                                                        │
│  ├── Rust: cargo tarpaulin --fail-under 80                               │
│  └── TypeScript: npx vitest run --coverage --coverage.threshold 80       │
│                                                                          │
│  Gate 7: Documentation                                                   │
│  ├── Rust: cargo doc --no-deps                                           │
│  └── TypeScript: npx typedoc (must succeed)                              │
│                                                                          │
│  Gate 8: Security Audit                                                  │
│  ├── Rust: cargo audit                                                   │
│  └── TypeScript: npm audit --audit-level=high                            │
│                                                                          │
│  All gates must pass for PR to be mergeable.                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Release Quality Gates

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RELEASE QUALITY GATES                                 │
│                                                                          │
│  Pre-Release Checklist:                                                  │
│  [ ] All CI gates passing on main branch                                 │
│  [ ] Contract tests passing (against live API)                           │
│  [ ] Benchmarks show no regression                                       │
│  [ ] CHANGELOG updated                                                   │
│  [ ] Version bumped appropriately                                        │
│  [ ] Documentation generated and reviewed                                │
│  [ ] Migration guide written (if breaking changes)                       │
│                                                                          │
│  Version Semantics (SemVer):                                             │
│  ├── MAJOR: Breaking API changes                                         │
│  ├── MINOR: New features, backwards compatible                           │
│  └── PATCH: Bug fixes, backwards compatible                              │
│                                                                          │
│  Breaking Changes Require:                                               │
│  ├── Discussion in issue before implementation                           │
│  ├── Migration guide in documentation                                    │
│  ├── Deprecation in previous minor release (if possible)                 │
│  └── Announcement in CHANGELOG                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. CI/CD Configuration

### 11.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
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
  format:
    name: Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt
      - run: cargo fmt --all --check

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy
      - run: cargo clippy --all-features -- -D warnings

  test:
    name: Test
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        rust: [stable, beta]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@master
        with:
          toolchain: ${{ matrix.rust }}
      - run: cargo test --all-features

  coverage:
    name: Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: taiki-e/install-action@cargo-tarpaulin
      - run: cargo tarpaulin --out Xml --fail-under 80
      - uses: codecov/codecov-action@v3
        with:
          files: cobertura.xml

  doc:
    name: Documentation
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo doc --no-deps --all-features
        env:
          RUSTDOCFLAGS: -D warnings

  audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rustsec/audit-check@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  contract-test:
    name: Contract Tests
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test --features contract-tests -- --ignored
        env:
          COHERE_API_KEY: ${{ secrets.COHERE_TEST_API_KEY }}
```

---

## 12. Release Checklist

### 12.1 Release Process

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      RELEASE CHECKLIST                                   │
│                                                                          │
│  Pre-Release:                                                            │
│  [ ] All PRs for release merged to main                                  │
│  [ ] All CI checks passing                                               │
│  [ ] Contract tests passing                                              │
│  [ ] Version number updated in Cargo.toml/package.json                   │
│  [ ] CHANGELOG.md updated with release notes                             │
│  [ ] Documentation regenerated                                           │
│  [ ] README examples tested                                              │
│                                                                          │
│  Release:                                                                │
│  [ ] Create release branch: release/v{version}                           │
│  [ ] Create annotated git tag: git tag -a v{version}                     │
│  [ ] Push tag: git push origin v{version}                                │
│  [ ] Verify CI release workflow succeeds                                 │
│  [ ] Verify package published to crates.io/npm                           │
│                                                                          │
│  Post-Release:                                                           │
│  [ ] Create GitHub release with changelog                                │
│  [ ] Announce release (if significant)                                   │
│  [ ] Update dependent projects                                           │
│  [ ] Monitor for issues                                                  │
│                                                                          │
│  Version Bump Commands:                                                  │
│  # Rust                                                                  │
│  cargo set-version 0.2.0                                                 │
│                                                                          │
│  # TypeScript                                                            │
│  npm version 0.2.0                                                       │
│                                                                          │
│  Tag and Push:                                                           │
│  git tag -a v0.2.0 -m "Release v0.2.0"                                   │
│  git push origin v0.2.0                                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

This refinement document establishes comprehensive standards for the Cohere integration module:

1. **General Code Standards**: Naming, organization, comments, error handling
2. **Rust Standards**: Formatting, linting, idioms, async patterns
3. **TypeScript Standards**: Formatting, linting, type safety, async patterns
4. **Testing Requirements**: Categories, structure, mock guidelines
5. **Coverage Targets**: 80% line, 70% branch, 90% function coverage
6. **Performance Benchmarks**: Latency, throughput, memory targets
7. **Documentation Standards**: API docs, README requirements
8. **Review Criteria**: Checklist, PR requirements
9. **Quality Gates**: CI gates, release gates
10. **CI/CD Configuration**: GitHub Actions workflow
11. **Release Checklist**: Pre-release, release, post-release steps

---

**Refinement Phase Status: COMPLETE ✅**

Awaiting "Next phase." to begin Completion phase.

---

*Refinement Phase Complete*

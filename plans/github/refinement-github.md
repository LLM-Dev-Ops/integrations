# SPARC Refinement: GitHub Integration Module

**Refinement Phase Document**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Code Standards](#2-code-standards)
3. [Rust Implementation Standards](#3-rust-implementation-standards)
4. [TypeScript Implementation Standards](#4-typescript-implementation-standards)
5. [Testing Requirements](#5-testing-requirements)
6. [Test Coverage Targets](#6-test-coverage-targets)
7. [Performance Benchmarks](#7-performance-benchmarks)
8. [Documentation Standards](#8-documentation-standards)
9. [Review Criteria](#9-review-criteria)
10. [Quality Gates](#10-quality-gates)
11. [Continuous Integration](#11-continuous-integration)
12. [Pre-Release Checklist](#12-pre-release-checklist)
13. [GitHub-Specific Quality Criteria](#13-github-specific-quality-criteria)

---

## 1. Overview

### 1.1 Purpose

This document defines the refinement criteria, code standards, testing requirements, and quality gates for the GitHub Integration Module. All implementations must meet these standards before being considered complete.

### 1.2 Scope

- Rust crate: `integrations-github`
- TypeScript package: `@integrations/github`
- All 11 service implementations (Repositories, Issues, Pull Requests, Actions, Users, Organizations, Gists, Webhooks, Git Data, Search, GraphQL)
- All associated tests, documentation, and CI/CD configurations

### 1.3 Compliance

All code contributions MUST:
- Pass all automated quality gates
- Meet minimum test coverage thresholds
- Adhere to coding standards defined herein
- Be reviewed and approved by at least one maintainer
- Pass GitHub-specific validation criteria (auth, rate limits, pagination)

---

## 2. Code Standards

### 2.1 General Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CODE QUALITY PRINCIPLES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CLARITY OVER CLEVERNESS                                                 │
│     • Code should be readable by developers unfamiliar with the project     │
│     • Prefer explicit over implicit                                         │
│     • Avoid "clever" one-liners that sacrifice readability                  │
│                                                                             │
│  2. SINGLE RESPONSIBILITY                                                   │
│     • Each function/method does one thing well                              │
│     • Each module has a clear, focused purpose                              │
│     • Each service handles one GitHub resource type                         │
│                                                                             │
│  3. FAIL FAST, FAIL CLEARLY                                                 │
│     • Validate inputs at boundaries                                         │
│     • Return meaningful error messages with GitHub request IDs              │
│     • Never swallow errors silently                                         │
│                                                                             │
│  4. DEFENSIVE PROGRAMMING                                                   │
│     • Don't trust external input                                            │
│     • Handle edge cases explicitly                                          │
│     • Use type system to prevent invalid states                             │
│     • Validate webhook signatures before processing                         │
│                                                                             │
│  5. TESTABILITY BY DESIGN                                                   │
│     • Dependencies injected, not hardcoded                                  │
│     • Side effects isolated to boundaries                                   │
│     • Pure functions where possible                                         │
│     • All HTTP interactions mockable                                        │
│                                                                             │
│  6. SECURE BY DEFAULT                                                       │
│     • Never log credentials or tokens                                       │
│     • Always verify webhook signatures                                      │
│     • Use SecretString for all sensitive data                               │
│     • TLS 1.2+ required, no option to disable                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Naming Conventions

| Element | Rust | TypeScript |
|---------|------|------------|
| Types/Structs/Classes | `PascalCase` | `PascalCase` |
| Functions/Methods | `snake_case` | `camelCase` |
| Variables | `snake_case` | `camelCase` |
| Constants | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` |
| Modules/Files | `snake_case` | `kebab-case` |
| Traits/Interfaces | `PascalCase` | `PascalCase` |
| Enums | `PascalCase` | `PascalCase` |
| Enum Variants | `PascalCase` | `PascalCase` |
| GitHub-specific types | Match GitHub API naming | Match GitHub API naming |

### 2.3 File Organization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FILE ORGANIZATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Each source file should follow this order:                                 │
│                                                                             │
│  1. File-level documentation (module doc comment)                           │
│  2. Imports/use statements (grouped and sorted)                             │
│  3. Constants                                                               │
│  4. Type definitions (structs, enums, type aliases)                         │
│  5. Trait definitions (Rust) / Interface definitions (TypeScript)           │
│  6. Trait implementations / Class implementations                           │
│  7. Function implementations                                                │
│  8. Tests (in-file for unit tests)                                          │
│                                                                             │
│  Import grouping order:                                                     │
│  1. Standard library                                                        │
│  2. External crates/packages                                                │
│  3. Integration Repo primitives                                             │
│  4. Local modules (crate/package internal)                                  │
│                                                                             │
│  Service file structure:                                                    │
│  1. Service trait definition                                                │
│  2. Request types                                                           │
│  3. Response types                                                          │
│  4. Service implementation                                                  │
│  5. Helper functions                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Line Length and Formatting

| Language | Max Line Length | Formatter | Config File |
|----------|-----------------|-----------|-------------|
| Rust | 100 characters | `rustfmt` | `rustfmt.toml` |
| TypeScript | 100 characters | `prettier` | `.prettierrc` |
| Markdown | 80 characters (soft) | - | - |

---

## 3. Rust Implementation Standards

### 3.1 Rust Edition and MSRV

```toml
# Minimum Supported Rust Version
rust-version = "1.75.0"

# Edition
edition = "2021"
```

### 3.2 Cargo Clippy Lints

```toml
# Cargo.toml or .cargo/config.toml
[lints.rust]
unsafe_code = "forbid"
missing_docs = "warn"

[lints.clippy]
# Correctness
correctness = "deny"

# Suspicious
suspicious = "warn"

# Style
style = "warn"

# Complexity
complexity = "warn"

# Performance
perf = "warn"

# Pedantic (selective)
pedantic = "warn"
must_use_candidate = "allow"
module_name_repetitions = "allow"

# Restriction (selective)
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
todo = "warn"
unimplemented = "warn"
dbg_macro = "warn"
print_stdout = "warn"
print_stderr = "warn"
```

### 3.3 Error Handling Standards

```rust
// ✅ GOOD: Use Result with typed errors
pub fn get_repository(owner: &str, repo: &str) -> Result<Repository, GitHubError> {
    // ...
}

// ✅ GOOD: Use ? operator for propagation with context
pub async fn create_issue(&self, owner: &str, repo: &str, request: CreateIssueRequest)
    -> Result<Issue, GitHubError>
{
    let response = self.transport
        .send(self.build_request("POST", format!("/repos/{}/{}/issues", owner, repo), request)?)
        .await
        .map_err(|e| GitHubError::ConnectionError {
            message: format!("Failed to create issue in {}/{}", owner, repo),
            source: Some(Box::new(e)),
        })?;

    self.parse_response(response).await
}

// ✅ GOOD: Include GitHub request ID in errors
impl GitHubError {
    pub fn with_request_id(mut self, request_id: Option<String>) -> Self {
        match &mut self {
            Self::RateLimitError { github_request_id, .. } => {
                *github_request_id = request_id;
            }
            // ... other variants
        }
        self
    }
}

// ❌ BAD: Using unwrap in library code
pub fn parse_response(body: &str) -> Repository {
    serde_json::from_str(body).unwrap() // NEVER do this
}

// ❌ BAD: Ignoring rate limit information
pub async fn list_issues(&self) -> Vec<Issue> {
    // Should check rate limit headers!
}
```

### 3.4 Async Standards

```rust
// ✅ GOOD: Async functions with proper bounds
pub async fn list_repositories(&self, params: ListParams) -> Result<Page<Repository>> {
    // ...
}

// ✅ GOOD: Use tokio::select! for racing futures with rate limit wait
async fn execute_with_rate_limit<F, T>(&self, category: RateLimitCategory, future: F)
    -> Result<T>
where
    F: Future<Output = Result<T>>,
{
    // Check if we need to wait for rate limit reset
    if let Some(wait_duration) = self.rate_limiter.should_wait(category) {
        tokio::time::sleep(wait_duration).await;
    }

    future.await
}

// ✅ GOOD: Pagination as async stream
pub fn list_all_issues(&self, owner: &str, repo: &str) -> impl Stream<Item = Result<Issue>> {
    stream::unfold(Some(initial_url), |maybe_url| async move {
        let url = maybe_url?;
        let page = self.fetch_page(&url).await;
        match page {
            Ok(p) => Some((stream::iter(p.items.into_iter().map(Ok)), p.next_url)),
            Err(e) => Some((stream::once(async { Err(e) }), None)),
        }
    })
    .flatten()
}

// ✅ GOOD: Send + Sync bounds for thread safety
pub trait RepositoriesService: Send + Sync {
    fn get(&self, owner: &str, repo: &str) -> impl Future<Output = Result<Repository>> + Send;
}

// ❌ BAD: Blocking in async context
pub async fn bad_example() {
    std::thread::sleep(Duration::from_secs(1)); // Blocks the executor!
}
```

### 3.5 GitHub-Specific Rust Patterns

```rust
// ✅ GOOD: Link header parsing for pagination
fn parse_link_header(header: &str) -> PaginationLinks {
    let mut links = PaginationLinks::default();
    for part in header.split(',') {
        if let Some((url, rel)) = parse_link_part(part.trim()) {
            match rel {
                "next" => links.next = Some(url.to_string()),
                "prev" => links.prev = Some(url.to_string()),
                "first" => links.first = Some(url.to_string()),
                "last" => links.last = Some(url.to_string()),
                _ => {}
            }
        }
    }
    links
}

// ✅ GOOD: Rate limit header extraction
fn extract_rate_limit(headers: &HeaderMap) -> RateLimitInfo {
    RateLimitInfo {
        limit: headers.get("X-RateLimit-Limit")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(5000),
        remaining: headers.get("X-RateLimit-Remaining")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(5000),
        reset: headers.get("X-RateLimit-Reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .map(|ts| UNIX_EPOCH + Duration::from_secs(ts)),
        resource: headers.get("X-RateLimit-Resource")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| RateLimitCategory::from_str(s).ok())
            .unwrap_or(RateLimitCategory::Core),
    }
}

// ✅ GOOD: Webhook signature verification with constant-time comparison
pub fn verify_webhook_signature(
    secret: &SecretString,
    payload: &[u8],
    signature: &str,
) -> Result<(), WebhookVerificationError> {
    let expected = signature
        .strip_prefix("sha256=")
        .ok_or(WebhookVerificationError::InvalidFormat)?;

    let expected_bytes = hex::decode(expected)
        .map_err(|_| WebhookVerificationError::InvalidHex)?;

    let mut mac = HmacSha256::new_from_slice(secret.expose_secret().as_bytes())
        .map_err(|_| WebhookVerificationError::InvalidKey)?;
    mac.update(payload);
    let computed = mac.finalize().into_bytes();

    // Constant-time comparison
    if computed.as_slice().ct_eq(&expected_bytes).into() {
        Ok(())
    } else {
        Err(WebhookVerificationError::SignatureMismatch)
    }
}

// ✅ GOOD: JWT generation for GitHub Apps
fn generate_app_jwt(app_id: u64, private_key: &SecretString) -> Result<String, AuthError> {
    let now = chrono::Utc::now();
    let claims = AppJwtClaims {
        iat: (now - chrono::Duration::seconds(60)).timestamp(), // Clock drift tolerance
        exp: (now + chrono::Duration::minutes(9)).timestamp(),  // Max 10 minutes
        iss: app_id.to_string(),
    };

    let key = EncodingKey::from_rsa_pem(private_key.expose_secret().as_bytes())
        .map_err(|e| AuthError::InvalidPrivateKey { source: e })?;

    encode(&Header::new(Algorithm::RS256), &claims, &key)
        .map_err(|e| AuthError::JwtGenerationFailed { source: e })
}
```

### 3.6 Rustfmt Configuration

```toml
# rustfmt.toml
edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
newline_style = "Auto"
use_small_heuristics = "Default"
reorder_imports = true
reorder_modules = true
remove_nested_parens = true
format_strings = false
format_macro_matchers = false
format_macro_bodies = true
merge_derives = true
use_try_shorthand = true
use_field_init_shorthand = true
force_explicit_abi = true
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

---

## 4. TypeScript Implementation Standards

### 4.1 TypeScript Version and Target

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 4.2 ESLint Configuration

```javascript
// eslint.config.js
export default [
  {
    rules: {
      // TypeScript specific
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // General
      "no-console": "warn",
      "no-debugger": "error",
      "no-alert": "error",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
    }
  }
];
```

### 4.3 GitHub-Specific TypeScript Patterns

```typescript
// ✅ GOOD: Typed error classes with GitHub-specific info
export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly githubRequestId?: string,
    public readonly documentationUrl?: string,
  ) {
    super(message);
    this.name = 'GitHubError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class RateLimitError extends GitHubError {
  constructor(
    message: string,
    public readonly resetAt: Date,
    public readonly category: RateLimitCategory,
    githubRequestId?: string,
  ) {
    super(message, 'rate_limit_error', 403, githubRequestId);
    this.name = 'RateLimitError';
  }
}

// ✅ GOOD: Link header parsing
function parseLinkHeader(header: string): PaginationLinks {
  const links: PaginationLinks = {};

  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      const [, url, rel] = match;
      if (rel === 'next') links.next = url;
      else if (rel === 'prev') links.prev = url;
      else if (rel === 'first') links.first = url;
      else if (rel === 'last') links.last = url;
    }
  }

  return links;
}

// ✅ GOOD: Rate limit extraction from headers
function extractRateLimitInfo(headers: Headers): RateLimitInfo {
  return {
    limit: parseInt(headers.get('X-RateLimit-Limit') ?? '5000', 10),
    remaining: parseInt(headers.get('X-RateLimit-Remaining') ?? '5000', 10),
    reset: new Date(parseInt(headers.get('X-RateLimit-Reset') ?? '0', 10) * 1000),
    resource: (headers.get('X-RateLimit-Resource') ?? 'core') as RateLimitCategory,
  };
}

// ✅ GOOD: Webhook signature verification
async function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  const expected = signature.replace('sha256=', '');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload),
  );

  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  return timingSafeEqual(computed, expected);
}

// ✅ GOOD: Async iterator for pagination
async function* paginateAll<T>(
  fetchPage: (url: string) => Promise<Page<T>>,
  initialUrl: string,
): AsyncGenerator<T, void, undefined> {
  let nextUrl: string | undefined = initialUrl;

  while (nextUrl) {
    const page = await fetchPage(nextUrl);
    for (const item of page.items) {
      yield item;
    }
    nextUrl = page.nextUrl;
  }
}

// ✅ GOOD: AbortController for cancellation
async function fetchWithCancellation<T>(
  url: string,
  options: RequestInit & { timeout?: number },
): Promise<T> {
  const controller = new AbortController();
  const timeout = options.timeout ?? 30000;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return await response.json() as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 4.4 Prettier Configuration

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

---

## 5. Testing Requirements

### 5.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST CATEGORIES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  UNIT TESTS (London-School TDD)                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test individual components in isolation                           │    │
│  │ • Mock all external dependencies (HTTP, auth, rate limiter)         │    │
│  │ • Fast execution (< 10ms per test)                                  │    │
│  │ • High coverage of business logic                                   │    │
│  │ • Run on every commit                                               │    │
│  │ • Test each service independently                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  INTEGRATION TESTS                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test component interactions                                       │    │
│  │ • Use mock HTTP servers (wiremock, msw)                             │    │
│  │ • Verify request/response serialization                             │    │
│  │ • Test resilience patterns (retry, circuit breaker)                 │    │
│  │ • Test pagination handling                                          │    │
│  │ • Test rate limit handling                                          │    │
│  │ • Run on every PR                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  AUTH TESTS                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test PAT authentication                                           │    │
│  │ • Test GitHub App JWT generation                                    │    │
│  │ • Test installation token acquisition                               │    │
│  │ • Test OAuth token handling                                         │    │
│  │ • Test Actions token handling                                       │    │
│  │ • Test token refresh logic                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  WEBHOOK TESTS                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test signature verification (valid signatures)                    │    │
│  │ • Test signature verification (invalid signatures)                  │    │
│  │ • Test signature verification (tampered payloads)                   │    │
│  │ • Test event type parsing                                           │    │
│  │ • Test all supported event types                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CONTRACT TESTS                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Verify API contract compliance with GitHub OpenAPI spec           │    │
│  │ • Test against recorded API responses                               │    │
│  │ • Catch breaking changes early                                      │    │
│  │ • Run on release branches                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  E2E TESTS (Optional, requires API token)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test against real GitHub API                                      │    │
│  │ • Verify actual functionality                                       │    │
│  │ • Run manually or on release                                        │    │
│  │ • Requires GITHUB_TOKEN environment variable                        │    │
│  │ • Use dedicated test organization/repository                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Test Structure (AAA Pattern)

```rust
// Rust Example - Repository Service Test
#[tokio::test]
async fn test_repositories_get_returns_repository_on_success() {
    // Arrange
    let mock_transport = MockHttpTransport::new()
        .expect_request()
        .with_method("GET")
        .with_path("/repos/octocat/hello-world")
        .with_header("Authorization", "Bearer test-token")
        .with_header("X-GitHub-Api-Version", "2022-11-28")
        .returning(Ok(HttpResponse {
            status: 200,
            headers: rate_limit_headers(4999, 5000),
            body: fixture("repositories/get_response.json"),
        }));

    let service = RepositoriesServiceImpl::new(
        Arc::new(mock_transport),
        Arc::new(MockResilienceOrchestrator::passthrough()),
    );

    // Act
    let result = service.get("octocat", "hello-world").await;

    // Assert
    assert!(result.is_ok());
    let repo = result.unwrap();
    assert_eq!(repo.full_name, "octocat/hello-world");
    assert_eq!(repo.owner.login, "octocat");
    assert_eq!(repo.default_branch, "main");

    mock_transport.verify();
}

#[tokio::test]
async fn test_repositories_get_returns_not_found_error_on_404() {
    // Arrange
    let mock_transport = MockHttpTransport::new()
        .expect_request()
        .returning(Ok(HttpResponse {
            status: 404,
            headers: HeaderMap::new(),
            body: fixture("error_responses/not_found.json"),
        }));

    let service = RepositoriesServiceImpl::new(
        Arc::new(mock_transport),
        Arc::new(MockResilienceOrchestrator::passthrough()),
    );

    // Act
    let result = service.get("nonexistent", "repo").await;

    // Assert
    assert!(matches!(result, Err(GitHubError::NotFoundError { .. })));
}
```

```typescript
// TypeScript Example - Issues Service Test
describe('IssuesService', () => {
  describe('create', () => {
    it('should create issue and return response on success', async () => {
      // Arrange
      const mockTransport = new MockHttpTransport();
      mockTransport.onRequest({
        method: 'POST',
        path: '/repos/octocat/hello-world/issues',
        headers: {
          'Authorization': 'Bearer test-token',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }).respondWith({
        status: 201,
        headers: rateLimitHeaders(4999, 5000),
        body: loadFixture('issues/create_response.json'),
      });

      const service = new IssuesServiceImpl(mockTransport, mockResilience);
      const request: CreateIssueRequest = {
        title: 'Found a bug',
        body: 'Description of the bug',
        labels: ['bug'],
      };

      // Act
      const result = await service.create('octocat', 'hello-world', request);

      // Assert
      expect(result.number).toBe(1347);
      expect(result.title).toBe('Found a bug');
      expect(result.state).toBe('open');

      mockTransport.verify();
    });
  });
});
```

### 5.3 Mock Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOCK REQUIREMENTS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Every external dependency MUST have a mock implementation:                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Component              │ Mock                                       │    │
│  ├────────────────────────┼────────────────────────────────────────────│    │
│  │ HttpTransport          │ MockHttpTransport                          │    │
│  │ AuthProvider           │ MockAuthProvider                           │    │
│  │ PatAuthProvider        │ MockPatAuthProvider                        │    │
│  │ AppAuthProvider        │ MockAppAuthProvider                        │    │
│  │ CircuitBreaker         │ MockCircuitBreaker                         │    │
│  │ RateLimiter            │ MockRateLimiter                            │    │
│  │ RateLimitTracker       │ MockRateLimitTracker                       │    │
│  │ RetryExecutor          │ MockRetryExecutor                          │    │
│  │ PaginationHandler      │ MockPaginationHandler                      │    │
│  │ Logger                 │ MockLogger / TestLogger                    │    │
│  │ Clock/Time             │ MockClock                                  │    │
│  │ JwtGenerator           │ MockJwtGenerator                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Mock capabilities:                                                         │
│  • Configure expected calls with headers                                    │
│  • Return predefined responses with rate limit headers                      │
│  • Simulate errors and edge cases                                           │
│  • Verify call counts and arguments                                         │
│  • Support async operations                                                 │
│  • Simulate Link header pagination                                          │
│  • Simulate rate limit exhaustion                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Test Naming Convention

```
test_<service>_<method>_<scenario>_<expected_outcome>

Examples:
- test_repositories_get_returns_repository_on_success
- test_repositories_get_returns_not_found_error_on_404
- test_issues_create_returns_issue_on_201
- test_issues_list_handles_pagination_correctly
- test_pull_requests_merge_returns_merge_result_on_success
- test_actions_list_workflows_respects_rate_limit
- test_webhooks_verify_signature_rejects_invalid_signature
- test_graphql_execute_returns_data_on_success
- test_auth_manager_generates_valid_jwt_for_github_app
- test_rate_limiter_waits_when_limit_exhausted
- test_pagination_handler_parses_link_header_correctly
```

---

## 6. Test Coverage Targets

### 6.1 Coverage Thresholds

| Metric | Minimum | Target | Notes |
|--------|---------|--------|-------|
| Line Coverage | 80% | 90% | All non-trivial lines |
| Branch Coverage | 75% | 85% | All decision points |
| Function Coverage | 90% | 95% | All public functions |
| Statement Coverage | 80% | 90% | All statements |

### 6.2 Service-Specific Coverage Requirements

| Service | Minimum Coverage | Critical Paths |
|---------|------------------|----------------|
| RepositoriesService | 85% | CRUD operations, branches, contributors |
| IssuesService | 85% | CRUD operations, comments, labels |
| PullRequestsService | 85% | CRUD operations, merge, reviews |
| ActionsService | 80% | Workflows, runs, artifacts, secrets |
| UsersService | 85% | Get user, list followers |
| OrganizationsService | 80% | Members, teams |
| GistsService | 80% | CRUD operations |
| WebhooksService | 90% | Signature verification (critical!) |
| GitDataService | 80% | Blobs, trees, commits, refs |
| SearchService | 80% | All search types |
| GraphQLClient | 85% | Execute, error handling |
| AuthManager | 90% | All auth types (critical!) |
| PaginationHandler | 90% | Link header parsing (critical!) |
| RateLimitTracker | 90% | All categories (critical!) |

### 6.3 Coverage Exclusions

The following may be excluded from coverage calculations:

```rust
// Rust: Use #[cfg(not(tarpaulin_include))] or coverage(off)
#[cfg(not(tarpaulin_include))]
impl Debug for SecretString {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        write!(f, "[REDACTED]")
    }
}
```

```typescript
// TypeScript: Use /* istanbul ignore next */
/* istanbul ignore next */
function unreachableCode(): never {
  throw new Error('This should never be reached');
}
```

Allowed exclusions:
- Debug/Display implementations for sensitive types
- Unreachable code paths (with `unreachable!()` or `never` type)
- Generated code
- Platform-specific code not under test

---

## 7. Performance Benchmarks

### 7.1 Benchmark Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PERFORMANCE BENCHMARKS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request Serialization                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Operation                    │ Target      │ Max Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ Simple request serialize     │ < 10 μs     │ < 50 μs                │    │
│  │ Complex request serialize    │ < 100 μs    │ < 500 μs               │    │
│  │ Response deserialize         │ < 50 μs     │ < 200 μs               │    │
│  │ Large response deserialize   │ < 500 μs    │ < 2 ms                 │    │
│  │ GraphQL query serialize      │ < 100 μs    │ < 500 μs               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Header Parsing                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Operation                    │ Target      │ Max Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ Link header parse            │ < 5 μs      │ < 20 μs                │    │
│  │ Rate limit headers extract   │ < 2 μs      │ < 10 μs                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Cryptographic Operations                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Operation                    │ Target      │ Max Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ JWT generation               │ < 5 ms      │ < 20 ms                │    │
│  │ Webhook signature verify     │ < 1 ms      │ < 5 ms                 │    │
│  │ HMAC-SHA256 (1KB payload)    │ < 50 μs     │ < 200 μs               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Memory Usage                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Scenario                     │ Target      │ Max Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ Client instantiation         │ < 2 MB      │ < 5 MB                 │    │
│  │ Per-request overhead         │ < 10 KB     │ < 100 KB               │    │
│  │ JWT cache entry              │ < 2 KB      │ < 5 KB                 │    │
│  │ Rate limit state             │ < 1 KB      │ < 5 KB                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Throughput (with mock server)                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Scenario                     │ Target      │ Min Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ Sequential requests          │ > 100 req/s │ > 50 req/s             │    │
│  │ Concurrent requests (10)     │ > 500 req/s │ > 200 req/s            │    │
│  │ Concurrent requests (100)    │ > 1000 req/s│ > 500 req/s            │    │
│  │ Paginated fetch (100 pages)  │ < 5 s       │ < 15 s                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Benchmark Configuration

```rust
// Rust: Using criterion
use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};

fn benchmark_link_header_parsing(c: &mut Criterion) {
    let header = r#"<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next", <https://api.github.com/repos/owner/repo/issues?page=10>; rel="last""#;

    c.bench_function("parse_link_header", |b| {
        b.iter(|| parse_link_header(header))
    });
}

fn benchmark_webhook_signature_verification(c: &mut Criterion) {
    let secret = SecretString::new("webhook-secret".to_string());
    let payload = include_bytes!("../fixtures/webhooks/push_event.json");
    let signature = compute_signature(&secret, payload);

    c.bench_function("verify_webhook_signature", |b| {
        b.iter(|| verify_webhook_signature(&secret, payload, &signature))
    });
}

fn benchmark_jwt_generation(c: &mut Criterion) {
    let private_key = include_str!("../fixtures/test_private_key.pem");
    let secret = SecretString::new(private_key.to_string());

    c.bench_function("generate_app_jwt", |b| {
        b.iter(|| generate_app_jwt(12345, &secret))
    });
}

criterion_group!(benches,
    benchmark_link_header_parsing,
    benchmark_webhook_signature_verification,
    benchmark_jwt_generation,
);
criterion_main!(benches);
```

---

## 8. Documentation Standards

### 8.1 Required Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| README.md | Package root | Quick start, installation, basic usage |
| API Reference | Generated | Complete API documentation |
| CHANGELOG.md | Package root | Version history and changes |
| CONTRIBUTING.md | Repo root | Contribution guidelines |
| Examples | `examples/` directory | Working code examples |
| Auth Guide | `docs/auth.md` | Authentication methods guide |
| Webhooks Guide | `docs/webhooks.md` | Webhook handling guide |

### 8.2 Code Documentation Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DOCUMENTATION REQUIREMENTS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  REQUIRED documentation:                                                    │
│  • All public types (structs, enums, classes, interfaces)                   │
│  • All public functions/methods                                             │
│  • All public constants                                                     │
│  • All modules/namespaces                                                   │
│  • Error types and their causes                                             │
│  • All service traits/interfaces                                            │
│  • All request/response types                                               │
│                                                                             │
│  RECOMMENDED documentation:                                                 │
│  • Complex private functions                                                │
│  • Non-obvious algorithms (pagination, rate limiting)                       │
│  • Workarounds with rationale                                               │
│  • Performance-critical sections                                            │
│  • Security-sensitive code (auth, webhooks)                                 │
│                                                                             │
│  Documentation MUST include:                                                │
│  • Brief description of purpose                                             │
│  • Parameter descriptions                                                   │
│  • Return value description                                                 │
│  • Error conditions                                                         │
│  • At least one usage example for public APIs                               │
│  • GitHub API reference link where applicable                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Example Quality Standards

All examples must:
- Compile/run without errors
- Demonstrate realistic use cases
- Include error handling
- Use meaningful variable names
- Be kept up-to-date with API changes
- Show proper authentication setup

```rust
// ✅ GOOD Example
/// # Examples
///
/// ```rust
/// use integrations_github::{GitHubClient, CreateIssueRequest};
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// // Create client from environment (uses GITHUB_TOKEN)
/// let client = integrations_github::from_env()?;
///
/// // Create an issue
/// let request = CreateIssueRequest {
///     title: "Found a bug".to_string(),
///     body: Some("Description of the bug".to_string()),
///     labels: Some(vec!["bug".to_string()]),
///     assignees: None,
///     milestone: None,
/// };
///
/// let issue = client.issues()
///     .create("octocat", "hello-world", request)
///     .await?;
///
/// println!("Created issue #{}: {}", issue.number, issue.title);
/// # Ok(())
/// # }
/// ```
```

---

## 9. Review Criteria

### 9.1 Code Review Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CODE REVIEW CHECKLIST                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FUNCTIONALITY                                                              │
│  □ Code accomplishes its stated purpose                                     │
│  □ Edge cases are handled                                                   │
│  □ Error handling is appropriate                                            │
│  □ No obvious bugs or logic errors                                          │
│  □ Rate limits are properly handled                                         │
│  □ Pagination is correctly implemented                                      │
│                                                                             │
│  CODE QUALITY                                                               │
│  □ Follows coding standards defined in this document                        │
│  □ Code is readable and maintainable                                        │
│  □ No unnecessary complexity                                                │
│  □ No code duplication (DRY)                                                │
│  □ Functions/methods are appropriately sized                                │
│                                                                             │
│  TESTING                                                                    │
│  □ Adequate test coverage for new code                                      │
│  □ Tests are meaningful (not just coverage padding)                         │
│  □ Tests follow AAA pattern                                                 │
│  □ Mocks are used appropriately                                             │
│  □ Edge cases and error paths are tested                                    │
│  □ Auth tests cover all supported methods                                   │
│  □ Pagination tests verify Link header handling                             │
│                                                                             │
│  DOCUMENTATION                                                              │
│  □ Public APIs are documented                                               │
│  □ Complex logic is explained                                               │
│  □ Examples are provided where helpful                                      │
│  □ CHANGELOG is updated (if applicable)                                     │
│                                                                             │
│  SECURITY                                                                   │
│  □ No hardcoded secrets                                                     │
│  □ Input is validated at boundaries                                         │
│  □ Sensitive data is not logged                                             │
│  □ SecretString is used for credentials                                     │
│  □ Webhook signatures are verified                                          │
│  □ JWT generation uses secure algorithms                                    │
│                                                                             │
│  GITHUB-SPECIFIC                                                            │
│  □ Correct API version header used                                          │
│  □ Rate limit headers are extracted and tracked                             │
│  □ Link header pagination is supported                                      │
│  □ GitHub error responses are correctly mapped                              │
│  □ GitHub request ID is preserved in errors                                 │
│                                                                             │
│  PERFORMANCE                                                                │
│  □ No obvious performance issues                                            │
│  □ Async operations don't block                                             │
│  □ Resources are properly released                                          │
│  □ No memory leaks                                                          │
│  □ JWT and tokens are cached appropriately                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Review Process

1. **Self-Review**: Author reviews own code before submitting PR
2. **Automated Checks**: CI runs lints, tests, coverage
3. **Peer Review**: At least one maintainer reviews
4. **Address Feedback**: Author addresses all comments
5. **Approval**: Reviewer approves when satisfied
6. **Merge**: Author or reviewer merges after approval

---

## 10. Quality Gates

### 10.1 CI Quality Gates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CI QUALITY GATES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GATE 1: Format & Lint (must pass to proceed)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo fmt --check                                                 │    │
│  │ • cargo clippy -- -D warnings                                       │    │
│  │ • npm run lint                                                      │    │
│  │ • npm run format:check                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 2: Build (must pass to proceed)                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo build --all-features                                        │    │
│  │ • cargo build --no-default-features                                 │    │
│  │ • cargo build --features actions,webhooks,graphql,git-data          │    │
│  │ • npm run build                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 3: Unit Tests (must pass to proceed)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo test --lib                                                  │    │
│  │ • npm run test:unit                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 4: Integration Tests (must pass to proceed)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo test --test '*'                                             │    │
│  │ • npm run test:integration                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 5: Coverage (must meet thresholds)                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Line coverage ≥ 80%                                               │    │
│  │ • Branch coverage ≥ 75%                                             │    │
│  │ • Function coverage ≥ 90%                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 6: Documentation (must pass)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo doc --no-deps                                               │    │
│  │ • npm run docs:build                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 7: Security Audit (warnings allowed, critical fails)                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo audit                                                       │    │
│  │ • npm audit                                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Continuous Integration

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
  rust-checks:
    name: Rust Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Format Check
        run: cargo fmt --check

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Build (all features)
        run: cargo build --all-features

      - name: Build (no default features)
        run: cargo build --no-default-features

      - name: Test
        run: cargo test --all-features

      - name: Coverage
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml --fail-under 80

      - name: Doc
        run: cargo doc --no-deps

  typescript-checks:
    name: TypeScript Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Format Check
        run: npm run format:check

      - name: Build
        run: npm run build

      - name: Test
        run: npm run test:coverage

      - name: Coverage Check
        run: npm run coverage:check

  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Rust Audit
        run: |
          cargo install cargo-audit
          cargo audit

      - name: NPM Audit
        run: npm audit --audit-level=high
```

---

## 12. Pre-Release Checklist

### 12.1 Release Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRE-RELEASE CHECKLIST                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CODE QUALITY                                                               │
│  □ All quality gates pass                                                   │
│  □ No critical or high security vulnerabilities                             │
│  □ Test coverage meets minimum thresholds                                   │
│  □ All public APIs are documented                                           │
│  □ Examples compile and run correctly                                       │
│                                                                             │
│  TESTING                                                                    │
│  □ Unit tests pass                                                          │
│  □ Integration tests pass                                                   │
│  □ Contract tests pass (if applicable)                                      │
│  □ Manual smoke test performed                                              │
│  □ E2E tests pass (if API token available)                                  │
│  □ All 11 services tested                                                   │
│  □ All auth methods tested                                                  │
│  □ Webhook signature verification tested                                    │
│                                                                             │
│  GITHUB-SPECIFIC                                                            │
│  □ Tested against current GitHub API version                                │
│  □ Rate limit handling verified                                             │
│  □ Pagination handling verified                                             │
│  □ All error types mapped correctly                                         │
│                                                                             │
│  DOCUMENTATION                                                              │
│  □ CHANGELOG.md updated with release notes                                  │
│  □ README.md is current                                                     │
│  □ API documentation generated                                              │
│  □ Migration guide written (if breaking changes)                            │
│  □ Auth guide is accurate                                                   │
│  □ Webhooks guide is accurate                                               │
│                                                                             │
│  VERSION                                                                    │
│  □ Version bumped according to semver                                       │
│  □ Version consistent across Cargo.toml and package.json                    │
│  □ Git tag created                                                          │
│                                                                             │
│  COMPATIBILITY                                                              │
│  □ MSRV documented and tested                                               │
│  □ Node.js version requirements documented                                  │
│  □ Dependencies are up to date                                              │
│  □ No deprecated APIs used                                                  │
│  □ Tested with latest GitHub API version                                    │
│                                                                             │
│  FINAL APPROVAL                                                             │
│  □ Release reviewed by maintainer                                           │
│  □ Release notes approved                                                   │
│  □ Publish to crates.io / npm                                               │
│  □ GitHub release created                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Semantic Versioning

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking API change | MAJOR | 1.0.0 → 2.0.0 |
| New service or feature | MINOR | 1.0.0 → 1.1.0 |
| Bug fix | PATCH | 1.0.0 → 1.0.1 |
| Documentation only | PATCH | 1.0.0 → 1.0.1 |
| New GitHub API feature support | MINOR | 1.0.0 → 1.1.0 |

---

## 13. GitHub-Specific Quality Criteria

### 13.1 Authentication Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION VALIDATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PAT Authentication:                                                        │
│  □ Token format validation (ghp_*, github_pat_*)                            │
│  □ Authorization header correctly formatted                                 │
│  □ 401 errors properly mapped to AuthenticationError                        │
│                                                                             │
│  GitHub App Authentication:                                                 │
│  □ JWT claims include correct iat, exp, iss                                 │
│  □ JWT expiry < 10 minutes from issuance                                    │
│  □ Private key validation                                                   │
│  □ Installation token retrieval                                             │
│  □ Token caching with proper expiry handling                                │
│                                                                             │
│  OAuth Authentication:                                                      │
│  □ Access token handling                                                    │
│  □ Token refresh (if supported)                                             │
│                                                                             │
│  Actions Token Authentication:                                              │
│  □ GITHUB_TOKEN environment variable reading                                │
│  □ Correct scopes validation                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Rate Limit Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RATE LIMIT VALIDATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Header Extraction:                                                         │
│  □ X-RateLimit-Limit extracted correctly                                    │
│  □ X-RateLimit-Remaining extracted correctly                                │
│  □ X-RateLimit-Reset extracted and converted to timestamp                   │
│  □ X-RateLimit-Resource extracted for category identification               │
│                                                                             │
│  Category Handling:                                                         │
│  □ Core rate limit (5000/hr) tracked separately                             │
│  □ Search rate limit (30/min) tracked separately                            │
│  □ GraphQL rate limit (5000 points/hr) tracked separately                   │
│                                                                             │
│  Error Handling:                                                            │
│  □ 403 with rate limit headers → RateLimitError                             │
│  □ 429 → RateLimitError with retry-after                                    │
│  □ Reset time included in error                                             │
│                                                                             │
│  Proactive Handling:                                                        │
│  □ Client can check remaining before request                                │
│  □ Wait option available when limit exhausted                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Pagination Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PAGINATION VALIDATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Link Header Parsing:                                                       │
│  □ "next" link extracted correctly                                          │
│  □ "prev" link extracted correctly                                          │
│  □ "first" link extracted correctly                                         │
│  □ "last" link extracted correctly                                          │
│  □ Missing links handled gracefully                                         │
│                                                                             │
│  Page Type:                                                                 │
│  □ Items array populated                                                    │
│  □ has_next() returns correct boolean                                       │
│  □ has_prev() returns correct boolean                                       │
│                                                                             │
│  Iterator:                                                                  │
│  □ Async iteration works correctly                                          │
│  □ Stops when no "next" link                                                │
│  □ Errors propagated correctly                                              │
│  □ collect_all() helper works                                               │
│                                                                             │
│  Edge Cases:                                                                │
│  □ Empty results handled                                                    │
│  □ Single page results handled                                              │
│  □ Invalid Link header handled gracefully                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.4 Webhook Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WEBHOOK VALIDATION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Signature Verification:                                                    │
│  □ HMAC-SHA256 used correctly                                               │
│  □ "sha256=" prefix handled                                                 │
│  □ Constant-time comparison used                                            │
│  □ Invalid signatures rejected                                              │
│  □ Tampered payloads detected                                               │
│  □ Missing signature header handled                                         │
│                                                                             │
│  Event Parsing:                                                             │
│  □ X-GitHub-Event header extracted                                          │
│  □ All supported events parsed correctly                                    │
│  □ Unknown events handled gracefully                                        │
│  □ X-GitHub-Delivery (request ID) captured                                  │
│                                                                             │
│  Security:                                                                  │
│  □ Secret never logged                                                      │
│  □ Signature verification before parsing                                    │
│  □ Payload size limits enforced                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Architecture Part 3](./architecture-github-3.md) | Refinement | [Completion](./completion-github.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial refinement criteria |

---

**SPARC Refinement Phase: COMPLETE**

*Awaiting "Next phase." to begin Completion phase.*

# SPARC Architecture: GitHub Integration Module

**Part 2 of 3: Data Flow, State Management, and Concurrency Patterns**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`

---

## Table of Contents

8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Request/Response Pipeline](#9-requestresponse-pipeline)
10. [Pagination Architecture](#10-pagination-architecture)
11. [State Management](#11-state-management)
12. [Concurrency Patterns](#12-concurrency-patterns)
13. [Error Propagation](#13-error-propagation)
14. [Rate Limit Management](#14-rate-limit-management)

---

## 8. Data Flow Architecture

### 8.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW OVERVIEW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │ Application │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         CLIENT LAYER                                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │ GitHubClient │  │ ClientConfig │  │ SecretString │               │    │
│  │  └───────┬──────┘  └──────────────┘  └──────────────┘               │    │
│  │          │                                                           │    │
│  └──────────┼───────────────────────────────────────────────────────────┘    │
│             │                                                               │
│             ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        SERVICE LAYER                                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │ Repositories │  │   Issues     │  │ PullRequests │               │    │
│  │  │   Service    │  │   Service    │  │   Service    │               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          │                 │                 │                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │   Actions    │  │   Users      │  │ Organizations│               │    │
│  │  │   Service    │  │   Service    │  │   Service    │               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          │                 │                 │                       │    │
│  │          └─────────────────┼─────────────────┘                       │    │
│  │                            │                                          │    │
│  └────────────────────────────┼──────────────────────────────────────────┘    │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       RESILIENCE LAYER                               │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │ResilienceOrch │  │RetryExecutor │  │CircuitBreaker│               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          │                 │                 │                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │ RateLimiter  │  │RateLimitTrack│  │ Pagination   │               │    │
│  │  │              │  │              │  │   Handler    │               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          └─────────────────┼─────────────────┘                       │    │
│  │                            │                                          │    │
│  └────────────────────────────┼──────────────────────────────────────────┘    │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       TRANSPORT LAYER                                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │RequestBuilder│  │HttpTransport │  │ResponseParser│               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          │                 │                 │                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │ AuthManager  │  │ JwtGenerator │  │ LinkParser   │               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          └─────────────────┼─────────────────┘                       │    │
│  │                            │                                          │    │
│  └────────────────────────────┼──────────────────────────────────────────┘    │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        NETWORK I/O                                   │    │
│  │               HTTPS/TLS 1.2+ → api.github.com                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Request Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REQUEST DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │ CreateIssueReq  │  Input DTO                                             │
│  │  - owner        │                                                        │
│  │  - repo         │                                                        │
│  │  - title        │                                                        │
│  │  - body         │                                                        │
│  │  - labels       │                                                        │
│  │  - assignees    │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   VALIDATION    │  Validate all fields                                   │
│  │  - Required     │  - title not empty                                     │
│  │  - Constraints  │  - owner/repo valid format                             │
│  │  - Types        │  - labels array of strings                             │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ REQUEST BUILDER │  Build HTTP request                                    │
│  │  - Headers      │  - Authorization: Bearer/token                         │
│  │  - Body (JSON)  │  - X-GitHub-Api-Version: 2022-11-28                   │
│  │  - URL          │  - Accept: application/vnd.github+json                │
│  │  - Method       │  - User-Agent: integrations-github/0.1.0              │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   RATE LIMIT    │  Check rate limit category                             │
│  │  - Primary      │  - 5000/hr for authenticated                          │
│  │  - Secondary    │  - 90/min for search                                  │
│  │  - Wait/reject  │  - Block or error if exhausted                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │CIRCUIT BREAKER  │  Check circuit state                                   │
│  │  - Closed: OK   │  - Open: fail fast                                     │
│  │  - Half-open    │  - Allow probe request                                 │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   HTTP SEND     │  Execute request                                       │
│  │  - TLS 1.2+     │  - Connection pooling                                  │
│  │  - HTTP/2       │  - Keep-alive                                          │
│  │  - Timeout      │  - 30s default                                         │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│      NETWORK I/O                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Response Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESPONSE DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│      NETWORK I/O                                                            │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  HTTP RESPONSE  │  Raw HTTP response                                     │
│  │  - Status code  │  - 200, 201, 4xx, 5xx                                  │
│  │  - Headers      │  - X-RateLimit-*, Link, X-GitHub-Request-Id           │
│  │  - Body         │  - JSON                                                │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ HEADER EXTRACT  │  Extract metadata                                      │
│  │  - Request ID   │  - X-GitHub-Request-Id for correlation                │
│  │  - Rate limits  │  - Update rate limit tracker                          │
│  │  - Pagination   │  - Parse Link header for next/prev/last               │
│  │  - Retry-After  │  - For backoff calculation                             │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                    STATUS CODE ROUTING                       │            │
│  │                                                              │            │
│  │   200/201 OK ─────► Success Path                             │            │
│  │   204 No Content ─► Success (empty response)                 │            │
│  │   403 Rate Limit ─► Rate Limit Handler (check header)        │            │
│  │   403 Forbidden ──► Permission Error (no retry)              │            │
│  │   404 Not Found ──► Resource Error (no retry)                │            │
│  │   422 Validation ─► Validation Error (no retry)              │            │
│  │   500-599 ────────► Server Error (may retry)                 │            │
│  │   401 Unauthorized► Auth Error (token refresh?)              │            │
│  │                                                              │            │
│  └─────────────────────────────────────────────────────────────┘            │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ RESPONSE PARSER │  Parse JSON body                                       │
│  │  - Deserialize  │  - Into strongly-typed struct                          │
│  │  - Validate     │  - Check required fields                               │
│  │  - Transform    │  - Convert to domain types                             │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ IssueResponse   │  Output DTO                                            │
│  │  - id           │                                                        │
│  │  - number       │                                                        │
│  │  - title        │                                                        │
│  │  - state        │                                                        │
│  │  - user         │                                                        │
│  │  - labels       │                                                        │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Request/Response Pipeline

### 9.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REQUEST/RESPONSE PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         MIDDLEWARE CHAIN                             │    │
│  │                                                                      │    │
│  │   Request ─►┌────────┐─►┌────────┐─►┌────────┐─►┌────────┐─► API     │    │
│  │             │Logging │  │ Rate   │  │Circuit │  │ Retry  │           │    │
│  │   Response◄─│        │◄─│ Limit  │◄─│Breaker │◄─│        │◄─ API     │    │
│  │             └────────┘  └────────┘  └────────┘  └────────┘           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      MIDDLEWARE INTERFACES                           │    │
│  │                                                                      │    │
│  │  trait RequestMiddleware {                                           │    │
│  │      fn process_request(&self, req: &mut Request) -> Result<()>;     │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  trait ResponseMiddleware {                                          │    │
│  │      fn process_response(&self, resp: &mut Response) -> Result<()>;  │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  trait Pipeline {                                                    │    │
│  │      fn add_middleware(&mut self, mw: Box<dyn Middleware>);          │    │
│  │      fn execute(&self, req: Request) -> Result<Response>;            │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Request Building Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REQUEST BUILDING PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 1: Endpoint Resolution                                          │  │
│  │                                                                        │  │
│  │   Service Method ──► Endpoint Mapping ──► Full URL                     │  │
│  │                                                                        │  │
│  │   repos.get("owner", "repo")  ──► GET /repos/{owner}/{repo}            │  │
│  │   issues.create("owner", "repo", req) ──► POST /repos/{owner}/{repo}/issues │
│  │   prs.merge("owner", "repo", num) ──► PUT /repos/{owner}/{repo}/pulls/{num}/merge │
│  │   actions.list_runs("owner", "repo") ──► GET /repos/{owner}/{repo}/actions/runs │
│  │   search.code(query) ──► GET /search/code?q={query}                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 2: Header Assembly                                              │  │
│  │                                                                        │  │
│  │   Required Headers:                                                    │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │ Authorization: Bearer <token>                                   │ │  │
│  │   │ X-GitHub-Api-Version: 2022-11-28                               │ │  │
│  │   │ Accept: application/vnd.github+json                            │ │  │
│  │   │ User-Agent: integrations-github/0.1.0                          │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  │   Conditional Headers:                                                 │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │ Content-Type: application/json (for POST/PUT/PATCH)            │ │  │
│  │   │ Accept: application/vnd.github.preview+json (for previews)     │ │  │
│  │   │ If-None-Match: {etag} (for conditional requests)               │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 3: Body Serialization                                           │  │
│  │                                                                        │  │
│  │   Domain Object ──► JSON Serialization ──► Request Body                │  │
│  │                                                                        │  │
│  │   CreateIssueRequest {                                                 │  │
│  │       title: "Bug report",                                             │  │
│  │       body: "Description...",                                          │  │
│  │       labels: ["bug"],                                                 │  │
│  │   }                                                                    │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   {                                                                    │  │
│  │       "title": "Bug report",                                           │  │
│  │       "body": "Description...",                                        │  │
│  │       "labels": ["bug"]                                                │  │
│  │   }                                                                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 4: Query Parameter Assembly                                     │  │
│  │                                                                        │  │
│  │   Pagination & Filter Parameters ──► URL Query String                  │  │
│  │                                                                        │  │
│  │   ListParams {                                                         │  │
│  │       page: 2,                                                         │  │
│  │       per_page: 30,                                                    │  │
│  │       state: Some("open"),                                             │  │
│  │       sort: Some("updated"),                                           │  │
│  │       direction: Some("desc"),                                         │  │
│  │   }                                                                    │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   ?page=2&per_page=30&state=open&sort=updated&direction=desc           │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Response Parsing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RESPONSE PARSING PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 1: Status Classification                                        │  │
│  │                                                                        │  │
│  │   HTTP Status ──► Classification ──► Handler Selection                 │  │
│  │                                                                        │  │
│  │   ┌────────────┬──────────────────────────────────────────────────┐   │  │
│  │   │ Status     │ Classification                                   │   │  │
│  │   ├────────────┼──────────────────────────────────────────────────┤   │  │
│  │   │ 200        │ Success → Parse body                             │   │  │
│  │   │ 201        │ Created → Parse body                             │   │  │
│  │   │ 204        │ No Content → Empty success                       │   │  │
│  │   │ 304        │ Not Modified → Use cached                        │   │  │
│  │   │ 400        │ Bad Request → No retry                           │   │  │
│  │   │ 401        │ Unauthorized → Token refresh / No retry          │   │  │
│  │   │ 403        │ Forbidden → Check rate limit / No retry          │   │  │
│  │   │ 404        │ Not Found → No retry                             │   │  │
│  │   │ 422        │ Unprocessable → No retry                         │   │  │
│  │   │ 429        │ Too Many Requests → Retry with Retry-After       │   │  │
│  │   │ 500        │ Server Error → Retry                             │   │  │
│  │   │ 502        │ Bad Gateway → Retry                              │   │  │
│  │   │ 503        │ Service Unavailable → Retry                      │   │  │
│  │   └────────────┴──────────────────────────────────────────────────┘   │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 2: Rate Limit Header Extraction                                 │  │
│  │                                                                        │  │
│  │   Headers → RateLimitInfo                                              │  │
│  │                                                                        │  │
│  │   X-RateLimit-Limit: 5000                                              │  │
│  │   X-RateLimit-Remaining: 4999                                          │  │
│  │   X-RateLimit-Reset: 1702123456                                        │  │
│  │   X-RateLimit-Used: 1                                                  │  │
│  │   X-RateLimit-Resource: core                                           │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   RateLimitInfo {                                                      │  │
│  │       limit: 5000,                                                     │  │
│  │       remaining: 4999,                                                 │  │
│  │       reset: Instant::...,                                             │  │
│  │       used: 1,                                                         │  │
│  │       resource: RateLimitResource::Core,                               │  │
│  │   }                                                                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 3: Pagination Link Extraction                                   │  │
│  │                                                                        │  │
│  │   Link Header → PaginationLinks                                        │  │
│  │                                                                        │  │
│  │   Link: <https://api.github.com/repos/...?page=2>; rel="next",         │  │
│  │         <https://api.github.com/repos/...?page=10>; rel="last"         │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   PaginationLinks {                                                    │  │
│  │       next: Some("https://api.github.com/repos/...?page=2"),           │  │
│  │       prev: None,                                                      │  │
│  │       first: None,                                                     │  │
│  │       last: Some("https://api.github.com/repos/...?page=10"),          │  │
│  │   }                                                                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 4: Body Parsing                                                 │  │
│  │                                                                        │  │
│  │   JSON Body ──► Deserialize ──► Domain Object                          │  │
│  │                                                                        │  │
│  │   {                                                                    │  │
│  │       "id": 123,                                                       │  │
│  │       "number": 1,                                                     │  │
│  │       "title": "Bug report",                                           │  │
│  │       "state": "open",                                                 │  │
│  │       "user": { "login": "octocat", ... },                             │  │
│  │       "labels": [...]                                                  │  │
│  │   }                                                                    │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   Issue {                                                              │  │
│  │       id: 123,                                                         │  │
│  │       number: 1,                                                       │  │
│  │       title: "Bug report".into(),                                      │  │
│  │       state: IssueState::Open,                                         │  │
│  │       user: User { login: "octocat".into(), ... },                     │  │
│  │       labels: vec![...],                                               │  │
│  │   }                                                                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Pagination Architecture

### 10.1 Link Header Pagination

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LINK HEADER PAGINATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHub uses Link header with rel attributes for pagination:                │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Link Header Format:                                                    │ │
│  │                                                                         │ │
│  │ Link: <url>; rel="next", <url>; rel="last", <url>; rel="first",       │ │
│  │       <url>; rel="prev"                                                │ │
│  │                                                                         │ │
│  │ Example:                                                               │ │
│  │ Link: <https://api.github.com/repos/owner/repo/issues?page=3>;         │ │
│  │       rel="next",                                                      │ │
│  │       <https://api.github.com/repos/owner/repo/issues?page=50>;        │ │
│  │       rel="last",                                                      │ │
│  │       <https://api.github.com/repos/owner/repo/issues?page=1>;         │ │
│  │       rel="first",                                                     │ │
│  │       <https://api.github.com/repos/owner/repo/issues?page=1>;         │ │
│  │       rel="prev"                                                       │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Link Parser Implementation                                             │ │
│  │                                                                         │ │
│  │   fn parse_link_header(header: &str) -> PaginationLinks {              │ │
│  │       let mut links = PaginationLinks::default();                      │ │
│  │       for part in header.split(',') {                                  │ │
│  │           let (url, rel) = parse_link_part(part.trim());               │ │
│  │           match rel {                                                  │ │
│  │               "next" => links.next = Some(url),                        │ │
│  │               "prev" => links.prev = Some(url),                        │ │
│  │               "first" => links.first = Some(url),                      │ │
│  │               "last" => links.last = Some(url),                        │ │
│  │               _ => {}                                                  │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │       links                                                            │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Page Type and Iterator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PAGE TYPE AND ITERATOR                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Page<T> Structure                                                      │ │
│  │                                                                         │ │
│  │   pub struct Page<T> {                                                 │ │
│  │       /// The items in this page                                       │ │
│  │       pub items: Vec<T>,                                               │ │
│  │                                                                         │ │
│  │       /// URL for next page (if any)                                   │ │
│  │       pub next_url: Option<String>,                                    │ │
│  │                                                                         │ │
│  │       /// URL for previous page (if any)                               │ │
│  │       pub prev_url: Option<String>,                                    │ │
│  │                                                                         │ │
│  │       /// URL for first page                                           │ │
│  │       pub first_url: Option<String>,                                   │ │
│  │                                                                         │ │
│  │       /// URL for last page                                            │ │
│  │       pub last_url: Option<String>,                                    │ │
│  │                                                                         │ │
│  │       /// Rate limit info from this request                            │ │
│  │       pub rate_limit: RateLimitInfo,                                   │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl<T> Page<T> {                                                    │ │
│  │       pub fn has_next(&self) -> bool { self.next_url.is_some() }       │ │
│  │       pub fn has_prev(&self) -> bool { self.prev_url.is_some() }       │ │
│  │       pub fn is_empty(&self) -> bool { self.items.is_empty() }         │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ PageIterator<T> - Async Iterator Pattern                               │ │
│  │                                                                         │ │
│  │   pub struct PageIterator<T, F> {                                      │ │
│  │       fetch_fn: F,                                                     │ │
│  │       next_url: Option<String>,                                        │ │
│  │       exhausted: bool,                                                 │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl<T, F> PageIterator<T, F>                                        │ │
│  │   where                                                                │ │
│  │       F: Fn(String) -> BoxFuture<Result<Page<T>, GitHubError>>,        │ │
│  │   {                                                                    │ │
│  │       pub async fn next_page(&mut self) -> Option<Result<Page<T>>> {   │ │
│  │           if self.exhausted { return None; }                           │ │
│  │                                                                         │ │
│  │           let url = self.next_url.take()?;                             │ │
│  │           match (self.fetch_fn)(url).await {                           │ │
│  │               Ok(page) => {                                            │ │
│  │                   self.next_url = page.next_url.clone();               │ │
│  │                   if self.next_url.is_none() {                         │ │
│  │                       self.exhausted = true;                           │ │
│  │                   }                                                    │ │
│  │                   Some(Ok(page))                                       │ │
│  │               }                                                        │ │
│  │               Err(e) => {                                              │ │
│  │                   self.exhausted = true;                               │ │
│  │                   Some(Err(e))                                         │ │
│  │               }                                                        │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Usage Example                                                          │ │
│  │                                                                         │ │
│  │   // Get first page                                                    │ │
│  │   let page = client.issues().list("owner", "repo", params).await?;     │ │
│  │   println!("Page 1: {} issues", page.items.len());                     │ │
│  │                                                                         │ │
│  │   // Iterate through all pages                                         │ │
│  │   let mut iterator = client.issues().list_all("owner", "repo", params);│ │
│  │   while let Some(result) = iterator.next_page().await {                │ │
│  │       let page = result?;                                              │ │
│  │       for issue in page.items {                                        │ │
│  │           println!("Issue #{}: {}", issue.number, issue.title);        │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Collect all items (convenience method)                            │ │
│  │   let all_issues = client.issues()                                     │ │
│  │       .list_all("owner", "repo", params)                               │ │
│  │       .collect_all()                                                   │ │
│  │       .await?;                                                         │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Pagination Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAGINATION FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Client Request: list_issues(per_page=30)                                  │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  GET /repos/{owner}/{repo}/issues?per_page=30&page=1                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Response: 200 OK                                                   │   │
│   │  Link: <...?page=2>; rel="next", <...?page=5>; rel="last"           │   │
│   │  Body: [issue1, issue2, ..., issue30]                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Page<Issue> {                                                      │   │
│   │      items: [issue1..issue30],                                      │   │
│   │      next_url: Some("...?page=2"),                                  │   │
│   │      last_url: Some("...?page=5"),                                  │   │
│   │  }                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                   │
│         │ Client calls next_page()                                          │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  GET ...?page=2                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Response: 200 OK                                                   │   │
│   │  Link: <...?page=1>; rel="prev", <...?page=3>; rel="next",          │   │
│   │        <...?page=5>; rel="last"                                     │   │
│   │  Body: [issue31, issue32, ..., issue60]                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│      ... continues until last page (no "next" link) ...                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. State Management

### 11.1 Client State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT STATE MANAGEMENT                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      IMMUTABLE STATE                                 │    │
│  │                                                                      │    │
│  │   Shared across all requests (Arc<T>):                               │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐  ┌─────────────────────┐                   │    │
│  │   │   ClientConfig      │  │   HttpClient        │                   │    │
│  │   │   - base_url        │  │   - connection pool │                   │    │
│  │   │   - api_version     │  │   - TLS config      │                   │    │
│  │   │   - timeouts        │  │   - proxy settings  │                   │    │
│  │   │   - user_agent      │  │                     │                   │    │
│  │   └─────────────────────┘  └─────────────────────┘                   │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐  ┌─────────────────────┐                   │    │
│  │   │   Logger            │  │   Tracer            │                   │    │
│  │   │   - log level       │  │   - exporter        │                   │    │
│  │   │   - targets         │  │   - sampler         │                   │    │
│  │   └─────────────────────┘  └─────────────────────┘                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       MUTABLE STATE                                  │    │
│  │                                                                      │    │
│  │   Protected by synchronization primitives:                           │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐                                            │    │
│  │   │ AuthState           │  Arc<RwLock<T>>                            │    │
│  │   │   - current_token (for OAuth refresh)                            │    │
│  │   │   - jwt_cache (for GitHub Apps)                                  │    │
│  │   │   - installation_token_cache                                     │    │
│  │   │   - token_expiry                                                 │    │
│  │   └─────────────────────┘                                            │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐                                            │    │
│  │   │ CircuitBreakerState │  Arc<RwLock<T>>                            │    │
│  │   │   - state: Closed/Open/HalfOpen                                  │    │
│  │   │   - failure_count                                                │    │
│  │   │   - success_count                                                │    │
│  │   │   - last_failure_time                                            │    │
│  │   │   - open_until                                                   │    │
│  │   └─────────────────────┘                                            │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐                                            │    │
│  │   │  RateLimitState     │  Arc<RwLock<T>>                            │    │
│  │   │   - primary: { remaining, reset, limit }                         │    │
│  │   │   - secondary: { remaining, reset, limit }                       │    │
│  │   │   - graphql: { remaining, reset, limit }                         │    │
│  │   └─────────────────────┘                                            │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐                                            │    │
│  │   │    MetricsState     │  Arc<AtomicU64> for counters               │    │
│  │   │   - request_count                                                │    │
│  │   │   - error_count                                                  │    │
│  │   │   - latency_histogram                                            │    │
│  │   └─────────────────────┘                                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Service State Isolation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SERVICE STATE ISOLATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHubClient                                                               │
│  │                                                                          │
│  ├─► RepositoriesService ──► Uses shared rate limit tracker (primary)       │
│  │                                                                          │
│  ├─► IssuesService ─────────► Uses shared rate limit tracker (primary)      │
│  │                                                                          │
│  ├─► PullRequestsService ──► Uses shared rate limit tracker (primary)       │
│  │                                                                          │
│  ├─► ActionsService ────────► Uses shared rate limit tracker (primary)      │
│  │                                                                          │
│  ├─► SearchService ─────────► Uses ISOLATED rate limit tracker (secondary)  │
│  │                                                                          │
│  ├─► GraphQLClient ─────────► Uses ISOLATED rate limit tracker (graphql)    │
│  │                                                                          │
│  └─► All Services ──────────► Share circuit breaker, auth, transport        │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Shared Components (via Arc)                                            │ │
│  │                                                                         │ │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │ │
│  │   │  HttpClient  │  │  AuthManager │  │   Logger     │                 │ │
│  │   │   (shared)   │  │   (shared)   │  │  (shared)    │                 │ │
│  │   └──────────────┘  └──────────────┘  └──────────────┘                 │ │
│  │                                                                         │ │
│  │   ┌──────────────────────────────────────────────────┐                 │ │
│  │   │          Rate Limit Trackers (per-category)      │                 │ │
│  │   │  Primary (core): 5000/hr   │ Shared by most      │                 │ │
│  │   │  Secondary: 90/min         │ Search endpoints    │                 │ │
│  │   │  GraphQL: 5000 points/hr   │ GraphQL only        │                 │ │
│  │   └──────────────────────────────────────────────────┘                 │ │
│  │                                                                         │ │
│  │   ┌──────────────────────────────────────────────────┐                 │ │
│  │   │          Circuit Breaker (shared)                │                 │ │
│  │   │  One circuit for all API calls                   │                 │ │
│  │   │  Opens on repeated 5xx errors                    │                 │ │
│  │   └──────────────────────────────────────────────────┘                 │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Benefits:                                                                  │
│  • Rate limits properly tracked per GitHub category                         │
│  • Search doesn't exhaust core rate limit                                   │
│  • GraphQL cost tracking separate from REST                                 │
│  • Connection pool shared for efficiency                                    │
│  • Auth tokens shared (refresh applies to all)                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Request-Scoped State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REQUEST-SCOPED STATE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Each request carries isolated context:                                     │
│                                                                             │
│  struct RequestContext {                                                    │
│      // Tracing                                                             │
│      span: tracing::Span,         // Request-specific span                  │
│      trace_id: TraceId,           // Distributed trace ID                   │
│      parent_span_id: Option<SpanId>,                                        │
│                                                                             │
│      // Request metadata                                                    │
│      github_request_id: Option<String>, // From X-GitHub-Request-Id         │
│      start_time: Instant,         // For latency calculation                │
│      attempt_number: u32,         // Current retry attempt                  │
│                                                                             │
│      // Rate limit category                                                 │
│      rate_limit_category: RateLimitCategory,  // Core/Search/GraphQL        │
│                                                                             │
│      // Deadline management                                                 │
│      deadline: Option<Instant>,   // Absolute deadline                      │
│      remaining_timeout: Duration, // Decremented on retry                   │
│  }                                                                          │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Request Context Flow                                                   │ │
│  │                                                                         │ │
│  │   Client.send()                                                         │ │
│  │       │                                                                 │ │
│  │       ├─► Create RequestContext with fresh span                         │ │
│  │       │   └─► Determine rate limit category from endpoint               │ │
│  │       │                                                                 │ │
│  │       ├─► Rate limit check (acquire permit)                             │ │
│  │       │                                                                 │ │
│  │       ├─► Retry loop (attempt 1, 2, 3...)                               │ │
│  │       │       │                                                         │ │
│  │       │       ├─► Update attempt_number                                 │ │
│  │       │       ├─► Calculate remaining_timeout                           │ │
│  │       │       ├─► Create child span for attempt                         │ │
│  │       │       ├─► Execute request                                       │ │
│  │       │       └─► Update rate limit from response headers               │ │
│  │       │                                                                 │ │
│  │       └─► Close span, record metrics                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Concurrency Patterns

### 12.1 Async Runtime Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ASYNC RUNTIME MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      RUST (Tokio Runtime)                            │    │
│  │                                                                      │    │
│  │   ┌──────────────────────────────────────────────────────────────┐   │    │
│  │   │                    Tokio Multi-Thread                        │   │    │
│  │   │                                                              │   │    │
│  │   │   Worker Thread 1 ─── Task Queue ─── Executor                │   │    │
│  │   │   Worker Thread 2 ─── Task Queue ─── Executor                │   │    │
│  │   │   Worker Thread N ─── Task Queue ─── Executor                │   │    │
│  │   │                                                              │   │    │
│  │   │   Features Used:                                             │   │    │
│  │   │   • tokio::spawn for concurrent tasks                        │   │    │
│  │   │   • tokio::select! for racing futures                        │   │    │
│  │   │   • tokio::time for delays and timeouts                      │   │    │
│  │   │   • tokio::sync for channels and mutexes                     │   │    │
│  │   │                                                              │   │    │
│  │   └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  TYPESCRIPT (Node.js Event Loop)                     │    │
│  │                                                                      │    │
│  │   ┌──────────────────────────────────────────────────────────────┐   │    │
│  │   │                    Event Loop Phases                         │   │    │
│  │   │                                                              │   │    │
│  │   │   Timers ─► Callbacks ─► Idle ─► Poll ─► Check ─► Close      │   │    │
│  │   │      │                                                       │   │    │
│  │   │      └──────────────────────────────────────────────────┐    │   │    │
│  │   │                                                         │    │   │    │
│  │   │   Features Used:                                        │    │   │    │
│  │   │   • Promise/async-await for async flow                  │    │   │    │
│  │   │   • setTimeout for delays                               │    │   │    │
│  │   │   • AbortController for cancellation                    │    │   │    │
│  │   │   • fetch API for HTTP                                  │    │   │    │
│  │   │                                                              │   │    │
│  │   └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Concurrent Request Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONCURRENT REQUEST HANDLING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pattern: Multiple concurrent requests with shared rate limiting            │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rust Example                                                           │ │
│  │                                                                         │ │
│  │   let client = Arc::new(GitHubClient::new(config)?);                   │ │
│  │                                                                         │ │
│  │   // Fetch issues from multiple repos concurrently                     │ │
│  │   let repos = vec!["repo1", "repo2", "repo3"];                         │ │
│  │   let handles: Vec<_> = repos                                          │ │
│  │       .into_iter()                                                     │ │
│  │       .map(|repo| {                                                    │ │
│  │           let client = Arc::clone(&client);                            │ │
│  │           tokio::spawn(async move {                                    │ │
│  │               client.issues().list("owner", repo, Default::default())  │ │
│  │                   .await                                               │ │
│  │           })                                                           │ │
│  │       })                                                               │ │
│  │       .collect();                                                      │ │
│  │                                                                         │ │
│  │   // Await all results                                                 │ │
│  │   let results = futures::future::join_all(handles).await;              │ │
│  │                                                                         │ │
│  │   // Rate limits are automatically respected across all requests       │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TypeScript Example                                                     │ │
│  │                                                                         │ │
│  │   const client = createGitHubClient(config);                           │ │
│  │                                                                         │ │
│  │   // Fetch issues from multiple repos concurrently                     │ │
│  │   const repos = ['repo1', 'repo2', 'repo3'];                           │ │
│  │   const results = await Promise.all(                                   │ │
│  │       repos.map(repo =>                                                │ │
│  │           client.issues.list('owner', repo)                            │ │
│  │       )                                                                │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // Or with controlled concurrency to respect rate limits             │ │
│  │   const pLimit = (await import('p-limit')).default;                    │ │
│  │   const limit = pLimit(10); // Max 10 concurrent                       │ │
│  │   const results = await Promise.all(                                   │ │
│  │       repos.map(repo =>                                                │ │
│  │           limit(() => client.issues.list('owner', repo))               │ │
│  │       )                                                                │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Synchronization Primitives

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SYNCHRONIZATION PRIMITIVES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rate Limit Tracker: RwLock<RateLimitState>                             │ │
│  │                                                                         │ │
│  │   Read (shared access):                                                │ │
│  │   • Check remaining requests                                           │ │
│  │   • Calculate wait time                                                │ │
│  │   • Multiple readers allowed                                           │ │
│  │                                                                         │ │
│  │   Write (exclusive access):                                            │ │
│  │   • Update from response headers                                       │ │
│  │   • Decrement remaining                                                │ │
│  │   • Reset on new window                                                │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Circuit Breaker State: RwLock<CircuitState>                            │ │
│  │                                                                         │ │
│  │   Read (shared access):                                                │ │
│  │   • Check if circuit is open                                           │ │
│  │   • Multiple readers allowed                                           │ │
│  │                                                                         │ │
│  │   Write (exclusive access):                                            │ │
│  │   • Transition state                                                   │ │
│  │   • Update failure counters                                            │ │
│  │   • Single writer, blocks readers                                      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ JWT Cache: RwLock<CachedJwt>                                           │ │
│  │                                                                         │ │
│  │   Read (shared access):                                                │ │
│  │   • Get current JWT if valid                                           │ │
│  │   • Check expiry                                                       │ │
│  │                                                                         │ │
│  │   Write (exclusive access):                                            │ │
│  │   • Generate new JWT                                                   │ │
│  │   • Update cache                                                       │ │
│  │   • Use double-checked locking pattern                                 │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Metrics Counters: AtomicU64                                            │ │
│  │                                                                         │ │
│  │   Lock-free operations:                                                │ │
│  │   • fetch_add for incrementing counters                                │ │
│  │   • load for reading values                                            │ │
│  │   • compare_exchange for conditional updates                           │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Error Propagation

### 13.1 Error Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ERROR FLOW ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      ERROR ORIGINATION POINTS                        │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │   │  Validation  │  │   Network    │  │    API       │               │    │
│  │   │   Errors     │  │   Errors     │  │   Errors     │               │    │
│  │   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │    │
│  │          │                 │                 │                       │    │
│  │          └─────────────────┼─────────────────┘                       │    │
│  │                            │                                         │    │
│  │                            ▼                                         │    │
│  │   ┌─────────────────────────────────────────────────────────────┐    │    │
│  │   │              GitHubError (unified error type)               │    │    │
│  │   │                                                             │    │    │
│  │   │   enum GitHubError {                                        │    │    │
│  │   │       // Client-side errors                                 │    │    │
│  │   │       ConfigurationError { message, field },                │    │    │
│  │   │       ValidationError { message, field, value },            │    │    │
│  │   │       SerializationError { message, source },               │    │    │
│  │   │                                                             │    │    │
│  │   │       // Network errors                                     │    │    │
│  │   │       ConnectionError { message, source },                  │    │    │
│  │   │       TimeoutError { message, duration },                   │    │    │
│  │   │       TlsError { message, source },                         │    │    │
│  │   │                                                             │    │    │
│  │   │       // API errors (from HTTP response)                    │    │    │
│  │   │       BadRequestError { message, errors },                  │    │    │
│  │   │       AuthenticationError { message },                      │    │    │
│  │   │       ForbiddenError { message },                           │    │    │
│  │   │       NotFoundError { message, resource },                  │    │    │
│  │   │       ValidationFailedError { message, errors },            │    │    │
│  │   │       RateLimitError { message, reset_at, category },       │    │    │
│  │   │       AbuseDetectedError { message, retry_after },          │    │    │
│  │   │       ServerError { message, status },                      │    │    │
│  │   │                                                             │    │    │
│  │   │       // Resilience errors                                  │    │    │
│  │   │       CircuitBreakerOpen { message, open_until },           │    │    │
│  │   │       RetryExhausted { message, attempts, last_error },     │    │    │
│  │   │   }                                                         │    │    │
│  │   │                                                             │    │    │
│  │   └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 GitHub Error Response Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GITHUB ERROR RESPONSE MAPPING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHub API Error Response Format:                                          │
│                                                                             │
│  {                                                                          │
│      "message": "Validation Failed",                                        │
│      "errors": [                                                            │
│          {                                                                  │
│              "resource": "Issue",                                           │
│              "field": "title",                                              │
│              "code": "missing_field"                                        │
│          }                                                                  │
│      ],                                                                     │
│      "documentation_url": "https://docs.github.com/..."                     │
│  }                                                                          │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Status Code Mapping                                                    │ │
│  │                                                                         │ │
│  │   ┌─────────────┬────────────────────────────────────────────────────┐ │ │
│  │   │ Status      │ Error Type                                         │ │ │
│  │   ├─────────────┼────────────────────────────────────────────────────┤ │ │
│  │   │ 400         │ BadRequestError                                    │ │ │
│  │   │ 401         │ AuthenticationError                                │ │ │
│  │   │ 403         │ ForbiddenError or RateLimitError (check header)    │ │ │
│  │   │ 404         │ NotFoundError                                      │ │ │
│  │   │ 422         │ ValidationFailedError (with field errors)          │ │ │
│  │   │ 429         │ RateLimitError (secondary rate limit)              │ │ │
│  │   │ 500         │ ServerError                                        │ │ │
│  │   │ 502         │ ServerError (bad gateway)                          │ │ │
│  │   │ 503         │ ServerError (service unavailable)                  │ │ │
│  │   └─────────────┴────────────────────────────────────────────────────┘ │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ 403 Disambiguation                                                     │ │
│  │                                                                         │ │
│  │   fn classify_403(headers: &Headers, body: &ErrorBody) -> GitHubError { │ │
│  │       // Check if it's a rate limit                                    │ │
│  │       if let Some(remaining) = headers.get("X-RateLimit-Remaining") {  │ │
│  │           if remaining == "0" {                                        │ │
│  │               return GitHubError::RateLimitError { ... };              │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       // Check for abuse detection                                     │ │
│  │       if body.message.contains("abuse") {                              │ │
│  │           return GitHubError::AbuseDetectedError {                     │ │
│  │               retry_after: headers.get("Retry-After"),                 │ │
│  │           };                                                           │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       // Otherwise it's a permission error                             │ │
│  │       GitHubError::ForbiddenError { ... }                              │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Retryability Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RETRYABILITY CLASSIFICATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Error Classification for Retry Decisions                               │ │
│  │                                                                         │ │
│  │   trait Retryable {                                                    │ │
│  │       fn is_retryable(&self) -> bool;                                  │ │
│  │       fn retry_after(&self) -> Option<Duration>;                       │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   ┌─────────────────────┬────────────┬─────────────────────────────┐   │ │
│  │   │ Error Type          │ Retryable? │ Notes                       │   │ │
│  │   ├─────────────────────┼────────────┼─────────────────────────────┤   │ │
│  │   │ ConnectionError     │ Yes        │ Transient network issue     │   │ │
│  │   │ TimeoutError        │ Yes        │ May succeed on retry        │   │ │
│  │   │ RateLimitError      │ Yes        │ Wait for reset_at           │   │ │
│  │   │ AbuseDetectedError  │ Yes        │ Use Retry-After header      │   │ │
│  │   │ ServerError (5xx)   │ Yes        │ Transient server issue      │   │ │
│  │   │ BadRequestError     │ No         │ Client error, fix required  │   │ │
│  │   │ AuthenticationError │ No         │ Credentials won't change    │   │ │
│  │   │ ForbiddenError      │ No         │ Permission won't change     │   │ │
│  │   │ NotFoundError       │ No         │ Resource doesn't exist      │   │ │
│  │   │ ValidationError     │ No         │ Client-side, fix required   │   │ │
│  │   └─────────────────────┴────────────┴─────────────────────────────┘   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Implementation                                                         │ │
│  │                                                                         │ │
│  │   impl Retryable for GitHubError {                                     │ │
│  │       fn is_retryable(&self) -> bool {                                 │ │
│  │           matches!(                                                    │ │
│  │               self,                                                    │ │
│  │               Self::ConnectionError { .. }                             │ │
│  │               | Self::TimeoutError { .. }                              │ │
│  │               | Self::RateLimitError { .. }                            │ │
│  │               | Self::AbuseDetectedError { .. }                        │ │
│  │               | Self::ServerError { status, .. } if *status >= 500     │ │
│  │           )                                                            │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       fn retry_after(&self) -> Option<Duration> {                      │ │
│  │           match self {                                                 │ │
│  │               Self::RateLimitError { reset_at, .. } => {               │ │
│  │                   Some(reset_at.saturating_duration_since(Instant::now()))│ │
│  │               }                                                        │ │
│  │               Self::AbuseDetectedError { retry_after, .. } => {        │ │
│  │                   *retry_after                                         │ │
│  │               }                                                        │ │
│  │               _ => None,                                               │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Rate Limit Management

### 14.1 GitHub Rate Limit Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GITHUB RATE LIMIT CATEGORIES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHub has multiple rate limit categories:                                 │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ PRIMARY (Core) Rate Limit                                              │ │
│  │                                                                         │ │
│  │   Applies to: Most REST API endpoints                                  │ │
│  │   Authenticated: 5,000 requests per hour                               │ │
│  │   Unauthenticated: 60 requests per hour                                │ │
│  │   GitHub Enterprise: 15,000 requests per hour                          │ │
│  │                                                                         │ │
│  │   Headers:                                                             │ │
│  │   X-RateLimit-Limit: 5000                                              │ │
│  │   X-RateLimit-Remaining: 4999                                          │ │
│  │   X-RateLimit-Reset: 1702123456                                        │ │
│  │   X-RateLimit-Used: 1                                                  │ │
│  │   X-RateLimit-Resource: core                                           │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ SECONDARY (Search) Rate Limit                                          │ │
│  │                                                                         │ │
│  │   Applies to: /search/* endpoints                                      │ │
│  │   Authenticated: 30 requests per minute                                │ │
│  │   Unauthenticated: 10 requests per minute                              │ │
│  │                                                                         │ │
│  │   Headers:                                                             │ │
│  │   X-RateLimit-Limit: 30                                                │ │
│  │   X-RateLimit-Remaining: 29                                            │ │
│  │   X-RateLimit-Reset: 1702123456                                        │ │
│  │   X-RateLimit-Resource: search                                         │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ GRAPHQL Rate Limit                                                     │ │
│  │                                                                         │ │
│  │   Applies to: GraphQL API                                              │ │
│  │   Points-based: 5,000 points per hour                                  │ │
│  │   Query cost: Variable based on complexity                             │ │
│  │                                                                         │ │
│  │   Headers:                                                             │ │
│  │   X-RateLimit-Limit: 5000                                              │ │
│  │   X-RateLimit-Remaining: 4950                                          │ │
│  │   X-RateLimit-Reset: 1702123456                                        │ │
│  │   X-RateLimit-Resource: graphql                                        │ │
│  │                                                                         │ │
│  │   Query response includes:                                             │ │
│  │   rateLimit { cost, remaining, resetAt }                               │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ CODE SEARCH Rate Limit                                                 │ │
│  │                                                                         │ │
│  │   Applies to: /search/code endpoint                                    │ │
│  │   Authenticated: 10 requests per minute                                │ │
│  │                                                                         │ │
│  │   Headers:                                                             │ │
│  │   X-RateLimit-Resource: code_search                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Rate Limit Tracker Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RATE LIMIT TRACKER ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ RateLimitTracker Structure                                             │ │
│  │                                                                         │ │
│  │   pub struct RateLimitTracker {                                        │ │
│  │       // Per-category state                                            │ │
│  │       core: Arc<RwLock<RateLimitState>>,                               │ │
│  │       search: Arc<RwLock<RateLimitState>>,                             │ │
│  │       graphql: Arc<RwLock<RateLimitState>>,                            │ │
│  │       code_search: Arc<RwLock<RateLimitState>>,                        │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   pub struct RateLimitState {                                          │ │
│  │       limit: u32,                                                      │ │
│  │       remaining: u32,                                                  │ │
│  │       reset_at: Instant,                                               │ │
│  │       last_updated: Instant,                                           │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rate Limit Check Flow                                                  │ │
│  │                                                                         │ │
│  │   1. Before request:                                                   │ │
│  │      ┌────────────────────────────────────────────────────────────┐    │ │
│  │      │ fn check_rate_limit(&self, category: Category) -> Result { │    │ │
│  │      │     let state = self.get_state(category).read();           │    │ │
│  │      │                                                            │    │ │
│  │      │     if state.remaining == 0 {                              │    │ │
│  │      │         let wait = state.reset_at - Instant::now();        │    │ │
│  │      │         if wait > Duration::ZERO {                         │    │ │
│  │      │             return Err(RateLimitError { wait });           │    │ │
│  │      │         }                                                  │    │ │
│  │      │         // Reset window has passed, allow request          │    │ │
│  │      │     }                                                      │    │ │
│  │      │     Ok(())                                                 │    │ │
│  │      │ }                                                          │    │ │
│  │      └────────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  │   2. After response:                                                   │ │
│  │      ┌────────────────────────────────────────────────────────────┐    │ │
│  │      │ fn update_from_headers(&self, headers: &Headers) {         │    │ │
│  │      │     let category = headers.get("X-RateLimit-Resource");    │    │ │
│  │      │     let mut state = self.get_state(category).write();      │    │ │
│  │      │                                                            │    │ │
│  │      │     state.limit = parse(headers, "X-RateLimit-Limit");     │    │ │
│  │      │     state.remaining = parse(headers, "X-RateLimit-Remaining");│  │ │
│  │      │     state.reset_at = parse_timestamp(headers, "X-RateLimit-Reset");│ │
│  │      │     state.last_updated = Instant::now();                   │    │ │
│  │      │ }                                                          │    │ │
│  │      └────────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Rate Limit Handling Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   RATE LIMIT HANDLING STRATEGIES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Strategy 1: Fail Fast (Default)                                        │ │
│  │                                                                         │ │
│  │   If rate limit exhausted:                                             │ │
│  │   → Return RateLimitError immediately                                  │ │
│  │   → Include reset_at for caller to handle                              │ │
│  │                                                                         │ │
│  │   config.rate_limit_strategy = RateLimitStrategy::FailFast;            │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Strategy 2: Wait and Retry                                             │ │
│  │                                                                         │ │
│  │   If rate limit exhausted:                                             │ │
│  │   → Wait until reset_at                                                │ │
│  │   → Retry request                                                      │ │
│  │   → With max wait timeout                                              │ │
│  │                                                                         │ │
│  │   config.rate_limit_strategy = RateLimitStrategy::WaitAndRetry {       │ │
│  │       max_wait: Duration::from_secs(60),                               │ │
│  │   };                                                                   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Strategy 3: Proactive Throttling                                       │ │
│  │                                                                         │ │
│  │   Spread requests evenly across the time window:                       │ │
│  │   → Calculate delay between requests                                   │ │
│  │   → delay = window_duration / limit                                    │ │
│  │   → e.g., 3600s / 5000 = 0.72s per request                            │ │
│  │                                                                         │ │
│  │   config.rate_limit_strategy = RateLimitStrategy::Throttle {           │ │
│  │       utilization_target: 0.9, // Use 90% of limit                     │ │
│  │   };                                                                   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Strategy 4: Custom Hook                                                │ │
│  │                                                                         │ │
│  │   Let caller decide:                                                   │ │
│  │   → Callback when rate limit hit                                       │ │
│  │   → Return Wait(duration), Retry, or Fail                              │ │
│  │                                                                         │ │
│  │   config.rate_limit_hook = Some(|info: &RateLimitInfo| {               │ │
│  │       if info.category == Category::Search {                           │ │
│  │           RateLimitAction::Wait(info.wait_duration())                  │ │
│  │       } else {                                                         │ │
│  │           RateLimitAction::Fail                                        │ │
│  │       }                                                                │ │
│  │   });                                                                  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Part 1: System Overview](./architecture-github-1.md) | Part 2: Data Flow & Concurrency | [Part 3: Integration & Observability](./architecture-github-3.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial data flow and concurrency architecture |

---

**Continued in Part 3: Integration, Observability, and Deployment**

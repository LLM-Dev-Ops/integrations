# Specification: Azure Active Directory OAuth2 Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/azure-active-directory`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Objectives](#2-scope-and-objectives)
3. [Azure AD OAuth2 Overview](#3-azure-ad-oauth2-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [System Constraints](#6-system-constraints)
7. [Interface Specifications](#7-interface-specifications)
8. [Data Models](#8-data-models)
9. [Error Handling](#9-error-handling)
10. [Enterprise Workflow Scenarios](#10-enterprise-workflow-scenarios)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Executive Summary

### 1.1 Purpose

This specification defines the Azure Active Directory (Azure AD / Microsoft Entra ID) OAuth2 integration module for the LLM Dev Ops platform. It provides a thin adapter layer enabling authentication and authorization of users and services via OAuth2/OIDC flows for enterprise-scale identity workflows.

### 1.2 Key Differentiators

| Feature | Description |
|---------|-------------|
| Multiple OAuth2 Flows | Client credentials, auth code, device code, managed identity |
| Token Lifecycle | Automatic refresh, caching, revocation handling |
| Service Principals | Machine-to-machine authentication |
| Managed Identity | Azure workload authentication (no secrets) |
| Least Privilege | Scope-based access control |
| Simulation/Replay | Record and replay auth flows for testing |

### 1.3 Design Philosophy

This integration is explicitly a **thin adapter layer**:
- No tenant configuration or app registration
- No identity governance or conditional access policies
- No duplication of core orchestration logic
- Leverages existing shared logging and metrics
- Focuses on token acquisition and validation only

---

## 2. Scope and Objectives

### 2.1 In Scope

| Category | Items |
|----------|-------|
| Token Acquisition | Client credentials, auth code, device code, ROPC, managed identity |
| Token Management | Caching, refresh, revocation detection |
| Token Validation | JWT validation, claims extraction, audience/issuer verification |
| Service Principal | App-only authentication flows |
| Managed Identity | System/user-assigned identity support |
| Simulation | Record/replay authentication flows |

### 2.2 Out of Scope

| Category | Reason |
|----------|--------|
| App Registration | Azure Portal / IaC concern |
| Tenant Configuration | Admin operation |
| Conditional Access | Policy management |
| Identity Governance | Admin concern |
| User Provisioning | SCIM/HR integration |
| MFA Configuration | Security admin concern |
| Group Management | Directory admin concern |

### 2.3 Objectives

| ID | Objective | Success Metric |
|----|-----------|----------------|
| OBJ-001 | OAuth2 flow coverage | All supported flows working |
| OBJ-002 | Token caching | <5ms cache hit latency |
| OBJ-003 | Automatic refresh | Zero expired token errors |
| OBJ-004 | Managed identity | Seamless Azure workload auth |
| OBJ-005 | Simulation mode | CI/CD without Azure AD |
| OBJ-006 | Test coverage | >80% line coverage |

---

## 3. Azure AD OAuth2 Overview

### 3.1 OAuth2 Flows Supported

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure AD OAuth2 Flows                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Client Credentials (Service-to-Service)                        │
│  App ──► Azure AD ──► Access Token                              │
│                                                                  │
│  Authorization Code (User Interactive)                          │
│  User ──► Login ──► Auth Code ──► Token                         │
│                                                                  │
│  Device Code (Headless/CLI)                                     │
│  App ──► Device Code ──► User Login ──► Token                   │
│                                                                  │
│  Managed Identity (Azure Workloads)                             │
│  App ──► IMDS ──► Access Token (no secrets)                     │
│                                                                  │
│  On-Behalf-Of (Token Exchange)                                  │
│  Service ──► User Token ──► New Token for downstream            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Endpoints

| Endpoint | URL Pattern |
|----------|-------------|
| Authorization | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` |
| Token | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` |
| JWKS | `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys` |
| OIDC Config | `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration` |
| IMDS | `http://169.254.169.254/metadata/identity/oauth2/token` |

### 3.3 Token Types

| Type | Use Case | Lifetime |
|------|----------|----------|
| Access Token | API authorization | 1 hour (default) |
| Refresh Token | Token renewal | 24h - 90 days |
| ID Token | User identity claims | 1 hour |

---

## 4. Functional Requirements

### 4.1 Client Credentials Flow

#### FR-CC-001: Acquire Token with Client Secret

| Field | Details |
|-------|---------|
| Input | Tenant ID, Client ID, Client Secret, Scopes |
| Output | Access token, expiry, token type |
| Criteria | Token cached, auto-refresh before expiry |

#### FR-CC-002: Acquire Token with Certificate

| Field | Details |
|-------|---------|
| Input | Tenant ID, Client ID, Certificate (PEM/PFX), Scopes |
| Output | Access token with certificate assertion |
| Criteria | JWT assertion signed with certificate |

### 4.2 Authorization Code Flow

#### FR-AC-001: Generate Authorization URL

| Field | Details |
|-------|---------|
| Input | Tenant ID, Client ID, Redirect URI, Scopes, State, PKCE |
| Output | Authorization URL |
| Criteria | PKCE required, state for CSRF protection |

#### FR-AC-002: Exchange Code for Token

| Field | Details |
|-------|---------|
| Input | Authorization code, Redirect URI, PKCE verifier |
| Output | Access token, refresh token, ID token |
| Criteria | PKCE validation, token cached |

### 4.3 Device Code Flow

#### FR-DC-001: Initiate Device Code Flow

| Field | Details |
|-------|---------|
| Input | Tenant ID, Client ID, Scopes |
| Output | Device code, user code, verification URI, interval |
| Criteria | Display user instructions |

#### FR-DC-002: Poll for Token

| Field | Details |
|-------|---------|
| Input | Device code, polling interval |
| Output | Access token (on user completion) |
| Criteria | Handle pending/declined states |

### 4.4 Managed Identity

#### FR-MI-001: System-Assigned Identity

| Field | Details |
|-------|---------|
| Input | Resource scope (e.g., `https://storage.azure.com/`) |
| Output | Access token from IMDS |
| Criteria | No credentials required, auto-refresh |

#### FR-MI-002: User-Assigned Identity

| Field | Details |
|-------|---------|
| Input | Client ID of user-assigned identity, Resource scope |
| Output | Access token from IMDS |
| Criteria | Specify identity by client_id |

### 4.5 Token Management

#### FR-TM-001: Token Caching

| Field | Details |
|-------|---------|
| Input | Token, cache key (tenant+client+scopes) |
| Output | Cached token retrieval |
| Criteria | Thread-safe, memory-bounded, TTL-based eviction |

#### FR-TM-002: Automatic Refresh

| Field | Details |
|-------|---------|
| Input | Refresh token or credentials |
| Output | New access token |
| Criteria | Refresh 5 minutes before expiry, retry on failure |

#### FR-TM-003: Token Validation

| Field | Details |
|-------|---------|
| Input | JWT access token or ID token |
| Output | Validated claims |
| Criteria | Signature, expiry, audience, issuer verification |

### 4.6 Simulation Layer

#### FR-SIM-001: Recording Mode

| Field | Details |
|-------|---------|
| Input | Enable recording, storage path |
| Output | Recorded auth interactions |
| Criteria | Capture requests, mock tokens, timing |

#### FR-SIM-002: Replay Mode

| Field | Details |
|-------|---------|
| Input | Recording file path |
| Output | Simulated tokens |
| Criteria | Deterministic, no Azure AD calls |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Requirement | Target |
|-------------|--------|
| Token cache hit | <5ms |
| Token acquisition (cached credentials) | <200ms |
| JWKS fetch | <500ms (cached 24h) |
| Managed identity token | <100ms |

### 5.2 Reliability

| Requirement | Target |
|-------------|--------|
| Retry transient failures | 3 retries, exponential backoff |
| Token refresh | 5 min before expiry |
| JWKS cache | 24h with background refresh |
| Connection recovery | Automatic |

### 5.3 Security

| Requirement | Implementation |
|-------------|----------------|
| TLS | Required (HTTPS only) |
| Secret handling | Never logged, zeroized on drop |
| Token storage | In-memory only (no disk) |
| PKCE | Required for auth code flow |
| State parameter | Required for CSRF protection |

### 5.4 Observability

| Requirement | Integration |
|-------------|-------------|
| Structured logging | Shared logging primitive |
| Metrics | Token acquisitions, cache hits, errors |
| Tracing | Correlation ID propagation |

---

## 6. System Constraints

### 6.1 Thin Adapter Constraints

| Constraint | Description |
|------------|-------------|
| CON-THIN-001 | No app registration |
| CON-THIN-002 | No tenant configuration |
| CON-THIN-003 | No conditional access policies |
| CON-THIN-004 | No user/group management |
| CON-THIN-005 | No identity governance |

### 6.2 Dependency Constraints

| Constraint | Description |
|------------|-------------|
| CON-DEP-001 | No cross-module dependencies |
| CON-DEP-002 | Shared primitives only |
| CON-DEP-003 | Standard JWT/crypto libraries |

### 6.3 Azure AD Limits

| Limit | Value |
|-------|-------|
| Token size | ~2-4 KB typical |
| Scopes per request | 20 max |
| Token lifetime | Configurable (1h default) |
| Refresh token lifetime | Up to 90 days |

---

## 7. Interface Specifications

### 7.1 Client Interface

```
AzureAdClient
├── new(config: AzureAdConfig) -> Result<Self>
├── acquire_token_client_credentials(scopes: &[&str]) -> Result<AccessToken>
├── acquire_token_client_certificate(scopes: &[&str]) -> Result<AccessToken>
├── get_authorization_url(params: AuthCodeParams) -> Result<AuthorizationUrl>
├── acquire_token_by_auth_code(code: &str, verifier: &str) -> Result<TokenResponse>
├── initiate_device_code(scopes: &[&str]) -> Result<DeviceCodeResponse>
├── acquire_token_by_device_code(device_code: &str) -> Result<AccessToken>
├── acquire_token_managed_identity(resource: &str) -> Result<AccessToken>
├── acquire_token_on_behalf_of(user_token: &str, scopes: &[&str]) -> Result<AccessToken>
├── validate_token(token: &str) -> Result<TokenClaims>
├── refresh_token(refresh_token: &str) -> Result<TokenResponse>
├── clear_cache() -> ()
└── with_simulation(mode: SimulationMode) -> Self
```

### 7.2 Configuration Interface

```
AzureAdConfig
├── tenant_id: String
├── client_id: String
├── credential: CredentialType
│   ├── ClientSecret(String)
│   ├── Certificate { cert: Vec<u8>, password: Option<String> }
│   ├── ManagedIdentity { client_id: Option<String> }
│   └── None (for public clients)
├── authority: Option<String>  // Override default authority
├── redirect_uri: Option<String>
├── cache_config: CacheConfig
├── retry_config: RetryConfig
└── simulation_mode: SimulationMode
```

---

## 8. Data Models

### 8.1 Core Types

```
AccessToken {
    token: String,
    token_type: String,        // "Bearer"
    expires_on: DateTime,
    scopes: Vec<String>,
    tenant_id: String,
}

TokenResponse {
    access_token: AccessToken,
    refresh_token: Option<String>,
    id_token: Option<String>,
    expires_in: u64,
}

TokenClaims {
    sub: String,               // Subject
    aud: String,               // Audience
    iss: String,               // Issuer
    exp: u64,                  // Expiry timestamp
    iat: u64,                  // Issued at
    nbf: Option<u64>,          // Not before
    oid: Option<String>,       // Object ID
    tid: Option<String>,       // Tenant ID
    app_id: Option<String>,    // Application ID
    roles: Vec<String>,        // App roles
    scp: Option<String>,       // Delegated scopes
    custom: HashMap<String, Value>, // Additional claims
}

DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
    message: String,
}

AuthCodeParams {
    redirect_uri: String,
    scopes: Vec<String>,
    state: Option<String>,
    code_challenge: Option<String>,  // PKCE
    code_challenge_method: Option<String>,
    prompt: Option<String>,
    login_hint: Option<String>,
}
```

### 8.2 Simulation Types

```
SimulationMode: Disabled | Recording { path: PathBuf } | Replay { path: PathBuf }

RecordedAuthInteraction {
    timestamp: DateTime,
    flow_type: String,
    request: SerializedRequest,
    response: SerializedResponse,
    mock_token: MockToken,
}

MockToken {
    access_token: String,
    claims: TokenClaims,
    expires_in: u64,
}
```

---

## 9. Error Handling

### 9.1 Error Types

| Error | Retryable | Description |
|-------|-----------|-------------|
| InvalidCredentials | No | Wrong client secret/cert |
| InvalidGrant | No | Auth code expired/invalid |
| InvalidScope | No | Requested scope not granted |
| TenantNotFound | No | Tenant ID invalid |
| UserCancelled | No | Device code flow cancelled |
| ExpiredToken | No | Token has expired |
| InvalidToken | No | Token validation failed |
| AuthorizationPending | Yes | Device code not yet approved |
| SlowDown | Yes | Polling too fast |
| ServerError | Yes | Azure AD server error |
| NetworkError | Yes | Connection failure |
| ManagedIdentityUnavailable | No | Not running in Azure |

### 9.2 Error Structure

```
AzureAdError {
    kind: ErrorKind,
    message: String,
    error_code: Option<String>,      // Azure AD error code
    correlation_id: Option<String>,  // For support
    timestamp: DateTime,
    is_retryable: bool,
}
```

---

## 10. Enterprise Workflow Scenarios

### 10.1 Service-to-Service Authentication

```
Scenario: Backend service accessing Azure resources
1. Configure client credentials (secret or certificate)
2. Acquire token for target resource scope
3. Token cached and auto-refreshed
4. Use token in Authorization header
5. Handle 401 with token refresh
```

### 10.2 User Authentication (Web App)

```
Scenario: Web application user sign-in
1. Generate authorization URL with PKCE
2. Redirect user to Azure AD login
3. Receive authorization code callback
4. Exchange code for tokens
5. Validate ID token, extract user claims
6. Store refresh token for session renewal
```

### 10.3 CLI/Headless Authentication

```
Scenario: CLI tool requiring user auth
1. Initiate device code flow
2. Display user code and verification URL
3. Poll for token completion
4. Cache token for subsequent operations
5. Refresh token before expiry
```

### 10.4 Azure Workload (Managed Identity)

```
Scenario: App running in Azure (AKS, Functions, etc.)
1. Detect managed identity availability
2. Request token from IMDS endpoint
3. No credentials to manage
4. Token auto-refreshed by IMDS
5. Seamless across Azure services
```

### 10.5 CI/CD Testing (Simulation)

```
Scenario: Test auth flows without Azure AD
1. Enable recording mode in development
2. Perform auth flows against real Azure AD
3. Save recordings with mock tokens
4. Enable replay mode in CI
5. Tests run without Azure AD dependency
```

---

## 11. Acceptance Criteria

### 11.1 Functional Acceptance

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-001 | Client credentials with secret | Integration test |
| AC-002 | Client credentials with certificate | Integration test |
| AC-003 | Authorization code with PKCE | Integration test |
| AC-004 | Device code flow | Integration test |
| AC-005 | Managed identity (system) | Azure VM test |
| AC-006 | Managed identity (user-assigned) | Azure VM test |
| AC-007 | Token validation | Unit test |
| AC-008 | Token caching | Unit test |
| AC-009 | Automatic refresh | Integration test |
| AC-010 | Simulation recording | Unit test |
| AC-011 | Simulation replay | Unit test |

### 11.2 Performance Acceptance

| ID | Criteria | Target |
|----|----------|--------|
| AC-PERF-001 | Cache hit latency | <5ms |
| AC-PERF-002 | Token acquisition | <200ms |
| AC-PERF-003 | Managed identity | <100ms |

### 11.3 Security Acceptance

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-SEC-001 | Secrets not logged | Log audit |
| AC-SEC-002 | PKCE enforced | Code review |
| AC-SEC-003 | TLS required | Config validation |
| AC-SEC-004 | Token signature verified | Unit test |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AZURE-AD-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*SPARC Phase 1 Complete - Proceed to Pseudocode phase with "Next phase."*

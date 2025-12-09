# OAuth2 Authentication Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/oauth2`
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Module Purpose](#2-module-purpose)
3. [Responsibilities](#3-responsibilities)
4. [Boundaries](#4-boundaries)
5. [OAuth2 Protocol Coverage](#5-oauth2-protocol-coverage)
   - 5.1 [Authorization Code Flow](#51-authorization-code-flow)
   - 5.2 [Authorization Code with PKCE](#52-authorization-code-with-pkce)
   - 5.3 [Client Credentials Flow](#53-client-credentials-flow)
   - 5.4 [Device Authorization Flow](#54-device-authorization-flow)
   - 5.5 [Refresh Token Flow](#55-refresh-token-flow)
   - 5.6 [Token Introspection](#56-token-introspection)
   - 5.7 [Token Revocation](#57-token-revocation)
6. [Interface Surface](#6-interface-surface)
   - 6.1 [Rust Interface](#61-rust-interface)
   - 6.2 [TypeScript Interface](#62-typescript-interface)
7. [Token Management](#7-token-management)
8. [Dependency Policy](#8-dependency-policy)
9. [Error Taxonomy](#9-error-taxonomy)
10. [Phase-3-Ready Hooks](#10-phase-3-ready-hooks)
    - 10.1 [Retry Policy](#101-retry-policy)
    - 10.2 [Rate Limiting](#102-rate-limiting)
    - 10.3 [Circuit Breaker](#103-circuit-breaker)
11. [Security Handling](#11-security-handling)
12. [Telemetry Requirements](#12-telemetry-requirements)
13. [Future-Proofing Rules](#13-future-proofing-rules)
14. [London-School TDD Principles](#14-london-school-tdd-principles)
15. [Acceptance Criteria](#15-acceptance-criteria)
16. [Glossary](#16-glossary)

---

## 1. Executive Summary

The OAuth2 Authentication Integration Module provides a comprehensive, production-ready implementation of the OAuth 2.0 and OAuth 2.1 protocols within the LLM-Dev-Ops Integration Repository. This module serves as the foundational authentication layer for all integrations requiring OAuth2-based authentication with external services.

The module is designed as a standalone component that depends exclusively on shared Integration Repo primitives (errors, retry, circuit-breaker, rate-limits, tracing, logging, types, and config) and does **not** implement or depend on ruvbase (Layer 0).

The module exposes dual interfaces in **Rust** and **TypeScript**, providing:

- Complete OAuth2 authorization flow implementations (Authorization Code, PKCE, Client Credentials, Device Flow)
- Secure token storage and lifecycle management
- Automatic token refresh with configurable strategies
- Token introspection and revocation support
- OpenID Connect (OIDC) discovery and JWT validation
- Provider-agnostic design with built-in support for common providers

### Key Design Principles

1. **Protocol Compliance**: Full RFC 6749, RFC 7636 (PKCE), RFC 8628 (Device Flow), RFC 7662 (Introspection), RFC 7009 (Revocation) compliance
2. **Security First**: Secure token handling, PKCE by default, state validation, CSRF protection
3. **Provider Agnostic**: Works with any OAuth2-compliant authorization server
4. **Token Lifecycle**: Automatic refresh, expiration tracking, secure storage hooks
5. **Interface Segregation**: Separate interfaces for each OAuth2 flow
6. **Fail-Fast with Recovery**: Graceful degradation with circuit breakers

---

## 2. Module Purpose

### Primary Purpose

Provide a production-ready, secure OAuth2 client library that:

- Implements all standard OAuth2 authorization grant types
- Abstracts protocol complexity behind strongly-typed interfaces
- Handles token lifecycle (acquisition, storage, refresh, revocation)
- Provides secure credential and token management
- Supports both synchronous and asynchronous execution models
- Enables comprehensive observability through structured logging and tracing

### Secondary Purpose

- Serve as the authentication foundation for other integrations (GitHub, Google, Azure, etc.)
- Provide extension points for custom providers and flows
- Enable offline testing through mockable interfaces
- Support multi-tenant deployments with credential isolation
- Integrate with OpenID Connect for identity verification

### Non-Goals

This module does **NOT** provide:
- OAuth2 server/authorization server implementation (client-only)
- User session management (application-layer concern)
- Identity provider (IdP) functionality
- Custom authentication protocols
- Direct integration with specific providers (those are separate modules)
- Password/credential storage for resource owner password flow (deprecated)

---

## 3. Responsibilities

### 3.1 Core Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Authorization URL Generation** | Build authorization URLs with proper parameters, state, PKCE |
| **Token Exchange** | Exchange authorization codes for access/refresh tokens |
| **Token Refresh** | Automatically refresh expired tokens using refresh tokens |
| **Token Storage Abstraction** | Secure storage interface for tokens with multiple backends |
| **Token Validation** | Validate token format, expiration, and optionally JWT signature |
| **State Management** | Generate, store, and validate OAuth2 state parameters |
| **PKCE Management** | Generate and manage PKCE code verifier/challenge pairs |
| **Provider Discovery** | OpenID Connect discovery for provider metadata |
| **HTTP Transport** | Secure HTTP communication for token endpoints |

### 3.2 Delegated Responsibilities

| Responsibility | Delegated To |
|----------------|--------------|
| **Retry Logic** | `@integrations/retry` primitive |
| **Rate Limiting** | `@integrations/rate-limits` primitive |
| **Circuit Breaking** | `@integrations/circuit-breaker` primitive |
| **Structured Logging** | `@integrations/logging` primitive |
| **Distributed Tracing** | `@integrations/tracing` primitive |
| **Configuration** | `@integrations/config` primitive |
| **Error Base Types** | `@integrations/errors` primitive |
| **Common Types** | `@integrations/types` primitive |

### 3.3 Explicitly Excluded

- **NOT** responsible for: user sessions, identity management, custom auth protocols, OAuth2 server implementation, resource owner password grant (deprecated), implicit grant (deprecated)

---

## 4. Boundaries

### 4.1 Module Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Application Layer (Consumer)                      │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OAuth2 Integration Module                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Public Interface                           │   │
│  │  • OAuth2Client                                               │   │
│  │  • AuthorizationCodeFlow                                      │   │
│  │  • ClientCredentialsFlow                                      │   │
│  │  • DeviceAuthorizationFlow                                    │   │
│  │  • TokenManager                                               │   │
│  │  • TokenStorage (trait)                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                  │                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                 Internal Implementation                       │   │
│  │  • HttpTransport                                              │   │
│  │  • StateGenerator                                             │   │
│  │  • PKCEGenerator                                              │   │
│  │  • TokenParser                                                │   │
│  │  • JwtValidator                                               │   │
│  │  • DiscoveryClient                                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Integration Repo Primitives                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐ ┌──────────────────┐   │
│  │ errors  │ │  retry  │ │ circuit-breaker │ │   rate-limits    │   │
│  └─────────┘ └─────────┘ └─────────────────┘ └──────────────────┘   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐                   │
│  │ tracing │ │ logging │ │  types  │ │  config  │                   │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Authorization Server                              │
│                (Provider's OAuth2/OIDC Endpoint)                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dependency Rules

| Rule | Description |
|------|-------------|
| **MUST depend on** | Integration Repo primitives only |
| **MUST NOT depend on** | Other integration modules (OpenAI, GitHub, etc.) |
| **MUST NOT depend on** | ruvbase (Layer 0) |
| **MUST NOT depend on** | Application-specific code |
| **MAY depend on** | Standard library (std in Rust, native TS libs) |
| **MAY depend on** | Approved third-party crates/packages (listed in §8) |

### 4.3 Inter-Module Relationship

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ openai module   │     │ github module   │     │ google module   │
│                 │     │                 │     │                 │
│  USES OAuth2    │     │  USES OAuth2    │     │  USES OAuth2    │
│  for auth       │     │  for auth       │     │  for auth       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │    OAuth2 Module       │
                    │  (This Specification)  │
                    └────────────┬───────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  Shared Primitives     │
                    │  (errors, retry, etc.) │
                    └────────────────────────┘
```

---

## 5. OAuth2 Protocol Coverage

### 5.1 Authorization Code Flow

The standard OAuth2 authorization code flow for web applications and confidential clients.

#### 5.1.1 Flow Overview

```
┌────────┐                                    ┌──────────────────┐
│  User  │                                    │ Authorization    │
│        │                                    │ Server           │
└───┬────┘                                    └────────┬─────────┘
    │                                                  │
    │  1. User initiates login                         │
    ▼                                                  │
┌────────────────┐                                     │
│ Client         │──────2. Redirect to auth URL───────▶│
│ Application    │                                     │
└───────┬────────┘                                     │
        │                                              │
        │        3. User authenticates & consents      │
        │◀──────────────────────────────────────────────│
        │        4. Redirect with authorization code   │
        │                                              │
        │──────5. Exchange code for tokens────────────▶│
        │                                              │
        │◀──────6. Return access & refresh tokens──────│
        │                                              │
        ▼                                              │
┌────────────────┐                                     │
│ Access         │                                     │
│ Protected      │                                     │
│ Resources      │                                     │
└────────────────┘
```

#### 5.1.2 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| Authorization Endpoint | GET | Initiate authorization, get auth code |
| Token Endpoint | POST | Exchange code for tokens |
| Redirect URI | GET | Receive authorization code |

#### 5.1.3 Request Parameters

**Authorization Request:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `response_type` | Yes | Must be `code` |
| `client_id` | Yes | Application client ID |
| `redirect_uri` | Conditional | Redirect URI (required if multiple registered) |
| `scope` | Optional | Space-separated list of scopes |
| `state` | Recommended | CSRF protection token |

**Token Request:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | Must be `authorization_code` |
| `code` | Yes | Authorization code from callback |
| `redirect_uri` | Conditional | Must match authorization request |
| `client_id` | Yes | Application client ID |
| `client_secret` | Conditional | For confidential clients |

### 5.2 Authorization Code with PKCE

Enhanced authorization code flow with Proof Key for Code Exchange (RFC 7636).

#### 5.2.1 PKCE Overview

PKCE prevents authorization code interception attacks by:
1. Client generates a cryptographically random `code_verifier`
2. Client derives `code_challenge` from verifier
3. Authorization request includes `code_challenge`
4. Token request includes `code_verifier`
5. Server verifies the relationship

#### 5.2.2 PKCE Parameters

| Parameter | Location | Description |
|-----------|----------|-------------|
| `code_verifier` | Token Request | Random 43-128 character string (unreserved URI chars) |
| `code_challenge` | Auth Request | Base64URL(SHA256(code_verifier)) or plain |
| `code_challenge_method` | Auth Request | `S256` (recommended) or `plain` |

#### 5.2.3 Code Challenge Methods

| Method | Algorithm | Security |
|--------|-----------|----------|
| `S256` | BASE64URL(SHA256(verifier)) | Recommended |
| `plain` | verifier as-is | Only if S256 not supported |

### 5.3 Client Credentials Flow

Server-to-server authentication without user involvement.

#### 5.3.1 Flow Overview

```
┌─────────────────┐                        ┌────────────────────┐
│ Client          │                        │ Authorization      │
│ (Backend)       │                        │ Server             │
└────────┬────────┘                        └──────────┬─────────┘
         │                                            │
         │  1. POST token request with                │
         │     client_id + client_secret              │
         │────────────────────────────────────────────▶│
         │                                            │
         │◀──────2. Return access token────────────────│
         │                                            │
         ▼
┌─────────────────┐
│ Access          │
│ Protected       │
│ Resources       │
└─────────────────┘
```

#### 5.3.2 Token Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | Must be `client_credentials` |
| `client_id` | Yes | Application client ID |
| `client_secret` | Yes | Application client secret |
| `scope` | Optional | Space-separated list of scopes |

### 5.4 Device Authorization Flow

OAuth2 for devices with limited input capabilities (RFC 8628).

#### 5.4.1 Flow Overview

```
┌─────────────┐                              ┌────────────────────┐
│ Device      │                              │ Authorization      │
│ (Limited    │                              │ Server             │
│  Input)     │                              └──────────┬─────────┘
└──────┬──────┘                                        │
       │                                               │
       │  1. Request device code                       │
       │───────────────────────────────────────────────▶│
       │                                               │
       │◀───────2. Return device_code,                 │
       │        user_code, verification_uri            │
       │                                               │
       │  3. Display user_code and                     │
       │     verification_uri to user                  │
       ▼                                               │
┌─────────────┐                                        │
│ User visits │  4. User enters code at URI            │
│ verification│────────────────────────────────────────▶│
│ URI         │                                        │
└─────────────┘  5. User authenticates & consents      │
       │                                               │
       │  6. Poll token endpoint                       │
       │───────────────────────────────────────────────▶│
       │                                               │
       │◀───────7. Return access token                 │
       │        (after user approval)                  │
       ▼
```

#### 5.4.2 Device Authorization Request

| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | Application client ID |
| `scope` | Optional | Space-separated list of scopes |

#### 5.4.3 Device Authorization Response

| Field | Description |
|-------|-------------|
| `device_code` | Device verification code (not shown to user) |
| `user_code` | Code user enters at verification URI |
| `verification_uri` | URI where user enters code |
| `verification_uri_complete` | URI with code pre-filled (optional) |
| `expires_in` | Lifetime in seconds |
| `interval` | Minimum polling interval in seconds |

#### 5.4.4 Token Polling

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | Must be `urn:ietf:params:oauth:grant-type:device_code` |
| `device_code` | Yes | Device code from authorization response |
| `client_id` | Yes | Application client ID |

#### 5.4.5 Polling Response Codes

| Response | Action |
|----------|--------|
| `authorization_pending` | Continue polling |
| `slow_down` | Increase polling interval by 5 seconds |
| `access_denied` | User denied authorization |
| `expired_token` | Device code expired |
| Success (200) | Token issued |

### 5.5 Refresh Token Flow

Obtain new access tokens using refresh tokens.

#### 5.5.1 Token Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | Must be `refresh_token` |
| `refresh_token` | Yes | Valid refresh token |
| `scope` | Optional | Subset of original scopes |
| `client_id` | Conditional | Required for public clients |
| `client_secret` | Conditional | Required for confidential clients |

#### 5.5.2 Refresh Behavior

| Scenario | Response |
|----------|----------|
| Valid refresh token | New access token (and optionally new refresh token) |
| Expired refresh token | Error: `invalid_grant` |
| Revoked refresh token | Error: `invalid_grant` |
| Scope escalation attempt | Error: `invalid_scope` |

### 5.6 Token Introspection

RFC 7662 - Inspect token metadata without parsing.

#### 5.6.1 Introspection Request

| Parameter | Required | Description |
|-----------|----------|-------------|
| `token` | Yes | Token to introspect |
| `token_type_hint` | Optional | `access_token` or `refresh_token` |

#### 5.6.2 Introspection Response

| Field | Type | Description |
|-------|------|-------------|
| `active` | boolean | Whether token is valid |
| `scope` | string | Space-separated scopes |
| `client_id` | string | Client that requested token |
| `username` | string | Resource owner identifier |
| `token_type` | string | Token type (e.g., `Bearer`) |
| `exp` | integer | Expiration timestamp |
| `iat` | integer | Issued-at timestamp |
| `nbf` | integer | Not-before timestamp |
| `sub` | string | Subject (user ID) |
| `aud` | string | Intended audience |
| `iss` | string | Token issuer |
| `jti` | string | Unique token identifier |

### 5.7 Token Revocation

RFC 7009 - Revoke access or refresh tokens.

#### 5.7.1 Revocation Request

| Parameter | Required | Description |
|-----------|----------|-------------|
| `token` | Yes | Token to revoke |
| `token_type_hint` | Optional | `access_token` or `refresh_token` |

#### 5.7.2 Revocation Response

| Response | Meaning |
|----------|---------|
| 200 OK | Token revoked (or was already invalid) |
| 400 Bad Request | Invalid request format |
| 503 Service Unavailable | Server cannot perform revocation |

---

## 6. Interface Surface

### 6.1 Rust Interface

#### 6.1.1 Configuration Types

```rust
use secrecy::SecretString;
use std::time::Duration;
use url::Url;

/// Configuration for the OAuth2 client
#[derive(Clone)]
pub struct OAuth2Config {
    /// OAuth2 provider configuration
    pub provider: ProviderConfig,

    /// Client credentials
    pub credentials: ClientCredentials,

    /// Default scopes to request
    pub default_scopes: Vec<String>,

    /// Token storage backend
    pub storage: TokenStorageConfig,

    /// HTTP client timeout
    pub timeout: Duration,

    /// Retry configuration
    pub retry_config: RetryConfig,

    /// Enable automatic token refresh
    pub auto_refresh: bool,

    /// Refresh tokens this many seconds before expiry
    pub refresh_threshold_secs: u64,
}

/// OAuth2 provider endpoint configuration
#[derive(Clone)]
pub struct ProviderConfig {
    /// Authorization endpoint URL
    pub authorization_endpoint: Url,

    /// Token endpoint URL
    pub token_endpoint: Url,

    /// Device authorization endpoint (optional)
    pub device_authorization_endpoint: Option<Url>,

    /// Token introspection endpoint (optional)
    pub introspection_endpoint: Option<Url>,

    /// Token revocation endpoint (optional)
    pub revocation_endpoint: Option<Url>,

    /// OIDC discovery URL (optional, for auto-discovery)
    pub discovery_url: Option<Url>,

    /// OIDC userinfo endpoint (optional)
    pub userinfo_endpoint: Option<Url>,

    /// JWKS URI for JWT validation (optional)
    pub jwks_uri: Option<Url>,

    /// Issuer identifier for JWT validation
    pub issuer: Option<String>,
}

/// Client credentials for OAuth2 authentication
#[derive(Clone)]
pub struct ClientCredentials {
    /// Client identifier
    pub client_id: String,

    /// Client secret (for confidential clients)
    pub client_secret: Option<SecretString>,

    /// Client authentication method
    pub auth_method: ClientAuthMethod,
}

/// How the client authenticates to the authorization server
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClientAuthMethod {
    /// client_id and client_secret in request body
    ClientSecretPost,

    /// HTTP Basic Authentication header
    ClientSecretBasic,

    /// JWT assertion signed with client secret
    ClientSecretJwt,

    /// JWT assertion signed with private key
    PrivateKeyJwt,

    /// No client authentication (public client)
    None,
}

/// Token storage configuration
#[derive(Clone)]
pub enum TokenStorageConfig {
    /// In-memory storage (testing/development)
    InMemory,

    /// File-based storage
    File { path: std::path::PathBuf },

    /// Custom storage implementation
    Custom(Arc<dyn TokenStorage>),
}

impl Default for OAuth2Config {
    fn default() -> Self {
        Self {
            provider: ProviderConfig::default(),
            credentials: ClientCredentials {
                client_id: String::new(),
                client_secret: None,
                auth_method: ClientAuthMethod::ClientSecretBasic,
            },
            default_scopes: vec![],
            storage: TokenStorageConfig::InMemory,
            timeout: Duration::from_secs(30),
            retry_config: RetryConfig::default(),
            auto_refresh: true,
            refresh_threshold_secs: 60,
        }
    }
}
```

#### 6.1.2 Main Client Trait

```rust
use async_trait::async_trait;

/// Primary interface for OAuth2 operations
#[async_trait]
pub trait OAuth2Client: Send + Sync {
    /// Get the authorization code flow handler
    fn authorization_code(&self) -> &dyn AuthorizationCodeFlow;

    /// Get the authorization code with PKCE flow handler
    fn authorization_code_pkce(&self) -> &dyn AuthorizationCodePkceFlow;

    /// Get the client credentials flow handler
    fn client_credentials(&self) -> &dyn ClientCredentialsFlow;

    /// Get the device authorization flow handler
    fn device_authorization(&self) -> &dyn DeviceAuthorizationFlow;

    /// Get the token manager for token operations
    fn tokens(&self) -> &dyn TokenManager;

    /// Get the token introspection handler
    fn introspection(&self) -> &dyn TokenIntrospection;

    /// Get the token revocation handler
    fn revocation(&self) -> &dyn TokenRevocation;

    /// Discover provider configuration via OIDC
    async fn discover(&self, issuer_url: &Url) -> Result<ProviderConfig, OAuth2Error>;
}

/// Factory for creating OAuth2 clients
pub trait OAuth2ClientFactory: Send + Sync {
    /// Create a new OAuth2 client with the given configuration
    fn create(config: OAuth2Config) -> Result<Box<dyn OAuth2Client>, OAuth2Error>;

    /// Create a client with OIDC auto-discovery
    async fn discover(issuer_url: &Url, credentials: ClientCredentials)
        -> Result<Box<dyn OAuth2Client>, OAuth2Error>;
}
```

#### 6.1.3 Flow Traits

```rust
/// Authorization Code Flow (RFC 6749 Section 4.1)
#[async_trait]
pub trait AuthorizationCodeFlow: Send + Sync {
    /// Generate an authorization URL for user redirect
    fn authorization_url(&self, params: AuthorizationParams) -> AuthorizationUrlResult;

    /// Exchange an authorization code for tokens
    async fn exchange_code(
        &self,
        code: &str,
        state: &str,
        redirect_uri: &Url,
    ) -> Result<TokenResponse, OAuth2Error>;

    /// Process the authorization callback
    async fn handle_callback(
        &self,
        callback_params: CallbackParams,
    ) -> Result<TokenResponse, OAuth2Error>;
}

/// Authorization Code Flow with PKCE (RFC 7636)
#[async_trait]
pub trait AuthorizationCodePkceFlow: Send + Sync {
    /// Generate an authorization URL with PKCE challenge
    fn authorization_url(&self, params: AuthorizationParams) -> PkceAuthorizationResult;

    /// Exchange an authorization code using PKCE verifier
    async fn exchange_code(
        &self,
        code: &str,
        state: &str,
        pkce_verifier: &PkceVerifier,
        redirect_uri: &Url,
    ) -> Result<TokenResponse, OAuth2Error>;
}

/// Client Credentials Flow (RFC 6749 Section 4.4)
#[async_trait]
pub trait ClientCredentialsFlow: Send + Sync {
    /// Request an access token using client credentials
    async fn request_token(
        &self,
        scopes: Option<&[String]>,
    ) -> Result<TokenResponse, OAuth2Error>;
}

/// Device Authorization Flow (RFC 8628)
#[async_trait]
pub trait DeviceAuthorizationFlow: Send + Sync {
    /// Request device authorization
    async fn request_device_authorization(
        &self,
        scopes: Option<&[String]>,
    ) -> Result<DeviceAuthorizationResponse, OAuth2Error>;

    /// Poll for token after user authorization
    async fn poll_token(
        &self,
        device_code: &str,
        interval: Duration,
        timeout: Duration,
    ) -> Result<TokenResponse, OAuth2Error>;

    /// Execute full device flow with callback for user interaction
    async fn execute<F>(
        &self,
        scopes: Option<&[String]>,
        on_user_code: F,
    ) -> Result<TokenResponse, OAuth2Error>
    where
        F: FnOnce(&DeviceAuthorizationResponse) + Send;
}

/// Token Introspection (RFC 7662)
#[async_trait]
pub trait TokenIntrospection: Send + Sync {
    /// Introspect an access token
    async fn introspect_access_token(
        &self,
        token: &str,
    ) -> Result<IntrospectionResponse, OAuth2Error>;

    /// Introspect a refresh token
    async fn introspect_refresh_token(
        &self,
        token: &str,
    ) -> Result<IntrospectionResponse, OAuth2Error>;
}

/// Token Revocation (RFC 7009)
#[async_trait]
pub trait TokenRevocation: Send + Sync {
    /// Revoke an access token
    async fn revoke_access_token(&self, token: &str) -> Result<(), OAuth2Error>;

    /// Revoke a refresh token
    async fn revoke_refresh_token(&self, token: &str) -> Result<(), OAuth2Error>;

    /// Revoke all tokens for the current session
    async fn revoke_all(&self) -> Result<(), OAuth2Error>;
}
```

#### 6.1.4 Token Management

```rust
/// Token management interface
#[async_trait]
pub trait TokenManager: Send + Sync {
    /// Get a valid access token (refreshing if necessary)
    async fn get_access_token(&self) -> Result<AccessToken, OAuth2Error>;

    /// Get the current token set without refreshing
    async fn get_current_tokens(&self) -> Result<Option<TokenSet>, OAuth2Error>;

    /// Force refresh the access token
    async fn refresh(&self) -> Result<TokenResponse, OAuth2Error>;

    /// Store tokens from a successful authorization
    async fn store_tokens(&self, tokens: TokenSet) -> Result<(), OAuth2Error>;

    /// Clear all stored tokens
    async fn clear_tokens(&self) -> Result<(), OAuth2Error>;

    /// Check if tokens are stored
    async fn has_tokens(&self) -> Result<bool, OAuth2Error>;

    /// Check if access token is expired
    async fn is_access_token_expired(&self) -> Result<bool, OAuth2Error>;

    /// Check if refresh token is available
    async fn has_refresh_token(&self) -> Result<bool, OAuth2Error>;
}

/// Secure token storage abstraction
#[async_trait]
pub trait TokenStorage: Send + Sync {
    /// Store a token set
    async fn store(&self, key: &str, tokens: &TokenSet) -> Result<(), OAuth2Error>;

    /// Retrieve a token set
    async fn retrieve(&self, key: &str) -> Result<Option<TokenSet>, OAuth2Error>;

    /// Delete a token set
    async fn delete(&self, key: &str) -> Result<(), OAuth2Error>;

    /// Check if tokens exist
    async fn exists(&self, key: &str) -> Result<bool, OAuth2Error>;

    /// Clear all stored tokens
    async fn clear_all(&self) -> Result<(), OAuth2Error>;
}
```

#### 6.1.5 Data Types

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Complete token set from authorization
#[derive(Clone, Serialize, Deserialize)]
pub struct TokenSet {
    /// Access token for API requests
    pub access_token: SecretString,

    /// Token type (usually "Bearer")
    pub token_type: String,

    /// When the access token expires
    pub expires_at: Option<DateTime<Utc>>,

    /// Refresh token for obtaining new access tokens
    pub refresh_token: Option<SecretString>,

    /// Refresh token expiration (if provided)
    pub refresh_token_expires_at: Option<DateTime<Utc>>,

    /// Granted scopes (may differ from requested)
    pub scope: Option<String>,

    /// ID token (for OIDC)
    pub id_token: Option<SecretString>,

    /// Additional fields from provider
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Access token wrapper for safe handling
#[derive(Clone)]
pub struct AccessToken {
    /// The token value
    value: SecretString,

    /// Token type
    pub token_type: String,

    /// Expiration time
    pub expires_at: Option<DateTime<Utc>>,

    /// Associated scopes
    pub scopes: Vec<String>,
}

impl AccessToken {
    /// Get the token value (for use in Authorization header)
    pub fn secret(&self) -> &str {
        self.value.expose_secret()
    }

    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        self.expires_at
            .map(|exp| exp <= Utc::now())
            .unwrap_or(false)
    }

    /// Get time until expiration
    pub fn expires_in(&self) -> Option<Duration> {
        self.expires_at.and_then(|exp| {
            let now = Utc::now();
            if exp > now {
                (exp - now).to_std().ok()
            } else {
                None
            }
        })
    }

    /// Format as Authorization header value
    pub fn authorization_header(&self) -> String {
        format!("{} {}", self.token_type, self.value.expose_secret())
    }
}

/// Token response from authorization server
#[derive(Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    /// Access token
    pub access_token: SecretString,

    /// Token type (usually "Bearer")
    pub token_type: String,

    /// Expires in seconds
    pub expires_in: Option<u64>,

    /// Refresh token
    pub refresh_token: Option<SecretString>,

    /// Granted scopes
    pub scope: Option<String>,

    /// ID token (OIDC)
    pub id_token: Option<SecretString>,

    /// Additional fields
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Parameters for authorization URL generation
#[derive(Clone, Default)]
pub struct AuthorizationParams {
    /// Requested scopes (overrides default)
    pub scopes: Option<Vec<String>>,

    /// Redirect URI
    pub redirect_uri: Url,

    /// Custom state value (auto-generated if not provided)
    pub state: Option<String>,

    /// Additional parameters
    pub extra_params: HashMap<String, String>,

    /// Response mode (query, fragment, form_post)
    pub response_mode: Option<ResponseMode>,

    /// Login hint for pre-filling user identity
    pub login_hint: Option<String>,

    /// Prompt behavior (none, login, consent, select_account)
    pub prompt: Option<Prompt>,
}

/// Result of authorization URL generation
pub struct AuthorizationUrlResult {
    /// The authorization URL to redirect user to
    pub url: Url,

    /// State parameter for CSRF validation
    pub state: String,
}

/// Result of PKCE authorization URL generation
pub struct PkceAuthorizationResult {
    /// The authorization URL to redirect user to
    pub url: Url,

    /// State parameter for CSRF validation
    pub state: String,

    /// PKCE verifier (must be stored and used in token exchange)
    pub pkce_verifier: PkceVerifier,
}

/// PKCE code verifier
#[derive(Clone)]
pub struct PkceVerifier {
    /// The verifier value
    verifier: SecretString,
}

impl PkceVerifier {
    /// Generate a new random PKCE verifier
    pub fn generate() -> Self;

    /// Get the verifier value
    pub fn secret(&self) -> &str;

    /// Generate the code challenge
    pub fn challenge(&self, method: PkceMethod) -> String;
}

/// PKCE challenge method
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PkceMethod {
    /// SHA-256 hash (recommended)
    S256,

    /// Plain text (not recommended, for compatibility only)
    Plain,
}

/// Device authorization response
#[derive(Clone, Serialize, Deserialize)]
pub struct DeviceAuthorizationResponse {
    /// Device verification code
    pub device_code: String,

    /// User code to display
    pub user_code: String,

    /// URI for user to visit
    pub verification_uri: Url,

    /// URI with code pre-filled (optional)
    pub verification_uri_complete: Option<Url>,

    /// Lifetime in seconds
    pub expires_in: u64,

    /// Minimum polling interval in seconds
    pub interval: Option<u64>,
}

/// Callback parameters from authorization redirect
#[derive(Clone)]
pub struct CallbackParams {
    /// Authorization code
    pub code: String,

    /// State parameter
    pub state: String,

    /// Error code (if authorization failed)
    pub error: Option<String>,

    /// Error description
    pub error_description: Option<String>,
}

/// Token introspection response
#[derive(Clone, Serialize, Deserialize)]
pub struct IntrospectionResponse {
    /// Whether the token is active
    pub active: bool,

    /// Granted scopes
    pub scope: Option<String>,

    /// Client that requested the token
    pub client_id: Option<String>,

    /// Resource owner username
    pub username: Option<String>,

    /// Token type
    pub token_type: Option<String>,

    /// Expiration timestamp
    pub exp: Option<i64>,

    /// Issued-at timestamp
    pub iat: Option<i64>,

    /// Not-before timestamp
    pub nbf: Option<i64>,

    /// Subject identifier
    pub sub: Option<String>,

    /// Audience
    pub aud: Option<String>,

    /// Issuer
    pub iss: Option<String>,

    /// JWT ID
    pub jti: Option<String>,

    /// Additional claims
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Response mode for authorization
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResponseMode {
    Query,
    Fragment,
    FormPost,
}

/// Prompt behavior for authorization
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Prompt {
    None,
    Login,
    Consent,
    SelectAccount,
}
```

### 6.2 TypeScript Interface

#### 6.2.1 Configuration Types

```typescript
/**
 * Configuration for the OAuth2 client
 */
export interface OAuth2Config {
  /** OAuth2 provider configuration */
  provider: ProviderConfig;

  /** Client credentials */
  credentials: ClientCredentials;

  /** Default scopes to request */
  defaultScopes?: string[];

  /** Token storage backend */
  storage?: TokenStorageConfig;

  /** HTTP client timeout in milliseconds */
  timeout?: number;

  /** Retry configuration */
  retryConfig?: RetryConfig;

  /** Enable automatic token refresh */
  autoRefresh?: boolean;

  /** Refresh tokens this many seconds before expiry */
  refreshThresholdSecs?: number;
}

/**
 * OAuth2 provider endpoint configuration
 */
export interface ProviderConfig {
  /** Authorization endpoint URL */
  authorizationEndpoint: string;

  /** Token endpoint URL */
  tokenEndpoint: string;

  /** Device authorization endpoint (optional) */
  deviceAuthorizationEndpoint?: string;

  /** Token introspection endpoint (optional) */
  introspectionEndpoint?: string;

  /** Token revocation endpoint (optional) */
  revocationEndpoint?: string;

  /** OIDC discovery URL (optional, for auto-discovery) */
  discoveryUrl?: string;

  /** OIDC userinfo endpoint (optional) */
  userinfoEndpoint?: string;

  /** JWKS URI for JWT validation (optional) */
  jwksUri?: string;

  /** Issuer identifier for JWT validation */
  issuer?: string;
}

/**
 * Client credentials for OAuth2 authentication
 */
export interface ClientCredentials {
  /** Client identifier */
  clientId: string;

  /** Client secret (for confidential clients) */
  clientSecret?: string;

  /** Client authentication method */
  authMethod?: ClientAuthMethod;
}

/**
 * How the client authenticates to the authorization server
 */
export type ClientAuthMethod =
  | 'client_secret_post'
  | 'client_secret_basic'
  | 'client_secret_jwt'
  | 'private_key_jwt'
  | 'none';

/**
 * Token storage configuration
 */
export type TokenStorageConfig =
  | { type: 'memory' }
  | { type: 'file'; path: string }
  | { type: 'custom'; storage: TokenStorage };
```

#### 6.2.2 Client Interface

```typescript
/**
 * Primary interface for OAuth2 operations
 */
export interface OAuth2Client {
  /** Get the authorization code flow handler */
  readonly authorizationCode: AuthorizationCodeFlow;

  /** Get the authorization code with PKCE flow handler */
  readonly authorizationCodePkce: AuthorizationCodePkceFlow;

  /** Get the client credentials flow handler */
  readonly clientCredentials: ClientCredentialsFlow;

  /** Get the device authorization flow handler */
  readonly deviceAuthorization: DeviceAuthorizationFlow;

  /** Get the token manager for token operations */
  readonly tokens: TokenManager;

  /** Get the token introspection handler */
  readonly introspection: TokenIntrospection;

  /** Get the token revocation handler */
  readonly revocation: TokenRevocation;

  /** Discover provider configuration via OIDC */
  discover(issuerUrl: string): Promise<ProviderConfig>;
}

/**
 * Factory for creating OAuth2 clients
 */
export interface OAuth2ClientFactory {
  /** Create a new OAuth2 client with the given configuration */
  create(config: OAuth2Config): OAuth2Client;

  /** Create a client with OIDC auto-discovery */
  discover(issuerUrl: string, credentials: ClientCredentials): Promise<OAuth2Client>;
}

/**
 * Create an OAuth2 client
 */
export function createOAuth2Client(config: OAuth2Config): OAuth2Client;

/**
 * Create an OAuth2 client with OIDC discovery
 */
export function createOAuth2ClientFromDiscovery(
  issuerUrl: string,
  credentials: ClientCredentials
): Promise<OAuth2Client>;
```

#### 6.2.3 Flow Interfaces

```typescript
/**
 * Authorization Code Flow (RFC 6749 Section 4.1)
 */
export interface AuthorizationCodeFlow {
  /** Generate an authorization URL for user redirect */
  authorizationUrl(params: AuthorizationParams): AuthorizationUrlResult;

  /** Exchange an authorization code for tokens */
  exchangeCode(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<TokenResponse>;

  /** Process the authorization callback */
  handleCallback(callbackParams: CallbackParams): Promise<TokenResponse>;
}

/**
 * Authorization Code Flow with PKCE (RFC 7636)
 */
export interface AuthorizationCodePkceFlow {
  /** Generate an authorization URL with PKCE challenge */
  authorizationUrl(params: AuthorizationParams): PkceAuthorizationResult;

  /** Exchange an authorization code using PKCE verifier */
  exchangeCode(
    code: string,
    state: string,
    pkceVerifier: PkceVerifier,
    redirectUri: string
  ): Promise<TokenResponse>;
}

/**
 * Client Credentials Flow (RFC 6749 Section 4.4)
 */
export interface ClientCredentialsFlow {
  /** Request an access token using client credentials */
  requestToken(scopes?: string[]): Promise<TokenResponse>;
}

/**
 * Device Authorization Flow (RFC 8628)
 */
export interface DeviceAuthorizationFlow {
  /** Request device authorization */
  requestDeviceAuthorization(
    scopes?: string[]
  ): Promise<DeviceAuthorizationResponse>;

  /** Poll for token after user authorization */
  pollToken(
    deviceCode: string,
    intervalMs: number,
    timeoutMs: number
  ): Promise<TokenResponse>;

  /** Execute full device flow with callback for user interaction */
  execute(
    scopes: string[] | undefined,
    onUserCode: (response: DeviceAuthorizationResponse) => void
  ): Promise<TokenResponse>;
}

/**
 * Token Introspection (RFC 7662)
 */
export interface TokenIntrospection {
  /** Introspect an access token */
  introspectAccessToken(token: string): Promise<IntrospectionResponse>;

  /** Introspect a refresh token */
  introspectRefreshToken(token: string): Promise<IntrospectionResponse>;
}

/**
 * Token Revocation (RFC 7009)
 */
export interface TokenRevocation {
  /** Revoke an access token */
  revokeAccessToken(token: string): Promise<void>;

  /** Revoke a refresh token */
  revokeRefreshToken(token: string): Promise<void>;

  /** Revoke all tokens for the current session */
  revokeAll(): Promise<void>;
}
```

#### 6.2.4 Token Management

```typescript
/**
 * Token management interface
 */
export interface TokenManager {
  /** Get a valid access token (refreshing if necessary) */
  getAccessToken(): Promise<AccessToken>;

  /** Get the current token set without refreshing */
  getCurrentTokens(): Promise<TokenSet | null>;

  /** Force refresh the access token */
  refresh(): Promise<TokenResponse>;

  /** Store tokens from a successful authorization */
  storeTokens(tokens: TokenSet): Promise<void>;

  /** Clear all stored tokens */
  clearTokens(): Promise<void>;

  /** Check if tokens are stored */
  hasTokens(): Promise<boolean>;

  /** Check if access token is expired */
  isAccessTokenExpired(): Promise<boolean>;

  /** Check if refresh token is available */
  hasRefreshToken(): Promise<boolean>;
}

/**
 * Secure token storage abstraction
 */
export interface TokenStorage {
  /** Store a token set */
  store(key: string, tokens: TokenSet): Promise<void>;

  /** Retrieve a token set */
  retrieve(key: string): Promise<TokenSet | null>;

  /** Delete a token set */
  delete(key: string): Promise<void>;

  /** Check if tokens exist */
  exists(key: string): Promise<boolean>;

  /** Clear all stored tokens */
  clearAll(): Promise<void>;
}
```

#### 6.2.5 Data Types

```typescript
/**
 * Complete token set from authorization
 */
export interface TokenSet {
  /** Access token for API requests */
  accessToken: string;

  /** Token type (usually "Bearer") */
  tokenType: string;

  /** When the access token expires (ISO 8601) */
  expiresAt?: string;

  /** Refresh token for obtaining new access tokens */
  refreshToken?: string;

  /** Refresh token expiration (if provided) */
  refreshTokenExpiresAt?: string;

  /** Granted scopes (may differ from requested) */
  scope?: string;

  /** ID token (for OIDC) */
  idToken?: string;

  /** Additional fields from provider */
  [key: string]: unknown;
}

/**
 * Access token wrapper for safe handling
 */
export interface AccessToken {
  /** The token value */
  readonly value: string;

  /** Token type */
  readonly tokenType: string;

  /** Expiration time (ISO 8601) */
  readonly expiresAt?: string;

  /** Associated scopes */
  readonly scopes: string[];

  /** Check if token is expired */
  isExpired(): boolean;

  /** Get time until expiration in milliseconds */
  expiresIn(): number | null;

  /** Format as Authorization header value */
  authorizationHeader(): string;
}

/**
 * Token response from authorization server
 */
export interface TokenResponse {
  /** Access token */
  access_token: string;

  /** Token type (usually "Bearer") */
  token_type: string;

  /** Expires in seconds */
  expires_in?: number;

  /** Refresh token */
  refresh_token?: string;

  /** Granted scopes */
  scope?: string;

  /** ID token (OIDC) */
  id_token?: string;

  /** Additional fields */
  [key: string]: unknown;
}

/**
 * Parameters for authorization URL generation
 */
export interface AuthorizationParams {
  /** Requested scopes (overrides default) */
  scopes?: string[];

  /** Redirect URI */
  redirectUri: string;

  /** Custom state value (auto-generated if not provided) */
  state?: string;

  /** Additional parameters */
  extraParams?: Record<string, string>;

  /** Response mode (query, fragment, form_post) */
  responseMode?: ResponseMode;

  /** Login hint for pre-filling user identity */
  loginHint?: string;

  /** Prompt behavior */
  prompt?: Prompt;
}

/**
 * Result of authorization URL generation
 */
export interface AuthorizationUrlResult {
  /** The authorization URL to redirect user to */
  url: string;

  /** State parameter for CSRF validation */
  state: string;
}

/**
 * Result of PKCE authorization URL generation
 */
export interface PkceAuthorizationResult {
  /** The authorization URL to redirect user to */
  url: string;

  /** State parameter for CSRF validation */
  state: string;

  /** PKCE verifier (must be stored and used in token exchange) */
  pkceVerifier: PkceVerifier;
}

/**
 * PKCE code verifier
 */
export interface PkceVerifier {
  /** Get the verifier value */
  readonly value: string;

  /** Generate the code challenge */
  challenge(method?: PkceMethod): string;
}

/**
 * PKCE challenge method
 */
export type PkceMethod = 'S256' | 'plain';

/**
 * Device authorization response
 */
export interface DeviceAuthorizationResponse {
  /** Device verification code */
  device_code: string;

  /** User code to display */
  user_code: string;

  /** URI for user to visit */
  verification_uri: string;

  /** URI with code pre-filled (optional) */
  verification_uri_complete?: string;

  /** Lifetime in seconds */
  expires_in: number;

  /** Minimum polling interval in seconds */
  interval?: number;
}

/**
 * Callback parameters from authorization redirect
 */
export interface CallbackParams {
  /** Authorization code */
  code: string;

  /** State parameter */
  state: string;

  /** Error code (if authorization failed) */
  error?: string;

  /** Error description */
  errorDescription?: string;
}

/**
 * Token introspection response
 */
export interface IntrospectionResponse {
  /** Whether the token is active */
  active: boolean;

  /** Granted scopes */
  scope?: string;

  /** Client that requested the token */
  client_id?: string;

  /** Resource owner username */
  username?: string;

  /** Token type */
  token_type?: string;

  /** Expiration timestamp */
  exp?: number;

  /** Issued-at timestamp */
  iat?: number;

  /** Not-before timestamp */
  nbf?: number;

  /** Subject identifier */
  sub?: string;

  /** Audience */
  aud?: string;

  /** Issuer */
  iss?: string;

  /** JWT ID */
  jti?: string;

  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Response mode for authorization
 */
export type ResponseMode = 'query' | 'fragment' | 'form_post';

/**
 * Prompt behavior for authorization
 */
export type Prompt = 'none' | 'login' | 'consent' | 'select_account';
```

---

## 7. Token Management

### 7.1 Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Token Lifecycle                               │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────┐    Authorization    ┌──────────────┐
  │ No Token │──────Flow──────────▶│ Token Stored │
  └──────────┘                     └──────┬───────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
            │ Token Valid  │     │Token Expiring│     │Token Expired │
            │              │     │  (< 60s)     │     │              │
            └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
                   │                    │                    │
                   │                    ▼                    │
                   │           ┌──────────────┐              │
                   │           │Auto Refresh  │◀─────────────┘
                   │           │              │
                   │           └──────┬───────┘
                   │                  │
                   │    ┌─────────────┴─────────────┐
                   │    │                           │
                   │    ▼                           ▼
                   │  ┌──────────┐          ┌──────────────┐
                   │  │ Success  │          │Refresh Failed│
                   │  └────┬─────┘          └──────┬───────┘
                   │       │                       │
                   │       ▼                       ▼
                   │  ┌──────────────┐     ┌──────────────┐
                   └─▶│ Token Valid  │     │ Re-authorize │
                      └──────────────┘     └──────────────┘
```

### 7.2 Token Storage Security

| Requirement | Implementation |
|-------------|----------------|
| Encryption at rest | AES-256-GCM for file storage |
| Memory protection | Zeroize on drop (secrecy crate) |
| Key derivation | PBKDF2 or Argon2 from user secret |
| No plaintext logging | Debug trait redacts values |
| Secure deletion | Overwrite before delete |

### 7.3 Token Refresh Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Proactive** | Refresh before expiry (default 60s) | Long-running services |
| **On-Demand** | Refresh only when expired | Infrequent API calls |
| **Background** | Periodic refresh task | Always-on services |
| **Manual** | Application controls refresh | Custom requirements |

### 7.4 Multi-Tenant Token Storage

```rust
/// Multi-tenant token storage key format
pub struct TokenStorageKey {
    /// Tenant identifier
    pub tenant_id: String,

    /// User identifier (optional)
    pub user_id: Option<String>,

    /// Provider identifier
    pub provider: String,
}

impl TokenStorageKey {
    /// Generate storage key string
    pub fn to_key(&self) -> String {
        match &self.user_id {
            Some(user) => format!("{}:{}:{}", self.tenant_id, user, self.provider),
            None => format!("{}::{}", self.tenant_id, self.provider),
        }
    }
}
```

---

## 8. Dependency Policy

### 8.1 Required Dependencies (Integration Repo Primitives)

| Primitive | Purpose | Interface |
|-----------|---------|-----------|
| `@integrations/errors` | Base error types and traits | `IntegrationError` trait |
| `@integrations/retry` | Retry logic with backoff | `RetryPolicy`, `RetryExecutor` |
| `@integrations/circuit-breaker` | Circuit breaker pattern | `CircuitBreaker` trait |
| `@integrations/rate-limits` | Rate limiting enforcement | `RateLimiter` trait |
| `@integrations/tracing` | Distributed tracing | `Span`, `Tracer` traits |
| `@integrations/logging` | Structured logging | `Logger` trait |
| `@integrations/types` | Common type definitions | Shared types |
| `@integrations/config` | Configuration management | `ConfigProvider` trait |

### 8.2 Approved Third-Party Dependencies

#### Rust Crates

| Crate | Version | Purpose | Justification |
|-------|---------|---------|---------------|
| `reqwest` | ^0.12 | HTTP client | Industry standard, async support |
| `tokio` | ^1.0 | Async runtime | Required by reqwest |
| `serde` | ^1.0 | Serialization | De-facto standard |
| `serde_json` | ^1.0 | JSON handling | OAuth2 protocol requirement |
| `secrecy` | ^0.8 | Secret handling | Secure credential management |
| `url` | ^2.0 | URL parsing | Safe URL handling |
| `base64` | ^0.22 | Base64 encoding | PKCE, Basic auth |
| `sha2` | ^0.10 | SHA-256 hashing | PKCE S256 method |
| `rand` | ^0.8 | Random generation | State, PKCE verifier |
| `chrono` | ^0.4 | Date/time handling | Token expiration |
| `async-trait` | ^0.1 | Async traits | Ergonomic async interfaces |
| `thiserror` | ^1.0 | Error derivation | Clean error types |
| `jsonwebtoken` | ^9.0 | JWT handling | OIDC ID token validation |
| `futures` | ^0.3 | Async utilities | Stream handling |
| `ring` | ^0.17 | Cryptography | Secure random, HMAC |

#### TypeScript Packages

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| `jose` | ^5.0 | JWT/JOSE operations | OIDC token validation |
| `crypto` | Native | Cryptographic operations | PKCE, secure random |

### 8.3 Forbidden Dependencies

| Category | Examples | Reason |
|----------|----------|--------|
| Other integration modules | `@integrations/openai`, `@integrations/github` | Module isolation |
| ruvbase | `ruvbase`, `layer-0` | Layer separation |
| Full OAuth2 libraries | `oauth2` (Rust crate), `passport` | This IS the OAuth2 implementation |
| Database ORMs | `diesel`, `sqlx`, `prisma` | Out of scope |
| Web frameworks | `actix-web`, `axum`, `express` | Out of scope |

---

## 9. Error Taxonomy

### 9.1 Error Hierarchy

```
OAuth2Error (root)
├── ConfigurationError
│   ├── MissingClientId
│   ├── MissingClientSecret
│   ├── InvalidEndpointUrl
│   ├── InvalidRedirectUri
│   └── DiscoveryFailed
├── AuthorizationError
│   ├── AccessDenied
│   ├── InvalidScope
│   ├── UnauthorizedClient
│   ├── UnsupportedResponseType
│   ├── ServerError
│   ├── TemporarilyUnavailable
│   └── StateMismatch
├── TokenError
│   ├── InvalidGrant
│   ├── InvalidClient
│   ├── InvalidRequest
│   ├── InvalidScope
│   ├── UnauthorizedClient
│   ├── UnsupportedGrantType
│   ├── ExpiredToken
│   ├── RevokedToken
│   └── InvalidToken
├── DeviceFlowError
│   ├── AuthorizationPending
│   ├── SlowDown
│   ├── AccessDenied
│   ├── ExpiredToken
│   └── PollingTimeout
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
├── StorageError
│   ├── ReadFailed
│   ├── WriteFailed
│   ├── EncryptionFailed
│   ├── DecryptionFailed
│   └── NotFound
├── ValidationError
│   ├── InvalidTokenFormat
│   ├── InvalidJwt
│   ├── JwtSignatureInvalid
│   ├── JwtExpired
│   ├── InvalidIssuer
│   └── InvalidAudience
└── IntrospectionError
    ├── EndpointNotSupported
    ├── TokenInactive
    └── IntrospectionFailed
```

### 9.2 Error Type Definitions (Rust)

```rust
use thiserror::Error;
use integrations_errors::IntegrationError;

/// Root error type for OAuth2 integration
#[derive(Error, Debug)]
pub enum OAuth2Error {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("Token error: {0}")]
    Token(#[from] TokenError),

    #[error("Device flow error: {0}")]
    DeviceFlow(#[from] DeviceFlowError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Storage error: {0}")]
    Storage(#[from] StorageError),

    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),

    #[error("Introspection error: {0}")]
    Introspection(#[from] IntrospectionError),
}

impl IntegrationError for OAuth2Error {
    fn error_code(&self) -> &'static str {
        match self {
            Self::Configuration(_) => "OAUTH2_CONFIG",
            Self::Authorization(_) => "OAUTH2_AUTH",
            Self::Token(_) => "OAUTH2_TOKEN",
            Self::DeviceFlow(_) => "OAUTH2_DEVICE",
            Self::Network(_) => "OAUTH2_NETWORK",
            Self::Storage(_) => "OAUTH2_STORAGE",
            Self::Validation(_) => "OAUTH2_VALIDATION",
            Self::Introspection(_) => "OAUTH2_INTROSPECTION",
        }
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::Network(NetworkError::Timeout)
                | Self::Network(NetworkError::ConnectionFailed)
                | Self::DeviceFlow(DeviceFlowError::AuthorizationPending)
                | Self::DeviceFlow(DeviceFlowError::SlowDown { .. })
                | Self::Authorization(AuthorizationError::TemporarilyUnavailable)
        )
    }

    fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::DeviceFlow(DeviceFlowError::SlowDown { interval }) => {
                Some(Duration::from_secs(*interval as u64))
            }
            Self::Authorization(AuthorizationError::TemporarilyUnavailable { retry_after }) => {
                *retry_after
            }
            _ => None,
        }
    }
}

#[derive(Error, Debug)]
pub enum AuthorizationError {
    #[error("Access denied by user")]
    AccessDenied,

    #[error("Invalid scope: {scope}")]
    InvalidScope { scope: String },

    #[error("Unauthorized client")]
    UnauthorizedClient,

    #[error("Unsupported response type: {response_type}")]
    UnsupportedResponseType { response_type: String },

    #[error("Authorization server error: {message}")]
    ServerError { message: String },

    #[error("Server temporarily unavailable")]
    TemporarilyUnavailable { retry_after: Option<Duration> },

    #[error("State parameter mismatch (possible CSRF attack)")]
    StateMismatch { expected: String, received: String },

    #[error("Authorization error: {error} - {description}")]
    ProtocolError {
        error: String,
        description: Option<String>,
        uri: Option<String>,
    },
}

#[derive(Error, Debug)]
pub enum TokenError {
    #[error("Invalid grant: {message}")]
    InvalidGrant { message: String },

    #[error("Invalid client credentials")]
    InvalidClient,

    #[error("Invalid request: {message}")]
    InvalidRequest { message: String },

    #[error("Invalid scope: {scope}")]
    InvalidScope { scope: String },

    #[error("Unauthorized client for this grant type")]
    UnauthorizedClient,

    #[error("Unsupported grant type: {grant_type}")]
    UnsupportedGrantType { grant_type: String },

    #[error("Access token expired")]
    ExpiredToken,

    #[error("Token has been revoked")]
    RevokedToken,

    #[error("Invalid token format")]
    InvalidToken,

    #[error("Token exchange failed: {error} - {description}")]
    ExchangeFailed {
        error: String,
        description: Option<String>,
    },
}

#[derive(Error, Debug)]
pub enum DeviceFlowError {
    #[error("Authorization pending - user has not yet completed authorization")]
    AuthorizationPending,

    #[error("Slow down - increase polling interval to {interval} seconds")]
    SlowDown { interval: u32 },

    #[error("Access denied by user")]
    AccessDenied,

    #[error("Device code expired")]
    ExpiredToken,

    #[error("Polling timeout after {elapsed:?}")]
    PollingTimeout { elapsed: Duration },
}
```

### 9.3 OAuth2 Error Response Mapping

| OAuth2 Error Code | Error Type | Retryable |
|-------------------|------------|-----------|
| `access_denied` | `AuthorizationError::AccessDenied` | No |
| `invalid_scope` | `AuthorizationError::InvalidScope` | No |
| `unauthorized_client` | `AuthorizationError::UnauthorizedClient` | No |
| `unsupported_response_type` | `AuthorizationError::UnsupportedResponseType` | No |
| `server_error` | `AuthorizationError::ServerError` | Yes |
| `temporarily_unavailable` | `AuthorizationError::TemporarilyUnavailable` | Yes |
| `invalid_grant` | `TokenError::InvalidGrant` | No |
| `invalid_client` | `TokenError::InvalidClient` | No |
| `invalid_request` | `TokenError::InvalidRequest` | No |
| `unsupported_grant_type` | `TokenError::UnsupportedGrantType` | No |
| `authorization_pending` | `DeviceFlowError::AuthorizationPending` | Yes |
| `slow_down` | `DeviceFlowError::SlowDown` | Yes |
| `expired_token` | `DeviceFlowError::ExpiredToken` | No |

---

## 10. Phase-3-Ready Hooks

### 10.1 Retry Policy

#### 10.1.1 Retry Configuration

```rust
/// Retry configuration for OAuth2 operations
pub struct OAuth2RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,

    /// Initial backoff duration
    pub initial_backoff: Duration,

    /// Maximum backoff duration
    pub max_backoff: Duration,

    /// Backoff multiplier
    pub backoff_multiplier: f64,

    /// Jitter factor (0.0 to 1.0)
    pub jitter: f64,

    /// Retryable error types
    pub retryable_errors: Vec<OAuth2ErrorKind>,
}

impl Default for OAuth2RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff: Duration::from_millis(500),
            max_backoff: Duration::from_secs(30),
            backoff_multiplier: 2.0,
            jitter: 0.1,
            retryable_errors: vec![
                OAuth2ErrorKind::Network,
                OAuth2ErrorKind::TemporarilyUnavailable,
            ],
        }
    }
}
```

#### 10.1.2 Retry Hook Interface

```rust
/// Hook for customizing retry behavior
#[async_trait]
pub trait RetryHook: Send + Sync {
    /// Called before each retry attempt
    async fn on_retry(
        &self,
        attempt: u32,
        error: &OAuth2Error,
        next_delay: Duration,
    ) -> RetryDecision;

    /// Called when all retries are exhausted
    async fn on_exhausted(&self, error: &OAuth2Error, attempts: u32);
}

/// Decision returned by retry hook
pub enum RetryDecision {
    /// Proceed with retry after specified delay
    Retry(Duration),

    /// Abort retrying immediately
    Abort,

    /// Use default behavior
    Default,
}
```

### 10.2 Rate Limiting

#### 10.2.1 Rate Limit Configuration

```rust
/// Rate limit configuration for OAuth2 endpoints
pub struct OAuth2RateLimitConfig {
    /// Token endpoint requests per minute
    pub token_endpoint_rpm: Option<u32>,

    /// Authorization endpoint requests per minute
    pub authorization_endpoint_rpm: Option<u32>,

    /// Device authorization polling minimum interval
    pub device_polling_interval: Duration,

    /// Enable automatic rate limit adjustment
    pub auto_adjust: bool,
}

impl Default for OAuth2RateLimitConfig {
    fn default() -> Self {
        Self {
            token_endpoint_rpm: Some(60),
            authorization_endpoint_rpm: Some(30),
            device_polling_interval: Duration::from_secs(5),
            auto_adjust: true,
        }
    }
}
```

### 10.3 Circuit Breaker

#### 10.3.1 Circuit Breaker Configuration

```rust
/// Circuit breaker configuration for OAuth2
pub struct OAuth2CircuitBreakerConfig {
    /// Failure threshold to open circuit
    pub failure_threshold: u32,

    /// Success threshold to close circuit
    pub success_threshold: u32,

    /// Time window for counting failures
    pub failure_window: Duration,

    /// Time to wait before half-open state
    pub recovery_timeout: Duration,

    /// Separate circuit breakers per endpoint
    pub per_endpoint: bool,
}

impl Default for OAuth2CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            failure_window: Duration::from_secs(60),
            recovery_timeout: Duration::from_secs(30),
            per_endpoint: true,
        }
    }
}
```

---

## 11. Security Handling

### 11.1 Credential Management

#### 11.1.1 Secret Handling

```rust
use secrecy::{ExposeSecret, SecretString, Zeroize};

/// Secure credential wrapper
pub struct OAuth2Credentials {
    /// Client ID (not secret)
    pub client_id: String,

    /// Client secret (secure)
    client_secret: Option<SecretString>,
}

impl OAuth2Credentials {
    /// Get client secret for authentication (internal only)
    pub(crate) fn expose_secret(&self) -> Option<&str> {
        self.client_secret.as_ref().map(|s| s.expose_secret())
    }
}

// Prevent accidental logging
impl std::fmt::Debug for OAuth2Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuth2Credentials")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .finish()
    }
}
```

### 11.2 PKCE Security

| Requirement | Implementation |
|-------------|----------------|
| Verifier length | 43-128 characters (RFC 7636) |
| Character set | Unreserved URI characters (A-Z, a-z, 0-9, -, ., _, ~) |
| Entropy | Cryptographically secure random |
| Challenge method | S256 (SHA-256) by default |
| Verifier storage | Memory only, never persisted |

### 11.3 State Parameter Security

| Requirement | Implementation |
|-------------|----------------|
| Entropy | Minimum 128 bits |
| Uniqueness | Per-request generation |
| Binding | Tied to session/user |
| Validation | Constant-time comparison |
| Expiration | Short-lived (5-10 minutes) |

### 11.4 Token Security

| Requirement | Implementation |
|-------------|----------------|
| Memory protection | `SecretString` with zeroize |
| Storage encryption | AES-256-GCM |
| Transport security | HTTPS only |
| Logging prevention | No token values in logs |
| Display prevention | No Display trait implementation |

### 11.5 TLS Requirements

| Requirement | Implementation |
|-------------|----------------|
| Minimum version | TLS 1.2 |
| Certificate validation | Enabled by default |
| Hostname verification | Required |
| Certificate pinning | Optional configuration |

---

## 12. Telemetry Requirements

### 12.1 Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `oauth2_authorization_requests_total` | Counter | `flow`, `status` | Authorization attempts |
| `oauth2_token_exchanges_total` | Counter | `flow`, `status` | Token exchanges |
| `oauth2_token_refreshes_total` | Counter | `status` | Token refresh attempts |
| `oauth2_token_exchange_duration_seconds` | Histogram | `flow` | Token exchange latency |
| `oauth2_token_refresh_duration_seconds` | Histogram | - | Token refresh latency |
| `oauth2_device_flow_polls_total` | Counter | `status` | Device flow poll attempts |
| `oauth2_tokens_active` | Gauge | `type` | Active tokens (access/refresh) |
| `oauth2_tokens_expired_total` | Counter | `type` | Expired tokens |
| `oauth2_introspection_requests_total` | Counter | `status` | Introspection requests |
| `oauth2_revocation_requests_total` | Counter | `status` | Revocation requests |
| `oauth2_errors_total` | Counter | `error_type` | Error counts |
| `oauth2_circuit_breaker_state` | Gauge | `endpoint` | Circuit state |

### 12.2 Tracing

#### 12.2.1 Span Structure

```
oauth2.flow (root span)
├── oauth2.authorization_url_generation
├── oauth2.state_generation
├── oauth2.pkce_generation (if PKCE)
├── oauth2.token_exchange
│   ├── http.request
│   └── oauth2.token_parse
├── oauth2.token_refresh
│   ├── http.request
│   └── oauth2.token_parse
├── oauth2.token_storage
│   ├── oauth2.encrypt (if encrypted)
│   └── oauth2.write
└── oauth2.token_retrieval
    ├── oauth2.read
    └── oauth2.decrypt (if encrypted)
```

#### 12.2.2 Required Span Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `oauth2.flow` | string | Flow type (authorization_code, client_credentials, etc.) |
| `oauth2.grant_type` | string | Grant type for token requests |
| `oauth2.scopes` | string | Requested scopes |
| `oauth2.provider` | string | Provider identifier |
| `oauth2.token_type` | string | Token type (Bearer, etc.) |
| `oauth2.expires_in` | int | Token lifetime in seconds |
| `http.method` | string | HTTP method |
| `http.status_code` | int | HTTP status code |
| `http.url` | string | Request URL (without credentials) |

### 12.3 Logging

#### 12.3.1 Log Levels

| Level | Use Case |
|-------|----------|
| ERROR | Authorization failures, token exchange failures, security violations |
| WARN | Token expiration, refresh failures, rate limits |
| INFO | Flow start/completion, token refresh success |
| DEBUG | Request/response details (sanitized), state validation |
| TRACE | Full wire-level details (development only) |

#### 12.3.2 Structured Log Fields

```rust
/// Standard log fields for OAuth2 operations
pub struct OAuth2LogContext {
    /// Correlation ID
    pub correlation_id: String,

    /// OAuth2 flow type
    pub flow: String,

    /// Provider identifier
    pub provider: Option<String>,

    /// Client ID (not secret)
    pub client_id: String,

    /// Requested scopes
    pub scopes: Option<String>,

    /// Duration in milliseconds
    pub duration_ms: Option<u64>,

    /// Error code (if error)
    pub error_code: Option<String>,
}
```

---

## 13. Future-Proofing Rules

### 13.1 OAuth 2.1 Compatibility

| OAuth 2.1 Change | Module Support |
|------------------|----------------|
| PKCE required for all public clients | Default enabled |
| Implicit grant removed | Not implemented |
| Resource Owner Password removed | Not implemented |
| Refresh token rotation | Supported |
| Bearer token only in header | Configurable |

### 13.2 Extension Points

| Extension Point | Mechanism |
|-----------------|-----------|
| Custom providers | `ProviderConfig` with all endpoints |
| Custom token storage | Implement `TokenStorage` trait |
| Custom authentication | Implement `ClientAuthMethod` |
| Custom token validation | Implement `TokenValidator` trait |
| JWT signing algorithms | Configurable algorithm list |

### 13.3 Schema Evolution

```rust
/// Response type with forward compatibility
#[derive(Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: SecretString,
    pub token_type: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<SecretString>,
    pub scope: Option<String>,

    /// Capture unknown fields for forward compatibility
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}
```

---

## 14. London-School TDD Principles

### 14.1 Interface-First Design

All public types are defined as traits (Rust) or interfaces (TypeScript) before implementation:

```rust
// Define the interface first
#[async_trait]
pub trait TokenManager: Send + Sync {
    async fn get_access_token(&self) -> Result<AccessToken, OAuth2Error>;
    async fn refresh(&self) -> Result<TokenResponse, OAuth2Error>;
    // ...
}

// Implementation comes after tests are written
pub struct TokenManagerImpl {
    storage: Box<dyn TokenStorage>,
    client: Box<dyn HttpTransport>,
    config: OAuth2Config,
}

#[async_trait]
impl TokenManager for TokenManagerImpl {
    // Implementation
}
```

### 14.2 Mock Boundaries

| Dependency | Mock Strategy |
|------------|---------------|
| HTTP Transport | Mock `HttpTransport` trait |
| Token Storage | Mock `TokenStorage` trait |
| Clock/Time | Mock `TimeProvider` trait |
| Random/PKCE | Mock `RandomProvider` trait |
| JWT Validation | Mock `JwtValidator` trait |

### 14.3 Test Organization

```
tests/
├── unit/
│   ├── authorization_code_test.rs
│   ├── pkce_test.rs
│   ├── client_credentials_test.rs
│   ├── device_flow_test.rs
│   ├── token_manager_test.rs
│   ├── token_storage_test.rs
│   ├── state_validation_test.rs
│   └── error_mapping_test.rs
├── integration/
│   ├── mock_server_test.rs
│   └── provider_compat_test.rs
└── fixtures/
    ├── token_response.json
    ├── error_response.json
    └── discovery_document.json
```

---

## 15. Acceptance Criteria

### 15.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | Authorization code flow completes successfully | Integration test |
| FC-2 | PKCE flow generates valid challenge/verifier | Unit test |
| FC-3 | State parameter validates correctly | Unit test |
| FC-4 | Token exchange returns valid tokens | Integration test |
| FC-5 | Token refresh works with valid refresh token | Integration test |
| FC-6 | Client credentials flow works | Integration test |
| FC-7 | Device authorization flow works | Integration test |
| FC-8 | Token introspection returns correct status | Integration test |
| FC-9 | Token revocation invalidates tokens | Integration test |
| FC-10 | OIDC discovery fetches provider config | Integration test |
| FC-11 | Token storage persists and retrieves tokens | Unit test |
| FC-12 | Automatic token refresh works | Integration test |
| FC-13 | All error types are correctly mapped | Unit test |
| FC-14 | Multiple scopes are properly handled | Unit test |
| FC-15 | Callback parameters are validated | Unit test |

### 15.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | No credentials in logs | Audit, tests |
| NFC-2 | PKCE verifier has sufficient entropy | Unit test |
| NFC-3 | State parameter has sufficient entropy | Unit test |
| NFC-4 | TLS 1.2+ enforced | Configuration |
| NFC-5 | Tokens are zeroized on drop | Memory test |
| NFC-6 | Retry respects backoff | Mock tests |
| NFC-7 | Circuit breaker trips correctly | State tests |
| NFC-8 | All requests traced | Integration tests |
| NFC-9 | Metrics emitted correctly | Integration tests |
| NFC-10 | Test coverage > 80% | Coverage report |

### 15.3 Documentation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| DC-1 | All public APIs documented | Doc coverage |
| DC-2 | Examples for each flow | Doc review |
| DC-3 | Error handling documented | Doc review |
| DC-4 | Security considerations documented | Doc review |
| DC-5 | Provider integration guides | Doc review |

---

## 16. Glossary

| Term | Definition |
|------|------------|
| **Access Token** | Credential for accessing protected resources |
| **Authorization Code** | Temporary code exchanged for tokens |
| **Authorization Server** | Server that issues tokens after authentication |
| **Client Credentials** | client_id and client_secret pair |
| **Confidential Client** | Client that can securely store secrets (server-side) |
| **Device Code** | Code used in device authorization flow |
| **Grant Type** | Method of obtaining authorization (code, client_credentials, etc.) |
| **ID Token** | JWT containing user identity (OIDC) |
| **Introspection** | API to check token validity and metadata |
| **OIDC** | OpenID Connect - identity layer on OAuth2 |
| **PKCE** | Proof Key for Code Exchange - security extension |
| **Public Client** | Client that cannot securely store secrets (SPA, mobile) |
| **Refresh Token** | Long-lived credential for obtaining new access tokens |
| **Resource Owner** | User who authorizes access |
| **Revocation** | Invalidating a token before expiry |
| **Scope** | Permission level requested/granted |
| **State** | CSRF protection parameter |
| **Token Endpoint** | Server endpoint for token exchange |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*This document defines the complete specification for the OAuth2 Authentication Integration Module. The next phase (Pseudocode) will provide algorithmic implementations for each interface defined here.*

# Architecture: Azure Active Directory OAuth2 Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/azure-active-directory`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Module Structure](#4-module-structure)
5. [Component Design](#5-component-design)
6. [Data Flow](#6-data-flow)
7. [Security Architecture](#7-security-architecture)
8. [Deployment Considerations](#8-deployment-considerations)

---

## 1. Architecture Overview

### 1.1 System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────────────────┐    ┌─────────────┐ │
│  │   Services  │───►│  Azure AD OAuth2        │───►│  Azure AD   │ │
│  │  (Consumers)│    │  Integration Module     │    │  (Entra ID) │ │
│  └─────────────┘    │  (Thin Adapter)         │    └─────────────┘ │
│         │           └─────────────────────────┘           │        │
│         │                      │                          │        │
│         │                      ▼                          ▼        │
│         │           ┌─────────────────────┐    ┌─────────────────┐ │
│         │           │   Token Cache       │    │      IMDS       │ │
│         │           │   (In-Memory)       │    │ (Managed Ident.)│ │
│         │           └─────────────────────┘    └─────────────────┘ │
│         ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Shared Primitives                         │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐            │   │
│  │  │Logging │ │Metrics │ │Tracing │ │   Retry    │            │   │
│  │  └────────┘ └────────┘ └────────┘ └────────────┘            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Integration Boundaries

| Boundary | This Module | External |
|----------|-------------|----------|
| App Registration | ✗ | Azure Portal / IaC |
| Tenant Config | ✗ | Azure Portal |
| Token Acquisition | ✓ | - |
| Token Validation | ✓ | - |
| Token Caching | ✓ | - |
| Identity Governance | ✗ | Azure AD |

---

## 2. Design Principles

### 2.1 Thin Adapter Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    Thin Adapter Boundaries                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADAPTER RESPONSIBILITY:              NOT RESPONSIBLE FOR:       │
│  ├── OAuth2 flow execution            ├── App registration       │
│  ├── Token acquisition                ├── Tenant configuration   │
│  ├── Token caching/refresh            ├── Conditional access     │
│  ├── JWT validation                   ├── User provisioning      │
│  ├── PKCE generation                  ├── Group management       │
│  ├── Credential handling              ├── MFA policies           │
│  └── Simulation/replay                └── Identity governance    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Hexagonal Architecture

```
                    ┌─────────────────────────────────┐
                    │         Application Core         │
                    │  ┌───────────────────────────┐  │
     Inbound        │  │     AzureAdClient         │  │        Outbound
      Ports         │  │  ┌─────────────────────┐  │  │         Ports
        │           │  │  │   Token Manager     │  │  │           │
        ▼           │  │  │  - Cache            │  │  │           ▼
  ┌──────────┐      │  │  │  - Refresh          │  │  │     ┌──────────┐
  │ AuthPort │─────►│  │  │  - Validation       │  │  │────►│ HttpPort │
  └──────────┘      │  │  └─────────────────────┘  │  │     └──────────┘
  ┌──────────┐      │  └───────────────────────────┘  │     ┌──────────┐
  │TokenPort │─────►│                                  │────►│ ImdsPort │
  └──────────┘      └─────────────────────────────────┘     └──────────┘
  ┌──────────┐                     │                        ┌──────────┐
  │ValidPort │─────────────────────┘                   ────►│SimulPort │
  └──────────┘                                              └──────────┘
```

---

## 3. C4 Model Diagrams

### 3.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│    ┌──────────────┐         ┌──────────────────────┐                │
│    │  API Gateway │         │   Background Jobs    │                │
│    │   Service    │         │      Service         │                │
│    └──────┬───────┘         └──────────┬───────────┘                │
│           │                            │                             │
│           │    Authenticate/Authorize  │                             │
│           ▼                            ▼                             │
│    ┌────────────────────────────────────────────┐                   │
│    │      Azure AD OAuth2 Integration           │                   │
│    │            [Thin Adapter]                  │                   │
│    └──────────────────┬─────────────────────────┘                   │
│                       │                                              │
│           ┌───────────┴───────────┐                                 │
│           ▼                       ▼                                 │
│    ┌─────────────┐         ┌─────────────┐                          │
│    │  Azure AD   │         │    IMDS     │                          │
│    │  Endpoints  │         │  (Azure)    │                          │
│    └─────────────┘         └─────────────┘                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Azure AD OAuth2 Integration                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   AzureAd       │    │   OAuth Flows   │    │    Token        │ │
│  │    Client       │───►│   Component     │    │   Manager       │ │
│  │                 │    │                 │    │                 │ │
│  │ - Configuration │    │ - Client Creds  │    │ - Cache         │ │
│  │ - Flow dispatch │    │ - Auth Code     │    │ - Refresh       │ │
│  │ - Error handling│    │ - Device Code   │    │ - Validation    │ │
│  └────────┬────────┘    │ - Managed Id    │    │ - JWKS Cache    │ │
│           │             │ - On-Behalf-Of  │    └─────────────────┘ │
│           │             └─────────────────┘                        │
│           ▼                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │     Crypto      │    │   HTTP Layer    │    │   Simulation    │ │
│  │   Component     │    │                 │    │     Layer       │ │
│  │                 │    │                 │    │                 │ │
│  │ - JWT signing   │    │ - Request exec  │    │ - Recording     │ │
│  │ - PKCE gen      │    │ - Retry logic   │    │ - Replay        │ │
│  │ - Cert handling │    │ - TLS           │    │ - Mock tokens   │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AzureAdClient                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                        Client Core                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │   Config    │  │  HTTP Pool  │  │   Flow Dispatcher   │   │   │
│  │  │   Manager   │  │   Manager   │  │                     │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│          ┌───────────────────┼───────────────────┐                  │
│          ▼                   ▼                   ▼                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│  │ OAuth Flows  │   │   Token Mgr  │   │    Crypto        │        │
│  │ ┌──────────┐ │   │ ┌──────────┐ │   │  ┌────────────┐  │        │
│  │ │ Client   │ │   │ │  Cache   │ │   │  │ JWT Engine │  │        │
│  │ │  Creds   │ │   │ └──────────┘ │   │  └────────────┘  │        │
│  │ └──────────┘ │   │ ┌──────────┐ │   │  ┌────────────┐  │        │
│  │ ┌──────────┐ │   │ │ Refresh  │ │   │  │   PKCE     │  │        │
│  │ │Auth Code │ │   │ └──────────┘ │   │  └────────────┘  │        │
│  │ └──────────┘ │   │ ┌──────────┐ │   │  ┌────────────┐  │        │
│  │ ┌──────────┐ │   │ │Validator │ │   │  │ Cert Load  │  │        │
│  │ │Device Cd │ │   │ └──────────┘ │   │  └────────────┘  │        │
│  │ └──────────┘ │   │ ┌──────────┐ │   └──────────────────┘        │
│  │ ┌──────────┐ │   │ │JWKS Cache│ │                               │
│  │ │Managed Id│ │   │ └──────────┘ │                               │
│  │ └──────────┘ │   └──────────────┘                               │
│  └──────────────┘                                                   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Simulation Layer                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │  Recorder   │  │   Replayer  │  │  Mock Token Gen     │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

### 4.1 Rust Module Layout

```
azure-active-directory/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   ├── client.rs              # AzureAdClient implementation
│   ├── config.rs              # Configuration and builder
│   │
│   ├── flows/
│   │   ├── mod.rs             # Flow module exports
│   │   ├── client_credentials.rs
│   │   ├── authorization_code.rs
│   │   ├── device_code.rs
│   │   ├── managed_identity.rs
│   │   └── on_behalf_of.rs
│   │
│   ├── token/
│   │   ├── mod.rs             # Token module exports
│   │   ├── cache.rs           # In-memory token cache
│   │   ├── refresh.rs         # Token refresh logic
│   │   ├── validation.rs      # JWT validation
│   │   └── jwks.rs            # JWKS fetching/caching
│   │
│   ├── crypto/
│   │   ├── mod.rs             # Crypto module exports
│   │   ├── jwt.rs             # JWT creation/parsing
│   │   ├── pkce.rs            # PKCE challenge/verifier
│   │   └── certificate.rs     # Certificate loading
│   │
│   ├── simulation/
│   │   ├── mod.rs             # Simulation exports
│   │   ├── layer.rs           # Simulation interceptor
│   │   ├── recorder.rs        # Recording logic
│   │   ├── replayer.rs        # Replay logic
│   │   └── storage.rs         # Persistence
│   │
│   ├── types/
│   │   ├── mod.rs             # Type exports
│   │   ├── token.rs           # AccessToken, TokenResponse
│   │   ├── claims.rs          # TokenClaims
│   │   ├── request.rs         # Request params
│   │   └── credential.rs      # Credential types
│   │
│   └── error.rs               # Error definitions
│
└── tests/
    ├── flows/
    │   ├── client_credentials_test.rs
    │   ├── auth_code_test.rs
    │   └── device_code_test.rs
    ├── token/
    │   ├── cache_test.rs
    │   └── validation_test.rs
    └── simulation/
        └── replay_test.rs
```

### 4.2 TypeScript Module Layout

```
azure-active-directory/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Public exports
│   ├── client.ts              # AzureAdClient
│   ├── config.ts              # Configuration
│   │
│   ├── flows/
│   │   ├── index.ts
│   │   ├── client-credentials.ts
│   │   ├── authorization-code.ts
│   │   ├── device-code.ts
│   │   └── managed-identity.ts
│   │
│   ├── token/
│   │   ├── index.ts
│   │   ├── cache.ts
│   │   ├── refresh.ts
│   │   └── validation.ts
│   │
│   ├── crypto/
│   │   ├── index.ts
│   │   ├── jwt.ts
│   │   └── pkce.ts
│   │
│   ├── simulation/
│   │   ├── index.ts
│   │   ├── layer.ts
│   │   └── storage.ts
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── token.ts
│   │   └── claims.ts
│   │
│   └── error.ts
│
└── tests/
    ├── client-credentials.test.ts
    ├── token-cache.test.ts
    └── simulation.test.ts
```

---

## 5. Component Design

### 5.1 OAuth Flow Component

```
┌─────────────────────────────────────────────────────────────────┐
│                      OAuth Flow Component                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Flow Selection (based on CredentialType):                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  CredentialType::ClientSecret                           │    │
│  │  └──► ClientCredentialsFlow (secret)                    │    │
│  │                                                          │    │
│  │  CredentialType::Certificate                            │    │
│  │  └──► ClientCredentialsFlow (JWT assertion)             │    │
│  │                                                          │    │
│  │  CredentialType::ManagedIdentity                        │    │
│  │  └──► ManagedIdentityFlow (IMDS)                        │    │
│  │                                                          │    │
│  │  CredentialType::None (Public Client)                   │    │
│  │  └──► AuthorizationCodeFlow (PKCE required)             │    │
│  │  └──► DeviceCodeFlow                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Common Flow Interface:                                          │
│  trait OAuthFlow {                                               │
│      async fn acquire_token(&self, scopes: &[&str])             │
│          -> Result<AccessToken, AzureAdError>;                  │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Token Manager Component

```
┌─────────────────────────────────────────────────────────────────┐
│                     Token Manager Component                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Responsibilities:                                               │
│  ├── Token caching (in-memory, thread-safe)                      │
│  ├── Automatic refresh (5 min before expiry)                     │
│  ├── JWT validation (signature, claims)                          │
│  └── JWKS caching (24h TTL, background refresh)                  │
│                                                                  │
│  Cache Key Structure:                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  {tenant_id}:{client_id}:{flow_type}:{sorted_scopes}    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Token Lifecycle:                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Request ──► Cache Hit? ──► Return Cached               │    │
│  │                 │                                        │    │
│  │                 ▼ (miss or expiring)                     │    │
│  │           Has Refresh Token? ──► Refresh                 │    │
│  │                 │                                        │    │
│  │                 ▼ (no)                                   │    │
│  │           Acquire New Token ──► Cache ──► Return         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Simulation Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                       Simulation Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Modes:                                                          │
│  ├── Disabled: Pass-through to real Azure AD                     │
│  ├── Recording: Capture and store interactions                   │
│  └── Replay: Return recorded responses                           │
│                                                                  │
│  Recording Flow:                                                 │
│  1. Intercept token request                                      │
│  2. Execute against real Azure AD                                │
│  3. Capture response + generate mock token template              │
│  4. Store interaction with sanitized secrets                     │
│                                                                  │
│  Replay Flow:                                                    │
│  1. Intercept token request                                      │
│  2. Generate matching key (flow + scopes)                        │
│  3. Lookup recorded interaction                                  │
│  4. Generate fresh mock token (current timestamps)               │
│  5. Return without network call                                  │
│                                                                  │
│  Mock Token Generation:                                          │
│  ├── Unique token string per request                             │
│  ├── Fresh exp/iat/nbf timestamps                                │
│  ├── Preserved claims structure from recording                   │
│  └── Valid JWT format (but not cryptographically valid)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow

### 6.1 Client Credentials Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  Client Credentials Data Flow                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  With Client Secret:                                             │
│                                                                  │
│  App ──► Check Cache ──► Cache Miss ──► Build Request            │
│                                              │                   │
│                    ┌─────────────────────────┘                   │
│                    ▼                                             │
│            POST /token                                           │
│            grant_type=client_credentials                         │
│            client_id=xxx                                         │
│            client_secret=xxx                                     │
│            scope=xxx                                             │
│                    │                                             │
│                    ▼                                             │
│            Azure AD ──► Token Response ──► Cache ──► Return      │
│                                                                  │
│  With Certificate:                                               │
│                                                                  │
│  App ──► Load Cert ──► Build JWT Assertion ──► Build Request     │
│                                                      │           │
│                    ┌─────────────────────────────────┘           │
│                    ▼                                             │
│            POST /token                                           │
│            grant_type=client_credentials                         │
│            client_id=xxx                                         │
│            client_assertion_type=jwt-bearer                      │
│            client_assertion={signed_jwt}                         │
│            scope=xxx                                             │
│                    │                                             │
│                    ▼                                             │
│            Azure AD ──► Token Response ──► Cache ──► Return      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Authorization Code Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  Authorization Code Data Flow                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Generate Authorization URL                              │
│                                                                  │
│  App ──► Generate PKCE ──► Generate State ──► Build URL          │
│                                                      │           │
│                    ┌─────────────────────────────────┘           │
│                    ▼                                             │
│            /authorize?client_id=xxx                              │
│                      &response_type=code                         │
│                      &redirect_uri=xxx                           │
│                      &scope=xxx                                  │
│                      &state=xxx                                  │
│                      &code_challenge=xxx                         │
│                      &code_challenge_method=S256                 │
│                                                                  │
│  Step 2: User Login (Browser)                                    │
│                                                                  │
│  User ──► Azure AD Login ──► Consent ──► Redirect with Code      │
│                                                                  │
│  Step 3: Exchange Code for Token                                 │
│                                                                  │
│  App ──► Validate State ──► Exchange Code                        │
│                                  │                               │
│                    ┌─────────────┘                               │
│                    ▼                                             │
│            POST /token                                           │
│            grant_type=authorization_code                         │
│            code=xxx                                              │
│            redirect_uri=xxx                                      │
│            code_verifier=xxx                                     │
│                    │                                             │
│                    ▼                                             │
│            Azure AD ──► Token Response                           │
│                         (access_token, refresh_token, id_token)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Managed Identity Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   Managed Identity Data Flow                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  System-Assigned Identity:                                       │
│                                                                  │
│  App ──► Check Cache ──► Cache Miss ──► Query IMDS               │
│                                              │                   │
│                    ┌─────────────────────────┘                   │
│                    ▼                                             │
│            GET http://169.254.169.254/metadata/identity/         │
│                oauth2/token?api-version=2019-08-01               │
│                            &resource=https://xxx/                │
│            Header: Metadata: true                                │
│                    │                                             │
│                    ▼                                             │
│            IMDS ──► Token Response ──► Cache ──► Return          │
│                                                                  │
│  User-Assigned Identity:                                         │
│                                                                  │
│  App ──► Query IMDS with client_id                               │
│                    │                                             │
│                    ▼                                             │
│            GET ...&client_id={user_assigned_client_id}           │
│                    │                                             │
│                    ▼                                             │
│            IMDS ──► Token Response ──► Cache ──► Return          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

### 7.1 Credential Protection

```
┌─────────────────────────────────────────────────────────────────┐
│                    Credential Protection                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Secret Handling:                                                │
│  ├── SecretString type (zeroized on drop)                        │
│  ├── Never logged (redacted in debug output)                     │
│  ├── Never serialized to disk                                    │
│  └── Minimal lifetime in memory                                  │
│                                                                  │
│  Certificate Handling:                                           │
│  ├── Private key never extracted after loading                   │
│  ├── Signing operations use key in-place                         │
│  ├── Password zeroized after decryption                          │
│  └── Certificate thumbprint for identification                   │
│                                                                  │
│  Token Handling:                                                 │
│  ├── In-memory cache only (no disk persistence)                  │
│  ├── Tokens redacted in logs                                     │
│  ├── Cache cleared on client drop                                │
│  └── Thread-safe access (RwLock)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Security Controls

```
┌─────────────────────────────────────────────────────────────────┐
│                      Security Controls                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Transport Security:                                             │
│  ├── TLS 1.2+ required for all Azure AD endpoints                │
│  ├── Certificate validation enabled                              │
│  └── No HTTP fallback                                            │
│                                                                  │
│  OAuth2 Security:                                                │
│  ├── PKCE required for authorization code flow                   │
│  ├── State parameter for CSRF protection                         │
│  ├── Nonce for ID token replay protection                        │
│  └── Audience validation on token receipt                        │
│                                                                  │
│  Token Validation:                                               │
│  ├── Signature verification (RS256/RS384/RS512)                  │
│  ├── Issuer validation (tenant-specific)                         │
│  ├── Audience validation                                         │
│  ├── Expiration check                                            │
│  └── Not-before check                                            │
│                                                                  │
│  Simulation Security:                                            │
│  ├── Secrets redacted in recordings                              │
│  ├── Mock tokens clearly marked                                  │
│  └── Recording files should not be committed                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Considerations

### 8.1 Environment Configuration

```
┌─────────────────────────────────────────────────────────────────┐
│                  Environment Configuration                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Required Environment Variables:                                 │
│  ├── AZURE_TENANT_ID: Azure AD tenant ID                         │
│  └── AZURE_CLIENT_ID: Application (client) ID                    │
│                                                                  │
│  Credential Options (one required):                              │
│  ├── AZURE_CLIENT_SECRET: Client secret                          │
│  ├── AZURE_CLIENT_CERTIFICATE_PATH: Path to cert file            │
│  │   └── AZURE_CLIENT_CERTIFICATE_PASSWORD: Cert password        │
│  └── AZURE_USE_MANAGED_IDENTITY: Enable managed identity         │
│      └── AZURE_MANAGED_IDENTITY_CLIENT_ID: For user-assigned     │
│                                                                  │
│  Optional Configuration:                                         │
│  ├── AZURE_AUTHORITY_HOST: Override login.microsoftonline.com    │
│  ├── AZURE_AD_CACHE_ENABLED: Enable/disable token cache          │
│  └── AZURE_AD_SIMULATION_MODE: recording/replay/disabled         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Deployment Scenarios

```
┌─────────────────────────────────────────────────────────────────┐
│                    Deployment Scenarios                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Azure Kubernetes Service (AKS):                                 │
│  ├── Use Workload Identity (federated credentials)               │
│  ├── Mount service account token                                 │
│  └── AZURE_FEDERATED_TOKEN_FILE env var                          │
│                                                                  │
│  Azure VMs / App Service:                                        │
│  ├── Use System-Assigned Managed Identity                        │
│  ├── No secrets to manage                                        │
│  └── Automatic token refresh                                     │
│                                                                  │
│  On-Premises / Other Cloud:                                      │
│  ├── Use Service Principal with secret or certificate            │
│  ├── Certificate preferred for production                        │
│  └── Secret rotation strategy required                           │
│                                                                  │
│  CI/CD Pipeline:                                                 │
│  ├── Use Simulation mode with recordings                         │
│  ├── No Azure AD dependency in tests                             │
│  └── Mock tokens for integration tests                           │
│                                                                  │
│  Local Development:                                              │
│  ├── Azure CLI credential (az login)                             │
│  ├── VS Code Azure extension                                     │
│  └── Recording mode for fixture generation                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 High Availability

```
┌─────────────────────────────────────────────────────────────────┐
│                     High Availability                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Token Cache:                                                    │
│  ├── In-memory (per-instance)                                    │
│  ├── Thread-safe concurrent access                               │
│  └── No cross-instance sharing (stateless)                       │
│                                                                  │
│  Retry Strategy:                                                 │
│  ├── Exponential backoff (1s, 2s, 4s)                            │
│  ├── Max 3 retries for transient errors                          │
│  └── Immediate fail for auth errors                              │
│                                                                  │
│  Failover:                                                       │
│  ├── Azure AD is globally distributed                            │
│  ├── Regional failover handled by Azure                          │
│  └── IMDS is VM-local (no network dependency)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AZURE-AD-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*SPARC Phase 3 Complete - Proceed to Refinement phase with "Next phase."*

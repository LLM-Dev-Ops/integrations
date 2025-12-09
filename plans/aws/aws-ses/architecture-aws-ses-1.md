# AWS SES Integration Module - Architecture (Part 1)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-ses`
**Part:** 1 of 2 - System Design & Component Architecture

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [C4 Model Diagrams](#2-c4-model-diagrams)
3. [Component Architecture](#3-component-architecture)
4. [Service Layer Design](#4-service-layer-design)
5. [Data Flow Architecture](#5-data-flow-architecture)
6. [Dependency Injection & Testability](#6-dependency-injection--testability)

---

## 1. Architecture Overview

### 1.1 Architectural Style

The AWS SES Integration Module follows a **Hexagonal Architecture** (Ports and Adapters) combined with **Clean Architecture** principles, enabling:

- **Testability**: All external dependencies accessed through interfaces (ports)
- **Flexibility**: Easy swapping of implementations (adapters)
- **Separation of Concerns**: Clear boundaries between business logic and infrastructure
- **London-School TDD**: Interface-first design enabling mock-based testing

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Consumer Applications                            │
│                    (LLM Services, Notification Systems, etc.)            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      AWS SES Integration Module                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Public API Layer                             │   │
│  │  SesClient │ EmailsService │ TemplatesService │ IdentitiesService│   │
│  │            │ ConfigSetsService │ SuppressionService │ AccountSvc │   │
│  │            │ ContactListsService │ ContactsService                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Application Services Layer                     │   │
│  │  Request Building │ Response Parsing │ Error Mapping │ Signing  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Domain Layer (Ports)                          │   │
│  │  HttpTransport │ AwsSigner │ CredentialsProvider │ JsonParser   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                Infrastructure Layer (Adapters)                   │   │
│  │  ReqwestTransport │ SigV4Signer │ ChainCredentials │ SerdeJson  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Integration Repo Primitives                           │
│  integrations-errors │ integrations-retry │ integrations-circuit-breaker│
│  integrations-rate-limit │ integrations-tracing │ integrations-logging  │
│  integrations-types │ integrations-config                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS SES v2 Service                               │
│              (REST API over HTTPS with Signature V4)                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Design Principles

| Principle | Application |
|-----------|-------------|
| **Single Responsibility** | Each service handles one domain (Emails, Templates, Identities, etc.) |
| **Open/Closed** | New operations added via trait extension, not modification |
| **Liskov Substitution** | All trait implementations interchangeable |
| **Interface Segregation** | Small, focused traits (EmailsService vs TemplatesService) |
| **Dependency Inversion** | High-level modules depend on abstractions (traits) |
| **Composition over Inheritance** | Services composed from injected dependencies |

### 1.4 Module Boundaries

```
integrations/aws-ses/
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client/
│   │   ├── mod.rs                # SesClient trait and builder
│   │   ├── config.rs             # Configuration types
│   │   └── factory.rs            # Client factory implementation
│   ├── services/
│   │   ├── mod.rs                # Service exports
│   │   ├── emails.rs             # EmailsService implementation
│   │   ├── templates.rs          # TemplatesService implementation
│   │   ├── identities.rs         # IdentitiesService implementation
│   │   ├── config_sets.rs        # ConfigSetsService implementation
│   │   ├── event_destinations.rs # EventDestinationsService
│   │   ├── suppression.rs        # SuppressionService implementation
│   │   ├── contact_lists.rs      # ContactListsService implementation
│   │   ├── contacts.rs           # ContactsService implementation
│   │   └── account.rs            # AccountService implementation
│   ├── transport/
│   │   ├── mod.rs                # HttpTransport trait
│   │   ├── reqwest.rs            # Reqwest implementation
│   │   └── request.rs            # Request builder
│   ├── signing/
│   │   ├── mod.rs                # AwsSigner trait
│   │   └── sigv4.rs              # Signature V4 implementation
│   ├── credentials/
│   │   ├── mod.rs                # CredentialsProvider trait
│   │   ├── chain.rs              # Chain provider
│   │   ├── env.rs                # Environment provider
│   │   ├── profile.rs            # Profile provider
│   │   ├── imds.rs               # Instance metadata provider
│   │   └── static.rs             # Static provider
│   ├── types/
│   │   ├── mod.rs                # Type exports
│   │   ├── email.rs              # Email message types
│   │   ├── template.rs           # Template types
│   │   ├── identity.rs           # Identity types
│   │   ├── config_set.rs         # Configuration set types
│   │   ├── suppression.rs        # Suppression types
│   │   ├── contact.rs            # Contact types
│   │   └── common.rs             # Shared types
│   └── error/
│       ├── mod.rs                # Error types
│       └── mapping.rs            # Error code mapping
├── tests/
│   ├── unit/                     # Unit tests with mocks
│   ├── integration/              # Integration tests
│   └── fixtures/                 # Test fixtures
└── Cargo.toml
```

---

## 2. C4 Model Diagrams

### 2.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              System Context                              │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────┐
                    │    Notification System    │
                    │    (System Consumer)      │
                    └─────────────┬─────────────┘
                                  │
                                  │ Uses
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    AWS SES Integration Module                           │
│                                                                         │
│    Provides type-safe, production-ready interface to AWS SES v2 with    │
│    built-in resilience, observability, and security features            │
│                                                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │    AWS SES v2     │   │  AWS IAM/STS      │
        │    Service        │   │  (Credentials)    │
        │  [External]       │   │  [External]       │
        └───────────────────┘   └───────────────────┘
```

### 2.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Container Diagram                              │
│                      AWS SES Integration Module                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         Integration Module                               │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │   SES Client    │  │  Service Layer  │  │  Resilience     │        │
│  │   [Component]   │  │  [Component]    │  │  [Component]    │        │
│  │                 │  │                 │  │                 │        │
│  │ Entry point for │  │ Domain services │  │ Retry, CB, RL   │        │
│  │ all SES ops     │  │ for SES entities│  │ orchestration   │        │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │
│           │                    │                    │                  │
│           └────────────────────┼────────────────────┘                  │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Infrastructure Layer                          │   │
│  │                                                                   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │   │
│  │  │  Transport  │ │   Signer    │ │ Credentials │ │    JSON    │ │   │
│  │  │  [Adapter]  │ │  [Adapter]  │ │  [Adapter]  │ │ [Adapter]  │ │   │
│  │  │             │ │             │ │             │ │            │ │   │
│  │  │ HTTP/HTTPS  │ │  AWS SigV4  │ │ Multi-source│ │ Serde JSON │ │   │
│  │  │ via Reqwest │ │  signing    │ │ credential  │ │ parser     │ │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └────────────┘ │   │
│  │         │               │               │                        │   │
│  └─────────┼───────────────┼───────────────┼────────────────────────┘   │
│            │               │               │                            │
└────────────┼───────────────┼───────────────┼────────────────────────────┘
             │               │               │
             ▼               ▼               ▼
     ┌───────────────┐ ┌───────────┐ ┌─────────────────┐
     │   AWS SES v2  │ │  (Local)  │ │  AWS IAM/STS    │
     │   REST API    │ │  Signing  │ │  IMDS/Profile   │
     └───────────────┘ └───────────┘ └─────────────────┘
```

### 2.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Component Diagram                               │
│                        Service Layer Detail                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            SesClient                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         SesClientImpl                             │   │
│  │  - config: SesConfig                                              │   │
│  │  - transport: Arc<dyn HttpTransport>                              │   │
│  │  - signer: Arc<dyn AwsSigner>                                     │   │
│  │  - credentials: Arc<dyn CredentialsProvider>                      │   │
│  │  - resilience: Arc<ResilienceOrchestrator>                        │   │
│  │  - logger: Arc<dyn Logger>                                        │   │
│  │  - tracer: Arc<dyn Tracer>                                        │   │
│  │  - emails_service: OnceCell<EmailsServiceImpl>          ◇───────┐│   │
│  │  - templates_service: OnceCell<TemplatesServiceImpl>    ◇───────┤│   │
│  │  - identities_service: OnceCell<IdentitiesServiceImpl>  ◇───────┤│   │
│  │  - config_sets_service: OnceCell<ConfigSetsServiceImpl> ◇───────┤│   │
│  │  - suppression_service: OnceCell<SuppressionServiceImpl>◇───────┤│   │
│  │  - contact_lists_service: OnceCell<ContactListsSvcImpl> ◇───────┤│   │
│  │  - contacts_service: OnceCell<ContactsServiceImpl>      ◇───────┤│   │
│  │  - account_service: OnceCell<AccountServiceImpl>        ◇───────┘│   │
│  │  + emails() -> &dyn EmailsService                                 │   │
│  │  + templates() -> &dyn TemplatesService                           │   │
│  │  + identities() -> &dyn IdentitiesService                         │   │
│  │  + config_sets() -> &dyn ConfigSetsService                        │   │
│  │  + suppression() -> &dyn SuppressionService                       │   │
│  │  + contact_lists() -> &dyn ContactListsService                    │   │
│  │  + contacts() -> &dyn ContactsService                             │   │
│  │  + account() -> &dyn AccountService                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ provides access to
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Service Components                              │
│                                                                         │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│  │  EmailsService     │  │  TemplatesService  │  │IdentitiesService │  │
│  │                    │  │                    │  │                  │  │
│  │  + send()          │  │  + create()        │  │  + create()      │  │
│  │  + send_bulk()     │  │  + get()           │  │  + get()         │  │
│  │                    │  │  + update()        │  │  + delete()      │  │
│  │                    │  │  + delete()        │  │  + list()        │  │
│  │                    │  │  + list()          │  │  + put_dkim()    │  │
│  │                    │  │  + list_all()      │  │  + put_mail_from()│  │
│  └────────────────────┘  └────────────────────┘  └──────────────────┘  │
│                                                                         │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│  │  ConfigSetsService │  │SuppressionService  │  │ContactListsService│ │
│  │                    │  │                    │  │                  │  │
│  │  + create()        │  │  + put()           │  │  + create()      │  │
│  │  + get()           │  │  + get()           │  │  + get()         │  │
│  │  + delete()        │  │  + delete()        │  │  + update()      │  │
│  │  + list()          │  │  + list()          │  │  + delete()      │  │
│  │  + put_options()   │  │  + list_all()      │  │  + list()        │  │
│  └────────────────────┘  └────────────────────┘  └──────────────────┘  │
│                                                                         │
│  ┌────────────────────┐  ┌────────────────────┐                        │
│  │  ContactsService   │  │  AccountService    │                        │
│  │                    │  │                    │                        │
│  │  + create()        │  │  + get()           │                        │
│  │  + get()           │  │  + put_sending()   │                        │
│  │  + update()        │  │  + put_suppression()                        │
│  │  + delete()        │  │  + put_details()   │                        │
│  │  + list()          │  │                    │                        │
│  │  + list_all()      │  │                    │                        │
│  └────────────────────┘  └────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ uses
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Infrastructure Components                           │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       <<interface>>                                │ │
│  │                       HttpTransport                                │ │
│  │  + send(request: HttpRequest) -> Result<HttpResponse>              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              △                                          │
│                              │ implements                               │
│                              │                                          │
│  ┌───────────────────────────┴───────────────────────────────────────┐ │
│  │                    ReqwestHttpTransport                            │ │
│  │  - client: reqwest::Client                                         │ │
│  │  - config: HttpTransportConfig                                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       <<interface>>                                │ │
│  │                        AwsSigner                                   │ │
│  │  + sign_request(request, payload_hash, timestamp)                  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              △                                          │
│                              │ implements                               │
│                              │                                          │
│  ┌───────────────────────────┴───────────────────────────────────────┐ │
│  │                     AwsSignerV4Impl                                │ │
│  │  - region: String                                                  │ │
│  │  - service: String ("ses")                                         │ │
│  │  - credentials_provider: Arc<dyn CredentialsProvider>              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       <<interface>>                                │ │
│  │                    CredentialsProvider                             │ │
│  │  + get_credentials() -> Result<AwsCredentials>                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              △                                          │
│          ┌───────────────────┼───────────────────┐                     │
│          │                   │                   │                     │
│  ┌───────┴───────┐  ┌────────┴────────┐  ┌──────┴──────┐              │
│  │ ChainProvider │  │  EnvProvider    │  │ IMDSProvider│              │
│  └───────────────┘  └─────────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Code Diagram (Level 4) - Email Send Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Email Send Request Flow                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  SendEmailRequest│
│  - from_address  │
│  - destination   │
│  - content       │
│  - reply_to      │
│  - config_set    │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    EmailsService.send()                               │
├──────────────────────────────────────────────────────────────────────┤
│  1. Validate request                                                  │
│     - Verify from_address is set                                      │
│     - Verify at least one recipient                                   │
│     - Verify content (simple or raw or template)                      │
│                                                                       │
│  2. Build HTTP Request                                                │
│     ┌─────────────────────────────────────────────────────────────┐   │
│     │  POST /v2/email/outbound-emails                              │   │
│     │  Host: email.{region}.amazonaws.com                          │   │
│     │  Content-Type: application/json                              │   │
│     │                                                              │   │
│     │  {                                                           │   │
│     │    "FromEmailAddress": "sender@example.com",                 │   │
│     │    "Destination": {                                          │   │
│     │      "ToAddresses": ["to@example.com"],                      │   │
│     │      "CcAddresses": [],                                      │   │
│     │      "BccAddresses": []                                      │   │
│     │    },                                                        │   │
│     │    "Content": {                                              │   │
│     │      "Simple": {                                             │   │
│     │        "Subject": { "Data": "Subject", "Charset": "UTF-8" }, │   │
│     │        "Body": { "Text": {...}, "Html": {...} }              │   │
│     │      }                                                       │   │
│     │    }                                                         │   │
│     │  }                                                           │   │
│     └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  3. Execute with resilience                                           │
│     resilience.execute("SendEmail", || async {                        │
│         // Sign request                                               │
│         let signed = signer.sign_request(request, payload_hash)?;     │
│         // Add x-amz-date, Authorization headers                      │
│         // Send request                                               │
│         let response = transport.send(signed).await?;                 │
│         // Parse response                                             │
│         parse_send_email_response(response)                           │
│     }).await                                                          │
│                                                                       │
│  4. Return result                                                     │
│     Ok(SendEmailOutput { message_id: "..." })                         │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  SendEmailOutput │
│  - message_id    │
└──────────────────┘
```

---

## 3. Component Architecture

### 3.1 Client Component

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SesClient Component                               │
└─────────────────────────────────────────────────────────────────────────┘

                           <<interface>>
                    ┌──────────────────────┐
                    │      SesClient       │
                    ├──────────────────────┤
                    │ + emails()           │
                    │ + templates()        │
                    │ + identities()       │
                    │ + config_sets()      │
                    │ + suppression()      │
                    │ + contact_lists()    │
                    │ + contacts()         │
                    │ + account()          │
                    └──────────┬───────────┘
                               △
                               │ implements
                               │
                    ┌──────────┴───────────┐
                    │    SesClientImpl     │
                    ├──────────────────────┤
                    │ - config             │
                    │ - transport          │
                    │ - signer             │
                    │ - credentials        │
                    │ - resilience         │
                    │ - logger             │
                    │ - tracer             │
                    │ - emails_service     │◇───────┐
                    │ - templates_service  │◇───────┤
                    │ - identities_service │◇───────┤  lazy init
                    │ - config_sets_service│◇───────┤  (OnceCell)
                    │ - suppression_service│◇───────┤
                    │ - contact_lists_svc  │◇───────┤
                    │ - contacts_service   │◇───────┤
                    │ - account_service    │◇───────┘
                    └──────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
│ EmailsServiceImpl │ │TemplatesSvc  │ │IdentitiesService │
└───────────────────┘ │     Impl     │ │      Impl        │
                      └───────────────┘ └───────────────────┘

Builder Pattern:
┌─────────────────────────────────────────────────────────────────────────┐
│  SesClientBuilder                                                        │
│                                                                         │
│  SesClient::builder()                                                   │
│    .region("us-east-1")                                                 │
│    .credentials_provider(ChainCredentialsProvider::default())           │
│    .endpoint(custom_endpoint)      // Optional: LocalStack              │
│    .timeout(Duration::from_secs(30))                                    │
│    .max_retries(3)                                                      │
│    .retry_config(RetryConfig { ... })                                   │
│    .circuit_breaker_config(CircuitBreakerConfig { ... })                │
│    .rate_limit_config(RateLimitConfig { ... })                          │
│    .build()?                                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Service Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Service Component Pattern                            │
└─────────────────────────────────────────────────────────────────────────┘

Each service follows the same structural pattern:

┌─────────────────────────────────────────────────────────────────────────┐
│                      ServiceImpl Template                                │
├─────────────────────────────────────────────────────────────────────────┤
│  struct ServiceImpl {                                                    │
│      config: SesConfig,                   // Configuration               │
│      transport: Arc<dyn HttpTransport>,   // HTTP client                 │
│      signer: Arc<dyn AwsSigner>,          // Request signing             │
│      resilience: Arc<ResilienceOrchestrator>, // Retry + CB + RL         │
│      logger: Arc<dyn Logger>,             // Structured logging          │
│      tracer: Arc<dyn Tracer>,             // Distributed tracing         │
│      endpoint: String,                    // API endpoint                │
│  }                                                                       │
│                                                                         │
│  impl Service for ServiceImpl {                                          │
│      async fn operation(&self, request: Request) -> Result<Response> {   │
│          // 1. Create tracing span                                       │
│          let span = tracer.start_span("ses.Operation", { ... });         │
│                                                                         │
│          // 2. Validate input                                            │
│          validate(&request)?;                                            │
│                                                                         │
│          // 3. Build HTTP request                                        │
│          let http_request = build_request(&request)?;                    │
│                                                                         │
│          // 4. Execute with resilience                                   │
│          let result = resilience.execute("Operation", || async {         │
│              // Sign request                                             │
│              let signed = signer.sign_request(...)?;                     │
│              // Send request                                             │
│              let response = transport.send(signed).await?;               │
│              // Parse response                                           │
│              parse_response(response)                                    │
│          }, &span).await;                                                │
│                                                                         │
│          // 5. End span and return                                       │
│          span.end();                                                     │
│          result                                                          │
│      }                                                                   │
│  }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Resilience Component

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Resilience Architecture                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      ResilienceOrchestrator                              │
├─────────────────────────────────────────────────────────────────────────┤
│  struct ResilienceOrchestrator {                                         │
│      transport: Arc<dyn HttpTransport>,                                  │
│      retry_executor: Arc<RetryExecutor>,      // From integrations-retry │
│      circuit_breaker: Arc<CircuitBreaker>,    // From integrations-cb    │
│      rate_limiter: Option<Arc<RateLimiter>>,  // From integrations-rl    │
│      logger: Arc<dyn Logger>,                                            │
│      tracer: Arc<dyn Tracer>,                                            │
│  }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ execute()
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Execution Flow                                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. CHECK CIRCUIT BREAKER                                         │   │
│  │    if circuit_breaker.is_open() {                                │   │
│  │        return Err(CircuitOpen)                                   │   │
│  │    }                                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 2. ACQUIRE RATE LIMIT PERMIT                                     │   │
│  │    if let Some(limiter) = rate_limiter {                         │   │
│  │        limiter.acquire().await?                                  │   │
│  │    }                                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 3. EXECUTE WITH RETRY                                            │   │
│  │    retry_executor.execute(|| async {                             │   │
│  │        // Re-check circuit breaker                               │   │
│  │        // Execute operation                                      │   │
│  │        // Record success/failure to circuit breaker              │   │
│  │    }).await                                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 4. RECORD RESULT IN SPAN                                         │   │
│  │    span.record("status", result.is_ok())                         │   │
│  │    span.record("error", result.err())                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

Circuit Breaker State Machine:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│       ┌──────────┐    failures >= threshold    ┌──────────┐            │
│       │  CLOSED  │ ──────────────────────────► │   OPEN   │            │
│       │(Normal)  │                              │(Failing) │            │
│       └────┬─────┘                              └────┬─────┘            │
│            │                                         │                  │
│            │ success                    reset_timeout elapsed           │
│            │                                         │                  │
│            │         ┌───────────────┐               │                  │
│            │         │  HALF_OPEN    │◄──────────────┘                  │
│            │         │  (Testing)    │                                  │
│            │         └───────┬───────┘                                  │
│            │                 │                                          │
│            │     ┌───────────┴───────────┐                              │
│            │     │                       │                              │
│            │  success >= threshold    any failure                       │
│            │     │                       │                              │
│            ▼     ▼                       ▼                              │
│       ┌──────────┐                  ┌──────────┐                        │
│       │  CLOSED  │                  │   OPEN   │                        │
│       └──────────┘                  └──────────┘                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Service Layer Design

### 4.1 Emails Service Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     EmailsService Architecture                           │
└─────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────┐
│                          EmailsService                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ + send(request: SendEmailRequest) -> Result<SendEmailOutput>            │
│ + send_bulk(request: SendBulkEmailRequest) -> Result<SendBulkOutput>    │
└─────────────────────────────────────────────────────────────────────────┘

Implementation Structure:
┌─────────────────────────────────────────────────────────────────────────┐
│                       EmailsServiceImpl                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ Dependencies:                                                            │
│  - config: SesConfig                                                     │
│  - transport: Arc<dyn HttpTransport>                                     │
│  - signer: Arc<dyn AwsSigner>                                            │
│  - resilience: Arc<ResilienceOrchestrator>                               │
│  - logger: Arc<dyn Logger>                                               │
│  - tracer: Arc<dyn Tracer>                                               │
│  - endpoint: String                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│ Private Methods:                                                         │
│  - build_send_request(request) -> (HttpRequest, String)                  │
│  - build_bulk_request(request) -> (HttpRequest, String)                  │
│  - parse_send_response(body) -> SendEmailOutput                          │
│  - parse_bulk_response(body) -> SendBulkEmailOutput                      │
│  - validate_email_content(content) -> Result<()>                         │
│  - validate_destination(destination) -> Result<()>                       │
└─────────────────────────────────────────────────────────────────────────┘

Request/Response Flow:
┌─────────────────────────────────────────────────────────────────────────┐
│                      SendEmail Flow                                      │
│                                                                         │
│  Client                EmailsService              Transport              │
│    │                        │                          │                │
│    │──send(request)────────►│                          │                │
│    │                        │                          │                │
│    │                        │──validate request        │                │
│    │                        │  (from, to, content)     │                │
│    │                        │                          │                │
│    │                        │──build HTTP request      │                │
│    │                        │  POST /v2/email/outbound-emails            │
│    │                        │                          │                │
│    │                        │──sign request            │                │
│    │                        │  (AWS Signature V4)      │                │
│    │                        │                          │                │
│    │                        │──send()──────────────────►                │
│    │                        │                          │                │
│    │                        │◄─────────response────────│                │
│    │                        │                          │                │
│    │                        │──parse JSON response     │                │
│    │                        │                          │                │
│    │◄──Result<Output>───────│                          │                │
│    │                        │                          │                │
└─────────────────────────────────────────────────────────────────────────┘

Email Content Types:
┌─────────────────────────────────────────────────────────────────────────┐
│                      Email Content Variants                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  EmailContent::Simple                                            │   │
│  │  - Subject: Content { data, charset }                            │   │
│  │  - Body: Body { text: Content, html: Content }                   │   │
│  │  - Headers: Vec<MessageHeader>                                   │   │
│  │                                                                   │   │
│  │  Use Case: Standard formatted emails                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  EmailContent::Raw                                               │   │
│  │  - Data: Vec<u8> (MIME-formatted message)                        │   │
│  │                                                                   │   │
│  │  Use Case: Pre-formatted MIME, attachments, custom headers       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  EmailContent::Template                                          │   │
│  │  - TemplateName: String                                          │   │
│  │  - TemplateArn: Option<String>                                   │   │
│  │  - TemplateData: String (JSON)                                   │   │
│  │                                                                   │   │
│  │  Use Case: Templated emails with variable substitution           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Templates Service Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TemplatesService Architecture                         │
└─────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────┐
│                         TemplatesService                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ + create(request: CreateTemplateRequest) -> Result<()>                  │
│ + get(name: String) -> Result<GetTemplateOutput>                        │
│ + update(request: UpdateTemplateRequest) -> Result<()>                  │
│ + delete(name: String) -> Result<()>                                    │
│ + list(request: ListTemplatesRequest) -> Result<ListTemplatesOutput>    │
│ + list_all(request: ListTemplatesRequest) -> Stream<TemplateMetadata>   │
└─────────────────────────────────────────────────────────────────────────┘

Template Rendering Flow:
┌─────────────────────────────────────────────────────────────────────────┐
│                    Template-Based Email Send                             │
│                                                                         │
│  ┌─────────────────┐       ┌─────────────────┐                          │
│  │  Template       │       │  Template Data  │                          │
│  │  (stored)       │  +    │  (per email)    │                          │
│  │                 │       │                 │                          │
│  │  Subject:       │       │  {              │                          │
│  │  "Hello {{name}}"│      │    "name": "Bob",│                          │
│  │                 │       │    "code": "123" │                          │
│  │  Body:          │       │  }              │                          │
│  │  "Welcome, {{name}}"    │                 │                          │
│  └────────┬────────┘       └────────┬────────┘                          │
│           │                         │                                    │
│           └────────────┬────────────┘                                    │
│                        │                                                 │
│                        ▼                                                 │
│           ┌─────────────────────────┐                                    │
│           │   SES Template Engine   │                                    │
│           │   (server-side render)  │                                    │
│           └────────────┬────────────┘                                    │
│                        │                                                 │
│                        ▼                                                 │
│           ┌─────────────────────────┐                                    │
│           │   Rendered Email        │                                    │
│           │                         │                                    │
│           │   Subject: "Hello Bob"  │                                    │
│           │   Body: "Welcome, Bob"  │                                    │
│           └─────────────────────────┘                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Pagination Pattern:
┌─────────────────────────────────────────────────────────────────────────┐
│                    Auto-Pagination (list_all)                            │
│                                                                         │
│  async fn list_all(request) -> impl Stream<Item = TemplateMetadata> {   │
│      stream::unfold(Some(request), |state| async {                      │
│          let request = state?;                                          │
│          let response = self.list(request.clone()).await.ok()?;         │
│                                                                         │
│          let next_state = response.next_token.map(|token| {             │
│              ListTemplatesRequest {                                     │
│                  next_token: Some(token),                               │
│                  ..request                                              │
│              }                                                          │
│          });                                                            │
│                                                                         │
│          Some((stream::iter(response.templates), next_state))           │
│      }).flatten()                                                       │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Identities Service Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   IdentitiesService Architecture                         │
└─────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────┐
│                        IdentitiesService                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ + create(request: CreateIdentityRequest) -> Result<CreateIdentityOutput>│
│ + get(identity: String) -> Result<GetIdentityOutput>                    │
│ + delete(identity: String) -> Result<()>                                │
│ + list(request: ListIdentitiesRequest) -> Result<ListIdentitiesOutput>  │
│ + put_dkim_attributes(request) -> Result<()>                            │
│ + put_mail_from_attributes(request) -> Result<()>                       │
└─────────────────────────────────────────────────────────────────────────┘

Identity Types:
┌─────────────────────────────────────────────────────────────────────────┐
│                      Identity Types                                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  EMAIL_ADDRESS Identity                                          │   │
│  │  - Example: "sender@example.com"                                 │   │
│  │  - Verification: Click link in email                            │   │
│  │  - Use: Send from specific email address                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  DOMAIN Identity                                                 │   │
│  │  - Example: "example.com"                                        │   │
│  │  - Verification: DNS TXT record                                  │   │
│  │  - Use: Send from any address @example.com                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MANAGED_DOMAIN Identity                                         │   │
│  │  - Example: "example.com" with Route53                           │   │
│  │  - Verification: Automatic via Route53                          │   │
│  │  - Use: AWS-managed DNS verification                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Identity Verification Flow:
┌─────────────────────────────────────────────────────────────────────────┐
│                 Identity Verification Workflow                           │
│                                                                         │
│  create_identity("example.com")                                         │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Response contains:                                              │   │
│  │  - DKIM tokens (3 CNAME records to add)                          │   │
│  │  - Verification status: PENDING                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       │ User adds DNS records                                           │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  AWS SES polls DNS (may take up to 72 hours)                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  get_identity("example.com")                                     │   │
│  │  - Verification status: SUCCESS                                  │   │
│  │  - DKIM status: SUCCESS                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Configuration Sets Service Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  ConfigSetsService Architecture                          │
└─────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────┐
│                       ConfigSetsService                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ + create(request: CreateConfigSetRequest) -> Result<()>                 │
│ + get(name: String) -> Result<GetConfigSetOutput>                       │
│ + delete(name: String) -> Result<()>                                    │
│ + list(request) -> Result<ListConfigSetsOutput>                         │
│ + put_delivery_options(request) -> Result<()>                           │
│ + put_reputation_options(request) -> Result<()>                         │
│ + put_sending_options(request) -> Result<()>                            │
│ + put_tracking_options(request) -> Result<()>                           │
│ + put_suppression_options(request) -> Result<()>                        │
│ + put_vdm_options(request) -> Result<()>                                │
└─────────────────────────────────────────────────────────────────────────┘

Configuration Set Structure:
┌─────────────────────────────────────────────────────────────────────────┐
│                   Configuration Set Options                              │
│                                                                         │
│  ConfigurationSet                                                        │
│  ├── DeliveryOptions                                                     │
│  │   ├── tls_policy: TlsPolicy (REQUIRE | OPTIONAL)                      │
│  │   └── sending_pool_name: Option<String>                               │
│  │                                                                       │
│  ├── ReputationOptions                                                   │
│  │   ├── reputation_metrics_enabled: bool                                │
│  │   └── last_fresh_start: Option<DateTime>                              │
│  │                                                                       │
│  ├── SendingOptions                                                      │
│  │   └── sending_enabled: bool                                           │
│  │                                                                       │
│  ├── TrackingOptions                                                     │
│  │   └── custom_redirect_domain: Option<String>                          │
│  │                                                                       │
│  ├── SuppressionOptions                                                  │
│  │   └── suppressed_reasons: Vec<SuppressionReason>                      │
│  │       (BOUNCE | COMPLAINT)                                            │
│  │                                                                       │
│  ├── VdmOptions (Virtual Deliverability Manager)                         │
│  │   ├── dashboard_options: DashboardOptions                             │
│  │   │   └── engagement_metrics: ENABLED | DISABLED                      │
│  │   └── guardian_options: GuardianOptions                               │
│  │       └── optimized_shared_delivery: ENABLED | DISABLED               │
│  │                                                                       │
│  └── EventDestinations[]                                                 │
│      ├── name: String                                                    │
│      ├── enabled: bool                                                   │
│      ├── matching_event_types: Vec<EventType>                            │
│      └── destination: EventDestination                                   │
│          (CloudWatch | Kinesis | SNS | Pinpoint)                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Architecture

### 5.1 Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Request Data Flow                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐
│  Client  │  │  Service  │  │  Request  │  │  Signer  │  │ Transport  │
│   App    │  │   Layer   │  │  Builder  │  │          │  │            │
└────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────┬─────┘
     │              │              │              │               │
     │ SendEmail    │              │              │               │
     │ Request      │              │              │               │
     │─────────────►│              │              │               │
     │              │              │              │               │
     │              │ Validate     │              │               │
     │              │─────────────►│              │               │
     │              │              │              │               │
     │              │ Build HTTP   │              │               │
     │              │ Request      │              │               │
     │              │─────────────►│              │               │
     │              │              │              │               │
     │              │              │ HttpRequest  │               │
     │              │              │─────────────►│               │
     │              │              │              │               │
     │              │              │              │ Sign          │
     │              │              │              │ Request       │
     │              │              │              │──────┐        │
     │              │              │              │      │        │
     │              │              │              │◄─────┘        │
     │              │              │              │               │
     │              │              │              │ Signed        │
     │              │              │              │ Request       │
     │              │              │              │──────────────►│
     │              │              │              │               │
     │              │              │              │               │ HTTP
     │              │              │              │               │ POST
     │              │              │              │               │────►
     │              │              │              │               │
     │              │              │              │               │◄────
     │              │              │              │               │ HTTP
     │              │              │              │               │ Response
     │              │              │              │               │
     │              │              │ HttpResponse │               │
     │              │              │◄─────────────────────────────│
     │              │              │              │               │
     │              │ Parse        │              │               │
     │              │ Response     │              │               │
     │              │◄─────────────│              │               │
     │              │              │              │               │
     │ SendEmail    │              │              │               │
     │ Output       │              │              │               │
     │◄─────────────│              │              │               │
     │              │              │              │               │
```

### 5.2 Bulk Email Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Bulk Email Send Flow                                │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐  ┌───────────┐  ┌───────────────────────────────────────────┐
│  Client  │  │  Emails   │  │                AWS SES                    │
│   App    │  │  Service  │  │                                           │
└────┬─────┘  └─────┬─────┘  └─────────────────────┬─────────────────────┘
     │              │                              │
     │ send_bulk()  │                              │
     │─────────────►│                              │
     │              │                              │
     │              │ Validate bulk request        │
     │              │ (max 50 recipients/call)     │
     │              │                              │
     │              │ Build bulk email request     │
     │              │                              │
     │              │──POST /v2/email/outbound-bulk-emails──►
     │              │                              │
     │              │                              │ SES processes:
     │              │                              │ - Template rendering
     │              │                              │ - Personalization
     │              │                              │ - Queue for delivery
     │              │                              │
     │              │◄────200 OK + BulkEmailResults───
     │              │                              │
     │              │ Parse response               │
     │              │                              │
     │◄─BulkOutput──│                              │
     │  per-recipient│                              │
     │  results     │                              │
     │              │                              │

BulkEmailEntry Structure:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  SendBulkEmailRequest {                                                 │
│      from_email_address: "sender@example.com",                          │
│      default_content: BulkEmailContent::Template {                      │
│          template_name: "welcome",                                      │
│          template_data: "{}",  // Default values                        │
│      },                                                                 │
│      bulk_email_entries: vec![                                          │
│          BulkEmailEntry {                                               │
│              destination: Destination { to: ["user1@example.com"] },    │
│              replacement_template_data: Some(r#"{"name":"Alice"}"#),    │
│              replacement_headers: None,                                 │
│              replacement_tags: None,                                    │
│          },                                                             │
│          BulkEmailEntry {                                               │
│              destination: Destination { to: ["user2@example.com"] },    │
│              replacement_template_data: Some(r#"{"name":"Bob"}"#),      │
│              replacement_headers: None,                                 │
│              replacement_tags: None,                                    │
│          },                                                             │
│      ],                                                                 │
│  }                                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Error Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Error Flow                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  HTTP Response                                                         │
│  Status: 400                                                           │
│  Body: {                                                               │
│    "__type": "MessageRejected",                                        │
│    "message": "Email address is not verified. The following ..."       │
│  }                                                                     │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Response Parser                                                       │
│                                                                        │
│  1. Check status code (400)                                            │
│  2. Parse JSON error body                                              │
│  3. Extract: type, message                                             │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Error Mapper                                                          │
│                                                                        │
│  map_ses_error("MessageRejected", ...) =>                              │
│    SesError::Email(EmailError::MessageRejected {                       │
│        message: "Email address is not verified...",                    │
│        request_id: Some("ABC123"),                                     │
│    })                                                                  │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Resilience Layer                                                      │
│                                                                        │
│  error.is_retryable()? => false (400 is not retryable)                 │
│  circuit_breaker.record_failure()? => No (client error, not server)    │
│                                                                        │
│  Return error to caller immediately                                    │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Client Application                                                    │
│                                                                        │
│  match result {                                                        │
│      Err(SesError::Email(EmailError::MessageRejected { .. })) => {     │
│          // Handle unverified sender                                   │
│      }                                                                 │
│      ...                                                               │
│  }                                                                     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 6. Dependency Injection & Testability

### 6.1 Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Dependency Injection Graph                         │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────┐
                    │     SesClientImpl     │
                    └───────────┬───────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Arc<dyn        │  │ Arc<dyn        │  │ Arc<dyn        │
│ HttpTransport> │  │ AwsSigner>     │  │ Credentials    │
│                │  │                │  │ Provider>      │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         │              depends on                 │
         │                    │                    │
         │                    └────────────────────┘
         │
         ▼
┌─────────────────┐
│  reqwest::      │
│  Client         │
│  (external)     │
└─────────────────┘

All dependencies are:
 - Injected via constructor/builder
 - Behind trait interfaces (dyn Trait)
 - Wrapped in Arc for shared ownership
 - Replaceable with mocks for testing
```

### 6.2 Testing Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Testing Architecture                              │
└─────────────────────────────────────────────────────────────────────────┘

Unit Tests (Mock-Based):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  MockTransport  │     │   MockSigner    │     │MockCredentials  │   │
│  │                 │     │                 │     │    Provider     │   │
│  │ - responses     │     │ - sign_called   │     │                 │   │
│  │ - requests      │     │ - signature     │     │ - credentials   │   │
│  │                 │     │                 │     │                 │   │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘   │
│           │                       │                       │             │
│           └───────────────────────┼───────────────────────┘             │
│                                   │                                     │
│                                   ▼                                     │
│                        ┌─────────────────────┐                         │
│                        │ ServiceUnderTest    │                         │
│                        │ (with mock deps)    │                         │
│                        └─────────────────────┘                         │
│                                                                         │
│  Tests verify:                                                          │
│   - Correct requests built                                              │
│   - Correct headers set                                                 │
│   - Correct responses parsed                                            │
│   - Correct errors returned                                             │
│   - Retry behavior                                                      │
│   - Circuit breaker behavior                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Integration Tests (LocalStack):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────┐         ┌─────────────────────────────────┐       │
│  │  Test Suite     │         │  LocalStack                     │       │
│  │                 │         │  (SES-compatible service)       │       │
│  │  - Real client  │◄───────►│                                 │       │
│  │  - Real signing │         │  - Real SES API                 │       │
│  │  - Real HTTP    │         │  - Real responses               │       │
│  │                 │         │                                 │       │
│  └─────────────────┘         └─────────────────────────────────┘       │
│                                                                         │
│  Tests verify:                                                          │
│   - End-to-end operations                                               │
│   - JSON parsing                                                        │
│   - Signature generation                                                │
│   - Email sending                                                       │
│   - Template operations                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Live Tests (Real AWS - Optional):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  #[test]                                                                │
│  #[ignore]  // Only run manually with AWS credentials                   │
│  async fn test_real_aws_ses() {                                         │
│      if std::env::var("AWS_ACCESS_KEY_ID").is_err() {                   │
│          return; // Skip if no credentials                              │
│      }                                                                  │
│                                                                         │
│      let client = SesClient::from_env()?;                               │
│      // Test against real AWS SES                                       │
│  }                                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Mock Implementation Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Mock Implementation Pattern                         │
└─────────────────────────────────────────────────────────────────────────┘

MockHttpTransport:
┌─────────────────────────────────────────────────────────────────────────┐
│  pub struct MockHttpTransport {                                         │
│      // Queue of responses to return                                    │
│      responses: Arc<Mutex<VecDeque<Result<HttpResponse, TransportError>>>>,│
│      // Captured requests for verification                              │
│      requests: Arc<Mutex<Vec<HttpRequest>>>,                            │
│  }                                                                      │
│                                                                         │
│  impl MockHttpTransport {                                               │
│      pub fn new() -> Self { ... }                                       │
│                                                                         │
│      // Builder methods                                                 │
│      pub fn with_response(self, response: HttpResponse) -> Self { ... } │
│      pub fn with_error(self, error: TransportError) -> Self { ... }     │
│      pub fn with_responses(self, responses: Vec<...>) -> Self { ... }   │
│                                                                         │
│      // Verification methods                                            │
│      pub fn get_requests(&self) -> Vec<HttpRequest> { ... }             │
│      pub fn get_last_request(&self) -> Option<HttpRequest> { ... }      │
│      pub fn assert_request_count(&self, expected: usize) { ... }        │
│      pub fn assert_header(&self, idx: usize, key: &str, val: &str) { }  │
│      pub fn assert_json_body_contains(&self, idx: usize, key: &str) { } │
│  }                                                                      │
│                                                                         │
│  impl HttpTransport for MockHttpTransport {                             │
│      async fn send(&self, request: HttpRequest) -> Result<...> {        │
│          self.requests.lock().unwrap().push(request);                   │
│          self.responses.lock().unwrap().pop_front()                     │
│              .unwrap_or(Err(TransportError::NoMockResponse))             │
│      }                                                                  │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘

Test Example:
┌─────────────────────────────────────────────────────────────────────────┐
│  #[tokio::test]                                                         │
│  async fn test_send_email_returns_message_id() {                        │
│      // Arrange                                                         │
│      let mock_transport = MockHttpTransport::new()                      │
│          .with_response(HttpResponse {                                  │
│              status: StatusCode::OK,                                    │
│              headers: headers! {},                                      │
│              body: json!({                                              │
│                  "MessageId": "0102018abc-1234-5678-90ab-cdef0102018abc" │
│              }).to_string().into(),                                     │
│          });                                                            │
│                                                                         │
│      let service = create_test_emails_service(mock_transport);          │
│                                                                         │
│      // Act                                                             │
│      let result = service.send(SendEmailRequest {                       │
│          from_email_address: "sender@example.com".into(),               │
│          destination: Destination {                                     │
│              to_addresses: vec!["to@example.com".into()],               │
│              ..Default::default()                                       │
│          },                                                             │
│          content: EmailContent::Simple { ... },                         │
│          ..Default::default()                                           │
│      }).await;                                                          │
│                                                                         │
│      // Assert                                                          │
│      assert!(result.is_ok());                                           │
│      let output = result.unwrap();                                      │
│      assert_eq!(output.message_id, "0102018abc-1234-5678-90ab-cdef...");│
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture - Part 1 |

---

**End of Architecture Part 1**

*Part 2 will cover Security Architecture, Observability Architecture, Deployment & Configuration, and Performance Considerations.*

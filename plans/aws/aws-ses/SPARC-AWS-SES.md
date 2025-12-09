# SPARC Development Cycle: AWS SES Integration

## Module Overview

| Attribute | Value |
|-----------|-------|
| **Module Name** | AWS SES Integration |
| **Repository** | LLM-Dev-Ops Integration Repository |
| **Target** | AWS Simple Email Service (SES) v2 REST API |
| **Methodology** | SPARC (Specification → Pseudocode → Architecture → Refinement → Completion) |
| **Testing Approach** | London-School TDD (Interface-first, Mock-based) |
| **Dependencies** | Shared primitives only (errors, retry, circuit-breaker, rate-limits, tracing, logging, types, config) |
| **Constraints** | No ruvbase, No cross-module dependencies |

---

## Document Index

### Phase 1: Specification
**File:** [specification-aws-ses.md](./specification-aws-ses.md)

Defines the complete requirements for the AWS SES integration:
- Module purpose and scope
- Dependency policy (shared primitives only)
- API coverage (35+ SES v2 operations)
- Interface definitions (Rust and TypeScript)
- Error taxonomy
- Resilience hooks
- Security requirements
- Observability requirements
- Performance requirements
- Acceptance criteria

---

### Phase 2: Pseudocode
**Files:**
- [pseudocode-aws-ses-1.md](./pseudocode-aws-ses-1.md) - Core Infrastructure & AWS Signature V4
- [pseudocode-aws-ses-2.md](./pseudocode-aws-ses-2.md) - Resilience & Core Services
- [pseudocode-aws-ses-3.md](./pseudocode-aws-ses-3.md) - Configuration & Management Services
- [pseudocode-aws-ses-4.md](./pseudocode-aws-ses-4.md) - Account Service & Testing

Provides implementation-ready pseudocode for:
- Client initialization and configuration
- AWS Signature V4 signing algorithm (sesv2 service)
- Credential provider chain (Environment, Profile, IMDS)
- HTTP transport layer with JSON handling
- EmailsService (send, bulk, templated)
- TemplatesService (CRUD, test render)
- IdentitiesService (email/domain verification, DKIM, MAIL FROM)
- ConfigurationSetsService (event destinations)
- SuppressionService (bounce/complaint management)
- DedicatedIpsService (IP pool management)
- AccountService (quotas, settings)
- Mock implementations for testing

---

### Phase 3: Architecture
**Files:**
- [architecture-aws-ses-1.md](./architecture-aws-ses-1.md) - System Design & Component Architecture
- [architecture-aws-ses-2.md](./architecture-aws-ses-2.md) - Security, Observability, Deployment & Performance

Documents the system architecture:
- Hexagonal Architecture (Ports and Adapters) pattern
- C4 Model diagrams (Context, Container, Component, Code)
- Component architecture and interactions
- Service layer design with lazy initialization
- Data flow architecture
- Dependency injection and testability
- Security architecture (authentication, credential protection, email content)
- Observability architecture (tracing, metrics, logging)
- Deployment patterns (LocalStack, EC2/ECS, Lambda)
- Performance architecture (connection pooling, bulk batching, signing cache)
- Error recovery architecture
- Architecture Decision Records (ADRs)

---

### Phase 4: Refinement
**File:** [refinement-aws-ses.md](./refinement-aws-ses.md)

Reviews and hardens the design:
- Design review checklist (specification, architecture, security compliance)
- Edge case analysis (email addresses, content, templates, identities, credentials, rate limits)
- Performance optimizations (signing cache, bulk batching, connection warmup)
- Security hardening (input validation, credential protection, email content sanitization)
- Test strategy refinement (coverage matrix, mock specifications)
- Error message refinement (user-friendly, actionable)
- API ergonomics (builder patterns, convenience methods)
- Documentation requirements
- Final pre-implementation checklist

---

### Phase 5: Completion
**File:** [completion-aws-ses.md](./completion-aws-ses.md)

Provides implementation roadmap:
- Complete file structure (Rust and TypeScript)
- 9-phase implementation order with dependencies
- Cargo.toml and package.json configurations
- Public API summary (all SesClient methods and builders)
- AWS Signature V4 test vectors (SES v2 specific)
- JSON response test fixtures
- CI/CD configuration (GitHub Actions)
- Docker Compose for LocalStack testing
- README template
- Compliance matrix (all 35+ operations)
- Implementation completion checklist

---

## Operations Covered

### Email Operations
| # | Operation | Service | Pseudocode | Architecture |
|---|-----------|---------|------------|--------------|
| 1 | SendEmail | EmailsService | Part 2 | Part 1 |
| 2 | SendBulkEmail | EmailsService | Part 2 | Part 1 |

### Template Operations
| # | Operation | Service | Pseudocode | Architecture |
|---|-----------|---------|------------|--------------|
| 3 | CreateEmailTemplate | TemplatesService | Part 2 | Part 1 |
| 4 | GetEmailTemplate | TemplatesService | Part 2 | Part 1 |
| 5 | UpdateEmailTemplate | TemplatesService | Part 2 | Part 1 |
| 6 | DeleteEmailTemplate | TemplatesService | Part 2 | Part 1 |
| 7 | ListEmailTemplates | TemplatesService | Part 2 | Part 1 |
| 8 | TestRenderEmailTemplate | TemplatesService | Part 2 | Part 1 |

### Identity Operations
| # | Operation | Service | Pseudocode | Architecture |
|---|-----------|---------|------------|--------------|
| 9 | CreateEmailIdentity | IdentitiesService | Part 2 | Part 1 |
| 10 | GetEmailIdentity | IdentitiesService | Part 2 | Part 1 |
| 11 | DeleteEmailIdentity | IdentitiesService | Part 2 | Part 1 |
| 12 | ListEmailIdentities | IdentitiesService | Part 2 | Part 1 |
| 13 | PutEmailIdentityDkimAttributes | IdentitiesService | Part 2 | Part 1 |
| 14 | PutEmailIdentityMailFromAttributes | IdentitiesService | Part 2 | Part 1 |
| 15 | PutEmailIdentityFeedbackAttributes | IdentitiesService | Part 2 | Part 1 |

### Configuration Set Operations
| # | Operation | Service | Pseudocode | Architecture |
|---|-----------|---------|------------|--------------|
| 16 | CreateConfigurationSet | ConfigSetsService | Part 3 | Part 1 |
| 17 | GetConfigurationSet | ConfigSetsService | Part 3 | Part 1 |
| 18 | DeleteConfigurationSet | ConfigSetsService | Part 3 | Part 1 |
| 19 | ListConfigurationSets | ConfigSetsService | Part 3 | Part 1 |
| 20 | CreateConfigurationSetEventDestination | ConfigSetsService | Part 3 | Part 1 |
| 21 | GetConfigurationSetEventDestinations | ConfigSetsService | Part 3 | Part 1 |
| 22 | UpdateConfigurationSetEventDestination | ConfigSetsService | Part 3 | Part 1 |
| 23 | DeleteConfigurationSetEventDestination | ConfigSetsService | Part 3 | Part 1 |

### Suppression Operations
| # | Operation | Service | Pseudocode | Architecture |
|---|-----------|---------|------------|--------------|
| 24 | PutSuppressedDestination | SuppressionService | Part 3 | Part 1 |
| 25 | GetSuppressedDestination | SuppressionService | Part 3 | Part 1 |
| 26 | DeleteSuppressedDestination | SuppressionService | Part 3 | Part 1 |
| 27 | ListSuppressedDestinations | SuppressionService | Part 3 | Part 1 |

### Dedicated IP Operations
| # | Operation | Service | Pseudocode | Architecture |
|---|-----------|---------|------------|--------------|
| 28 | CreateDedicatedIpPool | DedicatedIpsService | Part 3 | Part 1 |
| 29 | DeleteDedicatedIpPool | DedicatedIpsService | Part 3 | Part 1 |
| 30 | ListDedicatedIpPools | DedicatedIpsService | Part 3 | Part 1 |
| 31 | GetDedicatedIp | DedicatedIpsService | Part 3 | Part 1 |
| 32 | PutDedicatedIpWarmupAttributes | DedicatedIpsService | Part 3 | Part 1 |

### Account Operations
| # | Operation | Service | Pseudocode | Architecture |
|---|-----------|---------|------------|--------------|
| 33 | GetAccount | AccountService | Part 4 | Part 1 |
| 34 | PutAccountDetails | AccountService | Part 4 | Part 1 |
| 35 | PutAccountSendingAttributes | AccountService | Part 4 | Part 1 |

### Authentication
| # | Operation | Category | Pseudocode | Architecture |
|---|-----------|----------|------------|--------------|
| 36 | AWS Signature V4 (sesv2) | Auth | Part 1 | Part 2 |

---

## Shared Primitives Used

| Primitive | Usage |
|-----------|-------|
| `errors` | SesError base, error conversion |
| `retry` | Exponential backoff for transient failures (Throttling, 500, 503) |
| `circuit-breaker` | Per-region failure isolation |
| `rate-limits` | Request rate control (14 emails/sec default) |
| `tracing` | Distributed tracing spans |
| `logging` | Structured logging |
| `types` | Common type definitions |
| `config` | Configuration management |

---

## Key Design Decisions

1. **SES v2 API Only**: Modern JSON-based API (sesv2), no legacy XML API support

2. **Hexagonal Architecture**: Clean separation of core logic from external concerns (HTTP, credentials)

3. **London-School TDD**: All collaborators defined as traits/interfaces for mock-based testing

4. **Service Accessor Pattern**: Lazy initialization of service objects via OnceCell

5. **Fluent Builders**: EmailBuilder, TemplateBuilder for ergonomic API construction

6. **Credential Chain Pattern**: Flexible credential resolution for any deployment scenario

7. **No External Dependencies**: Only shared primitives, no ruvbase or other integration modules

---

## Implementation Phases Summary

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| 1 | Core Infrastructure | Errors, Types, Config, Email Validation Utilities |
| 2 | Authentication | Credentials, Providers, SigV4 (sesv2), Signing Cache |
| 3 | HTTP Layer | Transport, Request/Response, JSON Handling, Pooling |
| 4 | Core Types | Email, Template, Identity, ConfigSet, Suppression, Account types |
| 5 | Builders | EmailBuilder, TemplateBuilder, BulkEmailBuilder |
| 6 | Core Services | All 7 service implementations with full operation coverage |
| 7 | Resilience | Retry, Circuit Breaker, Rate Limiting, Observability |
| 8 | Client Assembly | SesClient with service accessors, public API exports |
| 9 | Integration Testing | LocalStack, Full test suite, CI/CD |

---

## Quality Gates

- [ ] All unit tests passing (150+ tests)
- [ ] All integration tests passing
- [ ] Code coverage > 80%
- [ ] No linter warnings
- [ ] Security review passed
- [ ] Documentation complete
- [ ] API review approved

---

## SES-Specific Considerations

### Email Content
- HTML/Text body handling with proper MIME types
- Attachment support with Base64 encoding
- Template variable substitution and validation
- Character encoding (UTF-8)

### Identity Verification
- Email address verification flow
- Domain verification with DKIM setup
- MAIL FROM domain configuration
- Feedback forwarding configuration

### Sending Limits
- Default 14 emails/second rate limit
- 24-hour sending quota tracking
- Sandbox vs Production mode handling

### Bounce/Complaint Handling
- Suppression list integration
- Bounce/complaint reason tracking
- Automatic suppression for hard bounces

---

## Getting Started

1. Review the [Specification](./specification-aws-ses.md) for requirements
2. Study the [Pseudocode](./pseudocode-aws-ses-1.md) for implementation details
3. Understand the [Architecture](./architecture-aws-ses-1.md) for design patterns
4. Check the [Refinement](./refinement-aws-ses.md) for edge cases and optimizations
5. Follow the [Completion](./completion-aws-ses.md) roadmap for implementation order

---

*Generated via SPARC methodology for LLM-Dev-Ops Integration Repository*

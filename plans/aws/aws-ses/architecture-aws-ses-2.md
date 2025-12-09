# AWS SES Integration Module - Architecture (Part 2)

**SPARC Phase 3: Architecture (Continued)**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-ses`
**Part:** 2 of 2 - Security, Observability, Deployment & Performance

---

## Table of Contents

7. [Security Architecture](#7-security-architecture)
8. [Observability Architecture](#8-observability-architecture)
9. [Deployment & Configuration Architecture](#9-deployment--configuration-architecture)
10. [Performance Architecture](#10-performance-architecture)
11. [Testing Architecture](#11-testing-architecture)
12. [Error Recovery Architecture](#12-error-recovery-architecture)
13. [Cross-Cutting Concerns](#13-cross-cutting-concerns)
14. [Architecture Decision Records](#14-architecture-decision-records)
15. [Summary](#15-summary)

---

## 7. Security Architecture

### 7.1 Authentication & Authorization Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Credential Resolution Chain                       │   │
│  │                                                                      │   │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │   │
│  │   │ Explicit │───▶│   Env    │───▶│ Profile  │───▶│  IMDS    │     │   │
│  │   │  Creds   │    │  Vars    │    │  File    │    │ (EC2)    │     │   │
│  │   └──────────┘    └──────────┘    └──────────┘    └──────────┘     │   │
│  │        │              │               │               │             │   │
│  │        ▼              ▼               ▼               ▼             │   │
│  │   ┌──────────────────────────────────────────────────────────┐     │   │
│  │   │              CredentialProvider Interface                │     │   │
│  │   │  + get_credentials() -> Result<Credentials, Error>       │     │   │
│  │   │  + refresh_credentials() -> Result<Credentials, Error>   │     │   │
│  │   └──────────────────────────────────────────────────────────┘     │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │   ┌──────────────────────────────────────────────────────────┐     │   │
│  │   │               Credential Cache (TTL-based)               │     │   │
│  │   │  - Caches resolved credentials                           │     │   │
│  │   │  - Auto-refresh before expiration                        │     │   │
│  │   │  - Thread-safe access                                    │     │   │
│  │   └──────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     AWS Signature V4 Signing                        │   │
│  │                                                                      │   │
│  │   Request ──▶ Canonical Request ──▶ String to Sign ──▶ Signature   │   │
│  │                                                                      │   │
│  │   Components:                                                        │   │
│  │   ┌────────────────────────────────────────────────────────────┐   │   │
│  │   │ Canonical Request:                                          │   │   │
│  │   │   HTTPMethod + \n                                           │   │   │
│  │   │   CanonicalURI + \n                                         │   │   │
│  │   │   CanonicalQueryString + \n                                 │   │   │
│  │   │   CanonicalHeaders + \n                                     │   │   │
│  │   │   SignedHeaders + \n                                        │   │   │
│  │   │   HashedPayload                                             │   │   │
│  │   └────────────────────────────────────────────────────────────┘   │   │
│  │   ┌────────────────────────────────────────────────────────────┐   │   │
│  │   │ String to Sign:                                             │   │   │
│  │   │   Algorithm + \n                                            │   │   │
│  │   │   RequestDateTime + \n                                      │   │   │
│  │   │   CredentialScope + \n                                      │   │   │
│  │   │   HashedCanonicalRequest                                    │   │   │
│  │   └────────────────────────────────────────────────────────────┘   │   │
│  │   ┌────────────────────────────────────────────────────────────┐   │   │
│  │   │ Signature Derivation:                                       │   │   │
│  │   │   kDate    = HMAC-SHA256("AWS4" + SecretKey, Date)         │   │   │
│  │   │   kRegion  = HMAC-SHA256(kDate, Region)                     │   │   │
│  │   │   kService = HMAC-SHA256(kRegion, "ses")                    │   │   │
│  │   │   kSigning = HMAC-SHA256(kService, "aws4_request")          │   │   │
│  │   │   Signature = HMAC-SHA256(kSigning, StringToSign)           │   │   │
│  │   └────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SECURITY LAYERS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: Transport Security                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - TLS 1.2+ enforced for all connections                            │   │
│  │  - Certificate validation (configurable for testing)                │   │
│  │  - Connection pooling with secure defaults                          │   │
│  │  - No plaintext credentials in transit                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 2: Request Signing                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - AWS Signature V4 on every request                                │   │
│  │  - Content hash verification (SHA-256)                              │   │
│  │  - Timestamp validation (5-minute skew tolerance)                   │   │
│  │  - Request integrity protection                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 3: Credential Protection                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - Credentials never logged or exposed in errors                    │   │
│  │  - Session tokens for temporary credentials                         │   │
│  │  - Automatic credential rotation support                            │   │
│  │  - SecretString wrapper with zeroize on drop                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 4: Email Content Security                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - Email content encrypted in transit                               │   │
│  │  - Support for SES encryption at rest (AWS-managed)                 │   │
│  │  - Header sanitization (remove internal headers from logs)          │   │
│  │  - Template data validation                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 5: Identity Verification                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - DKIM signing for authenticated email origin                      │   │
│  │  - SPF alignment through MAIL FROM configuration                    │   │
│  │  - DMARC compliance support                                         │   │
│  │  - Domain verification workflow                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Credential Security Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL SECURITY MODEL                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Credential Types Supported                        │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │   │
│  │  │  Long-Term      │  │  Session-Based  │  │  Role-Based     │     │   │
│  │  │  Credentials    │  │  Credentials    │  │  (IMDS v2)      │     │   │
│  │  │                 │  │                 │  │                 │     │   │
│  │  │  - Access Key   │  │  - Access Key   │  │  - Fetched via  │     │   │
│  │  │  - Secret Key   │  │  - Secret Key   │  │    metadata     │     │   │
│  │  │  - No expiry    │  │  - Session Tok  │  │  - Auto-rotate  │     │   │
│  │  │                 │  │  - Expiration   │  │  - TTL-based    │     │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Security Invariants                               │   │
│  │                                                                      │   │
│  │  1. Credentials are NEVER:                                          │   │
│  │     - Logged in any log level                                       │   │
│  │     - Included in error messages                                    │   │
│  │     - Exposed via Debug/Display traits                              │   │
│  │     - Stored in plain text (use SecretString)                       │   │
│  │     - Included in traces or spans                                   │   │
│  │                                                                      │   │
│  │  2. Credentials ARE:                                                 │   │
│  │     - Loaded lazily on first use                                    │   │
│  │     - Cached with automatic refresh                                 │   │
│  │     - Cleared from memory when dropped                              │   │
│  │     - Protected by SecretString wrapper                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SecretString Implementation                       │   │
│  │                                                                      │   │
│  │  struct SecretString {                                               │   │
│  │      inner: String,  // Not exposed                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Debug for SecretString {                                       │   │
│  │      fn fmt(&self, f: &mut Formatter) -> fmt::Result {               │   │
│  │          write!(f, "[REDACTED]")  // Never expose                    │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for SecretString {                                        │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          self.inner.zeroize();  // Clear from memory                 │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Email Content Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EMAIL CONTENT SECURITY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Content Handling                                  │   │
│  │                                                                      │   │
│  │  1. Email Content:                                                   │   │
│  │     - Never logged in full (only metadata)                          │   │
│  │     - Hashed for signature (not stored)                             │   │
│  │     - UTF-8 encoding validated                                      │   │
│  │     - Size limits enforced (10MB total)                             │   │
│  │                                                                      │   │
│  │  2. Template Data:                                                   │   │
│  │     - JSON structure validated                                      │   │
│  │     - Personal data flagged as sensitive in logs                    │   │
│  │     - Size limits enforced                                          │   │
│  │                                                                      │   │
│  │  3. Recipient Lists:                                                 │   │
│  │     - Email addresses validated format                              │   │
│  │     - Logged with truncation (first 3 chars only)                   │   │
│  │     - Count tracked for metrics                                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Header Security                                   │   │
│  │                                                                      │   │
│  │  Headers Logged:                                                     │   │
│  │  - Content-Type, Content-Length                                     │   │
│  │  - X-SES-Message-ID (response)                                      │   │
│  │  - Configuration-Set-Name                                           │   │
│  │                                                                      │   │
│  │  Headers NEVER Logged:                                               │   │
│  │  - Authorization (signature)                                        │   │
│  │  - X-Amz-Security-Token (session token)                             │   │
│  │  - Reply-To, Return-Path (may contain PII)                          │   │
│  │  - Custom headers with sensitive data                               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Tracing Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DISTRIBUTED TRACING                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Span Hierarchy:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ses.operation (root span)                                           │   │
│  │  ├── ses.credential_resolution                                       │   │
│  │  │   └── ses.credential_provider.{type}                              │   │
│  │  ├── ses.request_build                                               │   │
│  │  │   ├── ses.signing.canonical_request                               │   │
│  │  │   └── ses.signing.signature                                       │   │
│  │  ├── ses.http_request                                                │   │
│  │  │   ├── ses.connection_acquire                                      │   │
│  │  │   ├── ses.request_send                                            │   │
│  │  │   └── ses.response_receive                                        │   │
│  │  ├── ses.retry (if applicable)                                       │   │
│  │  │   └── ses.retry_delay                                             │   │
│  │  └── ses.response_parse                                              │   │
│  │      └── ses.json_parse                                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Span Attributes (OpenTelemetry Semantic Conventions):                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Required Attributes:                                                │   │
│  │  - rpc.system: "aws-api"                                            │   │
│  │  - rpc.service: "SESv2"                                             │   │
│  │  - rpc.method: "{operation_name}"                                   │   │
│  │  - aws.region: "{region}"                                           │   │
│  │  - aws.request_id: "{x-amzn-requestid}"                             │   │
│  │                                                                      │   │
│  │  SES-Specific Attributes:                                            │   │
│  │  - ses.operation: "{send_email|create_template|...}"                │   │
│  │  - ses.message_id: "{message_id}" (for send operations)             │   │
│  │  - ses.recipient_count: "{count}" (not individual emails)           │   │
│  │  - ses.template_name: "{name}" (for template operations)            │   │
│  │  - ses.identity: "{domain_or_email}" (for identity operations)      │   │
│  │  - ses.config_set: "{name}" (if used)                               │   │
│  │                                                                      │   │
│  │  HTTP Attributes:                                                    │   │
│  │  - http.method: "{GET|POST|PUT|DELETE}"                             │   │
│  │  - http.url: "{sanitized_url}"                                      │   │
│  │  - http.status_code: "{status}"                                     │   │
│  │  - http.request_content_length: "{bytes}"                           │   │
│  │  - http.response_content_length: "{bytes}"                          │   │
│  │                                                                      │   │
│  │  Resilience Attributes:                                              │   │
│  │  - retry.count: "{attempts}"                                        │   │
│  │  - circuit_breaker.state: "{closed|open|half_open}"                 │   │
│  │  - rate_limit.remaining: "{count}"                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          METRICS ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Counter Metrics                                 │   │
│  │                                                                      │   │
│  │  ses_requests_total{operation, status, region}                      │   │
│  │  ses_emails_sent_total{config_set, region}                          │   │
│  │  ses_bulk_emails_sent_total{config_set, region}                     │   │
│  │  ses_errors_total{operation, error_type, region}                    │   │
│  │  ses_retries_total{operation, region}                               │   │
│  │  ses_circuit_breaker_trips_total{}                                  │   │
│  │  ses_rate_limit_hits_total{}                                        │   │
│  │  ses_template_renders_total{template_name}                          │   │
│  │  ses_recipients_total{type} (to, cc, bcc)                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Histogram Metrics                               │   │
│  │                                                                      │   │
│  │  ses_request_duration_seconds{operation, region}                    │   │
│  │    Buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]         │   │
│  │                                                                      │   │
│  │  ses_request_size_bytes{operation}                                  │   │
│  │    Buckets: [1KB, 10KB, 100KB, 1MB, 10MB]                           │   │
│  │                                                                      │   │
│  │  ses_bulk_batch_size{config_set}                                    │   │
│  │    Buckets: [1, 5, 10, 25, 50]                                      │   │
│  │                                                                      │   │
│  │  ses_signing_duration_seconds{}                                     │   │
│  │    Buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01]                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       Gauge Metrics                                  │   │
│  │                                                                      │   │
│  │  ses_active_requests{operation}                                     │   │
│  │  ses_connection_pool_size{}                                         │   │
│  │  ses_connection_pool_available{}                                    │   │
│  │  ses_circuit_breaker_state{} (0=closed, 1=half_open, 2=open)        │   │
│  │  ses_credential_expiry_seconds{}                                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Logging Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LOGGING ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Log Levels and Content:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ERROR:                                                              │   │
│  │  - Operation failures after all retries exhausted                   │   │
│  │  - Circuit breaker state changes to OPEN                            │   │
│  │  - Authentication/authorization failures                            │   │
│  │  - Message rejection errors                                         │   │
│  │  - Invalid identity errors                                          │   │
│  │                                                                      │   │
│  │  WARN:                                                               │   │
│  │  - Retry attempts (with attempt number)                             │   │
│  │  - Rate limit encountered                                           │   │
│  │  - Credential refresh triggered                                     │   │
│  │  - Slow requests (> threshold)                                      │   │
│  │  - Suppression list matches                                         │   │
│  │  - Bounce/complaint events                                          │   │
│  │                                                                      │   │
│  │  INFO:                                                               │   │
│  │  - Client initialization                                            │   │
│  │  - Email sent successfully (message_id, recipient_count)            │   │
│  │  - Template created/updated/deleted                                 │   │
│  │  - Identity verification status changes                             │   │
│  │  - Circuit breaker state transitions                                │   │
│  │                                                                      │   │
│  │  DEBUG:                                                              │   │
│  │  - Request/response headers (sanitized)                             │   │
│  │  - Credential provider chain resolution                             │   │
│  │  - Connection pool events                                           │   │
│  │  - Retry delay calculations                                         │   │
│  │                                                                      │   │
│  │  TRACE:                                                              │   │
│  │  - Request body structure (not content)                             │   │
│  │  - Signature calculation steps                                      │   │
│  │  - JSON parsing details                                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Structured Log Fields:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  {                                                                   │   │
│  │    "timestamp": "2025-01-15T10:30:00.123Z",                         │   │
│  │    "level": "INFO",                                                  │   │
│  │    "target": "integration_ses::emails",                             │   │
│  │    "message": "Email sent successfully",                            │   │
│  │    "operation": "send_email",                                       │   │
│  │    "region": "us-east-1",                                           │   │
│  │    "message_id": "0102018abc-1234-5678...",                         │   │
│  │    "recipient_count": 3,                                            │   │
│  │    "config_set": "transactional",                                   │   │
│  │    "request_id": "ABCD1234...",                                     │   │
│  │    "duration_ms": 245,                                              │   │
│  │    "status": 200,                                                   │   │
│  │    "retry_count": 0,                                                │   │
│  │    "trace_id": "abc123...",                                         │   │
│  │    "span_id": "def456..."                                           │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Sensitive Data Handling:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  NEVER LOG:                                                          │   │
│  │  - Access keys or secret keys                                       │   │
│  │  - Session tokens                                                   │   │
│  │  - Authorization headers                                            │   │
│  │  - Email body content                                               │   │
│  │  - Full email addresses (truncate to first 3 chars)                 │   │
│  │  - Template data (may contain PII)                                  │   │
│  │                                                                      │   │
│  │  ALWAYS SANITIZE:                                                    │   │
│  │  - URLs (remove query params with signatures)                       │   │
│  │  - Headers (redact authorization)                                   │   │
│  │  - Error messages (remove credential hints)                         │   │
│  │  - Email addresses (show domain only or truncated)                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Health Check Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HEALTH CHECK ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Health Check Flow                                 │   │
│  │                                                                      │   │
│  │  health_check()                                                      │   │
│  │      │                                                               │   │
│  │      ├── Check credential availability                              │   │
│  │      │   └── Can credentials be resolved?                           │   │
│  │      │                                                               │   │
│  │      ├── Check SES connectivity                                     │   │
│  │      │   └── GET account details (lightweight call)                 │   │
│  │      │                                                               │   │
│  │      ├── Check circuit breaker state                                │   │
│  │      │   └── Is circuit open?                                       │   │
│  │      │                                                               │   │
│  │      ├── Check sending quota                                        │   │
│  │      │   └── Is daily quota near limit?                             │   │
│  │      │                                                               │   │
│  │      └── Return HealthStatus                                        │   │
│  │          ├── Healthy: All checks pass                               │   │
│  │          ├── Degraded: Circuit half-open, quota > 80%               │   │
│  │          └── Unhealthy: Cannot connect or authenticate              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Health Response Structure                         │   │
│  │                                                                      │   │
│  │  struct HealthStatus {                                               │   │
│  │      status: HealthState,      // Healthy | Degraded | Unhealthy    │   │
│  │      latency_ms: Option<u64>,  // Last check latency                │   │
│  │      last_check: DateTime,     // When last checked                 │   │
│  │      details: HealthDetails {                                        │   │
│  │          credentials_ok: bool,                                       │   │
│  │          connectivity_ok: bool,                                      │   │
│  │          circuit_breaker_state: CircuitState,                       │   │
│  │          sending_quota: SendingQuota {                              │   │
│  │              max_24_hour: u64,                                      │   │
│  │              sent_24_hour: u64,                                     │   │
│  │              max_send_rate: f64,                                    │   │
│  │          },                                                          │   │
│  │          sandbox_mode: bool,                                        │   │
│  │          error_message: Option<String>,                             │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment & Configuration Architecture

### 9.1 Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION HIERARCHY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Priority (highest to lowest):                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  1. Explicit Code Configuration                                      │   │
│  │     SesClientConfig::builder()                                       │   │
│  │         .region("us-west-2")                                        │   │
│  │         .endpoint("http://localhost:4566")                          │   │
│  │         .build()                                                    │   │
│  │                                                                      │   │
│  │  2. Environment Variables                                            │   │
│  │     AWS_REGION, AWS_DEFAULT_REGION                                  │   │
│  │     AWS_ENDPOINT_URL, AWS_ENDPOINT_URL_SES                          │   │
│  │     SES_MAX_RETRIES, SES_TIMEOUT_MS                                 │   │
│  │                                                                      │   │
│  │  3. Profile Configuration (~/.aws/config)                           │   │
│  │     [profile dev]                                                   │   │
│  │     region = us-east-1                                              │   │
│  │     ses =                                                           │   │
│  │         max_attempts = 5                                            │   │
│  │                                                                      │   │
│  │  4. Default Values (built into client)                              │   │
│  │     region = "us-east-1"                                            │   │
│  │     timeout = 30_000ms                                              │   │
│  │     max_retries = 3                                                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Configuration Schema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION SCHEMA                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SesClientConfig:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Core Settings                                                    │   │
│  │  region: String             // AWS region (default: "us-east-1")    │   │
│  │  endpoint: Option<String>   // Custom endpoint (LocalStack)         │   │
│  │                                                                      │   │
│  │  // Credential Settings                                              │   │
│  │  credentials: Option<Credentials>  // Explicit credentials          │   │
│  │  profile: Option<String>           // Named profile to use          │   │
│  │  use_imds: bool                    // Enable IMDS lookup            │   │
│  │                                                                      │   │
│  │  // Timeout Settings                                                 │   │
│  │  connect_timeout_ms: u64    // Connection timeout (default: 5000)   │   │
│  │  read_timeout_ms: u64       // Read timeout (default: 30000)        │   │
│  │  operation_timeout_ms: u64  // Overall timeout (default: 60000)     │   │
│  │                                                                      │   │
│  │  // Retry Settings                                                   │   │
│  │  max_retries: u32           // Max retry attempts (default: 3)      │   │
│  │  initial_backoff_ms: u64    // Initial backoff (default: 100)       │   │
│  │  max_backoff_ms: u64        // Max backoff (default: 20000)         │   │
│  │  backoff_multiplier: f64    // Backoff multiplier (default: 2.0)    │   │
│  │                                                                      │   │
│  │  // Circuit Breaker Settings                                         │   │
│  │  circuit_failure_threshold: u32  // Failures to open (default: 5)   │   │
│  │  circuit_reset_timeout_ms: u64   // Reset timeout (default: 30000)  │   │
│  │  circuit_half_open_requests: u32 // Test requests (default: 3)      │   │
│  │                                                                      │   │
│  │  // Rate Limit Settings                                              │   │
│  │  rate_limit_rps: Option<u32>     // Requests per second limit       │   │
│  │  rate_limit_burst: Option<u32>   // Burst allowance                 │   │
│  │                                                                      │   │
│  │  // Connection Pool Settings                                         │   │
│  │  max_connections: u32            // Pool size (default: 100)        │   │
│  │  idle_timeout_ms: u64            // Idle connection timeout         │   │
│  │                                                                      │   │
│  │  // SES-Specific Settings                                            │   │
│  │  default_config_set: Option<String>  // Default config set          │   │
│  │  default_from_address: Option<String> // Default sender             │   │
│  │  sandbox_mode: bool              // Enforce sandbox restrictions    │   │
│  │                                                                      │   │
│  │  // TLS Settings                                                     │   │
│  │  verify_ssl: bool                // Verify certificates (true)      │   │
│  │  ca_bundle: Option<PathBuf>      // Custom CA bundle                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Environment Variable Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ENVIRONMENT VARIABLE MAPPING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AWS Standard Variables:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  AWS_ACCESS_KEY_ID          -> credentials.access_key_id            │   │
│  │  AWS_SECRET_ACCESS_KEY      -> credentials.secret_access_key        │   │
│  │  AWS_SESSION_TOKEN          -> credentials.session_token            │   │
│  │  AWS_REGION                 -> region                               │   │
│  │  AWS_DEFAULT_REGION         -> region (fallback)                    │   │
│  │  AWS_PROFILE                -> profile                              │   │
│  │  AWS_ENDPOINT_URL           -> endpoint (global)                    │   │
│  │  AWS_ENDPOINT_URL_SES       -> endpoint (SES-specific)              │   │
│  │  AWS_CA_BUNDLE              -> ca_bundle                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Integration-Specific Variables:                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  SES_INTEGRATION_TIMEOUT_MS           -> operation_timeout_ms       │   │
│  │  SES_INTEGRATION_MAX_RETRIES          -> max_retries                │   │
│  │  SES_INTEGRATION_RATE_LIMIT_RPS       -> rate_limit_rps             │   │
│  │  SES_INTEGRATION_CB_THRESHOLD         -> circuit_failure_threshold  │   │
│  │  SES_INTEGRATION_CB_RESET_MS          -> circuit_reset_timeout_ms   │   │
│  │  SES_INTEGRATION_DEFAULT_CONFIG_SET   -> default_config_set         │   │
│  │  SES_INTEGRATION_DEFAULT_FROM         -> default_from_address       │   │
│  │  SES_INTEGRATION_SANDBOX_MODE         -> sandbox_mode               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.4 Deployment Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DEPLOYMENT PATTERNS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pattern 1: Local Development (LocalStack)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │  │ Application  │─────▶│  SES Client  │─────▶│  LocalStack  │      │   │
│  │  │              │      │              │      │  :4566       │      │   │
│  │  └──────────────┘      └──────────────┘      └──────────────┘      │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - endpoint: "http://localhost:4566"                                │   │
│  │  - verify_ssl: false                                                │   │
│  │  - credentials: static ("test", "test")                             │   │
│  │  - sandbox_mode: true (local testing)                               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pattern 2: AWS EC2/ECS with IAM Role                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │  │ Application  │─────▶│  SES Client  │─────▶│   AWS SES    │      │   │
│  │  │  (EC2/ECS)   │      │  (IMDS creds)│      │              │      │   │
│  │  └──────────────┘      └──────────────┘      └──────────────┘      │   │
│  │        │                                                             │   │
│  │        ▼                                                             │   │
│  │  ┌──────────────┐                                                    │   │
│  │  │    IMDS      │  Credentials auto-refreshed                       │   │
│  │  │  169.254...  │                                                    │   │
│  │  └──────────────┘                                                    │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - region: from IMDS or env                                         │   │
│  │  - credentials: from IMDS (automatic)                               │   │
│  │  - use_imds: true                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pattern 3: Lambda Function                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │  │   Lambda     │─────▶│  SES Client  │─────▶│   AWS SES    │      │   │
│  │  │  Function    │      │  (env creds) │      │              │      │   │
│  │  └──────────────┘      └──────────────┘      └──────────────┘      │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - region: from AWS_REGION env var                                  │   │
│  │  - credentials: from AWS_* env vars (Lambda runtime)                │   │
│  │  - Reduced timeouts (Lambda has 15min limit)                        │   │
│  │  - Consider Lambda provisioned concurrency                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pattern 4: Production with Dedicated IP Pool                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │  │ Application  │─────▶│  SES Client  │─────▶│   AWS SES    │      │   │
│  │  │              │      │  (config set)│      │  (IP Pool)   │      │   │
│  │  └──────────────┘      └──────────────┘      └──────────────┘      │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - default_config_set: "production"                                 │   │
│  │  - IP pool configured in SES                                        │   │
│  │  - Reputation monitoring enabled                                    │   │
│  │  - VDM (Virtual Deliverability Manager) enabled                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Performance Architecture

### 10.1 Connection Pooling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION POOLING ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Connection Pool Design                            │   │
│  │                                                                      │   │
│  │                    ┌─────────────────────────┐                       │   │
│  │                    │    Connection Pool      │                       │   │
│  │                    │    (per endpoint)       │                       │   │
│  │                    │                         │                       │   │
│  │   Request ────────▶│  ┌───┐ ┌───┐ ┌───┐    │────────▶ SES Endpoint  │   │
│  │                    │  │ C │ │ C │ │ C │    │                       │   │
│  │   Request ────────▶│  │ 1 │ │ 2 │ │ 3 │    │────────▶ SES Endpoint  │   │
│  │                    │  └───┘ └───┘ └───┘    │                       │   │
│  │   Request ────────▶│       ...             │────────▶ SES Endpoint  │   │
│  │                    │  ┌───┐ ┌───┐          │                       │   │
│  │                    │  │ C │ │ C │ (idle)   │                       │   │
│  │                    │  │ N │ │...│          │                       │   │
│  │                    │  └───┘ └───┘          │                       │   │
│  │                    └─────────────────────────┘                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pool Configuration:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  max_connections: 100        // Max connections per pool            │   │
│  │  min_connections: 0          // Min idle connections                │   │
│  │  idle_timeout: 90s           // Close idle connections after        │   │
│  │  max_lifetime: 300s          // Max connection lifetime             │   │
│  │  connection_timeout: 5s      // Timeout waiting for connection      │   │
│  │                                                                      │   │
│  │  Endpoint Pool:                                                      │   │
│  │  - Regional: email.{region}.amazonaws.com                           │   │
│  │  - Custom endpoint: user-specified                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Bulk Email Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BULK EMAIL OPTIMIZATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Single vs Bulk Send Decision:                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Recipients       Method              Considerations                 │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  1                 send()              Simplest, per-recipient       │   │
│  │  2-50              send_bulk()         Single API call, efficient    │   │
│  │  >50               batched send_bulk() Multiple batches of 50        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Batching Strategy:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Given: 200 recipients                                               │   │
│  │                                                                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │   │
│  │  │ Batch 1 │  │ Batch 2 │  │ Batch 3 │  │ Batch 4 │                │   │
│  │  │ 1-50    │  │ 51-100  │  │ 101-150 │  │ 151-200 │                │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                │   │
│  │       │            │            │            │                       │   │
│  │       └────────────┴────────────┴────────────┘                       │   │
│  │                        │                                             │   │
│  │                        ▼                                             │   │
│  │            ┌───────────────────────┐                                 │   │
│  │            │   Concurrent Execute  │                                 │   │
│  │            │   (respecting rate    │                                 │   │
│  │            │   limits)             │                                 │   │
│  │            └───────────────────────┘                                 │   │
│  │                                                                      │   │
│  │  Concurrency: min(batch_count, configured_concurrency)              │   │
│  │  Default concurrency: 4                                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Template Caching (Client-Side):                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  - Template metadata cached locally                                  │   │
│  │  - Reduces round-trips for template existence checks                │   │
│  │  - TTL: 5 minutes (templates rarely change)                         │   │
│  │  - Invalidated on template update/delete                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CACHING STRATEGY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Credential Cache:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  Credentials {                                               │    │   │
│  │  │    access_key_id: "...",                                    │    │   │
│  │  │    secret_access_key: SecretString,                         │    │   │
│  │  │    session_token: Option<SecretString>,                     │    │   │
│  │  │    expiration: Option<DateTime>,                            │    │   │
│  │  │  }                                                           │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │  Cache Behavior:                                                     │   │
│  │  - Cache until 5 minutes before expiration                          │   │
│  │  - Refresh asynchronously before expiration                         │   │
│  │  - Lock-free reads with RwLock for refresh                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Signing Key Cache:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Key: (date, region, service)                                       │   │
│  │  Value: DerivedSigningKey (kSigning from SigV4)                     │   │
│  │                                                                      │   │
│  │  Cache Behavior:                                                     │   │
│  │  - Cache per calendar day (UTC)                                     │   │
│  │  - Evict on date change                                             │   │
│  │  - Max entries: 10 (multiple regions)                               │   │
│  │                                                                      │   │
│  │  Benefit: Avoid repeated HMAC chain calculation                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Identity Status Cache:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Key: identity (email or domain)                                    │   │
│  │  Value: verification_status, dkim_status                            │   │
│  │                                                                      │   │
│  │  Cache Behavior:                                                     │   │
│  │  - TTL: 5 minutes (status may change)                               │   │
│  │  - Invalidate on identity operations                                │   │
│  │  - Used for pre-send validation                                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.4 Performance Optimizations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PERFORMANCE OPTIMIZATIONS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Request Batching                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Send to multiple recipients in single API call                  │   │
│  │  send_bulk(entries: Vec<BulkEmailEntry>)                            │   │
│  │    └── Single HTTP request for up to 50 recipients                  │   │
│  │                                                                      │   │
│  │  // Suppress multiple addresses                                      │   │
│  │  put_suppressed_destinations(addresses: Vec<String>)                │   │
│  │    └── Batched suppression                                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  2. Parallel Operations                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Parallel bulk batches                                            │   │
│  │  send_bulk_parallel(entries: Vec<BulkEmailEntry>, concurrency: u32) │   │
│  │    └── Concurrent batches with semaphore control                    │   │
│  │                                                                      │   │
│  │  // Parallel identity verification checks                           │   │
│  │  verify_identities_parallel(identities: Vec<String>)                │   │
│  │    └── Concurrent identity lookups                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  3. Memory Efficiency                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Techniques:                                                         │   │
│  │  - Use bytes::Bytes for raw email content                           │   │
│  │  - Avoid cloning email bodies                                       │   │
│  │  - Preallocate JSON buffers when size known                         │   │
│  │  - Reuse signing buffers via thread-local storage                   │   │
│  │                                                                      │   │
│  │  Memory Budgets:                                                     │   │
│  │  - Small email (< 64KB): buffer entirely                            │   │
│  │  - Large email (> 64KB): ensure single allocation                   │   │
│  │  - Raw email (< 10MB): validate size before processing              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  4. Compute Efficiency                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Signing Optimization:                                               │   │
│  │  - Cache signing keys per date/region                               │   │
│  │  - Precompute canonical headers when possible                       │   │
│  │  - Use incremental hash for large bodies                            │   │
│  │                                                                      │   │
│  │  JSON Handling:                                                      │   │
│  │  - Use serde_json for fast serialization                            │   │
│  │  - Skip null fields in serialization                                │   │
│  │  - Use borrowed strings where possible                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Testing Architecture

### 11.1 Test Pyramid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST PYRAMID                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                          ┌───────────────┐                                  │
│                          │   E2E Tests   │  <- AWS/LocalStack               │
│                          │   (few)       │                                  │
│                          └───────────────┘                                  │
│                        ┌───────────────────┐                                │
│                        │ Integration Tests │  <- LocalStack                 │
│                        │   (moderate)      │                                │
│                        └───────────────────┘                                │
│                      ┌───────────────────────┐                              │
│                      │    Contract Tests     │  <- Mock HTTP                │
│                      │   (comprehensive)     │                              │
│                      └───────────────────────┘                              │
│                    ┌───────────────────────────┐                            │
│                    │       Unit Tests          │  <- Pure logic             │
│                    │      (extensive)          │                            │
│                    └───────────────────────────┘                            │
│                                                                             │
│  London-School TDD Focus:                                                   │
│  - Unit tests verify behavior through mocked collaborators                 │
│  - Integration tests verify component composition                          │
│  - Contract tests verify API compatibility                                 │
│  - E2E tests verify deployment correctness                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Mock Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MOCK ARCHITECTURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Mock Layer Structure                              │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                    MockSesClient                             │    │   │
│  │  │                                                              │    │   │
│  │  │  - Implements SesClient trait                                │    │   │
│  │  │  - Records all method calls                                  │    │   │
│  │  │  - Returns configurable responses                            │    │   │
│  │  │  - Supports failure injection                                │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                  MockHttpTransport                           │    │   │
│  │  │                                                              │    │   │
│  │  │  - Implements HttpTransport trait                            │    │   │
│  │  │  - Records HTTP requests                                     │    │   │
│  │  │  - Returns preconfigured responses                           │    │   │
│  │  │  - Simulates network conditions                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │               MockCredentialProvider                         │    │   │
│  │  │                                                              │    │   │
│  │  │  - Implements CredentialProvider trait                       │    │   │
│  │  │  - Returns static credentials                                │    │   │
│  │  │  - Simulates credential expiration                           │    │   │
│  │  │  - Tests refresh behavior                                    │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Mock Capabilities:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Call Recording:                                                     │   │
│  │  - Capture all method invocations                                   │   │
│  │  - Record parameters passed                                         │   │
│  │  - Track call order                                                 │   │
│  │  - Count invocations                                                │   │
│  │                                                                      │   │
│  │  Response Configuration:                                             │   │
│  │  - Set success responses                                            │   │
│  │  - Configure error responses                                        │   │
│  │  - Sequence of responses                                            │   │
│  │  - Conditional responses based on input                             │   │
│  │                                                                      │   │
│  │  Failure Injection:                                                  │   │
│  │  - Network timeouts                                                 │   │
│  │  - Connection errors                                                │   │
│  │  - HTTP errors (4xx, 5xx)                                           │   │
│  │  - Slow responses                                                   │   │
│  │  - Throttling responses (429)                                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Error Recovery Architecture

### 12.1 Error Classification & Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ERROR CLASSIFICATION & RECOVERY                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Error Decision Tree                               │   │
│  │                                                                      │   │
│  │                        ┌─────────┐                                   │   │
│  │                        │  Error  │                                   │   │
│  │                        └────┬────┘                                   │   │
│  │                             │                                        │   │
│  │              ┌──────────────┼──────────────┐                        │   │
│  │              ▼              ▼              ▼                        │   │
│  │        ┌──────────┐  ┌──────────┐  ┌──────────┐                    │   │
│  │        │ Retryable│  │ Terminal │  │  Client  │                    │   │
│  │        │  Error   │  │  Error   │  │  Error   │                    │   │
│  │        └────┬─────┘  └────┬─────┘  └────┬─────┘                    │   │
│  │             │             │             │                           │   │
│  │             ▼             ▼             ▼                           │   │
│  │        ┌──────────┐  ┌──────────┐  ┌──────────┐                    │   │
│  │        │  Retry   │  │  Return  │  │  Return  │                    │   │
│  │        │ w/backoff│  │  Error   │  │  Error   │                    │   │
│  │        └──────────┘  └──────────┘  └──────────┘                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Retryable Errors:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  HTTP 500, 502, 503, 504    -> Service errors, retry                │   │
│  │  HTTP 429 (TooManyRequests) -> Rate limit, retry with backoff       │   │
│  │  Connection timeout          -> Network issue, retry                │   │
│  │  Connection reset            -> Network issue, retry                │   │
│  │  ServiceUnavailable          -> SES unavailable, retry              │   │
│  │  Throttling                  -> Throttled, exponential backoff      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Terminal Errors (Never Retry):                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  HTTP 400 BadRequest         -> Invalid request format              │   │
│  │  HTTP 403 Forbidden          -> Access denied                       │   │
│  │  HTTP 404 NotFound           -> Resource doesn't exist              │   │
│  │  MessageRejected             -> Content rejected                    │   │
│  │  MailFromDomainNotVerified   -> Identity not verified               │   │
│  │  ConfigurationSetNotFound    -> Config set doesn't exist            │   │
│  │  TemplateNotFound            -> Template doesn't exist              │   │
│  │  AccountSuspended            -> Account issue                       │   │
│  │  InvalidParameterValue       -> Bad parameter                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Bulk Email Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   BULK EMAIL ERROR HANDLING                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Per-Recipient Status                              │   │
│  │                                                                      │   │
│  │  send_bulk() returns:                                                │   │
│  │  BulkEmailOutput {                                                   │   │
│  │      bulk_email_entry_results: Vec<BulkEmailEntryResult>,           │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  BulkEmailEntryResult {                                              │   │
│  │      status: Success | Failed,                                       │   │
│  │      error: Option<BulkEmailError>,                                  │   │
│  │      message_id: Option<String>,                                     │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Error Handling Pattern:                                             │   │
│  │  - Collect failed entries                                           │   │
│  │  - Retry with exponential backoff for transient failures            │   │
│  │  - Report permanent failures to caller                              │   │
│  │  - Track partial success metrics                                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Retry Strategy for Bulk:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  1. Send bulk batch                                                  │   │
│  │  2. Check results                                                    │   │
│  │     - If all success: return                                        │   │
│  │     - If partial failure:                                           │   │
│  │       a. Collect failed entries                                     │   │
│  │       b. Check if errors are retryable                              │   │
│  │       c. If retryable: wait and retry with failed subset            │   │
│  │       d. If not retryable: add to permanent failures                │   │
│  │  3. Repeat until max retries or all permanent failures              │   │
│  │  4. Return combined results (successes + failures)                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Cross-Cutting Concerns

### 13.1 Thread Safety

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THREAD SAFETY MODEL                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SesClient: Send + Sync                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  - All public methods take &self (immutable reference)              │   │
│  │  - Internal state protected by appropriate synchronization          │   │
│  │  - Safe to share across threads via Arc<SesClient>                  │   │
│  │  - Safe to use from async tasks                                     │   │
│  │                                                                      │   │
│  │  Synchronization Primitives:                                         │   │
│  │  - tokio::sync::RwLock for credential cache                         │   │
│  │  - std::sync::atomic for circuit breaker counters                   │   │
│  │  - tokio::sync::Semaphore for concurrency limiting                  │   │
│  │  - OnceCell for lazy service initialization                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Resource Cleanup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESOURCE CLEANUP                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  RAII Pattern:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  impl Drop for SesClient {                                           │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          // Close connection pool gracefully                        │   │
│  │          // Clear cached credentials                                │   │
│  │          // Flush metrics/logs                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for AwsCredentials {                                      │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          self.secret_access_key.zeroize();                          │   │
│  │          if let Some(token) = &mut self.session_token {             │   │
│  │              token.zeroize();                                       │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Architecture Decision Records

### ADR-001: Hexagonal Architecture

**Status**: Accepted

**Context**: Need a flexible architecture that supports testing, multiple deployment scenarios, and future extensions.

**Decision**: Use Hexagonal Architecture (Ports and Adapters) with:
- Core domain logic isolated from external concerns
- Ports (traits) defining boundaries
- Adapters implementing external integrations

**Consequences**:
- (+) Easy to test via mock adapters
- (+) Supports multiple credential providers
- (+) Easy to swap HTTP clients
- (-) More interfaces to maintain
- (-) Slight indirection overhead

### ADR-002: London-School TDD

**Status**: Accepted

**Context**: Need comprehensive test coverage that's fast to run and reliable.

**Decision**: Apply London-School TDD:
- Test behavior through mocked collaborators
- Avoid testing implementation details
- Use interface-based design for testability

**Consequences**:
- (+) Fast test execution (no network)
- (+) Tests isolated from SES availability
- (+) Clear behavior specifications
- (-) More mock setup code
- (-) Risk of testing mocks, not behavior

### ADR-003: SES v2 API Only

**Status**: Accepted

**Context**: SES has v1 and v2 APIs with different features and endpoints.

**Decision**: Use only SES v2 API (sesv2):
- More modern API with better features
- Support for contact lists, VDM
- Consistent JSON-based interface

**Consequences**:
- (+) Access to latest SES features
- (+) Simpler codebase (one API version)
- (+) Better long-term maintainability
- (-) Cannot support legacy v1 features
- (-) Different endpoint from v1 integrations

### ADR-004: Credential Chain Pattern

**Status**: Accepted

**Context**: AWS credentials can come from multiple sources with different precedence rules.

**Decision**: Implement credential chain:
1. Explicit credentials
2. Environment variables
3. Profile file
4. IMDS (EC2/ECS)

**Consequences**:
- (+) Flexible for different deployment scenarios
- (+) AWS SDK compatible behavior
- (+) Supports temporary credentials
- (-) More complex initialization
- (-) IMDS adds latency in EC2

### ADR-005: Service Accessor Pattern

**Status**: Accepted

**Context**: Need to organize multiple SES service domains (emails, templates, identities, etc.).

**Decision**: Use service accessor pattern with lazy initialization:
- `client.emails().send()`
- `client.templates().create()`
- Services created on first access via OnceCell

**Consequences**:
- (+) Clean API organization
- (+) Memory efficient (unused services not created)
- (+) Easy to extend with new services
- (-) Slight overhead on first access
- (-) More indirection in API

---

## 15. Summary

This architecture document defines the complete design for the AWS SES integration module:

1. **Hexagonal Architecture** isolates core logic from external concerns
2. **London-School TDD** enables comprehensive testing without AWS dependencies
3. **Service Accessor Pattern** organizes multiple SES domains cleanly
4. **Credential Chain** supports multiple deployment scenarios
5. **Resilience Patterns** (retry, circuit breaker, rate limiting) ensure reliability
6. **Comprehensive Observability** via tracing, metrics, and structured logging
7. **Security-First Design** with credential protection and email content sanitization
8. **Bulk Email Optimization** for high-throughput email delivery

The architecture supports:
- Local development with LocalStack
- Production deployment on EC2/ECS/Lambda
- High-volume email delivery scenarios
- Template-based personalized emails
- Complete testability without network dependencies
- SES-specific features (identities, configuration sets, suppression)

---

**End of Architecture Phase**

*Proceed to Phase 4: Refinement when ready.*

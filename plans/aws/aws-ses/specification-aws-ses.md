# AWS SES Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-ses`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Purpose and Scope](#2-module-purpose-and-scope)
3. [Dependency Policy](#3-dependency-policy)
4. [API Coverage](#4-api-coverage)
5. [Interface Definitions](#5-interface-definitions)
6. [Error Taxonomy](#6-error-taxonomy)
7. [Resilience Hooks](#7-resilience-hooks)
8. [Security Requirements](#8-security-requirements)
9. [Observability Requirements](#9-observability-requirements)
10. [Performance Requirements](#10-performance-requirements)
11. [Future-Proofing](#11-future-proofing)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements, interfaces, and constraints for the AWS SES (Simple Email Service) Integration Module within the LLM-Dev-Ops Integration Repository. It serves as the authoritative source for what the module must accomplish, providing a production-ready, type-safe interface for interacting with Amazon Simple Email Service.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling
- DevOps engineers configuring email delivery

### 1.3 Methodology

This specification follows:
- **SPARC Methodology**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **SOLID Principles**: Clean, maintainable, extensible design

### 1.4 AWS SES Overview

Amazon Simple Email Service (SES) is a cloud-based email sending service designed to help digital marketers and application developers send marketing, notification, and transactional emails. Key capabilities include:

- **Email Sending**: Send single, bulk, and templated emails via SMTP or API
- **Email Receiving**: Receive and process inbound emails
- **Identity Management**: Verify email addresses and domains
- **Template Management**: Create and manage email templates
- **Configuration Sets**: Group email settings for tracking and analytics
- **Suppression Lists**: Manage bounce and complaint handling
- **Event Publishing**: Send email events to SNS, CloudWatch, Kinesis, or Firehose

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The AWS SES Integration Module provides a production-ready, type-safe interface for interacting with Amazon SES email service. It abstracts HTTP communication via the SES v2 API, handles AWS authentication (Signature V4), manages resilience patterns, and provides comprehensive observability—all while maintaining clean dependency boundaries.

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Email Sending** | Type-safe wrappers for sending single, bulk, and templated emails |
| **Template Management** | Create, update, delete, and list email templates |
| **Identity Management** | Verify and manage email addresses and domains |
| **Configuration Sets** | Create and manage configuration sets for email tracking |
| **Suppression Management** | Manage account and configuration-set level suppression lists |
| **Event Destinations** | Configure event destinations for email tracking |
| **Contact Lists** | Manage contact lists and contacts for bulk email |
| **Authentication** | AWS Signature V4 signing with secure credential handling |
| **Transport** | HTTP/HTTPS communication with connection pooling |
| **Resilience Integration** | Hooks for retry, circuit breaker, and rate limiting primitives |
| **Observability** | Tracing spans, metrics emission, structured logging |
| **Error Mapping** | Translation of SES errors to typed domain errors |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Email Sending | SendEmail, SendBulkEmail, SendCustomVerificationEmail |
| Templates | CreateEmailTemplate, UpdateEmailTemplate, DeleteEmailTemplate, GetEmailTemplate, ListEmailTemplates |
| Identities | CreateEmailIdentity, GetEmailIdentity, DeleteEmailIdentity, ListEmailIdentities, PutEmailIdentityDkimAttributes, PutEmailIdentityMailFromAttributes |
| Configuration Sets | CreateConfigurationSet, GetConfigurationSet, DeleteConfigurationSet, ListConfigurationSets, PutConfigurationSetDeliveryOptions, PutConfigurationSetReputationOptions, PutConfigurationSetSendingOptions, PutConfigurationSetSuppressionOptions, PutConfigurationSetTrackingOptions |
| Event Destinations | CreateConfigurationSetEventDestination, UpdateConfigurationSetEventDestination, DeleteConfigurationSetEventDestination, GetConfigurationSetEventDestinations |
| Suppression | PutSuppressedDestination, GetSuppressedDestination, DeleteSuppressedDestination, ListSuppressedDestinations, PutAccountSuppressionAttributes |
| Contact Lists | CreateContactList, GetContactList, UpdateContactList, DeleteContactList, ListContactLists |
| Contacts | CreateContact, GetContact, UpdateContact, DeleteContact, ListContacts |
| Account | GetAccount, PutAccountDedicatedIpWarmupAttributes, PutAccountDetails, PutAccountSendingAttributes |
| Custom Verification Emails | CreateCustomVerificationEmailTemplate, UpdateCustomVerificationEmailTemplate, DeleteCustomVerificationEmailTemplate, GetCustomVerificationEmailTemplate, ListCustomVerificationEmailTemplates |
| Dedicated IPs | GetDedicatedIp, GetDedicatedIps, PutDedicatedIpInPool, PutDedicatedIpWarmupAttributes |
| IP Pools | CreateDedicatedIpPool, GetDedicatedIpPool, DeleteDedicatedIpPool, ListDedicatedIpPools |
| Deliverability Dashboard | GetDeliverabilityDashboardOptions, PutDeliverabilityDashboardOption, GetDeliverabilityTestReport, ListDeliverabilityTestReports, CreateDeliverabilityTestReport, GetDomainStatisticsReport, GetDomainDeliverabilityCampaign, ListDomainDeliverabilityCampaigns |
| Import Jobs | CreateImportJob, GetImportJob, ListImportJobs |
| Export Jobs | CreateExportJob, GetExportJob, ListExportJobs |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Other AWS services | Separate integration modules (S3, SNS, SQS, etc.) |
| ruvbase (Layer 0) | External dependency, not implemented here |
| SMTP Interface | API-only integration, SMTP requires separate transport |
| Email Receiving (v1) | Using SES v2 API only; receiving is configured via AWS Console |
| Receipt Rules | Legacy v1 API feature; use EventBridge for new implementations |
| IP Pool Management (advanced) | Complex dedicated IP management beyond basic operations |
| VDM (Virtual Deliverability Manager) | Premium feature requiring separate subscription |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| No direct HTTP client dependency exposure | Encapsulation, testability |
| Async-first design | I/O-bound operations, efficiency |
| Zero `unsafe` in public API (Rust) | Safety guarantees |
| No panics in production paths | Reliability |
| Trait-based abstractions | London-School TDD, mockability |
| Semantic versioning | API stability |
| AWS Signature V4 only | Industry standard, required by SES |
| SES API v2 only | Modern API with full feature coverage |

---

## 3. Dependency Policy

### 3.1 Allowed Dependencies

The module may depend ONLY on the following Integration Repo primitives:

| Primitive | Purpose | Import Path |
|-----------|---------|-------------|
| `integrations-errors` | Base error types and traits | `integrations_errors` |
| `integrations-retry` | Retry executor with backoff strategies | `integrations_retry` |
| `integrations-circuit-breaker` | Circuit breaker state machine | `integrations_circuit_breaker` |
| `integrations-rate-limit` | Rate limiting (token bucket, sliding window) | `integrations_rate_limit` |
| `integrations-tracing` | Distributed tracing abstraction | `integrations_tracing` |
| `integrations-logging` | Structured logging abstraction | `integrations_logging` |
| `integrations-types` | Shared type definitions | `integrations_types` |
| `integrations-config` | Configuration management | `integrations_config` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.11+ | HTTP client (behind transport trait) |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffer handling |
| `futures` | 0.3+ | Stream utilities |
| `ring` | 0.17+ | HMAC-SHA256 for AWS Signature V4 |
| `hex` | 0.4+ | Hexadecimal encoding |
| `base64` | 0.21+ | Base64 encoding for attachments |
| `chrono` | 0.4+ | Date/time handling for signatures |
| `percent-encoding` | 2.x | URL encoding for signatures |
| `sha2` | 0.10+ | SHA256 for payload hashing |
| `mime` | 0.3+ | MIME type handling |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `node-fetch` / native fetch | Latest | HTTP client |
| `zod` | 3.x | Runtime type validation |
| `@noble/hashes` | 1.x | SHA256, HMAC for signing |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `ruvbase` | Layer 0, external to this module |
| `@aws-sdk/client-ses` | This module IS the SES integration |
| `@aws-sdk/client-sesv2` | This module IS the SES integration |
| `aws-sdk-ses` | This module IS the SES integration |
| `integrations-openai` | No cross-integration dependencies |
| `integrations-anthropic` | No cross-integration dependencies |
| `integrations-s3` | No cross-integration dependencies |
| Any other integration module | Isolated module design |

---

## 4. API Coverage

### 4.1 Email Sending Operations

#### 4.1.1 SendEmail

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/outbound-emails` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |
| Idempotency | No (each call sends a new email) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from_email_address` | string | No | Sender email address (uses default if not specified) |
| `from_email_address_identity_arn` | string | No | ARN of identity to use for From address |
| `destination` | object | Yes | Recipient addresses |
| `destination.to_addresses` | array | No | To recipients |
| `destination.cc_addresses` | array | No | CC recipients |
| `destination.bcc_addresses` | array | No | BCC recipients |
| `reply_to_addresses` | array | No | Reply-to addresses |
| `feedback_forwarding_email_address` | string | No | Email for bounce/complaint feedback |
| `feedback_forwarding_email_address_identity_arn` | string | No | ARN for feedback address |
| `content` | object | Yes | Email content (simple, raw, or template) |
| `email_tags` | array | No | Name-value pairs for tracking |
| `configuration_set_name` | string | No | Configuration set for tracking |
| `list_management_options` | object | No | Contact list management options |

**Content Types (one required):**

| Content Type | Description |
|--------------|-------------|
| `simple` | Simple email with subject and body (text/HTML) |
| `raw` | Raw MIME message |
| `template` | Email template with replacement data |

**Simple Content:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | object | Yes | Subject with data and charset |
| `body` | object | Yes | Body with text and/or HTML content |
| `headers` | array | No | Custom email headers |

**Template Content:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `template_name` | string | Yes* | Name of template in SES |
| `template_arn` | string | Yes* | ARN of template |
| `template_data` | string | Yes | JSON string of replacement data |
| `headers` | array | No | Custom email headers |

*One of `template_name` or `template_arn` required.

**Raw Content:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | bytes | Yes | Base64-encoded MIME message |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `message_id` | string | Unique identifier for the message |

#### 4.1.2 SendBulkEmail

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/outbound-bulk-emails` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |
| Max Destinations | 50 per request |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from_email_address` | string | No | Sender email address |
| `from_email_address_identity_arn` | string | No | ARN of sender identity |
| `reply_to_addresses` | array | No | Reply-to addresses |
| `feedback_forwarding_email_address` | string | No | Feedback email address |
| `feedback_forwarding_email_address_identity_arn` | string | No | ARN for feedback address |
| `default_email_tags` | array | No | Default tags for all emails |
| `default_content` | object | Yes | Default template content |
| `bulk_email_entries` | array | Yes | List of individual email entries |
| `configuration_set_name` | string | No | Configuration set name |

**Bulk Email Entry:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `destination` | object | Yes | Recipient addresses |
| `replacement_tags` | array | No | Override tags for this entry |
| `replacement_email_content` | object | No | Override content for this entry |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `bulk_email_entry_results` | array | Results for each entry |

**Bulk Email Entry Result:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | enum | SUCCESS, MESSAGE_REJECTED, MAIL_FROM_DOMAIN_NOT_VERIFIED, etc. |
| `error` | string | Error message if failed |
| `message_id` | string | Message ID if successful |

### 4.2 Template Operations

#### 4.2.1 CreateEmailTemplate

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/templates` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `template_name` | string | Yes | Unique template name |
| `template_content` | object | Yes | Template content |

**Template Content:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | string | Yes | Subject line (supports replacement tags) |
| `text` | string | No | Plain text body |
| `html` | string | No | HTML body |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.2.2 GetEmailTemplate

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/templates/{TemplateName}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `TemplateName` | string | Yes | Template name |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `template_name` | string | Template name |
| `template_content` | object | Template content (subject, text, html) |

#### 4.2.3 UpdateEmailTemplate

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/templates/{TemplateName}` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `TemplateName` | string | Yes | Template name |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `template_content` | object | Yes | Updated template content |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.2.4 DeleteEmailTemplate

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /v2/email/templates/{TemplateName}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `TemplateName` | string | Yes | Template name |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.2.5 ListEmailTemplates

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/templates` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |
| Pagination | Token-based |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `NextToken` | string | No | Pagination token |
| `PageSize` | integer | No | Results per page (max 100) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `templates_metadata` | array | List of template metadata |
| `next_token` | string | Token for next page |

**Template Metadata:**

| Field | Type | Description |
|-------|------|-------------|
| `template_name` | string | Template name |
| `created_timestamp` | datetime | Creation time |

### 4.3 Identity Operations

#### 4.3.1 CreateEmailIdentity

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/identities` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_identity` | string | Yes | Email address or domain |
| `tags` | array | No | Resource tags |
| `dkim_signing_attributes` | object | No | DKIM configuration |
| `configuration_set_name` | string | No | Associated configuration set |

**DKIM Signing Attributes:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain_signing_selector` | string | No | BYODKIM selector |
| `domain_signing_private_key` | string | No | BYODKIM private key |
| `next_signing_key_length` | enum | No | EASY_DKIM key length (RSA_1024_BIT, RSA_2048_BIT) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `identity_type` | enum | EMAIL_ADDRESS or DOMAIN |
| `verified_for_sending_status` | boolean | Whether identity is verified |
| `dkim_attributes` | object | DKIM configuration status |

#### 4.3.2 GetEmailIdentity

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/identities/{EmailIdentity}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `EmailIdentity` | string | Yes | Email address or domain |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `identity_type` | enum | EMAIL_ADDRESS or DOMAIN |
| `feedback_forwarding_status` | boolean | Feedback forwarding enabled |
| `verified_for_sending_status` | boolean | Verified for sending |
| `dkim_attributes` | object | DKIM status and configuration |
| `mail_from_attributes` | object | Custom MAIL FROM configuration |
| `policies` | map | Authorization policies |
| `tags` | array | Resource tags |
| `configuration_set_name` | string | Associated configuration set |
| `verification_status` | enum | PENDING, SUCCESS, FAILED, TEMPORARY_FAILURE, NOT_STARTED |
| `verification_info` | object | Verification details (for domains) |

#### 4.3.3 DeleteEmailIdentity

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /v2/email/identities/{EmailIdentity}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `EmailIdentity` | string | Yes | Email address or domain |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.3.4 ListEmailIdentities

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/identities` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |
| Pagination | Token-based |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `NextToken` | string | No | Pagination token |
| `PageSize` | integer | No | Results per page (max 1000) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `email_identities` | array | List of identity info |
| `next_token` | string | Token for next page |

**Email Identity Info:**

| Field | Type | Description |
|-------|------|-------------|
| `identity_type` | enum | EMAIL_ADDRESS or DOMAIN |
| `identity_name` | string | Email address or domain name |
| `sending_enabled` | boolean | Whether sending is enabled |
| `verification_status` | enum | Verification status |

#### 4.3.5 PutEmailIdentityDkimAttributes

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/identities/{EmailIdentity}/dkim` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `EmailIdentity` | string | Yes | Email address or domain |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `signing_enabled` | boolean | No | Enable/disable DKIM signing |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.3.6 PutEmailIdentityMailFromAttributes

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/identities/{EmailIdentity}/mail-from` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `EmailIdentity` | string | Yes | Email address or domain |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mail_from_domain` | string | No | Custom MAIL FROM domain |
| `behavior_on_mx_failure` | enum | No | USE_DEFAULT_VALUE or REJECT_MESSAGE |

**Response Fields:**

Empty response on success (HTTP 200).

### 4.4 Configuration Set Operations

#### 4.4.1 CreateConfigurationSet

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/configuration-sets` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `configuration_set_name` | string | Yes | Configuration set name |
| `tracking_options` | object | No | Open/click tracking settings |
| `delivery_options` | object | No | Delivery settings |
| `reputation_options` | object | No | Reputation tracking settings |
| `sending_options` | object | No | Sending enabled/disabled |
| `tags` | array | No | Resource tags |
| `suppression_options` | object | No | Suppression list settings |
| `vdm_options` | object | No | Virtual Deliverability Manager settings |

**Tracking Options:**

| Field | Type | Description |
|-------|------|-------------|
| `custom_redirect_domain` | string | Custom domain for click tracking |

**Delivery Options:**

| Field | Type | Description |
|-------|------|-------------|
| `tls_policy` | enum | REQUIRE or OPTIONAL |
| `sending_pool_name` | string | Dedicated IP pool name |

**Reputation Options:**

| Field | Type | Description |
|-------|------|-------------|
| `reputation_metrics_enabled` | boolean | Enable reputation metrics |
| `last_fresh_start` | datetime | Last reputation reset |

**Sending Options:**

| Field | Type | Description |
|-------|------|-------------|
| `sending_enabled` | boolean | Whether sending is enabled |

**Suppression Options:**

| Field | Type | Description |
|-------|------|-------------|
| `suppressed_reasons` | array | Reasons for suppression (BOUNCE, COMPLAINT) |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.4.2 GetConfigurationSet

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/configuration-sets/{ConfigurationSetName}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ConfigurationSetName` | string | Yes | Configuration set name |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `configuration_set_name` | string | Configuration set name |
| `tracking_options` | object | Tracking settings |
| `delivery_options` | object | Delivery settings |
| `reputation_options` | object | Reputation settings |
| `sending_options` | object | Sending settings |
| `tags` | array | Resource tags |
| `suppression_options` | object | Suppression settings |
| `vdm_options` | object | VDM settings |

#### 4.4.3 DeleteConfigurationSet

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /v2/email/configuration-sets/{ConfigurationSetName}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ConfigurationSetName` | string | Yes | Configuration set name |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.4.4 ListConfigurationSets

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/configuration-sets` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |
| Pagination | Token-based |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `NextToken` | string | No | Pagination token |
| `PageSize` | integer | No | Results per page (max 1000) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `configuration_sets` | array | List of configuration set names |
| `next_token` | string | Token for next page |

### 4.5 Event Destination Operations

#### 4.5.1 CreateConfigurationSetEventDestination

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/configuration-sets/{ConfigurationSetName}/event-destinations` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ConfigurationSetName` | string | Yes | Configuration set name |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event_destination_name` | string | Yes | Event destination name |
| `event_destination` | object | Yes | Destination configuration |

**Event Destination:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | No | Whether enabled |
| `matching_event_types` | array | Yes | Event types to capture |
| `kinesis_firehose_destination` | object | No | Firehose destination |
| `cloud_watch_destination` | object | No | CloudWatch destination |
| `sns_destination` | object | No | SNS destination |
| `pinpoint_destination` | object | No | Pinpoint destination |

**Matching Event Types:**

| Value | Description |
|-------|-------------|
| `SEND` | Email was sent |
| `REJECT` | Email was rejected |
| `BOUNCE` | Email bounced |
| `COMPLAINT` | Recipient complained |
| `DELIVERY` | Email was delivered |
| `OPEN` | Email was opened |
| `CLICK` | Link was clicked |
| `RENDERING_FAILURE` | Template rendering failed |
| `DELIVERY_DELAY` | Delivery was delayed |
| `SUBSCRIPTION` | Subscription preference changed |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.5.2 GetConfigurationSetEventDestinations

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/configuration-sets/{ConfigurationSetName}/event-destinations` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ConfigurationSetName` | string | Yes | Configuration set name |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `event_destinations` | array | List of event destinations |

#### 4.5.3 UpdateConfigurationSetEventDestination

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/configuration-sets/{ConfigurationSetName}/event-destinations/{EventDestinationName}` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ConfigurationSetName` | string | Yes | Configuration set name |
| `EventDestinationName` | string | Yes | Event destination name |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event_destination` | object | Yes | Updated destination configuration |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.5.4 DeleteConfigurationSetEventDestination

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /v2/email/configuration-sets/{ConfigurationSetName}/event-destinations/{EventDestinationName}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ConfigurationSetName` | string | Yes | Configuration set name |
| `EventDestinationName` | string | Yes | Event destination name |

**Response Fields:**

Empty response on success (HTTP 200).

### 4.6 Suppression List Operations

#### 4.6.1 PutSuppressedDestination

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/suppression/addresses` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_address` | string | Yes | Email address to suppress |
| `reason` | enum | Yes | BOUNCE or COMPLAINT |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.6.2 GetSuppressedDestination

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/suppression/addresses/{EmailAddress}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `EmailAddress` | string | Yes | Suppressed email address |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `suppressed_destination` | object | Suppression details |

**Suppressed Destination:**

| Field | Type | Description |
|-------|------|-------------|
| `email_address` | string | Suppressed email address |
| `reason` | enum | BOUNCE or COMPLAINT |
| `last_update_time` | datetime | Last update time |
| `attributes` | object | Additional attributes |

#### 4.6.3 DeleteSuppressedDestination

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /v2/email/suppression/addresses/{EmailAddress}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `EmailAddress` | string | Yes | Email address to unsuppress |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.6.4 ListSuppressedDestinations

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/suppression/addresses` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |
| Pagination | Token-based |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `NextToken` | string | No | Pagination token |
| `PageSize` | integer | No | Results per page (max 1000) |
| `Reasons` | array | No | Filter by reason |
| `StartDate` | datetime | No | Start date filter |
| `EndDate` | datetime | No | End date filter |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `suppressed_destination_summaries` | array | List of suppressed destinations |
| `next_token` | string | Token for next page |

### 4.7 Contact List Operations

#### 4.7.1 CreateContactList

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/contact-lists` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contact_list_name` | string | Yes | Contact list name |
| `topics` | array | No | Subscription topics |
| `description` | string | No | Description |
| `tags` | array | No | Resource tags |

**Topic:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic_name` | string | Yes | Topic name |
| `display_name` | string | Yes | Display name |
| `description` | string | No | Topic description |
| `default_subscription_status` | enum | Yes | OPT_IN or OPT_OUT |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.7.2 GetContactList

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/contact-lists/{ContactListName}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `contact_list_name` | string | Contact list name |
| `topics` | array | Subscription topics |
| `description` | string | Description |
| `created_timestamp` | datetime | Creation time |
| `last_updated_timestamp` | datetime | Last update time |
| `tags` | array | Resource tags |

#### 4.7.3 UpdateContactList

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/contact-lists/{ContactListName}` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `topics` | array | No | Updated topics |
| `description` | string | No | Updated description |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.7.4 DeleteContactList

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /v2/email/contact-lists/{ContactListName}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.7.5 ListContactLists

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/contact-lists` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |
| Pagination | Token-based |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `NextToken` | string | No | Pagination token |
| `PageSize` | integer | No | Results per page (max 1000) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `contact_lists` | array | List of contact list info |
| `next_token` | string | Token for next page |

### 4.8 Contact Operations

#### 4.8.1 CreateContact

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v2/email/contact-lists/{ContactListName}/contacts` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_address` | string | Yes | Contact email address |
| `topic_preferences` | array | No | Topic subscription preferences |
| `unsubscribe_all` | boolean | No | Unsubscribe from all topics |
| `attributes_data` | string | No | JSON attributes |

**Topic Preference:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic_name` | string | Yes | Topic name |
| `subscription_status` | enum | Yes | OPT_IN or OPT_OUT |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.8.2 GetContact

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/contact-lists/{ContactListName}/contacts/{EmailAddress}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |
| `EmailAddress` | string | Yes | Contact email address |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `contact_list_name` | string | Contact list name |
| `email_address` | string | Email address |
| `topic_preferences` | array | Topic preferences |
| `topic_default_preferences` | array | Default topic preferences |
| `unsubscribe_all` | boolean | Unsubscribed from all |
| `attributes_data` | string | JSON attributes |
| `created_timestamp` | datetime | Creation time |
| `last_updated_timestamp` | datetime | Last update time |

#### 4.8.3 UpdateContact

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/contact-lists/{ContactListName}/contacts/{EmailAddress}` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |
| `EmailAddress` | string | Yes | Contact email address |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `topic_preferences` | array | No | Updated topic preferences |
| `unsubscribe_all` | boolean | No | Unsubscribe from all |
| `attributes_data` | string | No | Updated JSON attributes |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.8.4 DeleteContact

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /v2/email/contact-lists/{ContactListName}/contacts/{EmailAddress}` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |
| `EmailAddress` | string | Yes | Contact email address |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.8.5 ListContacts

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/contact-lists/{ContactListName}/contacts` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |
| Pagination | Token-based |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ContactListName` | string | Yes | Contact list name |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `NextToken` | string | No | Pagination token |
| `PageSize` | integer | No | Results per page (max 1000) |

**Request Body (optional filter):**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter` | object | No | Contact filter |
| `filter.filtered_status` | enum | No | OPT_IN or OPT_OUT |
| `filter.topic_filter` | object | No | Topic filter |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `contacts` | array | List of contacts |
| `next_token` | string | Token for next page |

### 4.9 Account Operations

#### 4.9.1 GetAccount

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v2/email/account` |
| Authentication | AWS Signature V4 |
| Response Format | JSON |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `dedicated_ip_auto_warmup_enabled` | boolean | Auto warmup enabled |
| `enforcement_status` | enum | HEALTHY, PROBATION, SHUTDOWN |
| `production_access_enabled` | boolean | Out of sandbox |
| `send_quota` | object | Sending quota info |
| `sending_enabled` | boolean | Sending enabled |
| `suppression_attributes` | object | Account suppression settings |
| `details` | object | Account details |
| `vdm_attributes` | object | VDM settings |

**Send Quota:**

| Field | Type | Description |
|-------|------|-------------|
| `max_24_hour_send` | double | Max emails per 24 hours |
| `max_send_rate` | double | Max emails per second |
| `sent_last_24_hours` | double | Emails sent in last 24 hours |

#### 4.9.2 PutAccountSendingAttributes

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/account/sending` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sending_enabled` | boolean | No | Enable/disable sending |

**Response Fields:**

Empty response on success (HTTP 200).

#### 4.9.3 PutAccountSuppressionAttributes

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /v2/email/account/suppression` |
| Authentication | AWS Signature V4 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `suppressed_reasons` | array | No | Reasons for suppression (BOUNCE, COMPLAINT) |

**Response Fields:**

Empty response on success (HTTP 200).

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for interacting with AWS SES.
#[async_trait]
pub trait SesClient: Send + Sync {
    /// Access the email sending service.
    fn emails(&self) -> &dyn EmailsService;

    /// Access the templates service.
    fn templates(&self) -> &dyn TemplatesService;

    /// Access the identities service.
    fn identities(&self) -> &dyn IdentitiesService;

    /// Access the configuration sets service.
    fn configuration_sets(&self) -> &dyn ConfigurationSetsService;

    /// Access the suppression service.
    fn suppression(&self) -> &dyn SuppressionService;

    /// Access the contact lists service.
    fn contact_lists(&self) -> &dyn ContactListsService;

    /// Access the contacts service.
    fn contacts(&self) -> &dyn ContactsService;

    /// Access the account service.
    fn account(&self) -> &dyn AccountService;
}

/// Factory for creating SES clients.
pub trait SesClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: SesConfig) -> Result<Arc<dyn SesClient>, SesError>;
}
```

#### 5.1.2 Emails Service Interface

```rust
/// Service for SES email sending operations.
#[async_trait]
pub trait EmailsService: Send + Sync {
    /// Send a single email.
    async fn send(
        &self,
        request: SendEmailRequest,
    ) -> Result<SendEmailOutput, SesError>;

    /// Send bulk emails using a template.
    async fn send_bulk(
        &self,
        request: SendBulkEmailRequest,
    ) -> Result<SendBulkEmailOutput, SesError>;

    /// Send a custom verification email.
    async fn send_custom_verification_email(
        &self,
        request: SendCustomVerificationEmailRequest,
    ) -> Result<SendCustomVerificationEmailOutput, SesError>;
}
```

#### 5.1.3 Templates Service Interface

```rust
/// Service for SES email template operations.
#[async_trait]
pub trait TemplatesService: Send + Sync {
    /// Create a new email template.
    async fn create(
        &self,
        request: CreateEmailTemplateRequest,
    ) -> Result<(), SesError>;

    /// Get an email template.
    async fn get(
        &self,
        template_name: &str,
    ) -> Result<GetEmailTemplateOutput, SesError>;

    /// Update an email template.
    async fn update(
        &self,
        request: UpdateEmailTemplateRequest,
    ) -> Result<(), SesError>;

    /// Delete an email template.
    async fn delete(
        &self,
        template_name: &str,
    ) -> Result<(), SesError>;

    /// List email templates.
    async fn list(
        &self,
        request: ListEmailTemplatesRequest,
    ) -> Result<ListEmailTemplatesOutput, SesError>;

    /// List all templates (auto-pagination).
    fn list_all(
        &self,
        request: ListEmailTemplatesRequest,
    ) -> impl Stream<Item = Result<EmailTemplateMetadata, SesError>> + Send;
}
```

#### 5.1.4 Identities Service Interface

```rust
/// Service for SES identity operations.
#[async_trait]
pub trait IdentitiesService: Send + Sync {
    /// Create an email identity (email address or domain).
    async fn create(
        &self,
        request: CreateEmailIdentityRequest,
    ) -> Result<CreateEmailIdentityOutput, SesError>;

    /// Get email identity details.
    async fn get(
        &self,
        email_identity: &str,
    ) -> Result<GetEmailIdentityOutput, SesError>;

    /// Delete an email identity.
    async fn delete(
        &self,
        email_identity: &str,
    ) -> Result<(), SesError>;

    /// List email identities.
    async fn list(
        &self,
        request: ListEmailIdentitiesRequest,
    ) -> Result<ListEmailIdentitiesOutput, SesError>;

    /// List all identities (auto-pagination).
    fn list_all(
        &self,
        request: ListEmailIdentitiesRequest,
    ) -> impl Stream<Item = Result<IdentityInfo, SesError>> + Send;

    /// Update DKIM attributes for an identity.
    async fn put_dkim_attributes(
        &self,
        request: PutEmailIdentityDkimAttributesRequest,
    ) -> Result<(), SesError>;

    /// Update MAIL FROM attributes for an identity.
    async fn put_mail_from_attributes(
        &self,
        request: PutEmailIdentityMailFromAttributesRequest,
    ) -> Result<(), SesError>;

    /// Put DKIM signing attributes (for BYODKIM).
    async fn put_dkim_signing_attributes(
        &self,
        request: PutEmailIdentityDkimSigningAttributesRequest,
    ) -> Result<PutEmailIdentityDkimSigningAttributesOutput, SesError>;

    /// Create email identity policy.
    async fn create_policy(
        &self,
        request: CreateEmailIdentityPolicyRequest,
    ) -> Result<(), SesError>;

    /// Get email identity policies.
    async fn get_policies(
        &self,
        email_identity: &str,
    ) -> Result<GetEmailIdentityPoliciesOutput, SesError>;

    /// Update email identity policy.
    async fn update_policy(
        &self,
        request: UpdateEmailIdentityPolicyRequest,
    ) -> Result<(), SesError>;

    /// Delete email identity policy.
    async fn delete_policy(
        &self,
        email_identity: &str,
        policy_name: &str,
    ) -> Result<(), SesError>;
}
```

#### 5.1.5 Configuration Sets Service Interface

```rust
/// Service for SES configuration set operations.
#[async_trait]
pub trait ConfigurationSetsService: Send + Sync {
    /// Create a configuration set.
    async fn create(
        &self,
        request: CreateConfigurationSetRequest,
    ) -> Result<(), SesError>;

    /// Get a configuration set.
    async fn get(
        &self,
        configuration_set_name: &str,
    ) -> Result<GetConfigurationSetOutput, SesError>;

    /// Delete a configuration set.
    async fn delete(
        &self,
        configuration_set_name: &str,
    ) -> Result<(), SesError>;

    /// List configuration sets.
    async fn list(
        &self,
        request: ListConfigurationSetsRequest,
    ) -> Result<ListConfigurationSetsOutput, SesError>;

    /// List all configuration sets (auto-pagination).
    fn list_all(
        &self,
        request: ListConfigurationSetsRequest,
    ) -> impl Stream<Item = Result<String, SesError>> + Send;

    /// Update delivery options.
    async fn put_delivery_options(
        &self,
        request: PutConfigurationSetDeliveryOptionsRequest,
    ) -> Result<(), SesError>;

    /// Update reputation options.
    async fn put_reputation_options(
        &self,
        request: PutConfigurationSetReputationOptionsRequest,
    ) -> Result<(), SesError>;

    /// Update sending options.
    async fn put_sending_options(
        &self,
        request: PutConfigurationSetSendingOptionsRequest,
    ) -> Result<(), SesError>;

    /// Update suppression options.
    async fn put_suppression_options(
        &self,
        request: PutConfigurationSetSuppressionOptionsRequest,
    ) -> Result<(), SesError>;

    /// Update tracking options.
    async fn put_tracking_options(
        &self,
        request: PutConfigurationSetTrackingOptionsRequest,
    ) -> Result<(), SesError>;

    /// Create an event destination.
    async fn create_event_destination(
        &self,
        request: CreateConfigurationSetEventDestinationRequest,
    ) -> Result<(), SesError>;

    /// Get event destinations.
    async fn get_event_destinations(
        &self,
        configuration_set_name: &str,
    ) -> Result<GetConfigurationSetEventDestinationsOutput, SesError>;

    /// Update an event destination.
    async fn update_event_destination(
        &self,
        request: UpdateConfigurationSetEventDestinationRequest,
    ) -> Result<(), SesError>;

    /// Delete an event destination.
    async fn delete_event_destination(
        &self,
        configuration_set_name: &str,
        event_destination_name: &str,
    ) -> Result<(), SesError>;
}
```

#### 5.1.6 Suppression Service Interface

```rust
/// Service for SES suppression list operations.
#[async_trait]
pub trait SuppressionService: Send + Sync {
    /// Add an email address to the suppression list.
    async fn put(
        &self,
        request: PutSuppressedDestinationRequest,
    ) -> Result<(), SesError>;

    /// Get a suppressed destination.
    async fn get(
        &self,
        email_address: &str,
    ) -> Result<GetSuppressedDestinationOutput, SesError>;

    /// Delete a suppressed destination.
    async fn delete(
        &self,
        email_address: &str,
    ) -> Result<(), SesError>;

    /// List suppressed destinations.
    async fn list(
        &self,
        request: ListSuppressedDestinationsRequest,
    ) -> Result<ListSuppressedDestinationsOutput, SesError>;

    /// List all suppressed destinations (auto-pagination).
    fn list_all(
        &self,
        request: ListSuppressedDestinationsRequest,
    ) -> impl Stream<Item = Result<SuppressedDestinationSummary, SesError>> + Send;
}
```

#### 5.1.7 Contact Lists Service Interface

```rust
/// Service for SES contact list operations.
#[async_trait]
pub trait ContactListsService: Send + Sync {
    /// Create a contact list.
    async fn create(
        &self,
        request: CreateContactListRequest,
    ) -> Result<(), SesError>;

    /// Get a contact list.
    async fn get(
        &self,
        contact_list_name: &str,
    ) -> Result<GetContactListOutput, SesError>;

    /// Update a contact list.
    async fn update(
        &self,
        request: UpdateContactListRequest,
    ) -> Result<(), SesError>;

    /// Delete a contact list.
    async fn delete(
        &self,
        contact_list_name: &str,
    ) -> Result<(), SesError>;

    /// List contact lists.
    async fn list(
        &self,
        request: ListContactListsRequest,
    ) -> Result<ListContactListsOutput, SesError>;

    /// List all contact lists (auto-pagination).
    fn list_all(
        &self,
        request: ListContactListsRequest,
    ) -> impl Stream<Item = Result<ContactList, SesError>> + Send;
}
```

#### 5.1.8 Contacts Service Interface

```rust
/// Service for SES contact operations.
#[async_trait]
pub trait ContactsService: Send + Sync {
    /// Create a contact.
    async fn create(
        &self,
        request: CreateContactRequest,
    ) -> Result<(), SesError>;

    /// Get a contact.
    async fn get(
        &self,
        contact_list_name: &str,
        email_address: &str,
    ) -> Result<GetContactOutput, SesError>;

    /// Update a contact.
    async fn update(
        &self,
        request: UpdateContactRequest,
    ) -> Result<(), SesError>;

    /// Delete a contact.
    async fn delete(
        &self,
        contact_list_name: &str,
        email_address: &str,
    ) -> Result<(), SesError>;

    /// List contacts.
    async fn list(
        &self,
        request: ListContactsRequest,
    ) -> Result<ListContactsOutput, SesError>;

    /// List all contacts (auto-pagination).
    fn list_all(
        &self,
        request: ListContactsRequest,
    ) -> impl Stream<Item = Result<Contact, SesError>> + Send;
}
```

#### 5.1.9 Account Service Interface

```rust
/// Service for SES account operations.
#[async_trait]
pub trait AccountService: Send + Sync {
    /// Get account details.
    async fn get(&self) -> Result<GetAccountOutput, SesError>;

    /// Update sending attributes.
    async fn put_sending_attributes(
        &self,
        request: PutAccountSendingAttributesRequest,
    ) -> Result<(), SesError>;

    /// Update suppression attributes.
    async fn put_suppression_attributes(
        &self,
        request: PutAccountSuppressionAttributesRequest,
    ) -> Result<(), SesError>;

    /// Update dedicated IP warmup attributes.
    async fn put_dedicated_ip_warmup_attributes(
        &self,
        request: PutAccountDedicatedIpWarmupAttributesRequest,
    ) -> Result<(), SesError>;

    /// Update account details.
    async fn put_details(
        &self,
        request: PutAccountDetailsRequest,
    ) -> Result<(), SesError>;
}
```

#### 5.1.10 Transport Interface

```rust
/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;
}

/// HTTP request representation.
pub struct HttpRequest {
    pub method: HttpMethod,
    pub url: Url,
    pub headers: HeaderMap,
    pub body: Option<Bytes>,
    pub timeout: Option<Duration>,
}

/// HTTP response representation.
pub struct HttpResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}
```

#### 5.1.11 Signer Interface

```rust
/// AWS Signature V4 signer abstraction.
pub trait AwsSigner: Send + Sync {
    /// Sign a request with AWS Signature V4.
    fn sign_request(
        &self,
        request: &mut HttpRequest,
        payload_hash: &str,
        timestamp: DateTime<Utc>,
    ) -> Result<(), SigningError>;
}

/// AWS credentials.
pub struct AwsCredentials {
    /// Access key ID.
    pub access_key_id: String,
    /// Secret access key.
    pub secret_access_key: SecretString,
    /// Session token (for temporary credentials).
    pub session_token: Option<SecretString>,
}

/// Credential provider abstraction.
#[async_trait]
pub trait CredentialsProvider: Send + Sync {
    /// Get current credentials.
    async fn get_credentials(&self) -> Result<AwsCredentials, CredentialsError>;
}
```

#### 5.1.12 Configuration Types

```rust
/// Configuration for the SES client.
#[derive(Clone)]
pub struct SesConfig {
    /// AWS region.
    pub region: String,

    /// Credentials provider.
    pub credentials_provider: Arc<dyn CredentialsProvider>,

    /// Custom endpoint (for localstack or testing).
    pub endpoint: Option<Url>,

    /// Default timeout for requests.
    pub timeout: Duration,

    /// Maximum retries for transient failures.
    pub max_retries: u32,

    /// Retry configuration.
    pub retry_config: RetryConfig,

    /// Circuit breaker configuration.
    pub circuit_breaker_config: CircuitBreakerConfig,

    /// Rate limit configuration.
    pub rate_limit_config: Option<RateLimitConfig>,

    /// Default configuration set to use.
    pub default_configuration_set: Option<String>,

    /// Default sender email address.
    pub default_from_address: Option<String>,
}

impl Default for SesConfig {
    fn default() -> Self {
        Self {
            region: "us-east-1".to_string(),
            credentials_provider: Arc::new(EnvCredentialsProvider),
            endpoint: None,
            timeout: Duration::from_secs(30),
            max_retries: 3,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: None,
            default_configuration_set: None,
            default_from_address: None,
        }
    }
}

/// Email content type.
#[derive(Clone, Debug)]
pub enum EmailContent {
    /// Simple email with subject and body.
    Simple(SimpleEmailContent),
    /// Raw MIME message.
    Raw(RawEmailContent),
    /// Template-based email.
    Template(TemplateEmailContent),
}

/// Simple email content.
#[derive(Clone, Debug)]
pub struct SimpleEmailContent {
    /// Email subject.
    pub subject: Content,
    /// Email body.
    pub body: Body,
    /// Custom headers.
    pub headers: Option<Vec<MessageHeader>>,
}

/// Email body.
#[derive(Clone, Debug)]
pub struct Body {
    /// Plain text body.
    pub text: Option<Content>,
    /// HTML body.
    pub html: Option<Content>,
}

/// Content with data and optional charset.
#[derive(Clone, Debug)]
pub struct Content {
    /// Content data.
    pub data: String,
    /// Character set.
    pub charset: Option<String>,
}

/// Raw email content.
#[derive(Clone, Debug)]
pub struct RawEmailContent {
    /// Base64-encoded MIME message.
    pub data: Bytes,
}

/// Template email content.
#[derive(Clone, Debug)]
pub struct TemplateEmailContent {
    /// Template name.
    pub template_name: Option<String>,
    /// Template ARN.
    pub template_arn: Option<String>,
    /// Template data (JSON).
    pub template_data: String,
    /// Custom headers.
    pub headers: Option<Vec<MessageHeader>>,
}

/// Email destination.
#[derive(Clone, Debug, Default)]
pub struct Destination {
    /// To addresses.
    pub to_addresses: Option<Vec<String>>,
    /// CC addresses.
    pub cc_addresses: Option<Vec<String>>,
    /// BCC addresses.
    pub bcc_addresses: Option<Vec<String>>,
}

/// Suppression reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SuppressionListReason {
    Bounce,
    Complaint,
}

/// Identity type.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum IdentityType {
    EmailAddress,
    Domain,
    ManagedDomain,
}

/// Verification status.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VerificationStatus {
    Pending,
    Success,
    Failed,
    TemporaryFailure,
    NotStarted,
}

/// Event type for event destinations.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EventType {
    Send,
    Reject,
    Bounce,
    Complaint,
    Delivery,
    Open,
    Click,
    RenderingFailure,
    DeliveryDelay,
    Subscription,
}

/// TLS policy for delivery options.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TlsPolicy {
    Require,
    Optional,
}

/// Mail from behavior on MX failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BehaviorOnMxFailure {
    UseDefaultValue,
    RejectMessage,
}

/// Subscription status.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SubscriptionStatus {
    OptIn,
    OptOut,
}

/// Bulk email status.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BulkEmailStatus {
    Success,
    MessageRejected,
    MailFromDomainNotVerified,
    ConfigurationSetNotFound,
    TemplateNotFound,
    AccountSuspended,
    AccountThrottled,
    AccountDailyQuotaExceeded,
    InvalidSendingPoolName,
    AccountSendingPaused,
    ConfigurationSetSendingPaused,
    InvalidParameter,
    TransientFailure,
    Failed,
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for interacting with AWS SES.
 */
interface SesClient {
  /** Access the email sending service. */
  readonly emails: EmailsService;

  /** Access the templates service. */
  readonly templates: TemplatesService;

  /** Access the identities service. */
  readonly identities: IdentitiesService;

  /** Access the configuration sets service. */
  readonly configurationSets: ConfigurationSetsService;

  /** Access the suppression service. */
  readonly suppression: SuppressionService;

  /** Access the contact lists service. */
  readonly contactLists: ContactListsService;

  /** Access the contacts service. */
  readonly contacts: ContactsService;

  /** Access the account service. */
  readonly account: AccountService;
}

/**
 * Factory for creating SES clients.
 */
interface SesClientFactory {
  create(config: SesConfig): SesClient;
}
```

#### 5.2.2 Service Interfaces

```typescript
/**
 * Service for SES email sending operations.
 */
interface EmailsService {
  /**
   * Send a single email.
   */
  send(request: SendEmailRequest): Promise<SendEmailOutput>;

  /**
   * Send bulk emails using a template.
   */
  sendBulk(request: SendBulkEmailRequest): Promise<SendBulkEmailOutput>;

  /**
   * Send a custom verification email.
   */
  sendCustomVerificationEmail(
    request: SendCustomVerificationEmailRequest
  ): Promise<SendCustomVerificationEmailOutput>;
}

/**
 * Service for SES email template operations.
 */
interface TemplatesService {
  /**
   * Create a new email template.
   */
  create(request: CreateEmailTemplateRequest): Promise<void>;

  /**
   * Get an email template.
   */
  get(templateName: string): Promise<GetEmailTemplateOutput>;

  /**
   * Update an email template.
   */
  update(request: UpdateEmailTemplateRequest): Promise<void>;

  /**
   * Delete an email template.
   */
  delete(templateName: string): Promise<void>;

  /**
   * List email templates.
   */
  list(request?: ListEmailTemplatesRequest): Promise<ListEmailTemplatesOutput>;

  /**
   * List all templates (auto-pagination).
   */
  listAll(request?: ListEmailTemplatesRequest): AsyncIterable<EmailTemplateMetadata>;
}

/**
 * Service for SES identity operations.
 */
interface IdentitiesService {
  /**
   * Create an email identity.
   */
  create(request: CreateEmailIdentityRequest): Promise<CreateEmailIdentityOutput>;

  /**
   * Get email identity details.
   */
  get(emailIdentity: string): Promise<GetEmailIdentityOutput>;

  /**
   * Delete an email identity.
   */
  delete(emailIdentity: string): Promise<void>;

  /**
   * List email identities.
   */
  list(request?: ListEmailIdentitiesRequest): Promise<ListEmailIdentitiesOutput>;

  /**
   * List all identities (auto-pagination).
   */
  listAll(request?: ListEmailIdentitiesRequest): AsyncIterable<IdentityInfo>;

  /**
   * Update DKIM attributes.
   */
  putDkimAttributes(request: PutEmailIdentityDkimAttributesRequest): Promise<void>;

  /**
   * Update MAIL FROM attributes.
   */
  putMailFromAttributes(request: PutEmailIdentityMailFromAttributesRequest): Promise<void>;
}

/**
 * Service for SES configuration set operations.
 */
interface ConfigurationSetsService {
  /**
   * Create a configuration set.
   */
  create(request: CreateConfigurationSetRequest): Promise<void>;

  /**
   * Get a configuration set.
   */
  get(configurationSetName: string): Promise<GetConfigurationSetOutput>;

  /**
   * Delete a configuration set.
   */
  delete(configurationSetName: string): Promise<void>;

  /**
   * List configuration sets.
   */
  list(request?: ListConfigurationSetsRequest): Promise<ListConfigurationSetsOutput>;

  /**
   * List all configuration sets (auto-pagination).
   */
  listAll(request?: ListConfigurationSetsRequest): AsyncIterable<string>;

  /**
   * Create an event destination.
   */
  createEventDestination(
    request: CreateConfigurationSetEventDestinationRequest
  ): Promise<void>;

  /**
   * Get event destinations.
   */
  getEventDestinations(
    configurationSetName: string
  ): Promise<GetConfigurationSetEventDestinationsOutput>;

  /**
   * Update an event destination.
   */
  updateEventDestination(
    request: UpdateConfigurationSetEventDestinationRequest
  ): Promise<void>;

  /**
   * Delete an event destination.
   */
  deleteEventDestination(
    configurationSetName: string,
    eventDestinationName: string
  ): Promise<void>;
}

/**
 * Service for SES suppression list operations.
 */
interface SuppressionService {
  /**
   * Add an email to the suppression list.
   */
  put(request: PutSuppressedDestinationRequest): Promise<void>;

  /**
   * Get a suppressed destination.
   */
  get(emailAddress: string): Promise<GetSuppressedDestinationOutput>;

  /**
   * Delete a suppressed destination.
   */
  delete(emailAddress: string): Promise<void>;

  /**
   * List suppressed destinations.
   */
  list(request?: ListSuppressedDestinationsRequest): Promise<ListSuppressedDestinationsOutput>;

  /**
   * List all suppressed destinations (auto-pagination).
   */
  listAll(request?: ListSuppressedDestinationsRequest): AsyncIterable<SuppressedDestinationSummary>;
}

/**
 * Service for SES account operations.
 */
interface AccountService {
  /**
   * Get account details.
   */
  get(): Promise<GetAccountOutput>;

  /**
   * Update sending attributes.
   */
  putSendingAttributes(request: PutAccountSendingAttributesRequest): Promise<void>;

  /**
   * Update suppression attributes.
   */
  putSuppressionAttributes(request: PutAccountSuppressionAttributesRequest): Promise<void>;
}
```

#### 5.2.3 Configuration Types

```typescript
/**
 * Configuration for the SES client.
 */
interface SesConfig {
  /** AWS region. */
  region: string;

  /** Credentials provider. */
  credentials: CredentialsProvider | AwsCredentials;

  /** Custom endpoint (for localstack or testing). */
  endpoint?: string;

  /** Default timeout in milliseconds. */
  timeout?: number;

  /** Maximum retries. */
  maxRetries?: number;

  /** Retry configuration. */
  retryConfig?: RetryConfig;

  /** Circuit breaker configuration. */
  circuitBreakerConfig?: CircuitBreakerConfig;

  /** Rate limit configuration. */
  rateLimitConfig?: RateLimitConfig;

  /** Default configuration set to use. */
  defaultConfigurationSet?: string;

  /** Default sender email address. */
  defaultFromAddress?: string;
}

/**
 * AWS credentials.
 */
interface AwsCredentials {
  /** Access key ID. */
  accessKeyId: string;

  /** Secret access key. */
  secretAccessKey: string;

  /** Session token (for temporary credentials). */
  sessionToken?: string;
}

/**
 * Credentials provider interface.
 */
interface CredentialsProvider {
  getCredentials(): Promise<AwsCredentials>;
}

/**
 * Email content type.
 */
type EmailContent =
  | { type: 'simple'; content: SimpleEmailContent }
  | { type: 'raw'; content: RawEmailContent }
  | { type: 'template'; content: TemplateEmailContent };

/**
 * Simple email content.
 */
interface SimpleEmailContent {
  /** Email subject. */
  subject: Content;
  /** Email body. */
  body: Body;
  /** Custom headers. */
  headers?: MessageHeader[];
}

/**
 * Email body.
 */
interface Body {
  /** Plain text body. */
  text?: Content;
  /** HTML body. */
  html?: Content;
}

/**
 * Content with data and optional charset.
 */
interface Content {
  /** Content data. */
  data: string;
  /** Character set. */
  charset?: string;
}

/**
 * Raw email content.
 */
interface RawEmailContent {
  /** Base64-encoded MIME message. */
  data: ArrayBuffer | Uint8Array;
}

/**
 * Template email content.
 */
interface TemplateEmailContent {
  /** Template name. */
  templateName?: string;
  /** Template ARN. */
  templateArn?: string;
  /** Template data (JSON string or object). */
  templateData: string | Record<string, unknown>;
  /** Custom headers. */
  headers?: MessageHeader[];
}

/**
 * Email destination.
 */
interface Destination {
  /** To addresses. */
  toAddresses?: string[];
  /** CC addresses. */
  ccAddresses?: string[];
  /** BCC addresses. */
  bccAddresses?: string[];
}

type SuppressionListReason = 'BOUNCE' | 'COMPLAINT';

type IdentityType = 'EMAIL_ADDRESS' | 'DOMAIN' | 'MANAGED_DOMAIN';

type VerificationStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TEMPORARY_FAILURE' | 'NOT_STARTED';

type EventType =
  | 'SEND'
  | 'REJECT'
  | 'BOUNCE'
  | 'COMPLAINT'
  | 'DELIVERY'
  | 'OPEN'
  | 'CLICK'
  | 'RENDERING_FAILURE'
  | 'DELIVERY_DELAY'
  | 'SUBSCRIPTION';

type TlsPolicy = 'REQUIRE' | 'OPTIONAL';

type BehaviorOnMxFailure = 'USE_DEFAULT_VALUE' | 'REJECT_MESSAGE';

type SubscriptionStatus = 'OPT_IN' | 'OPT_OUT';

type BulkEmailStatus =
  | 'SUCCESS'
  | 'MESSAGE_REJECTED'
  | 'MAIL_FROM_DOMAIN_NOT_VERIFIED'
  | 'CONFIGURATION_SET_NOT_FOUND'
  | 'TEMPLATE_NOT_FOUND'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_THROTTLED'
  | 'ACCOUNT_DAILY_QUOTA_EXCEEDED'
  | 'INVALID_SENDING_POOL_NAME'
  | 'ACCOUNT_SENDING_PAUSED'
  | 'CONFIGURATION_SET_SENDING_PAUSED'
  | 'INVALID_PARAMETER'
  | 'TRANSIENT_FAILURE'
  | 'FAILED';
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
SesError
├── ConfigurationError
│   ├── MissingRegion
│   ├── MissingCredentials
│   ├── InvalidEndpoint
│   └── InvalidConfiguration
│
├── CredentialsError
│   ├── CredentialsNotFound
│   ├── CredentialsExpired
│   ├── InvalidCredentials
│   └── CredentialsRefreshFailed
│
├── SigningError
│   ├── InvalidTimestamp
│   ├── SignatureCalculationFailed
│   └── UnsupportedAlgorithm
│
├── RequestError
│   ├── ValidationError
│   ├── InvalidEmailAddress
│   ├── InvalidTemplateName
│   ├── InvalidConfigurationSetName
│   ├── MissingRequiredParameter
│   ├── InvalidParameterValue
│   └── TooManyRecipients
│
├── IdentityError
│   ├── IdentityNotFound
│   ├── IdentityNotVerified
│   ├── IdentityAlreadyExists
│   ├── DkimNotConfigured
│   ├── MailFromNotVerified
│   └── PolicyNotFound
│
├── TemplateError
│   ├── TemplateNotFound
│   ├── TemplateAlreadyExists
│   ├── InvalidTemplateContent
│   └── TemplateRenderingError
│
├── ConfigurationSetError
│   ├── ConfigurationSetNotFound
│   ├── ConfigurationSetAlreadyExists
│   ├── EventDestinationNotFound
│   ├── EventDestinationAlreadyExists
│   └── InvalidEventDestination
│
├── SuppressionError
│   ├── AddressNotSuppressed
│   ├── AlreadySuppressed
│   └── InvalidSuppressionReason
│
├── ContactError
│   ├── ContactListNotFound
│   ├── ContactListAlreadyExists
│   ├── ContactNotFound
│   ├── ContactAlreadyExists
│   └── TopicNotFound
│
├── SendingError
│   ├── MessageRejected
│   ├── MailFromDomainNotVerified
│   ├── ConfigurationSetSendingPaused
│   ├── AccountSendingPaused
│   ├── AccountSuspended
│   └── TemplateRenderingFailed
│
├── QuotaError
│   ├── AccountThrottled
│   ├── DailyQuotaExceeded
│   ├── MaxSendRateExceeded
│   └── TooManyRequests
│
├── AccountError
│   ├── AccountNotFound
│   ├── AccountInSandbox
│   ├── ProductionAccessDenied
│   └── InvalidAccountDetails
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
│
├── ServerError
│   ├── InternalError
│   ├── ServiceUnavailable
│   └── BadGateway
│
└── ResponseError
    ├── JsonParseError
    ├── InvalidResponse
    └── UnexpectedContent
```

### 6.2 Error Type Definitions (Rust)

```rust
/// Top-level error type for the SES integration.
#[derive(Debug, thiserror::Error)]
pub enum SesError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Credentials error: {0}")]
    Credentials(#[from] CredentialsError),

    #[error("Signing error: {0}")]
    Signing(#[from] SigningError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Identity error: {0}")]
    Identity(#[from] IdentityError),

    #[error("Template error: {0}")]
    Template(#[from] TemplateError),

    #[error("Configuration set error: {0}")]
    ConfigurationSet(#[from] ConfigurationSetError),

    #[error("Suppression error: {0}")]
    Suppression(#[from] SuppressionError),

    #[error("Contact error: {0}")]
    Contact(#[from] ContactError),

    #[error("Sending error: {0}")]
    Sending(#[from] SendingError),

    #[error("Quota error: {0}")]
    Quota(#[from] QuotaError),

    #[error("Account error: {0}")]
    Account(#[from] AccountError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),
}

impl SesError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            SesError::Network(NetworkError::Timeout { .. })
                | SesError::Network(NetworkError::ConnectionFailed { .. })
                | SesError::Server(ServerError::InternalError { .. })
                | SesError::Server(ServerError::ServiceUnavailable { .. })
                | SesError::Quota(QuotaError::TooManyRequests { .. })
                | SesError::Quota(QuotaError::AccountThrottled { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            SesError::Quota(QuotaError::TooManyRequests { retry_after, .. }) => *retry_after,
            SesError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<StatusCode> {
        match self {
            SesError::Credentials(_) => Some(StatusCode::FORBIDDEN),
            SesError::Identity(IdentityError::IdentityNotFound { .. }) => Some(StatusCode::NOT_FOUND),
            SesError::Template(TemplateError::TemplateNotFound { .. }) => Some(StatusCode::NOT_FOUND),
            SesError::ConfigurationSet(ConfigurationSetError::ConfigurationSetNotFound { .. }) => {
                Some(StatusCode::NOT_FOUND)
            }
            SesError::Request(_) => Some(StatusCode::BAD_REQUEST),
            SesError::Quota(QuotaError::TooManyRequests { .. }) => Some(StatusCode::TOO_MANY_REQUESTS),
            SesError::Server(ServerError::InternalError { .. }) => {
                Some(StatusCode::INTERNAL_SERVER_ERROR)
            }
            SesError::Server(ServerError::ServiceUnavailable { .. }) => {
                Some(StatusCode::SERVICE_UNAVAILABLE)
            }
            _ => None,
        }
    }

    /// Returns the SES error code if available.
    pub fn ses_error_code(&self) -> Option<&str> {
        match self {
            SesError::Identity(e) => e.code(),
            SesError::Template(e) => e.code(),
            SesError::ConfigurationSet(e) => e.code(),
            SesError::Sending(e) => e.code(),
            SesError::Quota(e) => e.code(),
            SesError::Account(e) => e.code(),
            _ => None,
        }
    }
}
```

### 6.3 Error Mapping from HTTP/SES

| HTTP Status | SES Error Code | Error Type | Retryable |
|-------------|----------------|------------|-----------|
| 400 | ValidationError | `RequestError::ValidationError` | No |
| 400 | InvalidParameterValue | `RequestError::InvalidParameterValue` | No |
| 400 | MissingParameter | `RequestError::MissingRequiredParameter` | No |
| 400 | MessageRejected | `SendingError::MessageRejected` | No |
| 400 | MailFromDomainNotVerifiedException | `SendingError::MailFromDomainNotVerified` | No |
| 400 | TemplateDoesNotExistException | `TemplateError::TemplateNotFound` | No |
| 400 | AlreadyExistsException | Various `AlreadyExists` errors | No |
| 403 | AccessDenied | `CredentialsError::InvalidCredentials` | No |
| 404 | NotFoundException | Various `NotFound` errors | No |
| 429 | TooManyRequestsException | `QuotaError::TooManyRequests` | Yes |
| 429 | LimitExceededException | `QuotaError::AccountThrottled` | Yes |
| 500 | InternalServiceError | `ServerError::InternalError` | Yes |
| 503 | ServiceUnavailable | `ServerError::ServiceUnavailable` | Yes |

---

## 7. Resilience Hooks

### 7.1 Retry Integration

The module integrates with `integrations-retry` for automatic retry of transient failures.

```rust
/// Retry configuration for SES requests.
pub struct SesRetryConfig {
    /// Base configuration from primitives.
    pub base: RetryConfig,

    /// Override retry behavior per error type.
    pub error_overrides: HashMap<ErrorCategory, RetryBehavior>,
}

/// How to handle retries for a specific error category.
pub enum RetryBehavior {
    /// Use default retry logic.
    Default,
    /// Never retry this error.
    NoRetry,
    /// Retry with specific configuration.
    Custom(RetryConfig),
}
```

**Default Retry Behavior:**

| Error Type | Retry | Max Attempts | Base Delay |
|------------|-------|--------------|------------|
| `QuotaError::TooManyRequests` | Yes | 5 | Use `retry_after` or 1s exponential |
| `QuotaError::AccountThrottled` | Yes | 5 | 1s exponential |
| `ServerError::InternalError` | Yes | 3 | 1s exponential |
| `ServerError::ServiceUnavailable` | Yes | 3 | Use `retry_after` or 1s |
| `NetworkError::Timeout` | Yes | 3 | 500ms exponential |
| `NetworkError::ConnectionFailed` | Yes | 3 | 500ms exponential |
| All others | No | - | - |

### 7.2 Circuit Breaker Integration

The module integrates with `integrations-circuit-breaker` to prevent cascading failures.

```rust
/// Circuit breaker configuration for SES.
pub struct SesCircuitBreakerConfig {
    /// Base configuration from primitives.
    pub base: CircuitBreakerConfig,

    /// Failure threshold before opening.
    pub failure_threshold: u32,

    /// Success threshold to close.
    pub success_threshold: u32,

    /// Time before attempting half-open.
    pub reset_timeout: Duration,
}

impl Default for SesCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            base: CircuitBreakerConfig::default(),
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(30),
        }
    }
}
```

**State Transitions:**

```
CLOSED --[failures >= threshold]--> OPEN
OPEN --[reset_timeout elapsed]--> HALF_OPEN
HALF_OPEN --[success >= threshold]--> CLOSED
HALF_OPEN --[any failure]--> OPEN
```

### 7.3 Rate Limit Integration

The module integrates with `integrations-rate-limit` for client-side rate limiting.

```rust
/// Rate limit configuration for SES.
pub struct SesRateLimitConfig {
    /// Emails per second limit (account-level default is 1/second in sandbox).
    pub emails_per_second: Option<u32>,

    /// Concurrent request limit.
    pub max_concurrent_requests: Option<u32>,

    /// Emails per 24 hour period.
    pub emails_per_day: Option<u64>,
}
```

**Rate Limit Handling:**

1. **Client-side limiting**: Pre-emptively limit requests based on configuration
2. **Server response**: Parse `TooManyRequests` responses and back off
3. **Adaptive throttling**: Reduce rate when receiving 429 responses
4. **Quota awareness**: Track daily quota usage

**SES Default Limits (Sandbox):**

| Limit | Value | Notes |
|-------|-------|-------|
| Send rate | 1 email/second | Increases after production access |
| Daily quota | 200 emails/day | Increases after production access |
| Recipients per message | 50 | Hard limit |
| Message size | 10 MB | Hard limit |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Access keys never logged | Use `SecretString`, redact in Debug |
| Session tokens protected | `SecretString` with Zeroize |
| Credentials not in stack traces | No Display impl, zero on drop |
| Credentials refreshed automatically | Provider abstraction with caching |
| Support temporary credentials | STS session tokens |
| Support IAM roles | Instance metadata, ECS task role |

### 8.2 AWS Signature Security

| Requirement | Implementation |
|-------------|----------------|
| Signature V4 only | No V2 signature support |
| Timestamp validation | Within 5 minutes |
| Payload hashing | SHA256 for all requests |
| Secure string comparison | Constant-time comparison |
| Request signing | All headers signed |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Configure in HTTP client |
| Certificate validation | Enable by default |
| No insecure fallback | Fail on TLS errors |
| HTTPS required | Force HTTPS endpoints |

### 8.4 Email Content Security

| Requirement | Implementation |
|-------------|----------------|
| No credential exposure in templates | Validate template data |
| Sanitize user-provided content | Prevent injection attacks |
| Validate email addresses | RFC 5322 compliance |
| Attachment scanning | Recommend external scanning |
| Content encoding | Proper Base64 for raw messages |

### 8.5 Input Validation

| Requirement | Implementation |
|-------------|----------------|
| Email address validation | RFC 5322 format check |
| Template name validation | Alphanumeric, hyphens, underscores |
| Configuration set validation | Valid naming conventions |
| Content size limits | Enforce 10MB max message size |
| Recipient count limits | Enforce 50 recipients max |

---

## 9. Observability Requirements

### 9.1 Tracing

Every API call must create a trace span with:

| Attribute | Type | Description |
|-----------|------|-------------|
| `ses.service` | string | Service name ("ses") |
| `ses.operation` | string | Operation name (e.g., "SendEmail") |
| `ses.region` | string | AWS region |
| `ses.request_id` | string | SES request ID |
| `ses.message_id` | string | Message ID (for send operations) |
| `ses.configuration_set` | string | Configuration set used |
| `ses.from_address` | string | Sender email (redacted domain only) |
| `ses.recipient_count` | integer | Number of recipients |
| `ses.template_name` | string | Template name (if applicable) |
| `error.type` | string | Error category (if failed) |
| `error.message` | string | Error message (if failed) |
| `error.ses_code` | string | SES error code (if failed) |

### 9.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `ses_emails_sent_total` | Counter | `status`, `configuration_set` |
| `ses_emails_bulk_total` | Counter | `status`, `configuration_set` |
| `ses_requests_total` | Counter | `operation`, `status` |
| `ses_request_duration_seconds` | Histogram | `operation` |
| `ses_recipients_total` | Counter | `type` (to, cc, bcc) |
| `ses_errors_total` | Counter | `operation`, `error_type`, `ses_code` |
| `ses_retries_total` | Counter | `operation`, `attempt` |
| `ses_circuit_breaker_state` | Gauge | `state` |
| `ses_quota_used` | Gauge | `type` (daily, rate) |
| `ses_suppression_list_size` | Gauge | `reason` |

### 9.3 Logging

| Level | When |
|-------|------|
| `ERROR` | Non-retryable failures, configuration errors, sending failures |
| `WARN` | Retryable failures, rate limits, circuit breaker trips, suppressed addresses |
| `INFO` | Email sent, template created/updated, identity verified |
| `DEBUG` | Request/response details (sanitized), configuration loaded |
| `TRACE` | AWS signing details, internal state transitions |

**Log Fields:**

| Field | Description |
|-------|-------------|
| `request_id` | SES request ID |
| `message_id` | Message ID for sent emails |
| `operation` | SES operation |
| `configuration_set` | Configuration set name |
| `duration_ms` | Request duration |
| `recipient_count` | Number of recipients |
| `error.type` | Error category |
| `error.code` | SES error code |
| `retry.attempt` | Current retry attempt |
| `template.name` | Template name |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request signing | < 1ms | < 5ms |
| JSON serialization | < 2ms | < 10ms |
| SendEmail (API) | < 300ms + network | < 1s + network |
| SendBulkEmail (API) | < 500ms + network | < 2s + network |
| List operations | < 200ms + network | < 500ms + network |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 50+ (configurable) |
| Bulk email entries | 50 per request (SES limit) |
| Pagination efficiency | 1000 items per page |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 512KB typical (excluding attachments) |
| Connection pool size | Configurable (default: 10) |
| Request body size | Up to 10MB (SES limit) |
| Recipients per email | 50 (SES limit) |
| Template size | 500KB (SES limit) |
| Attachments total | 10MB (SES limit) |

---

## 11. Future-Proofing

### 11.1 Extensibility Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New SES operations | Add new service trait methods |
| Custom event destinations | Extend `EventDestination` enum |
| New suppression reasons | Extend `SuppressionListReason` enum |
| Custom credential providers | Implement `CredentialsProvider` trait |
| Custom transport | Implement `HttpTransport` trait |
| Middleware | Request/response interceptors |

### 11.2 Version Compatibility

| Aspect | Strategy |
|--------|----------|
| SES API version | Use SES v2 API (sesv2) |
| Response fields | Ignore unknown JSON fields |
| Request fields | Builder pattern with optional fields |
| Breaking changes | Major version bump, migration guide |

### 11.3 Regional Support

The module supports all AWS regions where SES is available:

| Region | Endpoint |
|--------|----------|
| us-east-1 | email.us-east-1.amazonaws.com |
| us-east-2 | email.us-east-2.amazonaws.com |
| us-west-1 | email.us-west-1.amazonaws.com |
| us-west-2 | email.us-west-2.amazonaws.com |
| eu-west-1 | email.eu-west-1.amazonaws.com |
| eu-west-2 | email.eu-west-2.amazonaws.com |
| eu-west-3 | email.eu-west-3.amazonaws.com |
| eu-central-1 | email.eu-central-1.amazonaws.com |
| eu-north-1 | email.eu-north-1.amazonaws.com |
| ap-south-1 | email.ap-south-1.amazonaws.com |
| ap-southeast-1 | email.ap-southeast-1.amazonaws.com |
| ap-southeast-2 | email.ap-southeast-2.amazonaws.com |
| ap-northeast-1 | email.ap-northeast-1.amazonaws.com |
| ap-northeast-2 | email.ap-northeast-2.amazonaws.com |
| ap-northeast-3 | email.ap-northeast-3.amazonaws.com |
| ca-central-1 | email.ca-central-1.amazonaws.com |
| sa-east-1 | email.sa-east-1.amazonaws.com |
| me-south-1 | email.me-south-1.amazonaws.com |
| af-south-1 | email.af-south-1.amazonaws.com |

---

## 12. Acceptance Criteria

### 12.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | SendEmail works (simple content) | Integration test |
| FC-2 | SendEmail works (HTML content) | Integration test |
| FC-3 | SendEmail works (template content) | Integration test |
| FC-4 | SendEmail works (raw MIME) | Integration test |
| FC-5 | SendBulkEmail works | Integration test |
| FC-6 | CreateEmailTemplate works | Integration test |
| FC-7 | UpdateEmailTemplate works | Integration test |
| FC-8 | DeleteEmailTemplate works | Integration test |
| FC-9 | ListEmailTemplates with pagination works | Integration test |
| FC-10 | CreateEmailIdentity (email) works | Integration test |
| FC-11 | CreateEmailIdentity (domain) works | Integration test |
| FC-12 | GetEmailIdentity returns verification status | Integration test |
| FC-13 | DeleteEmailIdentity works | Integration test |
| FC-14 | ListEmailIdentities with pagination works | Integration test |
| FC-15 | DKIM configuration works | Integration test |
| FC-16 | CreateConfigurationSet works | Integration test |
| FC-17 | Event destination configuration works | Integration test |
| FC-18 | DeleteConfigurationSet works | Integration test |
| FC-19 | PutSuppressedDestination works | Integration test |
| FC-20 | GetSuppressedDestination works | Integration test |
| FC-21 | DeleteSuppressedDestination works | Integration test |
| FC-22 | ListSuppressedDestinations with pagination works | Integration test |
| FC-23 | Contact list operations work | Integration test |
| FC-24 | Contact operations work | Integration test |
| FC-25 | GetAccount returns quota info | Integration test |
| FC-26 | All error types mapped correctly | Unit tests |
| FC-27 | AWS Signature V4 correct | Unit tests, integration test |

### 12.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | No panics in production paths | Fuzzing, review |
| NFC-2 | Credentials never logged | Audit, tests |
| NFC-3 | TLS 1.2+ enforced | Configuration |
| NFC-4 | Retry respects backoff | Mock tests |
| NFC-5 | Circuit breaker trips correctly | State tests |
| NFC-6 | Rate limiting works | Timing tests |
| NFC-7 | All requests traced | Integration tests |
| NFC-8 | Metrics emitted correctly | Integration tests |
| NFC-9 | Test coverage > 80% | Coverage report |
| NFC-10 | Email validation correct | Unit tests |
| NFC-11 | Template rendering handles errors | Unit tests |
| NFC-12 | Pagination handles edge cases | Unit tests |

### 12.3 Documentation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| DC-1 | All public APIs documented | Doc coverage |
| DC-2 | Examples for common operations | Doc review |
| DC-3 | Error handling documented | Doc review |
| DC-4 | Configuration options documented | Doc review |
| DC-5 | Migration guides for breaking changes | Release notes |
| DC-6 | SES-specific considerations documented | Doc review |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*The next phase (Pseudocode) will provide detailed algorithmic descriptions for implementing each component, including AWS Signature V4 signing, email content building, template rendering, and pagination handling.*

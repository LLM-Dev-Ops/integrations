# SPARC Development Cycle: AWS IAM Integration Module

**Master Index Document**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/iam`

---

## Overview

This document contains the complete SPARC development cycle for the AWS IAM Integration Module. This integration provides a thin adapter layer enabling the LLM Dev Ops platform to interact with AWS IAM concepts including roles, policies, and service identities for secure, least-privilege access patterns.

### Key Differentiators from Other AWS Integrations

| Aspect | AWS IAM | Other AWS Integrations (S3, Bedrock) |
|--------|---------|--------------------------------------|
| Primary Purpose | Identity & Access Management | Data/Compute services |
| Usage Pattern | Credential vending, policy evaluation | Direct API calls |
| State Model | IAM is stateless (credential rotation) | May have state |
| Cross-Account | Primary use case | Secondary concern |
| Audit Focus | Critical (CloudTrail) | Standard |

---

## SPARC Phases

| Phase | Section | Status |
|-------|---------|--------|
| **S**pecification | [Section 1](#1-specification-phase) | COMPLETE |
| **P**seudocode | [Section 2](#2-pseudocode-phase) | COMPLETE |
| **A**rchitecture | [Section 3](#3-architecture-phase) | COMPLETE |
| **R**efinement (Interfaces) | [Section 4](#4-interfaces-phase) | COMPLETE |
| **C**ompletion (Constraints + Open Questions) | [Section 5](#5-constraints-and-open-questions) | COMPLETE |

---

# 1. SPECIFICATION PHASE

## 1.1 Executive Summary

This specification defines a thin adapter layer for integrating AWS IAM capabilities into the LLM Dev Ops platform. The adapter enables:

- **Role Assumption** for cross-account and least-privilege access
- **Credential Vending** through STS for temporary security credentials
- **Policy Evaluation** for permission simulation before execution
- **Service Identity Management** for workload authentication
- **Audit Trail Integration** for compliance and security monitoring
- **Workflow Simulation** for testing permissioned access patterns

### 1.1.1 Design Philosophy

This integration is a **thin adapter**, not an IAM management system:

| Responsibility | This Module | External (Out of Scope) |
|----------------|-------------|------------------------|
| Role assumption | Yes | - |
| Credential vending | Yes | - |
| Policy simulation | Yes | - |
| Permission checking | Yes | - |
| Role creation/deletion | - | AWS Console/IaC |
| Policy authoring | - | AWS Console/IaC |
| Account setup | - | AWS Organizations |
| Cloud governance | - | Control Tower/SCPs |

## 1.2 Module Purpose and Scope

### 1.2.1 Purpose Statement

The AWS IAM Integration Module provides a production-ready, type-safe interface for assuming roles, obtaining temporary credentials, and evaluating permissions within AWS environments. It delegates to shared infrastructure for credential caching, observability, and resilience while enabling enterprise-scale identity patterns.

### 1.2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Role Assumption** | Assume IAM roles within same or cross-account |
| **Credential Vending** | Obtain temporary credentials via STS |
| **Session Management** | Track and refresh assumed role sessions |
| **Policy Simulation** | Evaluate permissions before resource access |
| **Identity Resolution** | Resolve caller identity and effective permissions |
| **Credential Chain** | Provide credentials to other AWS integrations |
| **Audit Events** | Emit events for compliance tracking |

### 1.2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| STS AssumeRole | Same-account and cross-account role assumption |
| STS AssumeRoleWithWebIdentity | OIDC-based role assumption (EKS, etc.) |
| STS AssumeRoleWithSAML | SAML federation support |
| STS GetCallerIdentity | Verify current identity |
| STS GetSessionToken | MFA-authenticated session tokens |
| STS GetFederationToken | Federated user credentials |
| IAM SimulatePrincipalPolicy | Permission simulation |
| IAM GetPolicy | Policy document retrieval |
| IAM GetRole | Role configuration retrieval |
| IAM ListRolePolicies | Role policy enumeration |
| IAM ListAttachedRolePolicies | Managed policy enumeration |
| Credential Provider Interface | Feed credentials to S3, Bedrock, etc. |

#### Out of Scope

| Item | Reason |
|------|--------|
| IAM CreateRole | Infrastructure provisioning |
| IAM DeleteRole | Infrastructure provisioning |
| IAM CreatePolicy | Policy authoring |
| IAM AttachRolePolicy | Policy management |
| IAM user management | Focus on roles, not users |
| IAM groups | Focus on roles, not groups |
| AWS Organizations | Account-level governance |
| Service Control Policies | Organizational governance |

## 1.3 AWS IAM/STS API Specification

### 1.3.1 STS Endpoints

**Base URL:** `https://sts.{region}.amazonaws.com` or `https://sts.amazonaws.com` (global)

| Endpoint | Method | Content-Type |
|----------|--------|--------------|
| All STS actions | POST | `application/x-www-form-urlencoded` |

### 1.3.2 AssumeRole

**Action:** `AssumeRole`

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `RoleArn` | string | Yes | ARN of role to assume |
| `RoleSessionName` | string | Yes | Session identifier (2-64 chars) |
| `DurationSeconds` | integer | No | Session duration (900-43200) |
| `ExternalId` | string | No | External ID for cross-account |
| `Policy` | string | No | Session policy (inline JSON) |
| `PolicyArns` | list | No | Managed policy ARNs to attach |
| `Tags` | list | No | Session tags |
| `TransitiveTagKeys` | list | No | Tags to propagate |
| `SerialNumber` | string | No | MFA device serial |
| `TokenCode` | string | No | MFA token code |
| `SourceIdentity` | string | No | Source identity for audit |

**Response:**
```xml
<AssumeRoleResponse>
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIAIOSFODNN7EXAMPLE</AccessKeyId>
      <SecretAccessKey>wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY</SecretAccessKey>
      <SessionToken>FwoGZXIvYXdzEBYaDK...</SessionToken>
      <Expiration>2025-12-13T12:00:00Z</Expiration>
    </Credentials>
    <AssumedRoleUser>
      <AssumedRoleId>AROA3XFRBF535PLBIFPI4:session-name</AssumedRoleId>
      <Arn>arn:aws:sts::123456789012:assumed-role/RoleName/session-name</Arn>
    </AssumedRoleUser>
    <PackedPolicySize>6</PackedPolicySize>
  </AssumeRoleResult>
</AssumeRoleResponse>
```

### 1.3.3 AssumeRoleWithWebIdentity

**Action:** `AssumeRoleWithWebIdentity`

**Additional Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `WebIdentityToken` | string | Yes | OIDC token |
| `ProviderId` | string | No | Identity provider URL |

### 1.3.4 GetCallerIdentity

**Action:** `GetCallerIdentity`

**Response:**
```xml
<GetCallerIdentityResponse>
  <GetCallerIdentityResult>
    <UserId>AIDAIOSFODNN7EXAMPLE</UserId>
    <Account>123456789012</Account>
    <Arn>arn:aws:iam::123456789012:user/username</Arn>
  </GetCallerIdentityResult>
</GetCallerIdentityResponse>
```

### 1.3.5 GetSessionToken

**Action:** `GetSessionToken`

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `DurationSeconds` | integer | No | Duration (900-129600) |
| `SerialNumber` | string | No | MFA device serial |
| `TokenCode` | string | No | MFA token |

### 1.3.6 IAM SimulatePrincipalPolicy

**Endpoint:** `https://iam.amazonaws.com`
**Action:** `SimulatePrincipalPolicy`

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `PolicySourceArn` | string | Yes | Principal to simulate |
| `ActionNames` | list | Yes | Actions to simulate |
| `ResourceArns` | list | No | Resource ARNs |
| `ContextEntries` | list | No | Context conditions |
| `ResourcePolicy` | string | No | Resource-based policy |
| `CallerArn` | string | No | Calling principal ARN |

**Response:**
```xml
<SimulatePrincipalPolicyResponse>
  <SimulatePrincipalPolicyResult>
    <EvaluationResults>
      <member>
        <EvalActionName>s3:GetObject</EvalActionName>
        <EvalResourceName>arn:aws:s3:::bucket/*</EvalResourceName>
        <EvalDecision>allowed</EvalDecision>
        <MatchedStatements>...</MatchedStatements>
      </member>
    </EvaluationResults>
  </SimulatePrincipalPolicyResult>
</SimulatePrincipalPolicyResponse>
```

## 1.4 Enterprise Features

### 1.4.1 Cross-Account Role Assumption

Support for assuming roles in different AWS accounts:

| Feature | Description |
|---------|-------------|
| **Trust Policy Validation** | Verify trust relationships before assumption |
| **External ID Support** | Secure cross-account with external IDs |
| **Role Chaining** | Assume role A to assume role B |
| **Session Duration Control** | Respect maximum session duration |

**Configuration:**
```rust
pub struct CrossAccountConfig {
    pub target_account_id: String,
    pub role_name: String,
    pub external_id: Option<SecretString>,
    pub session_duration: Duration,
    pub session_name_prefix: String,
}
```

### 1.4.2 Credential Caching and Refresh

Automatic credential lifecycle management:

| Feature | Description |
|---------|-------------|
| **Credential Caching** | Cache credentials until near expiration |
| **Proactive Refresh** | Refresh before expiration (buffer configurable) |
| **Concurrent Access** | Thread-safe credential sharing |
| **Refresh Failure Handling** | Graceful degradation on refresh failure |

**Refresh Strategy:**
```
Credential Lifetime: |---------------------|
                     ^                    ^
                     Issue               Expire

Refresh Window:               |---------|
                              ^         ^
                         RefreshAt    Expire
                         (default: 5min before)
```

### 1.4.3 Least-Privilege Access Patterns

Support for minimal permission scoping:

| Feature | Description |
|---------|-------------|
| **Session Policies** | Scope down permissions per session |
| **Permission Boundaries** | Respect IAM permission boundaries |
| **Policy Simulation** | Verify permissions before access |
| **Condition Keys** | Support AWS global condition keys |

### 1.4.4 Workflow Simulation

For testing and capacity planning:

| Feature | Description |
|---------|-------------|
| **Permission Testing** | Test permissions without actual access |
| **Access Pattern Recording** | Record assume role patterns |
| **Dry Run Mode** | Simulate credential vending |
| **Policy Evaluation Caching** | Cache simulation results |

### 1.4.5 Auditability

Comprehensive audit trail support:

| Feature | Description |
|---------|-------------|
| **Session Tagging** | Tag sessions for audit correlation |
| **Source Identity** | Propagate original caller identity |
| **CloudTrail Integration** | All actions logged to CloudTrail |
| **Local Audit Events** | Emit events to shared observability |

## 1.5 Dependency Policy

### 1.5.1 Allowed Dependencies (Shared Modules)

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Base credential provider interface |
| `shared/resilience` | Retry, circuit breaker, rate limiting |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport abstraction |

### 1.5.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `serde` / `serde_json` | 1.x | Serialization |
| `quick-xml` | 0.31+ | XML parsing (STS responses) |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `chrono` | 0.4+ | DateTime handling |
| `parking_lot` | 0.12+ | Synchronization |
| `ring` | 0.17+ | HMAC for SigV4 |

### 1.5.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `aws-sdk-sts` | This module IS the STS integration |
| `aws-sdk-iam` | This module provides IAM read operations |
| Other AWS SDK crates | Use internal implementations |

## 1.6 Error Taxonomy

### 1.6.1 Error Hierarchy

```
IamError
├── ConfigurationError
│   ├── InvalidRoleArn
│   ├── InvalidSessionName
│   ├── InvalidDuration
│   └── MissingCredentials
│
├── AuthenticationError
│   ├── InvalidCredentials
│   ├── ExpiredCredentials
│   ├── SignatureError
│   └── MfaRequired
│
├── AuthorizationError
│   ├── AccessDenied
│   ├── MalformedPolicyDocument
│   ├── PackedPolicySizeExceeded
│   └── RegionDisabledException
│
├── AssumeRoleError
│   ├── RoleNotFound
│   ├── InvalidExternalId
│   ├── SessionDurationExceeded
│   ├── RoleChainLimitExceeded
│   └── TrustPolicyViolation
│
├── TokenError
│   ├── InvalidIdentityToken
│   ├── ExpiredToken
│   ├── IdpCommunicationError
│   └── InvalidProviderConfiguration
│
├── SimulationError
│   ├── InvalidInput
│   ├── PolicyEvaluationError
│   └── NoSuchEntity
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── DnsResolutionFailed
│
└── ServerError
    ├── InternalError
    ├── ServiceUnavailable
    └── Throttled
```

### 1.6.2 Error Mapping from AWS

| AWS Error Code | Error Type | Retryable |
|----------------|------------|-----------|
| `AccessDenied` | `AuthorizationError::AccessDenied` | No |
| `ExpiredTokenException` | `AuthenticationError::ExpiredCredentials` | No |
| `MalformedPolicyDocument` | `AuthorizationError::MalformedPolicy` | No |
| `PackedPolicySizeExceeded` | `AuthorizationError::PackedPolicySizeExceeded` | No |
| `RegionDisabledException` | `AuthorizationError::RegionDisabled` | No |
| `InvalidIdentityToken` | `TokenError::InvalidIdentityToken` | No |
| `IDPCommunicationError` | `TokenError::IdpCommunicationError` | Yes |
| `Throttling` | `ServerError::Throttled` | Yes |
| `ServiceUnavailable` | `ServerError::ServiceUnavailable` | Yes |
| `InternalFailure` | `ServerError::InternalError` | Yes |

## 1.7 Resilience Requirements

### 1.7.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `ServerError::Throttled` | Yes | 5 | Exponential (1s base) |
| `ServerError::ServiceUnavailable` | Yes | 3 | Exponential (2s base) |
| `ServerError::InternalError` | Yes | 3 | Exponential (1s base) |
| `TokenError::IdpCommunicationError` | Yes | 3 | Fixed (1s) |
| `NetworkError::*` | Yes | 3 | Exponential (500ms base) |
| Auth/Config errors | No | - | - |

### 1.7.2 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |
| Per-endpoint isolation | Yes |

### 1.7.3 Credential Refresh Settings

| Parameter | Default |
|-----------|---------|
| Refresh buffer | 5 minutes before expiry |
| Max refresh retries | 3 |
| Refresh jitter | 0-60 seconds |
| Stale credential grace | 30 seconds |

## 1.8 Observability Requirements

### 1.8.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `iam.assume_role` | `role_arn`, `session_name`, `duration`, `cross_account` |
| `iam.get_caller_identity` | `account`, `arn` |
| `iam.simulate_policy` | `principal_arn`, `action_count`, `resource_count` |
| `iam.refresh_credentials` | `role_arn`, `remaining_lifetime` |

### 1.8.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `iam_assume_role_total` | Counter | `role_arn`, `status`, `cross_account` |
| `iam_assume_role_duration_seconds` | Histogram | `role_arn` |
| `iam_credential_refresh_total` | Counter | `role_arn`, `status` |
| `iam_credential_lifetime_seconds` | Gauge | `role_arn` |
| `iam_simulation_total` | Counter | `principal`, `decision` |
| `iam_errors_total` | Counter | `operation`, `error_type` |

### 1.8.3 Logging

| Level | When |
|-------|------|
| ERROR | Auth failures, configuration errors |
| WARN | Credential refresh failures, throttling |
| INFO | Role assumption, credential refresh |
| DEBUG | Request/response details |
| TRACE | SigV4 signing, XML parsing |

## 1.9 Performance Requirements

### 1.9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| AssumeRole | < 200ms | < 1s |
| GetCallerIdentity | < 100ms | < 500ms |
| SimulatePrincipalPolicy | < 500ms | < 2s |
| Credential from cache | < 1ms | < 5ms |

### 1.9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent assume role | 50+ |
| Cached credential reads | 10000+/sec |
| Policy simulations | 100/sec |

## 1.10 Acceptance Criteria

### 1.10.1 Functional Criteria

- [ ] AssumeRole works (same account)
- [ ] AssumeRole works (cross account)
- [ ] AssumeRoleWithWebIdentity works
- [ ] GetCallerIdentity works
- [ ] GetSessionToken works (with MFA)
- [ ] SimulatePrincipalPolicy works
- [ ] Credential caching works
- [ ] Credential refresh works
- [ ] Session policies work
- [ ] External ID validation works

### 1.10.2 Non-Functional Criteria

- [ ] Credentials never logged
- [ ] SigV4 signing correct
- [ ] Retry respects backoff
- [ ] Circuit breaker trips correctly
- [ ] Metrics emitted correctly
- [ ] Test coverage > 80%

---

# 2. PSEUDOCODE PHASE

## 2.1 Core Client

```pseudocode
CLASS IamClient:
    FIELDS:
        config: IamConfig
        http_transport: HttpTransport
        signer: AwsSigV4Signer
        credential_cache: CredentialCache
        circuit_breaker: CircuitBreaker
        metrics: MetricsCollector

    CONSTRUCTOR(config: IamConfig):
        VALIDATE config
        INITIALIZE http_transport with config.timeout
        INITIALIZE signer with config.base_credentials
        INITIALIZE credential_cache with config.cache_settings
        INITIALIZE circuit_breaker with config.circuit_breaker_config
        INITIALIZE metrics collector

    METHOD assume_role(request: AssumeRoleRequest) -> AssumedCredentials:
        span = START_SPAN("iam.assume_role")
        span.set_attribute("role_arn", request.role_arn)
        span.set_attribute("cross_account", is_cross_account(request.role_arn))

        // Check cache first
        cache_key = build_cache_key(request)
        IF cached = credential_cache.get(cache_key):
            IF NOT cached.needs_refresh():
                RETURN cached

        TRY:
            circuit_breaker.check("sts")

            // Build STS request
            params = {
                "Action": "AssumeRole",
                "Version": "2011-06-15",
                "RoleArn": request.role_arn,
                "RoleSessionName": request.session_name,
            }
            IF request.duration_seconds:
                params["DurationSeconds"] = request.duration_seconds
            IF request.external_id:
                params["ExternalId"] = request.external_id
            IF request.session_policy:
                params["Policy"] = request.session_policy
            FOR tag IN request.session_tags:
                params[f"Tags.member.{i}.Key"] = tag.key
                params[f"Tags.member.{i}.Value"] = tag.value

            http_request = BUILD_STS_REQUEST(params)
            SIGN_REQUEST(http_request, signer)

            response = http_transport.send(http_request)

            IF response.status != 200:
                error = PARSE_STS_ERROR(response)
                circuit_breaker.record_failure("sts")
                THROW error

            result = PARSE_ASSUME_ROLE_RESPONSE(response.body)
            circuit_breaker.record_success("sts")

            // Cache the credentials
            credentials = AssumedCredentials {
                access_key_id: result.credentials.access_key_id,
                secret_access_key: result.credentials.secret_access_key,
                session_token: result.credentials.session_token,
                expiration: result.credentials.expiration,
                assumed_role_arn: result.assumed_role_user.arn,
            }
            credential_cache.put(cache_key, credentials)

            EMIT_METRICS("iam_assume_role_total", role_arn=request.role_arn, status="success")
            RETURN credentials
        CATCH error:
            span.record_error(error)
            EMIT_METRICS("iam_errors_total", operation="assume_role", error_type=error.type())
            IF error.is_retryable():
                RETURN RETRY_WITH_BACKOFF(assume_role, request)
            THROW error
        FINALLY:
            span.end()

    METHOD get_caller_identity() -> CallerIdentity:
        params = {
            "Action": "GetCallerIdentity",
            "Version": "2011-06-15",
        }
        http_request = BUILD_STS_REQUEST(params)
        SIGN_REQUEST(http_request, signer)
        response = http_transport.send(http_request)
        RETURN PARSE_CALLER_IDENTITY_RESPONSE(response.body)

    METHOD simulate_principal_policy(request: SimulationRequest) -> SimulationResult:
        span = START_SPAN("iam.simulate_policy")

        params = {
            "Action": "SimulatePrincipalPolicy",
            "Version": "2010-05-08",
            "PolicySourceArn": request.principal_arn,
        }
        FOR (i, action) IN ENUMERATE(request.action_names):
            params[f"ActionNames.member.{i+1}"] = action
        FOR (i, resource) IN ENUMERATE(request.resource_arns):
            params[f"ResourceArns.member.{i+1}"] = resource

        http_request = BUILD_IAM_REQUEST(params)
        SIGN_REQUEST(http_request, signer)
        response = http_transport.send(http_request)

        result = PARSE_SIMULATION_RESPONSE(response.body)

        FOR eval IN result.evaluation_results:
            EMIT_METRICS("iam_simulation_total",
                principal=request.principal_arn,
                decision=eval.decision)

        RETURN result
```

## 2.2 Credential Cache

```pseudocode
CLASS CredentialCache:
    FIELDS:
        cache: ConcurrentMap<String, CachedCredential>
        refresh_buffer: Duration
        lock: RwLock

    METHOD get(key: String) -> Option<AssumedCredentials>:
        WITH lock.read():
            IF entry = cache.get(key):
                IF entry.is_valid():
                    RETURN entry.credentials
                IF entry.needs_refresh() AND NOT entry.is_expired():
                    // Return stale but trigger async refresh
                    SPAWN refresh_async(key, entry)
                    RETURN entry.credentials
        RETURN None

    METHOD put(key: String, credentials: AssumedCredentials):
        WITH lock.write():
            entry = CachedCredential {
                credentials: credentials,
                refresh_at: credentials.expiration - refresh_buffer,
                cached_at: now(),
            }
            cache.insert(key, entry)

    METHOD refresh_async(key: String, entry: CachedCredential):
        TRY:
            // Re-assume the role using cached parameters
            request = entry.original_request
            new_credentials = client.assume_role(request)
            self.put(key, new_credentials)
        CATCH error:
            LOG_WARN("Credential refresh failed for {key}: {error}")
            // Keep using stale credentials until truly expired

    METHOD needs_refresh(entry: CachedCredential) -> bool:
        RETURN now() >= entry.refresh_at

    METHOD is_expired(entry: CachedCredential) -> bool:
        RETURN now() >= entry.credentials.expiration
```

## 2.3 Credential Provider (for other integrations)

```pseudocode
CLASS AssumedRoleCredentialProvider IMPLEMENTS CredentialProvider:
    FIELDS:
        iam_client: IamClient
        role_arn: String
        session_name: String
        external_id: Option<String>
        current_credentials: AtomicOption<AssumedCredentials>

    METHOD get_credentials() -> AwsCredentials:
        // Check if we have valid cached credentials
        IF creds = current_credentials.get():
            IF NOT needs_refresh(creds):
                RETURN to_aws_credentials(creds)

        // Assume the role
        request = AssumeRoleRequest {
            role_arn: self.role_arn,
            session_name: self.session_name,
            external_id: self.external_id,
        }
        new_creds = iam_client.assume_role(request)
        current_credentials.set(new_creds)

        RETURN to_aws_credentials(new_creds)

    METHOD to_aws_credentials(assumed: AssumedCredentials) -> AwsCredentials:
        RETURN AwsCredentials {
            access_key_id: assumed.access_key_id,
            secret_access_key: assumed.secret_access_key,
            session_token: Some(assumed.session_token),
        }
```

## 2.4 Policy Simulator

```pseudocode
CLASS PolicySimulator:
    FIELDS:
        iam_client: IamClient
        result_cache: LruCache<SimulationKey, SimulationResult>
        cache_ttl: Duration

    METHOD can_perform(principal: String, action: String, resource: String) -> bool:
        result = self.simulate(principal, [action], [resource])
        RETURN result.all_allowed()

    METHOD simulate(principal: String, actions: List<String>, resources: List<String>) -> SimulationResult:
        // Check cache
        cache_key = SimulationKey(principal, actions, resources)
        IF cached = result_cache.get(cache_key):
            RETURN cached

        request = SimulationRequest {
            principal_arn: principal,
            action_names: actions,
            resource_arns: resources,
        }
        result = iam_client.simulate_principal_policy(request)

        // Cache successful simulations
        result_cache.put(cache_key, result, cache_ttl)

        RETURN result

    METHOD batch_simulate(checks: List<PermissionCheck>) -> Map<PermissionCheck, bool>:
        // Group by principal for efficiency
        by_principal = GROUP_BY(checks, c => c.principal)

        results = Map::new()
        FOR (principal, group) IN by_principal:
            actions = group.map(c => c.action).unique()
            resources = group.map(c => c.resource).unique()

            sim_result = self.simulate(principal, actions, resources)

            FOR check IN group:
                results[check] = sim_result.is_allowed(check.action, check.resource)

        RETURN results
```

## 2.5 Cross-Account Role Chain

```pseudocode
CLASS RoleChain:
    FIELDS:
        iam_client: IamClient
        chain: List<RoleChainStep>
        max_chain_depth: int  // AWS limit is 2

    METHOD assume_chain() -> AssumedCredentials:
        IF chain.len() > max_chain_depth:
            THROW AssumeRoleError::RoleChainLimitExceeded

        current_credentials = None

        FOR step IN chain:
            // Create client with current credentials (or base if first)
            step_client = IF current_credentials:
                IamClient::with_credentials(current_credentials)
            ELSE:
                iam_client

            request = AssumeRoleRequest {
                role_arn: step.role_arn,
                session_name: step.session_name,
                external_id: step.external_id,
                duration_seconds: step.duration_seconds,
            }

            current_credentials = step_client.assume_role(request)

            LOG_INFO("Assumed role {step.role_arn} in chain")

        RETURN current_credentials
```

---

# 3. ARCHITECTURE PHASE

## 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Dev Ops Platform                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  S3 Client   │  │   Bedrock    │  │   Other AWS  │          │
│  │              │  │    Client    │  │   Services   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────┬────┴────────┬────────┘                   │
│                      │             │                            │
│                      ▼             ▼                            │
│         ┌────────────────────────────────────────┐              │
│         │      Credential Provider Interface      │              │
│         └────────────────────┬───────────────────┘              │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────┐     │
│  │                  AWS IAM Integration                   │     │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │     │
│  │  │    STS      │ │   Policy    │ │  Credential │      │     │
│  │  │   Service   │ │  Simulator  │ │    Cache    │      │     │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘      │     │
│  │         │               │               │              │     │
│  │         ▼               ▼               ▼              │     │
│  │  ┌─────────────────────────────────────────────┐      │     │
│  │  │              HTTP Transport                  │      │     │
│  │  │         (SigV4 Signed Requests)             │      │     │
│  │  └──────────────────────┬──────────────────────┘      │     │
│  └─────────────────────────┼─────────────────────────────┘     │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │              AWS Services               │
        │  ┌──────────┐  ┌──────────┐            │
        │  │   STS    │  │   IAM    │            │
        │  │ Regional │  │  Global  │            │
        │  └──────────┘  └──────────┘            │
        └────────────────────────────────────────┘
```

## 3.2 Module Structure

```
integrations/aws/iam/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   ├── client/
│   │   ├── mod.rs             # IamClient implementation
│   │   ├── config.rs          # Configuration types
│   │   └── builder.rs         # Client builder pattern
│   ├── sts/
│   │   ├── mod.rs
│   │   ├── assume_role.rs     # AssumeRole operations
│   │   ├── web_identity.rs    # OIDC role assumption
│   │   ├── session_token.rs   # MFA session tokens
│   │   └── federation.rs      # Federation tokens
│   ├── iam/
│   │   ├── mod.rs
│   │   ├── simulator.rs       # Policy simulation
│   │   ├── policy.rs          # Policy retrieval
│   │   └── role.rs            # Role information
│   ├── credentials/
│   │   ├── mod.rs
│   │   ├── cache.rs           # Credential caching
│   │   ├── provider.rs        # CredentialProvider impl
│   │   ├── chain.rs           # Role chaining
│   │   └── refresh.rs         # Refresh logic
│   ├── types/
│   │   ├── mod.rs
│   │   ├── request.rs         # Request types
│   │   ├── response.rs        # Response types
│   │   └── error.rs           # Error types
│   └── transport/
│       ├── mod.rs
│       ├── http.rs            # HTTP transport
│       └── signer.rs          # SigV4 signing
├── tests/
│   ├── integration/
│   └── unit/
└── benches/
```

## 3.3 Data Flow

```
AssumeRole Flow:
───────────────

Application
    │
    │ assume_role(role_arn, session_name)
    ▼
┌─────────────────┐
│ Credential Cache│ ── Check for cached credentials
│                 │ ── If valid, return immediately
└────────┬────────┘
         │ cache miss
         ▼
┌─────────────────┐
│  Circuit Breaker│ ── Check if STS endpoint healthy
│                 │ ── Fail fast if open
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  STS Service    │ ── Build AssumeRole request
│                 │ ── Add session policy if provided
│                 │ ── Add external ID if cross-account
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SigV4 Signer   │ ── Sign request with base credentials
│                 │ ── Add Authorization header
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HTTP Transport │ ── Send to STS endpoint
│                 │ ── Parse XML response
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Credential Cache│ ── Store new credentials
│                 │ ── Schedule refresh
└────────┬────────┘
         │
         ▼
    Return AssumedCredentials
```

## 3.4 Credential Provider Integration

```
S3 Client using IAM Integration:
────────────────────────────────

┌─────────────────┐
│   S3 Client     │
│   (PutObject)   │
└────────┬────────┘
         │ get_credentials()
         ▼
┌─────────────────────────────────┐
│  AssumedRoleCredentialProvider  │
│  ┌─────────────────────────┐    │
│  │ Cached? ────────────────┼──► Return cached
│  └──────────┬──────────────┘    │
│             │ no                │
│             ▼                   │
│  ┌─────────────────────────┐    │
│  │    IamClient            │    │
│  │    .assume_role()       │    │
│  └──────────┬──────────────┘    │
│             │                   │
│             ▼                   │
│  ┌─────────────────────────┐    │
│  │  Cache & Return         │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ S3 Request      │ ◄── Uses temporary credentials
│ (SigV4 signed)  │
└─────────────────┘
```

---

# 4. INTERFACES PHASE

## 4.1 Core Traits (Rust)

```rust
/// Main client trait for AWS IAM/STS operations
#[async_trait]
pub trait IamClient: Send + Sync {
    /// Assume an IAM role
    async fn assume_role(&self, request: AssumeRoleRequest) -> Result<AssumedCredentials, IamError>;

    /// Assume role with web identity (OIDC)
    async fn assume_role_with_web_identity(
        &self,
        request: AssumeRoleWithWebIdentityRequest,
    ) -> Result<AssumedCredentials, IamError>;

    /// Get current caller identity
    async fn get_caller_identity(&self) -> Result<CallerIdentity, IamError>;

    /// Get session token (for MFA)
    async fn get_session_token(
        &self,
        request: GetSessionTokenRequest,
    ) -> Result<SessionCredentials, IamError>;

    /// Simulate principal policy
    async fn simulate_principal_policy(
        &self,
        request: SimulatePolicyRequest,
    ) -> Result<SimulationResult, IamError>;

    /// Get role information
    async fn get_role(&self, role_name: &str) -> Result<RoleInfo, IamError>;

    /// List role policies
    async fn list_role_policies(&self, role_name: &str) -> Result<Vec<String>, IamError>;

    /// Create a credential provider for a role
    fn credential_provider_for_role(
        &self,
        role_arn: &str,
        session_name: &str,
    ) -> Arc<dyn CredentialProvider>;
}

/// Credential provider interface (used by other AWS integrations)
#[async_trait]
pub trait CredentialProvider: Send + Sync {
    /// Get current credentials (may refresh if needed)
    async fn get_credentials(&self) -> Result<AwsCredentials, CredentialError>;

    /// Force refresh of credentials
    async fn refresh(&self) -> Result<AwsCredentials, CredentialError>;

    /// Check if credentials need refresh
    fn needs_refresh(&self) -> bool;
}

/// Policy simulator interface
#[async_trait]
pub trait PolicySimulator: Send + Sync {
    /// Check if principal can perform action on resource
    async fn can_perform(
        &self,
        principal: &str,
        action: &str,
        resource: &str,
    ) -> Result<bool, IamError>;

    /// Simulate multiple actions
    async fn simulate(
        &self,
        request: SimulatePolicyRequest,
    ) -> Result<SimulationResult, IamError>;

    /// Batch check permissions
    async fn batch_check(
        &self,
        checks: Vec<PermissionCheck>,
    ) -> Result<Vec<(PermissionCheck, bool)>, IamError>;
}

/// Role chain builder for cross-account access
pub trait RoleChainBuilder {
    /// Add a role to the chain
    fn add_role(self, role_arn: &str, session_name: &str) -> Self;

    /// Set external ID for cross-account
    fn with_external_id(self, external_id: &str) -> Self;

    /// Set session duration
    fn with_duration(self, duration: Duration) -> Self;

    /// Execute the role chain
    async fn assume(self) -> Result<AssumedCredentials, IamError>;
}
```

## 4.2 Configuration Types

```rust
/// IAM client configuration
#[derive(Clone)]
pub struct IamConfig {
    /// AWS region for STS calls
    pub region: String,

    /// Base credentials for initial signing
    pub base_credentials: Arc<dyn CredentialProvider>,

    /// Use regional STS endpoints (recommended)
    pub use_regional_sts: bool,

    /// Request timeout
    pub timeout: Duration,

    /// Credential cache settings
    pub cache_config: CacheConfig,

    /// Retry configuration
    pub retry_config: RetryConfig,

    /// Circuit breaker configuration
    pub circuit_breaker_config: CircuitBreakerConfig,
}

/// Credential cache configuration
#[derive(Clone, Debug)]
pub struct CacheConfig {
    /// Refresh credentials this long before expiry
    pub refresh_buffer: Duration,

    /// Maximum cached credentials
    pub max_entries: usize,

    /// Enable async refresh
    pub async_refresh: bool,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            refresh_buffer: Duration::from_secs(300), // 5 minutes
            max_entries: 100,
            async_refresh: true,
        }
    }
}

/// Cross-account role configuration
#[derive(Clone, Debug)]
pub struct CrossAccountRoleConfig {
    /// Target account ID
    pub account_id: String,

    /// Role name in target account
    pub role_name: String,

    /// External ID (if required by trust policy)
    pub external_id: Option<SecretString>,

    /// Session name prefix
    pub session_name_prefix: String,

    /// Session duration
    pub duration: Duration,

    /// Session tags
    pub session_tags: Vec<SessionTag>,
}
```

## 4.3 Request/Response Types

```rust
/// Request to assume an IAM role
#[derive(Clone, Debug)]
pub struct AssumeRoleRequest {
    /// ARN of the role to assume
    pub role_arn: String,

    /// Session name (2-64 characters)
    pub session_name: String,

    /// Session duration (900-43200 seconds)
    pub duration_seconds: Option<u32>,

    /// External ID for cross-account trust
    pub external_id: Option<SecretString>,

    /// Session policy (JSON) to scope down permissions
    pub session_policy: Option<String>,

    /// Managed policy ARNs to attach to session
    pub policy_arns: Option<Vec<String>>,

    /// Session tags for audit
    pub session_tags: Option<Vec<SessionTag>>,

    /// Transitive tag keys
    pub transitive_tag_keys: Option<Vec<String>>,

    /// Source identity for audit trail
    pub source_identity: Option<String>,

    /// MFA device serial number
    pub mfa_serial: Option<String>,

    /// MFA token code
    pub mfa_token: Option<String>,
}

/// Session tag for role assumption
#[derive(Clone, Debug)]
pub struct SessionTag {
    pub key: String,
    pub value: String,
}

/// Assumed role credentials
#[derive(Clone)]
pub struct AssumedCredentials {
    /// Access key ID
    pub access_key_id: String,

    /// Secret access key
    pub secret_access_key: SecretString,

    /// Session token
    pub session_token: SecretString,

    /// Credential expiration time
    pub expiration: DateTime<Utc>,

    /// Assumed role ARN
    pub assumed_role_arn: String,

    /// Assumed role ID
    pub assumed_role_id: String,
}

/// Caller identity information
#[derive(Clone, Debug)]
pub struct CallerIdentity {
    /// AWS account ID
    pub account: String,

    /// Caller ARN
    pub arn: String,

    /// User/role ID
    pub user_id: String,
}

/// Policy simulation request
#[derive(Clone, Debug)]
pub struct SimulatePolicyRequest {
    /// Principal ARN to simulate
    pub principal_arn: String,

    /// Actions to simulate
    pub action_names: Vec<String>,

    /// Resource ARNs (optional)
    pub resource_arns: Option<Vec<String>>,

    /// Context entries (conditions)
    pub context_entries: Option<Vec<ContextEntry>>,

    /// Resource policy (optional)
    pub resource_policy: Option<String>,
}

/// Policy simulation result
#[derive(Clone, Debug)]
pub struct SimulationResult {
    /// Evaluation results per action/resource
    pub evaluation_results: Vec<EvaluationResult>,
}

/// Single evaluation result
#[derive(Clone, Debug)]
pub struct EvaluationResult {
    /// Action evaluated
    pub action_name: String,

    /// Resource evaluated
    pub resource_name: Option<String>,

    /// Decision (allowed, implicitDeny, explicitDeny)
    pub decision: EvaluationDecision,

    /// Matching statements
    pub matched_statements: Vec<Statement>,

    /// Missing context keys
    pub missing_context_values: Vec<String>,
}

/// Evaluation decision
#[derive(Clone, Debug, PartialEq)]
pub enum EvaluationDecision {
    Allowed,
    ImplicitDeny,
    ExplicitDeny,
}

impl SimulationResult {
    /// Check if all actions are allowed
    pub fn all_allowed(&self) -> bool {
        self.evaluation_results
            .iter()
            .all(|r| r.decision == EvaluationDecision::Allowed)
    }

    /// Get denied actions
    pub fn denied_actions(&self) -> Vec<&str> {
        self.evaluation_results
            .iter()
            .filter(|r| r.decision != EvaluationDecision::Allowed)
            .map(|r| r.action_name.as_str())
            .collect()
    }
}
```

## 4.4 TypeScript Interfaces

```typescript
interface IamClient {
  assumeRole(request: AssumeRoleRequest): Promise<AssumedCredentials>;
  assumeRoleWithWebIdentity(request: AssumeRoleWithWebIdentityRequest): Promise<AssumedCredentials>;
  getCallerIdentity(): Promise<CallerIdentity>;
  getSessionToken(request: GetSessionTokenRequest): Promise<SessionCredentials>;
  simulatePrincipalPolicy(request: SimulatePolicyRequest): Promise<SimulationResult>;
  getRole(roleName: string): Promise<RoleInfo>;
  listRolePolicies(roleName: string): Promise<string[]>;
  credentialProviderForRole(roleArn: string, sessionName: string): CredentialProvider;
}

interface CredentialProvider {
  getCredentials(): Promise<AwsCredentials>;
  refresh(): Promise<AwsCredentials>;
  needsRefresh(): boolean;
}

interface PolicySimulator {
  canPerform(principal: string, action: string, resource: string): Promise<boolean>;
  simulate(request: SimulatePolicyRequest): Promise<SimulationResult>;
  batchCheck(checks: PermissionCheck[]): Promise<Map<PermissionCheck, boolean>>;
}

interface AssumeRoleRequest {
  roleArn: string;
  sessionName: string;
  durationSeconds?: number;
  externalId?: string;
  sessionPolicy?: string;
  policyArns?: string[];
  sessionTags?: SessionTag[];
  transitiveTagKeys?: string[];
  sourceIdentity?: string;
  mfaSerial?: string;
  mfaToken?: string;
}

interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
  assumedRoleArn: string;
  assumedRoleId: string;
}

interface IamConfig {
  region: string;
  baseCredentials: CredentialProvider;
  useRegionalSts?: boolean;
  timeout?: number;
  cacheConfig?: CacheConfig;
  retryConfig?: RetryConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
}
```

---

# 5. CONSTRAINTS AND OPEN QUESTIONS

## 5.1 Functional Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| FC-1 | No IAM write operations | Read-only, no CreateRole/AttachPolicy |
| FC-2 | Role assumption only | No IAM user credential operations |
| FC-3 | Shared credential chain | Must feed into other AWS integrations |
| FC-4 | Regional STS endpoints | Use regional endpoints for reliability |
| FC-5 | Trust policy adherence | Cannot bypass trust policy requirements |

## 5.2 Non-Functional Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| NFC-1 | Credentials never logged | Use SecretString, never log |
| NFC-2 | Cache TTL < credential lifetime | Prevent stale credential use |
| NFC-3 | Concurrent refresh safety | No credential gaps during refresh |
| NFC-4 | Audit all assume role | Every assumption must be traceable |
| NFC-5 | Session naming convention | Consistent, identifiable session names |

## 5.3 Integration Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| IC-1 | CredentialProvider interface | Must implement shared interface |
| IC-2 | Shared observability | Use platform logging/metrics |
| IC-3 | No infrastructure duplication | Use shared resilience/http |
| IC-4 | Cross-integration credential flow | S3, Bedrock use IAM credentials |

## 5.4 AWS Service Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| AWS-1 | Role chain limit | Maximum 2 role assumptions in chain |
| AWS-2 | Session duration limits | 900-43200 seconds (role dependent) |
| AWS-3 | Session name format | 2-64 chars, [\w+=,.@-]+ |
| AWS-4 | External ID format | 2-1224 chars, [\w+=,.@:/\-]+ |
| AWS-5 | Session policy size | Maximum 2048 characters packed |

## 5.5 Open Questions

| ID | Question | Impact | Proposed Resolution |
|----|----------|--------|---------------------|
| OQ-1 | How to handle MFA for automated workflows? | High | Support TOTP via parameter, no interactive MFA |
| OQ-2 | Should we support SAML federation? | Medium | Yes, via AssumeRoleWithSAML |
| OQ-3 | How to handle credential refresh during long operations? | High | Proactive refresh with 5-min buffer |
| OQ-4 | Cross-region role assumption strategy? | Medium | Use target region's STS endpoint |
| OQ-5 | How to surface permission denied to users? | Medium | Map to typed errors with context |
| OQ-6 | Should policy simulation results be cached? | Low | Yes, with short TTL (5 min) |
| OQ-7 | How to handle temporary IAM outages? | High | Circuit breaker + credential grace period |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial SPARC document - All phases |

---

**SPARC Cycle Status:**

```
╔═══════════════════════════════════════════════════════════════╗
║  ✅ Specification   ✅ Pseudocode   ✅ Architecture             ║
║  ✅ Interfaces      ✅ Constraints/Open Questions               ║
║                                                               ║
║           READY FOR IMPLEMENTATION                            ║
╚═══════════════════════════════════════════════════════════════╝
```

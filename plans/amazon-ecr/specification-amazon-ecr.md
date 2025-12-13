# Amazon ECR Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/ecr`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to interact with Amazon Elastic Container Registry (ECR) for container image publishing, pulling, tagging, and metadata awareness, supporting both private and public registries across multiple regions.

### 1.2 Scope

**In Scope:**
- Repository listing and metadata
- Image listing and inspection
- Image tagging and untagging
- Image manifest retrieval
- Image layer information
- Lifecycle policy awareness (read-only)
- Vulnerability scan status and findings
- Repository policy awareness (read-only)
- Authorization token management
- Cross-region operations
- ECR Public registry support
- Replication status awareness
- Simulation and replay

**Out of Scope:**
- Registry provisioning and configuration
- Repository creation and deletion
- Image build and push (Docker daemon)
- Lifecycle policy authoring
- IAM policy management
- VPC endpoint configuration
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| AWS credential management | `aws/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 RepositoryService

| Operation | API | Description |
|-----------|-----|-------------|
| `list_repositories` | DescribeRepositories | List repositories in registry |
| `get_repository` | DescribeRepositories | Get repository by name |
| `get_repository_policy` | GetRepositoryPolicy | Get repository access policy |
| `get_lifecycle_policy` | GetLifecyclePolicy | Get lifecycle policy |
| `list_tags_for_resource` | ListTagsForResource | Get AWS resource tags |

### 2.2 ImageService

| Operation | API | Description |
|-----------|-----|-------------|
| `list_images` | ListImages | List images in repository |
| `describe_images` | DescribeImages | Get image details |
| `get_image` | BatchGetImage | Get image manifest and config |
| `batch_get_images` | BatchGetImage | Get multiple images |
| `put_image_tag` | PutImage | Add tag to existing image |
| `batch_delete_image` | BatchDeleteImage | Remove image tags/digests |

### 2.3 ManifestService

| Operation | API | Description |
|-----------|-----|-------------|
| `get_manifest` | BatchGetImage | Get image manifest |
| `get_manifest_list` | BatchGetImage | Get multi-arch manifest |
| `get_image_config` | BatchGetImage | Get image configuration |
| `get_layers` | BatchGetImage | Get layer information |

### 2.4 ScanService

| Operation | API | Description |
|-----------|-----|-------------|
| `get_scan_findings` | DescribeImageScanFindings | Get vulnerability scan results |
| `start_scan` | StartImageScan | Initiate image scan |
| `get_scan_status` | DescribeImages | Check scan status |
| `wait_for_scan` | - | Poll until scan completes |

### 2.5 AuthService

| Operation | API | Description |
|-----------|-----|-------------|
| `get_authorization_token` | GetAuthorizationToken | Get Docker login token |
| `get_login_command` | - | Generate docker login command |
| `refresh_token` | - | Refresh expiring token |

### 2.6 ReplicationService

| Operation | API | Description |
|-----------|-----|-------------|
| `get_replication_status` | DescribeImages | Check replication status |
| `list_replication_destinations` | DescribeRegistry | Get replication config |

### 2.7 PublicRegistryService

| Operation | API | Description |
|-----------|-----|-------------|
| `list_public_repositories` | DescribeRepositories | List ECR Public repos |
| `get_public_repository` | DescribeRepositories | Get public repo details |
| `list_public_images` | DescribeImages | List public images |
| `get_public_auth_token` | GetAuthorizationToken | Get public registry token |

---

## 3. Core Types

### 3.1 Repository Types

```
Repository:
  registry_id: String
  repository_name: String
  repository_arn: String
  repository_uri: String
  created_at: DateTime
  image_tag_mutability: TagMutability
  image_scanning_configuration: ScanConfig
  encryption_configuration: EncryptionConfig

TagMutability:
  | Mutable
  | Immutable

ScanConfig:
  scan_on_push: bool
  scan_type: ScanType

ScanType:
  | Basic
  | Enhanced

EncryptionConfig:
  encryption_type: EncryptionType
  kms_key: Option<String>

EncryptionType:
  | Aes256
  | Kms
```

### 3.2 Image Types

```
Image:
  registry_id: String
  repository_name: String
  image_id: ImageIdentifier
  image_manifest: Option<String>
  image_manifest_media_type: Option<String>

ImageIdentifier:
  image_digest: Option<String>
  image_tag: Option<String>

ImageDetail:
  registry_id: String
  repository_name: String
  image_digest: String
  image_tags: Vec<String>
  image_size_in_bytes: u64
  image_pushed_at: DateTime
  image_scan_status: Option<ScanStatus>
  image_scan_findings_summary: Option<ScanFindingsSummary>
  image_manifest_media_type: String
  artifact_media_type: Option<String>
  last_recorded_pull_time: Option<DateTime>

ScanStatus:
  status: ScanState
  description: Option<String>

ScanState:
  | InProgress
  | Complete
  | Failed
  | Unsupported
  | Active
  | Pending
  | ScanningWithFindings
  | FindingsUnavailable
```

### 3.3 Manifest Types

```
ImageManifest:
  schema_version: i32
  media_type: String
  config: Option<ManifestConfig>
  layers: Vec<ManifestLayer>

ManifestConfig:
  media_type: String
  size: u64
  digest: String

ManifestLayer:
  media_type: String
  size: u64
  digest: String

ManifestList:
  schema_version: i32
  media_type: String
  manifests: Vec<PlatformManifest>

PlatformManifest:
  media_type: String
  size: u64
  digest: String
  platform: Platform

Platform:
  architecture: String
  os: String
  os_version: Option<String>
  variant: Option<String>
```

### 3.4 Scan Types

```
ScanFindings:
  image_scan_completed_at: DateTime
  vulnerability_source_updated_at: Option<DateTime>
  finding_severity_counts: Map<Severity, i32>
  findings: Vec<Finding>
  enhanced_findings: Option<Vec<EnhancedFinding>>

Finding:
  name: String
  description: Option<String>
  uri: Option<String>
  severity: Severity
  attributes: Vec<Attribute>

EnhancedFinding:
  aws_account_id: String
  description: String
  finding_arn: String
  first_observed_at: DateTime
  last_observed_at: DateTime
  package_vulnerability_details: PackageVulnerability
  remediation: Remediation
  resources: Vec<Resource>
  score: f64
  score_details: ScoreDetails
  severity: Severity
  status: FindingStatus
  title: String
  type: String
  vulnerability_id: String

Severity:
  | Informational
  | Low
  | Medium
  | High
  | Critical
  | Undefined

Remediation:
  recommendation: Recommendation

Recommendation:
  text: String
  url: Option<String>
```

### 3.5 Authorization Types

```
AuthorizationData:
  authorization_token: SecretString
  expires_at: DateTime
  proxy_endpoint: String

DockerCredentials:
  username: String  // Always "AWS"
  password: SecretString
  registry: String
  expires_at: DateTime

LoginCommand:
  command: String
  expires_at: DateTime
```

### 3.6 Lifecycle Policy Types

```
LifecyclePolicy:
  registry_id: String
  repository_name: String
  lifecycle_policy_text: String
  last_evaluated_at: Option<DateTime>

LifecyclePolicyRule:
  rule_priority: i32
  description: Option<String>
  selection: RuleSelection
  action: RuleAction

RuleSelection:
  tag_status: TagStatus
  tag_prefix_list: Option<Vec<String>>
  count_type: CountType
  count_number: i32
  count_unit: Option<CountUnit>

TagStatus:
  | Tagged
  | Untagged
  | Any

CountType:
  | ImageCountMoreThan
  | SinceImagePushed

CountUnit:
  | Days
```

### 3.7 Replication Types

```
ReplicationStatus:
  region: String
  registry_id: String
  status: ReplicationState

ReplicationState:
  | InProgress
  | Complete
  | Failed

ReplicationConfiguration:
  rules: Vec<ReplicationRule>

ReplicationRule:
  destinations: Vec<ReplicationDestination>
  repository_filters: Option<Vec<RepositoryFilter>>

ReplicationDestination:
  region: String
  registry_id: String
```

---

## 4. Configuration

```
EcrConfig:
  # Authentication
  auth: AuthConfig
  region: String
  registry_id: Option<String>  # Account ID, defaults to caller

  # Endpoint settings
  endpoint_url: Option<String>  # Override for testing/VPC
  use_fips: bool                # Default: false
  use_dualstack: bool           # Default: false

  # Resilience
  max_retries: u32              # Default: 3
  request_timeout_ms: u64       # Default: 30000

  # Token management
  token_refresh_buffer_secs: u64  # Default: 300 (5 min before expiry)

  # ECR Public settings
  public_registry: bool         # Default: false

AuthConfig:
  | DefaultChain
  | Static { access_key_id: SecretString, secret_access_key: SecretString }
  | AssumeRole { role_arn: String, session_name: Option<String> }
  | WebIdentity { role_arn: String, token_file: String }
```

---

## 5. Error Taxonomy

| Error Type | AWS Error | Retryable | Description |
|------------|-----------|-----------|-------------|
| `RepositoryNotFound` | RepositoryNotFoundException | No | Repository does not exist |
| `ImageNotFound` | ImageNotFoundException | No | Image not found |
| `LayersNotFound` | LayersNotFoundException | No | Layers not available |
| `LifecyclePolicyNotFound` | LifecyclePolicyNotFoundException | No | No lifecycle policy |
| `RepositoryPolicyNotFound` | RepositoryPolicyNotFoundException | No | No repository policy |
| `ScanNotFound` | ScanNotFoundException | No | Scan not found |
| `InvalidParameter` | InvalidParameterException | No | Invalid request parameter |
| `InvalidLayerPart` | InvalidLayerPartException | No | Invalid layer upload |
| `LimitExceeded` | LimitExceededException | Yes | Service limit exceeded |
| `TooManyTags` | TooManyTagsException | No | Too many tags on resource |
| `ImageTagAlreadyExists` | ImageTagAlreadyExistsException | No | Tag exists (immutable) |
| `ImageDigestMismatch` | ImageDigestDoesNotMatchException | No | Digest verification failed |
| `AccessDenied` | AccessDeniedException | No | Insufficient permissions |
| `KmsError` | KmsException | Yes* | KMS operation failed |
| `ServiceUnavailable` | ServerException | Yes | ECR service error |
| `ThrottlingException` | ThrottlingException | Yes | Request throttled |

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| GetAuthorizationToken | 500/sec | Per registry |
| DescribeRepositories | 1000/sec | Per registry |
| DescribeImages | 1000/sec | Per repository |
| BatchGetImage | 2000/sec | Per repository |
| ListImages | 100/sec | Per repository |
| PutImage | 10/sec | Per repository |
| BatchDeleteImage | 100/sec | Per repository |
| StartImageScan | 1/sec | Per image |
| Images per repository | 10,000 | Default quota |
| Repositories per registry | 10,000 | Default quota |

---

## 7. Security Requirements

### 7.1 Credential Protection
- AWS credentials via `SecretString`
- Authorization tokens encrypted in memory
- Token refresh before expiry
- No credential logging

### 7.2 Access Scoping
- Required IAM permissions:
  - `ecr:DescribeRepositories`
  - `ecr:ListImages`
  - `ecr:DescribeImages`
  - `ecr:BatchGetImage`
  - `ecr:GetDownloadUrlForLayer`
  - `ecr:GetAuthorizationToken`
  - `ecr:DescribeImageScanFindings`
- Support for read-only mode
- Cross-account access via resource policies

### 7.3 Data Security
- Image digests logged (not content)
- Manifest content not logged
- Scan findings may be logged (configurable)
- Authorization tokens never logged

---

## 8. Simulation Requirements

### 8.1 MockEcrClient
- Simulate all API operations
- Configurable repository/image states
- Inject errors for testing
- Track operation history

### 8.2 Registry Replay
- Record API interactions
- Replay for regression testing
- Capture image metadata sequences

### 8.3 Local Registry Model
- In-memory repository structure
- Simulate scan progression
- Mock manifest storage

---

## 9. Integration Points

### 9.1 Shared Modules

```
aws/auth:
  - get_credentials() -> Credentials
  - assume_role(role_arn) -> Credentials
  - refresh_credentials() -> Credentials

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per region
  - RateLimiter (adaptive)

shared/observability:
  - Metrics: ecr.images, ecr.scans, ecr.latency
  - Traces: span per operation
  - Logs: structured, content-redacted

shared/vector-memory:
  - store_image_embedding(digest, metadata)
  - search_similar_images(query)
```

### 9.2 Related Integrations

```
aws/ecs:
  - Task definitions using ECR images
  - Service deployments

aws/lambda:
  - Container image functions

kubernetes:
  - Pod image references
  - ImagePullSecrets
```

---

## 10. Multi-Region Considerations

### 10.1 Regional Endpoints

```
Region Pattern:
  Private: {account}.dkr.ecr.{region}.amazonaws.com
  Public:  public.ecr.aws/{alias}

FIPS Endpoints:
  ecr-fips.{region}.amazonaws.com

Cross-Region Operations:
  - Separate client per region
  - Replication status tracking
  - Regional token caching
```

### 10.2 Replication Awareness

```
Replication Tracking:
  - Source region identification
  - Destination status polling
  - Consistency verification
```

---

## 11. API Version and Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| ECR API | 2015-09-21 | Private registry |
| ECR Public API | 2020-10-30 | Public registry |
| Docker Registry API | v2 | Manifest format |
| OCI Image Spec | 1.0 | Image format |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-amazon-ecr.md | Complete |
| 2. Pseudocode | pseudocode-amazon-ecr.md | Pending |
| 3. Architecture | architecture-amazon-ecr.md | Pending |
| 4. Refinement | refinement-amazon-ecr.md | Pending |
| 5. Completion | completion-amazon-ecr.md | Pending |

---

*Phase 1: Specification - Complete*

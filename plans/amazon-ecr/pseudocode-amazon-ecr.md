# Amazon ECR Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/ecr`

---

## 1. Client Initialization

```
FUNCTION create_ecr_client(config: EcrConfig) -> EcrClient:
    // Validate configuration
    VALIDATE config.region IS NOT empty

    // Build endpoint URL
    endpoint = IF config.endpoint_url IS NOT null:
        config.endpoint_url
    ELSE IF config.public_registry:
        "https://api.ecr-public.{}.amazonaws.com".format(config.region)
    ELSE IF config.use_fips:
        "https://ecr-fips.{}.amazonaws.com".format(config.region)
    ELSE:
        "https://api.ecr.{}.amazonaws.com".format(config.region)

    // Initialize AWS SDK client
    aws_config = aws/auth.create_config(
        region: config.region,
        credentials: config.auth,
        endpoint: endpoint
    )

    // Initialize ECR client
    ecr_client = IF config.public_registry:
        EcrPublicClient::new(aws_config)
    ELSE:
        EcrClient::new(aws_config)

    // Initialize rate limiter (adaptive based on throttling)
    rate_limiter = shared/resilience.create_adaptive_rate_limiter(
        initial_rate: 100,  // Conservative start
        min_rate: 10,
        max_rate: 1000
    )

    // Initialize circuit breaker
    circuit_breaker = shared/resilience.create_circuit_breaker(
        failure_threshold: 5,
        reset_timeout_ms: 30000
    )

    // Initialize token cache
    token_cache = TokenCache::new(
        refresh_buffer: Duration::seconds(config.token_refresh_buffer_secs)
    )

    RETURN EcrClientWrapper(
        ecr_client: ecr_client,
        rate_limiter: rate_limiter,
        circuit_breaker: circuit_breaker,
        token_cache: token_cache,
        config: config
    )
```

---

## 2. Repository Operations

### 2.1 List Repositories

```
FUNCTION list_repositories(
    client: EcrClient,
    options: ListRepositoriesOptions
) -> RepositoryList:
    repositories = []
    next_token = null

    LOOP:
        request = DescribeRepositoriesRequest {
            registry_id: options.registry_id OR client.config.registry_id,
            repository_names: options.repository_names,
            next_token: next_token,
            max_results: options.max_results OR 100
        }

        response = CALL execute_request(client, "DescribeRepositories", request)

        FOR repo IN response.repositories:
            repositories.APPEND(parse_repository(repo))

        next_token = response.next_token
        IF next_token IS null:
            BREAK

    RETURN RepositoryList(
        repositories: repositories,
        total_count: repositories.length
    )
```

### 2.2 Get Repository

```
FUNCTION get_repository(
    client: EcrClient,
    repository_name: String
) -> Repository:
    request = DescribeRepositoriesRequest {
        repository_names: [repository_name],
        registry_id: client.config.registry_id
    }

    response = CALL execute_request(client, "DescribeRepositories", request)

    IF response.repositories.is_empty():
        THROW RepositoryNotFound(repository_name)

    RETURN parse_repository(response.repositories[0])
```

### 2.3 Get Lifecycle Policy

```
FUNCTION get_lifecycle_policy(
    client: EcrClient,
    repository_name: String
) -> LifecyclePolicy:
    request = GetLifecyclePolicyRequest {
        repository_name: repository_name,
        registry_id: client.config.registry_id
    }

    TRY:
        response = CALL execute_request(client, "GetLifecyclePolicy", request)

        RETURN LifecyclePolicy(
            registry_id: response.registry_id,
            repository_name: response.repository_name,
            lifecycle_policy_text: response.lifecycle_policy_text,
            last_evaluated_at: response.last_evaluated_at
        )
    CATCH LifecyclePolicyNotFoundException:
        THROW LifecyclePolicyNotFound(repository_name)
```

---

## 3. Image Operations

### 3.1 List Images

```
FUNCTION list_images(
    client: EcrClient,
    repository_name: String,
    options: ListImagesOptions
) -> ImageList:
    images = []
    next_token = null

    LOOP:
        request = ListImagesRequest {
            repository_name: repository_name,
            registry_id: client.config.registry_id,
            next_token: next_token,
            max_results: options.max_results OR 100,
            filter: IF options.tag_status IS NOT null:
                ImageFilter { tag_status: options.tag_status }
            ELSE:
                null
        }

        response = CALL execute_request(client, "ListImages", request)

        FOR image_id IN response.image_ids:
            images.APPEND(ImageIdentifier(
                image_digest: image_id.image_digest,
                image_tag: image_id.image_tag
            ))

        next_token = response.next_token
        IF next_token IS null OR images.length >= options.limit:
            BREAK

    RETURN ImageList(
        images: images,
        next_token: next_token
    )
```

### 3.2 Describe Images

```
FUNCTION describe_images(
    client: EcrClient,
    repository_name: String,
    image_ids: Vec<ImageIdentifier>
) -> Vec<ImageDetail>:
    // Batch into groups of 100 (API limit)
    batches = chunk(image_ids, 100)
    all_details = []

    FOR batch IN batches:
        request = DescribeImagesRequest {
            repository_name: repository_name,
            registry_id: client.config.registry_id,
            image_ids: batch.map(id => {
                image_digest: id.image_digest,
                image_tag: id.image_tag
            })
        }

        response = CALL execute_request(client, "DescribeImages", request)

        FOR detail IN response.image_details:
            all_details.APPEND(parse_image_detail(detail))

    RETURN all_details
```

### 3.3 Get Image

```
FUNCTION get_image(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier
) -> Image:
    request = BatchGetImageRequest {
        repository_name: repository_name,
        registry_id: client.config.registry_id,
        image_ids: [{
            image_digest: image_id.image_digest,
            image_tag: image_id.image_tag
        }],
        accepted_media_types: [
            "application/vnd.docker.distribution.manifest.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.index.v1+json"
        ]
    }

    response = CALL execute_request(client, "BatchGetImage", request)

    IF response.images.is_empty():
        IF response.failures.length > 0:
            failure = response.failures[0]
            THROW ImageNotFound(FORMAT("{}: {}", failure.image_id, failure.failure_reason))
        THROW ImageNotFound(image_id.to_string())

    image = response.images[0]
    RETURN Image(
        registry_id: image.registry_id,
        repository_name: image.repository_name,
        image_id: parse_image_id(image.image_id),
        image_manifest: image.image_manifest,
        image_manifest_media_type: image.image_manifest_media_type
    )
```

### 3.4 Put Image Tag

```
FUNCTION put_image_tag(
    client: EcrClient,
    repository_name: String,
    source_image: ImageIdentifier,
    target_tag: String
) -> Image:
    // First get the existing image manifest
    source = CALL get_image(client, repository_name, source_image)

    request = PutImageRequest {
        repository_name: repository_name,
        registry_id: client.config.registry_id,
        image_manifest: source.image_manifest,
        image_manifest_media_type: source.image_manifest_media_type,
        image_tag: target_tag,
        image_digest: source.image_id.image_digest
    }

    TRY:
        response = CALL execute_request(client, "PutImage", request)

        shared/observability.emit_counter("ecr.images.tagged", 1, {
            repository: repository_name
        })

        RETURN Image(
            registry_id: response.image.registry_id,
            repository_name: response.image.repository_name,
            image_id: parse_image_id(response.image.image_id),
            image_manifest: response.image.image_manifest,
            image_manifest_media_type: response.image.image_manifest_media_type
        )
    CATCH ImageTagAlreadyExistsException:
        THROW ImageTagAlreadyExists(target_tag)
```

### 3.5 Batch Delete Images

```
FUNCTION batch_delete_images(
    client: EcrClient,
    repository_name: String,
    image_ids: Vec<ImageIdentifier>
) -> DeleteResult:
    // Batch into groups of 100
    batches = chunk(image_ids, 100)
    all_deleted = []
    all_failures = []

    FOR batch IN batches:
        request = BatchDeleteImageRequest {
            repository_name: repository_name,
            registry_id: client.config.registry_id,
            image_ids: batch.map(id => {
                image_digest: id.image_digest,
                image_tag: id.image_tag
            })
        }

        response = CALL execute_request(client, "BatchDeleteImage", request)

        FOR deleted IN response.image_ids:
            all_deleted.APPEND(parse_image_id(deleted))

        FOR failure IN response.failures:
            all_failures.APPEND(DeleteFailure(
                image_id: parse_image_id(failure.image_id),
                failure_code: failure.failure_code,
                failure_reason: failure.failure_reason
            ))

    shared/observability.emit_counter("ecr.images.deleted", all_deleted.length, {
        repository: repository_name
    })

    RETURN DeleteResult(
        deleted: all_deleted,
        failures: all_failures
    )
```

---

## 4. Manifest Operations

### 4.1 Get Manifest

```
FUNCTION get_manifest(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier
) -> ImageManifest:
    image = CALL get_image(client, repository_name, image_id)

    manifest_json = parse_json(image.image_manifest)

    // Handle manifest list vs single manifest
    IF is_manifest_list(manifest_json):
        THROW InvalidParameter("Use get_manifest_list for multi-arch images")

    RETURN parse_image_manifest(manifest_json)
```

### 4.2 Get Manifest List

```
FUNCTION get_manifest_list(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier
) -> ManifestList:
    image = CALL get_image(client, repository_name, image_id)

    manifest_json = parse_json(image.image_manifest)

    IF NOT is_manifest_list(manifest_json):
        THROW InvalidParameter("Image is not a multi-arch manifest list")

    RETURN parse_manifest_list(manifest_json)
```

### 4.3 Get Image Config

```
FUNCTION get_image_config(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier
) -> ImageConfig:
    manifest = CALL get_manifest(client, repository_name, image_id)

    IF manifest.config IS null:
        THROW InvalidParameter("Manifest has no config")

    // Get the config blob
    config_digest = manifest.config.digest

    // For ECR, we need to use BatchGetImage with specific media types
    request = BatchGetImageRequest {
        repository_name: repository_name,
        registry_id: client.config.registry_id,
        image_ids: [{
            image_digest: image_id.image_digest OR config_digest
        }],
        accepted_media_types: [
            "application/vnd.docker.container.image.v1+json",
            "application/vnd.oci.image.config.v1+json"
        ]
    }

    response = CALL execute_request(client, "BatchGetImage", request)

    IF response.images.is_empty():
        THROW ImageNotFound("Config not found")

    RETURN parse_image_config(response.images[0].image_manifest)
```

### 4.4 Get Layers

```
FUNCTION get_layers(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier
) -> Vec<LayerInfo>:
    manifest = CALL get_manifest(client, repository_name, image_id)

    layers = []
    FOR layer IN manifest.layers:
        layers.APPEND(LayerInfo(
            digest: layer.digest,
            size: layer.size,
            media_type: layer.media_type
        ))

    RETURN layers
```

---

## 5. Scan Operations

### 5.1 Start Image Scan

```
FUNCTION start_scan(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier
) -> ScanStatus:
    request = StartImageScanRequest {
        repository_name: repository_name,
        registry_id: client.config.registry_id,
        image_id: {
            image_digest: image_id.image_digest,
            image_tag: image_id.image_tag
        }
    }

    response = CALL execute_request(client, "StartImageScan", request)

    shared/observability.emit_counter("ecr.scans.started", 1, {
        repository: repository_name
    })

    RETURN ScanStatus(
        status: parse_scan_state(response.image_scan_status.status),
        description: response.image_scan_status.description
    )
```

### 5.2 Get Scan Findings

```
FUNCTION get_scan_findings(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier,
    options: ScanFindingsOptions
) -> ScanFindings:
    findings = []
    enhanced_findings = []
    next_token = null

    LOOP:
        request = DescribeImageScanFindingsRequest {
            repository_name: repository_name,
            registry_id: client.config.registry_id,
            image_id: {
                image_digest: image_id.image_digest,
                image_tag: image_id.image_tag
            },
            next_token: next_token,
            max_results: options.max_results OR 100
        }

        response = CALL execute_request(client, "DescribeImageScanFindings", request)

        // Check scan status
        IF response.image_scan_status.status == "IN_PROGRESS":
            THROW ScanInProgress(image_id.to_string())

        IF response.image_scan_status.status == "FAILED":
            THROW ScanFailed(response.image_scan_status.description)

        // Collect findings
        FOR finding IN response.image_scan_findings.findings:
            findings.APPEND(parse_finding(finding))

        FOR enhanced IN response.image_scan_findings.enhanced_findings:
            enhanced_findings.APPEND(parse_enhanced_finding(enhanced))

        next_token = response.next_token
        IF next_token IS null:
            BREAK

    RETURN ScanFindings(
        image_scan_completed_at: response.image_scan_findings.image_scan_completed_at,
        vulnerability_source_updated_at: response.image_scan_findings.vulnerability_source_updated_at,
        finding_severity_counts: response.image_scan_findings.finding_severity_counts,
        findings: findings,
        enhanced_findings: IF enhanced_findings.length > 0 THEN Some(enhanced_findings) ELSE None
    )
```

### 5.3 Wait for Scan

```
FUNCTION wait_for_scan(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier,
    options: WaitOptions
) -> ScanFindings:
    timeout_at = now() + options.timeout OR Duration::minutes(30)
    poll_interval = options.poll_interval OR Duration::seconds(10)

    WHILE now() < timeout_at:
        // Get image to check scan status
        details = CALL describe_images(client, repository_name, [image_id])

        IF details.is_empty():
            THROW ImageNotFound(image_id.to_string())

        detail = details[0]

        IF detail.image_scan_status IS null:
            THROW ScanNotFound("Scan not initiated")

        status = detail.image_scan_status.status

        IF status == "COMPLETE":
            RETURN CALL get_scan_findings(client, repository_name, image_id, {})

        IF status == "FAILED":
            THROW ScanFailed(detail.image_scan_status.description)

        shared/observability.emit_gauge("ecr.scan.progress", {
            repository: repository_name,
            status: status
        })

        SLEEP(poll_interval)

    THROW Timeout("Scan did not complete in time")
```

---

## 6. Authorization Operations

### 6.1 Get Authorization Token

```
FUNCTION get_authorization_token(client: EcrClient) -> AuthorizationData:
    // Check cache first
    cached = client.token_cache.get(client.config.registry_id)
    IF cached IS NOT null AND NOT cached.is_expiring():
        RETURN cached

    request = GetAuthorizationTokenRequest {
        registry_ids: IF client.config.registry_id IS NOT null:
            [client.config.registry_id]
        ELSE:
            null
    }

    response = CALL execute_request(client, "GetAuthorizationToken", request)

    IF response.authorization_data.is_empty():
        THROW Unauthorized("No authorization data returned")

    auth_data = response.authorization_data[0]

    result = AuthorizationData(
        authorization_token: SecretString::new(auth_data.authorization_token),
        expires_at: auth_data.expires_at,
        proxy_endpoint: auth_data.proxy_endpoint
    )

    // Cache the token
    client.token_cache.set(client.config.registry_id, result)

    RETURN result
```

### 6.2 Get Docker Credentials

```
FUNCTION get_docker_credentials(client: EcrClient) -> DockerCredentials:
    auth_data = CALL get_authorization_token(client)

    // Token is base64 encoded "AWS:<password>"
    decoded = base64_decode(auth_data.authorization_token.expose())
    parts = decoded.split(":")

    IF parts.length != 2:
        THROW ParseError("Invalid authorization token format")

    RETURN DockerCredentials(
        username: parts[0],  // Always "AWS"
        password: SecretString::new(parts[1]),
        registry: auth_data.proxy_endpoint,
        expires_at: auth_data.expires_at
    )
```

### 6.3 Get Login Command

```
FUNCTION get_login_command(client: EcrClient) -> LoginCommand:
    creds = CALL get_docker_credentials(client)

    // Construct docker login command (password via stdin for security)
    command = FORMAT(
        "echo '{}' | docker login --username {} --password-stdin {}",
        creds.password.expose(),
        creds.username,
        creds.registry
    )

    RETURN LoginCommand(
        command: command,
        expires_at: creds.expires_at
    )
```

---

## 7. Replication Operations

### 7.1 Get Replication Status

```
FUNCTION get_replication_status(
    client: EcrClient,
    repository_name: String,
    image_id: ImageIdentifier
) -> Vec<ReplicationStatus>:
    details = CALL describe_images(client, repository_name, [image_id])

    IF details.is_empty():
        THROW ImageNotFound(image_id.to_string())

    detail = details[0]

    // Replication status is in image scan findings for enhanced scanning
    // For basic, we need to query each destination region
    statuses = []

    replication_config = CALL get_replication_configuration(client)

    FOR rule IN replication_config.rules:
        FOR dest IN rule.destinations:
            // Create client for destination region
            dest_client = create_regional_client(client, dest.region)

            TRY:
                dest_details = CALL describe_images(
                    dest_client, repository_name, [image_id]
                )

                IF dest_details.length > 0:
                    statuses.APPEND(ReplicationStatus(
                        region: dest.region,
                        registry_id: dest.registry_id,
                        status: ReplicationState::Complete
                    ))
                ELSE:
                    statuses.APPEND(ReplicationStatus(
                        region: dest.region,
                        registry_id: dest.registry_id,
                        status: ReplicationState::InProgress
                    ))
            CATCH:
                statuses.APPEND(ReplicationStatus(
                    region: dest.region,
                    registry_id: dest.registry_id,
                    status: ReplicationState::Failed
                ))

    RETURN statuses
```

### 7.2 Get Replication Configuration

```
FUNCTION get_replication_configuration(client: EcrClient) -> ReplicationConfiguration:
    request = DescribeRegistryRequest {}

    response = CALL execute_request(client, "DescribeRegistry", request)

    IF response.replication_configuration IS null:
        RETURN ReplicationConfiguration(rules: [])

    RETURN parse_replication_config(response.replication_configuration)
```

---

## 8. ECR Public Operations

### 8.1 List Public Repositories

```
FUNCTION list_public_repositories(
    client: EcrClient,
    options: ListPublicReposOptions
) -> PublicRepositoryList:
    repositories = []
    next_token = null

    LOOP:
        request = DescribeRepositoriesRequest {
            repository_names: options.repository_names,
            next_token: next_token,
            max_results: options.max_results OR 100
        }

        response = CALL execute_public_request(client, "DescribeRepositories", request)

        FOR repo IN response.repositories:
            repositories.APPEND(parse_public_repository(repo))

        next_token = response.next_token
        IF next_token IS null:
            BREAK

    RETURN PublicRepositoryList(
        repositories: repositories
    )
```

### 8.2 Get Public Auth Token

```
FUNCTION get_public_auth_token(client: EcrClient) -> AuthorizationData:
    // ECR Public uses a different API
    request = GetAuthorizationTokenRequest {}

    response = CALL execute_public_request(client, "GetAuthorizationToken", request)

    RETURN AuthorizationData(
        authorization_token: SecretString::new(response.authorization_data.authorization_token),
        expires_at: response.authorization_data.expires_at,
        proxy_endpoint: "public.ecr.aws"
    )
```

---

## 9. Request Execution

### 9.1 Execute Request

```
FUNCTION execute_request(
    client: EcrClient,
    operation: String,
    request: Object
) -> Object:
    span = shared/observability.start_span("ecr.request", {
        operation: operation,
        region: client.config.region
    })

    TRY:
        // Acquire rate limit token
        CALL client.rate_limiter.acquire()

        // Check circuit breaker
        IF client.circuit_breaker.is_open():
            THROW ServiceUnavailable("Circuit breaker open")

        // Execute request
        response = CALL client.ecr_client.send(operation, request)

        client.circuit_breaker.record_success()
        client.rate_limiter.record_success()

        RETURN response

    CATCH ThrottlingException:
        client.rate_limiter.record_throttle()
        THROW RateLimited()

    CATCH error:
        IF is_server_error(error):
            client.circuit_breaker.record_failure()
        span.record_error(error)
        THROW map_aws_error(error)

    FINALLY:
        span.end()
```

### 9.2 Error Mapping

```
FUNCTION map_aws_error(error: AwsError) -> EcrError:
    MATCH error.code:
        CASE "RepositoryNotFoundException":
            RETURN RepositoryNotFound(error.message)
        CASE "ImageNotFoundException":
            RETURN ImageNotFound(error.message)
        CASE "LayersNotFoundException":
            RETURN LayersNotFound(error.message)
        CASE "LifecyclePolicyNotFoundException":
            RETURN LifecyclePolicyNotFound(error.message)
        CASE "ScanNotFoundException":
            RETURN ScanNotFound(error.message)
        CASE "ImageTagAlreadyExistsException":
            RETURN ImageTagAlreadyExists(error.message)
        CASE "ImageDigestDoesNotMatchException":
            RETURN ImageDigestMismatch(error.message)
        CASE "LimitExceededException":
            RETURN LimitExceeded(error.message)
        CASE "AccessDeniedException":
            RETURN AccessDenied(error.message)
        CASE "ThrottlingException":
            RETURN ThrottlingException(error.message)
        CASE "ServerException":
            RETURN ServiceUnavailable(error.message)
        DEFAULT:
            RETURN EcrError(error.code, error.message)
```

---

## 10. Simulation Support

### 10.1 Mock Client

```
FUNCTION create_mock_client(initial_state: MockState) -> MockEcrClient:
    RETURN MockEcrClient(
        repositories: initial_state.repositories OR {},
        images: initial_state.images OR {},
        manifests: initial_state.manifests OR {},
        scan_results: initial_state.scan_results OR {},
        operation_history: [],
        error_injections: {}
    )
```

### 10.2 Simulate Scan Progression

```
FUNCTION simulate_scan_progression(
    mock: MockEcrClient,
    repository_name: String,
    image_id: ImageIdentifier,
    findings: Vec<Finding>,
    duration_ms: u64
) -> void:
    // Set initial status
    mock.scan_results.set(
        image_id.to_string(),
        ScanStatus(status: ScanState::InProgress, description: "Scanning...")
    )

    // Simulate scan duration
    SLEEP(duration_ms)

    // Set final results
    mock.scan_results.set(
        image_id.to_string(),
        ScanFindings(
            image_scan_completed_at: now(),
            finding_severity_counts: count_by_severity(findings),
            findings: findings
        )
    )
```

### 10.3 Record and Replay

```
FUNCTION record_operation(mock: MockEcrClient, op: Operation) -> void:
    mock.operation_history.APPEND(OperationRecord(
        operation: op,
        timestamp: now(),
        state_snapshot: snapshot_state(mock)
    ))

FUNCTION replay_operations(
    mock: MockEcrClient,
    operations: Vec<OperationRecord>
) -> ReplayResult:
    results = []

    FOR record IN operations:
        mock.restore_state(record.state_snapshot)

        TRY:
            result = CALL execute_operation(mock, record.operation)
            results.APPEND(ReplayOutcome::Success(result))
        CATCH error:
            results.APPEND(ReplayOutcome::Error(error))

    RETURN ReplayResult(
        total: operations.length,
        successful: results.filter(r => r.is_success()).length,
        failed: results.filter(r => r.is_error()).length,
        outcomes: results
    )
```

---

## 11. Vector Memory Integration

### 11.1 Index Image

```
FUNCTION index_image(
    client: EcrClient,
    repository_name: String,
    image_detail: ImageDetail
) -> void:
    // Build searchable content
    content = FORMAT("""
        Repository: {}
        Digest: {}
        Tags: {}
        Size: {} bytes
        Pushed: {}
        Media Type: {}
    """, repository_name, image_detail.image_digest,
        join(image_detail.image_tags, ", "),
        image_detail.image_size_in_bytes,
        image_detail.image_pushed_at,
        image_detail.image_manifest_media_type)

    // Include scan summary if available
    IF image_detail.image_scan_findings_summary IS NOT null:
        content += FORMAT("\nVulnerabilities: {}",
            format_severity_counts(image_detail.image_scan_findings_summary))

    metadata = {
        repository: repository_name,
        digest: image_detail.image_digest,
        tags: image_detail.image_tags,
        size: image_detail.image_size_in_bytes,
        pushed_at: image_detail.image_pushed_at
    }

    CALL shared/vector-memory.store(
        namespace: "ecr",
        id: image_detail.image_digest,
        content: content,
        metadata: metadata
    )
```

### 11.2 Search Images

```
FUNCTION search_images(
    client: EcrClient,
    query: String,
    options: SearchOptions
) -> Vec<ImageSearchResult>:
    results = CALL shared/vector-memory.search(
        namespace: "ecr",
        query: query,
        limit: options.limit OR 10,
        filter: options.metadata_filter
    )

    search_results = []
    FOR result IN results:
        // Fetch current image details
        TRY:
            details = CALL describe_images(client, result.metadata.repository, [
                ImageIdentifier(image_digest: result.id)
            ])
            IF details.length > 0:
                search_results.APPEND(ImageSearchResult(
                    image_detail: details[0],
                    similarity: result.score
                ))
        CATCH:
            // Image may have been deleted
            CONTINUE

    RETURN search_results
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-amazon-ecr.md | Complete |
| 2. Pseudocode | pseudocode-amazon-ecr.md | Complete |
| 3. Architecture | architecture-amazon-ecr.md | Pending |
| 4. Refinement | refinement-amazon-ecr.md | Pending |
| 5. Completion | completion-amazon-ecr.md | Pending |

---

*Phase 2: Pseudocode - Complete*

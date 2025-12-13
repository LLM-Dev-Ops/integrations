# Google Artifact Registry Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google-artifact-registry`

---

## 1. Core Client

### 1.1 ArtifactRegistryClient

```pseudocode
CLASS ArtifactRegistryClient:
    config: ArtifactRegistryConfig
    auth_provider: GcpAuthProvider
    http_client: HttpClient
    circuit_breaker: CircuitBreaker
    metrics: MetricsCollector

    CONSTRUCTOR(config: ArtifactRegistryConfig, credentials: GcpCredentials):
        self.config = config
        self.auth_provider = GcpAuthProvider::new(credentials)
        self.http_client = HttpClient::new(config.timeout)
        self.circuit_breaker = CircuitBreaker::new(config.circuit_breaker)
        self.metrics = MetricsCollector::new("gar")

    FUNCTION repositories(&self) -> RepositoryService:
        RETURN RepositoryService::new(self)

    FUNCTION packages(&self) -> PackageService:
        RETURN PackageService::new(self)

    FUNCTION docker(&self) -> DockerService:
        RETURN DockerService::new(self)

    FUNCTION vulnerabilities(&self) -> VulnerabilityService:
        RETURN VulnerabilityService::new(self)
```

### 1.2 Configuration

```pseudocode
STRUCT ArtifactRegistryConfig:
    project_id: String
    default_location: String              // e.g., "us-central1" or "us"
    api_endpoint: String                  // Default: "artifactregistry.googleapis.com"
    timeout: Duration                     // Default: 30s
    circuit_breaker: CircuitBreakerConfig
    retry_config: RetryConfig

STRUCT ImageReference:
    location: String
    project: String
    repository: String
    image: String
    reference: TagOrDigest                // Tag name or sha256 digest

    FUNCTION registry_url(&self) -> String:
        RETURN format!("{}-docker.pkg.dev", self.location)

    FUNCTION full_name(&self) -> String:
        RETURN format!("{}/{}/{}", self.project, self.repository, self.image)
```

---

## 2. Authentication

### 2.1 GcpAuthProvider

```pseudocode
CLASS GcpAuthProvider:
    credentials: GcpCredentials
    token_cache: RwLock<Option<CachedToken>>
    refresh_threshold: f64                // 0.8 = refresh at 80% TTL

    CONSTRUCTOR(credentials: GcpCredentials):
        self.credentials = credentials
        self.token_cache = RwLock::new(None)
        self.refresh_threshold = 0.8

    ASYNC FUNCTION get_token(&self, scopes: &[&str]) -> Result<String>:
        // Check cache first
        cached = self.token_cache.read().await
        IF cached.is_some() AND !self.should_refresh(cached):
            RETURN Ok(cached.unwrap().access_token.clone())

        // Acquire write lock and refresh
        token = self.fetch_token(scopes).await?
        self.token_cache.write().await = Some(CachedToken {
            access_token: token.access_token.clone(),
            expires_at: Instant::now() + token.expires_in,
        })
        RETURN Ok(token.access_token)

    ASYNC FUNCTION fetch_token(&self, scopes: &[&str]) -> Result<TokenResponse>:
        MATCH self.credentials:
            ServiceAccountKey(key) =>
                RETURN self.fetch_service_account_token(key, scopes).await
            WorkloadIdentity(config) =>
                RETURN self.fetch_workload_identity_token(config, scopes).await
            ApplicationDefault =>
                RETURN self.fetch_adc_token(scopes).await

    ASYNC FUNCTION fetch_service_account_token(key, scopes) -> Result<TokenResponse>:
        // Create JWT assertion
        now = SystemTime::now()
        claims = JwtClaims {
            iss: key.client_email,
            scope: scopes.join(" "),
            aud: "https://oauth2.googleapis.com/token",
            iat: now.as_secs(),
            exp: now.as_secs() + 3600,
        }

        jwt = sign_jwt(claims, key.private_key)?

        response = self.http_client.post("https://oauth2.googleapis.com/token")
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", &jwt),
            ])
            .send().await?

        RETURN response.json::<TokenResponse>().await

    ASYNC FUNCTION fetch_workload_identity_token(config, scopes) -> Result<TokenResponse>:
        // Fetch from metadata server
        url = format!(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/{}/token",
            config.service_account
        )

        response = self.http_client.get(&url)
            .header("Metadata-Flavor", "Google")
            .send().await?

        RETURN response.json::<TokenResponse>().await

    FUNCTION should_refresh(&self, cached: &CachedToken) -> bool:
        remaining = cached.expires_at.duration_since(Instant::now())
        total_ttl = Duration::from_secs(3600)
        RETURN remaining.as_secs_f64() < total_ttl.as_secs_f64() * (1.0 - self.refresh_threshold)
```

### 2.2 Docker Registry Authentication

```pseudocode
ASYNC FUNCTION get_docker_token(&self, image: &ImageReference, actions: &[&str]) -> Result<String>:
    // Docker registry uses OAuth2 token exchange
    access_token = self.get_token(&["https://www.googleapis.com/auth/cloud-platform"]).await?

    // Exchange for registry-scoped token
    scope = format!(
        "repository:{}/{}:{}",
        image.full_name(),
        actions.join(",")
    )

    token_url = format!(
        "https://{}/v2/token?service={}&scope={}",
        image.registry_url(),
        image.registry_url(),
        urlencoding::encode(&scope)
    )

    response = self.http_client.get(&token_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send().await?

    token_response = response.json::<DockerTokenResponse>().await?
    RETURN Ok(token_response.token)
```

---

## 3. Repository Service

### 3.1 Repository Operations

```pseudocode
CLASS RepositoryService:
    client: &ArtifactRegistryClient

    ASYNC FUNCTION list(&self, location: &str) -> Result<Vec<Repository>>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        url = format!(
            "https://{}/v1/projects/{}/locations/{}/repositories",
            self.client.config.api_endpoint,
            self.client.config.project_id,
            location
        )

        repositories = Vec::new()
        page_token = None

        LOOP:
            request_url = match page_token:
                Some(token) => format!("{}?pageToken={}", url, token)
                None => url.clone()

            response = self.client.http_client.get(&request_url)
                .header("Authorization", format!("Bearer {}", token))
                .send().await?

            page = response.json::<ListRepositoriesResponse>().await?
            repositories.extend(page.repositories)

            IF page.next_page_token.is_none():
                BREAK
            page_token = page.next_page_token

        RETURN Ok(repositories)

    ASYNC FUNCTION get(&self, location: &str, repo_name: &str) -> Result<Repository>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        url = format!(
            "https://{}/v1/projects/{}/locations/{}/repositories/{}",
            self.client.config.api_endpoint,
            self.client.config.project_id,
            location,
            repo_name
        )

        response = self.client.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        IF response.status() == 404:
            RETURN Err(ArtifactRegistryError::RepositoryNotFound(repo_name))

        RETURN response.json::<Repository>().await

    ASYNC FUNCTION list_all_locations(&self) -> Result<Vec<Repository>>:
        // List across all available locations
        locations = self.get_available_locations().await?

        results = futures::future::join_all(
            locations.iter().map(|loc| self.list(loc))
        ).await

        all_repos = Vec::new()
        FOR result IN results:
            MATCH result:
                Ok(repos) => all_repos.extend(repos)
                Err(e) => log::warn!("Failed to list repos in location: {}", e)

        RETURN Ok(all_repos)
```

---

## 4. Package Service

### 4.1 Package Operations

```pseudocode
CLASS PackageService:
    client: &ArtifactRegistryClient

    ASYNC FUNCTION list(&self, location: &str, repository: &str) -> Result<Vec<Package>>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        url = format!(
            "https://{}/v1/projects/{}/locations/{}/repositories/{}/packages",
            self.client.config.api_endpoint,
            self.client.config.project_id,
            location,
            repository
        )

        packages = self.paginate_request::<Package>(&url, &token).await?
        RETURN Ok(packages)

    ASYNC FUNCTION get(&self, location: &str, repository: &str, package: &str) -> Result<Package>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        // Package name may contain slashes (e.g., Docker images), URL-encode it
        encoded_package = urlencoding::encode(package)

        url = format!(
            "https://{}/v1/projects/{}/locations/{}/repositories/{}/packages/{}",
            self.client.config.api_endpoint,
            self.client.config.project_id,
            location,
            repository,
            encoded_package
        )

        response = self.client.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        RETURN self.handle_response(response).await

    ASYNC FUNCTION list_versions(&self, location: &str, repository: &str, package: &str) -> Result<Vec<Version>>:
        token = self.client.auth_provider.get_token(SCOPES).await?
        encoded_package = urlencoding::encode(package)

        url = format!(
            "https://{}/v1/projects/{}/locations/{}/repositories/{}/packages/{}/versions",
            self.client.config.api_endpoint,
            self.client.config.project_id,
            location,
            repository,
            encoded_package
        )

        versions = self.paginate_request::<Version>(&url, &token).await?
        RETURN Ok(versions)

    ASYNC FUNCTION delete_version(&self, version_name: &str) -> Result<()>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        url = format!(
            "https://{}/v1/{}",
            self.client.config.api_endpoint,
            version_name
        )

        response = self.client.http_client.delete(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        IF response.status().is_success():
            RETURN Ok(())
        ELSE:
            RETURN Err(self.parse_error(response).await)
```

### 4.2 Tag Operations

```pseudocode
    ASYNC FUNCTION list_tags(&self, location: &str, repository: &str, package: &str) -> Result<Vec<Tag>>:
        token = self.client.auth_provider.get_token(SCOPES).await?
        encoded_package = urlencoding::encode(package)

        url = format!(
            "https://{}/v1/projects/{}/locations/{}/repositories/{}/packages/{}/tags",
            self.client.config.api_endpoint,
            self.client.config.project_id,
            location,
            repository,
            encoded_package
        )

        RETURN self.paginate_request::<Tag>(&url, &token).await

    ASYNC FUNCTION create_tag(&self, location: &str, repository: &str, package: &str, tag: &CreateTagRequest) -> Result<Tag>:
        token = self.client.auth_provider.get_token(SCOPES).await?
        encoded_package = urlencoding::encode(package)

        url = format!(
            "https://{}/v1/projects/{}/locations/{}/repositories/{}/packages/{}/tags?tagId={}",
            self.client.config.api_endpoint,
            self.client.config.project_id,
            location,
            repository,
            encoded_package,
            tag.tag_id
        )

        response = self.client.http_client.post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&tag)
            .send().await?

        RETURN response.json::<Tag>().await

    ASYNC FUNCTION delete_tag(&self, tag_name: &str) -> Result<()>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        url = format!(
            "https://{}/v1/{}",
            self.client.config.api_endpoint,
            tag_name
        )

        response = self.client.http_client.delete(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        self.ensure_success(response).await
```

---

## 5. Docker Service

### 5.1 Manifest Operations

```pseudocode
CLASS DockerService:
    client: &ArtifactRegistryClient

    ASYNC FUNCTION get_manifest(&self, image: &ImageReference) -> Result<Manifest>:
        token = self.client.auth_provider.get_docker_token(image, &["pull"]).await?

        url = format!(
            "https://{}/v2/{}/manifests/{}",
            image.registry_url(),
            image.full_name(),
            image.reference
        )

        response = self.client.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", MANIFEST_MEDIA_TYPES.join(", "))
            .send().await?

        IF response.status() == 404:
            RETURN Err(ArtifactRegistryError::ManifestNotFound(image.reference.clone()))

        // Verify digest if reference was a digest
        IF let TagOrDigest::Digest(expected) = &image.reference:
            actual_digest = response.headers().get("Docker-Content-Digest")
            IF actual_digest != expected:
                RETURN Err(ArtifactRegistryError::DigestMismatch { expected, actual })

        content_type = response.headers().get("Content-Type")
        body = response.bytes().await?

        RETURN self.parse_manifest(content_type, body)

    ASYNC FUNCTION put_manifest(&self, image: &ImageReference, manifest: &Manifest) -> Result<PutManifestResponse>:
        token = self.client.auth_provider.get_docker_token(image, &["push", "pull"]).await?

        manifest_bytes = serde_json::to_vec(manifest)?
        digest = format!("sha256:{}", sha256_hex(&manifest_bytes))

        url = format!(
            "https://{}/v2/{}/manifests/{}",
            image.registry_url(),
            image.full_name(),
            image.reference
        )

        response = self.client.http_client.put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", manifest.media_type())
            .body(manifest_bytes)
            .send().await?

        IF !response.status().is_success():
            RETURN Err(self.parse_registry_error(response).await)

        RETURN Ok(PutManifestResponse {
            digest,
            location: response.headers().get("Location").map(|h| h.to_string()),
        })

    ASYNC FUNCTION delete_manifest(&self, image: &ImageReference) -> Result<()>:
        token = self.client.auth_provider.get_docker_token(image, &["push", "pull"]).await?

        url = format!(
            "https://{}/v2/{}/manifests/{}",
            image.registry_url(),
            image.full_name(),
            image.reference
        )

        response = self.client.http_client.delete(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        IF response.status() == 202 OR response.status() == 200:
            RETURN Ok(())
        ELSE:
            RETURN Err(self.parse_registry_error(response).await)

    ASYNC FUNCTION list_tags(&self, image: &ImageReference) -> Result<Vec<String>>:
        token = self.client.auth_provider.get_docker_token(image, &["pull"]).await?

        url = format!(
            "https://{}/v2/{}/tags/list",
            image.registry_url(),
            image.full_name()
        )

        tags = Vec::new()
        next_url = Some(url)

        WHILE let Some(current_url) = next_url:
            response = self.client.http_client.get(&current_url)
                .header("Authorization", format!("Bearer {}", token))
                .send().await?

            // Check for Link header for pagination
            next_url = self.parse_link_header(response.headers().get("Link"))

            tag_list = response.json::<TagListResponse>().await?
            tags.extend(tag_list.tags)

        RETURN Ok(tags)
```

### 5.2 Blob Operations

```pseudocode
    ASYNC FUNCTION check_blob(&self, image: &ImageReference, digest: &str) -> Result<BlobInfo>:
        token = self.client.auth_provider.get_docker_token(image, &["pull"]).await?

        url = format!(
            "https://{}/v2/{}/blobs/{}",
            image.registry_url(),
            image.full_name(),
            digest
        )

        response = self.client.http_client.head(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        IF response.status() == 404:
            RETURN Err(ArtifactRegistryError::BlobNotFound(digest.to_string()))

        RETURN Ok(BlobInfo {
            digest: digest.to_string(),
            size: response.headers()
                .get("Content-Length")
                .and_then(|h| h.to_str().ok()?.parse().ok())
                .unwrap_or(0),
        })

    ASYNC FUNCTION download_blob(&self, image: &ImageReference, digest: &str) -> Result<Vec<u8>>:
        token = self.client.auth_provider.get_docker_token(image, &["pull"]).await?

        url = format!(
            "https://{}/v2/{}/blobs/{}",
            image.registry_url(),
            image.full_name(),
            digest
        )

        response = self.client.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        data = response.bytes().await?.to_vec()

        // Verify digest
        actual_digest = format!("sha256:{}", sha256_hex(&data))
        IF actual_digest != digest:
            RETURN Err(ArtifactRegistryError::DigestMismatch {
                expected: digest.to_string(),
                actual: actual_digest,
            })

        RETURN Ok(data)

    ASYNC FUNCTION upload_blob(&self, image: &ImageReference, data: &[u8]) -> Result<String>:
        token = self.client.auth_provider.get_docker_token(image, &["push", "pull"]).await?
        digest = format!("sha256:{}", sha256_hex(data))

        // Check if blob already exists (cross-repo mount optimization)
        IF self.check_blob(image, &digest).await.is_ok():
            RETURN Ok(digest)

        // Initiate upload
        initiate_url = format!(
            "https://{}/v2/{}/blobs/uploads/",
            image.registry_url(),
            image.full_name()
        )

        init_response = self.client.http_client.post(&initiate_url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        upload_url = init_response.headers()
            .get("Location")
            .ok_or(ArtifactRegistryError::UploadInitFailed)?
            .to_str()?

        // Single monolithic upload for small blobs
        IF data.len() <= CHUNK_SIZE_THRESHOLD:
            RETURN self.monolithic_upload(upload_url, data, &digest, &token).await
        ELSE:
            RETURN self.chunked_upload(upload_url, data, &digest, &token).await

    ASYNC FUNCTION monolithic_upload(&self, upload_url: &str, data: &[u8], digest: &str, token: &str) -> Result<String>:
        // Append digest to complete URL
        complete_url = IF upload_url.contains('?'):
            format!("{}&digest={}", upload_url, digest)
        ELSE:
            format!("{}?digest={}", upload_url, digest)

        response = self.client.http_client.put(&complete_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/octet-stream")
            .header("Content-Length", data.len().to_string())
            .body(data.to_vec())
            .send().await?

        IF response.status() == 201:
            RETURN Ok(digest.to_string())
        ELSE:
            RETURN Err(self.parse_registry_error(response).await)

    ASYNC FUNCTION chunked_upload(&self, initial_url: &str, data: &[u8], digest: &str, token: &str) -> Result<String>:
        upload_url = initial_url.to_string()
        offset = 0

        WHILE offset < data.len():
            chunk_end = min(offset + CHUNK_SIZE, data.len())
            chunk = &data[offset..chunk_end]

            response = self.client.http_client.patch(&upload_url)
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/octet-stream")
                .header("Content-Range", format!("{}-{}", offset, chunk_end - 1))
                .header("Content-Length", chunk.len().to_string())
                .body(chunk.to_vec())
                .send().await?

            IF response.status() != 202:
                RETURN Err(self.parse_registry_error(response).await)

            upload_url = response.headers()
                .get("Location")
                .ok_or(ArtifactRegistryError::UploadFailed)?
                .to_str()?.to_string()

            offset = chunk_end

        // Complete upload
        complete_url = IF upload_url.contains('?'):
            format!("{}&digest={}", upload_url, digest)
        ELSE:
            format!("{}?digest={}", upload_url, digest)

        response = self.client.http_client.put(&complete_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Length", "0")
            .send().await?

        IF response.status() == 201:
            RETURN Ok(digest.to_string())
        ELSE:
            RETURN Err(self.parse_registry_error(response).await)
```

---

## 6. Vulnerability Service

### 6.1 Container Analysis Operations

```pseudocode
CLASS VulnerabilityService:
    client: &ArtifactRegistryClient

    ASYNC FUNCTION get_vulnerabilities(&self, image: &ImageReference) -> Result<VulnerabilityReport>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        // Build resource URI for the image
        resource_uri = format!(
            "https://{}/{}/{}@{}",
            image.registry_url(),
            image.project,
            format!("{}/{}", image.repository, image.image),
            image.reference  // Must be digest for vulnerabilities
        )

        url = format!(
            "https://containeranalysis.googleapis.com/v1/projects/{}/occurrences",
            self.client.config.project_id
        )

        filter = format!(
            "resourceUrl=\"{}\" AND kind=\"VULNERABILITY\"",
            resource_uri
        )

        response = self.client.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .query(&[("filter", &filter)])
            .send().await?

        occurrences = response.json::<ListOccurrencesResponse>().await?

        RETURN self.build_vulnerability_report(occurrences)

    FUNCTION build_vulnerability_report(&self, occurrences: ListOccurrencesResponse) -> VulnerabilityReport:
        severity_counts = HashMap::new()
        vulnerabilities = Vec::new()

        FOR occurrence IN occurrences.occurrences:
            vuln = &occurrence.vulnerability

            // Count by severity
            *severity_counts.entry(vuln.severity.clone()).or_insert(0) += 1

            vulnerabilities.push(Vulnerability {
                cve_id: vuln.short_description.clone(),
                severity: vuln.severity.clone(),
                cvss_score: vuln.cvss_score,
                package_name: vuln.package_issue.affected_package.clone(),
                installed_version: vuln.package_issue.affected_version.clone(),
                fixed_version: vuln.package_issue.fixed_version.clone(),
                description: vuln.long_description.clone(),
                url: vuln.related_urls.first().map(|u| u.url.clone()),
            })

        RETURN VulnerabilityReport {
            total_count: vulnerabilities.len(),
            severity_counts,
            vulnerabilities,
            scan_time: occurrences.occurrences.first()
                .map(|o| o.create_time.clone()),
        }

    ASYNC FUNCTION get_vulnerability_summary(&self, project: &str) -> Result<VulnerabilitySummary>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        url = format!(
            "https://containeranalysis.googleapis.com/v1/projects/{}/occurrences:vulnerabilitySummary",
            project
        )

        response = self.client.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?

        RETURN response.json::<VulnerabilitySummary>().await

    ASYNC FUNCTION list_notes(&self, project: &str, filter: Option<&str>) -> Result<Vec<Note>>:
        token = self.client.auth_provider.get_token(SCOPES).await?

        url = format!(
            "https://containeranalysis.googleapis.com/v1/projects/{}/notes",
            project
        )

        request = self.client.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))

        request = IF let Some(f) = filter:
            request.query(&[("filter", f)])
        ELSE:
            request

        response = request.send().await?
        RETURN response.json::<ListNotesResponse>().await?.notes
```

---

## 7. Error Handling

### 7.1 Error Conversion

```pseudocode
FUNCTION convert_http_error(status: StatusCode, body: &ErrorResponse) -> ArtifactRegistryError:
    MATCH status:
        400 => ArtifactRegistryError::Configuration(body.message.clone())
        401 => ArtifactRegistryError::Authentication(AuthError::InvalidCredentials)
        403 => ArtifactRegistryError::Authorization(AuthzError::PermissionDenied {
            resource: body.details.resource.clone(),
            permission: body.details.permission.clone(),
        })
        404 => ArtifactRegistryError::NotFound(body.message.clone())
        429 => ArtifactRegistryError::Quota(QuotaError::RequestsExceeded {
            retry_after: body.details.retry_delay.clone(),
        })
        500 => ArtifactRegistryError::Server(ServerError::Internal(body.message.clone()))
        503 => ArtifactRegistryError::Server(ServerError::Unavailable)
        _ => ArtifactRegistryError::Unknown(status, body.message.clone())

FUNCTION convert_registry_error(errors: &[RegistryError]) -> ArtifactRegistryError:
    error = errors.first().unwrap_or_default()

    MATCH error.code.as_str():
        "MANIFEST_UNKNOWN" => ArtifactRegistryError::ManifestNotFound(error.message.clone())
        "BLOB_UNKNOWN" => ArtifactRegistryError::BlobNotFound(error.message.clone())
        "DIGEST_INVALID" => ArtifactRegistryError::DigestMismatch {
            expected: "".to_string(),
            actual: error.message.clone(),
        }
        "NAME_UNKNOWN" => ArtifactRegistryError::RepositoryNotFound(error.message.clone())
        "UNAUTHORIZED" => ArtifactRegistryError::Authentication(AuthError::TokenExpired)
        "DENIED" => ArtifactRegistryError::Authorization(AuthzError::PermissionDenied {
            resource: error.detail.clone(),
            permission: "unknown".to_string(),
        })
        _ => ArtifactRegistryError::Unknown(0, error.message.clone())
```

---

## 8. Simulation Layer

### 8.1 Mock Provider

```pseudocode
CLASS MockArtifactRegistryProvider:
    repositories: HashMap<String, Repository>
    packages: HashMap<String, Vec<Package>>
    manifests: HashMap<String, Manifest>
    blobs: HashMap<String, Vec<u8>>
    vulnerabilities: HashMap<String, VulnerabilityReport>
    call_log: Vec<RecordedCall>
    mode: SimulationMode

    FUNCTION new(mode: SimulationMode) -> Self:
        RETURN Self {
            repositories: HashMap::new(),
            packages: HashMap::new(),
            manifests: HashMap::new(),
            blobs: HashMap::new(),
            vulnerabilities: HashMap::new(),
            call_log: Vec::new(),
            mode,
        }

    ASYNC FUNCTION handle_request(&mut self, request: &MockRequest) -> Result<MockResponse>:
        self.call_log.push(RecordedCall::from(request))

        MATCH self.mode:
            SimulationMode::Mock => self.generate_mock_response(request)
            SimulationMode::Record => self.record_and_forward(request).await
            SimulationMode::Replay => self.replay_response(request)

    FUNCTION seed_repository(&mut self, repo: Repository):
        self.repositories.insert(repo.name.clone(), repo)

    FUNCTION seed_manifest(&mut self, image: &str, manifest: Manifest):
        self.manifests.insert(image.to_string(), manifest)

    FUNCTION seed_vulnerability(&mut self, image: &str, report: VulnerabilityReport):
        self.vulnerabilities.insert(image.to_string(), report)

    FUNCTION get_call_log(&self) -> &[RecordedCall]:
        &self.call_log

    FUNCTION verify_call(&self, operation: &str, count: usize) -> bool:
        self.call_log.iter().filter(|c| c.operation == operation).count() == count
```

---

## 9. Constants

```pseudocode
CONST SCOPES: [&str] = [
    "https://www.googleapis.com/auth/cloud-platform",
]

CONST MANIFEST_MEDIA_TYPES: [&str] = [
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
]

CONST CHUNK_SIZE: usize = 5 * 1024 * 1024  // 5MB chunks
CONST CHUNK_SIZE_THRESHOLD: usize = 10 * 1024 * 1024  // 10MB threshold for chunked upload

CONST DEFAULT_LOCATIONS: [&str] = [
    "us", "europe", "asia",  // Multi-regional
    "us-central1", "us-east1", "europe-west1", "asia-east1",  // Regional
]
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, authentication flows, regional routing, and service interactions.

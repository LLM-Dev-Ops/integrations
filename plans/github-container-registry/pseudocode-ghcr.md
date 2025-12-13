# Pseudocode: GitHub Container Registry Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ghcr`

---

## Table of Contents

1. [Core Structures](#1-core-structures)
2. [Authentication Flow](#2-authentication-flow)
3. [Image Operations](#3-image-operations)
4. [Manifest Operations](#4-manifest-operations)
5. [Blob Operations](#5-blob-operations)
6. [Tag Operations](#6-tag-operations)
7. [Version Management](#7-version-management)
8. [Vulnerability Metadata](#8-vulnerability-metadata)
9. [Rate Limit Handling](#9-rate-limit-handling)
10. [Simulation Layer](#10-simulation-layer)

---

## 1. Core Structures

### 1.1 Client Structure

```
STRUCT GhcrClient {
    config: Arc<GhcrConfig>,
    auth: Arc<dyn TokenProvider>,
    http_client: Arc<HttpClient>,
    token_cache: Arc<RwLock<HashMap<String, CachedToken>>>,
    rate_limiter: Arc<RateLimiter>,
    simulation: Arc<SimulationLayer>,
    metrics: Arc<MetricsCollector>
}

STRUCT GhcrConfig {
    registry: String,              // "ghcr.io"
    api_base: String,              // "api.github.com"
    timeout: Duration,
    upload_chunk_size: usize,      // 5MB default
    max_retries: u32,
    throttle_threshold: f32,       // 0.8 (80%)
    simulation_mode: SimulationMode
}

STRUCT CachedToken {
    token: SecretString,
    scopes: HashSet<String>,
    expires_at: Instant
}

STRUCT RateLimiter {
    limit: AtomicU32,
    remaining: AtomicU32,
    reset_at: AtomicU64,
    throttle_threshold: f32
}
```

### 1.2 Image Reference

```
STRUCT ImageRef {
    registry: String,
    name: String,
    reference: Reference
}

ENUM Reference {
    Tag(String),
    Digest(String)
}

IMPL ImageRef {
    FUNCTION parse(image: String) -> Result<ImageRef>:
        // Parse: ghcr.io/owner/image:tag or @sha256:digest
        parts = image.split("/")

        IF parts[0] == "ghcr.io":
            registry = "ghcr.io"
            name = join(parts[1..], "/")
        ELSE:
            registry = "ghcr.io"
            name = image

        // Extract reference
        IF name.contains("@sha256:"):
            (name, digest) = name.split_once("@")
            reference = Reference::Digest(digest)
        ELSE IF name.contains(":"):
            (name, tag) = name.rsplit_once(":")
            reference = Reference::Tag(tag)
        ELSE:
            reference = Reference::Tag("latest")

        RETURN ImageRef { registry, name, reference }

    FUNCTION manifest_url(&self) -> String:
        RETURN format!("/v2/{}/manifests/{}", self.name, self.reference)

    FUNCTION full_name(&self) -> String:
        RETURN format!("{}/{}", self.registry, self.name)
}
```

---

## 2. Authentication Flow

### 2.1 Token Acquisition

```
IMPL GhcrClient {
    ASYNC FUNCTION get_token(&self, scope: &str) -> Result<SecretString>:
        // Check cache first
        cache = self.token_cache.read().await
        IF let Some(cached) = cache.get(scope):
            IF cached.expires_at > Instant::now() + Duration::from_secs(30):
                RETURN Ok(cached.token.clone())
        DROP cache

        // Fetch new token
        token = self.fetch_registry_token(scope).await?

        // Cache token
        cache = self.token_cache.write().await
        cache.insert(scope.to_string(), CachedToken {
            token: token.clone(),
            scopes: parse_scopes(scope),
            expires_at: Instant::now() + Duration::from_secs(270)  // 4.5 min
        })

        RETURN Ok(token)

    ASYNC FUNCTION fetch_registry_token(&self, scope: &str) -> Result<SecretString>:
        creds = self.auth.get_credentials().await?

        // Token endpoint
        url = format!("https://{}/token", self.config.registry)

        response = self.http_client
            .get(url)
            .query(&[
                ("service", self.config.registry),
                ("scope", scope)
            ])
            .basic_auth(&creds.username, Some(creds.token.expose_secret()))
            .send()
            .await?

        IF !response.status().is_success():
            RETURN Err(GhcrError::AuthFailed {
                status: response.status(),
                message: response.text().await?
            })

        json = response.json::<TokenResponse>().await?
        RETURN Ok(SecretString::new(json.token))
}
```

### 2.2 Authenticated Request

```
IMPL GhcrClient {
    ASYNC FUNCTION request<T>(&self, method: Method, url: &str, scope: &str) -> Result<T>:
        token = self.get_token(scope).await?

        // Check rate limit
        self.rate_limiter.check_throttle().await?

        response = self.execute_with_retry(method, url, token, scope).await?

        // Update rate limit info
        self.update_rate_limit(&response.headers())

        RETURN response.json::<T>().await

    ASYNC FUNCTION execute_with_retry(
        &self,
        method: Method,
        url: &str,
        token: SecretString,
        scope: &str
    ) -> Result<Response>:
        retries = 0

        LOOP:
            response = self.http_client
                .request(method.clone(), url)
                .bearer_auth(token.expose_secret())
                .header("Accept", OCI_MANIFEST_TYPES)
                .send()
                .await?

            MATCH response.status():
                StatusCode::OK | StatusCode::CREATED | StatusCode::ACCEPTED:
                    RETURN Ok(response)

                StatusCode::UNAUTHORIZED:
                    // Token expired, refresh and retry once
                    IF retries == 0:
                        self.invalidate_token(scope).await
                        token = self.get_token(scope).await?
                        retries += 1
                        CONTINUE
                    RETURN Err(GhcrError::Unauthorized)

                StatusCode::TOO_MANY_REQUESTS:
                    retry_after = parse_retry_after(response.headers())
                    sleep(retry_after).await
                    retries += 1
                    IF retries > self.config.max_retries:
                        RETURN Err(GhcrError::RateLimited)
                    CONTINUE

                StatusCode::NOT_FOUND:
                    RETURN Err(GhcrError::NotFound)

                status IF status.is_server_error():
                    IF retries < self.config.max_retries:
                        sleep(backoff_duration(retries)).await
                        retries += 1
                        CONTINUE
                    RETURN Err(GhcrError::ServerError { status })

                _:
                    RETURN Err(GhcrError::UnexpectedStatus {
                        status: response.status()
                    })
}
```

---

## 3. Image Operations

### 3.1 Check Image Exists

```
IMPL GhcrClient {
    ASYNC FUNCTION image_exists(&self, image: &ImageRef) -> Result<bool>:
        scope = format!("repository:{}:pull", image.name)
        url = format!("https://{}{}", self.config.registry, image.manifest_url())

        TRY:
            response = self.head_request(url, &scope).await?
            RETURN Ok(response.status().is_success())
        CATCH GhcrError::NotFound:
            RETURN Ok(false)
}
```

### 3.2 Pull Image Manifest

```
IMPL GhcrClient {
    ASYNC FUNCTION pull_manifest(&self, image: &ImageRef) -> Result<Manifest>:
        scope = format!("repository:{}:pull", image.name)
        url = format!("https://{}{}", self.config.registry, image.manifest_url())

        token = self.get_token(&scope).await?

        response = self.http_client
            .get(&url)
            .bearer_auth(token.expose_secret())
            .header("Accept", join(&[
                DOCKER_MANIFEST_V2,
                DOCKER_MANIFEST_LIST,
                OCI_MANIFEST_V1,
                OCI_INDEX_V1
            ], ", "))
            .send()
            .await?

        IF !response.status().is_success():
            RETURN Err(map_error(response))

        content_type = response.headers().get("content-type")
        digest = response.headers().get("docker-content-digest")
        body = response.bytes().await?

        manifest = parse_manifest(content_type, &body)?
        manifest.digest = digest.map(|d| d.to_string())

        RETURN Ok(manifest)
}
```

### 3.3 Push Image Manifest

```
IMPL GhcrClient {
    ASYNC FUNCTION push_manifest(
        &self,
        image: &ImageRef,
        manifest: &Manifest
    ) -> Result<String>:
        scope = format!("repository:{}:push,pull", image.name)
        url = format!("https://{}{}", self.config.registry, image.manifest_url())

        token = self.get_token(&scope).await?
        body = serde_json::to_vec(manifest)?

        response = self.http_client
            .put(&url)
            .bearer_auth(token.expose_secret())
            .header("Content-Type", manifest.media_type.as_str())
            .body(body)
            .send()
            .await?

        IF !response.status().is_success():
            RETURN Err(map_error(response))

        digest = response.headers()
            .get("docker-content-digest")
            .ok_or(GhcrError::MissingDigest)?
            .to_string()

        self.metrics.manifests_pushed.inc()
        RETURN Ok(digest)
}
```

### 3.4 Delete Image

```
IMPL GhcrClient {
    ASYNC FUNCTION delete_image(&self, image: &ImageRef) -> Result<()>:
        // Must delete by digest
        digest = MATCH &image.reference:
            Reference::Digest(d) => d.clone(),
            Reference::Tag(_) =>
                self.get_manifest_digest(image).await?

        scope = format!("repository:{}:delete", image.name)
        url = format!(
            "https://{}/v2/{}/manifests/{}",
            self.config.registry,
            image.name,
            digest
        )

        self.delete_request(url, &scope).await?
        self.metrics.images_deleted.inc()

        RETURN Ok(())
}
```

### 3.5 Copy Image

```
IMPL GhcrClient {
    ASYNC FUNCTION copy_image(&self, source: &ImageRef, target: &ImageRef) -> Result<String>:
        // Pull source manifest
        manifest = self.pull_manifest(source).await?

        // Ensure all blobs exist in target (mount if needed)
        FOR layer IN manifest.layers:
            exists = self.blob_exists(target, &layer.digest).await?
            IF !exists:
                self.mount_blob(source, target, &layer.digest).await?

        // Also mount config blob
        config_exists = self.blob_exists(target, &manifest.config.digest).await?
        IF !config_exists:
            self.mount_blob(source, target, &manifest.config.digest).await?

        // Push manifest to target
        digest = self.push_manifest(target, &manifest).await?

        RETURN Ok(digest)
}
```

---

## 4. Manifest Operations

### 4.1 Parse Manifest

```
FUNCTION parse_manifest(content_type: &str, body: &[u8]) -> Result<Manifest>:
    MATCH content_type:
        t IF t.contains("docker.distribution.manifest.v2"):
            json = serde_json::from_slice::<DockerManifestV2>(body)?
            RETURN Manifest::from_docker_v2(json)

        t IF t.contains("docker.distribution.manifest.list"):
            json = serde_json::from_slice::<DockerManifestList>(body)?
            RETURN Manifest::from_docker_list(json)

        t IF t.contains("oci.image.manifest"):
            json = serde_json::from_slice::<OciManifest>(body)?
            RETURN Manifest::from_oci(json)

        t IF t.contains("oci.image.index"):
            json = serde_json::from_slice::<OciIndex>(body)?
            RETURN Manifest::from_oci_index(json)

        _:
            RETURN Err(GhcrError::UnsupportedMediaType {
                media_type: content_type.to_string()
            })
```

### 4.2 Handle Multi-Arch Index

```
IMPL GhcrClient {
    ASYNC FUNCTION get_platform_manifest(
        &self,
        image: &ImageRef,
        platform: &Platform
    ) -> Result<Manifest>:
        manifest = self.pull_manifest(image).await?

        MATCH manifest:
            Manifest::Index(index) =>
                // Find matching platform
                FOR entry IN index.manifests:
                    IF entry.platform.matches(platform):
                        digest_ref = ImageRef {
                            name: image.name.clone(),
                            reference: Reference::Digest(entry.digest.clone()),
                            ..image.clone()
                        }
                        RETURN self.pull_manifest(&digest_ref).await

                RETURN Err(GhcrError::PlatformNotFound {
                    platform: platform.clone()
                })

            Manifest::Image(_) =>
                RETURN Ok(manifest)
}
```

---

## 5. Blob Operations

### 5.1 Check Blob Exists

```
IMPL GhcrClient {
    ASYNC FUNCTION blob_exists(&self, image: &ImageRef, digest: &str) -> Result<bool>:
        scope = format!("repository:{}:pull", image.name)
        url = format!(
            "https://{}/v2/{}/blobs/{}",
            self.config.registry,
            image.name,
            digest
        )

        TRY:
            response = self.head_request(url, &scope).await?
            RETURN Ok(response.status().is_success())
        CATCH GhcrError::NotFound:
            RETURN Ok(false)
}
```

### 5.2 Upload Blob (Chunked)

```
IMPL GhcrClient {
    ASYNC FUNCTION upload_blob(
        &self,
        image: &ImageRef,
        data: impl AsyncRead
    ) -> Result<String>:
        scope = format!("repository:{}:push,pull", image.name)

        // Start upload session
        upload_url = self.start_upload(image, &scope).await?

        // Upload in chunks
        hasher = Sha256::new()
        total_size = 0u64
        current_url = upload_url

        LOOP:
            chunk = read_chunk(data, self.config.upload_chunk_size).await?
            IF chunk.is_empty():
                BREAK

            hasher.update(&chunk)
            chunk_size = chunk.len()

            response = self.upload_chunk(
                &current_url,
                &chunk,
                total_size,
                total_size + chunk_size as u64,
                &scope
            ).await?

            total_size += chunk_size as u64
            current_url = response.headers()
                .get("location")
                .map(|l| l.to_string())
                .unwrap_or(current_url)

        // Complete upload
        digest = format!("sha256:{}", hex::encode(hasher.finalize()))
        self.complete_upload(&current_url, &digest, &scope).await?

        self.metrics.blobs_uploaded.inc()
        self.metrics.bytes_uploaded.add(total_size)

        RETURN Ok(digest)

    ASYNC FUNCTION start_upload(&self, image: &ImageRef, scope: &str) -> Result<String>:
        url = format!(
            "https://{}/v2/{}/blobs/uploads/",
            self.config.registry,
            image.name
        )

        token = self.get_token(scope).await?
        response = self.http_client
            .post(&url)
            .bearer_auth(token.expose_secret())
            .send()
            .await?

        IF response.status() != StatusCode::ACCEPTED:
            RETURN Err(map_error(response))

        location = response.headers()
            .get("location")
            .ok_or(GhcrError::MissingLocation)?
            .to_string()

        RETURN Ok(location)

    ASYNC FUNCTION upload_chunk(
        &self,
        url: &str,
        chunk: &[u8],
        start: u64,
        end: u64,
        scope: &str
    ) -> Result<Response>:
        token = self.get_token(scope).await?

        response = self.http_client
            .patch(url)
            .bearer_auth(token.expose_secret())
            .header("Content-Type", "application/octet-stream")
            .header("Content-Length", chunk.len())
            .header("Content-Range", format!("{}-{}", start, end - 1))
            .body(chunk.to_vec())
            .send()
            .await?

        IF response.status() != StatusCode::ACCEPTED:
            RETURN Err(map_error(response))

        RETURN Ok(response)

    ASYNC FUNCTION complete_upload(
        &self,
        url: &str,
        digest: &str,
        scope: &str
    ) -> Result<()>:
        token = self.get_token(scope).await?

        final_url = format!("{}?digest={}", url, digest)

        response = self.http_client
            .put(&final_url)
            .bearer_auth(token.expose_secret())
            .header("Content-Length", 0)
            .send()
            .await?

        IF response.status() != StatusCode::CREATED:
            RETURN Err(map_error(response))

        RETURN Ok(())
}
```

### 5.3 Mount Blob Cross-Repo

```
IMPL GhcrClient {
    ASYNC FUNCTION mount_blob(
        &self,
        source: &ImageRef,
        target: &ImageRef,
        digest: &str
    ) -> Result<()>:
        scope = format!(
            "repository:{}:pull repository:{}:push,pull",
            source.name,
            target.name
        )

        url = format!(
            "https://{}/v2/{}/blobs/uploads/?mount={}&from={}",
            self.config.registry,
            target.name,
            digest,
            source.name
        )

        token = self.get_token(&scope).await?

        response = self.http_client
            .post(&url)
            .bearer_auth(token.expose_secret())
            .send()
            .await?

        MATCH response.status():
            StatusCode::CREATED =>
                // Mount successful
                RETURN Ok(())
            StatusCode::ACCEPTED =>
                // Mount failed, need to copy blob
                RETURN self.copy_blob(source, target, digest).await
            _ =>
                RETURN Err(map_error(response))
}
```

---

## 6. Tag Operations

### 6.1 List Tags

```
IMPL GhcrClient {
    ASYNC FUNCTION list_tags(&self, image: &str) -> Result<Vec<String>>:
        scope = format!("repository:{}:pull", image)
        url = format!(
            "https://{}/v2/{}/tags/list",
            self.config.registry,
            image
        )

        response: TagList = self.request(Method::GET, &url, &scope).await?
        RETURN Ok(response.tags)

    ASYNC FUNCTION list_tags_paginated(
        &self,
        image: &str,
        limit: usize
    ) -> Result<Vec<String>>:
        scope = format!("repository:{}:pull", image)
        all_tags = Vec::new()
        last = None

        LOOP:
            url = MATCH last:
                Some(l) => format!(
                    "https://{}/v2/{}/tags/list?n={}&last={}",
                    self.config.registry, image, limit, l
                ),
                None => format!(
                    "https://{}/v2/{}/tags/list?n={}",
                    self.config.registry, image, limit
                )

            response: TagList = self.request(Method::GET, &url, &scope).await?

            IF response.tags.is_empty():
                BREAK

            last = response.tags.last().cloned()
            all_tags.extend(response.tags)

        RETURN Ok(all_tags)
}
```

### 6.2 Create/Update Tag

```
IMPL GhcrClient {
    ASYNC FUNCTION tag_image(
        &self,
        image: &ImageRef,
        new_tag: &str
    ) -> Result<()>:
        // Get manifest from source
        manifest = self.pull_manifest(image).await?

        // Push to new tag
        target = ImageRef {
            reference: Reference::Tag(new_tag.to_string()),
            ..image.clone()
        }

        self.push_manifest(&target, &manifest).await?
        RETURN Ok(())

    ASYNC FUNCTION retag_atomic(
        &self,
        image: &str,
        old_tag: &str,
        new_tag: &str
    ) -> Result<()>:
        source = ImageRef::parse(format!("{}/{}:{}",
            self.config.registry, image, old_tag
        ))?

        // Get digest of old tag
        digest = self.get_manifest_digest(&source).await?

        // Tag with new name
        self.tag_image(&source, new_tag).await?

        // Delete old tag
        self.delete_tag(image, old_tag).await?

        RETURN Ok(())
}
```

### 6.3 Delete Tag

```
IMPL GhcrClient {
    ASYNC FUNCTION delete_tag(&self, image: &str, tag: &str) -> Result<()>:
        // Get digest for tag
        image_ref = ImageRef {
            registry: self.config.registry.clone(),
            name: image.to_string(),
            reference: Reference::Tag(tag.to_string())
        }

        digest = self.get_manifest_digest(&image_ref).await?

        // Delete by digest
        scope = format!("repository:{}:delete", image)
        url = format!(
            "https://{}/v2/{}/manifests/{}",
            self.config.registry,
            image,
            digest
        )

        self.delete_request(url, &scope).await
}
```

---

## 7. Version Management

### 7.1 List Package Versions

```
IMPL GhcrClient {
    ASYNC FUNCTION list_versions(
        &self,
        owner: &str,
        package: &str,
        owner_type: OwnerType
    ) -> Result<Vec<PackageVersion>>:
        url = MATCH owner_type:
            OwnerType::Org => format!(
                "https://{}/orgs/{}/packages/container/{}/versions",
                self.config.api_base, owner, package
            ),
            OwnerType::User => format!(
                "https://{}/users/{}/packages/container/{}/versions",
                self.config.api_base, owner, package
            )

        versions = self.github_api_request::<Vec<PackageVersion>>(
            Method::GET,
            &url
        ).await?

        RETURN Ok(versions)

    ASYNC FUNCTION get_version(
        &self,
        owner: &str,
        package: &str,
        version_id: u64,
        owner_type: OwnerType
    ) -> Result<PackageVersion>:
        url = MATCH owner_type:
            OwnerType::Org => format!(
                "https://{}/orgs/{}/packages/container/{}/versions/{}",
                self.config.api_base, owner, package, version_id
            ),
            OwnerType::User => format!(
                "https://{}/users/{}/packages/container/{}/versions/{}",
                self.config.api_base, owner, package, version_id
            )

        RETURN self.github_api_request(Method::GET, &url).await
}
```

### 7.2 Delete Package Version

```
IMPL GhcrClient {
    ASYNC FUNCTION delete_version(
        &self,
        owner: &str,
        package: &str,
        version_id: u64,
        owner_type: OwnerType
    ) -> Result<()>:
        url = MATCH owner_type:
            OwnerType::Org => format!(
                "https://{}/orgs/{}/packages/container/{}/versions/{}",
                self.config.api_base, owner, package, version_id
            ),
            OwnerType::User => format!(
                "https://{}/users/{}/packages/container/{}/versions/{}",
                self.config.api_base, owner, package, version_id
            )

        self.github_api_delete(&url).await?
        self.metrics.versions_deleted.inc()

        RETURN Ok(())
}
```

### 7.3 Cleanup Old Versions

```
IMPL GhcrClient {
    ASYNC FUNCTION cleanup_old_versions(
        &self,
        owner: &str,
        package: &str,
        owner_type: OwnerType,
        keep_count: usize,
        keep_patterns: &[Regex]
    ) -> Result<CleanupResult>:
        versions = self.list_versions(owner, package, owner_type).await?

        // Sort by created_at descending
        versions.sort_by(|a, b| b.created_at.cmp(&a.created_at))

        deleted = Vec::new()
        kept = Vec::new()

        FOR (i, version) IN versions.iter().enumerate():
            // Check if any tag matches keep patterns
            should_keep = version.metadata.container.tags.iter()
                .any(|tag| keep_patterns.iter().any(|p| p.is_match(tag)))

            IF should_keep OR i < keep_count:
                kept.push(version.id)
            ELSE:
                TRY:
                    self.delete_version(owner, package, version.id, owner_type).await?
                    deleted.push(version.id)
                CATCH e:
                    log::warn!("Failed to delete version {}: {}", version.id, e)

        RETURN Ok(CleanupResult { deleted, kept })
}
```

---

## 8. Vulnerability Metadata

### 8.1 Get Version Vulnerabilities

```
IMPL GhcrClient {
    ASYNC FUNCTION get_vulnerabilities(
        &self,
        owner: &str,
        package: &str,
        version_id: u64,
        owner_type: OwnerType
    ) -> Result<VulnerabilityReport>:
        // Requires GitHub Advanced Security
        url = MATCH owner_type:
            OwnerType::Org => format!(
                "https://{}/orgs/{}/packages/container/{}/versions/{}/vulnerabilities",
                self.config.api_base, owner, package, version_id
            ),
            OwnerType::User => format!(
                "https://{}/users/{}/packages/container/{}/versions/{}/vulnerabilities",
                self.config.api_base, owner, package, version_id
            )

        TRY:
            report = self.github_api_request(Method::GET, &url).await?
            RETURN Ok(report)
        CATCH GhcrError::NotFound:
            // GHAS not enabled or no scan data
            RETURN Ok(VulnerabilityReport::empty(version_id))
        CATCH GhcrError::Forbidden:
            // No access to vulnerability data
            RETURN Err(GhcrError::VulnDataNotAvailable)
}
```

### 8.2 List Vulnerable Versions

```
IMPL GhcrClient {
    ASYNC FUNCTION list_vulnerable_versions(
        &self,
        owner: &str,
        package: &str,
        owner_type: OwnerType,
        min_severity: Severity
    ) -> Result<Vec<VulnerableVersion>>:
        versions = self.list_versions(owner, package, owner_type).await?
        vulnerable = Vec::new()

        FOR version IN versions:
            TRY:
                report = self.get_vulnerabilities(
                    owner, package, version.id, owner_type
                ).await?

                // Filter by severity
                matching = report.vulnerabilities.iter()
                    .filter(|v| v.severity >= min_severity)
                    .collect::<Vec<_>>()

                IF !matching.is_empty():
                    vulnerable.push(VulnerableVersion {
                        version_id: version.id,
                        tags: version.metadata.container.tags.clone(),
                        vulnerabilities: matching.into_iter().cloned().collect()
                    })
            CATCH _:
                CONTINUE  // Skip versions without vuln data

        RETURN Ok(vulnerable)
}
```

---

## 9. Rate Limit Handling

### 9.1 Rate Limiter

```
IMPL RateLimiter {
    FUNCTION new(throttle_threshold: f32) -> Self:
        Self {
            limit: AtomicU32::new(1000),
            remaining: AtomicU32::new(1000),
            reset_at: AtomicU64::new(0),
            throttle_threshold
        }

    ASYNC FUNCTION check_throttle(&self) -> Result<()>:
        remaining = self.remaining.load(Ordering::Relaxed)
        limit = self.limit.load(Ordering::Relaxed)

        IF limit == 0:
            RETURN Ok(())  // No limit info yet

        usage_ratio = 1.0 - (remaining as f32 / limit as f32)

        IF usage_ratio >= self.throttle_threshold:
            // Approaching limit, calculate delay
            reset_at = self.reset_at.load(Ordering::Relaxed)
            now = SystemTime::now().duration_since(UNIX_EPOCH).as_secs()

            IF reset_at > now:
                delay = Duration::from_secs(reset_at - now)
                // Add proportional delay
                sleep_time = delay.mul_f32(usage_ratio - self.throttle_threshold)
                sleep(sleep_time.min(Duration::from_secs(30))).await

        IF remaining == 0:
            reset_at = self.reset_at.load(Ordering::Relaxed)
            now = SystemTime::now().duration_since(UNIX_EPOCH).as_secs()

            IF reset_at > now:
                RETURN Err(GhcrError::RateLimited {
                    reset_at: DateTime::from_timestamp(reset_at)
                })

        RETURN Ok(())

    FUNCTION update(&self, headers: &HeaderMap):
        IF let Some(limit) = headers.get("x-ratelimit-limit"):
            self.limit.store(limit.parse().unwrap_or(1000), Ordering::Relaxed)

        IF let Some(remaining) = headers.get("x-ratelimit-remaining"):
            self.remaining.store(remaining.parse().unwrap_or(0), Ordering::Relaxed)

        IF let Some(reset) = headers.get("x-ratelimit-reset"):
            self.reset_at.store(reset.parse().unwrap_or(0), Ordering::Relaxed)
}
```

### 9.2 Retry-After Handling

```
FUNCTION parse_retry_after(headers: &HeaderMap) -> Duration:
    IF let Some(value) = headers.get("retry-after"):
        str_value = value.to_str().unwrap_or("60")

        // Try as seconds
        IF let Ok(secs) = str_value.parse::<u64>():
            RETURN Duration::from_secs(secs)

        // Try as HTTP date
        IF let Ok(date) = httpdate::parse_http_date(str_value):
            now = SystemTime::now()
            IF date > now:
                RETURN date.duration_since(now).unwrap_or(Duration::from_secs(60))

    // Default fallback
    RETURN Duration::from_secs(60)
```

---

## 10. Simulation Layer

### 10.1 Recording

```
STRUCT SimulationRecorder {
    recordings: RwLock<Vec<Recording>>,
    output_path: PathBuf
}

STRUCT Recording {
    request: RecordedRequest,
    response: RecordedResponse,
    timestamp: DateTime
}

IMPL SimulationRecorder {
    ASYNC FUNCTION record(&self, request: &Request, response: &Response, body: &[u8]):
        recording = Recording {
            request: RecordedRequest {
                method: request.method().to_string(),
                url: request.url().to_string(),
                headers: sanitize_headers(request.headers()),
                body_hash: hash_body(request.body())
            },
            response: RecordedResponse {
                status: response.status().as_u16(),
                headers: response.headers().clone(),
                body: body.to_vec()
            },
            timestamp: Utc::now()
        }

        recordings = self.recordings.write().await
        recordings.push(recording)

    ASYNC FUNCTION save(&self) -> Result<()>:
        recordings = self.recordings.read().await
        json = serde_json::to_string_pretty(&*recordings)?
        fs::write(&self.output_path, json).await?
        RETURN Ok(())
}
```

### 10.2 Replay

```
STRUCT SimulationReplayer {
    recordings: Vec<Recording>,
    index: AtomicUsize
}

IMPL SimulationReplayer {
    FUNCTION load(path: &Path) -> Result<Self>:
        content = fs::read_to_string(path)?
        recordings = serde_json::from_str(&content)?
        RETURN Ok(Self { recordings, index: AtomicUsize::new(0) })

    FUNCTION find_match(&self, request: &Request) -> Option<&Recording>:
        request_hash = hash_request(request)

        FOR recording IN &self.recordings:
            IF hash_request_from_recorded(&recording.request) == request_hash:
                RETURN Some(recording)

        RETURN None

    FUNCTION replay(&self, request: &Request) -> Result<Response>:
        recording = self.find_match(request)
            .ok_or(GhcrError::SimulationMismatch)?

        response = Response::builder()
            .status(recording.response.status)
            .headers(recording.response.headers.clone())
            .body(recording.response.body.clone())?

        RETURN Ok(response)
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GHCR-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*Proceed to Architecture phase upon approval.*

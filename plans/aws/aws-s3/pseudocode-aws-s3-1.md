# AWS S3 Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-s3`
**Part:** 1 of 3 - Core Infrastructure & AWS Signature V4

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [AWS Signature V4 Implementation](#4-aws-signature-v4-implementation)
5. [Credentials Management](#5-credentials-management)
6. [HTTP Transport Layer](#6-http-transport-layer)
7. [Request Builder](#7-request-builder)
8. [Response Parser](#8-response-parser)
9. [Error Handling](#9-error-handling)

---

## 1. Overview

### 1.1 Document Purpose

This pseudocode document provides detailed algorithmic descriptions for implementing the core infrastructure of the AWS S3 Integration Module. It covers client initialization, AWS Signature V4 signing, credentials management, HTTP transport, and request/response handling.

### 1.2 Pseudocode Conventions

```
FUNCTION name(params) -> ReturnType
  // Comments explain intent
  statement
  IF condition THEN
    action
  ELSE
    alternative
  END IF

  FOR item IN collection DO
    process(item)
  END FOR

  TRY
    risky_operation()
  CATCH ErrorType AS e
    handle_error(e)
  END TRY

  RETURN value
END FUNCTION

STRUCT StructName {
  field: Type,
  optional_field: Option<Type>,
}

TRAIT TraitName {
  FUNCTION method(self, params) -> ReturnType
}

ENUM EnumName {
  Variant1,
  Variant2(Data),
}
```

---

## 2. Client Initialization

### 2.1 S3 Client Factory

```pseudocode
STRUCT S3ClientImpl {
    config: S3Config,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
    credentials_provider: Arc<dyn CredentialsProvider>,
    retry_executor: Arc<RetryExecutor>,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Option<Arc<RateLimiter>>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,

    // Lazy-initialized services
    objects_service: OnceCell<Arc<ObjectsServiceImpl>>,
    buckets_service: OnceCell<Arc<BucketsServiceImpl>>,
    multipart_service: OnceCell<Arc<MultipartServiceImpl>>,
    presign_service: OnceCell<Arc<PresignServiceImpl>>,
    tagging_service: OnceCell<Arc<TaggingServiceImpl>>,
}

FUNCTION create_s3_client(config: S3Config) -> Result<Arc<S3ClientImpl>, S3Error>
    // Step 1: Validate configuration
    validate_config(config)?

    // Step 2: Initialize logger from primitives
    logger <- get_logger_from_primitive("aws-s3")
    logger.info("Initializing S3 client", {
        region: config.region,
        endpoint: config.endpoint,
        path_style: config.path_style
    })

    // Step 3: Initialize tracer from primitives
    tracer <- get_tracer_from_primitive("aws-s3")

    // Step 4: Initialize credentials provider
    credentials_provider <- initialize_credentials_provider(config)?

    // Step 5: Create AWS signer
    signer <- Arc::new(AwsSignerV4Impl {
        region: config.region.clone(),
        service: "s3".to_string(),
        credentials_provider: credentials_provider.clone(),
    })

    // Step 6: Build retry executor from integrations-retry primitive
    retry_executor <- create_retry_executor(RetryConfig {
        max_retries: config.max_retries,
        initial_backoff: Duration::from_millis(100),
        max_backoff: Duration::from_secs(30),
        backoff_multiplier: 2.0,
        jitter: 0.1,
        retryable_errors: [
            ServerError::SlowDown,
            ServerError::InternalError,
            ServerError::ServiceUnavailable,
            NetworkError::Timeout,
            NetworkError::ConnectionFailed,
            TransferError::StreamInterrupted,
        ]
    })

    // Step 7: Build circuit breaker from integrations-circuit-breaker primitive
    circuit_breaker <- create_circuit_breaker(CircuitBreakerConfig {
        failure_threshold: config.circuit_breaker_config.failure_threshold,
        success_threshold: config.circuit_breaker_config.success_threshold,
        reset_timeout: config.circuit_breaker_config.reset_timeout,
        failure_predicate: |error| {
            MATCH error {
                S3Error::Server(_) => true,
                S3Error::Network(_) => true,
                _ => false
            }
        }
    })

    // Step 8: Build rate limiter from integrations-rate-limit primitive (optional)
    rate_limiter <- IF config.rate_limit_config IS Some(rl_config) THEN
        Some(create_rate_limiter(RateLimiterConfig {
            requests_per_second: rl_config.requests_per_second,
            max_concurrent: rl_config.max_concurrent_requests,
            bytes_per_second: rl_config.bytes_per_second,
        }))
    ELSE
        None
    END IF

    // Step 9: Build HTTP transport with TLS 1.2+
    transport <- create_http_transport(HttpTransportConfig {
        timeout: config.timeout,
        connect_timeout: Duration::from_secs(10),
        tls_config: TlsConfig {
            min_version: TlsVersion::TLS_1_2,
            verify_certificates: true,
        },
        pool_config: ConnectionPoolConfig {
            max_idle_per_host: 20,
            idle_timeout: Duration::from_secs(90),
        },
    })

    // Step 10: Assemble client with lazy service initialization
    client <- S3ClientImpl {
        config: config,
        transport: Arc::new(transport),
        signer: signer,
        credentials_provider: credentials_provider,
        retry_executor: Arc::new(retry_executor),
        circuit_breaker: Arc::new(circuit_breaker),
        rate_limiter: rate_limiter.map(Arc::new),
        logger: logger,
        tracer: tracer,
        objects_service: OnceCell::new(),
        buckets_service: OnceCell::new(),
        multipart_service: OnceCell::new(),
        presign_service: OnceCell::new(),
        tagging_service: OnceCell::new(),
    }

    logger.info("S3 client initialized successfully")
    RETURN Ok(Arc::new(client))
END FUNCTION
```

### 2.2 Service Accessor Implementation

```pseudocode
IMPL S3Client FOR S3ClientImpl {
    FUNCTION objects(self) -> &dyn ObjectsService
        self.objects_service.get_or_init(|| {
            Arc::new(ObjectsServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION buckets(self) -> &dyn BucketsService
        self.buckets_service.get_or_init(|| {
            Arc::new(BucketsServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION multipart(self) -> &dyn MultipartService
        self.multipart_service.get_or_init(|| {
            Arc::new(MultipartServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION presign(self) -> &dyn PresignService
        self.presign_service.get_or_init(|| {
            Arc::new(PresignServiceImpl::new(
                self.config.clone(),
                self.signer.clone(),
                self.logger.clone(),
            ))
        })
    END FUNCTION

    FUNCTION tagging(self) -> &dyn TaggingService
        self.tagging_service.get_or_init(|| {
            Arc::new(TaggingServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION
}
```

### 2.3 Client Builder Pattern

```pseudocode
STRUCT S3ClientBuilder {
    region: Option<String>,
    credentials_provider: Option<Arc<dyn CredentialsProvider>>,
    endpoint: Option<Url>,
    path_style: bool,
    timeout: Duration,
    max_retries: u32,
    retry_config: Option<RetryConfig>,
    circuit_breaker_config: Option<CircuitBreakerConfig>,
    rate_limit_config: Option<RateLimitConfig>,
    multipart_threshold: u64,
    multipart_part_size: u64,
    multipart_concurrency: usize,
}

IMPL S3ClientBuilder {
    FUNCTION new() -> Self
        Self {
            region: None,
            credentials_provider: None,
            endpoint: None,
            path_style: false,
            timeout: Duration::from_secs(300),
            max_retries: 3,
            retry_config: None,
            circuit_breaker_config: None,
            rate_limit_config: None,
            multipart_threshold: 100 * 1024 * 1024,  // 100 MB
            multipart_part_size: 10 * 1024 * 1024,    // 10 MB
            multipart_concurrency: 4,
        }
    END FUNCTION

    FUNCTION region(mut self, region: impl Into<String>) -> Self
        self.region = Some(region.into())
        self
    END FUNCTION

    FUNCTION credentials_provider(mut self, provider: impl CredentialsProvider + 'static) -> Self
        self.credentials_provider = Some(Arc::new(provider))
        self
    END FUNCTION

    FUNCTION credentials(mut self, credentials: AwsCredentials) -> Self
        self.credentials_provider = Some(Arc::new(StaticCredentialsProvider::new(credentials)))
        self
    END FUNCTION

    FUNCTION endpoint(mut self, endpoint: impl Into<Url>) -> Self
        self.endpoint = Some(endpoint.into())
        self
    END FUNCTION

    FUNCTION path_style(mut self, enabled: bool) -> Self
        self.path_style = enabled
        self
    END FUNCTION

    FUNCTION timeout(mut self, timeout: Duration) -> Self
        self.timeout = timeout
        self
    END FUNCTION

    FUNCTION max_retries(mut self, retries: u32) -> Self
        self.max_retries = retries
        self
    END FUNCTION

    FUNCTION retry_config(mut self, config: RetryConfig) -> Self
        self.retry_config = Some(config)
        self
    END FUNCTION

    FUNCTION circuit_breaker_config(mut self, config: CircuitBreakerConfig) -> Self
        self.circuit_breaker_config = Some(config)
        self
    END FUNCTION

    FUNCTION rate_limit_config(mut self, config: RateLimitConfig) -> Self
        self.rate_limit_config = Some(config)
        self
    END FUNCTION

    FUNCTION multipart_threshold(mut self, threshold: u64) -> Self
        self.multipart_threshold = threshold
        self
    END FUNCTION

    FUNCTION multipart_part_size(mut self, size: u64) -> Self
        self.multipart_part_size = size
        self
    END FUNCTION

    FUNCTION multipart_concurrency(mut self, concurrency: usize) -> Self
        self.multipart_concurrency = concurrency
        self
    END FUNCTION

    FUNCTION build(self) -> Result<Arc<dyn S3Client>, S3Error>
        // Resolve region
        region <- self.region
            .or_else(|| env::var("AWS_REGION").ok())
            .or_else(|| env::var("AWS_DEFAULT_REGION").ok())
            .ok_or(ConfigurationError::MissingRegion)?

        // Resolve credentials provider
        credentials_provider <- self.credentials_provider
            .unwrap_or_else(|| Arc::new(ChainCredentialsProvider::default()))

        // Build config
        config <- S3Config {
            region: region,
            credentials_provider: credentials_provider,
            endpoint: self.endpoint,
            path_style: self.path_style,
            timeout: self.timeout,
            max_retries: self.max_retries,
            retry_config: self.retry_config.unwrap_or_default(),
            circuit_breaker_config: self.circuit_breaker_config.unwrap_or_default(),
            rate_limit_config: self.rate_limit_config,
            multipart_threshold: self.multipart_threshold,
            multipart_part_size: self.multipart_part_size,
            multipart_concurrency: self.multipart_concurrency,
        }

        create_s3_client(config)
    END FUNCTION
}
```

### 2.4 Client from Environment

```pseudocode
FUNCTION create_s3_client_from_env() -> Result<Arc<dyn S3Client>, S3Error>
    // Build client using environment variables
    S3ClientBuilder::new()
        .region(env::var("AWS_REGION").or_else(|_| env::var("AWS_DEFAULT_REGION"))?)
        .credentials_provider(ChainCredentialsProvider::default())
        .build()
END FUNCTION

FUNCTION create_s3_client_for_bucket(bucket: &str) -> Result<Arc<dyn S3Client>, S3Error>
    // Detect bucket region and create appropriately configured client

    // First, try to get bucket location with default client
    default_client <- create_s3_client_from_env()?

    TRY
        location <- default_client.buckets().get_location(GetBucketLocationRequest {
            bucket: bucket.to_string()
        }).await?

        // Rebuild client with correct region
        S3ClientBuilder::new()
            .region(location.location_constraint.unwrap_or("us-east-1".to_string()))
            .credentials_provider(ChainCredentialsProvider::default())
            .build()
    CATCH BucketError::BucketNotFound AS e
        RETURN Err(e.into())
    CATCH _ AS e
        // Fall back to environment region
        default_client
    END TRY
END FUNCTION
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```pseudocode
FUNCTION validate_config(config: &S3Config) -> Result<(), ConfigurationError>
    // Validate region
    IF config.region.is_empty() THEN
        RETURN Err(ConfigurationError::MissingRegion)
    END IF

    IF NOT is_valid_aws_region(&config.region) THEN
        RETURN Err(ConfigurationError::InvalidRegion {
            region: config.region.clone()
        })
    END IF

    // Validate endpoint if provided
    IF config.endpoint IS Some(endpoint) THEN
        IF endpoint.scheme() != "https" AND NOT is_localhost(endpoint) THEN
            RETURN Err(ConfigurationError::InsecureEndpoint {
                endpoint: endpoint.to_string()
            })
        END IF
    END IF

    // Validate multipart settings
    IF config.multipart_part_size < MIN_PART_SIZE THEN
        RETURN Err(ConfigurationError::InvalidPartSize {
            size: config.multipart_part_size,
            min: MIN_PART_SIZE,
        })
    END IF

    IF config.multipart_part_size > MAX_PART_SIZE THEN
        RETURN Err(ConfigurationError::InvalidPartSize {
            size: config.multipart_part_size,
            max: MAX_PART_SIZE,
        })
    END IF

    IF config.multipart_concurrency == 0 THEN
        RETURN Err(ConfigurationError::InvalidConcurrency)
    END IF

    // Validate timeout
    IF config.timeout < Duration::from_secs(1) THEN
        RETURN Err(ConfigurationError::InvalidTimeout {
            timeout: config.timeout
        })
    END IF

    Ok(())
END FUNCTION

CONSTANT MIN_PART_SIZE: u64 = 5 * 1024 * 1024        // 5 MB
CONSTANT MAX_PART_SIZE: u64 = 5 * 1024 * 1024 * 1024 // 5 GB
CONSTANT MAX_PARTS: u32 = 10_000
CONSTANT MAX_OBJECT_SIZE: u64 = 5 * 1024 * 1024 * 1024 * 1024 // 5 TB

FUNCTION is_valid_aws_region(region: &str) -> bool
    // Valid AWS regions match pattern
    region.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        AND region.len() >= 9
        AND region.len() <= 25
END FUNCTION

FUNCTION is_localhost(url: &Url) -> bool
    MATCH url.host_str() {
        Some("localhost") => true,
        Some("127.0.0.1") => true,
        Some("::1") => true,
        Some(host) => host.starts_with("192.168.") OR host.starts_with("10."),
        None => false,
    }
END FUNCTION
```

### 3.2 Endpoint Resolution

```pseudocode
STRUCT EndpointResolver {
    region: String,
    custom_endpoint: Option<Url>,
    path_style: bool,
}

IMPL EndpointResolver {
    FUNCTION resolve_endpoint(self, bucket: Option<&str>, key: Option<&str>) -> Url
        IF self.custom_endpoint IS Some(endpoint) THEN
            // Custom endpoint (S3-compatible services)
            RETURN self.resolve_custom_endpoint(endpoint, bucket, key)
        ELSE
            // Standard AWS S3 endpoint
            RETURN self.resolve_aws_endpoint(bucket, key)
        END IF
    END FUNCTION

    FUNCTION resolve_aws_endpoint(self, bucket: Option<&str>, key: Option<&str>) -> Url
        base_host <- format!("s3.{}.amazonaws.com", self.region)

        IF bucket IS Some(b) THEN
            IF self.path_style THEN
                // Path-style: https://s3.region.amazonaws.com/bucket/key
                path <- IF key IS Some(k) THEN
                    format!("/{}/{}", b, k)
                ELSE
                    format!("/{}", b)
                END IF
                Url::parse(&format!("https://{}{}", base_host, path))
            ELSE
                // Virtual-hosted-style: https://bucket.s3.region.amazonaws.com/key
                host <- format!("{}.{}", b, base_host)
                path <- key.map(|k| format!("/{}", k)).unwrap_or_default()
                Url::parse(&format!("https://{}{}", host, path))
            END IF
        ELSE
            // No bucket - list buckets endpoint
            Url::parse(&format!("https://{}/", base_host))
        END IF
    END FUNCTION

    FUNCTION resolve_custom_endpoint(self, endpoint: &Url, bucket: Option<&str>, key: Option<&str>) -> Url
        mut url <- endpoint.clone()

        IF bucket IS Some(b) THEN
            IF self.path_style THEN
                // Path-style for custom endpoint
                path <- IF key IS Some(k) THEN
                    format!("/{}/{}", b, k)
                ELSE
                    format!("/{}", b)
                END IF
                url.set_path(&path)
            ELSE
                // Virtual-hosted-style for custom endpoint
                current_host <- url.host_str().unwrap_or("localhost")
                new_host <- format!("{}.{}", b, current_host)
                url.set_host(Some(&new_host))?
                IF key IS Some(k) THEN
                    url.set_path(&format!("/{}", k))
                END IF
            END IF
        END IF

        url
    END FUNCTION

    FUNCTION get_signing_region(self) -> &str
        &self.region
    END FUNCTION

    FUNCTION get_signing_host(self, bucket: Option<&str>) -> String
        url <- self.resolve_endpoint(bucket, None)
        url.host_str().unwrap_or("s3.amazonaws.com").to_string()
    END FUNCTION
}
```

---

## 4. AWS Signature V4 Implementation

### 4.1 Signature V4 Signer

```pseudocode
STRUCT AwsSignerV4Impl {
    region: String,
    service: String,
    credentials_provider: Arc<dyn CredentialsProvider>,
}

IMPL AwsSigner FOR AwsSignerV4Impl {
    FUNCTION sign_request(
        self,
        request: &mut HttpRequest,
        payload_hash: &str,
        timestamp: DateTime<Utc>
    ) -> Result<(), SigningError>
        // Get credentials
        credentials <- self.credentials_provider.get_credentials().await?

        // Format timestamp
        amz_date <- timestamp.format("%Y%m%dT%H%M%SZ").to_string()
        date_stamp <- timestamp.format("%Y%m%d").to_string()

        // Add required headers
        request.headers.insert("x-amz-date", amz_date.clone())
        request.headers.insert("x-amz-content-sha256", payload_hash.to_string())

        // Add security token if present (temporary credentials)
        IF credentials.session_token IS Some(token) THEN
            request.headers.insert("x-amz-security-token", token.expose_secret().to_string())
        END IF

        // Step 1: Create canonical request
        canonical_request <- self.create_canonical_request(request, payload_hash)

        // Step 2: Create string to sign
        credential_scope <- format!("{}/{}/{}/aws4_request",
            date_stamp, self.region, self.service)
        string_to_sign <- self.create_string_to_sign(
            &amz_date,
            &credential_scope,
            &canonical_request
        )

        // Step 3: Calculate signature
        signing_key <- self.derive_signing_key(
            credentials.secret_access_key.expose_secret(),
            &date_stamp
        )
        signature <- hmac_sha256_hex(&signing_key, string_to_sign.as_bytes())

        // Step 4: Create authorization header
        signed_headers <- self.get_signed_headers(request)
        authorization <- format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            credentials.access_key_id,
            credential_scope,
            signed_headers,
            signature
        )

        request.headers.insert("authorization", authorization)

        Ok(())
    END FUNCTION

    FUNCTION presign_url(
        self,
        method: HttpMethod,
        url: &Url,
        expires_in: Duration,
        timestamp: DateTime<Utc>
    ) -> Result<Url, SigningError>
        // Validate expiration (max 7 days)
        IF expires_in > Duration::from_secs(604800) THEN
            RETURN Err(SigningError::ExpirationTooLong {
                max: Duration::from_secs(604800),
                requested: expires_in
            })
        END IF

        // Get credentials
        credentials <- self.credentials_provider.get_credentials().await?

        // Format timestamp
        amz_date <- timestamp.format("%Y%m%dT%H%M%SZ").to_string()
        date_stamp <- timestamp.format("%Y%m%d").to_string()
        credential_scope <- format!("{}/{}/{}/aws4_request",
            date_stamp, self.region, self.service)

        // Build presigned URL with query parameters
        mut presigned_url <- url.clone()

        // Add authentication query parameters
        presigned_url.query_pairs_mut()
            .append_pair("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
            .append_pair("X-Amz-Credential",
                &format!("{}/{}", credentials.access_key_id, credential_scope))
            .append_pair("X-Amz-Date", &amz_date)
            .append_pair("X-Amz-Expires", &expires_in.as_secs().to_string())
            .append_pair("X-Amz-SignedHeaders", "host")

        // Add security token if present
        IF credentials.session_token IS Some(token) THEN
            presigned_url.query_pairs_mut()
                .append_pair("X-Amz-Security-Token", token.expose_secret())
        END IF

        // Create canonical request for presigning
        canonical_request <- self.create_canonical_request_for_presign(
            method,
            &presigned_url
        )

        // Create string to sign
        string_to_sign <- self.create_string_to_sign(
            &amz_date,
            &credential_scope,
            &canonical_request
        )

        // Calculate signature
        signing_key <- self.derive_signing_key(
            credentials.secret_access_key.expose_secret(),
            &date_stamp
        )
        signature <- hmac_sha256_hex(&signing_key, string_to_sign.as_bytes())

        // Add signature to URL
        presigned_url.query_pairs_mut()
            .append_pair("X-Amz-Signature", &signature)

        Ok(presigned_url)
    END FUNCTION
}
```

### 4.2 Canonical Request Creation

```pseudocode
IMPL AwsSignerV4Impl {
    FUNCTION create_canonical_request(
        self,
        request: &HttpRequest,
        payload_hash: &str
    ) -> String
        // Step 1: HTTP method
        method <- request.method.as_str()

        // Step 2: Canonical URI (URL-encoded path)
        canonical_uri <- self.encode_uri_path(request.url.path())

        // Step 3: Canonical query string
        canonical_query_string <- self.create_canonical_query_string(&request.url)

        // Step 4: Canonical headers
        canonical_headers <- self.create_canonical_headers(request)

        // Step 5: Signed headers
        signed_headers <- self.get_signed_headers(request)

        // Step 6: Hashed payload
        // payload_hash is either SHA256 of body or "UNSIGNED-PAYLOAD"

        // Combine into canonical request
        format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method,
            canonical_uri,
            canonical_query_string,
            canonical_headers,
            signed_headers,
            payload_hash
        )
    END FUNCTION

    FUNCTION encode_uri_path(self, path: &str) -> String
        // URL-encode path segments individually
        path.split('/')
            .map(|segment| {
                percent_encode(segment.as_bytes(), URI_ENCODE_SET)
                    .to_string()
            })
            .collect::<Vec<_>>()
            .join("/")
    END FUNCTION

    FUNCTION create_canonical_query_string(self, url: &Url) -> String
        // Get query pairs, sort by key, then by value
        mut pairs: Vec<(String, String)> <- url.query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect()

        pairs.sort_by(|a, b| {
            match a.0.cmp(&b.0) {
                Ordering::Equal => a.1.cmp(&b.1),
                other => other
            }
        })

        // URL-encode and join
        pairs.iter()
            .map(|(k, v)| {
                format!("{}={}",
                    uri_encode(k, true),
                    uri_encode(v, true)
                )
            })
            .collect::<Vec<_>>()
            .join("&")
    END FUNCTION

    FUNCTION create_canonical_headers(self, request: &HttpRequest) -> String
        // Get headers to sign
        mut headers: Vec<(String, String)> <- Vec::new()

        // Always include host
        host <- request.url.host_str().unwrap_or("")
        headers.push(("host".to_string(), host.to_string()))

        // Include x-amz-* headers
        FOR (name, value) IN request.headers.iter() DO
            lower_name <- name.as_str().to_lowercase()
            IF lower_name.starts_with("x-amz-") OR lower_name == "content-type" THEN
                // Trim whitespace and collapse consecutive spaces
                trimmed_value <- value.to_str()
                    .unwrap_or("")
                    .trim()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                headers.push((lower_name, trimmed_value))
            END IF
        END FOR

        // Sort by header name
        headers.sort_by(|a, b| a.0.cmp(&b.0))

        // Format as "header:value\n"
        headers.iter()
            .map(|(k, v)| format!("{}:{}\n", k, v))
            .collect::<String>()
    END FUNCTION

    FUNCTION get_signed_headers(self, request: &HttpRequest) -> String
        mut header_names: Vec<String> <- vec!["host".to_string()]

        FOR (name, _) IN request.headers.iter() DO
            lower_name <- name.as_str().to_lowercase()
            IF lower_name.starts_with("x-amz-") OR lower_name == "content-type" THEN
                header_names.push(lower_name)
            END IF
        END FOR

        header_names.sort()
        header_names.dedup()
        header_names.join(";")
    END FUNCTION
}
```

### 4.3 String to Sign and Signing Key

```pseudocode
IMPL AwsSignerV4Impl {
    FUNCTION create_string_to_sign(
        self,
        amz_date: &str,
        credential_scope: &str,
        canonical_request: &str
    ) -> String
        // Hash the canonical request
        canonical_request_hash <- sha256_hex(canonical_request.as_bytes())

        format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date,
            credential_scope,
            canonical_request_hash
        )
    END FUNCTION

    FUNCTION derive_signing_key(self, secret_key: &str, date_stamp: &str) -> Vec<u8>
        // Step 1: kDate = HMAC-SHA256("AWS4" + secret_key, date_stamp)
        k_secret <- format!("AWS4{}", secret_key)
        k_date <- hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes())

        // Step 2: kRegion = HMAC-SHA256(kDate, region)
        k_region <- hmac_sha256(&k_date, self.region.as_bytes())

        // Step 3: kService = HMAC-SHA256(kRegion, service)
        k_service <- hmac_sha256(&k_region, self.service.as_bytes())

        // Step 4: kSigning = HMAC-SHA256(kService, "aws4_request")
        hmac_sha256(&k_service, b"aws4_request")
    END FUNCTION

    FUNCTION create_canonical_request_for_presign(
        self,
        method: HttpMethod,
        url: &Url
    ) -> String
        canonical_uri <- self.encode_uri_path(url.path())
        canonical_query_string <- self.create_canonical_query_string(url)

        // For presigned URLs, only host header is signed
        host <- url.host_str().unwrap_or("")
        canonical_headers <- format!("host:{}\n", host)
        signed_headers <- "host"

        // Unsigned payload for presigned URLs
        payload_hash <- "UNSIGNED-PAYLOAD"

        format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method.as_str(),
            canonical_uri,
            canonical_query_string,
            canonical_headers,
            signed_headers,
            payload_hash
        )
    END FUNCTION
}
```

### 4.4 Payload Hashing

```pseudocode
ENUM PayloadHash {
    // SHA256 hash of the payload
    Sha256(String),
    // Unsigned payload (for streaming or presigned)
    Unsigned,
    // Streaming payload with chunked encoding
    StreamingUnsigned,
}

FUNCTION calculate_payload_hash(body: Option<&[u8]>) -> String
    MATCH body {
        Some(data) => sha256_hex(data),
        None => sha256_hex(b""),  // Empty body hash
    }
END FUNCTION

FUNCTION sha256_hex(data: &[u8]) -> String
    hasher <- Sha256::new()
    hasher.update(data)
    result <- hasher.finalize()
    hex::encode(result)
END FUNCTION

FUNCTION hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8>
    mac <- Hmac::<Sha256>::new_from_slice(key).unwrap()
    mac.update(data)
    mac.finalize().into_bytes().to_vec()
END FUNCTION

FUNCTION hmac_sha256_hex(key: &[u8], data: &[u8]) -> String
    hex::encode(hmac_sha256(key, data))
END FUNCTION

// URI encoding for AWS Signature V4
CONSTANT URI_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}')
    .add(b'[')
    .add(b']')
    .add(b'^')
    .add(b'\\')
    .add(b'|')
    .add(b'%')

FUNCTION uri_encode(input: &str, encode_slash: bool) -> String
    mut encoded <- percent_encode(input.as_bytes(), URI_ENCODE_SET).to_string()

    IF encode_slash THEN
        encoded <- encoded.replace("%2F", "/")
    END IF

    encoded
END FUNCTION
```

---

## 5. Credentials Management

### 5.1 Credentials Provider Chain

```pseudocode
STRUCT ChainCredentialsProvider {
    providers: Vec<Arc<dyn CredentialsProvider>>,
    cached_credentials: RwLock<Option<CachedCredentials>>,
    cache_duration: Duration,
}

STRUCT CachedCredentials {
    credentials: AwsCredentials,
    expires_at: Instant,
}

IMPL ChainCredentialsProvider {
    FUNCTION default() -> Self
        Self {
            providers: vec![
                Arc::new(EnvCredentialsProvider),
                Arc::new(ProfileCredentialsProvider::default()),
                Arc::new(InstanceMetadataCredentialsProvider::new()),
                Arc::new(EcsTaskCredentialsProvider::new()),
            ],
            cached_credentials: RwLock::new(None),
            cache_duration: Duration::from_secs(300),  // 5 minutes
        }
    END FUNCTION

    FUNCTION with_providers(providers: Vec<Arc<dyn CredentialsProvider>>) -> Self
        Self {
            providers,
            cached_credentials: RwLock::new(None),
            cache_duration: Duration::from_secs(300),
        }
    END FUNCTION
}

IMPL CredentialsProvider FOR ChainCredentialsProvider {
    ASYNC FUNCTION get_credentials(self) -> Result<AwsCredentials, CredentialsError>
        // Check cache first
        IF let Some(cached) = self.cached_credentials.read().await.as_ref() THEN
            IF cached.expires_at > Instant::now() THEN
                RETURN Ok(cached.credentials.clone())
            END IF
        END IF

        // Try each provider in order
        mut last_error: Option<CredentialsError> <- None

        FOR provider IN self.providers.iter() DO
            MATCH provider.get_credentials().await {
                Ok(credentials) => {
                    // Cache successful credentials
                    *self.cached_credentials.write().await = Some(CachedCredentials {
                        credentials: credentials.clone(),
                        expires_at: Instant::now() + self.cache_duration,
                    })
                    RETURN Ok(credentials)
                },
                Err(e) => {
                    last_error = Some(e)
                    CONTINUE
                }
            }
        END FOR

        Err(last_error.unwrap_or(CredentialsError::NoCredentialsFound))
    END FUNCTION
}
```

### 5.2 Environment Credentials Provider

```pseudocode
STRUCT EnvCredentialsProvider;

IMPL CredentialsProvider FOR EnvCredentialsProvider {
    ASYNC FUNCTION get_credentials(self) -> Result<AwsCredentials, CredentialsError>
        access_key_id <- env::var("AWS_ACCESS_KEY_ID")
            .map_err(|_| CredentialsError::CredentialsNotFound {
                source: "environment".to_string()
            })?

        secret_access_key <- env::var("AWS_SECRET_ACCESS_KEY")
            .map_err(|_| CredentialsError::CredentialsNotFound {
                source: "environment".to_string()
            })?

        session_token <- env::var("AWS_SESSION_TOKEN").ok()

        Ok(AwsCredentials {
            access_key_id,
            secret_access_key: SecretString::new(secret_access_key),
            session_token: session_token.map(SecretString::new),
        })
    END FUNCTION
}
```

### 5.3 Profile Credentials Provider

```pseudocode
STRUCT ProfileCredentialsProvider {
    profile_name: String,
    credentials_file: PathBuf,
}

IMPL ProfileCredentialsProvider {
    FUNCTION default() -> Self
        profile <- env::var("AWS_PROFILE").unwrap_or_else(|_| "default".to_string())

        credentials_path <- env::var("AWS_SHARED_CREDENTIALS_FILE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs::home_dir()
                    .unwrap_or_default()
                    .join(".aws")
                    .join("credentials")
            })

        Self {
            profile_name: profile,
            credentials_file: credentials_path,
        }
    END FUNCTION

    FUNCTION with_profile(profile: impl Into<String>) -> Self
        mut provider <- Self::default()
        provider.profile_name = profile.into()
        provider
    END FUNCTION
}

IMPL CredentialsProvider FOR ProfileCredentialsProvider {
    ASYNC FUNCTION get_credentials(self) -> Result<AwsCredentials, CredentialsError>
        // Read credentials file
        content <- fs::read_to_string(&self.credentials_file)
            .map_err(|e| CredentialsError::CredentialsNotFound {
                source: format!("profile file: {}", e)
            })?

        // Parse INI-style file
        credentials <- parse_credentials_file(&content, &self.profile_name)?

        Ok(credentials)
    END FUNCTION
}

FUNCTION parse_credentials_file(content: &str, profile: &str) -> Result<AwsCredentials, CredentialsError>
    mut current_profile: Option<String> <- None
    mut access_key_id: Option<String> <- None
    mut secret_access_key: Option<String> <- None
    mut session_token: Option<String> <- None

    FOR line IN content.lines() DO
        trimmed <- line.trim()

        // Skip comments and empty lines
        IF trimmed.is_empty() OR trimmed.starts_with('#') OR trimmed.starts_with(';') THEN
            CONTINUE
        END IF

        // Profile header: [profile-name]
        IF trimmed.starts_with('[') AND trimmed.ends_with(']') THEN
            current_profile = Some(trimmed[1..trimmed.len()-1].to_string())
            CONTINUE
        END IF

        // Key-value pair
        IF current_profile == Some(profile.to_string()) THEN
            IF let Some((key, value)) = trimmed.split_once('=') THEN
                key <- key.trim()
                value <- value.trim()

                MATCH key {
                    "aws_access_key_id" => access_key_id = Some(value.to_string()),
                    "aws_secret_access_key" => secret_access_key = Some(value.to_string()),
                    "aws_session_token" => session_token = Some(value.to_string()),
                    _ => {}
                }
            END IF
        END IF
    END FOR

    Ok(AwsCredentials {
        access_key_id: access_key_id.ok_or(CredentialsError::CredentialsNotFound {
            source: format!("profile '{}' missing access_key_id", profile)
        })?,
        secret_access_key: SecretString::new(
            secret_access_key.ok_or(CredentialsError::CredentialsNotFound {
                source: format!("profile '{}' missing secret_access_key", profile)
            })?
        ),
        session_token: session_token.map(SecretString::new),
    })
END FUNCTION
```

### 5.4 Instance Metadata Credentials Provider (IMDSv2)

```pseudocode
STRUCT InstanceMetadataCredentialsProvider {
    http_client: reqwest::Client,
    metadata_endpoint: String,
    token_ttl: Duration,
    cached_token: RwLock<Option<(String, Instant)>>,
}

IMPL InstanceMetadataCredentialsProvider {
    FUNCTION new() -> Self
        Self {
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(1))
                .build()
                .unwrap(),
            metadata_endpoint: "http://169.254.169.254".to_string(),
            token_ttl: Duration::from_secs(21600),  // 6 hours
            cached_token: RwLock::new(None),
        }
    END FUNCTION

    ASYNC FUNCTION get_imds_token(self) -> Result<String, CredentialsError>
        // Check cached token
        IF let Some((token, expires_at)) = self.cached_token.read().await.as_ref() THEN
            IF *expires_at > Instant::now() THEN
                RETURN Ok(token.clone())
            END IF
        END IF

        // Get new token via IMDSv2
        token_url <- format!("{}/latest/api/token", self.metadata_endpoint)

        response <- self.http_client
            .put(&token_url)
            .header("X-aws-ec2-metadata-token-ttl-seconds", self.token_ttl.as_secs().to_string())
            .send()
            .await
            .map_err(|e| CredentialsError::CredentialsRefreshFailed {
                source: format!("IMDS token request failed: {}", e)
            })?

        IF NOT response.status().is_success() THEN
            RETURN Err(CredentialsError::CredentialsNotFound {
                source: "IMDS not available".to_string()
            })
        END IF

        token <- response.text().await.map_err(|e| CredentialsError::CredentialsRefreshFailed {
            source: format!("Failed to read IMDS token: {}", e)
        })?

        // Cache token
        *self.cached_token.write().await = Some((
            token.clone(),
            Instant::now() + self.token_ttl - Duration::from_secs(60)  // Refresh early
        ))

        Ok(token)
    END FUNCTION
}

IMPL CredentialsProvider FOR InstanceMetadataCredentialsProvider {
    ASYNC FUNCTION get_credentials(self) -> Result<AwsCredentials, CredentialsError>
        // Get IMDS token first
        token <- self.get_imds_token().await?

        // Get role name
        role_url <- format!("{}/latest/meta-data/iam/security-credentials/", self.metadata_endpoint)

        role_response <- self.http_client
            .get(&role_url)
            .header("X-aws-ec2-metadata-token", &token)
            .send()
            .await
            .map_err(|e| CredentialsError::CredentialsNotFound {
                source: format!("IMDS role request failed: {}", e)
            })?

        IF NOT role_response.status().is_success() THEN
            RETURN Err(CredentialsError::CredentialsNotFound {
                source: "No IAM role attached to instance".to_string()
            })
        END IF

        role_name <- role_response.text().await?

        // Get credentials for role
        creds_url <- format!("{}/latest/meta-data/iam/security-credentials/{}",
            self.metadata_endpoint, role_name.trim())

        creds_response <- self.http_client
            .get(&creds_url)
            .header("X-aws-ec2-metadata-token", &token)
            .send()
            .await?

        IF NOT creds_response.status().is_success() THEN
            RETURN Err(CredentialsError::CredentialsRefreshFailed {
                source: "Failed to get credentials from IMDS".to_string()
            })
        END IF

        // Parse JSON response
        creds_json: IMDSCredentialsResponse <- creds_response.json().await?

        Ok(AwsCredentials {
            access_key_id: creds_json.access_key_id,
            secret_access_key: SecretString::new(creds_json.secret_access_key),
            session_token: Some(SecretString::new(creds_json.token)),
        })
    END FUNCTION
}

STRUCT IMDSCredentialsResponse {
    access_key_id: String,
    secret_access_key: String,
    token: String,
    expiration: String,
}
```

### 5.5 Static Credentials Provider

```pseudocode
STRUCT StaticCredentialsProvider {
    credentials: AwsCredentials,
}

IMPL StaticCredentialsProvider {
    FUNCTION new(credentials: AwsCredentials) -> Self
        Self { credentials }
    END FUNCTION

    FUNCTION from_keys(access_key_id: String, secret_access_key: String) -> Self
        Self {
            credentials: AwsCredentials {
                access_key_id,
                secret_access_key: SecretString::new(secret_access_key),
                session_token: None,
            }
        }
    END FUNCTION
}

IMPL CredentialsProvider FOR StaticCredentialsProvider {
    ASYNC FUNCTION get_credentials(self) -> Result<AwsCredentials, CredentialsError>
        Ok(self.credentials.clone())
    END FUNCTION
}
```

---

## 6. HTTP Transport Layer

### 6.1 HTTP Transport Implementation

```pseudocode
STRUCT HttpTransportImpl {
    client: reqwest::Client,
    config: HttpTransportConfig,
}

STRUCT HttpTransportConfig {
    timeout: Duration,
    connect_timeout: Duration,
    tls_config: TlsConfig,
    pool_config: ConnectionPoolConfig,
}

IMPL HttpTransportImpl {
    FUNCTION new(config: HttpTransportConfig) -> Result<Self, TransportError>
        client <- reqwest::Client::builder()
            .timeout(config.timeout)
            .connect_timeout(config.connect_timeout)
            .min_tls_version(reqwest::tls::Version::TLS_1_2)
            .pool_max_idle_per_host(config.pool_config.max_idle_per_host)
            .pool_idle_timeout(config.pool_config.idle_timeout)
            .build()
            .map_err(|e| TransportError::Configuration {
                message: format!("Failed to create HTTP client: {}", e)
            })?

        Ok(Self { client, config })
    END FUNCTION
}

IMPL HttpTransport FOR HttpTransportImpl {
    ASYNC FUNCTION send(self, request: HttpRequest) -> Result<HttpResponse, TransportError>
        // Build reqwest request
        mut req_builder <- self.client.request(
            request.method.into(),
            request.url.clone()
        )

        // Add headers
        FOR (name, value) IN request.headers.iter() DO
            req_builder <- req_builder.header(name, value)
        END FOR

        // Add body if present
        IF request.body IS Some(body) THEN
            req_builder <- req_builder.body(body)
        END IF

        // Set timeout if specified
        IF request.timeout IS Some(timeout) THEN
            req_builder <- req_builder.timeout(timeout)
        END IF

        // Execute request
        response <- req_builder
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?

        // Read response
        status <- response.status()
        headers <- response.headers().clone()
        body <- response.bytes().await.map_err(|e| TransportError::ReadError {
            message: format!("Failed to read response body: {}", e)
        })?

        Ok(HttpResponse {
            status: status.into(),
            headers: headers.into(),
            body,
        })
    END FUNCTION

    ASYNC FUNCTION send_streaming(
        self,
        request: HttpRequest
    ) -> Result<StreamingResponse, TransportError>
        // Build reqwest request
        mut req_builder <- self.client.request(
            request.method.into(),
            request.url.clone()
        )

        // Add headers
        FOR (name, value) IN request.headers.iter() DO
            req_builder <- req_builder.header(name, value)
        END FOR

        // Add body if present
        IF request.body IS Some(RequestBody::Bytes(bytes)) THEN
            req_builder <- req_builder.body(bytes)
        ELSE IF request.body IS Some(RequestBody::Stream(stream)) THEN
            req_builder <- req_builder.body(reqwest::Body::wrap_stream(stream))
        END IF

        // Execute request
        response <- req_builder
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?

        status <- response.status()
        headers <- response.headers().clone()

        // Convert to byte stream
        body_stream <- response.bytes_stream()
            .map_err(|e| TransportError::StreamError {
                message: format!("Stream read error: {}", e)
            })

        Ok(StreamingResponse {
            status: status.into(),
            headers: headers.into(),
            body: Box::pin(body_stream),
        })
    END FUNCTION

    FUNCTION map_reqwest_error(self, error: reqwest::Error) -> TransportError
        IF error.is_timeout() THEN
            TransportError::Timeout {
                duration: self.config.timeout
            }
        ELSE IF error.is_connect() THEN
            TransportError::ConnectionFailed {
                message: error.to_string()
            }
        ELSE IF error.is_request() THEN
            TransportError::RequestError {
                message: error.to_string()
            }
        ELSE
            TransportError::Unknown {
                message: error.to_string()
            }
        END IF
    END FUNCTION
}
```

### 6.2 Request Execution with Resilience

```pseudocode
STRUCT ResilientExecutor {
    transport: Arc<dyn HttpTransport>,
    retry_executor: Arc<RetryExecutor>,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Option<Arc<RateLimiter>>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

IMPL ResilientExecutor {
    ASYNC FUNCTION execute<T>(
        self,
        operation: &str,
        request_fn: impl Fn() -> Future<Result<T, S3Error>>,
        span: &Span
    ) -> Result<T, S3Error>
        // Step 1: Check circuit breaker
        IF self.circuit_breaker.is_open() THEN
            span.record("circuit_breaker", "open")
            self.logger.warn("Circuit breaker is open", {
                operation: operation
            })
            RETURN Err(S3Error::Server(ServerError::CircuitOpen {
                operation: operation.to_string()
            }))
        END IF

        // Step 2: Acquire rate limit permit
        IF self.rate_limiter IS Some(limiter) THEN
            limiter.acquire().await.map_err(|e| S3Error::RateLimited {
                message: e.to_string()
            })?
        END IF

        // Step 3: Execute with retry
        result <- self.retry_executor.execute(|| async {
            // Check circuit breaker on each attempt
            IF self.circuit_breaker.is_open() THEN
                RETURN Err(RetryError::NonRetryable(S3Error::Server(ServerError::CircuitOpen {
                    operation: operation.to_string()
                })))
            END IF

            MATCH request_fn().await {
                Ok(response) => {
                    self.circuit_breaker.record_success()
                    Ok(response)
                },
                Err(e) => {
                    IF e.is_retryable() THEN
                        self.circuit_breaker.record_failure()
                        Err(RetryError::Retryable(e))
                    ELSE
                        Err(RetryError::NonRetryable(e))
                    END IF
                }
            }
        }).await

        // Step 4: Record result in span
        MATCH &result {
            Ok(_) => span.record("status", "success"),
            Err(e) => {
                span.record("status", "error")
                span.record("error.type", e.error_type())
                span.record("error.message", e.to_string())
            }
        }

        result
    END FUNCTION

    ASYNC FUNCTION execute_streaming<T>(
        self,
        operation: &str,
        request_fn: impl Fn() -> Future<Result<StreamingResponse, S3Error>>,
        span: &Span
    ) -> Result<StreamingResponse, S3Error>
        // For streaming, we only retry the initial connection
        // Stream errors are not retried (handled by caller)

        // Step 1: Check circuit breaker
        IF self.circuit_breaker.is_open() THEN
            span.record("circuit_breaker", "open")
            RETURN Err(S3Error::Server(ServerError::CircuitOpen {
                operation: operation.to_string()
            }))
        END IF

        // Step 2: Acquire rate limit permit
        IF self.rate_limiter IS Some(limiter) THEN
            limiter.acquire().await?
        END IF

        // Step 3: Execute with limited retry (connection only)
        max_connection_retries <- 2
        mut last_error: Option<S3Error> <- None

        FOR attempt IN 1..=max_connection_retries DO
            MATCH request_fn().await {
                Ok(response) => {
                    self.circuit_breaker.record_success()
                    span.record("status", "connected")
                    RETURN Ok(response)
                },
                Err(e) => {
                    self.circuit_breaker.record_failure()
                    last_error = Some(e)

                    IF attempt < max_connection_retries THEN
                        delay <- Duration::from_millis(100 * (1 << attempt))
                        tokio::time::sleep(delay).await
                    END IF
                }
            }
        END FOR

        Err(last_error.unwrap())
    END FUNCTION
}
```

---

## 7. Request Builder

### 7.1 S3 Request Builder

```pseudocode
STRUCT S3RequestBuilder {
    method: HttpMethod,
    bucket: Option<String>,
    key: Option<String>,
    query_params: Vec<(String, String)>,
    headers: HeaderMap,
    body: Option<RequestBody>,
    endpoint_resolver: EndpointResolver,
}

IMPL S3RequestBuilder {
    FUNCTION new(method: HttpMethod, endpoint_resolver: EndpointResolver) -> Self
        Self {
            method,
            bucket: None,
            key: None,
            query_params: Vec::new(),
            headers: HeaderMap::new(),
            body: None,
            endpoint_resolver,
        }
    END FUNCTION

    FUNCTION bucket(mut self, bucket: impl Into<String>) -> Self
        self.bucket = Some(bucket.into())
        self
    END FUNCTION

    FUNCTION key(mut self, key: impl Into<String>) -> Self
        self.key = Some(key.into())
        self
    END FUNCTION

    FUNCTION query(mut self, key: impl Into<String>, value: impl Into<String>) -> Self
        self.query_params.push((key.into(), value.into()))
        self
    END FUNCTION

    FUNCTION query_opt(mut self, key: impl Into<String>, value: Option<impl Into<String>>) -> Self
        IF value IS Some(v) THEN
            self.query_params.push((key.into(), v.into()))
        END IF
        self
    END FUNCTION

    FUNCTION header(mut self, key: impl Into<HeaderName>, value: impl Into<HeaderValue>) -> Self
        self.headers.insert(key.into(), value.into())
        self
    END FUNCTION

    FUNCTION header_opt(mut self, key: impl Into<HeaderName>, value: Option<impl Into<HeaderValue>>) -> Self
        IF value IS Some(v) THEN
            self.headers.insert(key.into(), v.into())
        END IF
        self
    END FUNCTION

    FUNCTION content_type(mut self, content_type: impl Into<String>) -> Self
        self.headers.insert("content-type", content_type.into())
        self
    END FUNCTION

    FUNCTION content_length(mut self, length: u64) -> Self
        self.headers.insert("content-length", length.to_string())
        self
    END FUNCTION

    FUNCTION body_bytes(mut self, body: Bytes) -> Self
        self.body = Some(RequestBody::Bytes(body))
        self
    END FUNCTION

    FUNCTION body_stream(mut self, stream: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static) -> Self
        self.body = Some(RequestBody::Stream(Box::pin(stream)))
        self
    END FUNCTION

    FUNCTION body_xml<T: Serialize>(mut self, body: &T) -> Result<Self, S3Error>
        xml_string <- quick_xml::se::to_string(body)
            .map_err(|e| S3Error::Request(RequestError::SerializationError {
                message: e.to_string()
            }))?

        self.headers.insert("content-type", "application/xml")
        self.body = Some(RequestBody::Bytes(Bytes::from(xml_string)))
        Ok(self)
    END FUNCTION

    FUNCTION storage_class(self, class: StorageClass) -> Self
        self.header("x-amz-storage-class", class.as_str())
    END FUNCTION

    FUNCTION server_side_encryption(self, sse: ServerSideEncryption) -> Self
        self.header("x-amz-server-side-encryption", sse.as_str())
    END FUNCTION

    FUNCTION sse_kms_key_id(self, key_id: impl Into<String>) -> Self
        self.header("x-amz-server-side-encryption-aws-kms-key-id", key_id.into())
    END FUNCTION

    FUNCTION metadata(mut self, metadata: &HashMap<String, String>) -> Self
        FOR (key, value) IN metadata.iter() DO
            header_name <- format!("x-amz-meta-{}", key)
            self.headers.insert(header_name, value.clone())
        END FOR
        self
    END FUNCTION

    FUNCTION acl(self, acl: CannedAcl) -> Self
        self.header("x-amz-acl", acl.as_str())
    END FUNCTION

    FUNCTION tagging(self, tags: impl Into<String>) -> Self
        self.header("x-amz-tagging", tags.into())
    END FUNCTION

    FUNCTION copy_source(self, bucket: &str, key: &str, version_id: Option<&str>) -> Self
        source <- IF version_id IS Some(vid) THEN
            format!("/{}/{}?versionId={}", bucket, key, vid)
        ELSE
            format!("/{}/{}", bucket, key)
        END IF
        self.header("x-amz-copy-source", source)
    END FUNCTION

    FUNCTION build(self) -> HttpRequest
        // Resolve URL
        mut url <- self.endpoint_resolver.resolve_endpoint(
            self.bucket.as_deref(),
            self.key.as_deref()
        )

        // Add query parameters
        IF NOT self.query_params.is_empty() THEN
            mut query <- url.query_pairs_mut()
            FOR (key, value) IN self.query_params DO
                query.append_pair(&key, &value)
            END FOR
        END IF

        HttpRequest {
            method: self.method,
            url,
            headers: self.headers,
            body: self.body,
            timeout: None,
        }
    END FUNCTION
}
```

### 7.2 Common Request Builders

```pseudocode
// PUT Object request builder
FUNCTION build_put_object_request(
    config: &S3Config,
    request: &PutObjectRequest
) -> Result<(HttpRequest, String), S3Error>
    // Validate input
    validate_bucket_name(&request.bucket)?
    validate_object_key(&request.key)?

    // Calculate payload hash
    payload_hash <- calculate_payload_hash(Some(&request.body))

    // Build request
    builder <- S3RequestBuilder::new(HttpMethod::PUT, EndpointResolver::from(config))
        .bucket(&request.bucket)
        .key(&request.key)
        .content_length(request.body.len() as u64)
        .body_bytes(Bytes::from(request.body.clone()))

    // Add optional headers
    builder <- builder
        .header_opt("content-type", request.content_type.as_ref())
        .header_opt("content-encoding", request.content_encoding.as_ref())
        .header_opt("content-disposition", request.content_disposition.as_ref())
        .header_opt("content-language", request.content_language.as_ref())
        .header_opt("cache-control", request.cache_control.as_ref())
        .header_opt("content-md5", request.content_md5.as_ref())

    // Add storage class
    IF request.storage_class IS Some(class) THEN
        builder <- builder.storage_class(class)
    END IF

    // Add encryption
    IF request.server_side_encryption IS Some(sse) THEN
        builder <- builder.server_side_encryption(sse)
        IF request.sse_kms_key_id IS Some(key_id) THEN
            builder <- builder.sse_kms_key_id(key_id)
        END IF
    END IF

    // Add metadata
    IF request.metadata IS Some(meta) THEN
        builder <- builder.metadata(meta)
    END IF

    // Add ACL
    IF request.acl IS Some(acl) THEN
        builder <- builder.acl(acl)
    END IF

    // Add tagging
    IF request.tagging IS Some(tags) THEN
        builder <- builder.tagging(tags)
    END IF

    // Add checksum
    IF request.checksum_algorithm IS Some(algo) THEN
        builder <- builder.header("x-amz-sdk-checksum-algorithm", algo.as_str())
        IF request.checksum_value IS Some(value) THEN
            header_name <- format!("x-amz-checksum-{}", algo.as_str().to_lowercase())
            builder <- builder.header(header_name, value)
        END IF
    END IF

    Ok((builder.build(), payload_hash))
END FUNCTION

// GET Object request builder
FUNCTION build_get_object_request(
    config: &S3Config,
    request: &GetObjectRequest
) -> HttpRequest
    builder <- S3RequestBuilder::new(HttpMethod::GET, EndpointResolver::from(config))
        .bucket(&request.bucket)
        .key(&request.key)

    // Add optional query parameters
    builder <- builder
        .query_opt("versionId", request.version_id.as_ref())
        .query_opt("response-content-type", request.response_content_type.as_ref())
        .query_opt("response-content-disposition", request.response_content_disposition.as_ref())
        .query_opt("response-content-encoding", request.response_content_encoding.as_ref())
        .query_opt("response-content-language", request.response_content_language.as_ref())
        .query_opt("response-cache-control", request.response_cache_control.as_ref())
        .query_opt("response-expires", request.response_expires.as_ref())

    // Add conditional headers
    builder <- builder
        .header_opt("range", request.range.as_ref())
        .header_opt("if-match", request.if_match.as_ref())
        .header_opt("if-none-match", request.if_none_match.as_ref())

    IF request.if_modified_since IS Some(date) THEN
        builder <- builder.header("if-modified-since", date.to_rfc2822())
    END IF

    IF request.if_unmodified_since IS Some(date) THEN
        builder <- builder.header("if-unmodified-since", date.to_rfc2822())
    END IF

    builder.build()
END FUNCTION

// DELETE Objects (batch) request builder
FUNCTION build_delete_objects_request(
    config: &S3Config,
    request: &DeleteObjectsRequest
) -> Result<(HttpRequest, String), S3Error>
    // Build XML body
    delete_xml <- DeleteXml {
        quiet: request.quiet.unwrap_or(false),
        objects: request.objects.iter().map(|o| DeleteObjectXml {
            key: o.key.clone(),
            version_id: o.version_id.clone(),
        }).collect(),
    }

    xml_body <- quick_xml::se::to_string(&delete_xml)?
    payload_hash <- calculate_payload_hash(Some(xml_body.as_bytes()))

    // Calculate content MD5 (required for delete)
    content_md5 <- base64::encode(md5::compute(xml_body.as_bytes()).as_ref())

    builder <- S3RequestBuilder::new(HttpMethod::POST, EndpointResolver::from(config))
        .bucket(&request.bucket)
        .query("delete", "")
        .content_type("application/xml")
        .header("content-md5", content_md5)
        .body_bytes(Bytes::from(xml_body))

    Ok((builder.build(), payload_hash))
END FUNCTION
```

---

## 8. Response Parser

### 8.1 XML Response Parser

```pseudocode
STRUCT S3ResponseParser;

IMPL S3ResponseParser {
    FUNCTION parse_error_response(body: &[u8]) -> S3Error
        // Try to parse XML error response
        MATCH quick_xml::de::from_reader::<_, ErrorResponse>(body) {
            Ok(error_response) => {
                map_s3_error_code(
                    &error_response.code,
                    &error_response.message,
                    error_response.request_id,
                    error_response.resource,
                )
            },
            Err(_) => {
                // Fallback if XML parsing fails
                S3Error::Response(ResponseError::InvalidResponse {
                    message: String::from_utf8_lossy(body).to_string()
                })
            }
        }
    END FUNCTION

    FUNCTION parse_list_objects_response(body: &[u8]) -> Result<ListObjectsV2Output, S3Error>
        response: ListBucketResult <- quick_xml::de::from_reader(body)
            .map_err(|e| S3Error::Response(ResponseError::XmlParseError {
                message: e.to_string()
            }))?

        Ok(ListObjectsV2Output {
            is_truncated: response.is_truncated,
            contents: response.contents.into_iter().map(|c| S3Object {
                key: c.key,
                last_modified: parse_s3_timestamp(&c.last_modified)?,
                e_tag: c.e_tag.trim_matches('"').to_string(),
                size: c.size,
                storage_class: StorageClass::from_str(&c.storage_class)?,
                owner: c.owner.map(|o| Owner {
                    id: o.id,
                    display_name: o.display_name,
                }),
                checksum_algorithm: c.checksum_algorithm,
            }).collect(),
            common_prefixes: response.common_prefixes.into_iter().map(|p| CommonPrefix {
                prefix: p.prefix,
            }).collect(),
            name: response.name,
            prefix: response.prefix,
            delimiter: response.delimiter,
            max_keys: response.max_keys,
            key_count: response.key_count,
            continuation_token: response.continuation_token,
            next_continuation_token: response.next_continuation_token,
            start_after: response.start_after,
            encoding_type: response.encoding_type,
        })
    END FUNCTION

    FUNCTION parse_list_buckets_response(body: &[u8]) -> Result<ListBucketsOutput, S3Error>
        response: ListAllMyBucketsResult <- quick_xml::de::from_reader(body)?

        Ok(ListBucketsOutput {
            buckets: response.buckets.bucket.into_iter().map(|b| Bucket {
                name: b.name,
                creation_date: parse_s3_timestamp(&b.creation_date)?,
            }).collect(),
            owner: Owner {
                id: response.owner.id,
                display_name: response.owner.display_name,
            },
        })
    END FUNCTION

    FUNCTION parse_create_multipart_upload_response(body: &[u8]) -> Result<CreateMultipartUploadOutput, S3Error>
        response: InitiateMultipartUploadResult <- quick_xml::de::from_reader(body)?

        Ok(CreateMultipartUploadOutput {
            bucket: response.bucket,
            key: response.key,
            upload_id: response.upload_id,
        })
    END FUNCTION

    FUNCTION parse_complete_multipart_upload_response(body: &[u8]) -> Result<CompleteMultipartUploadOutput, S3Error>
        response: CompleteMultipartUploadResult <- quick_xml::de::from_reader(body)?

        Ok(CompleteMultipartUploadOutput {
            location: response.location,
            bucket: response.bucket,
            key: response.key,
            e_tag: response.e_tag.trim_matches('"').to_string(),
        })
    END FUNCTION

    FUNCTION parse_list_parts_response(body: &[u8]) -> Result<ListPartsOutput, S3Error>
        response: ListPartsResult <- quick_xml::de::from_reader(body)?

        Ok(ListPartsOutput {
            bucket: response.bucket,
            key: response.key,
            upload_id: response.upload_id,
            parts: response.parts.into_iter().map(|p| Part {
                part_number: p.part_number,
                last_modified: parse_s3_timestamp(&p.last_modified)?,
                e_tag: p.e_tag.trim_matches('"').to_string(),
                size: p.size,
            }).collect(),
            is_truncated: response.is_truncated,
            next_part_number_marker: response.next_part_number_marker,
            max_parts: response.max_parts,
            storage_class: StorageClass::from_str(&response.storage_class)?,
        })
    END FUNCTION

    FUNCTION parse_delete_objects_response(body: &[u8]) -> Result<DeleteObjectsOutput, S3Error>
        response: DeleteResult <- quick_xml::de::from_reader(body)?

        Ok(DeleteObjectsOutput {
            deleted: response.deleted.into_iter().map(|d| DeletedObject {
                key: d.key,
                version_id: d.version_id,
                delete_marker: d.delete_marker,
                delete_marker_version_id: d.delete_marker_version_id,
            }).collect(),
            errors: response.errors.into_iter().map(|e| DeleteError {
                key: e.key,
                version_id: e.version_id,
                code: e.code,
                message: e.message,
            }).collect(),
        })
    END FUNCTION

    FUNCTION parse_copy_object_response(body: &[u8]) -> Result<CopyObjectOutput, S3Error>
        response: CopyObjectResult <- quick_xml::de::from_reader(body)?

        Ok(CopyObjectOutput {
            e_tag: response.e_tag.trim_matches('"').to_string(),
            last_modified: parse_s3_timestamp(&response.last_modified)?,
        })
    END FUNCTION

    FUNCTION parse_get_object_tagging_response(body: &[u8]) -> Result<GetObjectTaggingOutput, S3Error>
        response: Tagging <- quick_xml::de::from_reader(body)?

        Ok(GetObjectTaggingOutput {
            tag_set: response.tag_set.tags.into_iter().map(|t| Tag {
                key: t.key,
                value: t.value,
            }).collect(),
        })
    END FUNCTION
}

FUNCTION parse_s3_timestamp(timestamp: &str) -> Result<DateTime<Utc>, S3Error>
    DateTime::parse_from_rfc3339(timestamp)
        .or_else(|_| DateTime::parse_from_str(timestamp, "%Y-%m-%dT%H:%M:%S%.fZ"))
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| S3Error::Response(ResponseError::InvalidTimestamp {
            value: timestamp.to_string(),
            source: e.to_string(),
        }))
END FUNCTION
```

### 8.2 Header Response Parser

```pseudocode
IMPL S3ResponseParser {
    FUNCTION parse_put_object_headers(headers: &HeaderMap) -> PutObjectOutput
        PutObjectOutput {
            e_tag: headers.get("etag")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim_matches('"').to_string())
                .unwrap_or_default(),
            version_id: headers.get("x-amz-version-id")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            expiration: headers.get("x-amz-expiration")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            server_side_encryption: headers.get("x-amz-server-side-encryption")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| ServerSideEncryption::from_str(s).ok()),
            sse_kms_key_id: headers.get("x-amz-server-side-encryption-aws-kms-key-id")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            checksum_crc32: headers.get("x-amz-checksum-crc32")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            checksum_crc32c: headers.get("x-amz-checksum-crc32c")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            checksum_sha1: headers.get("x-amz-checksum-sha1")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            checksum_sha256: headers.get("x-amz-checksum-sha256")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
        }
    END FUNCTION

    FUNCTION parse_get_object_headers(headers: &HeaderMap) -> GetObjectMetadata
        GetObjectMetadata {
            content_length: headers.get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            content_type: headers.get("content-type")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            content_encoding: headers.get("content-encoding")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            content_disposition: headers.get("content-disposition")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            content_language: headers.get("content-language")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            cache_control: headers.get("cache-control")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            e_tag: headers.get("etag")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim_matches('"').to_string())
                .unwrap_or_default(),
            last_modified: headers.get("last-modified")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| DateTime::parse_from_rfc2822(s).ok())
                .map(|dt| dt.with_timezone(&Utc)),
            metadata: parse_user_metadata(headers),
            version_id: headers.get("x-amz-version-id")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            delete_marker: headers.get("x-amz-delete-marker")
                .and_then(|v| v.to_str().ok())
                .map(|s| s == "true"),
            storage_class: headers.get("x-amz-storage-class")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| StorageClass::from_str(s).ok()),
            server_side_encryption: headers.get("x-amz-server-side-encryption")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| ServerSideEncryption::from_str(s).ok()),
            content_range: headers.get("content-range")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            accept_ranges: headers.get("accept-ranges")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            expires: headers.get("expires")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| DateTime::parse_from_rfc2822(s).ok())
                .map(|dt| dt.with_timezone(&Utc)),
            restore: headers.get("x-amz-restore")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            parts_count: headers.get("x-amz-mp-parts-count")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
        }
    END FUNCTION

    FUNCTION parse_head_bucket_headers(headers: &HeaderMap) -> HeadBucketOutput
        HeadBucketOutput {
            bucket_region: headers.get("x-amz-bucket-region")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
            access_point_alias: headers.get("x-amz-access-point-alias")
                .and_then(|v| v.to_str().ok())
                .map(|s| s == "true"),
        }
    END FUNCTION

    FUNCTION extract_request_ids(headers: &HeaderMap) -> (Option<String>, Option<String>)
        request_id <- headers.get("x-amz-request-id")
            .and_then(|v| v.to_str().ok())
            .map(String::from)

        extended_request_id <- headers.get("x-amz-id-2")
            .and_then(|v| v.to_str().ok())
            .map(String::from)

        (request_id, extended_request_id)
    END FUNCTION
}

FUNCTION parse_user_metadata(headers: &HeaderMap) -> HashMap<String, String>
    mut metadata <- HashMap::new()

    FOR (name, value) IN headers.iter() DO
        name_str <- name.as_str()
        IF name_str.starts_with("x-amz-meta-") THEN
            key <- name_str.strip_prefix("x-amz-meta-").unwrap().to_string()
            IF let Ok(value_str) = value.to_str() THEN
                metadata.insert(key, value_str.to_string())
            END IF
        END IF
    END FOR

    metadata
END FUNCTION
```

---

## 9. Error Handling

### 9.1 Error Mapping

```pseudocode
FUNCTION map_s3_error_code(
    code: &str,
    message: &str,
    request_id: Option<String>,
    resource: Option<String>
) -> S3Error
    MATCH code {
        // Access errors
        "AccessDenied" => S3Error::Access(AccessError::AccessDenied {
            message: message.to_string(),
            request_id,
        }),
        "InvalidAccessKeyId" => S3Error::Access(AccessError::InvalidAccessKeyId {
            request_id,
        }),
        "SignatureDoesNotMatch" => S3Error::Access(AccessError::SignatureDoesNotMatch {
            request_id,
        }),
        "ExpiredToken" => S3Error::Access(AccessError::ExpiredToken {
            request_id,
        }),
        "AccountProblem" => S3Error::Access(AccessError::AccountProblem {
            message: message.to_string(),
            request_id,
        }),

        // Bucket errors
        "NoSuchBucket" => S3Error::Bucket(BucketError::BucketNotFound {
            bucket: resource.unwrap_or_default(),
            request_id,
        }),
        "BucketAlreadyExists" => S3Error::Bucket(BucketError::BucketAlreadyExists {
            bucket: resource.unwrap_or_default(),
        }),
        "BucketAlreadyOwnedByYou" => S3Error::Bucket(BucketError::BucketAlreadyOwnedByYou {
            bucket: resource.unwrap_or_default(),
        }),
        "BucketNotEmpty" => S3Error::Bucket(BucketError::BucketNotEmpty {
            bucket: resource.unwrap_or_default(),
        }),
        "TooManyBuckets" => S3Error::Bucket(BucketError::TooManyBuckets),

        // Object errors
        "NoSuchKey" => S3Error::Object(ObjectError::ObjectNotFound {
            bucket: extract_bucket_from_resource(&resource),
            key: extract_key_from_resource(&resource),
            request_id,
        }),
        "PreconditionFailed" => S3Error::Object(ObjectError::PreconditionFailed {
            condition: message.to_string(),
            request_id,
        }),
        "InvalidObjectState" => S3Error::Object(ObjectError::InvalidObjectState {
            state: message.to_string(),
            request_id,
        }),

        // Multipart errors
        "NoSuchUpload" => S3Error::Multipart(MultipartError::UploadNotFound {
            upload_id: resource.unwrap_or_default(),
            request_id,
        }),
        "InvalidPart" => S3Error::Multipart(MultipartError::InvalidPart {
            message: message.to_string(),
        }),
        "InvalidPartOrder" => S3Error::Multipart(MultipartError::InvalidPartOrder),
        "EntityTooSmall" => S3Error::Multipart(MultipartError::EntityTooSmall {
            minimum_size: 5 * 1024 * 1024,
        }),

        // Request errors
        "InvalidRequest" | "MalformedXML" => S3Error::Request(RequestError::ValidationError {
            message: message.to_string(),
        }),
        "InvalidBucketName" => S3Error::Request(RequestError::InvalidBucketName {
            name: resource.unwrap_or_default(),
            reason: message.to_string(),
        }),
        "EntityTooLarge" => S3Error::Request(RequestError::EntityTooLarge {
            size: 0, // Not available in error
            max_size: 5 * 1024 * 1024 * 1024,
        }),
        "MissingContentLength" => S3Error::Request(RequestError::MissingContentLength),
        "InvalidRange" => S3Error::Request(RequestError::InvalidRange {
            range: message.to_string(),
        }),

        // Server errors
        "InternalError" => S3Error::Server(ServerError::InternalError {
            message: message.to_string(),
            request_id,
        }),
        "ServiceUnavailable" => S3Error::Server(ServerError::ServiceUnavailable {
            message: message.to_string(),
            request_id,
            retry_after: None,
        }),
        "SlowDown" => S3Error::Server(ServerError::SlowDown {
            message: message.to_string(),
            request_id,
            retry_after: Some(Duration::from_secs(1)),
        }),

        // Unknown error
        _ => S3Error::Response(ResponseError::UnknownErrorCode {
            code: code.to_string(),
            message: message.to_string(),
            request_id,
        }),
    }
END FUNCTION

FUNCTION map_http_status_to_error(status: StatusCode, body: &[u8]) -> S3Error
    // Try to parse XML error first
    IF NOT body.is_empty() THEN
        RETURN S3ResponseParser::parse_error_response(body)
    END IF

    // Fall back to status code mapping
    MATCH status.as_u16() {
        301 | 307 => S3Error::Configuration(ConfigurationError::WrongRegion {
            message: "Bucket is in a different region".to_string(),
        }),
        400 => S3Error::Request(RequestError::ValidationError {
            message: "Bad request".to_string(),
        }),
        403 => S3Error::Access(AccessError::AccessDenied {
            message: "Access denied".to_string(),
            request_id: None,
        }),
        404 => S3Error::Object(ObjectError::ObjectNotFound {
            bucket: String::new(),
            key: String::new(),
            request_id: None,
        }),
        409 => S3Error::Bucket(BucketError::BucketAlreadyExists {
            bucket: String::new(),
        }),
        412 => S3Error::Object(ObjectError::PreconditionFailed {
            condition: "Precondition failed".to_string(),
            request_id: None,
        }),
        500 => S3Error::Server(ServerError::InternalError {
            message: "Internal server error".to_string(),
            request_id: None,
        }),
        503 => S3Error::Server(ServerError::ServiceUnavailable {
            message: "Service unavailable".to_string(),
            request_id: None,
            retry_after: None,
        }),
        _ => S3Error::Response(ResponseError::UnexpectedStatus {
            status: status.as_u16(),
        }),
    }
END FUNCTION
```

### 9.2 Input Validation

```pseudocode
FUNCTION validate_bucket_name(name: &str) -> Result<(), S3Error>
    // Length check: 3-63 characters
    IF name.len() < 3 OR name.len() > 63 THEN
        RETURN Err(S3Error::Request(RequestError::InvalidBucketName {
            name: name.to_string(),
            reason: "Bucket name must be 3-63 characters".to_string(),
        }))
    END IF

    // Must start with lowercase letter or number
    first_char <- name.chars().next().unwrap()
    IF NOT (first_char.is_ascii_lowercase() OR first_char.is_ascii_digit()) THEN
        RETURN Err(S3Error::Request(RequestError::InvalidBucketName {
            name: name.to_string(),
            reason: "Bucket name must start with lowercase letter or number".to_string(),
        }))
    END IF

    // Must end with lowercase letter or number
    last_char <- name.chars().last().unwrap()
    IF NOT (last_char.is_ascii_lowercase() OR last_char.is_ascii_digit()) THEN
        RETURN Err(S3Error::Request(RequestError::InvalidBucketName {
            name: name.to_string(),
            reason: "Bucket name must end with lowercase letter or number".to_string(),
        }))
    END IF

    // Only lowercase letters, numbers, hyphens, and periods
    FOR (i, c) IN name.chars().enumerate() DO
        IF NOT (c.is_ascii_lowercase() OR c.is_ascii_digit() OR c == '-' OR c == '.') THEN
            RETURN Err(S3Error::Request(RequestError::InvalidBucketName {
                name: name.to_string(),
                reason: format!("Invalid character '{}' at position {}", c, i),
            }))
        END IF
    END FOR

    // Cannot have consecutive periods
    IF name.contains("..") THEN
        RETURN Err(S3Error::Request(RequestError::InvalidBucketName {
            name: name.to_string(),
            reason: "Bucket name cannot contain consecutive periods".to_string(),
        }))
    END IF

    // Cannot be formatted like IP address
    IF looks_like_ip_address(name) THEN
        RETURN Err(S3Error::Request(RequestError::InvalidBucketName {
            name: name.to_string(),
            reason: "Bucket name cannot be formatted as IP address".to_string(),
        }))
    END IF

    Ok(())
END FUNCTION

FUNCTION validate_object_key(key: &str) -> Result<(), S3Error>
    // Length check: 1-1024 bytes
    IF key.is_empty() THEN
        RETURN Err(S3Error::Request(RequestError::InvalidObjectKey {
            key: key.to_string(),
            reason: "Object key cannot be empty".to_string(),
        }))
    END IF

    IF key.len() > 1024 THEN
        RETURN Err(S3Error::Request(RequestError::InvalidObjectKey {
            key: key.to_string(),
            reason: "Object key cannot exceed 1024 bytes".to_string(),
        }))
    END IF

    // Check for problematic characters (warn but allow)
    // S3 allows most characters but some cause issues

    Ok(())
END FUNCTION

FUNCTION validate_part_number(part_number: u32) -> Result<(), S3Error>
    IF part_number < 1 OR part_number > MAX_PARTS THEN
        RETURN Err(S3Error::Multipart(MultipartError::InvalidPartNumber {
            part_number,
            min: 1,
            max: MAX_PARTS,
        }))
    END IF

    Ok(())
END FUNCTION

FUNCTION validate_part_size(size: u64, is_last_part: bool) -> Result<(), S3Error>
    IF NOT is_last_part AND size < MIN_PART_SIZE THEN
        RETURN Err(S3Error::Multipart(MultipartError::EntityTooSmall {
            minimum_size: MIN_PART_SIZE,
        }))
    END IF

    IF size > MAX_PART_SIZE THEN
        RETURN Err(S3Error::Multipart(MultipartError::PartTooLarge {
            size,
            maximum_size: MAX_PART_SIZE,
        }))
    END IF

    Ok(())
END FUNCTION

FUNCTION looks_like_ip_address(s: &str) -> bool
    parts: Vec<&str> <- s.split('.').collect()
    IF parts.len() != 4 THEN
        RETURN false
    END IF

    parts.iter().all(|part| part.parse::<u8>().is_ok())
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 1 |

---

**End of Pseudocode Part 1**

*Part 2 will cover Object Operations, Bucket Operations, and Streaming implementations.*
*Part 3 will cover Multipart Uploads, Presigned URLs, Tagging, and High-Level Operations.*

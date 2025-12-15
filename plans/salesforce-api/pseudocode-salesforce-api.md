# Salesforce API Integration - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/salesforce_api`

---

## 1. Overview

This document provides algorithmic descriptions for implementing the Salesforce API Integration, including OAuth authentication flows, SObject CRUD operations, SOQL query execution, Bulk API 2.0 orchestration, and event streaming.

### Pseudocode Conventions

```
FUNCTION name(params) -> ReturnType
  statement
  IF condition THEN action END IF
  FOR item IN collection DO process(item) END FOR
  TRY operation() CATCH Error AS e handle(e) END TRY
  RETURN value
END FUNCTION

STRUCT Name { field: Type }
TRAIT Name { FUNCTION method(self) -> Type }
```

---

## 2. Client Initialization

### 2.1 Salesforce Client Factory

```pseudocode
STRUCT SalesforceClientImpl {
    config: SalesforceConfig,
    http_client: Arc<dyn HttpClient>,
    auth_provider: Arc<dyn AuthProvider>,
    rate_tracker: Arc<RateLimitTracker>,
    retry_executor: Arc<RetryExecutor>,
    circuit_breaker: Arc<CircuitBreaker>,
    recorder: Option<Arc<dyn SfRecorder>>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsEmitter>,
}

FUNCTION create_salesforce_client(config: SalesforceConfig) -> Result<SalesforceClient, SfError>
    // Validate configuration
    IF config.instance_url.is_empty() THEN
        RETURN Err(ConfigError::MissingInstanceUrl)
    END IF
    IF config.api_version.is_empty() THEN
        RETURN Err(ConfigError::InvalidApiVersion)
    END IF

    // Initialize shared primitives
    logger <- shared_logging::get_logger("salesforce-api")
    tracer <- shared_tracing::get_tracer("salesforce-api")
    metrics <- shared_metrics::get_emitter("salesforce-api")

    // Initialize auth provider from shared-auth
    auth_provider <- shared_auth::create_oauth_provider(
        config.client_id.clone(),
        config.credentials.clone(),
        config.instance_url.clone()
    )?

    // Initialize rate limit tracker
    rate_tracker <- RateLimitTracker::new()

    // Initialize retry executor
    retry_executor <- shared_retry::create_executor(RetryConfig {
        max_attempts: config.max_retries,
        initial_backoff: Duration::from_millis(500),
        max_backoff: Duration::from_secs(60),
        backoff_multiplier: 2.0,
        jitter_factor: 0.1,
    })

    // Initialize circuit breaker
    circuit_breaker <- shared_circuit_breaker::create(CircuitBreakerConfig {
        failure_threshold: 5,
        success_threshold: 3,
        reset_timeout: Duration::from_secs(60),
    })

    // Initialize HTTP client
    http_client <- create_http_client(HttpClientConfig {
        timeout: config.timeout,
        tls_min_version: TlsVersion::TLS_1_2,
        pool_size: 20,
    })

    logger.info("Salesforce client initialized", {
        instance_url: config.instance_url,
        api_version: config.api_version,
    })

    RETURN Ok(SalesforceClientImpl { config, http_client, auth_provider, ... })
END FUNCTION
```

### 2.2 Client Builder

```pseudocode
STRUCT SalesforceClientBuilder {
    instance_url: Option<Url>,
    api_version: Option<String>,
    client_id: Option<String>,
    credentials: Option<SalesforceCredentials>,
    timeout: Duration,
    max_retries: u32,
    track_limits: bool,
    recorder: Option<Arc<dyn SfRecorder>>,
}

IMPL SalesforceClientBuilder {
    FUNCTION new() -> Self
        Self {
            instance_url: None,
            api_version: Some("59.0".to_string()),
            client_id: None,
            credentials: None,
            timeout: Duration::from_secs(30),
            max_retries: 3,
            track_limits: true,
            recorder: None,
        }
    END FUNCTION

    FUNCTION from_env() -> Result<Self, ConfigError>
        builder <- Self::new()
        builder.instance_url = env::var("SF_INSTANCE_URL").ok().map(Url::parse).transpose()?
        builder.client_id = env::var("SF_CLIENT_ID").ok()
        // Credentials from environment
        IF env::var("SF_PRIVATE_KEY").is_ok() THEN
            builder.credentials = Some(SalesforceCredentials::JwtBearer {
                private_key: SecretString::new(env::var("SF_PRIVATE_KEY")?),
                username: env::var("SF_USERNAME")?,
            })
        ELSE IF env::var("SF_REFRESH_TOKEN").is_ok() THEN
            builder.credentials = Some(SalesforceCredentials::RefreshToken {
                refresh_token: SecretString::new(env::var("SF_REFRESH_TOKEN")?),
            })
        END IF
        RETURN Ok(builder)
    END FUNCTION

    FUNCTION with_recorder(mut self, recorder: Arc<dyn SfRecorder>) -> Self
        self.recorder = Some(recorder)
        self
    END FUNCTION

    FUNCTION build(self) -> Result<SalesforceClient, SfError>
        instance_url <- self.instance_url.ok_or(ConfigError::MissingInstanceUrl)?
        client_id <- self.client_id.ok_or(ConfigError::MissingCredentials)?
        credentials <- self.credentials.ok_or(ConfigError::MissingCredentials)?
        api_version <- self.api_version.unwrap_or("59.0".to_string())

        config <- SalesforceConfig {
            instance_url,
            api_version,
            client_id,
            credentials,
            timeout: self.timeout,
            max_retries: self.max_retries,
            track_limits: self.track_limits,
        }

        create_salesforce_client(config)
    END FUNCTION
}
```

---

## 3. OAuth Authentication

### 3.1 JWT Bearer Flow

```pseudocode
FUNCTION authenticate_jwt_bearer(
    auth_provider: &AuthProvider,
    client_id: &str,
    username: &str,
    private_key: &SecretString,
    instance_url: &Url
) -> Result<AccessToken, AuthError>
    span <- tracer.start_span("sf.auth.jwt_bearer")

    // Build JWT claims
    now <- Utc::now()
    claims <- JwtClaims {
        iss: client_id.to_string(),
        sub: username.to_string(),
        aud: get_token_endpoint(instance_url),
        exp: (now + Duration::from_secs(300)).timestamp(),
        iat: now.timestamp(),
    }

    // Sign JWT with RSA-256
    jwt <- sign_jwt_rs256(&claims, private_key)?

    // Exchange JWT for access token
    token_url <- format!("{}/services/oauth2/token", instance_url)

    form_data <- [
        ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
        ("assertion", &jwt),
    ]

    response <- http_post_form(&token_url, &form_data).await?

    IF response.status != 200 THEN
        error <- parse_oauth_error(&response.body)?
        RETURN Err(AuthError::InvalidGrant { message: error.error_description })
    END IF

    token_response <- parse_json::<TokenResponse>(&response.body)?

    RETURN Ok(AccessToken {
        token: SecretString::new(token_response.access_token),
        instance_url: token_response.instance_url.parse()?,
        expires_at: now + Duration::from_secs(token_response.expires_in.unwrap_or(7200)),
    })
END FUNCTION
```

### 3.2 Refresh Token Flow

```pseudocode
FUNCTION refresh_access_token(
    auth_provider: &AuthProvider,
    client_id: &str,
    refresh_token: &SecretString,
    instance_url: &Url
) -> Result<AccessToken, AuthError>
    span <- tracer.start_span("sf.auth.refresh")

    token_url <- format!("{}/services/oauth2/token", instance_url)

    form_data <- [
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("refresh_token", refresh_token.expose_secret()),
    ]

    response <- http_post_form(&token_url, &form_data).await?

    IF response.status != 200 THEN
        error <- parse_oauth_error(&response.body)?
        IF error.error == "invalid_grant" THEN
            RETURN Err(AuthError::RefreshFailed { message: error.error_description })
        END IF
        RETURN Err(AuthError::InvalidGrant { message: error.error_description })
    END IF

    token_response <- parse_json::<TokenResponse>(&response.body)?
    now <- Utc::now()

    RETURN Ok(AccessToken {
        token: SecretString::new(token_response.access_token),
        instance_url: token_response.instance_url.parse()?,
        expires_at: now + Duration::from_secs(token_response.expires_in.unwrap_or(7200)),
    })
END FUNCTION
```

### 3.3 Token Management

```pseudocode
STRUCT TokenManager {
    current_token: RwLock<Option<AccessToken>>,
    auth_provider: Arc<dyn AuthProvider>,
    refresh_threshold: Duration,
}

IMPL TokenManager {
    ASYNC FUNCTION get_valid_token(&self) -> Result<AccessToken, AuthError>
        // Try to get existing valid token
        token <- self.current_token.read().clone()

        IF token IS Some(t) AND NOT self.needs_refresh(&t) THEN
            RETURN Ok(t)
        END IF

        // Acquire write lock for refresh
        mut_guard <- self.current_token.write()

        // Double-check after acquiring lock
        IF mut_guard IS Some(ref t) AND NOT self.needs_refresh(t) THEN
            RETURN Ok(t.clone())
        END IF

        // Refresh token
        new_token <- self.auth_provider.authenticate().await?
        *mut_guard = Some(new_token.clone())

        logger.info("Access token refreshed", {
            expires_at: new_token.expires_at.to_rfc3339(),
        })

        RETURN Ok(new_token)
    END FUNCTION

    FUNCTION needs_refresh(&self, token: &AccessToken) -> bool
        Utc::now() + self.refresh_threshold > token.expires_at
    END FUNCTION
}
```

---

## 4. SObject Operations

### 4.1 Create Record

```pseudocode
FUNCTION create_record(
    client: &SalesforceClient,
    sobject: &str,
    record: JsonValue
) -> Result<CreateResult, SfError>
    span <- tracer.start_span("sf.sobjects.create", {
        sf.sobject: sobject,
    })

    TRY
        // Build URL
        url <- format!("{}/services/data/v{}/sobjects/{}/",
            client.config.instance_url,
            client.config.api_version,
            sobject
        )

        // Build request
        request <- HttpRequest {
            method: POST,
            url: url.parse()?,
            headers: build_auth_headers(client).await?,
            body: Some(serde_json::to_vec(&record)?),
        }
        request.headers.insert("content-type", "application/json")

        // Execute with resilience
        response <- execute_with_resilience(client, request).await?

        // Check for errors
        IF response.status == 201 THEN
            result <- parse_json::<CreateResponse>(&response.body)?

            metrics.increment("sf_requests_total", {
                operation: "create",
                sobject: sobject,
                status: "success",
            })

            RETURN Ok(CreateResult {
                id: result.id,
                success: result.success,
            })
        ELSE
            error <- parse_sf_error(&response.body)?
            RETURN Err(map_sf_error(error))
        END IF

    CATCH error
        span.set_status(Error)
        metrics.increment("sf_errors_total", {
            operation: "create",
            sobject: sobject,
            error_code: error.code(),
        })
        RETURN Err(error)
    END TRY
END FUNCTION
```

### 4.2 Get Record

```pseudocode
FUNCTION get_record(
    client: &SalesforceClient,
    sobject: &str,
    id: &str,
    fields: Option<&[&str]>
) -> Result<JsonValue, SfError>
    span <- tracer.start_span("sf.sobjects.get", {
        sf.sobject: sobject,
        sf.record_id: id,
    })

    // Build URL with optional fields
    url <- format!("{}/services/data/v{}/sobjects/{}/{}",
        client.config.instance_url,
        client.config.api_version,
        sobject,
        id
    )

    IF fields IS Some(f) THEN
        url = format!("{}?fields={}", url, f.join(","))
    END IF

    request <- HttpRequest {
        method: GET,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: None,
    }

    response <- execute_with_resilience(client, request).await?

    IF response.status == 200 THEN
        record <- parse_json::<JsonValue>(&response.body)?
        RETURN Ok(record)
    ELSE IF response.status == 404 THEN
        RETURN Err(SfError::Api(ApiError::NotFound { sobject, id }))
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 4.3 Update Record

```pseudocode
FUNCTION update_record(
    client: &SalesforceClient,
    sobject: &str,
    id: &str,
    record: JsonValue
) -> Result<(), SfError>
    span <- tracer.start_span("sf.sobjects.update", {
        sf.sobject: sobject,
        sf.record_id: id,
    })

    url <- format!("{}/services/data/v{}/sobjects/{}/{}",
        client.config.instance_url,
        client.config.api_version,
        sobject,
        id
    )

    request <- HttpRequest {
        method: PATCH,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: Some(serde_json::to_vec(&record)?),
    }
    request.headers.insert("content-type", "application/json")

    response <- execute_with_resilience(client, request).await?

    IF response.status == 204 THEN
        metrics.increment("sf_requests_total", {
            operation: "update",
            sobject: sobject,
            status: "success",
        })
        RETURN Ok(())
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 4.4 Upsert Record

```pseudocode
FUNCTION upsert_record(
    client: &SalesforceClient,
    sobject: &str,
    ext_id_field: &str,
    ext_id: &str,
    record: JsonValue
) -> Result<UpsertResult, SfError>
    span <- tracer.start_span("sf.sobjects.upsert", {
        sf.sobject: sobject,
        sf.ext_id_field: ext_id_field,
    })

    url <- format!("{}/services/data/v{}/sobjects/{}/{}/{}",
        client.config.instance_url,
        client.config.api_version,
        sobject,
        ext_id_field,
        uri_encode(ext_id)
    )

    request <- HttpRequest {
        method: PATCH,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: Some(serde_json::to_vec(&record)?),
    }
    request.headers.insert("content-type", "application/json")

    response <- execute_with_resilience(client, request).await?

    // 201 = created, 204 = updated
    IF response.status == 201 THEN
        result <- parse_json::<CreateResponse>(&response.body)?
        RETURN Ok(UpsertResult { id: result.id, created: true })
    ELSE IF response.status == 204 THEN
        RETURN Ok(UpsertResult { id: ext_id.to_string(), created: false })
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 4.5 Delete Record

```pseudocode
FUNCTION delete_record(
    client: &SalesforceClient,
    sobject: &str,
    id: &str
) -> Result<(), SfError>
    span <- tracer.start_span("sf.sobjects.delete", {
        sf.sobject: sobject,
        sf.record_id: id,
    })

    url <- format!("{}/services/data/v{}/sobjects/{}/{}",
        client.config.instance_url,
        client.config.api_version,
        sobject,
        id
    )

    request <- HttpRequest {
        method: DELETE,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: None,
    }

    response <- execute_with_resilience(client, request).await?

    IF response.status == 204 THEN
        metrics.increment("sf_requests_total", {
            operation: "delete",
            sobject: sobject,
            status: "success",
        })
        RETURN Ok(())
    ELSE IF response.status == 404 THEN
        RETURN Err(SfError::Api(ApiError::NotFound { sobject, id }))
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 4.6 Composite Request

```pseudocode
STRUCT CompositeRequest {
    method: HttpMethod,
    url: String,
    reference_id: String,
    body: Option<JsonValue>,
}

FUNCTION composite_request(
    client: &SalesforceClient,
    requests: Vec<CompositeRequest>
) -> Result<CompositeResponse, SfError>
    span <- tracer.start_span("sf.composite", {
        count: requests.len(),
    })

    // Validate max 25 subrequests
    IF requests.len() > 25 THEN
        RETURN Err(SfError::Request(RequestError::TooManySubrequests))
    END IF

    url <- format!("{}/services/data/v{}/composite",
        client.config.instance_url,
        client.config.api_version
    )

    // Build composite body
    body <- json!({
        "allOrNone": false,
        "compositeRequest": requests.iter().map(|r| {
            json!({
                "method": r.method.to_string(),
                "url": format!("/services/data/v{}/{}", client.config.api_version, r.url),
                "referenceId": r.reference_id,
                "body": r.body,
            })
        }).collect::<Vec<_>>()
    })

    request <- HttpRequest {
        method: POST,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: Some(serde_json::to_vec(&body)?),
    }
    request.headers.insert("content-type", "application/json")

    response <- execute_with_resilience(client, request).await?

    IF response.status == 200 THEN
        result <- parse_json::<CompositeResponseBody>(&response.body)?
        RETURN Ok(CompositeResponse {
            results: result.composite_response,
        })
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

---

## 5. SOQL Query Operations

### 5.1 Execute Query

```pseudocode
FUNCTION query(
    client: &SalesforceClient,
    soql: &str
) -> Result<QueryResult, SfError>
    span <- tracer.start_span("sf.query", {
        sf.query: sanitize_soql(soql),
    })

    TRY
        // URL-encode SOQL
        encoded_soql <- uri_encode(soql)
        url <- format!("{}/services/data/v{}/query?q={}",
            client.config.instance_url,
            client.config.api_version,
            encoded_soql
        )

        request <- HttpRequest {
            method: GET,
            url: url.parse()?,
            headers: build_auth_headers(client).await?,
            body: None,
        }

        response <- execute_with_resilience(client, request).await?

        IF response.status == 200 THEN
            result <- parse_json::<QueryResponseBody>(&response.body)?

            metrics.increment("sf_records_processed_total", {
                operation: "query",
            })
            metrics.observe("sf_query_records_count", result.total_size as f64, {})

            RETURN Ok(QueryResult {
                total_size: result.total_size,
                done: result.done,
                records: result.records,
                next_records_url: result.next_records_url,
            })
        ELSE IF response.status == 400 THEN
            error <- parse_sf_error(&response.body)?
            // Map to query-specific errors
            IF error.error_code == "MALFORMED_QUERY" THEN
                RETURN Err(SfError::Query(QueryError::MalformedQuery { message: error.message }))
            ELSE IF error.error_code == "INVALID_FIELD" THEN
                RETURN Err(SfError::Query(QueryError::InvalidField { message: error.message }))
            END IF
            RETURN Err(map_sf_error(error))
        ELSE
            error <- parse_sf_error(&response.body)?
            RETURN Err(map_sf_error(error))
        END IF

    CATCH error
        span.set_status(Error)
        RETURN Err(error)
    END TRY
END FUNCTION
```

### 5.2 Query More (Pagination)

```pseudocode
FUNCTION query_more(
    client: &SalesforceClient,
    next_url: &str
) -> Result<QueryResult, SfError>
    span <- tracer.start_span("sf.query_more")

    // next_url is a relative URL like "/services/data/v59.0/query/01g..."
    url <- format!("{}{}", client.config.instance_url, next_url)

    request <- HttpRequest {
        method: GET,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: None,
    }

    response <- execute_with_resilience(client, request).await?

    IF response.status == 200 THEN
        result <- parse_json::<QueryResponseBody>(&response.body)?
        RETURN Ok(QueryResult {
            total_size: result.total_size,
            done: result.done,
            records: result.records,
            next_records_url: result.next_records_url,
        })
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 5.3 Query All (Streaming Iterator)

```pseudocode
FUNCTION query_all(
    client: &SalesforceClient,
    soql: &str
) -> impl Stream<Item = Result<JsonValue, SfError>>
    async_stream::stream! {
        // Execute initial query
        result <- query(client, soql).await?

        // Yield initial records
        FOR record IN result.records DO
            yield Ok(record)
        END FOR

        // Follow pagination
        next_url <- result.next_records_url

        WHILE next_url IS Some(url) DO
            next_result <- query_more(client, &url).await?

            FOR record IN next_result.records DO
                yield Ok(record)
            END FOR

            next_url = next_result.next_records_url
        END WHILE
    }
END FUNCTION
```

### 5.4 Explain Query

```pseudocode
FUNCTION explain_query(
    client: &SalesforceClient,
    soql: &str
) -> Result<ExplainResult, SfError>
    span <- tracer.start_span("sf.query.explain")

    encoded_soql <- uri_encode(soql)
    url <- format!("{}/services/data/v{}/query?explain={}",
        client.config.instance_url,
        client.config.api_version,
        encoded_soql
    )

    request <- HttpRequest {
        method: GET,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: None,
    }

    response <- execute_with_resilience(client, request).await?

    IF response.status == 200 THEN
        result <- parse_json::<ExplainResponseBody>(&response.body)?
        RETURN Ok(ExplainResult {
            plans: result.plans,
            source_query: soql.to_string(),
        })
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

---

## 6. Bulk API 2.0

### 6.1 Create Bulk Job

```pseudocode
STRUCT CreateJobRequest {
    object: String,
    operation: BulkOperation,  // insert, update, upsert, delete
    external_id_field: Option<String>,
    line_ending: Option<LineEnding>,
    column_delimiter: Option<ColumnDelimiter>,
}

FUNCTION create_bulk_job(
    client: &SalesforceClient,
    request: CreateJobRequest
) -> Result<BulkJob, SfError>
    span <- tracer.start_span("sf.bulk.create_job", {
        sf.sobject: request.object,
        sf.operation: request.operation.to_string(),
    })

    url <- format!("{}/services/data/v{}/jobs/ingest",
        client.config.instance_url,
        client.config.api_version
    )

    body <- json!({
        "object": request.object,
        "operation": request.operation.to_string().to_lowercase(),
        "externalIdFieldName": request.external_id_field,
        "lineEnding": request.line_ending.map(|l| l.to_string()),
        "columnDelimiter": request.column_delimiter.map(|c| c.to_string()),
    })

    http_request <- HttpRequest {
        method: POST,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: Some(serde_json::to_vec(&body)?),
    }
    http_request.headers.insert("content-type", "application/json")

    response <- execute_with_resilience(client, http_request).await?

    IF response.status == 200 OR response.status == 201 THEN
        job <- parse_json::<BulkJobResponse>(&response.body)?

        logger.info("Bulk job created", {
            job_id: job.id,
            object: request.object,
            operation: request.operation.to_string(),
        })

        RETURN Ok(BulkJob {
            id: job.id,
            state: BulkJobState::Open,
            object: job.object,
            operation: request.operation,
            created_date: job.created_date,
            content_url: job.content_url,
        })
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 6.2 Upload Job Data

```pseudocode
FUNCTION upload_job_data(
    client: &SalesforceClient,
    job_id: &str,
    data: impl AsyncRead + Send
) -> Result<(), SfError>
    span <- tracer.start_span("sf.bulk.upload_data", {
        sf.job_id: job_id,
    })

    url <- format!("{}/services/data/v{}/jobs/ingest/{}/batches",
        client.config.instance_url,
        client.config.api_version,
        job_id
    )

    // Stream CSV data
    body <- read_to_bytes(data).await?

    http_request <- HttpRequest {
        method: PUT,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: Some(body),
    }
    http_request.headers.insert("content-type", "text/csv")

    response <- execute_with_resilience(client, http_request).await?

    IF response.status == 201 THEN
        metrics.observe("sf_bulk_bytes_uploaded", body.len() as f64, {
            job_id: job_id,
        })
        RETURN Ok(())
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 6.3 Close Job

```pseudocode
FUNCTION close_bulk_job(
    client: &SalesforceClient,
    job_id: &str
) -> Result<BulkJob, SfError>
    span <- tracer.start_span("sf.bulk.close_job", {
        sf.job_id: job_id,
    })

    url <- format!("{}/services/data/v{}/jobs/ingest/{}",
        client.config.instance_url,
        client.config.api_version,
        job_id
    )

    body <- json!({ "state": "UploadComplete" })

    http_request <- HttpRequest {
        method: PATCH,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: Some(serde_json::to_vec(&body)?),
    }
    http_request.headers.insert("content-type", "application/json")

    response <- execute_with_resilience(client, http_request).await?

    IF response.status == 200 THEN
        job <- parse_json::<BulkJobResponse>(&response.body)?
        RETURN Ok(map_bulk_job_response(job))
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 6.4 Get Job Status

```pseudocode
FUNCTION get_bulk_job(
    client: &SalesforceClient,
    job_id: &str
) -> Result<BulkJob, SfError>
    span <- tracer.start_span("sf.bulk.get_job", {
        sf.job_id: job_id,
    })

    url <- format!("{}/services/data/v{}/jobs/ingest/{}",
        client.config.instance_url,
        client.config.api_version,
        job_id
    )

    http_request <- HttpRequest {
        method: GET,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: None,
    }

    response <- execute_with_resilience(client, http_request).await?

    IF response.status == 200 THEN
        job <- parse_json::<BulkJobResponse>(&response.body)?

        metrics.gauge("sf_bulk_job_records", {
            job_id: job_id,
            processed: job.number_records_processed,
            failed: job.number_records_failed,
        })

        RETURN Ok(map_bulk_job_response(job))
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 6.5 Get Job Results

```pseudocode
FUNCTION get_successful_results(
    client: &SalesforceClient,
    job_id: &str
) -> Result<impl AsyncRead, SfError>
    span <- tracer.start_span("sf.bulk.get_successful_results")

    url <- format!("{}/services/data/v{}/jobs/ingest/{}/successfulResults",
        client.config.instance_url,
        client.config.api_version,
        job_id
    )

    http_request <- HttpRequest {
        method: GET,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: None,
    }

    response <- client.http_client.send_streaming(http_request).await?

    IF response.status == 200 THEN
        RETURN Ok(response.body)
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION

FUNCTION get_failed_results(
    client: &SalesforceClient,
    job_id: &str
) -> Result<impl AsyncRead, SfError>
    url <- format!("{}/services/data/v{}/jobs/ingest/{}/failedResults",
        client.config.instance_url,
        client.config.api_version,
        job_id
    )

    // Same pattern as successful results
    // ...
END FUNCTION
```

### 6.6 High-Level Bulk Orchestration

```pseudocode
FUNCTION execute_bulk_operation(
    client: &SalesforceClient,
    object: &str,
    operation: BulkOperation,
    data: impl AsyncRead + Send,
    options: BulkOptions
) -> Result<BulkResult, SfError>
    span <- tracer.start_span("sf.bulk.execute", {
        sf.sobject: object,
        sf.operation: operation.to_string(),
    })

    TRY
        // Step 1: Create job
        job <- create_bulk_job(client, CreateJobRequest {
            object: object.to_string(),
            operation: operation,
            external_id_field: options.external_id_field,
            line_ending: options.line_ending,
            column_delimiter: options.column_delimiter,
        }).await?

        // Step 2: Upload data
        upload_job_data(client, &job.id, data).await?

        // Step 3: Close job to start processing
        close_bulk_job(client, &job.id).await?

        // Step 4: Poll for completion
        final_job <- poll_job_completion(client, &job.id, options.poll_interval, options.timeout).await?

        // Step 5: Collect results
        result <- BulkResult {
            job_id: final_job.id,
            state: final_job.state,
            records_processed: final_job.number_records_processed,
            records_failed: final_job.number_records_failed,
        }

        IF final_job.state == BulkJobState::Failed THEN
            RETURN Err(SfError::Bulk(BulkError::JobFailed { job_id: final_job.id }))
        END IF

        RETURN Ok(result)

    CATCH error
        // Attempt to abort job on failure
        IF job IS Some(j) THEN
            abort_bulk_job(client, &j.id).await.ok()
        END IF
        RETURN Err(error)
    END TRY
END FUNCTION

FUNCTION poll_job_completion(
    client: &SalesforceClient,
    job_id: &str,
    poll_interval: Duration,
    timeout: Duration
) -> Result<BulkJob, SfError>
    start_time <- Instant::now()

    LOOP
        job <- get_bulk_job(client, job_id).await?

        MATCH job.state {
            BulkJobState::JobComplete => RETURN Ok(job),
            BulkJobState::Failed => RETURN Ok(job),
            BulkJobState::Aborted => RETURN Err(SfError::Bulk(BulkError::JobAborted { job_id })),
            _ => {
                IF start_time.elapsed() > timeout THEN
                    RETURN Err(SfError::Bulk(BulkError::Timeout { job_id }))
                END IF
                tokio::time::sleep(poll_interval).await
            }
        }
    END LOOP
END FUNCTION
```

---

## 7. Event Handling

### 7.1 Publish Platform Event

```pseudocode
FUNCTION publish_event(
    client: &SalesforceClient,
    event_name: &str,
    payload: JsonValue
) -> Result<PublishResult, SfError>
    span <- tracer.start_span("sf.events.publish", {
        sf.event_name: event_name,
    })

    // Event API name format: EventName__e
    event_api_name <- IF event_name.ends_with("__e") THEN
        event_name.to_string()
    ELSE
        format!("{}__e", event_name)
    END IF

    url <- format!("{}/services/data/v{}/sobjects/{}",
        client.config.instance_url,
        client.config.api_version,
        event_api_name
    )

    http_request <- HttpRequest {
        method: POST,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: Some(serde_json::to_vec(&payload)?),
    }
    http_request.headers.insert("content-type", "application/json")

    response <- execute_with_resilience(client, http_request).await?

    IF response.status == 201 THEN
        result <- parse_json::<CreateResponse>(&response.body)?

        metrics.increment("sf_events_published_total", {
            event_name: event_name,
        })

        RETURN Ok(PublishResult {
            id: result.id,
            success: result.success,
        })
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

### 7.2 Pub/Sub API Subscription

```pseudocode
STRUCT PubSubClient {
    grpc_client: PubSubServiceClient,
    access_token: Arc<TokenManager>,
    instance_url: Url,
    tenant_id: String,
}

FUNCTION subscribe_pubsub(
    client: &PubSubClient,
    topic: &str,
    replay_preset: ReplayPreset,
    num_requested: i32
) -> impl Stream<Item = Result<EventMessage, SfError>>
    async_stream::stream! {
        span <- tracer.start_span("sf.pubsub.subscribe", {
            sf.topic: topic,
        })

        // Build topic name
        topic_name <- format!("/event/{}", topic)

        // Create subscription request
        request <- FetchRequest {
            topic_name: topic_name.clone(),
            replay_preset: replay_preset.into(),
            num_requested: num_requested,
        }

        // Get auth metadata
        token <- client.access_token.get_valid_token().await?
        metadata <- build_grpc_metadata(&token, &client.instance_url, &client.tenant_id)?

        // Start streaming
        stream <- client.grpc_client
            .subscribe(request)
            .metadata(metadata)
            .await?

        WHILE LET Some(response) = stream.next().await DO
            MATCH response {
                Ok(fetch_response) => {
                    FOR event IN fetch_response.events DO
                        decoded <- decode_avro_event(&event.event.payload, &fetch_response.schema_id)?

                        metrics.increment("sf_events_received_total", {
                            topic: topic,
                        })

                        yield Ok(EventMessage {
                            replay_id: event.replay_id,
                            payload: decoded,
                            schema_id: fetch_response.schema_id.clone(),
                            event_uuid: event.event.id.clone(),
                        })
                    END FOR
                },
                Err(status) => {
                    yield Err(SfError::Event(EventError::SubscriptionFailed {
                        message: status.message().to_string(),
                    }))
                }
            }
        END WHILE
    }
END FUNCTION
```

### 7.3 Change Data Capture Subscription

```pseudocode
FUNCTION subscribe_cdc(
    client: &PubSubClient,
    objects: &[&str]
) -> impl Stream<Item = Result<CdcEvent, SfError>>
    async_stream::stream! {
        // Subscribe to CDC channel
        topic <- "/data/ChangeEvents"

        stream <- subscribe_pubsub(client, topic, ReplayPreset::Latest, 100)

        WHILE LET Some(result) = stream.next().await DO
            MATCH result {
                Ok(event) => {
                    // Parse CDC payload
                    cdc_payload <- parse_cdc_payload(&event.payload)?

                    // Filter by requested objects
                    IF objects.is_empty() OR objects.contains(&cdc_payload.entity_name.as_str()) THEN
                        yield Ok(CdcEvent {
                            replay_id: event.replay_id,
                            change_type: cdc_payload.change_type,
                            entity_name: cdc_payload.entity_name,
                            record_ids: cdc_payload.record_ids,
                            changed_fields: cdc_payload.changed_fields,
                            change_origin: cdc_payload.change_origin,
                        })
                    END IF
                },
                Err(e) => yield Err(e),
            }
        END WHILE
    }
END FUNCTION
```

---

## 8. Limits API

### 8.1 Get Org Limits

```pseudocode
FUNCTION get_limits(
    client: &SalesforceClient
) -> Result<OrgLimits, SfError>
    span <- tracer.start_span("sf.limits.get")

    url <- format!("{}/services/data/v{}/limits",
        client.config.instance_url,
        client.config.api_version
    )

    http_request <- HttpRequest {
        method: GET,
        url: url.parse()?,
        headers: build_auth_headers(client).await?,
        body: None,
    }

    response <- execute_with_resilience(client, http_request).await?

    IF response.status == 200 THEN
        limits <- parse_json::<HashMap<String, LimitInfo>>(&response.body)?

        // Update rate tracker
        IF client.config.track_limits THEN
            IF limits.contains_key("DailyApiRequests") THEN
                daily <- limits.get("DailyApiRequests").unwrap()
                client.rate_tracker.update_daily(daily.max, daily.remaining)
            END IF
        END IF

        // Emit metrics
        FOR (name, info) IN &limits DO
            metrics.gauge("sf_rate_limit_remaining", info.remaining as f64, {
                limit_type: name,
            })
            metrics.gauge("sf_rate_limit_max", info.max as f64, {
                limit_type: name,
            })
        END FOR

        RETURN Ok(OrgLimits { limits })
    ELSE
        error <- parse_sf_error(&response.body)?
        RETURN Err(map_sf_error(error))
    END IF
END FUNCTION
```

---

## 9. Resilience Integration

### 9.1 Execute with Resilience

```pseudocode
FUNCTION execute_with_resilience(
    client: &SalesforceClient,
    request: HttpRequest
) -> Result<HttpResponse, SfError>
    // Check circuit breaker
    IF NOT client.circuit_breaker.allow_request() THEN
        RETURN Err(SfError::Network(NetworkError::CircuitBreakerOpen))
    END IF

    // Execute with retry
    result <- client.retry_executor.execute(|| async {
        // Get valid token
        token <- client.auth_provider.get_valid_token().await
            .map_err(|e| RetryableError::non_retryable(e))?

        // Clone and add auth header
        mut req <- request.clone()
        req.headers.insert("authorization", format!("Bearer {}", token.token.expose_secret()))

        // Execute request
        response <- client.http_client.send(req).await
            .map_err(|e| classify_network_error(e))?

        // Handle token expiry
        IF response.status == 401 THEN
            // Force token refresh on next attempt
            client.auth_provider.invalidate_token().await
            RETURN Err(RetryableError::retryable(SfError::Auth(AuthError::TokenExpired)))
        END IF

        // Handle rate limits
        IF response.status == 429 THEN
            retry_after <- response.headers.get("retry-after")
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(60)

            RETURN Err(RetryableError::retryable_with_delay(
                SfError::Limit(LimitError::DailyLimitExceeded),
                Duration::from_secs(retry_after)
            ))
        END IF

        // Handle server errors
        IF response.status >= 500 THEN
            RETURN Err(RetryableError::retryable(SfError::Api(ApiError::ServerError {
                status: response.status,
            })))
        END IF

        Ok(response)
    }).await

    // Update circuit breaker
    MATCH result {
        Ok(_) => client.circuit_breaker.record_success(),
        Err(ref e) IF e.is_server_error() => client.circuit_breaker.record_failure(),
        _ => {}
    }

    result
END FUNCTION
```

---

## 10. Simulation Support

### 10.1 Recording

```pseudocode
STRUCT SimulationRecorder {
    storage: Arc<RwLock<HashMap<String, RecordedInteraction>>>,
    enabled: bool,
}

STRUCT RecordedInteraction {
    operation: String,
    sobject: Option<String>,
    request_body: Option<Bytes>,
    response_body: Bytes,
    response_status: u16,
    duration: Duration,
    timestamp: DateTime<Utc>,
}

IMPL SfRecorder FOR SimulationRecorder {
    FUNCTION record_request(&self, op: &str, sobject: Option<&str>, req_body: &[u8])
        IF NOT self.enabled THEN RETURN END IF

        storage_key <- format!("{}:{}", op, sobject.unwrap_or(""))

        self.storage.write().insert(storage_key, RecordedInteraction {
            operation: op.to_string(),
            sobject: sobject.map(|s| s.to_string()),
            request_body: Some(Bytes::copy_from_slice(req_body)),
            ..Default::default()
        })
    END FUNCTION

    FUNCTION record_response(&self, op: &str, sobject: Option<&str>, resp: &[u8], duration: Duration)
        IF NOT self.enabled THEN RETURN END IF

        storage_key <- format!("{}:{}", op, sobject.unwrap_or(""))

        self.storage.write().entry(storage_key).and_modify(|rec| {
            rec.response_body = Bytes::copy_from_slice(resp)
            rec.duration = duration
            rec.timestamp = Utc::now()
        })
    END FUNCTION
}
```

### 10.2 Replay

```pseudocode
STRUCT SimulationReplayer {
    recordings: HashMap<String, RecordedInteraction>,
    simulate_latency: bool,
}

IMPL SfReplayer FOR SimulationReplayer {
    FUNCTION replay_response(&self, op: &str, sobject: Option<&str>) -> Option<ReplayedResponse>
        storage_key <- format!("{}:{}", op, sobject.unwrap_or(""))

        recording <- self.recordings.get(&storage_key)?

        Some(ReplayedResponse {
            body: recording.response_body.clone(),
            status: recording.response_status,
            delay: IF self.simulate_latency THEN recording.duration ELSE Duration::ZERO END IF,
        })
    END FUNCTION
}

// Replay HTTP client
STRUCT ReplayHttpClient {
    replayer: Arc<dyn SfReplayer>,
}

IMPL HttpClient FOR ReplayHttpClient {
    ASYNC FUNCTION send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>
        (op, sobject) <- extract_operation_from_request(&request)?

        replay <- self.replayer.replay_response(&op, sobject.as_deref())
            .ok_or(TransportError::NoRecording)?

        IF replay.delay > Duration::ZERO THEN
            tokio::time::sleep(replay.delay).await
        END IF

        Ok(HttpResponse {
            status: replay.status,
            headers: HeaderMap::new(),
            body: replay.body,
        })
    END FUNCTION
}
```

---

## 11. Error Handling

### 11.1 Parse Salesforce Error

```pseudocode
FUNCTION parse_sf_error(body: &[u8]) -> Result<SalesforceApiError, SfError>
    // Salesforce returns array of errors
    TRY
        errors <- parse_json::<Vec<SalesforceErrorBody>>(body)?
        IF errors.is_empty() THEN
            RETURN Err(SfError::Response(ResponseError::EmptyErrorResponse))
        END IF

        // Return first error
        first <- &errors[0]
        RETURN Ok(SalesforceApiError {
            error_code: first.error_code.clone(),
            message: first.message.clone(),
            fields: first.fields.clone(),
        })
    CATCH _
        // Try single error format
        TRY
            error <- parse_json::<SalesforceErrorBody>(body)?
            RETURN Ok(SalesforceApiError {
                error_code: error.error_code,
                message: error.message,
                fields: error.fields,
            })
        CATCH _
            RETURN Err(SfError::Response(ResponseError::InvalidErrorFormat))
        END TRY
    END TRY
END FUNCTION

FUNCTION map_sf_error(error: SalesforceApiError) -> SfError
    MATCH error.error_code.as_str() {
        "INVALID_SESSION_ID" => SfError::Auth(AuthError::TokenExpired),
        "INSUFFICIENT_ACCESS" => SfError::Auth(AuthError::InsufficientPermissions { message: error.message }),
        "MALFORMED_QUERY" => SfError::Query(QueryError::MalformedQuery { message: error.message }),
        "INVALID_FIELD" => SfError::Query(QueryError::InvalidField { field: error.fields.first().cloned() }),
        "INVALID_TYPE" => SfError::Query(QueryError::InvalidSObject { message: error.message }),
        "ENTITY_IS_DELETED" => SfError::Api(ApiError::NotFound { message: error.message }),
        "REQUEST_LIMIT_EXCEEDED" => SfError::Limit(LimitError::DailyLimitExceeded),
        "CONCURRENT_REQUEST_LIMIT_EXCEEDED" => SfError::Limit(LimitError::ConcurrentLimitExceeded),
        _ => SfError::Api(ApiError::Unknown { code: error.error_code, message: error.message }),
    }
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-15 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, data flow, module structure, and integration patterns.

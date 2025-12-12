# SPARC Phase 3: Pseudocode — Azure OpenAI Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/azure/openai`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Deployment Registry](#3-deployment-registry)
4. [URL Builder](#4-url-builder)
5. [Authentication Provider](#5-authentication-provider)
6. [Chat Service](#6-chat-service)
7. [Embedding Service](#7-embedding-service)
8. [Streaming Pipeline](#8-streaming-pipeline)
9. [Content Filter Handler](#9-content-filter-handler)
10. [Error Handling](#10-error-handling)
11. [Platform Adapter](#11-platform-adapter)
12. [RuvVector Integration](#12-ruvvector-integration)

---

## 1. Overview

### 1.1 Pseudocode Conventions

```
FUNCTION name(param: Type) -> ReturnType
  // Comments explain intent
  VARIABLE <- expression
  IF condition THEN
    action
  END IF
  FOR EACH item IN collection DO
    process(item)
  END FOR
  TRY
    risky_operation()
  CATCH ErrorType AS e
    handle(e)
  END TRY
  RETURN value
END FUNCTION
```

### 1.2 Design Principles

| Principle | Implementation |
|-----------|----------------|
| Thin Adapter | Minimal logic, delegate to shared modules |
| Deployment-Based | Route via deployment registry, not model IDs |
| Shared Infrastructure | Reuse azure/credentials, shared/resilience |
| API Version Aware | Every request includes api-version parameter |

### 1.3 Constants

```
CONST AZURE_OPENAI_API_VERSION_DEFAULT <- "2024-06-01"
CONST AZURE_OPENAI_API_VERSION_PREVIEW <- "2024-08-01-preview"
CONST DEFAULT_TIMEOUT <- 120s
CONST DEFAULT_MAX_RETRIES <- 3
CONST COGNITIVE_SERVICES_SCOPE <- "https://cognitiveservices.azure.com/.default"
CONST TOKEN_REFRESH_BUFFER <- 300s  // Refresh 5 min before expiry

CONST MODEL_FAMILIES <- {
  "gpt-4": GPT4,
  "gpt-4o": GPT4o,
  "gpt-4o-mini": GPT4oMini,
  "gpt-35-turbo": GPT35Turbo,
  "text-embedding-ada-002": Embedding,
  "text-embedding-3-small": Embedding,
  "text-embedding-3-large": Embedding,
  "dall-e-3": DALLE,
  "whisper": Whisper
}
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_azure_openai_client(config: AzureOpenAIConfig) -> Result<AzureOpenAIClient, Error>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::Invalid(validation_result.message))
  END IF

  // Step 2: Initialize credential provider (from azure/credentials)
  credentials <- config.credentials OR create_default_credential_provider(config)

  // Step 3: Initialize deployment registry
  deployment_registry <- DeploymentRegistry::new(config.deployments)

  // Step 4: Initialize shared resilience (from shared/resilience)
  resilience <- create_resilience_orchestrator(
    retry_config: config.resilience.retry OR DEFAULT_RETRY_CONFIG,
    circuit_breaker_config: config.resilience.circuit_breaker OR DEFAULT_CB_CONFIG,
    rate_limiter_config: config.resilience.rate_limiter
  )

  // Step 5: Initialize shared observability (from shared/observability)
  observability <- create_observability_context(
    service_name: "azure-openai",
    logger: get_logger("azure-openai"),
    tracer: get_tracer("azure-openai"),
    metrics: get_metrics_collector("azure-openai")
  )

  // Step 6: Initialize HTTP transport (from shared/http)
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout OR DEFAULT_TIMEOUT,
    tls_config: TlsConfig { min_version: TLS_1_2 },
    connection_pool_size: 10
  })

  // Step 7: Assemble client
  client <- AzureOpenAIClientImpl {
    config: config,
    transport: Arc::new(transport),
    credentials: Arc::new(credentials),
    deployment_registry: Arc::new(deployment_registry),
    resilience: Arc::new(resilience),
    observability: observability,

    // Lazy-initialized services
    chat_service: OnceCell::new(),
    embedding_service: OnceCell::new(),
    image_service: OnceCell::new(),
    audio_service: OnceCell::new(),

    // Optional RuvVector (from shared/database)
    ruvvector: config.ruvvector
  }

  observability.logger.info("Azure OpenAI client initialized", {
    deployments: deployment_registry.list().len()
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_azure_openai_client_from_env() -> Result<AzureOpenAIClient, Error>
  // Step 1: Determine auth method
  auth_method <- IF read_env("AZURE_OPENAI_API_KEY") IS Some THEN
    AuthMethod::ApiKey
  ELSE IF read_env("AZURE_CLIENT_ID") IS Some THEN
    AuthMethod::ServicePrincipal
  ELSE IF read_env("AZURE_USE_MANAGED_IDENTITY") == "true" THEN
    AuthMethod::ManagedIdentity
  ELSE
    AuthMethod::AzureCLI  // Fallback for local dev
  END IF

  // Step 2: Create credential provider based on auth method
  credentials <- MATCH auth_method {
    ApiKey => ApiKeyCredentialProvider::from_env(),
    ServicePrincipal => ServicePrincipalCredentialProvider::from_env(),
    ManagedIdentity => ManagedIdentityCredentialProvider::new(),
    AzureCLI => AzureCLICredentialProvider::new()
  }

  // Step 3: Load deployments from environment or config file
  deployments <- load_deployments_from_env()

  IF deployments.is_empty() THEN
    RETURN Error(ConfigurationError::NoDeployments)
  END IF

  // Step 4: Build config
  config <- AzureOpenAIConfig {
    deployments: deployments,
    credentials: credentials,
    default_api_version: read_env("AZURE_OPENAI_API_VERSION")
                         OR AZURE_OPENAI_API_VERSION_DEFAULT,
    timeout: parse_duration(read_env("AZURE_OPENAI_TIMEOUT")) OR DEFAULT_TIMEOUT,
    resilience: ResilienceConfig::default(),
    ruvvector: IF read_env("RUVVECTOR_ENABLED") == "true" THEN
      Some(DatabaseConfig::from_env())
    ELSE
      None
    END IF
  }

  RETURN create_azure_openai_client(config)
END FUNCTION
```

### 2.3 Load Deployments from Environment

```
FUNCTION load_deployments_from_env() -> Vec<AzureDeployment>
  deployments <- []

  // Pattern 1: Single deployment via simple env vars
  IF read_env("AZURE_OPENAI_ENDPOINT") IS Some THEN
    endpoint <- read_env("AZURE_OPENAI_ENDPOINT")
    // Parse: https://{resource}.openai.azure.com/
    resource_name <- extract_resource_name(endpoint)

    deployment_name <- read_env("AZURE_OPENAI_DEPLOYMENT_NAME")
    IF deployment_name IS Some THEN
      deployments.push(AzureDeployment {
        deployment_id: deployment_name,
        resource_name: resource_name,
        region: infer_region_from_resource(resource_name) OR "unknown",
        api_version: read_env("AZURE_OPENAI_API_VERSION") OR AZURE_OPENAI_API_VERSION_DEFAULT,
        model_family: infer_model_family(deployment_name),
        capabilities: infer_capabilities(deployment_name)
      })
    END IF
  END IF

  // Pattern 2: Multiple deployments via JSON config
  config_path <- read_env("AZURE_OPENAI_CONFIG_PATH")
  IF config_path IS Some THEN
    config_json <- read_file(config_path)
    parsed <- parse_json(config_json)
    FOR EACH dep IN parsed.deployments DO
      deployments.push(AzureDeployment::from_json(dep))
    END FOR
  END IF

  // Pattern 3: Multiple deployments via indexed env vars
  // AZURE_OPENAI_DEPLOYMENT_0_ID, AZURE_OPENAI_DEPLOYMENT_0_RESOURCE, etc.
  index <- 0
  WHILE read_env(format("AZURE_OPENAI_DEPLOYMENT_{}_ID", index)) IS Some DO
    prefix <- format("AZURE_OPENAI_DEPLOYMENT_{}_", index)
    deployments.push(AzureDeployment {
      deployment_id: read_env(prefix + "ID"),
      resource_name: read_env(prefix + "RESOURCE"),
      region: read_env(prefix + "REGION") OR "unknown",
      api_version: read_env(prefix + "API_VERSION") OR AZURE_OPENAI_API_VERSION_DEFAULT,
      model_family: parse_model_family(read_env(prefix + "MODEL_FAMILY")),
      capabilities: parse_capabilities(read_env(prefix + "CAPABILITIES"))
    })
    index <- index + 1
  END WHILE

  RETURN deployments
END FUNCTION
```

### 2.4 Service Accessor Pattern

```
FUNCTION client.chat() -> &ChatService
  RETURN self.chat_service.get_or_init(|| {
    ChatServiceImpl::new(
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      deployment_registry: self.deployment_registry.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone()
    )
  })
END FUNCTION

FUNCTION client.embeddings() -> &EmbeddingService
  RETURN self.embedding_service.get_or_init(|| {
    EmbeddingServiceImpl::new(
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      deployment_registry: self.deployment_registry.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone()
    )
  })
END FUNCTION

FUNCTION client.images() -> &ImageService
  RETURN self.image_service.get_or_init(|| {
    ImageServiceImpl::new(
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      deployment_registry: self.deployment_registry.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone()
    )
  })
END FUNCTION

FUNCTION client.audio() -> &AudioService
  RETURN self.audio_service.get_or_init(|| {
    AudioServiceImpl::new(
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      deployment_registry: self.deployment_registry.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone()
    )
  })
END FUNCTION
```

---

## 3. Deployment Registry

### 3.1 Registry Implementation

```
STRUCT DeploymentRegistry {
  deployments: HashMap<String, AzureDeployment>,  // by deployment_id
  by_model_family: HashMap<ModelFamily, Vec<String>>,  // deployment_ids
  by_capability: HashMap<ModelCapability, Vec<String>>
}

FUNCTION DeploymentRegistry::new(deployments: Vec<AzureDeployment>) -> Self
  registry <- DeploymentRegistry {
    deployments: HashMap::new(),
    by_model_family: HashMap::new(),
    by_capability: HashMap::new()
  }

  FOR EACH dep IN deployments DO
    registry.register(dep)
  END FOR

  RETURN registry
END FUNCTION

FUNCTION registry.register(deployment: AzureDeployment) -> Result<(), Error>
  // Validate deployment
  IF deployment.deployment_id.is_empty() THEN
    RETURN Error(ConfigurationError::InvalidDeployment("empty deployment_id"))
  END IF
  IF deployment.resource_name.is_empty() THEN
    RETURN Error(ConfigurationError::InvalidDeployment("empty resource_name"))
  END IF

  deployment_id <- deployment.deployment_id.clone()

  // Add to main map
  self.deployments.insert(deployment_id.clone(), deployment.clone())

  // Index by model family
  self.by_model_family
    .entry(deployment.model_family)
    .or_default()
    .push(deployment_id.clone())

  // Index by capabilities
  FOR EACH cap IN deployment.capabilities DO
    self.by_capability
      .entry(cap)
      .or_default()
      .push(deployment_id.clone())
  END FOR

  RETURN Ok(())
END FUNCTION
```

### 3.2 Deployment Resolution

```
FUNCTION registry.resolve(deployment_id: &str) -> Result<&AzureDeployment, Error>
  MATCH self.deployments.get(deployment_id) {
    Some(dep) => Ok(dep),
    None => Error(DeploymentNotFound { deployment_id: deployment_id.to_string() })
  }
END FUNCTION

FUNCTION registry.resolve_by_model(model_hint: &str) -> Result<&AzureDeployment, Error>
  // Step 1: Try exact deployment_id match
  IF self.deployments.contains_key(model_hint) THEN
    RETURN Ok(self.deployments.get(model_hint).unwrap())
  END IF

  // Step 2: Try model family match
  model_family <- parse_model_family_from_hint(model_hint)
  IF model_family IS Some THEN
    deployment_ids <- self.by_model_family.get(model_family)
    IF deployment_ids IS Some AND NOT deployment_ids.is_empty() THEN
      // Return first available deployment for this family
      first_id <- deployment_ids[0]
      RETURN Ok(self.deployments.get(first_id).unwrap())
    END IF
  END IF

  // Step 3: No match found
  RETURN Error(DeploymentNotFound {
    deployment_id: model_hint.to_string(),
    hint: "No deployment found for model hint. Available: " + self.list_deployment_ids()
  })
END FUNCTION

FUNCTION parse_model_family_from_hint(hint: &str) -> Option<ModelFamily>
  hint_lower <- hint.to_lowercase()

  // Direct model name matches
  IF hint_lower.contains("gpt-4o-mini") THEN RETURN Some(GPT4oMini) END IF
  IF hint_lower.contains("gpt-4o") THEN RETURN Some(GPT4o) END IF
  IF hint_lower.contains("gpt-4") THEN RETURN Some(GPT4) END IF
  IF hint_lower.contains("gpt-35") OR hint_lower.contains("gpt-3.5") THEN
    RETURN Some(GPT35Turbo)
  END IF
  IF hint_lower.contains("embedding") OR hint_lower.contains("ada") THEN
    RETURN Some(Embedding)
  END IF
  IF hint_lower.contains("dall-e") OR hint_lower.contains("dalle") THEN
    RETURN Some(DALLE)
  END IF
  IF hint_lower.contains("whisper") THEN RETURN Some(Whisper) END IF

  RETURN None
END FUNCTION

FUNCTION registry.list() -> Vec<&AzureDeployment>
  RETURN self.deployments.values().collect()
END FUNCTION

FUNCTION registry.list_by_capability(cap: ModelCapability) -> Vec<&AzureDeployment>
  deployment_ids <- self.by_capability.get(cap) OR empty_vec()
  RETURN deployment_ids.iter()
    .filter_map(|id| self.deployments.get(id))
    .collect()
END FUNCTION
```

---

## 4. URL Builder

### 4.1 URL Construction

```
STRUCT UrlBuilder {
  resource_name: String,
  deployment_id: String,
  api_version: String,
  operation: Option<String>,
  query_params: Vec<(String, String)>
}

FUNCTION UrlBuilder::new(deployment: &AzureDeployment) -> Self
  RETURN UrlBuilder {
    resource_name: deployment.resource_name.clone(),
    deployment_id: deployment.deployment_id.clone(),
    api_version: deployment.api_version.clone(),
    operation: None,
    query_params: vec![]
  }
END FUNCTION

FUNCTION builder.operation(op: &str) -> Self
  self.operation <- Some(op.to_string())
  RETURN self
END FUNCTION

FUNCTION builder.api_version(version: &str) -> Self
  self.api_version <- version.to_string()
  RETURN self
END FUNCTION

FUNCTION builder.query(key: &str, value: &str) -> Self
  self.query_params.push((key.to_string(), value.to_string()))
  RETURN self
END FUNCTION

FUNCTION builder.build() -> String
  // Base URL: https://{resource}.openai.azure.com/openai/deployments/{deployment}
  base <- format(
    "https://{}.openai.azure.com/openai/deployments/{}",
    self.resource_name,
    self.deployment_id
  )

  // Add operation path
  url <- IF self.operation IS Some THEN
    format("{}/{}", base, self.operation.unwrap())
  ELSE
    base
  END IF

  // Build query string (api-version is always required)
  query_parts <- vec![format("api-version={}", url_encode(self.api_version))]

  FOR EACH (key, value) IN self.query_params DO
    query_parts.push(format("{}={}", url_encode(key), url_encode(value)))
  END FOR

  RETURN format("{}?{}", url, query_parts.join("&"))
END FUNCTION
```

### 4.2 Operation-Specific Builders

```
FUNCTION build_chat_completion_url(deployment: &AzureDeployment) -> String
  RETURN UrlBuilder::new(deployment)
    .operation("chat/completions")
    .build()
END FUNCTION

FUNCTION build_embedding_url(deployment: &AzureDeployment) -> String
  RETURN UrlBuilder::new(deployment)
    .operation("embeddings")
    .build()
END FUNCTION

FUNCTION build_image_generation_url(deployment: &AzureDeployment) -> String
  RETURN UrlBuilder::new(deployment)
    .operation("images/generations")
    .build()
END FUNCTION

FUNCTION build_audio_transcription_url(deployment: &AzureDeployment) -> String
  RETURN UrlBuilder::new(deployment)
    .operation("audio/transcriptions")
    .build()
END FUNCTION
```

---

## 5. Authentication Provider

### 5.1 Credential Provider Trait

```
TRAIT AzureCredentialProvider {
  ASYNC FUNCTION get_auth_header() -> Result<(String, String), Error>
  ASYNC FUNCTION refresh() -> Result<(), Error>
}
```

### 5.2 API Key Provider

```
STRUCT ApiKeyCredentialProvider {
  api_key: String
}

IMPL AzureCredentialProvider FOR ApiKeyCredentialProvider {
  ASYNC FUNCTION get_auth_header() -> Result<(String, String), Error>
    RETURN Ok(("api-key", self.api_key.clone()))
  END FUNCTION

  ASYNC FUNCTION refresh() -> Result<(), Error>
    // API keys don't need refresh
    RETURN Ok(())
  END FUNCTION
}

FUNCTION ApiKeyCredentialProvider::from_env() -> Result<Self, Error>
  api_key <- read_env("AZURE_OPENAI_API_KEY")
  IF api_key IS None THEN
    RETURN Error(AuthenticationError::MissingApiKey)
  END IF
  RETURN Ok(ApiKeyCredentialProvider { api_key })
END FUNCTION
```

### 5.3 Azure AD Token Provider

```
STRUCT AzureAdTokenProvider {
  tenant_id: String,
  client_id: String,
  client_secret: Option<String>,
  cached_token: RwLock<Option<CachedToken>>,
  http_client: HttpClient
}

STRUCT CachedToken {
  access_token: String,
  expires_at: Instant
}

IMPL AzureCredentialProvider FOR AzureAdTokenProvider {
  ASYNC FUNCTION get_auth_header() -> Result<(String, String), Error>
    // Check cache
    cached <- self.cached_token.read().await
    IF cached IS Some AND cached.expires_at > Instant::now() + TOKEN_REFRESH_BUFFER THEN
      RETURN Ok(("Authorization", format("Bearer {}", cached.access_token)))
    END IF
    DROP cached  // Release read lock

    // Acquire new token
    self.refresh().await?

    cached <- self.cached_token.read().await
    IF cached IS Some THEN
      RETURN Ok(("Authorization", format("Bearer {}", cached.access_token)))
    ELSE
      RETURN Error(AuthenticationError::TokenAcquisitionFailed)
    END IF
  END FUNCTION

  ASYNC FUNCTION refresh() -> Result<(), Error>
    token_response <- self.acquire_token().await?

    expires_at <- Instant::now() + Duration::from_secs(token_response.expires_in)

    cached <- self.cached_token.write().await
    *cached <- Some(CachedToken {
      access_token: token_response.access_token,
      expires_at: expires_at
    })

    RETURN Ok(())
  END FUNCTION
}

ASYNC FUNCTION provider.acquire_token() -> Result<TokenResponse, Error>
  // Build token request for client_credentials flow
  token_url <- format(
    "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
    self.tenant_id
  )

  body <- format(
    "client_id={}&client_secret={}&scope={}&grant_type=client_credentials",
    url_encode(self.client_id),
    url_encode(self.client_secret.as_ref().unwrap_or(&String::new())),
    url_encode(COGNITIVE_SERVICES_SCOPE)
  )

  request <- HttpRequest::post(token_url)
    .header("Content-Type", "application/x-www-form-urlencoded")
    .body(body)

  response <- self.http_client.send(request).await?

  IF response.status != 200 THEN
    error_body <- response.text().await?
    RETURN Error(AuthenticationError::TokenRequestFailed {
      status: response.status,
      message: error_body
    })
  END IF

  token_response <- parse_json::<TokenResponse>(response.body)?
  RETURN Ok(token_response)
END FUNCTION

FUNCTION AzureAdTokenProvider::from_env() -> Result<Self, Error>
  tenant_id <- read_env("AZURE_TENANT_ID")
  client_id <- read_env("AZURE_CLIENT_ID")
  client_secret <- read_env("AZURE_CLIENT_SECRET")

  IF tenant_id IS None OR client_id IS None THEN
    RETURN Error(AuthenticationError::MissingAzureAdConfig)
  END IF

  RETURN Ok(AzureAdTokenProvider {
    tenant_id: tenant_id.unwrap(),
    client_id: client_id.unwrap(),
    client_secret: client_secret,
    cached_token: RwLock::new(None),
    http_client: HttpClient::new()
  })
END FUNCTION
```

### 5.4 Managed Identity Provider

```
STRUCT ManagedIdentityCredentialProvider {
  client_id: Option<String>,  // For user-assigned identity
  cached_token: RwLock<Option<CachedToken>>,
  http_client: HttpClient
}

CONST IMDS_ENDPOINT <- "http://169.254.169.254/metadata/identity/oauth2/token"

IMPL AzureCredentialProvider FOR ManagedIdentityCredentialProvider {
  ASYNC FUNCTION get_auth_header() -> Result<(String, String), Error>
    // Same caching logic as AzureAdTokenProvider
    cached <- self.cached_token.read().await
    IF cached IS Some AND cached.expires_at > Instant::now() + TOKEN_REFRESH_BUFFER THEN
      RETURN Ok(("Authorization", format("Bearer {}", cached.access_token)))
    END IF
    DROP cached

    self.refresh().await?

    cached <- self.cached_token.read().await
    RETURN Ok(("Authorization", format("Bearer {}", cached.as_ref().unwrap().access_token)))
  END FUNCTION

  ASYNC FUNCTION refresh() -> Result<(), Error>
    // Build IMDS request
    url <- format(
      "{}?api-version=2018-02-01&resource={}",
      IMDS_ENDPOINT,
      url_encode("https://cognitiveservices.azure.com")
    )

    // Add client_id for user-assigned identity
    url <- IF self.client_id IS Some THEN
      format("{}&client_id={}", url, self.client_id.as_ref().unwrap())
    ELSE
      url
    END IF

    request <- HttpRequest::get(url)
      .header("Metadata", "true")

    response <- self.http_client.send(request).await?

    IF response.status != 200 THEN
      RETURN Error(AuthenticationError::ManagedIdentityFailed {
        status: response.status
      })
    END IF

    token_response <- parse_json::<TokenResponse>(response.body)?
    expires_at <- Instant::now() + Duration::from_secs(token_response.expires_in)

    cached <- self.cached_token.write().await
    *cached <- Some(CachedToken {
      access_token: token_response.access_token,
      expires_at: expires_at
    })

    RETURN Ok(())
  END FUNCTION
}
```

---

## 6. Chat Service

### 6.1 Chat Completion

```
STRUCT ChatServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn AzureCredentialProvider>,
  deployment_registry: Arc<DeploymentRegistry>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext
}

ASYNC FUNCTION service.complete(request: ChatRequest) -> Result<ChatResponse, Error>
  // Step 1: Start tracing span
  span <- self.observability.tracer.start_span("azure_openai.chat.complete")
  span.set_attribute("deployment_id", request.deployment_id)

  TRY
    // Step 2: Resolve deployment
    deployment <- self.deployment_registry.resolve(&request.deployment_id)?

    // Step 3: Build URL
    url <- build_chat_completion_url(deployment)

    // Step 4: Get auth header
    auth_header <- self.credentials.get_auth_header().await?

    // Step 5: Build request body
    body <- ChatRequestBody {
      messages: request.messages,
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      stop: request.stop,
      presence_penalty: request.presence_penalty,
      frequency_penalty: request.frequency_penalty,
      user: request.user,
      // Azure-specific: function calling
      tools: request.tools,
      tool_choice: request.tool_choice,
      // Azure-specific: response format
      response_format: request.response_format
    }

    // Step 6: Build HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    // Step 7: Execute with resilience
    http_response <- self.resilience.execute(
      operation_name: "chat_completion",
      classifier: AzureOpenAIRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 8: Parse response
    response <- parse_chat_response(http_response).await?

    // Step 9: Extract and log content filter results
    IF response.prompt_filter_results IS Some THEN
      log_content_filter_results(&response.prompt_filter_results)
    END IF

    // Step 10: Record metrics
    self.observability.metrics.record_request(
      deployment: &request.deployment_id,
      operation: "chat_completion",
      status: "success",
      latency: span.elapsed()
    )
    self.observability.metrics.record_tokens(
      deployment: &request.deployment_id,
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens
    )

    span.set_status(SpanStatus::Ok)
    RETURN Ok(response)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    span.record_exception(&e)
    self.observability.metrics.record_request(
      deployment: &request.deployment_id,
      operation: "chat_completion",
      status: "error",
      latency: span.elapsed()
    )
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 6.2 Parse Chat Response

```
ASYNC FUNCTION parse_chat_response(http_response: HttpResponse) -> Result<ChatResponse, Error>
  // Check HTTP status
  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  // Parse JSON body
  body <- http_response.json::<AzureChatResponseBody>().await?

  // Map to ChatResponse
  response <- ChatResponse {
    id: body.id,
    object: body.object,
    created: body.created,
    model: body.model,
    choices: body.choices.iter().map(|c| ChatChoice {
      index: c.index,
      message: ChatMessage {
        role: c.message.role.clone(),
        content: c.message.content.clone(),
        tool_calls: c.message.tool_calls.clone()
      },
      finish_reason: c.finish_reason.clone()
    }).collect(),
    usage: TokenUsage {
      prompt_tokens: body.usage.prompt_tokens,
      completion_tokens: body.usage.completion_tokens,
      total_tokens: body.usage.total_tokens
    },
    // Azure-specific fields
    prompt_filter_results: body.prompt_filter_results,
    system_fingerprint: body.system_fingerprint
  }

  RETURN Ok(response)
END FUNCTION
```

---

## 7. Embedding Service

### 7.1 Create Embeddings

```
STRUCT EmbeddingServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn AzureCredentialProvider>,
  deployment_registry: Arc<DeploymentRegistry>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext
}

ASYNC FUNCTION service.create(request: EmbeddingRequest) -> Result<EmbeddingResponse, Error>
  span <- self.observability.tracer.start_span("azure_openai.embedding.create")
  span.set_attribute("deployment_id", request.deployment_id)

  TRY
    // Step 1: Resolve deployment
    deployment <- self.deployment_registry.resolve(&request.deployment_id)?

    // Validate deployment supports embeddings
    IF NOT deployment.capabilities.contains(ModelCapability::Embeddings) THEN
      RETURN Error(ValidationError::DeploymentDoesNotSupportEmbeddings {
        deployment_id: request.deployment_id
      })
    END IF

    // Step 2: Build URL
    url <- build_embedding_url(deployment)

    // Step 3: Get auth header
    auth_header <- self.credentials.get_auth_header().await?

    // Step 4: Build request body
    body <- EmbeddingRequestBody {
      input: request.input,
      // Azure embedding models may support dimensions parameter
      dimensions: request.dimensions,
      encoding_format: request.encoding_format OR "float"
    }

    // Step 5: Build and execute HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    http_response <- self.resilience.execute(
      operation_name: "create_embedding",
      classifier: AzureOpenAIRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 6: Parse response
    response <- parse_embedding_response(http_response).await?

    // Step 7: Record metrics
    self.observability.metrics.record_request(
      deployment: &request.deployment_id,
      operation: "create_embedding",
      status: "success",
      latency: span.elapsed()
    )
    self.observability.metrics.record_tokens(
      deployment: &request.deployment_id,
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: 0
    )

    span.set_status(SpanStatus::Ok)
    RETURN Ok(response)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    span.record_exception(&e)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 7.2 Parse Embedding Response

```
ASYNC FUNCTION parse_embedding_response(http_response: HttpResponse) -> Result<EmbeddingResponse, Error>
  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  body <- http_response.json::<AzureEmbeddingResponseBody>().await?

  response <- EmbeddingResponse {
    object: body.object,
    data: body.data.iter().map(|d| EmbeddingData {
      object: d.object.clone(),
      index: d.index,
      embedding: d.embedding.clone()
    }).collect(),
    model: body.model,
    usage: EmbeddingUsage {
      prompt_tokens: body.usage.prompt_tokens,
      total_tokens: body.usage.total_tokens
    }
  }

  RETURN Ok(response)
END FUNCTION
```

---

## 8. Streaming Pipeline

### 8.1 Streaming Chat Completion

```
ASYNC FUNCTION service.stream(request: ChatRequest) -> Result<ChatStream, Error>
  span <- self.observability.tracer.start_span("azure_openai.chat.stream")
  span.set_attribute("deployment_id", request.deployment_id)

  // Step 1: Resolve deployment
  deployment <- self.deployment_registry.resolve(&request.deployment_id)?

  // Step 2: Build URL
  url <- build_chat_completion_url(deployment)

  // Step 3: Get auth header
  auth_header <- self.credentials.get_auth_header().await?

  // Step 4: Build request body with stream: true
  body <- ChatRequestBody {
    messages: request.messages,
    temperature: request.temperature,
    top_p: request.top_p,
    max_tokens: request.max_tokens,
    stream: true,  // Enable streaming
    stream_options: Some(StreamOptions {
      include_usage: true  // Get token usage on final chunk
    }),
    // ... other fields
  }

  // Step 5: Build HTTP request
  http_request <- HttpRequest::post(url)
    .header(auth_header.0, auth_header.1)
    .header("Content-Type", "application/json")
    .header("Accept", "text/event-stream")
    .json(&body)?

  // Step 6: Execute request and get response stream
  http_response <- self.transport.send_streaming(http_request).await?

  IF http_response.status != 200 THEN
    body <- http_response.text().await?
    RETURN parse_error_response_body(http_response.status, body)
  END IF

  // Step 7: Create SSE parser and return stream
  sse_stream <- SseParser::new(http_response.body_stream)

  chat_stream <- ChatStream::new(
    sse_stream: sse_stream,
    observability: self.observability.clone(),
    deployment_id: request.deployment_id.clone(),
    span: span
  )

  RETURN Ok(chat_stream)
END FUNCTION
```

### 8.2 SSE Parser

```
STRUCT SseParser {
  body_stream: ByteStream,
  buffer: String,
  state: ParserState
}

ENUM ParserState {
  ReadingEvent,
  Done
}

IMPL Stream FOR SseParser {
  TYPE Item = Result<SseEvent, Error>

  ASYNC FUNCTION poll_next(cx: &mut Context) -> Poll<Option<Self::Item>>
    IF self.state == Done THEN
      RETURN Poll::Ready(None)
    END IF

    LOOP
      // Try to parse a complete event from buffer
      event <- try_parse_event(&mut self.buffer)
      IF event IS Some THEN
        // Check for [DONE] sentinel
        IF event.data == "[DONE]" THEN
          self.state <- Done
          RETURN Poll::Ready(None)
        END IF
        RETURN Poll::Ready(Some(Ok(event)))
      END IF

      // Need more data from stream
      chunk <- self.body_stream.poll_next(cx)
      MATCH chunk {
        Poll::Ready(Some(Ok(bytes))) => {
          self.buffer.push_str(&String::from_utf8_lossy(&bytes))
        },
        Poll::Ready(Some(Err(e))) => {
          RETURN Poll::Ready(Some(Err(Error::StreamError(e))))
        },
        Poll::Ready(None) => {
          self.state <- Done
          RETURN Poll::Ready(None)
        },
        Poll::Pending => {
          RETURN Poll::Pending
        }
      }
    END LOOP
  END FUNCTION
}

FUNCTION try_parse_event(buffer: &mut String) -> Option<SseEvent>
  // SSE format: data: {...}\n\n
  // Find complete event (ends with double newline)
  IF NOT buffer.contains("\n\n") THEN
    RETURN None
  END IF

  // Extract first complete event
  split_pos <- buffer.find("\n\n").unwrap() + 2
  event_str <- buffer[..split_pos].to_string()
  *buffer <- buffer[split_pos..].to_string()

  // Parse event lines
  data_line <- None
  FOR EACH line IN event_str.lines() DO
    IF line.starts_with("data: ") THEN
      data_line <- Some(line[6..].to_string())
    END IF
    // Ignore event:, id:, retry: for now
  END FOR

  IF data_line IS Some THEN
    RETURN Some(SseEvent { data: data_line.unwrap() })
  ELSE
    RETURN None
  END IF
END FUNCTION
```

### 8.3 Chat Stream

```
STRUCT ChatStream {
  sse_stream: SseParser,
  observability: ObservabilityContext,
  deployment_id: String,
  span: Span,
  accumulated_usage: Option<TokenUsage>,
  chunk_count: u32
}

IMPL Stream FOR ChatStream {
  TYPE Item = Result<ChatChunk, Error>

  ASYNC FUNCTION poll_next(cx: &mut Context) -> Poll<Option<Self::Item>>
    MATCH self.sse_stream.poll_next(cx) {
      Poll::Ready(Some(Ok(event))) => {
        // Parse JSON data
        chunk_result <- parse_json::<ChatChunk>(&event.data)

        MATCH chunk_result {
          Ok(chunk) => {
            self.chunk_count <- self.chunk_count + 1

            // Capture usage from final chunk
            IF chunk.usage IS Some THEN
              self.accumulated_usage <- chunk.usage.clone()
            END IF

            Poll::Ready(Some(Ok(chunk)))
          },
          Err(e) => {
            Poll::Ready(Some(Err(Error::ParseError(e))))
          }
        }
      },
      Poll::Ready(Some(Err(e))) => {
        self.span.set_status(SpanStatus::Error)
        Poll::Ready(Some(Err(e)))
      },
      Poll::Ready(None) => {
        // Stream complete - record metrics
        IF self.accumulated_usage IS Some THEN
          usage <- self.accumulated_usage.as_ref().unwrap()
          self.observability.metrics.record_tokens(
            deployment: &self.deployment_id,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens
          )
        END IF
        self.observability.metrics.record_request(
          deployment: &self.deployment_id,
          operation: "chat_stream",
          status: "success",
          latency: self.span.elapsed()
        )
        self.span.set_status(SpanStatus::Ok)
        self.span.end()
        Poll::Ready(None)
      },
      Poll::Pending => Poll::Pending
    }
  END FUNCTION
}
```

---

## 9. Content Filter Handler

### 9.1 Content Filter Extraction

```
STRUCT ContentFilterResult {
  prompt_index: u32,
  content_filter_results: ContentFilterCategories
}

STRUCT ContentFilterCategories {
  hate: FilterSeverity,
  self_harm: FilterSeverity,
  sexual: FilterSeverity,
  violence: FilterSeverity
}

STRUCT FilterSeverity {
  filtered: bool,
  severity: String  // "safe", "low", "medium", "high"
}

FUNCTION extract_content_filter_results(response: &ChatResponse) -> Vec<ContentFilterViolation>
  violations <- []

  // Check prompt filter results
  IF response.prompt_filter_results IS Some THEN
    FOR EACH result IN response.prompt_filter_results DO
      check_category_violation(&mut violations, result.prompt_index, "prompt", &result.content_filter_results)
    END FOR
  END IF

  // Check choice-level filter results
  FOR EACH choice IN response.choices DO
    IF choice.content_filter_results IS Some THEN
      check_category_violation(&mut violations, choice.index, "completion", &choice.content_filter_results)
    END IF
  END FOR

  RETURN violations
END FUNCTION

FUNCTION check_category_violation(
  violations: &mut Vec<ContentFilterViolation>,
  index: u32,
  source: &str,
  categories: &ContentFilterCategories
)
  IF categories.hate.filtered THEN
    violations.push(ContentFilterViolation {
      index: index,
      source: source.to_string(),
      category: "hate",
      severity: categories.hate.severity.clone()
    })
  END IF

  IF categories.self_harm.filtered THEN
    violations.push(ContentFilterViolation {
      index: index,
      source: source.to_string(),
      category: "self_harm",
      severity: categories.self_harm.severity.clone()
    })
  END IF

  IF categories.sexual.filtered THEN
    violations.push(ContentFilterViolation {
      index: index,
      source: source.to_string(),
      category: "sexual",
      severity: categories.sexual.severity.clone()
    })
  END IF

  IF categories.violence.filtered THEN
    violations.push(ContentFilterViolation {
      index: index,
      source: source.to_string(),
      category: "violence",
      severity: categories.violence.severity.clone()
    })
  END IF
END FUNCTION

FUNCTION log_content_filter_results(results: &[ContentFilterResult])
  FOR EACH result IN results DO
    categories <- &result.content_filter_results

    // Log any non-safe severities
    IF categories.hate.severity != "safe" THEN
      tracing::info!(
        prompt_index = result.prompt_index,
        category = "hate",
        severity = categories.hate.severity,
        filtered = categories.hate.filtered,
        "Content filter result"
      )
    END IF
    // ... repeat for other categories
  END FOR
END FUNCTION
```

---

## 10. Error Handling

### 10.1 Error Response Parsing

```
ASYNC FUNCTION parse_error_response(http_response: HttpResponse) -> Error
  status <- http_response.status
  body <- http_response.text().await.unwrap_or_default()

  // Try to parse as Azure error format
  azure_error <- parse_json::<AzureErrorResponse>(&body).ok()

  error_code <- azure_error.as_ref()
    .and_then(|e| e.error.code.as_ref())
    .map(|c| c.as_str())
    .unwrap_or("unknown")

  error_message <- azure_error.as_ref()
    .and_then(|e| e.error.message.as_ref())
    .map(|m| m.as_str())
    .unwrap_or(&body)

  MATCH status {
    400 => {
      MATCH error_code {
        "content_filter" | "content_filter_policy" => {
          Error::ContentFiltered {
            message: error_message.to_string(),
            // Extract category from inner error if available
            category: azure_error.and_then(|e| e.error.innererror)
              .and_then(|i| i.content_filter_result)
              .map(|r| r.category)
          }
        },
        "context_length_exceeded" => {
          Error::ContextLengthExceeded {
            message: error_message.to_string(),
            max_tokens: extract_max_tokens(error_message)
          }
        },
        _ => {
          Error::ValidationError {
            code: error_code.to_string(),
            message: error_message.to_string()
          }
        }
      }
    },
    401 => {
      Error::AuthenticationError {
        message: error_message.to_string(),
        retry_with_refresh: error_code == "token_expired"
      }
    },
    403 => {
      Error::AuthorizationError {
        message: error_message.to_string()
      }
    },
    404 => {
      Error::DeploymentNotFound {
        message: error_message.to_string()
      }
    },
    429 => {
      // Extract Retry-After header
      retry_after <- http_response.headers
        .get("Retry-After")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60)

      Error::RateLimited {
        retry_after_secs: retry_after,
        message: error_message.to_string()
      }
    },
    500..=599 => {
      Error::ServiceError {
        status_code: status,
        message: error_message.to_string(),
        retryable: true
      }
    },
    _ => {
      Error::UnexpectedError {
        status_code: status,
        message: error_message.to_string()
      }
    }
  }
END FUNCTION
```

### 10.2 Retry Classifier

```
STRUCT AzureOpenAIRetryClassifier

IMPL RetryClassifier FOR AzureOpenAIRetryClassifier {
  FUNCTION classify(error: &Error) -> RetryDecision
    MATCH error {
      Error::RateLimited { retry_after_secs, .. } => {
        RetryDecision::RetryAfter(Duration::from_secs(*retry_after_secs))
      },
      Error::AuthenticationError { retry_with_refresh: true, .. } => {
        RetryDecision::RefreshAndRetry
      },
      Error::ServiceError { retryable: true, .. } => {
        RetryDecision::RetryWithBackoff
      },
      Error::NetworkError(_) => {
        RetryDecision::RetryWithBackoff
      },
      Error::TimeoutError => {
        RetryDecision::RetryWithBackoff
      },
      // All other errors are not retryable
      _ => {
        RetryDecision::DoNotRetry
      }
    }
  END FUNCTION
}
```

### 10.3 Circuit Breaker Scope

```
FUNCTION get_circuit_breaker_key(deployment_id: &str, operation: &str) -> String
  // Per-deployment circuit breakers
  RETURN format("azure_openai:{}:{}", deployment_id, operation)
END FUNCTION

// Circuit breaker configuration per deployment
CONST CIRCUIT_BREAKER_CONFIG <- CircuitBreakerConfig {
  failure_threshold: 5,      // Open after 5 failures
  success_threshold: 3,      // Close after 3 successes
  timeout: Duration::from_secs(30),  // Half-open after 30s
  sampling_window: Duration::from_secs(60)  // Count failures in 60s window
}
```

---

## 11. Platform Adapter

### 11.1 Model Adapter Implementation

```
STRUCT AzureOpenAIAdapter {
  client: Arc<AzureOpenAIClient>,
  deployment_registry: Arc<DeploymentRegistry>
}

IMPL ModelAdapter FOR AzureOpenAIAdapter {
  FUNCTION provider_id() -> &'static str
    RETURN "azure-openai"
  END FUNCTION

  FUNCTION supported_capabilities() -> Vec<ModelCapability>
    RETURN vec![
      ModelCapability::ChatCompletion,
      ModelCapability::Streaming,
      ModelCapability::Embeddings,
      ModelCapability::FunctionCalling,
      ModelCapability::Vision,
      ModelCapability::ImageGeneration,
      ModelCapability::AudioTranscription
    ]
  END FUNCTION

  ASYNC FUNCTION invoke(request: UnifiedModelRequest) -> Result<UnifiedModelResponse, Error>
    // Step 1: Resolve deployment from model hint
    deployment <- self.deployment_registry.resolve_by_model(&request.model_hint)?

    // Step 2: Convert and route based on request type
    MATCH request.request_type {
      RequestType::ChatCompletion => {
        azure_request <- convert_to_azure_chat_request(request, deployment)
        azure_response <- self.client.chat().complete(azure_request).await?
        RETURN convert_to_unified_response(azure_response)
      },
      RequestType::Embedding => {
        azure_request <- convert_to_azure_embedding_request(request, deployment)
        azure_response <- self.client.embeddings().create(azure_request).await?
        RETURN convert_to_unified_embedding_response(azure_response)
      },
      RequestType::ImageGeneration => {
        azure_request <- convert_to_azure_image_request(request, deployment)
        azure_response <- self.client.images().generate(azure_request).await?
        RETURN convert_to_unified_image_response(azure_response)
      },
      _ => {
        RETURN Error::UnsupportedRequestType(request.request_type)
      }
    }
  END FUNCTION

  ASYNC FUNCTION invoke_stream(request: UnifiedModelRequest) -> Result<UnifiedStream, Error>
    deployment <- self.deployment_registry.resolve_by_model(&request.model_hint)?
    azure_request <- convert_to_azure_chat_request(request, deployment)
    azure_stream <- self.client.chat().stream(azure_request).await?

    // Wrap in unified stream adapter
    RETURN UnifiedStream::new(azure_stream.map(|chunk| {
      chunk.map(convert_chunk_to_unified)
    }))
  END FUNCTION
}
```

### 11.2 Request/Response Conversion

```
FUNCTION convert_to_azure_chat_request(
  request: UnifiedModelRequest,
  deployment: &AzureDeployment
) -> ChatRequest
  RETURN ChatRequest {
    deployment_id: deployment.deployment_id.clone(),
    messages: request.messages.iter().map(|m| ChatMessage {
      role: m.role.clone(),
      content: m.content.clone(),
      name: m.name.clone(),
      tool_calls: m.tool_calls.clone(),
      tool_call_id: m.tool_call_id.clone()
    }).collect(),
    temperature: request.temperature,
    top_p: request.top_p,
    max_tokens: request.max_tokens,
    stop: request.stop.clone(),
    presence_penalty: request.presence_penalty,
    frequency_penalty: request.frequency_penalty,
    tools: request.tools.clone(),
    tool_choice: request.tool_choice.clone(),
    user: request.user.clone()
  }
END FUNCTION

FUNCTION convert_to_unified_response(response: ChatResponse) -> UnifiedModelResponse
  RETURN UnifiedModelResponse {
    id: response.id,
    provider: "azure-openai",
    model: response.model,
    choices: response.choices.iter().map(|c| UnifiedChoice {
      index: c.index,
      message: UnifiedMessage {
        role: c.message.role.clone(),
        content: c.message.content.clone(),
        tool_calls: c.message.tool_calls.clone()
      },
      finish_reason: c.finish_reason.clone()
    }).collect(),
    usage: UnifiedUsage {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens
    },
    // Include provider-specific metadata
    metadata: UnifiedMetadata {
      provider_specific: json!({
        "prompt_filter_results": response.prompt_filter_results,
        "system_fingerprint": response.system_fingerprint
      })
    }
  }
END FUNCTION
```

---

## 12. RuvVector Integration

### 12.1 Embedding Storage

```
STRUCT AzureOpenAIEmbeddingStorage {
  client: Arc<AzureOpenAIClient>,
  embedding_deployment_id: String,
  database: Arc<DatabaseConnection>
}

IMPL EmbeddingStorage FOR AzureOpenAIEmbeddingStorage {
  ASYNC FUNCTION store_embedding(
    text: &str,
    metadata: EmbeddingMetadata
  ) -> Result<EmbeddingId, Error>
    // Step 1: Generate embedding via Azure OpenAI
    embedding_response <- self.client.embeddings().create(EmbeddingRequest {
      deployment_id: self.embedding_deployment_id.clone(),
      input: EmbeddingInput::Single(text.to_string()),
      dimensions: None,
      encoding_format: Some("float".to_string())
    }).await?

    embedding_vector <- embedding_response.data[0].embedding.clone()

    // Step 2: Store in RuvVector (PostgreSQL with pgvector)
    id <- self.database.execute(
      "INSERT INTO embeddings (vector, text, metadata, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id",
      params![
        &embedding_vector as &[f32],
        text,
        &serde_json::to_value(&metadata)?
      ]
    ).await?.get::<Uuid>(0)

    RETURN Ok(EmbeddingId(id))
  END FUNCTION

  ASYNC FUNCTION search_similar(
    query: &str,
    limit: usize,
    filter: Option<MetadataFilter>
  ) -> Result<Vec<SimilarityResult>, Error>
    // Step 1: Generate query embedding
    query_embedding <- self.client.embeddings().create(EmbeddingRequest {
      deployment_id: self.embedding_deployment_id.clone(),
      input: EmbeddingInput::Single(query.to_string()),
      dimensions: None,
      encoding_format: Some("float".to_string())
    }).await?

    query_vector <- query_embedding.data[0].embedding.clone()

    // Step 2: Build similarity search query
    sql <- "
      SELECT id, text, metadata,
             1 - (vector <=> $1::vector) as similarity
      FROM embeddings
    "

    // Add filter conditions if provided
    IF filter IS Some THEN
      sql <- sql + build_filter_clause(filter)
    END IF

    sql <- sql + " ORDER BY vector <=> $1::vector LIMIT $2"

    // Step 3: Execute query
    rows <- self.database.query(
      sql,
      params![&query_vector as &[f32], limit as i64]
    ).await?

    // Step 4: Map results
    results <- rows.iter().map(|row| SimilarityResult {
      id: EmbeddingId(row.get::<Uuid>("id")),
      text: row.get::<String>("text"),
      metadata: serde_json::from_value(row.get("metadata")).ok(),
      similarity: row.get::<f64>("similarity")
    }).collect()

    RETURN Ok(results)
  END FUNCTION

  ASYNC FUNCTION delete_embedding(id: EmbeddingId) -> Result<(), Error>
    self.database.execute(
      "DELETE FROM embeddings WHERE id = $1",
      params![id.0]
    ).await?

    RETURN Ok(())
  END FUNCTION
}
```

### 12.2 Batch Embedding Operations

```
ASYNC FUNCTION store_embeddings_batch(
  storage: &AzureOpenAIEmbeddingStorage,
  items: Vec<(String, EmbeddingMetadata)>,
  batch_size: usize
) -> Result<Vec<EmbeddingId>, Error>
  ids <- []

  // Process in batches to avoid rate limits and memory issues
  FOR EACH batch IN items.chunks(batch_size) DO
    // Extract texts for batch embedding
    texts <- batch.iter().map(|(text, _)| text.clone()).collect::<Vec<_>>()

    // Generate embeddings for batch
    embedding_response <- storage.client.embeddings().create(EmbeddingRequest {
      deployment_id: storage.embedding_deployment_id.clone(),
      input: EmbeddingInput::Multiple(texts.clone()),
      dimensions: None,
      encoding_format: Some("float".to_string())
    }).await?

    // Store each embedding with its metadata
    FOR i IN 0..batch.len() DO
      (text, metadata) <- &batch[i]
      embedding_vector <- &embedding_response.data[i].embedding

      id <- storage.database.execute(
        "INSERT INTO embeddings (vector, text, metadata, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id",
        params![
          embedding_vector as &[f32],
          text,
          &serde_json::to_value(metadata)?
        ]
      ).await?.get::<Uuid>(0)

      ids.push(EmbeddingId(id))
    END FOR
  END FOR

  RETURN Ok(ids)
END FUNCTION
```

---

## 13. Configuration Validation

### 13.1 Config Validation

```
FUNCTION validate_config(config: &AzureOpenAIConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate deployments
  IF config.deployments.is_empty() THEN
    errors.push("At least one deployment must be configured")
  END IF

  FOR EACH deployment IN config.deployments DO
    IF deployment.deployment_id.is_empty() THEN
      errors.push("Deployment ID cannot be empty")
    END IF
    IF deployment.resource_name.is_empty() THEN
      errors.push(format("Resource name missing for deployment {}", deployment.deployment_id))
    END IF
    IF NOT is_valid_api_version(&deployment.api_version) THEN
      errors.push(format("Invalid API version: {}", deployment.api_version))
    END IF
  END FOR

  // Validate timeout
  IF config.timeout < Duration::from_secs(1) THEN
    errors.push("Timeout must be at least 1 second")
  END IF
  IF config.timeout > Duration::from_secs(600) THEN
    errors.push("Timeout must not exceed 10 minutes")
  END IF

  // Return errors if any
  IF NOT errors.is_empty() THEN
    RETURN Error(ValidationError::InvalidConfig { errors })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION is_valid_api_version(version: &str) -> bool
  // Valid formats: YYYY-MM-DD or YYYY-MM-DD-preview
  regex <- Regex::new(r"^\d{4}-\d{2}-\d{2}(-preview)?$")
  RETURN regex.is_match(version)
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial pseudocode |

---

**End of Pseudocode Phase**

*Next Phase: Refinement — optimization, edge cases, and production hardening.*

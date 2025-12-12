# SPARC Phase 4: Refinement — Azure OpenAI Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/azure/openai`

*Review, optimize, and harden the design before implementation*

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Chat Completions API | ✅ Covered | Pseudocode §6, ChatService |
| Streaming Chat Completions | ✅ Covered | Pseudocode §8, SSE parsing |
| Embeddings API | ✅ Covered | Pseudocode §7, EmbeddingService |
| Image Generation (DALL-E) | ✅ Covered | Architecture §3.2, ImageService |
| Audio Transcription (Whisper) | ✅ Covered | Architecture §3.2, AudioService |
| Deployment-based routing | ✅ Covered | Pseudocode §3, DeploymentRegistry |
| API version management | ✅ Covered | Pseudocode §4, UrlBuilder |
| API Key authentication | ✅ Covered | Pseudocode §5.2 |
| Azure AD authentication | ✅ Covered | Pseudocode §5.3 |
| Managed Identity auth | ✅ Covered | Pseudocode §5.4 |
| Content filter handling | ✅ Covered | Pseudocode §9 |
| Function calling / Tools | ✅ Covered | Pseudocode §6.1, request body |
| Vision (GPT-4o) | ✅ Covered | Implied in ChatService |
| Retry with backoff | ✅ Covered | Pseudocode §10.2, RetryClassifier |
| Circuit breaker | ✅ Covered | Pseudocode §10.3 |
| Tracing integration | ✅ Covered | Uses shared/observability |
| Structured logging | ✅ Covered | Uses shared/observability |
| Error taxonomy | ✅ Covered | Pseudocode §10.1 |
| RuvVector embeddings | ✅ Covered | Pseudocode §12 |
| Platform ModelAdapter | ✅ Covered | Pseudocode §11 |

### 1.2 Architecture Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Thin Adapter Pattern | ✅ | Only Azure-specific logic in module |
| Dependency Inversion | ✅ | All deps injected via traits |
| Deployment Abstraction | ✅ | DeploymentRegistry hides resource details |
| Interface Segregation | ✅ | Separate service traits per capability |
| No Azure SDK dependency | ✅ | Custom HTTP client, credential handling |
| No cross-module deps | ✅ | Self-contained module |
| London-School TDD ready | ✅ | All collaborators mockable |
| Shared infrastructure reuse | ✅ | Credentials, resilience, observability |

### 1.3 Security Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| API keys never logged | ✅ | SecretString wrapper, redacted Debug |
| Azure AD tokens never logged | ✅ | CachedToken not in logs |
| TLS enforced | ✅ | HTTPS only, TLS 1.2+ required |
| Token refresh before expiry | ✅ | 5-minute buffer in token provider |
| Prompt content not logged | ✅ | Only metadata logged |
| Model outputs not logged | ✅ | Only token counts logged |
| Content filter results logged | ✅ | Category/severity only, not content |

---

## 2. Edge Case Analysis

### 2.1 Deployment Resolution Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT RESOLUTION EDGE CASES                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Model Hint Ambiguity                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Multiple deployments for same model family                │    │
│  │  - "gpt4-production" (eastus, gpt-4)                                │    │
│  │  - "gpt4-development" (westus2, gpt-4)                              │    │
│  │  - "gpt4-experiment" (eastus, gpt-4-turbo)                          │    │
│  │                                                                      │    │
│  │  Resolution strategy:                                                │    │
│  │  fn resolve_by_model(hint: &str) -> Result<&AzureDeployment, Error> │    │
│  │  {                                                                   │    │
│  │      // 1. Exact deployment_id match (highest priority)             │    │
│  │      if let Some(dep) = self.deployments.get(hint) {                │    │
│  │          return Ok(dep);                                            │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // 2. Model family match - return FIRST registered             │    │
│  │      //    (deterministic based on registration order)              │    │
│  │      let family = parse_model_family_from_hint(hint)?;              │    │
│  │      if let Some(ids) = self.by_model_family.get(&family) {         │    │
│  │          if let Some(first) = ids.first() {                         │    │
│  │              return Ok(self.deployments.get(first).unwrap());       │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // 3. No match                                                 │    │
│  │      Err(DeploymentNotFound { hint })                               │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  Best Practice: Users should use exact deployment_id for            │    │
│  │  deterministic routing in production.                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Deployment Configuration Drift                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Deployment deleted/renamed in Azure Portal but still     │    │
│  │  configured in client                                                │    │
│  │                                                                      │    │
│  │  Detection: Azure returns 404 with error:                           │    │
│  │  { "error": { "code": "DeploymentNotFound", ... } }                 │    │
│  │                                                                      │    │
│  │  Handling:                                                          │    │
│  │  fn handle_deployment_not_found(                                    │    │
│  │      deployment_id: &str,                                           │    │
│  │      resource_name: &str                                            │    │
│  │  ) -> AzureOpenAIError {                                            │    │
│  │      AzureOpenAIError::DeploymentNotFound {                         │    │
│  │          deployment_id: deployment_id.to_string(),                  │    │
│  │          suggestion: format!(                                       │    │
│  │              "Deployment '{}' not found in resource '{}'. "         │    │
│  │              "Verify deployment exists in Azure Portal and "        │    │
│  │              "configuration is up-to-date.",                        │    │
│  │              deployment_id, resource_name                           │    │
│  │          )                                                          │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Cross-Region Deployment Access                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Deployment in eastus, client configured with westus2     │    │
│  │  resource                                                            │    │
│  │                                                                      │    │
│  │  Azure Behavior: Each resource has its own endpoint; deployments    │    │
│  │  are scoped to the resource, not cross-region accessible            │    │
│  │                                                                      │    │
│  │  Solution: Deployment config includes resource_name explicitly      │    │
│  │  struct AzureDeployment {                                           │    │
│  │      deployment_id: String,                                         │    │
│  │      resource_name: String,  // Required, not optional              │    │
│  │      region: AzureRegion,    // For documentation/routing           │    │
│  │      ...                                                            │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 API Version Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      API VERSION EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Feature Availability by API Version                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Feature matrix:                                                     │    │
│  │  ┌──────────────────────────────┬─────────────┬─────────────────┐   │    │
│  │  │ Feature                      │ 2024-02-01  │ 2024-06-01      │   │    │
│  │  ├──────────────────────────────┼─────────────┼─────────────────┤   │    │
│  │  │ Chat completions             │ ✅          │ ✅              │   │    │
│  │  │ Function calling             │ ✅          │ ✅              │   │    │
│  │  │ JSON mode                    │ ✅          │ ✅              │   │    │
│  │  │ Vision (GPT-4o)              │ ❌          │ ✅              │   │    │
│  │  │ Parallel function calls      │ ❌          │ ✅              │   │    │
│  │  │ stream_options.include_usage │ ❌          │ ✅              │   │    │
│  │  │ Structured outputs           │ ❌          │ Preview only    │   │    │
│  │  └──────────────────────────────┴─────────────┴─────────────────┘   │    │
│  │                                                                      │    │
│  │  Validation:                                                         │    │
│  │  fn validate_request_for_api_version(                               │    │
│  │      request: &ChatRequest,                                         │    │
│  │      api_version: &str                                              │    │
│  │  ) -> Result<(), ValidationError> {                                 │    │
│  │      let version = parse_api_version(api_version)?;                 │    │
│  │                                                                      │    │
│  │      // Vision requires 2024-06-01+                                 │    │
│  │      if request.has_image_content() && version < V2024_06_01 {      │    │
│  │          return Err(ValidationError::FeatureRequiresNewerApiVersion {│    │
│  │              feature: "vision",                                     │    │
│  │              current: api_version.to_string(),                      │    │
│  │              required: "2024-06-01"                                 │    │
│  │          });                                                        │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // stream_options requires 2024-06-01+                         │    │
│  │      if request.stream_options.is_some() && version < V2024_06_01 { │    │
│  │          return Err(ValidationError::FeatureRequiresNewerApiVersion {│    │
│  │              feature: "stream_options",                             │    │
│  │              current: api_version.to_string(),                      │    │
│  │              required: "2024-06-01"                                 │    │
│  │          });                                                        │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Preview API Versions                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Using preview features (e.g., 2024-08-01-preview)        │    │
│  │                                                                      │    │
│  │  Handling:                                                          │    │
│  │  - Allow preview versions but log warning                           │    │
│  │  - Preview features may change without notice                       │    │
│  │                                                                      │    │
│  │  fn validate_api_version(version: &str) -> Result<(), Error> {      │    │
│  │      if !is_valid_format(version) {                                 │    │
│  │          return Err(ValidationError::InvalidApiVersion(version));   │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      if version.contains("-preview") {                              │    │
│  │          tracing::warn!(                                            │    │
│  │              api_version = %version,                                │    │
│  │              "Using preview API version. Features may change."      │    │
│  │          );                                                         │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // Check if version is deprecated                              │    │
│  │      if is_deprecated(version) {                                    │    │
│  │          tracing::warn!(                                            │    │
│  │              api_version = %version,                                │    │
│  │              "API version is deprecated. Consider upgrading."       │    │
│  │          );                                                         │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Authentication Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION EDGE CASES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Token Expiration During Long Streaming Request                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Azure AD token expires while streaming response          │    │
│  │  (streaming can take minutes for large responses)                   │    │
│  │                                                                      │    │
│  │  Azure Behavior: Connection continues with existing token;          │    │
│  │  token is validated at request start only                           │    │
│  │                                                                      │    │
│  │  Mitigation: Ensure token valid for expected request duration       │    │
│  │  fn get_auth_header_with_buffer(                                    │    │
│  │      &self,                                                         │    │
│  │      expected_duration: Duration                                    │    │
│  │  ) -> Result<(String, String), Error> {                             │    │
│  │      let required_validity = expected_duration + TOKEN_REFRESH_BUFFER;│   │
│  │                                                                      │    │
│  │      let cached = self.cached_token.read().await;                   │    │
│  │      if let Some(token) = cached.as_ref() {                         │    │
│  │          let remaining = token.expires_at.saturating_duration_since( │    │
│  │              Instant::now()                                         │    │
│  │          );                                                         │    │
│  │          if remaining >= required_validity {                        │    │
│  │              return Ok(("Authorization", format!("Bearer {}", token.access_token)));│
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │      drop(cached);                                                  │    │
│  │                                                                      │    │
│  │      // Refresh needed                                              │    │
│  │      self.refresh().await?;                                         │    │
│  │      // ... return new token                                        │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Concurrent Token Refresh                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Multiple requests trigger token refresh simultaneously   │    │
│  │                                                                      │    │
│  │  Problem: Thundering herd to Azure AD token endpoint               │    │
│  │                                                                      │    │
│  │  Solution: Use Mutex to serialize refresh operations                │    │
│  │  struct AzureAdTokenProvider {                                      │    │
│  │      cached_token: RwLock<Option<CachedToken>>,                     │    │
│  │      refresh_mutex: Mutex<()>,  // Serialize refreshes             │    │
│  │      ...                                                            │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  async fn refresh(&self) -> Result<(), Error> {                     │    │
│  │      // Acquire refresh lock                                        │    │
│  │      let _guard = self.refresh_mutex.lock().await;                  │    │
│  │                                                                      │    │
│  │      // Double-check: another thread may have refreshed             │    │
│  │      let cached = self.cached_token.read().await;                   │    │
│  │      if let Some(token) = cached.as_ref() {                         │    │
│  │          if token.expires_at > Instant::now() + TOKEN_REFRESH_BUFFER {│   │
│  │              return Ok(());  // Already refreshed                   │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │      drop(cached);                                                  │    │
│  │                                                                      │    │
│  │      // Actually refresh                                            │    │
│  │      let new_token = self.acquire_token().await?;                   │    │
│  │      let mut cached = self.cached_token.write().await;              │    │
│  │      *cached = Some(new_token);                                     │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Managed Identity Unavailable                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Running in environment without managed identity          │    │
│  │  (local dev, non-Azure Kubernetes, etc.)                            │    │
│  │                                                                      │    │
│  │  Detection: IMDS endpoint unreachable or returns 400                │    │
│  │                                                                      │    │
│  │  Handling:                                                          │    │
│  │  async fn acquire_token_imds(&self) -> Result<TokenResponse, Error> {│   │
│  │      let response = self.http_client                                │    │
│  │          .get(IMDS_ENDPOINT)                                        │    │
│  │          .header("Metadata", "true")                                │    │
│  │          .timeout(Duration::from_secs(1))  // Fast fail             │    │
│  │          .send()                                                    │    │
│  │          .await;                                                    │    │
│  │                                                                      │    │
│  │      match response {                                               │    │
│  │          Err(e) if e.is_connect() => {                              │    │
│  │              Err(AuthenticationError::ManagedIdentityUnavailable {  │    │
│  │                  message: "IMDS endpoint not reachable. "           │    │
│  │                      "Managed identity may not be configured "      │    │
│  │                      "or not running in Azure environment.",        │    │
│  │                  source: e                                          │    │
│  │              })                                                     │    │
│  │          },                                                         │    │
│  │          Err(e) if e.is_timeout() => {                              │    │
│  │              Err(AuthenticationError::ManagedIdentityUnavailable {  │    │
│  │                  message: "IMDS endpoint timed out.",               │    │
│  │                  source: e                                          │    │
│  │              })                                                     │    │
│  │          },                                                         │    │
│  │          Ok(resp) if resp.status() == 400 => {                      │    │
│  │              Err(AuthenticationError::ManagedIdentityNotConfigured {│    │
│  │                  message: "Managed identity not assigned to this resource."│
│  │              })                                                     │    │
│  │          },                                                         │    │
│  │          Ok(resp) => { /* parse token */ }                          │    │
│  │          ...                                                        │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 4: Multiple Azure Resources with Different Auth                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Different deployments use different Azure resources      │    │
│  │  with different authentication methods                              │    │
│  │                                                                      │    │
│  │  Solution: Per-resource credential provider mapping                 │    │
│  │  struct AzureOpenAIClientImpl {                                     │    │
│  │      // Default credentials (used if no per-resource override)     │    │
│  │      default_credentials: Arc<dyn AzureCredentialProvider>,         │    │
│  │      // Optional per-resource overrides                             │    │
│  │      resource_credentials: HashMap<String, Arc<dyn AzureCredentialProvider>>,│
│  │      ...                                                            │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  fn get_credentials_for_deployment(                                 │    │
│  │      &self,                                                         │    │
│  │      deployment: &AzureDeployment                                   │    │
│  │  ) -> Arc<dyn AzureCredentialProvider> {                            │    │
│  │      self.resource_credentials                                      │    │
│  │          .get(&deployment.resource_name)                            │    │
│  │          .cloned()                                                  │    │
│  │          .unwrap_or_else(|| self.default_credentials.clone())       │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Content Filter Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTENT FILTER EDGE CASES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Prompt Filtered Before Processing                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Content filter rejects prompt; no completion generated   │    │
│  │                                                                      │    │
│  │  Response: HTTP 400 with content_filter error code                  │    │
│  │  {                                                                  │    │
│  │    "error": {                                                       │    │
│  │      "code": "content_filter",                                      │    │
│  │      "message": "The prompt was filtered...",                       │    │
│  │      "innererror": {                                                │    │
│  │        "code": "ResponsibleAIPolicyViolation",                      │    │
│  │        "content_filter_result": {                                   │    │
│  │          "hate": { "filtered": true, "severity": "high" }           │    │
│  │        }                                                            │    │
│  │      }                                                              │    │
│  │    }                                                                │    │
│  │  }                                                                  │    │
│  │                                                                      │    │
│  │  Handling:                                                          │    │
│  │  fn parse_content_filter_error(                                     │    │
│  │      error_body: &AzureErrorResponse                                │    │
│  │  ) -> AzureOpenAIError {                                            │    │
│  │      let inner = error_body.error.innererror.as_ref();              │    │
│  │      let filter_result = inner                                      │    │
│  │          .and_then(|i| i.content_filter_result.as_ref());           │    │
│  │                                                                      │    │
│  │      // Extract which category triggered the filter                 │    │
│  │      let violated_category = filter_result                          │    │
│  │          .map(extract_violated_category)                            │    │
│  │          .flatten();                                                │    │
│  │                                                                      │    │
│  │      AzureOpenAIError::ContentFiltered {                            │    │
│  │          message: error_body.error.message.clone(),                 │    │
│  │          category: violated_category,                               │    │
│  │          severity: filter_result                                    │    │
│  │              .and_then(|r| r.get_max_severity()),                   │    │
│  │          source: ContentFilterSource::Prompt                        │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Completion Filtered Mid-Stream                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Streaming response cut off due to content filter         │    │
│  │                                                                      │    │
│  │  Response: Final chunk has finish_reason: "content_filter"          │    │
│  │  {                                                                  │    │
│  │    "choices": [{                                                    │    │
│  │      "delta": {},                                                   │    │
│  │      "finish_reason": "content_filter",                             │    │
│  │      "content_filter_results": {                                    │    │
│  │        "violence": { "filtered": true, "severity": "medium" }       │    │
│  │      }                                                              │    │
│  │    }]                                                               │    │
│  │  }                                                                  │    │
│  │                                                                      │    │
│  │  Handling in stream:                                                │    │
│  │  fn process_stream_chunk(chunk: &ChatChunk) -> StreamItem {         │    │
│  │      for choice in &chunk.choices {                                 │    │
│  │          if choice.finish_reason.as_deref() == Some("content_filter") {│  │
│  │              // Emit partial content received so far, then error    │    │
│  │              return StreamItem::FilteredCompletion {                │    │
│  │                  partial_content: self.accumulated_content.clone(), │    │
│  │                  filter_results: choice.content_filter_results.clone()│   │
│  │              };                                                     │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │      // ... normal processing                                       │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Content Filter Disabled on Resource                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Azure resource has content filtering disabled            │    │
│  │  (requires Microsoft approval)                                      │    │
│  │                                                                      │    │
│  │  Response: No content_filter_results in response                    │    │
│  │                                                                      │    │
│  │  Handling: Treat missing filter results as "not applicable"        │    │
│  │  fn extract_content_filter_results(                                 │    │
│  │      response: &ChatResponse                                        │    │
│  │  ) -> Option<Vec<ContentFilterResult>> {                            │    │
│  │      // Return None if no filter results (filtering disabled)       │    │
│  │      // Don't treat as error                                        │    │
│  │      response.prompt_filter_results.clone()                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Streaming Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STREAMING EDGE CASES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Partial SSE Event in Buffer                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: TCP packet boundary splits SSE event                     │    │
│  │  Packet 1: "data: {\"id\":\"chat"                                   │    │
│  │  Packet 2: "cmpl-123\",\"choices\":...}\n\n"                        │    │
│  │                                                                      │    │
│  │  Handling: Buffer until complete event (double newline)             │    │
│  │  struct SseParser {                                                 │    │
│  │      buffer: String,                                                │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  fn try_parse_event(&mut self) -> Option<SseEvent> {                │    │
│  │      // Only parse if we have a complete event                      │    │
│  │      let end_marker = self.buffer.find("\n\n")?;                    │    │
│  │                                                                      │    │
│  │      // Extract complete event                                      │    │
│  │      let event_str = self.buffer[..end_marker].to_string();         │    │
│  │      self.buffer = self.buffer[end_marker + 2..].to_string();       │    │
│  │                                                                      │    │
│  │      // Parse event                                                 │    │
│  │      parse_sse_event(&event_str)                                    │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Connection Drop Mid-Stream                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Network error during streaming response                  │    │
│  │                                                                      │    │
│  │  Handling: Emit partial content with error                          │    │
│  │  impl Stream for ChatStream {                                       │    │
│  │      fn poll_next(...) -> Poll<Option<Result<ChatChunk, Error>>> {  │    │
│  │          match self.inner_stream.poll_next(cx) {                    │    │
│  │              Poll::Ready(Some(Err(e))) => {                         │    │
│  │                  // Record partial completion for observability     │    │
│  │                  self.observability.metrics.record_stream_error(    │    │
│  │                      deployment: &self.deployment_id,               │    │
│  │                      chunks_received: self.chunk_count,             │    │
│  │                      error_type: e.error_type()                     │    │
│  │                  );                                                 │    │
│  │                                                                      │    │
│  │                  Poll::Ready(Some(Err(AzureOpenAIError::StreamInterrupted {│
│  │                      chunks_received: self.chunk_count,             │    │
│  │                      partial_content: self.accumulated_content.clone(),│  │
│  │                      source: e                                      │    │
│  │                  })))                                               │    │
│  │              },                                                     │    │
│  │              ...                                                    │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Empty Stream Response                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Stream ends immediately with only [DONE]                 │    │
│  │                                                                      │    │
│  │  Possible causes:                                                   │    │
│  │  - max_tokens: 0                                                    │    │
│  │  - Content filter blocked immediately                               │    │
│  │  - Model returned empty response                                    │    │
│  │                                                                      │    │
│  │  Handling: Emit empty completion, not an error                      │    │
│  │  fn finalize_stream(&mut self) -> StreamResult {                    │    │
│  │      if self.chunk_count == 0 {                                     │    │
│  │          tracing::debug!(                                           │    │
│  │              deployment_id = %self.deployment_id,                   │    │
│  │              "Stream completed with no content chunks"              │    │
│  │          );                                                         │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // Record metrics even for empty streams                       │    │
│  │      self.observability.metrics.record_stream_complete(             │    │
│  │          deployment: &self.deployment_id,                           │    │
│  │          chunks: self.chunk_count,                                  │    │
│  │          usage: self.accumulated_usage.as_ref()                     │    │
│  │      );                                                             │    │
│  │                                                                      │    │
│  │      StreamResult::Complete                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 4: Backpressure Handling                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Consumer processes chunks slower than Azure sends them   │    │
│  │                                                                      │    │
│  │  Strategy: Bounded channel with backpressure                        │    │
│  │  const STREAM_BUFFER_SIZE: usize = 100;                             │    │
│  │                                                                      │    │
│  │  async fn create_buffered_stream(                                   │    │
│  │      raw_stream: ByteStream                                         │    │
│  │  ) -> impl Stream<Item = Result<ChatChunk, Error>> {                │    │
│  │      let (tx, rx) = mpsc::channel(STREAM_BUFFER_SIZE);              │    │
│  │                                                                      │    │
│  │      // Spawn producer task                                         │    │
│  │      tokio::spawn(async move {                                      │    │
│  │          let mut parser = SseParser::new(raw_stream);               │    │
│  │          while let Some(event) = parser.next().await {              │    │
│  │              // Bounded send - applies backpressure                 │    │
│  │              if tx.send(event).await.is_err() {                     │    │
│  │                  break;  // Receiver dropped                        │    │
│  │              }                                                      │    │
│  │          }                                                          │    │
│  │      });                                                            │    │
│  │                                                                      │    │
│  │      ReceiverStream::new(rx)                                        │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Performance Optimization

### 3.1 Connection Pooling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CONNECTION POOLING                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Configuration:                                                              │
│  struct HttpTransportConfig {                                               │
│      // Per-host connection pool                                            │
│      pool_max_idle_per_host: usize,  // Default: 10                        │
│      pool_idle_timeout: Duration,     // Default: 90s                       │
│                                                                              │
│      // Connection settings                                                 │
│      connect_timeout: Duration,       // Default: 10s                       │
│      tcp_keepalive: Duration,         // Default: 60s                       │
│                                                                              │
│      // TLS settings                                                        │
│      min_tls_version: TlsVersion,     // Default: TLS 1.2                  │
│  }                                                                           │
│                                                                              │
│  Per-Resource Pools:                                                        │
│  - Azure OpenAI uses different hostnames per resource                       │
│  - myorg-eastus.openai.azure.com                                           │
│  - myorg-westus.openai.azure.com                                           │
│  - Connection pool is per-host, so separate pools per resource             │
│                                                                              │
│  Recommendation:                                                            │
│  - pool_max_idle_per_host: 10-20 for production                            │
│  - Higher values for high-throughput scenarios                              │
│  - Monitor connection reuse metrics                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Token Caching Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TOKEN CACHING OPTIMIZATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Current: Simple RwLock-based cache                                         │
│                                                                              │
│  Optimization: Use atomic reference for hot-path reads                      │
│  struct AzureAdTokenProvider {                                              │
│      // Use ArcSwap for lock-free reads                                     │
│      cached_token: ArcSwap<Option<CachedToken>>,                            │
│      refresh_mutex: Mutex<()>,  // Still serialize writes                  │
│  }                                                                           │
│                                                                              │
│  async fn get_auth_header(&self) -> Result<(String, String), Error> {       │
│      // Lock-free read (hot path)                                           │
│      let cached = self.cached_token.load();                                 │
│      if let Some(token) = cached.as_ref() {                                 │
│          if token.expires_at > Instant::now() + TOKEN_REFRESH_BUFFER {      │
│              return Ok(("Authorization", format!("Bearer {}", token.access_token)));│
│          }                                                                  │
│      }                                                                       │
│                                                                              │
│      // Slow path: refresh needed                                           │
│      self.refresh().await?;                                                 │
│      // ...                                                                  │
│  }                                                                           │
│                                                                              │
│  Benchmark expectation:                                                     │
│  - Before: ~100ns per auth header (RwLock contention)                       │
│  - After: ~10ns per auth header (atomic load)                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Request Serialization Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  REQUEST SERIALIZATION OPTIMIZATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Optimization 1: Pre-size JSON buffer                                       │
│  fn serialize_chat_request(request: &ChatRequest) -> Result<Vec<u8>, Error> {│
│      // Estimate size: ~100 bytes overhead + message content                │
│      let estimated_size = 100 + request.messages.iter()                     │
│          .map(|m| m.content.as_ref().map(|c| c.len()).unwrap_or(0))        │
│          .sum::<usize>();                                                   │
│                                                                              │
│      let mut buffer = Vec::with_capacity(estimated_size);                   │
│      serde_json::to_writer(&mut buffer, request)?;                          │
│      Ok(buffer)                                                             │
│  }                                                                           │
│                                                                              │
│  Optimization 2: Skip null fields                                           │
│  #[derive(Serialize)]                                                       │
│  struct ChatRequestBody {                                                   │
│      messages: Vec<ChatMessage>,                                            │
│      #[serde(skip_serializing_if = "Option::is_none")]                     │
│      temperature: Option<f32>,                                              │
│      #[serde(skip_serializing_if = "Option::is_none")]                     │
│      max_tokens: Option<u32>,                                               │
│      // ... other optional fields with skip_serializing_if                  │
│  }                                                                           │
│                                                                              │
│  Benefit: Smaller request bodies, less network overhead                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Deployment Registry Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 DEPLOYMENT REGISTRY OPTIMIZATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Current: HashMap lookups for every request                                 │
│                                                                              │
│  Optimization: Add caching layer for resolve_by_model                       │
│  struct DeploymentRegistry {                                                │
│      deployments: HashMap<String, AzureDeployment>,                         │
│      by_model_family: HashMap<ModelFamily, Vec<String>>,                    │
│      // Cache for model hint resolution                                     │
│      hint_cache: DashMap<String, String>,  // hint -> deployment_id        │
│  }                                                                           │
│                                                                              │
│  fn resolve_by_model(&self, hint: &str) -> Result<&AzureDeployment, Error> {│
│      // Check cache first                                                   │
│      if let Some(cached_id) = self.hint_cache.get(hint) {                  │
│          return self.deployments.get(cached_id.as_str())                   │
│              .ok_or_else(|| DeploymentNotFound { hint });                   │
│      }                                                                       │
│                                                                              │
│      // Resolve and cache                                                   │
│      let deployment = self.resolve_by_model_uncached(hint)?;               │
│      self.hint_cache.insert(                                                │
│          hint.to_string(),                                                  │
│          deployment.deployment_id.clone()                                   │
│      );                                                                      │
│                                                                              │
│      Ok(deployment)                                                         │
│  }                                                                           │
│                                                                              │
│  Note: Cache invalidation on registry updates                               │
│  fn register(&mut self, deployment: AzureDeployment) {                      │
│      self.hint_cache.clear();  // Invalidate cache                         │
│      // ... rest of registration                                            │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Security Hardening

### 4.1 Secret Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECRET HANDLING                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  API Key Protection:                                                        │
│  /// Wrapper that prevents accidental logging of secrets                    │
│  pub struct SecretString(String);                                           │
│                                                                              │
│  impl SecretString {                                                        │
│      pub fn expose(&self) -> &str { &self.0 }                              │
│  }                                                                           │
│                                                                              │
│  impl std::fmt::Debug for SecretString {                                    │
│      fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {  │
│          write!(f, "[REDACTED]")                                            │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
│  impl std::fmt::Display for SecretString {                                  │
│      fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {  │
│          write!(f, "[REDACTED]")                                            │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
│  // Zeroize on drop                                                         │
│  impl Drop for SecretString {                                               │
│      fn drop(&mut self) {                                                   │
│          self.0.zeroize();                                                  │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
│  Usage:                                                                      │
│  struct ApiKeyCredentialProvider {                                          │
│      api_key: SecretString,  // Never accidentally logged                  │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Request/Response Sanitization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   REQUEST/RESPONSE SANITIZATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Never log:                                                                  │
│  - API keys                                                                  │
│  - Azure AD tokens                                                          │
│  - Prompt content                                                           │
│  - Completion content                                                        │
│  - User identifiers in PII contexts                                         │
│                                                                              │
│  Safe to log:                                                               │
│  - Deployment ID                                                            │
│  - Resource name                                                            │
│  - API version                                                              │
│  - Token counts                                                             │
│  - Latency metrics                                                          │
│  - Error codes (not messages with user content)                             │
│  - Content filter categories/severities                                     │
│                                                                              │
│  Implementation:                                                            │
│  fn log_request_metadata(                                                   │
│      deployment_id: &str,                                                   │
│      message_count: usize,                                                  │
│      has_system_prompt: bool,                                               │
│      has_tools: bool                                                        │
│  ) {                                                                         │
│      tracing::info!(                                                        │
│          deployment_id = %deployment_id,                                    │
│          message_count = message_count,                                     │
│          has_system_prompt = has_system_prompt,                             │
│          has_tools = has_tools,                                             │
│          "Sending chat completion request"                                  │
│      );                                                                      │
│      // Note: NO message content logged                                     │
│  }                                                                           │
│                                                                              │
│  fn log_response_metadata(                                                  │
│      deployment_id: &str,                                                   │
│      prompt_tokens: u32,                                                    │
│      completion_tokens: u32,                                                │
│      finish_reason: &str,                                                   │
│      latency_ms: u64                                                        │
│  ) {                                                                         │
│      tracing::info!(                                                        │
│          deployment_id = %deployment_id,                                    │
│          prompt_tokens = prompt_tokens,                                     │
│          completion_tokens = completion_tokens,                             │
│          finish_reason = %finish_reason,                                    │
│          latency_ms = latency_ms,                                           │
│          "Chat completion response received"                                │
│      );                                                                      │
│      // Note: NO completion content logged                                  │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INPUT VALIDATION                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Deployment ID Validation:                                                  │
│  fn validate_deployment_id(id: &str) -> Result<(), ValidationError> {       │
│      // Azure deployment names: alphanumeric, hyphens, underscores         │
│      // Length: 1-64 characters                                            │
│      if id.is_empty() || id.len() > 64 {                                   │
│          return Err(ValidationError::InvalidDeploymentId {                  │
│              id: id.to_string(),                                           │
│              reason: "must be 1-64 characters"                             │
│          });                                                                │
│      }                                                                       │
│                                                                              │
│      if !id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') { │
│          return Err(ValidationError::InvalidDeploymentId {                  │
│              id: id.to_string(),                                           │
│              reason: "must contain only alphanumeric, hyphen, underscore"  │
│          });                                                                │
│      }                                                                       │
│                                                                              │
│      Ok(())                                                                  │
│  }                                                                           │
│                                                                              │
│  Resource Name Validation:                                                  │
│  fn validate_resource_name(name: &str) -> Result<(), ValidationError> {     │
│      // Azure resource names: alphanumeric, hyphens                         │
│      // Length: 2-64 characters, must start/end with alphanumeric          │
│      if name.len() < 2 || name.len() > 64 {                                │
│          return Err(ValidationError::InvalidResourceName { ... });          │
│      }                                                                       │
│                                                                              │
│      let first = name.chars().next().unwrap();                             │
│      let last = name.chars().last().unwrap();                              │
│      if !first.is_alphanumeric() || !last.is_alphanumeric() {              │
│          return Err(ValidationError::InvalidResourceName { ... });          │
│      }                                                                       │
│                                                                              │
│      if !name.chars().all(|c| c.is_alphanumeric() || c == '-') {           │
│          return Err(ValidationError::InvalidResourceName { ... });          │
│      }                                                                       │
│                                                                              │
│      Ok(())                                                                  │
│  }                                                                           │
│                                                                              │
│  Request Parameter Validation:                                              │
│  fn validate_chat_request(request: &ChatRequest) -> Result<(), ValidationError> {│
│      // Temperature: 0.0 to 2.0                                            │
│      if let Some(temp) = request.temperature {                              │
│          if temp < 0.0 || temp > 2.0 {                                     │
│              return Err(ValidationError::InvalidTemperature(temp));         │
│          }                                                                  │
│      }                                                                       │
│                                                                              │
│      // top_p: 0.0 to 1.0                                                  │
│      if let Some(top_p) = request.top_p {                                  │
│          if top_p < 0.0 || top_p > 1.0 {                                   │
│              return Err(ValidationError::InvalidTopP(top_p));               │
│          }                                                                  │
│      }                                                                       │
│                                                                              │
│      // max_tokens: positive                                               │
│      if let Some(max_tokens) = request.max_tokens {                         │
│          if max_tokens == 0 {                                              │
│              return Err(ValidationError::InvalidMaxTokens(max_tokens));     │
│          }                                                                  │
│      }                                                                       │
│                                                                              │
│      // Messages: at least one                                             │
│      if request.messages.is_empty() {                                       │
│          return Err(ValidationError::EmptyMessages);                        │
│      }                                                                       │
│                                                                              │
│      Ok(())                                                                  │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Reliability Improvements

### 5.1 Timeout Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TIMEOUT STRATEGY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layered Timeouts:                                                          │
│  1. Connect timeout: 10s (establish TCP connection)                         │
│  2. Request timeout: configurable (default 120s)                            │
│  3. Streaming timeout: per-chunk (default 30s between chunks)               │
│                                                                              │
│  Implementation:                                                            │
│  struct TimeoutConfig {                                                     │
│      connect_timeout: Duration,      // TCP connect                         │
│      request_timeout: Duration,       // Total request time                 │
│      stream_idle_timeout: Duration,   // Time between stream chunks        │
│  }                                                                           │
│                                                                              │
│  impl Default for TimeoutConfig {                                           │
│      fn default() -> Self {                                                 │
│          Self {                                                             │
│              connect_timeout: Duration::from_secs(10),                      │
│              request_timeout: Duration::from_secs(120),                     │
│              stream_idle_timeout: Duration::from_secs(30),                  │
│          }                                                                  │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
│  Streaming Idle Timeout:                                                    │
│  struct ChatStream {                                                        │
│      inner: SseParser,                                                      │
│      idle_timeout: Duration,                                                │
│      last_chunk_time: Instant,                                              │
│  }                                                                           │
│                                                                              │
│  impl Stream for ChatStream {                                               │
│      fn poll_next(...) -> Poll<...> {                                       │
│          // Check idle timeout                                              │
│          if self.last_chunk_time.elapsed() > self.idle_timeout {            │
│              return Poll::Ready(Some(Err(                                   │
│                  AzureOpenAIError::StreamIdleTimeout {                      │
│                      idle_duration: self.last_chunk_time.elapsed(),         │
│                      chunks_received: self.chunk_count                      │
│                  }                                                          │
│              )));                                                           │
│          }                                                                  │
│                                                                              │
│          match self.inner.poll_next(cx) {                                   │
│              Poll::Ready(Some(Ok(chunk))) => {                              │
│                  self.last_chunk_time = Instant::now();  // Reset timer    │
│                  // ...                                                     │
│              }                                                              │
│              // ...                                                         │
│          }                                                                  │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Graceful Degradation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GRACEFUL DEGRADATION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Circuit Breaker States:                                                    │
│  - Closed: Normal operation                                                 │
│  - Open: Fail fast, don't send requests                                    │
│  - Half-Open: Allow limited requests to test recovery                      │
│                                                                              │
│  Per-Deployment Circuit Breakers:                                           │
│  struct CircuitBreakerRegistry {                                            │
│      breakers: DashMap<String, CircuitBreaker>,  // deployment_id -> CB    │
│      config: CircuitBreakerConfig,                                          │
│  }                                                                           │
│                                                                              │
│  fn get_or_create_breaker(&self, deployment_id: &str) -> &CircuitBreaker {  │
│      self.breakers.entry(deployment_id.to_string())                         │
│          .or_insert_with(|| CircuitBreaker::new(self.config.clone()))      │
│          .value()                                                           │
│  }                                                                           │
│                                                                              │
│  Fallback Strategy (optional):                                              │
│  struct DeploymentWithFallback {                                            │
│      primary: AzureDeployment,                                              │
│      fallback: Option<AzureDeployment>,                                     │
│  }                                                                           │
│                                                                              │
│  async fn invoke_with_fallback(                                             │
│      &self,                                                                 │
│      request: ChatRequest                                                   │
│  ) -> Result<ChatResponse, Error> {                                         │
│      let deployment = self.deployment_registry.resolve(&request.deployment_id)?;│
│                                                                              │
│      // Try primary                                                         │
│      match self.invoke_deployment(&deployment.primary, &request).await {    │
│          Ok(response) => Ok(response),                                      │
│          Err(e) if e.is_retryable() && deployment.fallback.is_some() => {  │
│              tracing::warn!(                                                │
│                  primary = %deployment.primary.deployment_id,               │
│                  fallback = %deployment.fallback.as_ref().unwrap().deployment_id,│
│                  error = %e,                                                │
│                  "Primary deployment failed, trying fallback"               │
│              );                                                             │
│              self.invoke_deployment(                                        │
│                  deployment.fallback.as_ref().unwrap(),                     │
│                  &request                                                   │
│              ).await                                                        │
│          },                                                                 │
│          Err(e) => Err(e)                                                  │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Observability Enhancements

### 6.1 Metrics Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         METRICS SUMMARY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Request Metrics:                                                           │
│  ┌────────────────────────────────────────┬─────────┬────────────────────┐  │
│  │ Metric Name                            │ Type    │ Labels             │  │
│  ├────────────────────────────────────────┼─────────┼────────────────────┤  │
│  │ azure_openai_requests_total            │ Counter │ deployment,op,status│ │
│  │ azure_openai_request_duration_seconds  │ Histogram│ deployment,op     │  │
│  │ azure_openai_tokens_total              │ Counter │ deployment,type   │  │
│  │ azure_openai_content_filter_total      │ Counter │ deployment,category│ │
│  └────────────────────────────────────────┴─────────┴────────────────────┘  │
│                                                                              │
│  Stream Metrics:                                                            │
│  ┌────────────────────────────────────────┬─────────┬────────────────────┐  │
│  │ azure_openai_stream_chunks_total       │ Counter │ deployment         │  │
│  │ azure_openai_stream_duration_seconds   │ Histogram│ deployment        │  │
│  │ azure_openai_stream_errors_total       │ Counter │ deployment,error   │  │
│  └────────────────────────────────────────┴─────────┴────────────────────┘  │
│                                                                              │
│  Auth Metrics:                                                              │
│  ┌────────────────────────────────────────┬─────────┬────────────────────┐  │
│  │ azure_openai_token_refresh_total       │ Counter │ auth_method        │  │
│  │ azure_openai_token_refresh_errors_total│ Counter │ auth_method,error  │  │
│  └────────────────────────────────────────┴─────────┴────────────────────┘  │
│                                                                              │
│  Circuit Breaker Metrics:                                                   │
│  ┌────────────────────────────────────────┬─────────┬────────────────────┐  │
│  │ azure_openai_circuit_breaker_state     │ Gauge   │ deployment         │  │
│  │ azure_openai_circuit_breaker_trips_total│ Counter│ deployment         │  │
│  └────────────────────────────────────────┴─────────┴────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Trace Span Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TRACE SPAN HIERARCHY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Non-Streaming Request:                                                     │
│  azure_openai.chat.complete                                                 │
│  ├── azure_openai.deployment.resolve                                        │
│  ├── azure_openai.auth.get_header                                          │
│  │   └── azure_openai.auth.refresh (if needed)                             │
│  ├── azure_openai.http.request                                             │
│  │   ├── azure_openai.http.connect                                         │
│  │   ├── azure_openai.http.send                                            │
│  │   └── azure_openai.http.receive                                         │
│  ├── azure_openai.response.parse                                           │
│  └── azure_openai.content_filter.extract                                   │
│                                                                              │
│  Streaming Request:                                                         │
│  azure_openai.chat.stream                                                   │
│  ├── azure_openai.deployment.resolve                                        │
│  ├── azure_openai.auth.get_header                                          │
│  ├── azure_openai.http.request                                             │
│  └── azure_openai.stream.process                                           │
│      ├── azure_openai.stream.chunk (repeated)                              │
│      └── azure_openai.stream.finalize                                      │
│                                                                              │
│  Span Attributes:                                                           │
│  - deployment_id                                                            │
│  - resource_name                                                            │
│  - api_version                                                              │
│  - operation                                                                │
│  - message_count                                                            │
│  - prompt_tokens (on completion)                                            │
│  - completion_tokens (on completion)                                        │
│  - finish_reason (on completion)                                            │
│  - error.type (on error)                                                    │
│  - error.message (on error, sanitized)                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Test Coverage Requirements

### 7.1 Unit Test Coverage

| Component | Minimum Coverage | Critical Paths |
|-----------|------------------|----------------|
| DeploymentRegistry | 95% | resolve, resolve_by_model |
| UrlBuilder | 100% | build, all operations |
| SseParser | 95% | try_parse_event, edge cases |
| Error mapping | 100% | All HTTP status codes |
| Content filter extraction | 95% | All categories |
| Request validation | 100% | All parameters |

### 7.2 Integration Test Scenarios

| Scenario | Mock/Live | Priority |
|----------|-----------|----------|
| Chat completion success | Mock | P0 |
| Chat completion with tools | Mock | P0 |
| Streaming completion | Mock | P0 |
| Embedding generation | Mock | P0 |
| Rate limit handling | Mock | P0 |
| Auth token refresh | Mock | P0 |
| Content filter trigger | Mock | P1 |
| Circuit breaker trip | Mock | P1 |
| Connection timeout | Mock | P1 |
| Stream interruption | Mock | P1 |

### 7.3 Contract Tests

```
Contract tests ensure Azure OpenAI API compatibility:

1. Request format validation
   - JSON schema matches Azure documentation
   - All required fields present
   - Optional fields correctly omitted

2. Response parsing validation
   - Parse real Azure responses (recorded)
   - Handle all response variations
   - Content filter result structures

3. Error response validation
   - Parse all documented error codes
   - Extract innererror details
   - Retry-After header parsing
```

---

## 8. Documentation Requirements

### 8.1 API Documentation

- [ ] All public types have doc comments
- [ ] All public functions have examples
- [ ] Error types document recovery strategies
- [ ] Configuration options fully documented

### 8.2 Integration Guide

- [ ] Quick start with API key
- [ ] Azure AD setup instructions
- [ ] Managed identity configuration
- [ ] Multi-deployment configuration
- [ ] RuvVector integration example

### 8.3 Troubleshooting Guide

- [ ] Common error codes and solutions
- [ ] Authentication troubleshooting
- [ ] Rate limiting mitigation
- [ ] Content filter handling

---

## 9. Pre-Implementation Checklist

### 9.1 Design Sign-Off

- [x] Specification complete and reviewed
- [x] Architecture diagrams approved
- [x] Pseudocode reviewed for correctness
- [x] Edge cases documented
- [x] Security requirements met
- [x] Performance targets defined

### 9.2 Dependencies Verified

- [x] azure/credentials module interface defined
- [x] shared/resilience integration pattern confirmed
- [x] shared/observability hooks available
- [x] shared/database (RuvVector) schema defined

### 9.3 Test Infrastructure

- [ ] Mock server setup (WireMock or similar)
- [ ] Test fixtures for Azure responses
- [ ] CI pipeline configured
- [ ] Code coverage tooling enabled

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial refinement |

---

**End of Refinement Phase**

*Next Phase: Completion — implementation readiness and final checklist.*

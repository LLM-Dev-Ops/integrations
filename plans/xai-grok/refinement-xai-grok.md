# SPARC Phase 4: Refinement — xAI Grok Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/xai/grok`

*Review, optimize, and harden the design before implementation*

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Chat Completions API | ✅ Covered | Pseudocode §5, ChatService |
| Streaming Chat Completions | ✅ Covered | Pseudocode §6, SSE parsing |
| Embeddings API | ✅ Covered | Pseudocode §8, EmbeddingService |
| Image Generation (Grok-2-Image) | ✅ Covered | Pseudocode §9, ImageService |
| Model Registry | ✅ Covered | Pseudocode §3, all variants |
| Bearer Token authentication | ✅ Covered | Pseudocode §4 |
| Function calling / Tools | ✅ Covered | Pseudocode §5.2, request body |
| Vision (Grok-4, grok-vision-beta) | ✅ Covered | Pseudocode §5.2, multimodal |
| Reasoning content (Grok-3) | ✅ Covered | Pseudocode §7, ReasoningExtractor |
| Live Search (optional) | ✅ Covered | Pseudocode §10, feature flag |
| Retry with backoff | ✅ Covered | Pseudocode §11.2, RetryClassifier |
| Circuit breaker | ✅ Covered | Pseudocode §11.3 |
| Tracing integration | ✅ Covered | Uses shared/observability |
| Structured logging | ✅ Covered | Uses shared/observability |
| Error taxonomy | ✅ Covered | Pseudocode §11.1 |
| RuvVector embeddings | ✅ Covered | Pseudocode §13 |
| Platform ModelAdapter | ✅ Covered | Pseudocode §12 |

### 1.2 Architecture Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Thin Adapter Pattern | ✅ | Only xAI-specific logic in module |
| Dependency Inversion | ✅ | All deps injected via traits |
| Model Registry Pattern | ✅ | ModelRegistry handles all variants |
| Interface Segregation | ✅ | Separate service traits per capability |
| OpenAI-compatible API | ✅ | Leverages xAI's OpenAI format |
| No cross-module deps | ✅ | Self-contained module |
| London-School TDD ready | ✅ | All collaborators mockable |
| Shared infrastructure reuse | ✅ | Credentials, resilience, observability |

### 1.3 Security Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| API keys never logged | ✅ | SecretString wrapper, redacted Debug |
| TLS enforced | ✅ | HTTPS only, TLS 1.2+ required |
| Prompt content not logged | ✅ | Only metadata logged |
| Model outputs not logged | ✅ | Only token counts logged |
| Reasoning content not logged | ✅ | Token counts only, not content |
| Live Search queries not logged | ✅ | Only source counts for cost tracking |

---

## 2. Edge Case Analysis

### 2.1 Model Resolution Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MODEL RESOLUTION EDGE CASES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Model Alias Resolution                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Multiple aliases point to same model                     │    │
│  │  - "grok-4" -> GrokModel::Grok4                                     │    │
│  │  - "grok-4-latest" -> GrokModel::Grok4                              │    │
│  │  - "grok-3" -> GrokModel::Grok3Beta                                 │    │
│  │  - "grok-3-beta" -> GrokModel::Grok3Beta                            │    │
│  │                                                                      │    │
│  │  Resolution strategy:                                                │    │
│  │  fn resolve(hint: &str) -> Result<GrokModel, Error> {               │    │
│  │      let hint_lower = hint.to_lowercase();                          │    │
│  │                                                                      │    │
│  │      // 1. Exact match in model registry                            │    │
│  │      if let Some(model) = self.models.get(&hint_lower) {            │    │
│  │          return Ok(model.clone());                                  │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // 2. Partial match (e.g., "grok4" matches "grok-4")          │    │
│  │      for (id, model) in &self.models {                              │    │
│  │          if hint_lower.contains(id) || id.contains(&hint_lower) {   │    │
│  │              return Ok(model.clone());                              │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // 3. No match - provide helpful error                         │    │
│  │      Err(ModelNotFound {                                            │    │
│  │          hint: hint.to_string(),                                    │    │
│  │          available: self.models.keys().join(", ")                   │    │
│  │      })                                                             │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  Best Practice: Use canonical model IDs in production               │    │
│  │  (e.g., "grok-3-beta" not "grok-3")                                 │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Unknown/Future Model IDs                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: xAI releases new model (e.g., "grok-5") not in registry  │    │
│  │                                                                      │    │
│  │  Solution: GrokModel::Custom variant for forward compatibility      │    │
│  │  enum GrokModel {                                                   │    │
│  │      Grok4,                                                         │    │
│  │      Grok3Beta,                                                     │    │
│  │      // ...                                                         │    │
│  │      Custom(String),  // For unknown models                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  fn resolve_with_fallback(hint: &str) -> GrokModel {                │    │
│  │      match self.resolve(hint) {                                     │    │
│  │          Ok(model) => model,                                        │    │
│  │          Err(_) => {                                                │    │
│  │              tracing::warn!(                                        │    │
│  │                  model_hint = %hint,                                │    │
│  │                  "Unknown model, using custom variant"              │    │
│  │              );                                                     │    │
│  │              GrokModel::Custom(hint.to_string())                    │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  Note: Custom models have no capability validation                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Capability Mismatch                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Request vision with Grok-3 (no vision support)          │    │
│  │                                                                      │    │
│  │  Detection: Pre-flight capability validation                        │    │
│  │  fn validate_request_capabilities(                                  │    │
│  │      request: &GrokChatRequest,                                     │    │
│  │      model: &GrokModel,                                             │    │
│  │      registry: &ModelRegistry                                       │    │
│  │  ) -> Result<(), ValidationError> {                                 │    │
│  │      let caps = registry.get_capabilities(model);                   │    │
│  │                                                                      │    │
│  │      // Vision check                                                │    │
│  │      if has_vision_content(&request.messages) && !caps.vision {     │    │
│  │          return Err(ValidationError::CapabilityNotSupported {       │    │
│  │              capability: "vision",                                  │    │
│  │              model: model.model_id().to_string(),                   │    │
│  │              suggestion: "Use grok-4 or grok-vision-beta for vision"│    │
│  │          });                                                        │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // Image generation check                                      │    │
│  │      if request_type == ImageGeneration && !caps.image_generation { │    │
│  │          return Err(ValidationError::CapabilityNotSupported {       │    │
│  │              capability: "image_generation",                        │    │
│  │              model: model.model_id().to_string(),                   │    │
│  │              suggestion: "Use grok-2-image-1212 for image generation"│   │
│  │          });                                                        │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Reasoning Content Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REASONING CONTENT EDGE CASES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Reasoning Content on Non-Grok-3 Models                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Response includes reasoning_content from non-Grok-3 model│    │
│  │  (xAI may add reasoning to other models in future)                  │    │
│  │                                                                      │    │
│  │  Handling: Check response field presence, not just model capability │    │
│  │  fn extract_reasoning(                                              │    │
│  │      response: &GrokChatResponse,                                   │    │
│  │      model: &GrokModel,                                             │    │
│  │      registry: &ModelRegistry                                       │    │
│  │  ) -> Option<ReasoningContent> {                                    │    │
│  │      // Primary: check response for reasoning content               │    │
│  │      let reasoning_text = response.choices.get(0)                   │    │
│  │          .and_then(|c| c.reasoning_content.as_ref());               │    │
│  │                                                                      │    │
│  │      if reasoning_text.is_none() {                                  │    │
│  │          return None;                                               │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // Log if unexpected model has reasoning                       │    │
│  │      if !registry.supports_reasoning(model) {                       │    │
│  │          tracing::info!(                                            │    │
│  │              model = %model.model_id(),                             │    │
│  │              "Unexpected reasoning_content from model"              │    │
│  │          );                                                         │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Some(ReasoningContent {                                        │    │
│  │          content: reasoning_text.unwrap().clone(),                  │    │
│  │          tokens: response.usage.reasoning_tokens                    │    │
│  │      })                                                             │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Reasoning Content in Streaming                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Reasoning content arrives as delta chunks during stream  │    │
│  │                                                                      │    │
│  │  Challenge: Must accumulate reasoning across chunks                 │    │
│  │                                                                      │    │
│  │  Implementation:                                                    │    │
│  │  struct ChatStream {                                                │    │
│  │      // ... other fields                                            │    │
│  │      accumulated_reasoning: Option<String>,                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  fn process_chunk(&mut self, chunk: &ChatChunk) {                   │    │
│  │      // Accumulate reasoning delta if present                       │    │
│  │      if let Some(reasoning_delta) = chunk.choices.get(0)            │    │
│  │          .and_then(|c| c.reasoning_content.as_ref())                │    │
│  │      {                                                              │    │
│  │          match &mut self.accumulated_reasoning {                    │    │
│  │              Some(acc) => acc.push_str(reasoning_delta),            │    │
│  │              None => self.accumulated_reasoning = Some(             │    │
│  │                  reasoning_delta.clone()                            │    │
│  │              )                                                      │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  fn finalize(&self) -> StreamResult {                               │    │
│  │      StreamResult {                                                 │    │
│  │          content: self.accumulated_content.clone(),                 │    │
│  │          reasoning: self.accumulated_reasoning.clone(),             │    │
│  │          usage: self.accumulated_usage.clone()                      │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Empty Reasoning Content                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Grok-3 returns empty reasoning_content field             │    │
│  │                                                                      │    │
│  │  Handling: Treat empty string as None                               │    │
│  │  fn normalize_reasoning(content: Option<&str>) -> Option<String> {  │    │
│  │      content                                                        │    │
│  │          .filter(|s| !s.is_empty())                                 │    │
│  │          .map(|s| s.to_string())                                    │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 4: Reasoning Tokens Without Content                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Usage shows reasoning_tokens but no reasoning_content    │    │
│  │  (possible with certain request configurations)                     │    │
│  │                                                                      │    │
│  │  Handling: Still report tokens for cost tracking                    │    │
│  │  fn create_reasoning_result(                                        │    │
│  │      content: Option<String>,                                       │    │
│  │      tokens: Option<u32>                                            │    │
│  │  ) -> ReasoningResult {                                             │    │
│  │      ReasoningResult {                                              │    │
│  │          content,  // May be None                                   │    │
│  │          tokens,   // May have value even if content is None        │    │
│  │      }                                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  // Always record reasoning tokens for cost analysis                │    │
│  │  if let Some(tokens) = usage.reasoning_tokens {                     │    │
│  │      metrics.record_counter("reasoning_tokens", tokens);            │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Live Search Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LIVE SEARCH EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Live Search Cost Management                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Runaway Live Search costs ($25 per 1,000 sources)        │    │
│  │                                                                      │    │
│  │  Mitigations:                                                       │    │
│  │  1. Feature flag (disabled by default)                              │    │
│  │  2. Per-request opt-in                                              │    │
│  │  3. Source limit configuration                                      │    │
│  │  4. Cost tracking metrics                                           │    │
│  │                                                                      │    │
│  │  struct LiveSearchConfig {                                          │    │
│  │      enabled: bool,                      // Default: false          │    │
│  │      max_sources_per_request: u32,       // Default: 100            │    │
│  │      daily_source_budget: Option<u32>,   // Optional daily limit    │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  fn validate_live_search_request(                                   │    │
│  │      config: &LiveSearchConfig,                                     │    │
│  │      daily_usage: u32                                               │    │
│  │  ) -> Result<(), Error> {                                           │    │
│  │      if !config.enabled {                                           │    │
│  │          return Err(LiveSearchError::Disabled);                     │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      if let Some(budget) = config.daily_source_budget {             │    │
│  │          if daily_usage >= budget {                                 │    │
│  │              return Err(LiveSearchError::DailyBudgetExceeded {      │    │
│  │                  used: daily_usage,                                 │    │
│  │                  budget: budget                                     │    │
│  │              });                                                    │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Live Search Tool Already in Request                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: User provides custom live_search tool definition         │    │
│  │                                                                      │    │
│  │  Handling: Don't duplicate the tool                                 │    │
│  │  fn build_tools_with_live_search(                                   │    │
│  │      request_tools: Option<Vec<Tool>>,                              │    │
│  │      live_search_enabled: bool                                      │    │
│  │  ) -> Option<Vec<Tool>> {                                           │    │
│  │      let mut tools = request_tools.unwrap_or_default();             │    │
│  │                                                                      │    │
│  │      // Check if live_search already present                        │    │
│  │      let has_live_search = tools.iter().any(|t|                     │    │
│  │          t.function.name == "live_search"                           │    │
│  │      );                                                             │    │
│  │                                                                      │    │
│  │      // Only add if enabled and not already present                 │    │
│  │      if live_search_enabled && !has_live_search {                   │    │
│  │          tools.push(create_live_search_tool());                     │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      if tools.is_empty() { None } else { Some(tools) }              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Live Search on Non-Supporting Model                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: Live Search requested with Grok-2-Image                  │    │
│  │                                                                      │    │
│  │  Handling: Validate model supports function calling                 │    │
│  │  fn validate_live_search_model(                                     │    │
│  │      model: &GrokModel,                                             │    │
│  │      registry: &ModelRegistry                                       │    │
│  │  ) -> Result<(), Error> {                                           │    │
│  │      let caps = registry.get_capabilities(model);                   │    │
│  │                                                                      │    │
│  │      if !caps.live_search {                                         │    │
│  │          return Err(ValidationError::CapabilityNotSupported {       │    │
│  │              capability: "live_search",                             │    │
│  │              model: model.model_id().to_string(),                   │    │
│  │              suggestion: "Use grok-4 or grok-3-beta for Live Search"│    │
│  │          });                                                        │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Streaming Edge Cases

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
│  │                      model: self.model.model_id(),                  │    │
│  │                      chunks_received: self.chunk_count,             │    │
│  │                      error_type: e.error_type()                     │    │
│  │                  );                                                 │    │
│  │                                                                      │    │
│  │                  Poll::Ready(Some(Err(GrokError::StreamInterrupted {│    │
│  │                      chunks_received: self.chunk_count,             │    │
│  │                      partial_content: self.accumulated_content.clone(),│ │
│  │                      partial_reasoning: self.accumulated_reasoning.clone(),│
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
│  │  - Model returned empty response                                    │    │
│  │  - Rate limiting mid-request                                        │    │
│  │                                                                      │    │
│  │  Handling: Emit empty completion, not an error                      │    │
│  │  fn finalize_stream(&mut self) -> StreamResult {                    │    │
│  │      if self.chunk_count == 0 {                                     │    │
│  │          tracing::debug!(                                           │    │
│  │              model = %self.model.model_id(),                        │    │
│  │              "Stream completed with no content chunks"              │    │
│  │          );                                                         │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      // Record metrics even for empty streams                       │    │
│  │      self.observability.metrics.record_stream_complete(             │    │
│  │          model: self.model.model_id(),                              │    │
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
│  │  Scenario: Consumer processes chunks slower than xAI sends them     │    │
│  │                                                                      │    │
│  │  Strategy: Bounded channel with backpressure (100 chunks)           │    │
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

### 2.5 Vision Input Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       VISION INPUT EDGE CASES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Case 1: Large Image Payload                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: User sends very large base64-encoded image               │    │
│  │                                                                      │    │
│  │  Handling: Validate size before sending                             │    │
│  │  const MAX_IMAGE_SIZE_BYTES: usize = 20 * 1024 * 1024;  // 20MB     │    │
│  │                                                                      │    │
│  │  fn validate_image_content(content: &MultiModalContent) -> Result<()> {│  │
│  │      for part in &content.parts {                                   │    │
│  │          if let ContentPart::ImageBase64 { base64, .. } = part {    │    │
│  │              let size = base64.len() * 3 / 4;  // Approximate       │    │
│  │              if size > MAX_IMAGE_SIZE_BYTES {                       │    │
│  │                  return Err(ValidationError::ImageTooLarge {        │    │
│  │                      size_bytes: size,                              │    │
│  │                      max_bytes: MAX_IMAGE_SIZE_BYTES                │    │
│  │                  });                                                │    │
│  │              }                                                      │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 2: Unsupported Image Format                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: User sends WebP or unsupported format                    │    │
│  │                                                                      │    │
│  │  Supported formats: JPEG, PNG, GIF, WebP (typically)                │    │
│  │                                                                      │    │
│  │  fn validate_image_format(media_type: &str) -> Result<(), Error> {  │    │
│  │      const SUPPORTED: &[&str] = &[                                  │    │
│  │          "image/jpeg",                                              │    │
│  │          "image/png",                                               │    │
│  │          "image/gif",                                               │    │
│  │          "image/webp"                                               │    │
│  │      ];                                                             │    │
│  │                                                                      │    │
│  │      if !SUPPORTED.contains(&media_type) {                          │    │
│  │          return Err(ValidationError::UnsupportedImageFormat {       │    │
│  │              format: media_type.to_string(),                        │    │
│  │              supported: SUPPORTED.join(", ")                        │    │
│  │          });                                                        │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Ok(())                                                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Case 3: Multiple Images in Single Request                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Scenario: User sends multiple images for comparison                │    │
│  │                                                                      │    │
│  │  Handling: Allow but validate total payload size                    │    │
│  │  fn validate_total_content_size(                                    │    │
│  │      messages: &[ChatMessage]                                       │    │
│  │  ) -> Result<(), Error> {                                           │    │
│  │      let mut total_size = 0;                                        │    │
│  │      let mut image_count = 0;                                       │    │
│  │                                                                      │    │
│  │      for msg in messages {                                          │    │
│  │          if let Some(MultiModalContent { parts }) = &msg.content {  │    │
│  │              for part in parts {                                    │    │
│  │                  if let ContentPart::ImageBase64 { base64, .. } = part {│ │
│  │                      total_size += base64.len();                    │    │
│  │                      image_count += 1;                              │    │
│  │                  }                                                  │    │
│  │              }                                                      │    │
│  │          }                                                          │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      if total_size > MAX_TOTAL_IMAGE_SIZE {                         │    │
│  │          return Err(ValidationError::TotalImageSizeTooLarge {       │    │
│  │              total_size,                                            │    │
│  │              image_count,                                           │    │
│  │              max_size: MAX_TOTAL_IMAGE_SIZE                         │    │
│  │          });                                                        │    │
│  │      }                                                              │    │
│  │                                                                      │    │
│  │      Ok(())                                                         │    │
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
│      // Single host: api.x.ai                                              │
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
│  Single Endpoint Advantage:                                                 │
│  - xAI uses single endpoint: https://api.x.ai/v1                           │
│  - Connection pool is effectively per-client                               │
│  - No cross-region considerations                                           │
│                                                                              │
│  Recommendation:                                                            │
│  - pool_max_idle_per_host: 10-20 for production                            │
│  - Higher values for high-throughput scenarios                              │
│  - Monitor connection reuse metrics                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Model Registry Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   MODEL REGISTRY OPTIMIZATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Current: HashMap lookups for every request                                 │
│                                                                              │
│  Optimization: Add caching layer for model hint resolution                  │
│  struct ModelRegistry {                                                     │
│      models: HashMap<String, GrokModel>,                                    │
│      capabilities: HashMap<GrokModel, GrokCapabilities>,                    │
│      // Cache for model hint resolution                                     │
│      hint_cache: DashMap<String, GrokModel>,  // hint -> model             │
│  }                                                                           │
│                                                                              │
│  fn resolve(&self, hint: &str) -> Result<GrokModel, Error> {                │
│      let hint_lower = hint.to_lowercase();                                  │
│                                                                              │
│      // Check cache first                                                   │
│      if let Some(cached) = self.hint_cache.get(&hint_lower) {              │
│          return Ok(cached.clone());                                         │
│      }                                                                       │
│                                                                              │
│      // Resolve and cache                                                   │
│      let model = self.resolve_uncached(&hint_lower)?;                       │
│      self.hint_cache.insert(hint_lower, model.clone());                     │
│                                                                              │
│      Ok(model)                                                              │
│  }                                                                           │
│                                                                              │
│  Benchmark expectation:                                                     │
│  - Before: ~50ns per resolve (HashMap lookup + string ops)                 │
│  - After: ~10ns per resolve (DashMap hot path)                             │
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
│  fn serialize_chat_request(request: &GrokChatRequest) -> Result<Vec<u8>, Error> {
│      // Estimate size: ~100 bytes overhead + message content                │
│      let estimated_size = 100 + request.messages.iter()                     │
│          .map(|m| match &m.content {                                        │
│              Some(Content::Text(t)) => t.len(),                             │
│              Some(Content::MultiModal(mm)) => estimate_multimodal_size(mm), │
│              None => 0                                                      │
│          })                                                                 │
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
│      model: String,                                                         │
│      messages: Vec<ChatMessage>,                                            │
│      #[serde(skip_serializing_if = "Option::is_none")]                     │
│      temperature: Option<f32>,                                              │
│      #[serde(skip_serializing_if = "Option::is_none")]                     │
│      max_tokens: Option<u32>,                                               │
│      #[serde(skip_serializing_if = "Option::is_none")]                     │
│      reasoning_effort: Option<String>,  // Future: Grok-4.1                │
│      // ... other optional fields with skip_serializing_if                  │
│  }                                                                           │
│                                                                              │
│  Benefit: Smaller request bodies, less network overhead                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Reasoning Content Streaming Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              REASONING CONTENT STREAMING OPTIMIZATION                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Challenge: Accumulating reasoning content during streaming                 │
│                                                                              │
│  Optimization: Use rope data structure for efficient append                 │
│  struct StreamAccumulator {                                                 │
│      // Use Vec<String> instead of single String for append efficiency     │
│      content_chunks: Vec<String>,                                           │
│      reasoning_chunks: Vec<String>,                                         │
│      total_content_len: usize,                                              │
│      total_reasoning_len: usize,                                            │
│  }                                                                           │
│                                                                              │
│  impl StreamAccumulator {                                                   │
│      fn append_content(&mut self, chunk: &str) {                           │
│          self.total_content_len += chunk.len();                            │
│          self.content_chunks.push(chunk.to_string());                      │
│      }                                                                       │
│                                                                              │
│      fn append_reasoning(&mut self, chunk: &str) {                         │
│          self.total_reasoning_len += chunk.len();                          │
│          self.reasoning_chunks.push(chunk.to_string());                    │
│      }                                                                       │
│                                                                              │
│      fn finalize_content(&self) -> String {                                │
│          // Single allocation for final string                             │
│          let mut result = String::with_capacity(self.total_content_len);   │
│          for chunk in &self.content_chunks {                               │
│              result.push_str(chunk);                                       │
│          }                                                                  │
│          result                                                            │
│      }                                                                       │
│                                                                              │
│      fn finalize_reasoning(&self) -> Option<String> {                      │
│          if self.reasoning_chunks.is_empty() {                             │
│              return None;                                                  │
│          }                                                                  │
│          let mut result = String::with_capacity(self.total_reasoning_len); │
│          for chunk in &self.reasoning_chunks {                             │
│              result.push_str(chunk);                                       │
│          }                                                                  │
│          Some(result)                                                      │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
│  Benefit: O(1) append instead of O(n) string concatenation                 │
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
│  - Prompt content                                                           │
│  - Completion content                                                        │
│  - Reasoning content                                                         │
│  - User identifiers in PII contexts                                         │
│  - Live Search queries                                                       │
│  - Image data (base64 or URLs)                                              │
│                                                                              │
│  Safe to log:                                                               │
│  - Model ID                                                                 │
│  - Token counts (prompt, completion, reasoning)                             │
│  - Latency metrics                                                          │
│  - Error codes (not messages with user content)                             │
│  - Finish reason                                                            │
│  - Live Search source counts (for cost tracking)                            │
│                                                                              │
│  Implementation:                                                            │
│  fn log_request_metadata(                                                   │
│      model: &str,                                                           │
│      message_count: usize,                                                  │
│      has_system_prompt: bool,                                               │
│      has_tools: bool,                                                       │
│      has_vision: bool                                                       │
│  ) {                                                                         │
│      tracing::info!(                                                        │
│          model = %model,                                                    │
│          message_count = message_count,                                     │
│          has_system_prompt = has_system_prompt,                             │
│          has_tools = has_tools,                                             │
│          has_vision = has_vision,                                           │
│          "Sending chat completion request"                                  │
│      );                                                                      │
│      // Note: NO message content logged                                     │
│  }                                                                           │
│                                                                              │
│  fn log_response_metadata(                                                  │
│      model: &str,                                                           │
│      prompt_tokens: u32,                                                    │
│      completion_tokens: u32,                                                │
│      reasoning_tokens: Option<u32>,                                         │
│      finish_reason: &str,                                                   │
│      latency_ms: u64                                                        │
│  ) {                                                                         │
│      tracing::info!(                                                        │
│          model = %model,                                                    │
│          prompt_tokens = prompt_tokens,                                     │
│          completion_tokens = completion_tokens,                             │
│          reasoning_tokens = ?reasoning_tokens,                              │
│          finish_reason = %finish_reason,                                    │
│          latency_ms = latency_ms,                                           │
│          "Chat completion response received"                                │
│      );                                                                      │
│      // Note: NO completion or reasoning content logged                     │
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
│  Model ID Validation:                                                       │
│  fn validate_model_hint(hint: &str) -> Result<(), ValidationError> {        │
│      // Prevent injection via model hint                                   │
│      if hint.is_empty() || hint.len() > 64 {                               │
│          return Err(ValidationError::InvalidModelHint {                     │
│              hint: hint.to_string(),                                       │
│              reason: "must be 1-64 characters"                             │
│          });                                                                │
│      }                                                                       │
│                                                                              │
│      // Allow alphanumeric, hyphen, underscore, dot                        │
│      if !hint.chars().all(|c| c.is_alphanumeric() ||                       │
│                           c == '-' || c == '_' || c == '.') {              │
│          return Err(ValidationError::InvalidModelHint {                     │
│              hint: hint.to_string(),                                       │
│              reason: "invalid characters"                                  │
│          });                                                                │
│      }                                                                       │
│                                                                              │
│      Ok(())                                                                  │
│  }                                                                           │
│                                                                              │
│  Request Parameter Validation:                                              │
│  fn validate_chat_request(request: &GrokChatRequest) -> Result<(), ValidationError> {
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
│      // frequency_penalty: -2.0 to 2.0                                     │
│      if let Some(fp) = request.frequency_penalty {                         │
│          if fp < -2.0 || fp > 2.0 {                                        │
│              return Err(ValidationError::InvalidFrequencyPenalty(fp));      │
│          }                                                                  │
│      }                                                                       │
│                                                                              │
│      // presence_penalty: -2.0 to 2.0                                      │
│      if let Some(pp) = request.presence_penalty {                          │
│          if pp < -2.0 || pp > 2.0 {                                        │
│              return Err(ValidationError::InvalidPresencePenalty(pp));       │
│          }                                                                  │
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
│  Model-Specific Timeouts (Grok-3 reasoning may take longer):               │
│  fn get_timeout_for_model(                                                  │
│      model: &GrokModel,                                                     │
│      config: &TimeoutConfig                                                 │
│  ) -> Duration {                                                            │
│      match model {                                                          │
│          // Grok-3 with reasoning may need extra time                      │
│          GrokModel::Grok3Beta | GrokModel::Grok3MiniBeta => {              │
│              config.request_timeout + Duration::from_secs(60)              │
│          },                                                                 │
│          _ => config.request_timeout                                        │
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
│                  GrokError::StreamIdleTimeout {                             │
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
│  Per-Model Circuit Breakers:                                                │
│  struct CircuitBreakerRegistry {                                            │
│      breakers: DashMap<String, CircuitBreaker>,  // model_id -> CB         │
│      config: CircuitBreakerConfig,                                          │
│  }                                                                           │
│                                                                              │
│  fn get_or_create_breaker(&self, model: &GrokModel) -> &CircuitBreaker {   │
│      let key = model.model_id();                                            │
│      self.breakers.entry(key.to_string())                                   │
│          .or_insert_with(|| CircuitBreaker::new(self.config.clone()))      │
│          .value()                                                           │
│  }                                                                           │
│                                                                              │
│  Model Fallback Strategy:                                                   │
│  struct ModelFallbackConfig {                                               │
│      primary: GrokModel,                                                    │
│      fallback: Option<GrokModel>,                                           │
│  }                                                                           │
│                                                                              │
│  // Example: Grok-4 -> Grok-3 fallback                                      │
│  fn invoke_with_fallback(                                                   │
│      &self,                                                                 │
│      request: GrokChatRequest                                               │
│  ) -> Result<GrokChatResponse, Error> {                                     │
│      let primary = request.model.clone();                                   │
│                                                                              │
│      // Try primary model                                                   │
│      match self.invoke_model(&request).await {                              │
│          Ok(response) => Ok(response),                                      │
│          Err(e) if e.is_retryable() => {                                   │
│              // Check for configured fallback                               │
│              if let Some(fallback) = self.get_fallback(&primary) {         │
│                  tracing::warn!(                                            │
│                      primary = %primary.model_id(),                         │
│                      fallback = %fallback.model_id(),                       │
│                      error = %e,                                            │
│                      "Primary model failed, trying fallback"                │
│                  );                                                         │
│                                                                              │
│                  let mut fallback_request = request;                        │
│                  fallback_request.model = fallback;                         │
│                  self.invoke_model(&fallback_request).await                 │
│              } else {                                                       │
│                  Err(e)                                                     │
│              }                                                              │
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
│  │ xai_grok_requests_total                │ Counter │ model,op,status    │  │
│  │ xai_grok_request_duration_seconds      │ Histogram│ model,op          │  │
│  │ xai_grok_tokens_total                  │ Counter │ model,type         │  │
│  │ xai_grok_reasoning_tokens_total        │ Counter │ model              │  │
│  │ xai_grok_rate_limit_hits_total         │ Counter │ model              │  │
│  └────────────────────────────────────────┴─────────┴────────────────────┘  │
│                                                                              │
│  Stream Metrics:                                                            │
│  ┌────────────────────────────────────────┬─────────┬────────────────────┐  │
│  │ xai_grok_stream_chunks_total           │ Counter │ model              │  │
│  │ xai_grok_stream_duration_seconds       │ Histogram│ model             │  │
│  │ xai_grok_stream_errors_total           │ Counter │ model,error        │  │
│  └────────────────────────────────────────┴─────────┴────────────────────┘  │
│                                                                              │
│  Live Search Metrics:                                                       │
│  ┌────────────────────────────────────────┬─────────┬────────────────────┐  │
│  │ xai_grok_live_search_sources_total     │ Counter │ model              │  │
│  │ xai_grok_live_search_cost_usd_total    │ Counter │ model              │  │
│  └────────────────────────────────────────┴─────────┴────────────────────┘  │
│                                                                              │
│  Circuit Breaker Metrics:                                                   │
│  ┌────────────────────────────────────────┬─────────┬────────────────────┐  │
│  │ xai_grok_circuit_breaker_state         │ Gauge   │ model              │  │
│  │ xai_grok_circuit_breaker_trips_total   │ Counter │ model              │  │
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
│  xai_grok.chat.complete                                                     │
│  ├── xai_grok.model.resolve                                                 │
│  ├── xai_grok.auth.get_header                                              │
│  ├── xai_grok.http.request                                                 │
│  │   ├── xai_grok.http.connect                                             │
│  │   ├── xai_grok.http.send                                                │
│  │   └── xai_grok.http.receive                                             │
│  ├── xai_grok.response.parse                                               │
│  └── xai_grok.reasoning.extract                                            │
│                                                                              │
│  Streaming Request:                                                         │
│  xai_grok.chat.stream                                                       │
│  ├── xai_grok.model.resolve                                                 │
│  ├── xai_grok.auth.get_header                                              │
│  ├── xai_grok.http.request                                                 │
│  └── xai_grok.stream.process                                               │
│      ├── xai_grok.stream.chunk (repeated)                                  │
│      │   └── xai_grok.reasoning.accumulate (Grok-3)                        │
│      └── xai_grok.stream.finalize                                          │
│                                                                              │
│  Span Attributes:                                                           │
│  - model_id                                                                 │
│  - operation                                                                │
│  - message_count                                                            │
│  - has_vision                                                               │
│  - has_tools                                                                │
│  - live_search_enabled                                                      │
│  - prompt_tokens (on completion)                                            │
│  - completion_tokens (on completion)                                        │
│  - reasoning_tokens (on completion, Grok-3)                                 │
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
| ModelRegistry | 95% | resolve, resolve_with_fallback |
| SseParser | 95% | try_parse_event, edge cases |
| ReasoningExtractor | 100% | extract, extract_from_stream |
| Error mapping | 100% | All HTTP status codes |
| Request validation | 100% | All parameters |
| Capability validation | 100% | All model/capability combinations |

### 7.2 Integration Test Scenarios

| Scenario | Mock/Live | Priority |
|----------|-----------|----------|
| Chat completion (Grok-4) | Mock | P0 |
| Chat completion (Grok-3 with reasoning) | Mock | P0 |
| Streaming completion | Mock | P0 |
| Streaming with reasoning accumulation | Mock | P0 |
| Vision request (Grok-4) | Mock | P0 |
| Embedding generation | Mock | P1 |
| Image generation (Grok-2-Image) | Mock | P1 |
| Rate limit handling | Mock | P0 |
| Circuit breaker trip | Mock | P1 |
| Connection timeout | Mock | P1 |
| Stream interruption | Mock | P1 |
| Live Search cost tracking | Mock | P2 |

### 7.3 Contract Tests

```
Contract tests ensure xAI Grok API compatibility:

1. Request format validation
   - JSON schema matches xAI/OpenAI documentation
   - All required fields present
   - Optional fields correctly omitted
   - Vision content correctly formatted

2. Response parsing validation
   - Parse real xAI responses (recorded)
   - Handle all response variations
   - Reasoning content extraction (Grok-3)
   - Token usage parsing

3. Error response validation
   - Parse all documented error codes
   - Retry-After header parsing
   - Rate limit detection
```

---

## 8. Documentation Requirements

### 8.1 API Documentation

- [ ] All public types have doc comments
- [ ] All public functions have examples
- [ ] Error types document recovery strategies
- [ ] Configuration options fully documented
- [ ] Model capabilities matrix documented

### 8.2 Integration Guide

- [ ] Quick start with API key
- [ ] Model selection guide (Grok-4 vs Grok-3 vs Grok-3-Mini)
- [ ] Reasoning content usage (Grok-3)
- [ ] Vision input examples
- [ ] Live Search configuration (with cost warning)
- [ ] RuvVector integration example

### 8.3 Troubleshooting Guide

- [ ] Common error codes and solutions
- [ ] Model capability errors
- [ ] Rate limiting mitigation
- [ ] Reasoning content not appearing (model check)
- [ ] Vision format issues

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

- [x] shared/credentials module interface defined
- [x] shared/resilience integration pattern confirmed
- [x] shared/observability hooks available
- [x] shared/database (RuvVector) schema defined

### 9.3 Test Infrastructure

- [ ] Mock server setup (WireMock or similar)
- [ ] Test fixtures for xAI responses
- [ ] Test fixtures for reasoning content
- [ ] CI pipeline configured
- [ ] Code coverage tooling enabled

---

## 10. Grok-Specific Considerations

### 10.1 Model Evolution Tracking

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MODEL EVOLUTION TRACKING                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  xAI frequently releases new models. Strategy for tracking:                 │
│                                                                              │
│  1. Model Registry Configuration                                            │
│     - Load model definitions from config file                               │
│     - Allow runtime model registration                                      │
│     - Custom model variant for unknown models                               │
│                                                                              │
│  2. Capability Discovery                                                    │
│     - Call /v1/models endpoint on startup (optional)                       │
│     - Log unknown models for future support                                 │
│     - Graceful handling of new capabilities                                 │
│                                                                              │
│  3. Version Tracking                                                        │
│     - Track model versions in metrics                                       │
│     - Alert on deprecated model usage                                       │
│     - Document sunset timelines                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Pricing Awareness

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PRICING AWARENESS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Token Pricing (as of 2025):                                                │
│  ┌─────────────────┬─────────────────┬─────────────────┐                   │
│  │ Model           │ Input (per 1M)  │ Output (per 1M) │                   │
│  ├─────────────────┼─────────────────┼─────────────────┤                   │
│  │ Grok-4          │ $3.00           │ $15.00          │                   │
│  │ Grok-3          │ $2.00           │ $10.00          │                   │
│  │ Grok-3-Mini     │ $0.30           │ $0.50           │                   │
│  └─────────────────┴─────────────────┴─────────────────┘                   │
│                                                                              │
│  Additional Costs:                                                          │
│  - Live Search: $25 per 1,000 sources                                      │
│  - Reasoning tokens: Included in completion token count                    │
│                                                                              │
│  Cost Tracking Implementation:                                              │
│  fn estimate_request_cost(                                                  │
│      model: &GrokModel,                                                     │
│      prompt_tokens: u32,                                                    │
│      completion_tokens: u32,                                                │
│      live_search_sources: Option<u32>                                      │
│  ) -> f64 {                                                                  │
│      let (input_rate, output_rate) = match model {                         │
│          GrokModel::Grok4 | GrokModel::Grok4_1 => (3.0, 15.0),            │
│          GrokModel::Grok3Beta => (2.0, 10.0),                              │
│          GrokModel::Grok3MiniBeta => (0.3, 0.5),                           │
│          _ => (3.0, 15.0),  // Default to Grok-4 pricing                   │
│      };                                                                      │
│                                                                              │
│      let token_cost = (prompt_tokens as f64 / 1_000_000.0 * input_rate)   │
│                     + (completion_tokens as f64 / 1_000_000.0 * output_rate);│
│                                                                              │
│      let search_cost = live_search_sources                                  │
│          .map(|s| s as f64 / 1000.0 * 25.0)                                │
│          .unwrap_or(0.0);                                                   │
│                                                                              │
│      token_cost + search_cost                                               │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial refinement |

---

**End of Refinement Phase**

*Next Phase: Completion — implementation readiness and final checklist.*

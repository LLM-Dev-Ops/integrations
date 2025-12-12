# AWS Bedrock Integration Refinement

## SPARC Phase 4: Refinement

*Review, optimize, and harden the design before implementation*

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| InvokeModel operation | ✅ Covered | Pseudocode-1, all model families |
| InvokeModelWithResponseStream | ✅ Covered | Pseudocode-2, AWS event stream parsing |
| Amazon Titan Text Models | ✅ Covered | Pseudocode-1, generate/stream |
| Amazon Titan Embeddings | ✅ Covered | Pseudocode-1, v1/v2 with dimensions |
| Amazon Titan Image | ✅ Covered | Pseudocode-1, generation/variation |
| Anthropic Claude (Bedrock) | ✅ Covered | Pseudocode-1, messages API format |
| Meta LLaMA 2 | ✅ Covered | Pseudocode-1, v2 prompt format |
| Meta LLaMA 3/3.1/3.2 | ✅ Covered | Pseudocode-1, v3 prompt format |
| ListFoundationModels | ✅ Covered | Pseudocode-2, model discovery |
| GetFoundationModel | ✅ Covered | Pseudocode-2, model details |
| Unified Invoke Interface | ✅ Covered | Pseudocode-1, model-agnostic API |
| Model Family Routing | ✅ Covered | Pseudocode-1, detect_model_family() |
| Request Translation | ✅ Covered | Architecture-2, unified → family |
| Response Translation | ✅ Covered | Architecture-2, family → unified |
| AWS Event Stream Parsing | ✅ Covered | Pseudocode-2, binary format |
| AWS Signature V4 | ✅ Covered | Uses shared aws/signing |
| Credential providers | ✅ Covered | Uses shared aws/credentials |
| Retry with backoff | ✅ Covered | Uses shared/resilience |
| Circuit breaker | ✅ Covered | Uses shared/resilience |
| Rate limiting | ✅ Covered | Uses shared/resilience |
| Tracing integration | ✅ Covered | Uses shared/observability |
| Structured logging | ✅ Covered | Uses shared/observability |
| Error taxonomy | ✅ Covered | Architecture-2, BedrockError |
| RuvVector embeddings | ✅ Covered | Pseudocode-2, PostgreSQL + pgvector |
| RuvVector conversations | ✅ Covered | Pseudocode-2, state persistence |

### 1.2 Architecture Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Thin Adapter Pattern | ✅ | Only model-specific logic in module |
| Dependency Inversion | ✅ | All deps injected via traits |
| Model Family Isolation | ✅ | Separate services per family |
| Interface Segregation | ✅ | Fine-grained service traits |
| No aws-sdk dependency | ✅ | Custom signing, credential handling |
| No cross-module deps | ✅ | Self-contained module |
| London-School TDD ready | ✅ | All collaborators mockable |
| Shared infrastructure reuse | ✅ | Credentials, signing, resilience |

### 1.3 Security Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Credentials never logged | ✅ | SecretString wrapper, redacted Debug |
| TLS enforced | ✅ | HTTPS default, TLS 1.2+ required |
| Signature V4 | ✅ | Reuse from aws/signing |
| Session token support | ✅ | Included in credential chain |
| Prompt content not logged | ✅ | Only metadata logged |
| Model outputs not logged | ✅ | Only token counts logged |
| Content hash validation | ✅ | SHA-256 for signed requests |

---

## 2. Edge Case Analysis

### 2.1 Model ID Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MODEL ID EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Model ID Formats                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Base model IDs:                                                     │   │
│  │  - "amazon.titan-text-express-v1"                                   │   │
│  │  - "anthropic.claude-3-sonnet-20240229-v1:0"                        │   │
│  │  - "meta.llama3-70b-instruct-v1:0"                                  │   │
│  │                                                                      │   │
│  │  Provisioned throughput ARNs:                                        │   │
│  │  - "arn:aws:bedrock:us-east-1:123456789012:provisioned-model/abc123"│   │
│  │                                                                      │   │
│  │  Custom model ARNs:                                                  │   │
│  │  - "arn:aws:bedrock:us-east-1:123456789012:custom-model/my-model"   │   │
│  │                                                                      │   │
│  │  Implementation:                                                     │   │
│  │  fn detect_model_family(model_id: &str) -> Result<ModelFamily, Err> │   │
│  │  {                                                                   │   │
│  │      // Handle ARN format                                            │   │
│  │      let effective_id = if model_id.starts_with("arn:") {           │   │
│  │          // Extract base model from ARN metadata                     │   │
│  │          // May need API call to get model details                   │   │
│  │          extract_base_model_from_arn(model_id)?                     │   │
│  │      } else {                                                        │   │
│  │          model_id.to_string()                                        │   │
│  │      };                                                              │   │
│  │                                                                      │   │
│  │      // Now detect family from effective ID                          │   │
│  │      let lower = effective_id.to_lowercase();                        │   │
│  │      if lower.starts_with("amazon.titan") {                          │   │
│  │          Ok(ModelFamily::Titan)                                      │   │
│  │      } else if lower.starts_with("anthropic.claude") {               │   │
│  │          Ok(ModelFamily::Claude)                                     │   │
│  │      } else if lower.starts_with("meta.llama") {                     │   │
│  │          Ok(ModelFamily::Llama)                                      │   │
│  │      } else {                                                        │   │
│  │          Err(BedrockError::UnknownModelFamily { model_id: effective_id })│
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Model Version Suffixes                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Version suffix present: "anthropic.claude-3-sonnet-...-v1:0"     │   │
│  │  - Version suffix absent: "amazon.titan-text-express-v1"            │   │
│  │  - Latest alias: Some models support :latest or no suffix           │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  - Accept model ID as-is (let Bedrock handle version resolution)    │   │
│  │  - Document version behavior per model family                        │   │
│  │  - Log warning for deprecated model versions                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Regional Model Availability                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Model not available in configured region                 │   │
│  │                                                                      │   │
│  │  Error: ResourceNotFoundException or AccessDeniedException           │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Map to BedrockError::ModelNotAccessible                          │   │
│  │  2. Include region in error context                                  │   │
│  │  3. Optionally: provide ListFoundationModels for discovery           │   │
│  │                                                                      │   │
│  │  Error mapping:                                                      │   │
│  │  fn map_model_error(err: &AwsError, model_id: &str, region: &str)   │   │
│  │      -> BedrockError                                                 │   │
│  │  {                                                                   │   │
│  │      if err.code() == "ResourceNotFoundException" {                  │   │
│  │          BedrockError::ModelNotAccessible {                          │   │
│  │              model_id: model_id.to_string(),                         │   │
│  │              region: region.to_string(),                             │   │
│  │              suggestion: format!(                                    │   │
│  │                  "Model '{}' may not be available in {}. "           │   │
│  │                  "Use models().list() to discover available models.",│   │
│  │                  model_id, region                                    │   │
│  │              ),                                                       │   │
│  │          }                                                           │   │
│  │      } else { ... }                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Request/Response Translation Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   TRANSLATION EDGE CASES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Message Role Handling                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Unified roles: "user", "assistant", "system"                        │   │
│  │                                                                      │   │
│  │  Titan handling:                                                     │   │
│  │  - No native role concept; concatenate as "User: ... Bot: ..."      │   │
│  │  - System message: prepend to first user message                     │   │
│  │                                                                      │   │
│  │  Claude (Bedrock) handling:                                          │   │
│  │  - Native roles: "user", "assistant"                                 │   │
│  │  - System: separate "system" field in request body                   │   │
│  │                                                                      │   │
│  │  LLaMA handling:                                                     │   │
│  │  - Roles embedded in prompt template                                 │   │
│  │  - System: <<SYS>> block (v2) or <|start_header_id|>system (v3)     │   │
│  │                                                                      │   │
│  │  Edge case: Empty system message                                     │   │
│  │  fn translate_messages(messages: &[Message], system: Option<&str>)  │   │
│  │  {                                                                   │   │
│  │      // If system is Some(""), treat as None                         │   │
│  │      let effective_system = system.filter(|s| !s.is_empty());        │   │
│  │      ...                                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Token Limits Per Model                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Model context windows vary significantly:                           │   │
│  │  - Titan Text Express: 8K tokens                                     │   │
│  │  - Claude 3 Sonnet: 200K tokens                                      │   │
│  │  - LLaMA 3.1 405B: 128K tokens                                       │   │
│  │                                                                      │   │
│  │  max_tokens validation:                                              │   │
│  │  fn validate_max_tokens(                                             │   │
│  │      model_id: &str,                                                 │   │
│  │      max_tokens: Option<u32>,                                        │   │
│  │  ) -> Result<u32, BedrockError> {                                   │   │
│  │      let model_limits = get_model_limits(model_id)?;                │   │
│  │                                                                      │   │
│  │      let requested = max_tokens.unwrap_or(model_limits.default_max); │   │
│  │                                                                      │   │
│  │      if requested > model_limits.max_output_tokens {                 │   │
│  │          return Err(BedrockError::ValidationError {                  │   │
│  │              message: format!(                                       │   │
│  │                  "max_tokens {} exceeds limit {} for model {}",      │   │
│  │                  requested, model_limits.max_output_tokens, model_id │   │
│  │              ),                                                       │   │
│  │              request_id: None,                                        │   │
│  │          });                                                          │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(requested)                                                   │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Parameter Name Differences                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Unified parameter → Model-specific mapping:                         │   │
│  │                                                                      │   │
│  │  max_tokens:                                                         │   │
│  │  - Titan: maxTokenCount (in textGenerationConfig)                   │   │
│  │  - Claude: max_tokens                                                │   │
│  │  - LLaMA: max_gen_len                                                │   │
│  │                                                                      │   │
│  │  temperature:                                                        │   │
│  │  - Titan: temperature (0.0-1.0)                                      │   │
│  │  - Claude: temperature (0.0-1.0)                                     │   │
│  │  - LLaMA: temperature (0.0-1.0)                                      │   │
│  │                                                                      │   │
│  │  top_k:                                                              │   │
│  │  - Titan: NOT SUPPORTED (use top_p instead)                          │   │
│  │  - Claude: top_k (default 250)                                       │   │
│  │  - LLaMA: NOT SUPPORTED                                              │   │
│  │                                                                      │   │
│  │  Handling unsupported parameters:                                    │   │
│  │  fn translate_parameters(                                            │   │
│  │      params: &UnifiedParams,                                         │   │
│  │      family: ModelFamily,                                            │   │
│  │  ) -> Result<FamilyParams, BedrockError> {                          │   │
│  │      // Log warning for ignored parameters                           │   │
│  │      if params.top_k.is_some() && family == ModelFamily::Titan {    │   │
│  │          warn!(                                                      │   │
│  │              model_family = %family,                                 │   │
│  │              "top_k parameter ignored; Titan does not support top_k"│   │
│  │          );                                                          │   │
│  │      }                                                               │   │
│  │      ...                                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Stop Sequences Handling                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Titan:                                                              │   │
│  │  - stopSequences: array of strings                                  │   │
│  │  - Max 4 sequences                                                   │   │
│  │                                                                      │   │
│  │  Claude:                                                             │   │
│  │  - stop_sequences: array of strings                                  │   │
│  │  - Max 8192 sequences (practical limit lower)                        │   │
│  │                                                                      │   │
│  │  LLaMA:                                                              │   │
│  │  - No explicit stop_sequences parameter                              │   │
│  │  - Use EOS token and prompt engineering                              │   │
│  │                                                                      │   │
│  │  Translation:                                                        │   │
│  │  fn translate_stop_sequences(                                        │   │
│  │      sequences: &[String],                                           │   │
│  │      family: ModelFamily,                                            │   │
│  │  ) -> Result<Option<Vec<String>>, BedrockError> {                   │   │
│  │      match family {                                                  │   │
│  │          ModelFamily::Titan => {                                     │   │
│  │              if sequences.len() > 4 {                                │   │
│  │                  warn!("Titan supports max 4 stop sequences; truncating");│
│  │              }                                                       │   │
│  │              Ok(Some(sequences.iter().take(4).cloned().collect()))  │   │
│  │          }                                                           │   │
│  │          ModelFamily::Claude => Ok(Some(sequences.to_vec())),       │   │
│  │          ModelFamily::Llama => {                                     │   │
│  │              if !sequences.is_empty() {                              │   │
│  │                  warn!("LLaMA does not support stop_sequences; ignored");│
│  │              }                                                       │   │
│  │              Ok(None)                                                │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Streaming Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STREAMING EDGE CASES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Incomplete Event Stream Messages                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: TCP chunk boundary splits AWS event stream message        │   │
│  │                                                                      │   │
│  │  Strategy: Buffer accumulation                                       │   │
│  │                                                                      │   │
│  │  struct EventStreamParser {                                          │   │
│  │      buffer: BytesMut,                                               │   │
│  │      state: ParserState,                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl EventStreamParser {                                            │   │
│  │      fn feed(&mut self, chunk: &[u8]) {                             │   │
│  │          self.buffer.extend_from_slice(chunk);                       │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      fn next_event(&mut self) -> Result<Option<Event>, ParseError> {│   │
│  │          // Need at least 8 bytes for prelude                        │   │
│  │          if self.buffer.len() < 8 {                                  │   │
│  │              return Ok(None);  // Need more data                     │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          // Read total length from prelude                           │   │
│  │          let total_len = u32::from_be_bytes([                        │   │
│  │              self.buffer[0], self.buffer[1],                         │   │
│  │              self.buffer[2], self.buffer[3]                          │   │
│  │          ]) as usize;                                                │   │
│  │                                                                      │   │
│  │          // Wait for complete message                                │   │
│  │          if self.buffer.len() < total_len {                          │   │
│  │              return Ok(None);  // Need more data                     │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          // Parse complete message                                   │   │
│  │          let message_bytes = self.buffer.split_to(total_len);       │   │
│  │          self.parse_message(&message_bytes)                          │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: CRC Validation Failure                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Message CRC doesn't match (corruption in transit)         │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Abort stream with error                                          │   │
│  │  2. Do NOT retry mid-stream (could duplicate content)                │   │
│  │  3. Return StreamCrcMismatch error                                   │   │
│  │                                                                      │   │
│  │  fn validate_crc(message: &[u8]) -> Result<(), BedrockError> {      │   │
│  │      let total_len = message.len();                                  │   │
│  │      let payload_crc_bytes = &message[total_len - 4..];             │   │
│  │      let expected_crc = u32::from_be_bytes(                          │   │
│  │          payload_crc_bytes.try_into().unwrap()                       │   │
│  │      );                                                              │   │
│  │                                                                      │   │
│  │      let computed_crc = crc32c(&message[..total_len - 4]);          │   │
│  │                                                                      │   │
│  │      if computed_crc != expected_crc {                               │   │
│  │          return Err(BedrockError::StreamCrcMismatch);                │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Exception Event Mid-Stream                                         │   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Model returns error after some content chunks             │   │
│  │                                                                      │   │
│  │  AWS event types:                                                    │   │
│  │  - :message-type = "event" → normal content                         │   │
│  │  - :message-type = "exception" → error event                        │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Detect exception event type                                      │   │
│  │  2. Parse exception payload                                          │   │
│  │  3. Mark stream as errored                                           │   │
│  │  4. Return error to consumer (content already yielded is valid)      │   │
│  │                                                                      │   │
│  │  fn handle_event(&mut self, event: RawEvent) -> StreamItem {        │   │
│  │      let message_type = event.header(":message-type")?;             │   │
│  │                                                                      │   │
│  │      match message_type.as_str() {                                   │   │
│  │          "event" => self.parse_content_event(event),                 │   │
│  │          "exception" => {                                            │   │
│  │              let error = self.parse_exception(event)?;               │   │
│  │              self.state = StreamState::Errored;                      │   │
│  │              Err(BedrockError::StreamError {                         │   │
│  │                  message: error.message,                             │   │
│  │                  chunks_received: self.chunk_count,                  │   │
│  │              })                                                      │   │
│  │          }                                                           │   │
│  │          _ => Err(BedrockError::UnknownEventType { ... })           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Connection Timeout During Stream                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Long generation with idle period exceeds read timeout     │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Use per-chunk timeout, not total timeout                         │   │
│  │  2. Reasonable default: 120 seconds between chunks                   │   │
│  │  3. Configurable via StreamConfig                                    │   │
│  │                                                                      │   │
│  │  struct StreamConfig {                                               │   │
│  │      /// Timeout for receiving each chunk (not total stream)         │   │
│  │      chunk_timeout: Duration,  // Default: 120s                      │   │
│  │                                                                      │   │
│  │      /// Maximum total stream duration                               │   │
│  │      max_stream_duration: Option<Duration>,  // Default: None        │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  async fn read_stream_with_timeout(&mut self) -> Result<Event> {    │   │
│  │      match tokio::time::timeout(                                     │   │
│  │          self.config.chunk_timeout,                                  │   │
│  │          self.inner.next()                                           │   │
│  │      ).await {                                                       │   │
│  │          Ok(Some(event)) => Ok(event),                               │   │
│  │          Ok(None) => Err(BedrockError::StreamEnded),                 │   │
│  │          Err(_) => Err(BedrockError::StreamTimeout {                 │   │
│  │              timeout: self.config.chunk_timeout,                     │   │
│  │              chunks_received: self.chunk_count,                      │   │
│  │          }),                                                          │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 5: Empty Stream (No Content)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Model returns empty response (e.g., content filtered)     │   │
│  │                                                                      │   │
│  │  Detection:                                                          │   │
│  │  - Stream ends immediately after start                               │   │
│  │  - Total content is empty string                                     │   │
│  │  - stop_reason may indicate content filter                           │   │
│  │                                                                      │   │
│  │  Handling:                                                           │   │
│  │  struct StreamResult {                                               │   │
│  │      content: String,                                                │   │
│  │      stop_reason: StopReason,                                        │   │
│  │      usage: Option<UsageInfo>,                                       │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl StreamResult {                                                 │   │
│  │      fn is_empty(&self) -> bool {                                    │   │
│  │          self.content.is_empty()                                     │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      fn was_filtered(&self) -> bool {                                │   │
│  │          matches!(self.stop_reason, StopReason::ContentFilter)       │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Embedding Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EMBEDDING EDGE CASES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Embedding Dimension Mismatch                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Titan Embed v1: Fixed 1536 dimensions                               │   │
│  │  Titan Embed v2: Configurable (256, 384, 512, 1024)                  │   │
│  │                                                                      │   │
│  │  Problem: Mixing embeddings of different dimensions in RuvVector     │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Store dimension with embedding metadata                          │   │
│  │  2. Validate dimension match on similarity search                    │   │
│  │  3. Use separate indexes per dimension if needed                     │   │
│  │                                                                      │   │
│  │  fn store_embedding(                                                 │   │
│  │      &self,                                                          │   │
│  │      embedding: &[f32],                                              │   │
│  │      metadata: &EmbeddingMetadata,                                   │   │
│  │  ) -> Result<Uuid, BedrockError> {                                  │   │
│  │      // Validate dimension matches table constraint                  │   │
│  │      let expected_dims = self.config.embedding_dimensions;           │   │
│  │      if embedding.len() != expected_dims {                           │   │
│  │          return Err(BedrockError::DimensionMismatch {                │   │
│  │              expected: expected_dims,                                 │   │
│  │              actual: embedding.len(),                                 │   │
│  │              hint: "Ensure consistent model and dimension settings",  │   │
│  │          });                                                          │   │
│  │      }                                                               │   │
│  │      ...                                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Empty Text Embedding Request                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: User passes empty string to embed                         │   │
│  │                                                                      │   │
│  │  Titan behavior: Returns error (ValidationException)                 │   │
│  │                                                                      │   │
│  │  Pre-validation:                                                     │   │
│  │  fn validate_embed_request(request: &TitanEmbedRequest)              │   │
│  │      -> Result<(), BedrockError>                                     │   │
│  │  {                                                                   │   │
│  │      if request.input_text.is_empty() {                              │   │
│  │          return Err(BedrockError::ValidationError {                  │   │
│  │              message: "input_text cannot be empty".to_string(),      │   │
│  │              request_id: None,                                        │   │
│  │          });                                                          │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Titan v2 max input: 8192 tokens                              │   │
│  │      if request.input_text.len() > 32000 {  // Rough char limit      │   │
│  │          return Err(BedrockError::ValidationError {                  │   │
│  │              message: "input_text exceeds maximum length".to_string(),│  │
│  │              request_id: None,                                        │   │
│  │          });                                                          │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Batch Embedding Failures                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Batch embed with some texts failing                       │   │
│  │                                                                      │   │
│  │  Note: Titan doesn't support native batching; we batch client-side   │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Process texts in parallel (bounded concurrency)                  │   │
│  │  2. Collect results with success/failure status                      │   │
│  │  3. Return BatchEmbedResult with partial success info                │   │
│  │                                                                      │   │
│  │  struct BatchEmbedResult {                                           │   │
│  │      embeddings: Vec<Option<Vec<f32>>>,  // None = failed            │   │
│  │      errors: Vec<Option<BedrockError>>,  // Error details            │   │
│  │      success_count: usize,                                           │   │
│  │      failure_count: usize,                                           │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  async fn batch_embed(                                               │   │
│  │      &self,                                                          │   │
│  │      texts: Vec<String>,                                             │   │
│  │      concurrency: usize,                                             │   │
│  │  ) -> BatchEmbedResult {                                            │   │
│  │      let semaphore = Arc::new(Semaphore::new(concurrency));          │   │
│  │                                                                      │   │
│  │      let futures = texts.into_iter().map(|text| {                   │   │
│  │          let permit = semaphore.clone();                             │   │
│  │          async move {                                                │   │
│  │              let _permit = permit.acquire().await;                   │   │
│  │              self.embed_single(text).await                           │   │
│  │          }                                                           │   │
│  │      });                                                             │   │
│  │                                                                      │   │
│  │      let results = join_all(futures).await;                          │   │
│  │      // Collect into BatchEmbedResult                                │   │
│  │      ...                                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 LLaMA Prompt Format Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LLAMA PROMPT FORMAT EDGE CASES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Detecting LLaMA Version from Model ID                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Model ID patterns:                                                  │   │
│  │  - meta.llama2-*  → LLaMA 2 format                                   │   │
│  │  - meta.llama3-*  → LLaMA 3 format                                   │   │
│  │  - meta.llama3-1-* → LLaMA 3.1 format                                │   │
│  │  - meta.llama3-2-* → LLaMA 3.2 format                                │   │
│  │                                                                      │   │
│  │  fn detect_llama_version(model_id: &str) -> LlamaVersion {          │   │
│  │      let lower = model_id.to_lowercase();                            │   │
│  │                                                                      │   │
│  │      if lower.contains("llama2") {                                   │   │
│  │          LlamaVersion::V2                                            │   │
│  │      } else if lower.contains("llama3-2") || lower.contains("llama3.2") {│
│  │          LlamaVersion::V3_2                                          │   │
│  │      } else if lower.contains("llama3-1") || lower.contains("llama3.1") {│
│  │          LlamaVersion::V3_1                                          │   │
│  │      } else if lower.contains("llama3") {                            │   │
│  │          LlamaVersion::V3                                            │   │
│  │      } else {                                                        │   │
│  │          // Default to latest format for unknown                     │   │
│  │          warn!("Unknown LLaMA version in model_id, using v3 format");│   │
│  │          LlamaVersion::V3                                            │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Multi-Turn Conversation Formatting                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  LLaMA 3 multi-turn format:                                          │   │
│  │  <|begin_of_text|>                                                   │   │
│  │  <|start_header_id|>system<|end_header_id|>                          │   │
│  │  System prompt<|eot_id|>                                             │   │
│  │  <|start_header_id|>user<|end_header_id|>                            │   │
│  │  First user message<|eot_id|>                                        │   │
│  │  <|start_header_id|>assistant<|end_header_id|>                       │   │
│  │  First assistant response<|eot_id|>                                  │   │
│  │  <|start_header_id|>user<|end_header_id|>                            │   │
│  │  Second user message<|eot_id|>                                       │   │
│  │  <|start_header_id|>assistant<|end_header_id|>                       │   │
│  │  (model generates here)                                              │   │
│  │                                                                      │   │
│  │  fn format_llama3_messages(                                          │   │
│  │      messages: &[Message],                                           │   │
│  │      system: Option<&str>,                                           │   │
│  │  ) -> String {                                                       │   │
│  │      let mut prompt = String::from("<|begin_of_text|>");             │   │
│  │                                                                      │   │
│  │      // System message first                                         │   │
│  │      if let Some(sys) = system {                                     │   │
│  │          prompt.push_str("<|start_header_id|>system<|end_header_id|>\n");│
│  │          prompt.push_str(sys);                                       │   │
│  │          prompt.push_str("<|eot_id|>\n");                            │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Conversation messages                                        │   │
│  │      for msg in messages {                                           │   │
│  │          let role = match msg.role.as_str() {                        │   │
│  │              "user" => "user",                                       │   │
│  │              "assistant" => "assistant",                             │   │
│  │              _ => continue,  // Skip unknown roles                   │   │
│  │          };                                                          │   │
│  │          prompt.push_str(&format!(                                   │   │
│  │              "<|start_header_id|>{}<|end_header_id|>\n{}<|eot_id|>\n",│   │
│  │              role, msg.content                                       │   │
│  │          ));                                                          │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Final assistant header for generation                        │   │
│  │      prompt.push_str("<|start_header_id|>assistant<|end_header_id|>\n");│
│  │                                                                      │   │
│  │      prompt                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Special Characters in Prompts                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: User input contains LLaMA special tokens                   │   │
│  │                                                                      │   │
│  │  Dangerous inputs:                                                   │   │
│  │  - "<|eot_id|>" in user message → breaks format                     │   │
│  │  - "<|start_header_id|>" → prompt injection risk                    │   │
│  │                                                                      │   │
│  │  Strategy: Escape special tokens                                     │   │
│  │                                                                      │   │
│  │  fn escape_llama_tokens(text: &str) -> String {                     │   │
│  │      text                                                            │   │
│  │          .replace("<|", "<\\|")  // Escape all special token starts │   │
│  │          .replace("|>", "\\|>")  // Escape all special token ends   │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Apply to user content only                                       │   │
│  │  fn format_user_message(content: &str) -> String {                  │   │
│  │      escape_llama_tokens(content)                                    │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Credential Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Credential Expiration During Long Generation                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Streaming response takes > 15 minutes                     │   │
│  │            Temporary credentials expire mid-stream                    │   │
│  │                                                                      │   │
│  │  Note: Once stream is established, credentials are not re-checked    │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Check credential expiration BEFORE starting request              │   │
│  │  2. Refresh if within buffer window (5 min)                          │   │
│  │  3. For very long generations, use long-term credentials             │   │
│  │                                                                      │   │
│  │  async fn ensure_fresh_credentials(&self) -> Result<Credentials> {  │   │
│  │      let creds = self.credentials.get().await?;                     │   │
│  │                                                                      │   │
│  │      // Check if expiring soon                                       │   │
│  │      if let Some(exp) = creds.expiration {                           │   │
│  │          let remaining = exp - Utc::now();                           │   │
│  │          if remaining < Duration::minutes(5) {                       │   │
│  │              info!("Credentials expiring soon, refreshing");         │   │
│  │              return self.credentials.refresh().await;                │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(creds)                                                       │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Cross-Account Model Access                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Accessing shared model from different AWS account         │   │
│  │                                                                      │   │
│  │  Requirements:                                                       │   │
│  │  - Model must be shared via Resource Access Manager                  │   │
│  │  - Caller needs correct IAM permissions                              │   │
│  │  - Model ARN includes owner account ID                               │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  struct BedrockConfig {                                              │   │
│  │      region: String,                                                 │   │
│  │      /// Optional: assume role for cross-account access              │   │
│  │      assume_role_arn: Option<String>,                                │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  async fn get_cross_account_credentials(                             │   │
│  │      &self,                                                          │   │
│  │      role_arn: &str,                                                 │   │
│  │  ) -> Result<Credentials, BedrockError> {                           │   │
│  │      // Use STS AssumeRole via shared credentials module             │   │
│  │      self.credentials.assume_role(AssumeRoleRequest {                │   │
│  │          role_arn: role_arn.to_string(),                             │   │
│  │          session_name: "bedrock-cross-account".to_string(),          │   │
│  │          duration_seconds: Some(3600),                               │   │
│  │          ..Default::default()                                        │   │
│  │      }).await                                                        │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Performance Optimizations

### 3.1 Request/Response Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REQUEST/RESPONSE OPTIMIZATIONS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Pre-computed Signing Key Cache                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: SigV4 derives signing key per request (4 HMAC ops)         │   │
│  │                                                                      │   │
│  │  Solution: Cache signing key per (date, region, service)             │   │
│  │  (Reuse from shared aws/signing module)                              │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - Cache keys for "bedrock" service                                  │   │
│  │  - Evict on date rollover (UTC)                                      │   │
│  │  - ~4x speedup for repeated requests                                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: Request Body Serialization                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: JSON serialization allocates for each request              │   │
│  │                                                                      │   │
│  │  Solution: Reuse serialization buffer                                │   │
│  │                                                                      │   │
│  │  thread_local! {                                                     │   │
│  │      static JSON_BUFFER: RefCell<Vec<u8>> =                         │   │
│  │          RefCell::new(Vec::with_capacity(4096));                    │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn serialize_request<T: Serialize>(request: &T) -> Vec<u8> {       │   │
│  │      JSON_BUFFER.with(|buf| {                                        │   │
│  │          let mut buf = buf.borrow_mut();                             │   │
│  │          buf.clear();                                                │   │
│  │          serde_json::to_writer(&mut *buf, request).unwrap();        │   │
│  │          buf.clone()  // Clone to return ownership                   │   │
│  │      })                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Note: For very large prompts, allocate fresh buffer                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Response Parsing                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Full response deserialization for large outputs            │   │
│  │                                                                      │   │
│  │  Solution: Streaming JSON parsing for large responses                │   │
│  │                                                                      │   │
│  │  // For non-streaming invoke, response may be large                  │   │
│  │  // Use streaming JSON parser to extract fields without full deser   │   │
│  │                                                                      │   │
│  │  async fn parse_large_response(                                      │   │
│  │      body: impl AsyncRead,                                           │   │
│  │  ) -> Result<InvokeResponse, BedrockError> {                        │   │
│  │      // Use simd_json or json_stream for large responses             │   │
│  │      // Extract only needed fields                                   │   │
│  │      ...                                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Streaming Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMING OPTIMIZATIONS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Event Stream Buffer Sizing                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Default buffer may cause excessive reallocations           │   │
│  │                                                                      │   │
│  │  Solution: Pre-size buffer based on expected chunk size              │   │
│  │                                                                      │   │
│  │  struct EventStreamParser {                                          │   │
│  │      // Typical event stream message: 100-500 bytes                  │   │
│  │      // Max reasonable message: ~64KB                                │   │
│  │      buffer: BytesMut::with_capacity(4096),                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl EventStreamParser {                                            │   │
│  │      fn feed(&mut self, chunk: &[u8]) {                             │   │
│  │          // Reserve space if needed                                  │   │
│  │          if self.buffer.remaining_mut() < chunk.len() {             │   │
│  │              // Double capacity up to 64KB                           │   │
│  │              let new_cap = (self.buffer.capacity() * 2)             │   │
│  │                  .min(65536);                                        │   │
│  │              self.buffer.reserve(new_cap - self.buffer.len());      │   │
│  │          }                                                           │   │
│  │          self.buffer.extend_from_slice(chunk);                       │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: Zero-Copy Chunk Parsing                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Copying chunk data for each parse operation                │   │
│  │                                                                      │   │
│  │  Solution: Use references where possible                             │   │
│  │                                                                      │   │
│  │  // Instead of:                                                      │   │
│  │  struct StreamChunk {                                                │   │
│  │      content: String,  // Allocates                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Use:                                                             │   │
│  │  struct StreamChunk<'a> {                                            │   │
│  │      content: Cow<'a, str>,  // Borrows when possible               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // For TypeScript: Use TextDecoder with streaming option            │   │
│  │  const decoder = new TextDecoder('utf-8', { stream: true });        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Batch Chunk Delivery                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Yielding each tiny chunk has overhead                      │   │
│  │                                                                      │   │
│  │  Solution: Option to batch small chunks                              │   │
│  │                                                                      │   │
│  │  struct StreamConfig {                                               │   │
│  │      /// Minimum bytes before yielding chunk (default: 1)            │   │
│  │      min_chunk_size: usize,                                          │   │
│  │                                                                      │   │
│  │      /// Maximum time to wait for more chunks (default: 50ms)        │   │
│  │      max_chunk_delay: Duration,                                      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Use case: High-throughput processing where latency less critical │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Connection Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONNECTION OPTIMIZATIONS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Connection Warmup                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: First request incurs TLS handshake latency (~100-200ms)    │   │
│  │                                                                      │   │
│  │  Solution: Optional warmup on client creation                        │   │
│  │                                                                      │   │
│  │  impl BedrockClient {                                                │   │
│  │      /// Warm up connection pool by establishing connection          │   │
│  │      pub async fn warmup(&self) -> Result<(), BedrockError> {       │   │
│  │          // ListFoundationModels is lightweight                      │   │
│  │          let _ = self.models().list(ListModelsParams::default()).await?;│
│  │          Ok(())                                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Usage                                                            │   │
│  │  let client = BedrockClient::builder()                               │   │
│  │      .region("us-east-1")                                            │   │
│  │      .build()?;                                                      │   │
│  │  client.warmup().await?;  // Optional, for latency-sensitive apps   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: HTTP/2 Multiplexing                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Bedrock supports HTTP/2                                             │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Multiple concurrent requests over single connection               │   │
│  │  - Header compression (HPACK)                                        │   │
│  │  - Better handling of concurrent operations                          │   │
│  │                                                                      │   │
│  │  Configuration (via shared transport):                               │   │
│  │  - Enable HTTP/2 by default                                          │   │
│  │  - Connection pool size: 4 per host (HTTP/2 multiplexes)             │   │
│  │  - Fallback to HTTP/1.1 if negotiation fails                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Keep-Alive Configuration                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Bedrock server behavior:                                            │   │
│  │  - Connections may close after ~60s idle                             │   │
│  │  - Long-running streams stay open                                    │   │
│  │                                                                      │   │
│  │  Recommended settings:                                               │   │
│  │  - idle_timeout: 50 seconds (before server closes)                   │   │
│  │  - tcp_keepalive: 30 seconds                                         │   │
│  │  - pool_max_idle_per_host: 4 (for HTTP/2)                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 RuvVector Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RUVVECTOR OPTIMIZATIONS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Batch Embedding Storage                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Individual INSERTs are slow                                │   │
│  │                                                                      │   │
│  │  Solution: Batch inserts with COPY or multi-row INSERT               │   │
│  │                                                                      │   │
│  │  async fn batch_store_embeddings(                                    │   │
│  │      &self,                                                          │   │
│  │      embeddings: Vec<(Vec<f32>, EmbeddingMetadata)>,                │   │
│  │  ) -> Result<Vec<Uuid>, BedrockError> {                             │   │
│  │      // Use COPY BINARY for best performance                         │   │
│  │      let mut writer = self.pool                                      │   │
│  │          .copy_in("COPY bedrock_embeddings (embedding, ...) FROM STDIN BINARY")│
│  │          .await?;                                                    │   │
│  │                                                                      │   │
│  │      for (embedding, metadata) in embeddings {                       │   │
│  │          writer.write(&encode_binary_row(&embedding, &metadata)).await?;│
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      writer.finish().await?;                                         │   │
│  │      // Return generated UUIDs                                       │   │
│  │      ...                                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Performance: ~10x faster than individual INSERTs                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: Similarity Search Tuning                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  HNSW index parameters:                                              │   │
│  │                                                                      │   │
│  │  CREATE INDEX ON bedrock_embeddings USING hnsw (embedding vector_cosine_ops)│
│  │  WITH (                                                              │   │
│  │      m = 16,              -- Connections per node (default 16)       │   │
│  │      ef_construction = 64 -- Build quality (default 64)              │   │
│  │  );                                                                  │   │
│  │                                                                      │   │
│  │  Query-time tuning:                                                  │   │
│  │  SET hnsw.ef_search = 100;  -- Higher = better recall, slower       │   │
│  │                                                                      │   │
│  │  Recommendations:                                                    │   │
│  │  - Small dataset (<10K): ef_search = 40                              │   │
│  │  - Medium dataset (10K-1M): ef_search = 100                          │   │
│  │  - Large dataset (>1M): ef_search = 200                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Connection Pool Sizing                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Default: 10 connections                                             │   │
│  │                                                                      │   │
│  │  Sizing formula:                                                     │   │
│  │  pool_size = num_cpus * 2 + 1                                        │   │
│  │                                                                      │   │
│  │  For embedding-heavy workloads:                                      │   │
│  │  - Increase to match concurrent embedding operations                 │   │
│  │  - Monitor pg_stat_activity for wait events                          │   │
│  │                                                                      │   │
│  │  RuvVectorConfig {                                                   │   │
│  │      pool_size: 20,  // Higher for embedding-heavy workloads        │   │
│  │      pool_idle_timeout: Duration::from_secs(600),                   │   │
│  │      statement_cache_capacity: 100,                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Security Hardening

### 4.1 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INPUT VALIDATION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Model ID Validation:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_model_id(model_id: &str) -> Result<(), ValidationError>│   │
│  │  {                                                                   │   │
│  │      // Non-empty                                                   │   │
│  │      if model_id.is_empty() {                                        │   │
│  │          return Err(ValidationError::EmptyModelId);                  │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Max length                                                  │   │
│  │      if model_id.len() > 2048 {                                      │   │
│  │          return Err(ValidationError::ModelIdTooLong);                │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Valid characters (for base model IDs)                        │   │
│  │      if !model_id.starts_with("arn:") {                              │   │
│  │          if !model_id.chars().all(|c|                                │   │
│  │              c.is_ascii_alphanumeric() || ".-_:".contains(c)        │   │
│  │          ) {                                                         │   │
│  │              return Err(ValidationError::InvalidModelIdChars);       │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // No null bytes                                               │   │
│  │      if model_id.contains('\0') {                                    │   │
│  │          return Err(ValidationError::NullByte);                      │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Prompt Content Validation:                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_prompt_content(content: &str) -> Result<(), ValidationError>│
│  │  {                                                                   │   │
│  │      // No null bytes                                               │   │
│  │      if content.contains('\0') {                                     │   │
│  │          return Err(ValidationError::NullByteInContent);             │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Validate UTF-8 (Rust strings are always valid UTF-8)         │   │
│  │      // For bytes input, validate explicitly                         │   │
│  │                                                                      │   │
│  │      // Size limits (prevent memory exhaustion)                      │   │
│  │      const MAX_CONTENT_SIZE: usize = 100 * 1024 * 1024; // 100MB     │   │
│  │      if content.len() > MAX_CONTENT_SIZE {                           │   │
│  │          return Err(ValidationError::ContentTooLarge {               │   │
│  │              size: content.len(),                                    │   │
│  │              limit: MAX_CONTENT_SIZE,                                │   │
│  │          });                                                          │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Parameter Range Validation:                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_parameters(params: &InvokeParams)                       │   │
│  │      -> Result<(), ValidationError>                                  │   │
│  │  {                                                                   │   │
│  │      // Temperature: 0.0 to 1.0                                      │   │
│  │      if let Some(temp) = params.temperature {                        │   │
│  │          if !(0.0..=1.0).contains(&temp) {                           │   │
│  │              return Err(ValidationError::TemperatureOutOfRange {     │   │
│  │                  value: temp,                                        │   │
│  │                  min: 0.0,                                           │   │
│  │                  max: 1.0,                                           │   │
│  │              });                                                      │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // top_p: 0.0 to 1.0                                            │   │
│  │      if let Some(top_p) = params.top_p {                             │   │
│  │          if !(0.0..=1.0).contains(&top_p) {                          │   │
│  │              return Err(ValidationError::TopPOutOfRange { ... });    │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // max_tokens: positive integer                                 │   │
│  │      if let Some(max) = params.max_tokens {                          │   │
│  │          if max == 0 {                                               │   │
│  │              return Err(ValidationError::MaxTokensZero);             │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Content Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTENT PROTECTION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Prompt/Response Logging Protection:                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // NEVER log prompt content or model responses                      │   │
│  │  fn log_invoke_request(request: &InvokeRequest) {                   │   │
│  │      info!(                                                          │   │
│  │          model_id = %request.model_id,                              │   │
│  │          // prompt INTENTIONALLY NOT LOGGED                         │   │
│  │          max_tokens = ?request.max_tokens,                          │   │
│  │          temperature = ?request.temperature,                        │   │
│  │          "Invoking model"                                           │   │
│  │      );                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn log_invoke_response(response: &InvokeResponse) {                │   │
│  │      info!(                                                          │   │
│  │          // content INTENTIONALLY NOT LOGGED                        │   │
│  │          stop_reason = ?response.stop_reason,                       │   │
│  │          input_tokens = ?response.usage.input_tokens,               │   │
│  │          output_tokens = ?response.usage.output_tokens,             │   │
│  │          "Model response received"                                   │   │
│  │      );                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Debug Output Sanitization:                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  impl Debug for InvokeRequest {                                      │   │
│  │      fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {          │   │
│  │          f.debug_struct("InvokeRequest")                             │   │
│  │              .field("model_id", &self.model_id)                      │   │
│  │              .field("messages", &format!("[{} messages]",            │   │
│  │                  self.messages.len()))  // Don't show content        │   │
│  │              .field("max_tokens", &self.max_tokens)                  │   │
│  │              .field("temperature", &self.temperature)                │   │
│  │              .finish()                                               │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Debug for InvokeResponse {                                     │   │
│  │      fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {          │   │
│  │          f.debug_struct("InvokeResponse")                            │   │
│  │              .field("content_length", &self.content.len())           │   │
│  │              .field("stop_reason", &self.stop_reason)                │   │
│  │              .field("usage", &self.usage)                            │   │
│  │              .finish()                                               │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Embedding Data Protection:                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Don't log source text for embeddings (may contain PII)           │   │
│  │  fn log_embed_request(request: &EmbedRequest) {                     │   │
│  │      info!(                                                          │   │
│  │          model_id = %request.model_id,                              │   │
│  │          input_length = request.input_text.len(),                   │   │
│  │          dimensions = ?request.dimensions,                          │   │
│  │          // source_text INTENTIONALLY NOT LOGGED                    │   │
│  │          "Generating embedding"                                      │   │
│  │      );                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CREDENTIAL PROTECTION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Inherited from shared aws/credentials module:                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  • SecretString type with redacted Debug                             │   │
│  │  • Zeroize on drop                                                   │   │
│  │  • No serialization support (!Serialize)                             │   │
│  │  • Credential caching with expiration awareness                      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Additional Bedrock-Specific Protection:                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // NEVER log Authorization header                                   │   │
│  │  const SENSITIVE_HEADERS: &[&str] = &[                              │   │
│  │      "authorization",                                                │   │
│  │      "x-amz-security-token",                                         │   │
│  │      "x-amz-date",  // Date can leak timing info                    │   │
│  │  ];                                                                  │   │
│  │                                                                      │   │
│  │  fn sanitize_headers_for_logging(                                    │   │
│  │      headers: &HeaderMap                                             │   │
│  │  ) -> HashMap<String, String> {                                     │   │
│  │      headers.iter()                                                  │   │
│  │          .map(|(k, v)| {                                             │   │
│  │              let key = k.as_str().to_lowercase();                   │   │
│  │              let value = if SENSITIVE_HEADERS.contains(&key.as_str())│   │
│  │              {                                                       │   │
│  │                  "[REDACTED]".to_string()                           │   │
│  │              } else {                                                │   │
│  │                  v.to_str().unwrap_or("[BINARY]").to_string()       │   │
│  │              };                                                      │   │
│  │              (key, value)                                            │   │
│  │          })                                                          │   │
│  │          .collect()                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. API Refinements

### 5.1 Error Handling Improvements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING IMPROVEMENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Rich Error Context:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  pub enum BedrockError {                                             │   │
│  │      // Model errors with context                                    │   │
│  │      ModelNotFound {                                                 │   │
│  │          model_id: String,                                           │   │
│  │          region: String,                                             │   │
│  │          request_id: Option<String>,                                 │   │
│  │          suggestion: String,  // "Use models().list() to discover..."│   │
│  │      },                                                              │   │
│  │                                                                      │   │
│  │      // Validation errors with parameter info                        │   │
│  │      ValidationError {                                               │   │
│  │          message: String,                                            │   │
│  │          parameter: Option<String>,                                  │   │
│  │          provided_value: Option<String>,                             │   │
│  │          allowed_values: Option<Vec<String>>,                       │   │
│  │          request_id: Option<String>,                                 │   │
│  │      },                                                              │   │
│  │                                                                      │   │
│  │      // Rate limit with retry guidance                               │   │
│  │      RateLimited {                                                   │   │
│  │          retry_after: Option<Duration>,                              │   │
│  │          limit_type: RateLimitType,  // Requests or Tokens          │   │
│  │          request_id: Option<String>,                                 │   │
│  │      },                                                              │   │
│  │                                                                      │   │
│  │      // Stream errors with partial content info                      │   │
│  │      StreamError {                                                   │   │
│  │          message: String,                                            │   │
│  │          chunks_received: usize,                                     │   │
│  │          partial_content_available: bool,                            │   │
│  │      },                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl BedrockError {                                                 │   │
│  │      /// Actionable suggestion for resolving the error               │   │
│  │      pub fn suggestion(&self) -> Option<&str> { ... }               │   │
│  │                                                                      │   │
│  │      /// Whether this error is retryable                             │   │
│  │      pub fn is_retryable(&self) -> bool { ... }                     │   │
│  │                                                                      │   │
│  │      /// Suggested wait time before retry                            │   │
│  │      pub fn retry_after(&self) -> Option<Duration> { ... }          │   │
│  │                                                                      │   │
│  │      /// AWS request ID for support inquiries                        │   │
│  │      pub fn request_id(&self) -> Option<&str> { ... }               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Builder Pattern Refinements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BUILDER PATTERN REFINEMENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Fluent Request Builder:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Ergonomic unified invoke builder                                 │   │
│  │  let response = client.invoke()                                      │   │
│  │      .model("anthropic.claude-3-sonnet-20240229-v1:0")               │   │
│  │      .system("You are a helpful assistant.")                         │   │
│  │      .user("What is the capital of France?")                         │   │
│  │      .max_tokens(1024)                                               │   │
│  │      .temperature(0.7)                                               │   │
│  │      .send()                                                         │   │
│  │      .await?;                                                        │   │
│  │                                                                      │   │
│  │  // Multi-turn conversation                                          │   │
│  │  let response = client.invoke()                                      │   │
│  │      .model("meta.llama3-70b-instruct-v1:0")                         │   │
│  │      .system("You are a helpful assistant.")                         │   │
│  │      .user("Hello!")                                                 │   │
│  │      .assistant("Hi! How can I help you today?")                    │   │
│  │      .user("What's 2+2?")                                            │   │
│  │      .send()                                                         │   │
│  │      .await?;                                                        │   │
│  │                                                                      │   │
│  │  // Streaming                                                        │   │
│  │  let stream = client.invoke()                                        │   │
│  │      .model("amazon.titan-text-express-v1")                          │   │
│  │      .user("Write a poem")                                           │   │
│  │      .stream()                                                       │   │
│  │      .await?;                                                        │   │
│  │                                                                      │   │
│  │  while let Some(chunk) = stream.next().await {                       │   │
│  │      print!("{}", chunk?.text);                                      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Type-Safe Client Builder:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Compile-time validation of required fields                       │   │
│  │  let client = BedrockClient::builder()                               │   │
│  │      .region("us-east-1")         // Required                        │   │
│  │      .credentials(credentials)     // Optional, defaults to chain   │   │
│  │      .timeout(Duration::from_secs(120))                              │   │
│  │      .with_ruvvector(ruvvector_config)  // Optional                  │   │
│  │      .build()?;                                                      │   │
│  │                                                                      │   │
│  │  // TypeState pattern ensures region is set before build             │   │
│  │  struct BedrockClientBuilder<R> {                                    │   │
│  │      region: R,                                                      │   │
│  │      // ...                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl BedrockClientBuilder<NoRegion> {                               │   │
│  │      fn region(self, region: &str) -> BedrockClientBuilder<HasRegion>;│
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl BedrockClientBuilder<HasRegion> {                              │   │
│  │      fn build(self) -> Result<BedrockClient, BedrockError>;          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Family-Specific Builders:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Titan-specific embedding builder                                 │   │
│  │  let embeddings = client.titan().embed()                             │   │
│  │      .model("amazon.titan-embed-text-v2:0")                          │   │
│  │      .text("Hello, world!")                                          │   │
│  │      .dimensions(1024)                                               │   │
│  │      .normalize(true)                                                │   │
│  │      .send()                                                         │   │
│  │      .await?;                                                        │   │
│  │                                                                      │   │
│  │  // Claude-specific tool use                                         │   │
│  │  let response = client.claude().message()                            │   │
│  │      .model("anthropic.claude-3-sonnet-20240229-v1:0")               │   │
│  │      .system("You can use tools.")                                   │   │
│  │      .user("What's the weather?")                                    │   │
│  │      .tools(vec![weather_tool])                                      │   │
│  │      .send()                                                         │   │
│  │      .await?;                                                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Testing Refinements

### 6.1 Mock Improvements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MOCK IMPROVEMENTS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request Matchers:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Flexible request matching for tests                              │   │
│  │  let mock = MockBedrockTransport::new()                              │   │
│  │      .expect_invoke()                                                │   │
│  │      .with_model_family(ModelFamily::Claude)                         │   │
│  │      .with_max_tokens_range(1..=4096)                                │   │
│  │      .times(1)                                                       │   │
│  │      .returning(|_| Ok(invoke_response("Hello!")));                  │   │
│  │                                                                      │   │
│  │  // Verify all expectations                                          │   │
│  │  mock.verify();                                                      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Streaming Mock:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Mock streaming responses                                         │   │
│  │  let mock = MockBedrockTransport::new()                              │   │
│  │      .expect_invoke_stream()                                         │   │
│  │      .with_model("amazon.titan-text-express-v1")                     │   │
│  │      .returning(|_| {                                                │   │
│  │          Ok(mock_stream(vec![                                        │   │
│  │              StreamChunk { text: "Hello", is_final: false },        │   │
│  │              StreamChunk { text: " World", is_final: false },       │   │
│  │              StreamChunk {                                           │   │
│  │                  text: "!",                                          │   │
│  │                  is_final: true,                                     │   │
│  │                  usage: Some(UsageInfo { input: 5, output: 3 }),    │   │
│  │              },                                                      │   │
│  │          ]))                                                         │   │
│  │      });                                                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Error Simulation:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Simulate transient errors and retry                              │   │
│  │  let mock = MockBedrockTransport::new()                              │   │
│  │      .on_first_call()                                                │   │
│  │      .return_error(BedrockError::RateLimited {                       │   │
│  │          retry_after: Some(Duration::from_secs(1)),                  │   │
│  │          limit_type: RateLimitType::Requests,                        │   │
│  │          request_id: Some("req-123".into()),                         │   │
│  │      })                                                              │   │
│  │      .on_second_call()                                               │   │
│  │      .return_success(invoke_response("Success!"));                   │   │
│  │                                                                      │   │
│  │  // Test with retry policy                                           │   │
│  │  let result = client.invoke(...).await;                              │   │
│  │  assert!(result.is_ok());                                            │   │
│  │  assert_eq!(mock.call_count(), 2);                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Model Family Testing:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Test each model family's translation                             │   │
│  │  #[test_case(ModelFamily::Titan, titan_request(), titan_response())]│   │
│  │  #[test_case(ModelFamily::Claude, claude_request(), claude_response())]│
│  │  #[test_case(ModelFamily::Llama, llama_request(), llama_response())]│   │
│  │  fn test_model_family_translation(                                   │   │
│  │      family: ModelFamily,                                            │   │
│  │      expected_request: Value,                                        │   │
│  │      mock_response: Value,                                           │   │
│  │  ) {                                                                 │   │
│  │      // Test that unified request translates correctly               │   │
│  │      // Test that response parses correctly                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Integration Test Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   INTEGRATION TEST PATTERNS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Wire Mock Server:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  #[tokio::test]                                                      │   │
│  │  async fn test_titan_invoke_with_mock_server() {                    │   │
│  │      let mock_server = MockServer::start().await;                    │   │
│  │                                                                      │   │
│  │      Mock::given(method("POST"))                                     │   │
│  │          .and(path_regex(r"/model/.+/invoke"))                       │   │
│  │          .and(header_exists("authorization"))                        │   │
│  │          .respond_with(ResponseTemplate::new(200)                    │   │
│  │              .set_body_json(json!({                                  │   │
│  │                  "results": [{                                       │   │
│  │                      "outputText": "Hello!",                         │   │
│  │                      "completionReason": "FINISH"                    │   │
│  │                  }]                                                  │   │
│  │              }))                                                     │   │
│  │              .insert_header("x-amzn-bedrock-input-token-count", "5")│   │
│  │              .insert_header("x-amzn-bedrock-output-token-count", "2"))│
│  │          .mount(&mock_server)                                        │   │
│  │          .await;                                                     │   │
│  │                                                                      │   │
│  │      let client = BedrockClient::builder()                           │   │
│  │          .endpoint(&mock_server.uri())                               │   │
│  │          .region("us-east-1")                                        │   │
│  │          .build()?;                                                  │   │
│  │                                                                      │   │
│  │      let response = client.titan().generate(request).await?;        │   │
│  │      assert_eq!(response.output_text, "Hello!");                     │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Event Stream Mock:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Load pre-recorded event stream fixtures                          │   │
│  │  #[tokio::test]                                                      │   │
│  │  async fn test_claude_streaming_with_fixture() {                    │   │
│  │      let fixture = include_bytes!(                                   │   │
│  │          "../fixtures/streaming/claude/message_complete.bin"         │   │
│  │      );                                                              │   │
│  │                                                                      │   │
│  │      let mock_server = MockServer::start().await;                    │   │
│  │      Mock::given(method("POST"))                                     │   │
│  │          .and(path_regex(r"/model/.+/invoke-with-response-stream"))  │   │
│  │          .respond_with(ResponseTemplate::new(200)                    │   │
│  │              .set_body_raw(fixture, "application/vnd.amazon.eventstream"))│
│  │          .mount(&mock_server)                                        │   │
│  │          .await;                                                     │   │
│  │                                                                      │   │
│  │      // Test streaming                                               │   │
│  │      let mut stream = client.claude()                                │   │
│  │          .create_message_stream(request)                             │   │
│  │          .await?;                                                    │   │
│  │                                                                      │   │
│  │      let mut content = String::new();                                │   │
│  │      while let Some(chunk) = stream.next().await {                   │   │
│  │          content.push_str(&chunk?.text);                             │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      assert!(!content.is_empty());                                   │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  RuvVector Integration:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  #[tokio::test]                                                      │   │
│  │  #[ignore = "requires PostgreSQL"]                                   │   │
│  │  async fn test_embedding_storage() {                                │   │
│  │      let pool = create_test_pool().await;                            │   │
│  │      run_migrations(&pool).await;                                    │   │
│  │                                                                      │   │
│  │      let ruvvector = RuvVectorService::new(pool);                   │   │
│  │                                                                      │   │
│  │      // Store embedding                                              │   │
│  │      let embedding = vec![0.1f32; 1024];                            │   │
│  │      let id = ruvvector.store_embedding(                             │   │
│  │          &embedding,                                                 │   │
│  │          &EmbeddingMetadata {                                        │   │
│  │              source_text: "test".to_string(),                        │   │
│  │              model_id: "amazon.titan-embed-text-v2:0".to_string(),  │   │
│  │          }                                                           │   │
│  │      ).await?;                                                       │   │
│  │                                                                      │   │
│  │      // Search similar                                               │   │
│  │      let results = ruvvector.search_similar(                         │   │
│  │          &embedding,                                                 │   │
│  │          5,                                                          │   │
│  │          0.5,                                                        │   │
│  │      ).await?;                                                       │   │
│  │                                                                      │   │
│  │      assert_eq!(results.len(), 1);                                   │   │
│  │      assert_eq!(results[0].id, id);                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Test Fixtures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST FIXTURES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Fixture Organization:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  tests/fixtures/                                                     │   │
│  │  ├── requests/                                                       │   │
│  │  │   ├── titan_generate.json                                        │   │
│  │  │   ├── titan_embed.json                                           │   │
│  │  │   ├── claude_message.json                                        │   │
│  │  │   └── llama_generate.json                                        │   │
│  │  │                                                                   │   │
│  │  ├── responses/                                                      │   │
│  │  │   ├── titan_generate_success.json                                │   │
│  │  │   ├── claude_message_success.json                                │   │
│  │  │   ├── llama_generate_success.json                                │   │
│  │  │   └── errors/                                                    │   │
│  │  │       ├── validation_error.json                                  │   │
│  │  │       ├── rate_limited.json                                      │   │
│  │  │       └── model_not_found.json                                   │   │
│  │  │                                                                   │   │
│  │  └── streaming/                                                      │   │
│  │      ├── titan/                                                      │   │
│  │      │   ├── simple_response.bin                                    │   │
│  │      │   └── multi_chunk.bin                                        │   │
│  │      ├── claude/                                                     │   │
│  │      │   ├── message_complete.bin                                   │   │
│  │      │   └── tool_use.bin                                           │   │
│  │      └── llama/                                                      │   │
│  │          ├── llama3_response.bin                                    │   │
│  │          └── llama2_response.bin                                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Fixture Helpers:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  mod fixtures {                                                      │   │
│  │      pub fn unified_request() -> UnifiedInvokeRequest {             │   │
│  │          UnifiedInvokeRequest {                                      │   │
│  │              model_id: "amazon.titan-text-express-v1".to_string(),  │   │
│  │              messages: vec![Message {                                │   │
│  │                  role: "user".to_string(),                           │   │
│  │                  content: "Hello".to_string(),                       │   │
│  │              }],                                                      │   │
│  │              max_tokens: Some(100),                                  │   │
│  │              temperature: Some(0.7),                                 │   │
│  │              ..Default::default()                                    │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn titan_generate_response() -> TitanGenerateResponse {    │   │
│  │          TitanGenerateResponse {                                     │   │
│  │              results: vec![TitanResult {                             │   │
│  │                  output_text: "Hello! How can I help?".to_string(),  │   │
│  │                  completion_reason: "FINISH".to_string(),            │   │
│  │                  token_count: Some(10),                              │   │
│  │              }],                                                      │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn embedding_1024() -> Vec<f32> {                          │   │
│  │          vec![0.1f32; 1024]                                         │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Documentation Refinements

### 7.1 API Documentation Standards

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   API DOCUMENTATION STANDARDS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Function Documentation Template:                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  /// Invokes a foundation model via AWS Bedrock.                     │   │
│  │  ///                                                                 │   │
│  │  /// This method provides a unified interface for invoking any       │   │
│  │  /// supported model family (Titan, Claude, LLaMA) through Bedrock. │   │
│  │  /// The request is automatically translated to the model-specific   │   │
│  │  /// format.                                                         │   │
│  │  ///                                                                 │   │
│  │  /// # Arguments                                                    │   │
│  │  ///                                                                 │   │
│  │  /// * `request` - The invoke request containing:                   │   │
│  │  ///   - `model_id`: The model identifier (e.g., "amazon.titan-...")│   │
│  │  ///   - `messages`: Conversation messages                           │   │
│  │  ///   - `max_tokens`: Maximum tokens to generate (optional)         │   │
│  │  ///   - `temperature`: Sampling temperature 0.0-1.0 (optional)      │   │
│  │  ///                                                                 │   │
│  │  /// # Returns                                                       │   │
│  │  ///                                                                 │   │
│  │  /// Returns `UnifiedInvokeResponse` with the generated content.     │   │
│  │  ///                                                                 │   │
│  │  /// # Errors                                                        │   │
│  │  ///                                                                 │   │
│  │  /// - `BedrockError::ModelNotFound` - Model ID not recognized       │   │
│  │  /// - `BedrockError::ValidationError` - Invalid parameters          │   │
│  │  /// - `BedrockError::RateLimited` - Rate limit exceeded             │   │
│  │  /// - `BedrockError::ContentFiltered` - Content policy violation    │   │
│  │  ///                                                                 │   │
│  │  /// # Examples                                                      │   │
│  │  ///                                                                 │   │
│  │  /// ```rust                                                         │   │
│  │  /// use integrations_aws_bedrock::{BedrockClient, UnifiedInvokeRequest};│
│  │  ///                                                                 │   │
│  │  /// let client = BedrockClient::from_env()?;                        │   │
│  │  ///                                                                 │   │
│  │  /// let response = client.invoke(UnifiedInvokeRequest {             │   │
│  │  ///     model_id: "anthropic.claude-3-sonnet-20240229-v1:0".into(),│   │
│  │  ///     messages: vec![Message::user("Hello!")],                   │   │
│  │  ///     max_tokens: Some(1024),                                    │   │
│  │  ///     ..Default::default()                                        │   │
│  │  /// }).await?;                                                      │   │
│  │  ///                                                                 │   │
│  │  /// println!("Response: {}", response.content);                     │   │
│  │  /// ```                                                             │   │
│  │  ///                                                                 │   │
│  │  /// # Model Family Behavior                                         │   │
│  │  ///                                                                 │   │
│  │  /// | Family | Message Format | System Support |                   │   │
│  │  /// |--------|----------------|----------------|                   │   │
│  │  /// | Titan  | Concatenated   | Prepended      |                   │   │
│  │  /// | Claude | Native roles   | Separate field |                   │   │
│  │  /// | LLaMA  | Template tags  | In template    |                   │   │
│  │  pub async fn invoke(                                                │   │
│  │      &self,                                                          │   │
│  │      request: UnifiedInvokeRequest,                                  │   │
│  │  ) -> Result<UnifiedInvokeResponse, BedrockError>;                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Checklist Summary

### Pre-Implementation Checklist

- [x] Specification fully covered
- [x] Architecture principles followed (thin adapter)
- [x] Security requirements met
- [x] Model family edge cases documented
- [x] Streaming edge cases documented
- [x] Translation edge cases documented
- [x] Performance optimizations identified
- [x] Input validation defined
- [x] Error handling comprehensive
- [x] Testing patterns established
- [x] API ergonomics refined
- [x] Documentation standards set

### Key Refinements Made

1. **Model ID Handling**: ARN support, version detection, regional availability
2. **Translation Edge Cases**: Message roles, token limits, parameter mapping
3. **Streaming Robustness**: Buffer accumulation, CRC validation, exception handling
4. **LLaMA Prompt Safety**: Version detection, special token escaping
5. **Embedding Edge Cases**: Dimension validation, batch failures
6. **Performance**: Signing key cache, buffer reuse, HTTP/2 multiplexing
7. **Security**: Content protection, credential redaction, input validation
8. **Error Context**: Rich errors with suggestions and retry guidance
9. **Builder Patterns**: Fluent API with type-safe configuration
10. **Testing**: Mock patterns for streaming, fixtures, RuvVector integration

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial refinement document |

---

**End of Refinement Phase**

*Proceed to Phase 5: Completion when ready.*

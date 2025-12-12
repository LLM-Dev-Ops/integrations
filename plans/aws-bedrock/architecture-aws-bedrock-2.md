# AWS Bedrock Integration Module - Architecture (Part 2)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/aws/bedrock`
**Part:** 2 of 2 - Data Flow, Streaming, Error Handling, RuvVector, Testing

---

## Table of Contents

9. [Data Flow Architecture](#9-data-flow-architecture)
10. [Streaming Architecture](#10-streaming-architecture)
11. [Error Handling Flow](#11-error-handling-flow)
12. [RuvVector Integration](#12-ruvvector-integration)
13. [Testing Architecture](#13-testing-architecture)
14. [Security Architecture](#14-security-architecture)
15. [Observability Architecture](#15-observability-architecture)
16. [Deployment Architecture](#16-deployment-architecture)

---

## 9. Data Flow Architecture

### 9.1 Standard Invoke Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STANDARD INVOKE DATA FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

  Application                Bedrock Module              AWS Bedrock
      │                           │                          │
      │  UnifiedInvokeRequest     │                          │
      ├──────────────────────────►│                          │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 1. Validate │                   │
      │                    │    Request  │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 2. Detect   │                   │
      │                    │   Model     │                   │
      │                    │   Family    │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 3. Route to │                   │
      │                    │   Family    │                   │
      │                    │   Service   │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 4. Translate│                   │
      │                    │   to Model  │                   │
      │                    │   Format    │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 5. Load     │                   │
      │                    │   Credentials│                  │
      │                    │   (shared)  │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 6. Sign     │                   │
      │                    │   Request   │                   │
      │                    │   (SigV4)   │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 7. Execute  │                   │
      │                    │   with      │                   │
      │                    │   Resilience│                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                           │  POST /model/{id}/invoke │
      │                           ├─────────────────────────►│
      │                           │                          │
      │                           │  200 OK + JSON body      │
      │                           │◄─────────────────────────┤
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 8. Parse    │                   │
      │                    │   Family    │                   │
      │                    │   Response  │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │ 9. Translate│                   │
      │                    │   to Unified│                   │
      │                    │   Response  │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │                    ┌──────┴──────┐                   │
      │                    │10. Record   │                   │
      │                    │   Metrics   │                   │
      │                    │   (shared)  │                   │
      │                    └──────┬──────┘                   │
      │                           │                          │
      │  UnifiedInvokeResponse    │                          │
      │◄──────────────────────────┤                          │
      │                           │                          │
```

### 9.2 Request Translation Details

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REQUEST TRANSLATION MATRIX                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┬─────────────────┬──────────────────┬──────────────────┐
│ Unified Field       │ Titan Field     │ Claude Field     │ LLaMA Field      │
├─────────────────────┼─────────────────┼──────────────────┼──────────────────┤
│ model_id            │ (path param)    │ (path param)     │ (path param)     │
│ messages            │ inputText*      │ messages         │ prompt*          │
│ max_tokens          │ maxTokenCount   │ max_tokens       │ max_gen_len      │
│ temperature         │ temperature     │ temperature      │ temperature      │
│ top_p               │ topP            │ top_p            │ top_p            │
│ top_k               │ (not supported) │ top_k            │ (not supported)  │
│ stop_sequences      │ stopSequences   │ stop_sequences   │ (in prompt)      │
│ system              │ (prepend)*      │ system           │ (in prompt)*     │
└─────────────────────┴─────────────────┴──────────────────┴──────────────────┘

* = Requires transformation, not direct mapping

Transformation Logic:

┌─────────────────────────────────────────────────────────────────────────────┐
│  TITAN MESSAGE TRANSFORMATION                                                │
│                                                                              │
│  Input: messages = [                                                         │
│    { role: "user", content: "Hello" },                                       │
│    { role: "assistant", content: "Hi!" },                                    │
│    { role: "user", content: "How are you?" }                                 │
│  ]                                                                           │
│                                                                              │
│  Output: inputText = "User: Hello\nBot: Hi!\nUser: How are you?\nBot:"      │
│                                                                              │
│  Algorithm:                                                                  │
│  1. For each message, prepend role label ("User:" or "Bot:")                 │
│  2. Join with newlines                                                       │
│  3. Append final "Bot:" for assistant turn                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  LLAMA MESSAGE TRANSFORMATION                                                │
│                                                                              │
│  Input: messages = [                                                         │
│    { role: "user", content: "Hello" }                                        │
│  ]                                                                           │
│  system = "You are helpful."                                                 │
│                                                                              │
│  Output (LLaMA 3):                                                           │
│  prompt = "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"   │
│           "You are helpful.<|eot_id|>\n"                                     │
│           "<|start_header_id|>user<|end_header_id|>\n"                       │
│           "Hello<|eot_id|>\n"                                                │
│           "<|start_header_id|>assistant<|end_header_id|>"                    │
│                                                                              │
│  Output (LLaMA 2):                                                           │
│  prompt = "<s>[INST] <<SYS>>\nYou are helpful.\n<</SYS>>\n"                 │
│           "Hello [/INST]"                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Response Translation Details

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RESPONSE TRANSLATION MATRIX                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┬─────────────────┬──────────────────┬──────────────────┐
│ Unified Field       │ Titan Source    │ Claude Source    │ LLaMA Source     │
├─────────────────────┼─────────────────┼──────────────────┼──────────────────┤
│ content             │ results[0].     │ content[0].text  │ generation       │
│                     │   outputText    │                  │                  │
│ stop_reason         │ results[0].     │ stop_reason      │ stop_reason      │
│                     │   completionReason│                │                  │
│ usage.input_tokens  │ header: x-amzn- │ usage.input_     │ prompt_token_    │
│                     │   bedrock-input-│   tokens         │   count          │
│                     │   token-count   │                  │                  │
│ usage.output_tokens │ header: x-amzn- │ usage.output_    │ generation_      │
│                     │   bedrock-output│   tokens         │   token_count    │
│                     │   -token-count  │                  │                  │
└─────────────────────┴─────────────────┴──────────────────┴──────────────────┘

Stop Reason Normalization:

┌────────────────┬────────────────┬────────────────┬────────────────┐
│ Unified        │ Titan          │ Claude         │ LLaMA          │
├────────────────┼────────────────┼────────────────┼────────────────┤
│ EndTurn        │ FINISH         │ end_turn       │ stop           │
│ MaxTokens      │ LENGTH         │ max_tokens     │ length         │
│ StopSequence   │ STOP_SEQUENCE  │ stop_sequence  │ stop           │
│ ContentFilter  │ CONTENT_FILTERED│ -             │ -              │
│ ToolUse        │ -              │ tool_use       │ -              │
└────────────────┴────────────────┴────────────────┴────────────────┘
```

### 9.4 Embedding Flow (Titan Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EMBEDDING DATA FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Application           Bedrock Module          AWS Bedrock      RuvVector
      │                      │                       │               │
      │  TitanEmbedRequest   │                       │               │
      │  (text[], options)   │                       │               │
      ├─────────────────────►│                       │               │
      │                      │                       │               │
      │               ┌──────┴──────┐                │               │
      │               │ Batch if    │                │               │
      │               │ > 1 text    │                │               │
      │               └──────┬──────┘                │               │
      │                      │                       │               │
      │                      │ For each text:        │               │
      │                      ├──────────────────────►│               │
      │                      │ POST /model/titan-    │               │
      │                      │   embed-text-v2/invoke│               │
      │                      │                       │               │
      │                      │ {                     │               │
      │                      │   "inputText": "...", │               │
      │                      │   "dimensions": 1024, │               │
      │                      │   "normalize": true   │               │
      │                      │ }                     │               │
      │                      │                       │               │
      │                      │◄──────────────────────┤               │
      │                      │ { "embedding": [...], │               │
      │                      │   "inputTextTokenCount": n }          │
      │                      │                       │               │
      │               ┌──────┴──────┐                │               │
      │               │ Optionally  │                │               │
      │               │ Store in    │                │               │
      │               │ RuvVector   │                │               │
      │               └──────┬──────┘                │               │
      │                      │                       │               │
      │                      │ If store_embeddings = true            │
      │                      ├──────────────────────────────────────►│
      │                      │ INSERT INTO embeddings                │
      │                      │ (vector, metadata, ...)               │
      │                      │                       │               │
      │                      │◄──────────────────────────────────────┤
      │                      │ embedding_id                          │
      │                      │                       │               │
      │  TitanEmbedResponse  │                       │               │
      │  (embeddings[],      │                       │               │
      │   embedding_ids?)    │                       │               │
      │◄─────────────────────┤                       │               │
```

---

## 10. Streaming Architecture

### 10.1 AWS Event Stream Format

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AWS EVENT STREAM WIRE FORMAT                           │
└─────────────────────────────────────────────────────────────────────────────┘

Unlike Server-Sent Events (SSE), AWS Bedrock uses a binary event stream format:

Content-Type: application/vnd.amazon.eventstream

Each message in the stream:

┌─────────────────────────────────────────────────────────────────────────────┐
│                           MESSAGE STRUCTURE                                  │
│                                                                              │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┬────────────┐│
│  │ Total Length │ Headers      │ Headers      │ Payload      │ Message    ││
│  │ (4 bytes)    │ Length       │              │              │ CRC        ││
│  │              │ (4 bytes)    │ (variable)   │ (variable)   │ (4 bytes)  ││
│  └──────────────┴──────────────┴──────────────┴──────────────┴────────────┘│
│  │              │              │              │              │             │
│  │ Big-endian   │ Big-endian   │ Header       │ JSON body    │ CRC-32C    │
│  │ uint32       │ uint32       │ pairs        │              │ checksum   │
│  │              │              │              │              │             │
│  │ Includes:    │              │ :event-type  │ Model-       │ Covers     │
│  │ - prelude    │              │ :content-type│ specific     │ entire     │
│  │ - headers    │              │ :message-type│ chunk data   │ message    │
│  │ - payload    │              │              │              │             │
│  │ - CRC        │              │              │              │             │
│  └──────────────┴──────────────┴──────────────┴──────────────┴────────────┘│
│                                                                              │
│  PRELUDE (8 bytes):                                                          │
│  ┌──────────────────────────┬──────────────────────────┐                    │
│  │ Total Byte Length (4B)   │ Headers Byte Length (4B) │                    │
│  └──────────────────────────┴──────────────────────────┘                    │
│                                                                              │
│  HEADER ENTRY:                                                               │
│  ┌─────────────────┬─────────────┬────────────────────────┐                 │
│  │ Name Length (1B)│ Name (var)  │ Value Type + Value     │                 │
│  └─────────────────┴─────────────┴────────────────────────┘                 │
│                                                                              │
│  Value Types:                                                                │
│  - 0: bool_true   - 1: bool_false  - 2: byte                                │
│  - 3: short       - 4: int         - 5: long                                │
│  - 6: bytes       - 7: string      - 8: timestamp                           │
│  - 9: uuid                                                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Event Stream Parser Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EVENT STREAM PARSER ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────────┐
                              │   HTTP Response Body    │
                              │   (chunked transfer)    │
                              └───────────┬─────────────┘
                                          │
                                          │ raw bytes
                                          ▼
                              ┌─────────────────────────┐
                              │   Byte Accumulator      │
                              │   Buffer                │
                              │                         │
                              │   Accumulates chunks    │
                              │   until complete message│
                              └───────────┬─────────────┘
                                          │
                                          │ buffered bytes
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS Event Stream Parser                              │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │ 1. Parse Prelude │─►│ 2. Parse Headers │─►│ 3. Parse Payload │           │
│  │                  │  │                  │  │                  │           │
│  │ - Read 8 bytes   │  │ - Name/Value     │  │ - JSON decode    │           │
│  │ - Total length   │  │ - :event-type    │  │ - Base64 if      │           │
│  │ - Headers length │  │ - :content-type  │  │   image data     │           │
│  │ - Validate CRC   │  │ - :message-type  │  │                  │           │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘           │
│                                                                              │
│  ┌──────────────────┐                                                        │
│  │ 4. Validate CRC  │                                                        │
│  │                  │                                                        │
│  │ - CRC-32C        │                                                        │
│  │ - Full message   │                                                        │
│  └──────────────────┘                                                        │
│                                                                              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     │ EventStreamMessage
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Event Type Router                                       │
│                                                                              │
│  MATCH event_type:                                                           │
│    "chunk"             → StreamChunk (normal content)                        │
│    "messageStart"      → StreamStart (model info, role)                      │
│    "contentBlockStart" → ContentStart (tool use, text block)                 │
│    "contentBlockDelta" → ContentDelta (incremental content)                  │
│    "contentBlockStop"  → ContentStop (block complete)                        │
│    "messageStop"       → StreamEnd (usage, stop_reason)                      │
│    "exception"         → StreamError (error details)                         │
│                                                                              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     │ typed event
                                     ▼
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
        ┌───────────────────┐             ┌───────────────────┐
        │ Model Family      │             │ Unified Stream    │
        │ Chunk Parser      │             │ Event             │
        │                   │             │                   │
        │ Titan / Claude /  │────────────►│ UnifiedStreamChunk│
        │ LLaMA specific    │             │ - content         │
        │ parsing           │             │ - delta           │
        └───────────────────┘             │ - is_final        │
                                          │ - usage?          │
                                          └───────────────────┘
```

### 10.3 Model-Specific Chunk Formats

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   MODEL-SPECIFIC CHUNK FORMATS                              │
└─────────────────────────────────────────────────────────────────────────────┘

TITAN STREAMING:
┌─────────────────────────────────────────────────────────────────────────────┐
│  Event payload:                                                              │
│  {                                                                           │
│    "outputText": "The next few tokens...",                                  │
│    "index": 0,                                                               │
│    "totalOutputTextTokenCount": 42,                                          │
│    "completionReason": null | "FINISH" | "LENGTH"                           │
│  }                                                                           │
│                                                                              │
│  Final chunk has completionReason != null                                    │
└─────────────────────────────────────────────────────────────────────────────┘

CLAUDE STREAMING (BEDROCK):
┌─────────────────────────────────────────────────────────────────────────────┐
│  Event types with payloads:                                                  │
│                                                                              │
│  message_start:                                                              │
│  { "type": "message_start",                                                  │
│    "message": { "id": "msg_...", "role": "assistant", ... } }               │
│                                                                              │
│  content_block_start:                                                        │
│  { "type": "content_block_start",                                            │
│    "index": 0,                                                               │
│    "content_block": { "type": "text", "text": "" } }                        │
│                                                                              │
│  content_block_delta:                                                        │
│  { "type": "content_block_delta",                                            │
│    "index": 0,                                                               │
│    "delta": { "type": "text_delta", "text": "Hello" } }                     │
│                                                                              │
│  content_block_stop:                                                         │
│  { "type": "content_block_stop", "index": 0 }                               │
│                                                                              │
│  message_delta:                                                              │
│  { "type": "message_delta",                                                  │
│    "delta": { "stop_reason": "end_turn" },                                  │
│    "usage": { "output_tokens": 100 } }                                      │
│                                                                              │
│  message_stop:                                                               │
│  { "type": "message_stop" }                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

LLAMA STREAMING:
┌─────────────────────────────────────────────────────────────────────────────┐
│  Event payload:                                                              │
│  {                                                                           │
│    "generation": "Next tokens...",                                          │
│    "prompt_token_count": null | 50,  // Only on first chunk                 │
│    "generation_token_count": 10,                                             │
│    "stop_reason": null | "stop" | "length"                                  │
│  }                                                                           │
│                                                                              │
│  Final chunk has stop_reason != null                                         │
│  First chunk may have prompt_token_count                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.4 Streaming State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STREAMING STATE MACHINE                              │
└─────────────────────────────────────────────────────────────────────────────┘

                                 ┌─────────────┐
                                 │   IDLE      │
                                 │   (Start)   │
                                 └──────┬──────┘
                                        │
                                        │ invoke_stream() called
                                        ▼
                                 ┌─────────────┐
                                 │  CONNECTING │
                                 │             │
                                 │ • Send HTTP │
                                 │ • SigV4     │
                                 │ • Await 200 │
                                 └──────┬──────┘
                                        │
                        ┌───────────────┼───────────────┐
                        │               │               │
                        │ HTTP Error    │ 200 OK        │ Timeout
                        ▼               ▼               ▼
                 ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
                 │   ERROR     │ │  STREAMING  │ │   ERROR     │
                 │             │ │             │ │             │
                 │ • Map error │ │ • Parse     │ │ • Timeout   │
                 │ • Emit      │ │   events    │ │   error     │
                 │ • Close     │ │ • Emit      │ │             │
                 └─────────────┘ │   chunks    │ └─────────────┘
                                 └──────┬──────┘
                                        │
                        ┌───────────────┼───────────────┐
                        │               │               │
                        │ exception     │ messageStop   │ Parse error
                        │ event         │ event         │
                        ▼               ▼               ▼
                 ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
                 │ STREAM_ERROR│ │  COMPLETE   │ │   ERROR     │
                 │             │ │             │ │             │
                 │ • Model     │ │ • Final     │ │ • Parse     │
                 │   error     │ │   usage     │ │   error     │
                 │ • Close     │ │ • Close     │ │             │
                 └─────────────┘ └─────────────┘ └─────────────┘


State Transitions with Events:

┌──────────────┬────────────────────┬────────────────────────────────────────┐
│ Current State│ Event              │ Next State + Action                    │
├──────────────┼────────────────────┼────────────────────────────────────────┤
│ IDLE         │ invoke_stream()    │ CONNECTING: send HTTP request          │
│ CONNECTING   │ HTTP 200           │ STREAMING: start parsing               │
│ CONNECTING   │ HTTP 4xx/5xx       │ ERROR: map and emit error              │
│ CONNECTING   │ Timeout            │ ERROR: emit timeout error              │
│ STREAMING    │ chunk event        │ STREAMING: emit chunk                  │
│ STREAMING    │ messageStop event  │ COMPLETE: emit final, close            │
│ STREAMING    │ exception event    │ STREAM_ERROR: emit error, close        │
│ STREAMING    │ parse error        │ ERROR: emit parse error                │
│ STREAMING    │ connection lost    │ ERROR: emit connection error           │
└──────────────┴────────────────────┴────────────────────────────────────────┘
```

### 10.5 Backpressure Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKPRESSURE HANDLING                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Rust (async-stream + tokio):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  pub fn generate_stream(&self, request: Request)                            │
│      -> impl Stream<Item = Result<StreamChunk, BedrockError>>               │
│  {                                                                           │
│      async_stream::try_stream! {                                             │
│          let response = self.send_streaming_request(&request).await?;       │
│          let mut parser = EventStreamParser::new();                          │
│          let mut body = response.bytes_stream();                             │
│                                                                              │
│          // Backpressure: Stream naturally pauses when consumer is slow     │
│          while let Some(chunk) = body.next().await {                         │
│              let bytes = chunk?;                                             │
│              parser.feed(&bytes);                                            │
│                                                                              │
│              // Yield each parsed event (backpressure point)                 │
│              while let Some(event) = parser.next_event()? {                  │
│                  yield parse_chunk(event)?;  // <-- Consumer must poll      │
│              }                                                               │
│          }                                                                   │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

TypeScript (AsyncGenerator):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  async *generateStream(request: Request): AsyncGenerator<StreamChunk> {     │
│      const response = await this.sendStreamingRequest(request);             │
│      const parser = new EventStreamParser();                                 │
│                                                                              │
│      // Node.js stream with backpressure via async iteration                 │
│      for await (const chunk of response.body) {                              │
│          parser.feed(chunk);                                                 │
│                                                                              │
│          // Yield each parsed event                                          │
│          for (const event of parser.drain()) {                               │
│              yield this.parseChunk(event);  // <-- Consumer must await      │
│          }                                                                   │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
│  // Usage with natural backpressure:                                         │
│  for await (const chunk of client.titan.generateStream(request)) {          │
│      console.log(chunk.text);  // Stream pauses here if slow                │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Error Handling Flow

### 11.1 Error Taxonomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR TAXONOMY HIERARCHY                            │
└─────────────────────────────────────────────────────────────────────────────┘

                              BedrockError
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │Configuration│         │  Network    │         │   Model     │
    │   Errors    │         │   Errors    │         │   Errors    │
    └──────┬──────┘         └──────┬──────┘         └──────┬──────┘
           │                       │                       │
     ┌─────┼─────┐           ┌─────┼─────┐           ┌─────┼─────┐
     │     │     │           │     │     │           │     │     │
     ▼     ▼     ▼           ▼     ▼     ▼           ▼     ▼     ▼
   Missing Invalid Region  Timeout Connect SSL   NotFound Access Validation
   Config  Config   Error  Error   Error  Error   Error    Error   Error


Detailed Error Types:

┌───────────────────────────┬────────────────────────────────────────────────┐
│ Error Type                │ Description & Examples                         │
├───────────────────────────┼────────────────────────────────────────────────┤
│ ConfigurationError        │                                                │
│  ├─ MissingConfig         │ Required field not set (region, credentials)   │
│  ├─ InvalidConfig         │ Invalid value (bad region format)              │
│  └─ RegionError           │ Region doesn't support Bedrock                 │
├───────────────────────────┼────────────────────────────────────────────────┤
│ AuthenticationError       │                                                │
│  ├─ CredentialsNotFound   │ No credentials in chain                        │
│  ├─ CredentialsExpired    │ Temporary credentials expired                  │
│  ├─ SignatureError        │ SigV4 signature invalid                        │
│  └─ AccessDenied          │ IAM policy denies action                       │
├───────────────────────────┼────────────────────────────────────────────────┤
│ ModelError                │                                                │
│  ├─ ModelNotFound         │ Model ID doesn't exist                         │
│  ├─ ModelNotAccessible    │ Model not enabled in region                    │
│  ├─ ModelNotReady         │ Provisioned model not ready                    │
│  └─ ModelOverloaded       │ Model capacity exceeded                        │
├───────────────────────────┼────────────────────────────────────────────────┤
│ RequestError              │                                                │
│  ├─ ValidationError       │ Invalid request parameters                     │
│  ├─ PayloadTooLarge       │ Request body exceeds limit                     │
│  ├─ ContentFiltered       │ Content policy violation                       │
│  └─ ContextLengthExceeded │ Input tokens exceed model limit                │
├───────────────────────────┼────────────────────────────────────────────────┤
│ RateLimitError            │                                                │
│  ├─ TooManyRequests       │ Request rate exceeded                          │
│  └─ TokenRateLimited      │ Token rate exceeded                            │
├───────────────────────────┼────────────────────────────────────────────────┤
│ ServerError               │                                                │
│  ├─ InternalError         │ AWS internal error (500)                       │
│  └─ ServiceUnavailable    │ Service temporarily unavailable (503)          │
├───────────────────────────┼────────────────────────────────────────────────┤
│ StreamError               │                                                │
│  ├─ ParseError            │ Event stream parse failure                     │
│  ├─ CrcMismatch           │ CRC validation failed                          │
│  └─ StreamInterrupted     │ Connection lost during streaming               │
└───────────────────────────┴────────────────────────────────────────────────┘
```

### 11.2 HTTP to Error Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HTTP STATUS TO ERROR MAPPING                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────┬─────────────────────────────┬─────────────────────────────────┐
│ HTTP Code │ AWS Error Code              │ BedrockError                    │
├───────────┼─────────────────────────────┼─────────────────────────────────┤
│ 400       │ ValidationException         │ RequestError::ValidationError   │
│ 400       │ ModelStreamErrorException   │ StreamError::ModelError         │
│ 403       │ AccessDeniedException       │ AuthError::AccessDenied         │
│ 404       │ ResourceNotFoundException   │ ModelError::ModelNotFound       │
│ 422       │ UnprocessableEntityException│ RequestError::ValidationError   │
│ 424       │ ModelNotReadyException      │ ModelError::ModelNotReady       │
│ 429       │ ThrottlingException         │ RateLimitError::TooManyRequests │
│ 429       │ ServiceQuotaExceeded        │ RateLimitError::TokenRateLimited│
│ 500       │ InternalServerException     │ ServerError::InternalError      │
│ 503       │ ServiceUnavailableException │ ServerError::ServiceUnavailable │
│ 503       │ ModelErrorException         │ ModelError::ModelOverloaded     │
└───────────┴─────────────────────────────┴─────────────────────────────────┘

Error Response Parsing:

┌─────────────────────────────────────────────────────────────────────────────┐
│  AWS Error Response Format:                                                  │
│                                                                              │
│  HTTP 400 Bad Request                                                        │
│  x-amzn-errortype: ValidationException                                       │
│                                                                              │
│  {                                                                           │
│    "message": "Invalid model identifier: unknown.model"                     │
│  }                                                                           │
│                                                                              │
│  Parsing Priority:                                                           │
│  1. x-amzn-errortype header → error code                                     │
│  2. Response body JSON → error message                                       │
│  3. HTTP status code → fallback error type                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Error Flow with Resilience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING WITH RESILIENCE                           │
└─────────────────────────────────────────────────────────────────────────────┘

                          BedrockClient.invoke()
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │   ResilienceOrchestrator  │
                    │       (from shared)       │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
           ┌────────────────┐         ┌────────────────┐
           │ CircuitBreaker │         │  RateLimiter   │
           │    Check       │         │    Check       │
           └───────┬────────┘         └───────┬────────┘
                   │                          │
                   │ CLOSED/HALF_OPEN         │ Permit acquired
                   ▼                          ▼
           ┌─────────────────────────────────────────────┐
           │              RetryExecutor                   │
           │                                             │
           │  attempt = 1                                │
           │  LOOP:                                       │
           │    result = execute_request()               │
           │    IF success: RETURN result                │
           │    IF non-retryable error: RETURN error     │
           │    IF attempt >= max_attempts: RETURN error │
           │                                             │
           │    wait(backoff * 2^attempt + jitter)       │
           │    attempt += 1                             │
           └──────────────────────┬──────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  Retryable Error │   │Non-Retryable Error│  │     Success      │
│                  │   │                  │   │                  │
│  • 429 TooMany   │   │  • 400 Validation│   │  Return response │
│  • 500 Internal  │   │  • 403 AccessDeny│   │                  │
│  • 503 Unavail   │   │  • 404 NotFound  │   │                  │
│  • Timeout       │   │                  │   │                  │
│  • Connection    │   │  Return error    │   │                  │
│                  │   │  immediately     │   │                  │
│  → Retry         │   │                  │   │                  │
└──────────────────┘   └──────────────────┘   └──────────────────┘
          │
          │ All retries exhausted
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Error Propagation:                                                       │
│                                                                           │
│  1. Map HTTP response to BedrockError                                     │
│  2. Record error metrics (shared/observability)                           │
│  3. Update circuit breaker state (if failure)                             │
│  4. Attach request context (model_id, region, attempt count)              │
│  5. Return error to caller                                                │
│                                                                           │
│  Error includes:                                                          │
│  • error_type: BedrockError variant                                       │
│  • message: Human-readable description                                    │
│  • aws_error_code: Original AWS error type                                │
│  • request_id: AWS request ID (for support)                               │
│  • model_id: Model that was invoked                                       │
│  • region: AWS region                                                     │
│  • retries_attempted: Number of retry attempts                            │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 11.4 Error Type Definitions (Rust)

```rust
// src/errors/error.rs

use thiserror::Error;

#[derive(Error, Debug)]
pub enum BedrockError {
    // Configuration errors
    #[error("Missing required configuration: {field}")]
    MissingConfig { field: String },

    #[error("Invalid configuration: {message}")]
    InvalidConfig { message: String },

    #[error("Region '{region}' does not support Bedrock")]
    UnsupportedRegion { region: String },

    // Authentication errors
    #[error("No credentials found in credential chain")]
    CredentialsNotFound,

    #[error("Credentials expired at {expired_at}")]
    CredentialsExpired { expired_at: String },

    #[error("Signature verification failed")]
    SignatureError { request_id: Option<String> },

    #[error("Access denied: {message}")]
    AccessDenied {
        message: String,
        request_id: Option<String>,
    },

    // Model errors
    #[error("Model not found: {model_id}")]
    ModelNotFound {
        model_id: String,
        request_id: Option<String>,
    },

    #[error("Model not accessible in region: {model_id}")]
    ModelNotAccessible {
        model_id: String,
        region: String,
    },

    #[error("Model not ready: {model_id}")]
    ModelNotReady { model_id: String },

    #[error("Model overloaded: {model_id}")]
    ModelOverloaded { model_id: String },

    // Request errors
    #[error("Validation error: {message}")]
    ValidationError {
        message: String,
        request_id: Option<String>,
    },

    #[error("Payload too large: {size} bytes exceeds limit")]
    PayloadTooLarge { size: usize },

    #[error("Content filtered by safety policy")]
    ContentFiltered { request_id: Option<String> },

    #[error("Context length exceeded: {tokens} tokens > {limit}")]
    ContextLengthExceeded { tokens: usize, limit: usize },

    // Rate limit errors
    #[error("Too many requests")]
    TooManyRequests {
        retry_after: Option<Duration>,
        request_id: Option<String>,
    },

    #[error("Token rate limit exceeded")]
    TokenRateLimited { retry_after: Option<Duration> },

    // Server errors
    #[error("Internal server error")]
    InternalError { request_id: Option<String> },

    #[error("Service unavailable")]
    ServiceUnavailable { retry_after: Option<Duration> },

    // Stream errors
    #[error("Event stream parse error: {message}")]
    StreamParseError { message: String },

    #[error("Event stream CRC mismatch")]
    StreamCrcMismatch,

    #[error("Stream interrupted")]
    StreamInterrupted,

    // Catch-all
    #[error("Unknown error: {message}")]
    Unknown {
        message: String,
        status_code: Option<u16>,
        request_id: Option<String>,
    },
}

impl BedrockError {
    /// Whether this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            BedrockError::TooManyRequests { .. }
            | BedrockError::TokenRateLimited { .. }
            | BedrockError::InternalError { .. }
            | BedrockError::ServiceUnavailable { .. }
            | BedrockError::ModelOverloaded { .. }
            | BedrockError::StreamInterrupted
        )
    }

    /// Get retry-after duration if available
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            BedrockError::TooManyRequests { retry_after, .. } => *retry_after,
            BedrockError::TokenRateLimited { retry_after, .. } => *retry_after,
            BedrockError::ServiceUnavailable { retry_after, .. } => *retry_after,
            _ => None,
        }
    }

    /// Get AWS request ID if available
    pub fn request_id(&self) -> Option<&str> {
        match self {
            BedrockError::AccessDenied { request_id, .. } => request_id.as_deref(),
            BedrockError::ModelNotFound { request_id, .. } => request_id.as_deref(),
            BedrockError::ValidationError { request_id, .. } => request_id.as_deref(),
            BedrockError::ContentFiltered { request_id, .. } => request_id.as_deref(),
            BedrockError::TooManyRequests { request_id, .. } => request_id.as_deref(),
            BedrockError::InternalError { request_id, .. } => request_id.as_deref(),
            BedrockError::Unknown { request_id, .. } => request_id.as_deref(),
            _ => None,
        }
    }
}
```

---

## 12. RuvVector Integration

### 12.1 RuvVector Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RUVVECTOR INTEGRATION OVERVIEW                         │
└─────────────────────────────────────────────────────────────────────────────┘

RuvVector = PostgreSQL + pgvector extension (from shared/database)

Purpose in Bedrock Module:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  1. EMBEDDING STORAGE                                                        │
│     • Store Titan-generated embeddings                                       │
│     • Similarity search for RAG applications                                 │
│     • Batch embedding persistence                                            │
│                                                                              │
│  2. CONVERSATION STATE                                                       │
│     • Persist multi-turn conversations                                       │
│     • Resume conversations across sessions                                   │
│     • Token-aware conversation pruning                                       │
│                                                                              │
│  3. MODEL RESPONSE CACHE (optional)                                          │
│     • Cache identical request/response pairs                                 │
│     • Semantic similarity matching for cache hits                            │
│     • TTL-based cache expiration                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Database Schema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RUVVECTOR SCHEMA FOR BEDROCK                         │
└─────────────────────────────────────────────────────────────────────────────┘

-- Embeddings table (for Titan embeddings)
CREATE TABLE IF NOT EXISTS bedrock_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    embedding vector(1024),  -- Titan embed-text-v2 default dims
    source_text TEXT,
    model_id VARCHAR(128) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexing for similarity search
    CONSTRAINT valid_embedding CHECK (vector_dims(embedding) = 1024)
);

-- Create HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_bedrock_embeddings_hnsw
ON bedrock_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Conversation state table
CREATE TABLE IF NOT EXISTS bedrock_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(256) UNIQUE NOT NULL,
    model_family VARCHAR(32) NOT NULL,  -- 'titan', 'claude', 'llama'
    model_id VARCHAR(128) NOT NULL,
    messages JSONB NOT NULL,  -- Array of message objects
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    INDEX idx_conversations_lookup (conversation_id),
    INDEX idx_conversations_expiry (expires_at)
);

-- Response cache table (optional)
CREATE TABLE IF NOT EXISTS bedrock_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 of normalized request
    model_id VARCHAR(128) NOT NULL,
    response JSONB NOT NULL,
    usage JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER DEFAULT 0,

    INDEX idx_cache_lookup (request_hash, model_id),
    INDEX idx_cache_expiry (expires_at)
);
```

### 12.3 Embedding Operations Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EMBEDDING STORAGE & RETRIEVAL                          │
└─────────────────────────────────────────────────────────────────────────────┘

STORAGE FLOW:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Application                                                                 │
│      │                                                                       │
│      │ embed_and_store(texts: Vec<String>, metadata: Option<Metadata>)      │
│      ▼                                                                       │
│  ┌──────────────────────────────────────────────────┐                       │
│  │ BedrockClient.titan().embed_and_store()          │                       │
│  │                                                  │                       │
│  │ 1. Call Titan embed API for each text           │                       │
│  │ 2. Collect embeddings                           │                       │
│  │ 3. Begin transaction                            │                       │
│  │ 4. INSERT INTO bedrock_embeddings               │                       │
│  │    (embedding, source_text, model_id, metadata) │                       │
│  │ 5. Commit transaction                           │                       │
│  │ 6. Return embedding IDs                         │                       │
│  └──────────────────────────────────────────────────┘                       │
│      │                                                                       │
│      ▼                                                                       │
│  Result<Vec<UUID>>                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

RETRIEVAL FLOW (Similarity Search):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Application                                                                 │
│      │                                                                       │
│      │ search_similar(query: String, top_k: usize, threshold: f32)         │
│      ▼                                                                       │
│  ┌──────────────────────────────────────────────────┐                       │
│  │ BedrockClient.ruvvector().search_similar()       │                       │
│  │                                                  │                       │
│  │ 1. Embed query text using Titan                 │                       │
│  │ 2. SELECT id, source_text, metadata,            │                       │
│  │           1 - (embedding <=> $1) AS similarity  │                       │
│  │    FROM bedrock_embeddings                       │                       │
│  │    WHERE 1 - (embedding <=> $1) > $2            │                       │
│  │    ORDER BY embedding <=> $1                     │                       │
│  │    LIMIT $3                                      │                       │
│  │ 3. Return results with similarity scores        │                       │
│  └──────────────────────────────────────────────────┘                       │
│      │                                                                       │
│      ▼                                                                       │
│  Result<Vec<SimilarityResult>>                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.4 Conversation State Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONVERSATION STATE MANAGEMENT                            │
└─────────────────────────────────────────────────────────────────────────────┘

SAVE CONVERSATION:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  async fn save_conversation(                                                 │
│      &self,                                                                  │
│      conversation_id: &str,                                                  │
│      model_family: ModelFamily,                                              │
│      model_id: &str,                                                         │
│      messages: &[Message],                                                   │
│      ttl: Option<Duration>,                                                  │
│  ) -> Result<(), BedrockError>                                              │
│  {                                                                           │
│      let token_count = estimate_tokens(messages);                            │
│      let expires_at = ttl.map(|d| Utc::now() + d);                           │
│                                                                              │
│      // Upsert conversation                                                  │
│      INSERT INTO bedrock_conversations                                       │
│        (conversation_id, model_family, model_id, messages, token_count,     │
│         updated_at, expires_at)                                              │
│      VALUES ($1, $2, $3, $4, $5, NOW(), $6)                                  │
│      ON CONFLICT (conversation_id) DO UPDATE SET                            │
│        messages = $4,                                                        │
│        token_count = $5,                                                     │
│        updated_at = NOW(),                                                   │
│        expires_at = $6;                                                      │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

LOAD CONVERSATION:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  async fn load_conversation(                                                 │
│      &self,                                                                  │
│      conversation_id: &str,                                                  │
│  ) -> Result<Option<ConversationState>, BedrockError>                       │
│  {                                                                           │
│      SELECT conversation_id, model_family, model_id, messages,              │
│             token_count, updated_at                                          │
│      FROM bedrock_conversations                                              │
│      WHERE conversation_id = $1                                              │
│        AND (expires_at IS NULL OR expires_at > NOW());                       │
│                                                                              │
│      // If found, deserialize messages                                       │
│      // Return ConversationState with message history                        │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

PRUNE CONVERSATION (Token-Aware):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  async fn prune_conversation(                                                │
│      &self,                                                                  │
│      conversation_id: &str,                                                  │
│      max_tokens: usize,                                                      │
│  ) -> Result<(), BedrockError>                                              │
│  {                                                                           │
│      // Load current conversation                                            │
│      let conv = self.load_conversation(conversation_id).await?;             │
│                                                                              │
│      // Remove oldest messages until under token limit                       │
│      let mut messages = conv.messages;                                       │
│      while estimate_tokens(&messages) > max_tokens && messages.len() > 2 {  │
│          // Keep system message (index 0) if present                         │
│          // Remove oldest user/assistant pair                                │
│          messages.remove(1);  // Remove after system                        │
│          messages.remove(1);  // Remove response                            │
│      }                                                                       │
│                                                                              │
│      // Save pruned conversation                                             │
│      self.save_conversation(conversation_id, ..., &messages, ...).await?;  │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.5 RuvVector Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RUVVECTOR COMPONENT ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

                              BedrockClient
                                   │
                                   │ has optional
                                   ▼
                         ┌─────────────────────┐
                         │  RuvVectorService   │
                         │  (Optional)         │
                         ├─────────────────────┤
                         │ - pool: PgPool      │◇──► shared/database
                         │ - titan: TitanSvc   │     connection pool
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │ EmbeddingStore  │   │ ConversationStore│  │   CacheStore   │
    │                 │   │                 │   │   (optional)   │
    ├─────────────────┤   ├─────────────────┤   ├─────────────────┤
    │ + store()       │   │ + save()        │   │ + get()        │
    │ + search()      │   │ + load()        │   │ + set()        │
    │ + delete()      │   │ + prune()       │   │ + invalidate() │
    │ + batch_store() │   │ + delete()      │   │                │
    └─────────────────┘   └─────────────────┘   └─────────────────┘


Initialization Flow:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  BedrockClient::builder()                                                    │
│      .region("us-east-1")                                                    │
│      .with_ruvvector(RuvVectorConfig {                                       │
│          connection_string: "postgres://...",                                │
│          pool_size: 10,                                                      │
│          enable_cache: false,                                                │
│          default_embedding_dims: 1024,                                       │
│      })                                                                      │
│      .build()?;                                                              │
│                                                                              │
│  // Internally:                                                              │
│  // 1. Create PgPool using shared/database                                   │
│  // 2. Run migrations (create tables if not exist)                           │
│  // 3. Initialize RuvVectorService                                           │
│  // 4. Wire to BedrockClient                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Testing Architecture

### 13.1 Test Pyramid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TEST PYRAMID                                       │
└─────────────────────────────────────────────────────────────────────────────┘

                          ┌─────────────────┐
                          │    E2E Tests    │  ← AWS Bedrock (real)
                          │   (few, slow)   │    Live model invocations
                          └────────┬────────┘
                                   │
                      ┌────────────┴────────────┐
                      │   Integration Tests     │  ← Mock HTTP server
                      │   (moderate)            │    Simulated responses
                      └────────────┬────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │              Unit Tests                  │  ← Mocked dependencies
              │              (many, fast)                │    Pure logic testing
              └──────────────────────────────────────────┘


Test Categories:

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  UNIT TESTS (target: 80%+ coverage)                                          │
│  ├── Request translation (Unified → Family)                                  │
│  ├── Response translation (Family → Unified)                                 │
│  ├── Event stream parsing                                                    │
│  ├── Error mapping                                                           │
│  ├── Model family detection                                                  │
│  ├── LLaMA prompt formatting                                                 │
│  ├── Configuration validation                                                │
│  └── Token estimation                                                        │
│                                                                              │
│  INTEGRATION TESTS (mock HTTP)                                               │
│  ├── Full invoke flow with mock Bedrock                                      │
│  ├── Streaming with simulated event stream                                   │
│  ├── Retry behavior with simulated failures                                  │
│  ├── Circuit breaker triggering                                              │
│  ├── Rate limiting                                                           │
│  ├── RuvVector operations (test database)                                    │
│  └── Credential chain with mocked providers                                  │
│                                                                              │
│  E2E TESTS (real AWS, gated by env var)                                      │
│  ├── Titan text generation                                                   │
│  ├── Titan embeddings                                                        │
│  ├── Claude message (if model access)                                        │
│  ├── LLaMA generation (if model access)                                      │
│  ├── Model discovery                                                         │
│  └── Streaming end-to-end                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Mock Server Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MOCK SERVER ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

Rust (wiremock):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  use wiremock::{MockServer, Mock, ResponseTemplate};                         │
│                                                                              │
│  #[tokio::test]                                                              │
│  async fn test_titan_generate() {                                            │
│      // Start mock server                                                    │
│      let mock_server = MockServer::start().await;                            │
│                                                                              │
│      // Configure mock response                                              │
│      Mock::given(method("POST"))                                             │
│          .and(path_regex(r"/model/.+/invoke"))                               │
│          .and(header_exists("x-amz-date"))                                   │
│          .and(header_exists("authorization"))                                │
│          .respond_with(ResponseTemplate::new(200)                            │
│              .set_body_json(json!({                                          │
│                  "results": [{                                               │
│                      "outputText": "Hello!",                                 │
│                      "completionReason": "FINISH"                            │
│                  }]                                                          │
│              }))                                                             │
│              .insert_header("x-amzn-bedrock-input-token-count", "10")        │
│              .insert_header("x-amzn-bedrock-output-token-count", "5"))       │
│          .mount(&mock_server)                                                │
│          .await;                                                             │
│                                                                              │
│      // Create client pointing to mock server                                │
│      let client = BedrockClient::builder()                                   │
│          .endpoint(&mock_server.uri())                                       │
│          .region("us-east-1")                                                │
│          .build()?;                                                          │
│                                                                              │
│      // Test                                                                 │
│      let response = client.titan().generate(...).await?;                     │
│      assert_eq!(response.output_text, "Hello!");                             │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

TypeScript (msw):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  import { setupServer } from 'msw/node';                                     │
│  import { http, HttpResponse } from 'msw';                                   │
│                                                                              │
│  const server = setupServer(                                                 │
│      http.post(                                                              │
│          'https://bedrock-runtime.*.amazonaws.com/model/*/invoke',          │
│          () => {                                                             │
│              return HttpResponse.json({                                      │
│                  results: [{                                                 │
│                      outputText: 'Hello!',                                   │
│                      completionReason: 'FINISH'                              │
│                  }]                                                          │
│              }, {                                                            │
│                  headers: {                                                  │
│                      'x-amzn-bedrock-input-token-count': '10',               │
│                      'x-amzn-bedrock-output-token-count': '5'                │
│                  }                                                           │
│              });                                                             │
│          }                                                                   │
│      )                                                                       │
│  );                                                                          │
│                                                                              │
│  beforeAll(() => server.listen());                                           │
│  afterEach(() => server.resetHandlers());                                    │
│  afterAll(() => server.close());                                             │
│                                                                              │
│  test('titan generate', async () => {                                        │
│      const client = createBedrockClient({ region: 'us-east-1' });           │
│      const response = await client.titan.generate({ ... });                  │
│      expect(response.outputText).toBe('Hello!');                             │
│  });                                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Streaming Test Fixtures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMING TEST FIXTURES                                │
└─────────────────────────────────────────────────────────────────────────────┘

tests/fixtures/streaming/

├── titan/
│   ├── simple_response.bin       # Single chunk completion
│   ├── multi_chunk.bin           # Multiple chunks
│   ├── error_mid_stream.bin      # Error after some chunks
│   └── content_filtered.bin      # Filtered response
│
├── claude/
│   ├── message_complete.bin      # Full message flow
│   ├── tool_use.bin              # Tool use response
│   └── long_response.bin         # Many content deltas
│
├── llama/
│   ├── llama3_response.bin       # LLaMA 3 format
│   ├── llama2_response.bin       # LLaMA 2 format
│   └── max_tokens.bin            # Length-limited response
│
└── errors/
    ├── throttling.bin            # 429 mid-stream
    ├── internal_error.bin        # 500 error
    └── malformed_event.bin       # Parse error case

Fixture Generation:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  // tools/generate_fixtures.rs                                               │
│                                                                              │
│  fn generate_titan_stream_fixture(chunks: &[TitanChunk]) -> Vec<u8> {       │
│      let mut buffer = Vec::new();                                            │
│                                                                              │
│      for chunk in chunks {                                                   │
│          let payload = serde_json::to_vec(chunk)?;                           │
│          let event = EventStreamMessage {                                    │
│              headers: vec![                                                  │
│                  Header::string(":event-type", "chunk"),                     │
│                  Header::string(":content-type", "application/json"),        │
│              ],                                                              │
│              payload,                                                        │
│          };                                                                  │
│          buffer.extend(event.encode()?);                                     │
│      }                                                                       │
│                                                                              │
│      buffer                                                                  │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.4 Test Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TEST CONFIGURATION                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Environment Variables:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  # Enable E2E tests (disabled by default)                                    │
│  BEDROCK_E2E_TESTS=true                                                      │
│                                                                              │
│  # AWS credentials for E2E                                                   │
│  AWS_ACCESS_KEY_ID=...                                                       │
│  AWS_SECRET_ACCESS_KEY=...                                                   │
│  AWS_REGION=us-east-1                                                        │
│                                                                              │
│  # RuvVector test database                                                   │
│  RUVVECTOR_TEST_URL=postgres://localhost:5432/bedrock_test                  │
│                                                                              │
│  # Test model IDs (optional overrides)                                       │
│  BEDROCK_TEST_TITAN_MODEL=amazon.titan-text-lite-v1                          │
│  BEDROCK_TEST_CLAUDE_MODEL=anthropic.claude-3-haiku-20240307-v1:0           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Rust Cargo.toml test configuration:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  [[test]]                                                                    │
│  name = "unit"                                                               │
│  path = "tests/unit/mod.rs"                                                  │
│                                                                              │
│  [[test]]                                                                    │
│  name = "integration"                                                        │
│  path = "tests/integration/mod.rs"                                           │
│  required-features = ["test-support"]                                        │
│                                                                              │
│  [[test]]                                                                    │
│  name = "e2e"                                                                │
│  path = "tests/e2e/mod.rs"                                                   │
│  required-features = ["test-support", "e2e"]                                 │
│                                                                              │
│  [features]                                                                  │
│  test-support = ["wiremock"]                                                 │
│  e2e = []                                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Test Execution:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  # Unit tests only (fast, no deps)                                           │
│  cargo test --test unit                                                      │
│                                                                              │
│  # Integration tests (requires Docker for mock server)                       │
│  cargo test --test integration --features test-support                       │
│                                                                              │
│  # E2E tests (requires AWS credentials)                                      │
│  BEDROCK_E2E_TESTS=true cargo test --test e2e --features test-support,e2e   │
│                                                                              │
│  # All tests                                                                 │
│  cargo test --all-features                                                   │
│                                                                              │
│  # TypeScript                                                                │
│  npm test                          # Unit tests                              │
│  npm run test:integration          # Integration tests                       │
│  BEDROCK_E2E_TESTS=true npm run test:e2e   # E2E tests                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Security Architecture

### 14.1 Credential Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CREDENTIAL SECURITY MODEL                             │
└─────────────────────────────────────────────────────────────────────────────┘

Credential Chain (from aws/credentials, reused):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  1. Environment Variables                                                    │
│     AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_SESSION_TOKEN           │
│                                                                              │
│  2. Shared Credentials File                                                  │
│     ~/.aws/credentials [profile]                                             │
│                                                                              │
│  3. ECS Container Credentials                                                │
│     AWS_CONTAINER_CREDENTIALS_RELATIVE_URI                                   │
│                                                                              │
│  4. EC2 Instance Metadata Service (IMDS)                                     │
│     http://169.254.169.254/latest/meta-data/iam/security-credentials/       │
│                                                                              │
│  5. Assume Role (if configured)                                              │
│     STS AssumeRole → temporary credentials                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Security Practices:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  • NEVER log credentials                                                     │
│  • NEVER include credentials in error messages                               │
│  • Use credential caching with expiry awareness                              │
│  • Automatically refresh temporary credentials                               │
│  • Support MFA token injection for assume role                               │
│  • Validate credentials before first request                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Request Signing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SIGV4 SIGNING FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌──────────────────────────────┐
                        │      Unsigned Request        │
                        │                              │
                        │ POST /model/{id}/invoke      │
                        │ Host: bedrock-runtime...     │
                        │ Content-Type: application/   │
                        │   json                       │
                        │ Body: { ... }                │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │   1. Create Canonical Request│
                        │                              │
                        │   HTTP_METHOD + \n           │
                        │   URI + \n                   │
                        │   QUERY_STRING + \n         │
                        │   CANONICAL_HEADERS + \n     │
                        │   SIGNED_HEADERS + \n        │
                        │   HASHED_PAYLOAD             │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │   2. Create String to Sign   │
                        │                              │
                        │   AWS4-HMAC-SHA256 + \n      │
                        │   TIMESTAMP + \n             │
                        │   SCOPE + \n                 │
                        │   HASH(CANONICAL_REQUEST)    │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │   3. Calculate Signature     │
                        │                              │
                        │   kDate = HMAC("AWS4" +      │
                        │           SECRET, DATE)      │
                        │   kRegion = HMAC(kDate,      │
                        │             REGION)          │
                        │   kService = HMAC(kRegion,   │
                        │              "bedrock")      │
                        │   kSigning = HMAC(kService,  │
                        │              "aws4_request") │
                        │   signature = HMAC(kSigning, │
                        │               STRING_TO_SIGN)│
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │      Signed Request          │
                        │                              │
                        │ + x-amz-date: 20250112T...   │
                        │ + x-amz-content-sha256: ...  │
                        │ + authorization:             │
                        │     AWS4-HMAC-SHA256         │
                        │     Credential=.../bedrock/  │
                        │     SignedHeaders=host;...   │
                        │     Signature=abc123...      │
                        └──────────────────────────────┘

Service Name for Signing:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  bedrock-runtime endpoints → service = "bedrock"                             │
│  bedrock control plane     → service = "bedrock"                             │
│                                                                              │
│  NOTE: Both use "bedrock" as service name, not "bedrock-runtime"            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Data Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA SECURITY MODEL                                  │
└─────────────────────────────────────────────────────────────────────────────┘

Transport Security:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  • TLS 1.2+ required for all connections                                     │
│  • Certificate validation enabled                                            │
│  • No HTTP fallback                                                          │
│  • SNI (Server Name Indication) used                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Data at Rest (RuvVector):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  • Embeddings stored in PostgreSQL with TDE (if enabled)                     │
│  • Conversation history encrypted at application level (optional)            │
│  • TTL-based expiration for temporary data                                   │
│  • Secure deletion (overwrite before delete) for sensitive data              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Logging Security:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  NEVER LOG:                                                                  │
│  • AWS credentials (access key, secret key, session token)                   │
│  • Full request/response bodies (may contain PII)                            │
│  • User prompts (contain user data)                                          │
│  • Model outputs (contain generated content)                                 │
│                                                                              │
│  SAFE TO LOG:                                                                │
│  • Model IDs                                                                 │
│  • Request IDs                                                               │
│  • Token counts                                                              │
│  • Latencies                                                                 │
│  • Error types (not messages with user data)                                 │
│  • Rate limit status                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Observability Architecture

### 15.1 Metrics (from shared/observability)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         METRICS ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

Metrics Emitted (using shared/observability):

┌───────────────────────────────────────┬─────────────────────────────────────┐
│ Metric Name                           │ Labels                              │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_requests_total                │ model_family, model_id, operation,  │
│                                       │ status (success/error)              │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_request_duration_seconds      │ model_family, model_id, operation   │
│ (histogram)                           │                                     │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_tokens_total                  │ model_family, model_id, direction   │
│                                       │ (input/output)                      │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_streaming_chunks_total        │ model_family, model_id              │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_streaming_time_to_first_token │ model_family, model_id              │
│ (histogram)                           │                                     │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_errors_total                  │ model_family, error_type            │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_rate_limit_hits_total         │ model_family, model_id              │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_retry_attempts_total          │ model_family, attempt_number        │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_circuit_breaker_state         │ state (closed/open/half_open)       │
├───────────────────────────────────────┼─────────────────────────────────────┤
│ bedrock_ruvvector_operations_total    │ operation (store/search/load/save)  │
└───────────────────────────────────────┴─────────────────────────────────────┘
```

### 15.2 Distributed Tracing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DISTRIBUTED TRACING SPANS                              │
└─────────────────────────────────────────────────────────────────────────────┘

Span Hierarchy:

bedrock.invoke                              [root span]
  ├── bedrock.validate_request             [validation]
  ├── bedrock.detect_model_family          [routing]
  ├── bedrock.translate_request            [translation]
  ├── aws.credentials.resolve              [credentials - shared]
  ├── aws.signing.sign_request             [signing - shared]
  ├── resilience.execute                   [resilience - shared]
  │     ├── http.request                   [HTTP call]
  │     │     └── (retry attempts)
  │     └── circuit_breaker.check          [circuit breaker]
  ├── bedrock.translate_response           [translation]
  └── bedrock.record_metrics               [metrics]

bedrock.invoke_stream                       [root span for streaming]
  ├── bedrock.validate_request
  ├── bedrock.translate_request
  ├── aws.credentials.resolve
  ├── aws.signing.sign_request
  ├── http.request_stream                  [streaming HTTP]
  ├── bedrock.event_stream.parse           [repeating span per chunk]
  │     ├── bedrock.event_stream.chunk_0
  │     ├── bedrock.event_stream.chunk_1
  │     └── ...
  └── bedrock.record_metrics

Span Attributes:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  bedrock.model_id = "amazon.titan-text-express-v1"                          │
│  bedrock.model_family = "titan"                                              │
│  bedrock.operation = "generate"                                              │
│  bedrock.input_tokens = 50                                                   │
│  bedrock.output_tokens = 100                                                 │
│  bedrock.stop_reason = "end_turn"                                            │
│  aws.region = "us-east-1"                                                    │
│  aws.request_id = "abc-123-..."                                              │
│  http.status_code = 200                                                      │
│  error = true/false                                                          │
│  error.type = "ValidationError"                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.3 Logging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STRUCTURED LOGGING                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Log Levels and Examples:

┌───────────┬───────────────────────────────────────────────────────────────┐
│ Level     │ Example Log Events                                            │
├───────────┼───────────────────────────────────────────────────────────────┤
│ ERROR     │ • Request failed after all retries                            │
│           │ • Circuit breaker opened                                       │
│           │ • Invalid credentials                                          │
│           │ • Stream parse error                                           │
├───────────┼───────────────────────────────────────────────────────────────┤
│ WARN      │ • Rate limit hit (429), retrying                               │
│           │ • Retry attempt 2/3                                            │
│           │ • Credentials expiring soon                                    │
│           │ • Circuit breaker half-open                                    │
├───────────┼───────────────────────────────────────────────────────────────┤
│ INFO      │ • Client initialized                                           │
│           │ • Request completed successfully                               │
│           │ • Stream completed                                             │
│           │ • Credentials refreshed                                        │
├───────────┼───────────────────────────────────────────────────────────────┤
│ DEBUG     │ • Request translation details                                  │
│           │ • Response parsing details                                     │
│           │ • Event stream chunk received                                  │
│           │ • Resilience policy evaluation                                 │
├───────────┼───────────────────────────────────────────────────────────────┤
│ TRACE     │ • HTTP request/response headers                                │
│           │ • SigV4 signing steps                                          │
│           │ • Event stream binary parsing                                  │
└───────────┴───────────────────────────────────────────────────────────────┘

Structured Log Format:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  {                                                                           │
│    "timestamp": "2025-01-12T10:30:00.123Z",                                  │
│    "level": "INFO",                                                          │
│    "target": "integrations_aws_bedrock::services::titan",                    │
│    "message": "Titan generate completed",                                    │
│    "fields": {                                                               │
│      "model_id": "amazon.titan-text-express-v1",                             │
│      "input_tokens": 50,                                                     │
│      "output_tokens": 100,                                                   │
│      "duration_ms": 1234,                                                    │
│      "request_id": "abc-123-def"                                             │
│    },                                                                        │
│    "span": {                                                                 │
│      "trace_id": "0x...",                                                    │
│      "span_id": "0x..."                                                      │
│    }                                                                         │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Deployment Architecture

### 16.1 Package Distribution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PACKAGE DISTRIBUTION                                  │
└─────────────────────────────────────────────────────────────────────────────┘

Rust Crate:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  # Cargo.toml (consumer)                                                     │
│  [dependencies]                                                              │
│  integrations-aws-bedrock = { path = "../integrations/aws/bedrock/rust" }   │
│                                                                              │
│  # Or from internal registry                                                 │
│  integrations-aws-bedrock = { version = "0.1", registry = "internal" }      │
│                                                                              │
│  # Feature flags for selective compilation                                   │
│  integrations-aws-bedrock = {                                                │
│      version = "0.1",                                                        │
│      features = ["titan", "claude"],  # Exclude llama                        │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

TypeScript Package:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  // package.json (consumer)                                                  │
│  {                                                                           │
│    "dependencies": {                                                         │
│      "@integrations/aws-bedrock": "workspace:*"                              │
│    }                                                                         │
│  }                                                                           │
│                                                                              │
│  // Or from internal registry                                                │
│  {                                                                           │
│    "dependencies": {                                                         │
│      "@integrations/aws-bedrock": "^0.1.0"                                   │
│    }                                                                         │
│  }                                                                           │
│                                                                              │
│  // Tree-shakeable imports                                                   │
│  import { createBedrockClient } from '@integrations/aws-bedrock';            │
│  import { TitanService } from '@integrations/aws-bedrock/titan';             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Environment Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ENVIRONMENT CONFIGURATION                               │
└─────────────────────────────────────────────────────────────────────────────┘

Environment Variables:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  # AWS Configuration                                                         │
│  AWS_REGION=us-east-1                                                        │
│  AWS_ACCESS_KEY_ID=...                                                       │
│  AWS_SECRET_ACCESS_KEY=...                                                   │
│  AWS_SESSION_TOKEN=...              # Optional, for temp credentials        │
│  AWS_PROFILE=bedrock-dev            # Optional, use named profile           │
│                                                                              │
│  # Bedrock-specific overrides                                                │
│  BEDROCK_ENDPOINT_URL=https://...   # Optional, custom endpoint             │
│  BEDROCK_TIMEOUT_SECONDS=120        # Optional, default 120                 │
│                                                                              │
│  # RuvVector (optional)                                                      │
│  RUVVECTOR_CONNECTION_STRING=postgres://user:pass@host:5432/db              │
│  RUVVECTOR_POOL_SIZE=10                                                      │
│                                                                              │
│  # Observability                                                             │
│  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317                          │
│  LOG_LEVEL=info                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Configuration Priority:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  1. Explicit configuration (passed to builder)                               │
│  2. Environment variables                                                    │
│  3. Shared config files (~/.aws/config, ~/.aws/credentials)                  │
│  4. Default values                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Regional Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REGIONAL CONSIDERATIONS                               │
└─────────────────────────────────────────────────────────────────────────────┘

Bedrock Regional Availability (as of design):
┌───────────────────────┬─────────────────────────────────────────────────────┐
│ Region                │ Models Available                                    │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ us-east-1             │ Titan, Claude, LLaMA (full)                        │
│ us-west-2             │ Titan, Claude, LLaMA (full)                        │
│ eu-west-1             │ Titan, Claude (partial)                             │
│ ap-northeast-1        │ Titan, Claude (partial)                             │
│ ap-southeast-1        │ Titan (limited)                                     │
└───────────────────────┴─────────────────────────────────────────────────────┘

Multi-Region Strategy:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  // Example: Regional failover                                               │
│  let client = BedrockClient::builder()                                       │
│      .primary_region("us-east-1")                                            │
│      .fallback_regions(vec!["us-west-2", "eu-west-1"])                       │
│      .build()?;                                                              │
│                                                                              │
│  // Automatic failover on regional outage                                    │
│  // Latency-based routing (optional)                                         │
│  // Model availability checking per region                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture - Part 2 |

---

## Architecture Summary

This architecture document (Parts 1 & 2) defines:

1. **Thin Adapter Layer**: Bedrock module owns only model-specific logic; shared modules handle credentials, signing, resilience, observability
2. **Model Family Services**: Isolated services for Titan, Claude (Bedrock format), and LLaMA with clear request/response translation
3. **AWS Event Stream**: Binary streaming format parsing (not SSE) with CRC validation
4. **Error Handling**: Comprehensive error taxonomy with retryable/non-retryable classification
5. **RuvVector Integration**: Optional PostgreSQL + pgvector for embeddings and conversation state
6. **Testing Strategy**: Unit → Integration → E2E pyramid with mock server support
7. **Security**: Credential chain from shared module, SigV4 signing, TLS 1.2+
8. **Observability**: Metrics, distributed tracing, structured logging via shared/observability

**Next Phase**: SPARC Phase 4 - Refinement (detailed implementation specifications)

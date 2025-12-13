# AWS CloudWatch Logs Integration Completion

## SPARC Phase 5: Completion

*Implementation roadmap, file structure, and final deliverables*

---

## 1. Implementation File Structure

### 1.1 Rust Implementation

```
integrations/
└── aws/
    └── cloudwatch-logs/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public API exports
            │   ├── client.rs                   # CloudWatchLogsClient implementation
            │   ├── config.rs                   # CloudWatchLogsConfig and builders
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── log_events/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # LogEventsService implementation
            │   │   │   ├── put.rs              # PutLogEvents operations
            │   │   │   ├── filter.rs           # FilterLogEvents operations
            │   │   │   ├── get.rs              # GetLogEvents operations
            │   │   │   ├── structured.rs       # Structured log helpers
            │   │   │   ├── request.rs          # LogEvent request types
            │   │   │   └── response.rs         # LogEvent response types
            │   │   ├── insights/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # InsightsService implementation
            │   │   │   ├── query.rs            # StartQuery, GetQueryResults
            │   │   │   ├── results.rs          # Query results processing
            │   │   │   ├── request.rs          # Insights request types
            │   │   │   └── response.rs         # Insights response types
            │   │   ├── log_groups/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # LogGroupsService implementation
            │   │   │   ├── crud.rs             # Create, describe, delete operations
            │   │   │   └── types.rs            # LogGroup types
            │   │   ├── log_streams/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # LogStreamsService implementation
            │   │   │   ├── crud.rs             # Create, describe, delete operations
            │   │   │   └── types.rs            # LogStream types
            │   │   ├── retention/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # RetentionService implementation
            │   │   │   ├── policy.rs           # Retention policy operations
            │   │   │   └── validation.rs       # Valid retention days validation
            │   │   ├── subscriptions/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # SubscriptionFilterService
            │   │   │   └── types.rs            # Subscription filter types
            │   │   └── metric_filters/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # MetricFilterService
            │   │       └── types.rs            # Metric filter types
            │   │
            │   ├── batch/
            │   │   ├── mod.rs
            │   │   ├── buffer.rs               # BatchBuffer implementation
            │   │   ├── config.rs               # Batch configuration
            │   │   ├── flush.rs                # Flush logic and background task
            │   │   └── sequencing.rs           # Sequence token management
            │   │
            │   ├── correlation/
            │   │   ├── mod.rs
            │   │   ├── engine.rs               # CorrelationEngine implementation
            │   │   ├── parser.rs               # Log message parsing
            │   │   ├── grouping.rs             # Event grouping by correlation ID
            │   │   └── types.rs                # CorrelatedEvent, CorrelationResult
            │   │
            │   ├── simulation/
            │   │   ├── mod.rs
            │   │   ├── mock_stream.rs          # MockLogStream implementation
            │   │   ├── replay.rs               # Log replay functionality
            │   │   ├── generator.rs            # Test log event generator
            │   │   └── types.rs                # Simulation types
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── log_event.rs            # InputLogEvent, OutputLogEvent
            │   │   ├── log_group.rs            # LogGroup, LogGroupField
            │   │   ├── log_stream.rs           # LogStream
            │   │   ├── query.rs                # QueryInfo, QueryStatus
            │   │   ├── filter.rs               # FilterPattern, LogFilter
            │   │   └── structured.rs           # StructuredLogEvent, correlation IDs
            │   │
            │   ├── builders/
            │   │   ├── mod.rs
            │   │   ├── client_builder.rs       # Client configuration builder
            │   │   ├── query_builder.rs        # Insights query builder
            │   │   ├── filter_builder.rs       # Filter log events builder
            │   │   └── log_event_builder.rs    # Structured log event builder
            │   │
            │   ├── error.rs                    # CloudWatchLogsError and error types
            │   └── util.rs                     # Utility functions (validation, etc.)
            │
            └── tests/
                ├── unit/
                │   ├── services/
                │   │   ├── log_events_test.rs
                │   │   ├── insights_test.rs
                │   │   ├── log_groups_test.rs
                │   │   ├── log_streams_test.rs
                │   │   └── retention_test.rs
                │   ├── batch/
                │   │   ├── buffer_test.rs
                │   │   ├── flush_test.rs
                │   │   └── sequencing_test.rs
                │   ├── correlation/
                │   │   ├── engine_test.rs
                │   │   └── parser_test.rs
                │   ├── types/
                │   │   ├── log_event_test.rs
                │   │   ├── validation_test.rs
                │   │   └── structured_test.rs
                │   └── error_test.rs
                │
                ├── integration/
                │   ├── common/
                │   │   └── mod.rs              # Test utilities, mock server setup
                │   ├── log_events_integration_test.rs
                │   ├── insights_integration_test.rs
                │   ├── batch_integration_test.rs
                │   ├── correlation_integration_test.rs
                │   └── simulation_integration_test.rs
                │
                ├── e2e/
                │   ├── mod.rs                  # E2E test setup (real AWS)
                │   ├── log_events_e2e_test.rs
                │   ├── insights_e2e_test.rs
                │   └── correlation_e2e_test.rs
                │
                ├── fixtures/
                │   ├── requests/
                │   │   ├── put_log_events.json
                │   │   ├── filter_log_events.json
                │   │   ├── start_query.json
                │   │   └── get_query_results.json
                │   ├── responses/
                │   │   ├── put_log_events_success.json
                │   │   ├── filter_log_events_success.json
                │   │   ├── query_results_complete.json
                │   │   ├── query_results_running.json
                │   │   └── errors/
                │   │       ├── invalid_sequence_token.json
                │   │       ├── resource_not_found.json
                │   │       ├── rate_limited.json
                │   │       └── data_already_accepted.json
                │   └── logs/
                │       ├── structured_logs.json
                │       ├── correlated_logs.json
                │       └── replay_scenario.json
                │
                └── mocks/
                    ├── mod.rs
                    ├── transport.rs            # MockHttpTransport
                    ├── credentials.rs          # MockCredentialProvider
                    └── responses.rs            # Canned CloudWatch Logs responses
```

### 1.2 TypeScript Implementation

```
integrations/
└── aws/
    └── cloudwatch-logs/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── README.md
            ├── src/
            │   ├── index.ts                    # Public API exports
            │   ├── client.ts                   # CloudWatchLogsClient implementation
            │   ├── config.ts                   # CloudWatchLogsConfig and builders
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── logEvents/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # LogEventsService
            │   │   │   ├── put.ts              # PutLogEvents operations
            │   │   │   ├── filter.ts           # FilterLogEvents operations
            │   │   │   ├── structured.ts       # Structured log helpers
            │   │   │   ├── request.ts          # LogEvent request types
            │   │   │   └── response.ts         # LogEvent response types
            │   │   ├── insights/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # InsightsService
            │   │   │   ├── query.ts            # Query operations
            │   │   │   ├── request.ts          # Insights request types
            │   │   │   └── response.ts         # Insights response types
            │   │   ├── logGroups/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # LogGroupsService
            │   │   │   └── types.ts            # LogGroup types
            │   │   ├── logStreams/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # LogStreamsService
            │   │   │   └── types.ts            # LogStream types
            │   │   ├── retention/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # RetentionService
            │   │   │   └── validation.ts       # Retention validation
            │   │   ├── subscriptions/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # SubscriptionFilterService
            │   │   │   └── types.ts            # Subscription types
            │   │   └── metricFilters/
            │   │       ├── index.ts
            │   │       ├── service.ts          # MetricFilterService
            │   │       └── types.ts            # MetricFilter types
            │   │
            │   ├── batch/
            │   │   ├── index.ts
            │   │   ├── buffer.ts               # BatchBuffer implementation
            │   │   ├── config.ts               # Batch configuration
            │   │   ├── flush.ts                # Flush logic
            │   │   └── sequencing.ts           # Sequence token management
            │   │
            │   ├── correlation/
            │   │   ├── index.ts
            │   │   ├── engine.ts               # CorrelationEngine
            │   │   ├── parser.ts               # Log message parsing
            │   │   └── types.ts                # Correlation types
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   ├── mockStream.ts           # MockLogStream
            │   │   ├── replay.ts               # Log replay
            │   │   └── generator.ts            # Test log generator
            │   │
            │   ├── types/
            │   │   ├── index.ts
            │   │   ├── logEvent.ts             # LogEvent types
            │   │   ├── logGroup.ts             # LogGroup types
            │   │   ├── logStream.ts            # LogStream types
            │   │   ├── query.ts                # Query types
            │   │   ├── filter.ts               # Filter types
            │   │   └── structured.ts           # Structured log types
            │   │
            │   ├── builders/
            │   │   ├── index.ts
            │   │   ├── clientBuilder.ts        # Client configuration builder
            │   │   ├── queryBuilder.ts         # Insights query builder
            │   │   ├── filterBuilder.ts        # Filter log events builder
            │   │   └── logEventBuilder.ts      # Structured log event builder
            │   │
            │   ├── error.ts                    # CloudWatchLogsError types
            │   └── util.ts                     # Utilities
            │
            └── tests/
                ├── unit/
                │   ├── services/
                │   │   ├── logEvents.test.ts
                │   │   ├── insights.test.ts
                │   │   ├── logGroups.test.ts
                │   │   ├── logStreams.test.ts
                │   │   └── retention.test.ts
                │   ├── batch/
                │   │   ├── buffer.test.ts
                │   │   └── flush.test.ts
                │   ├── correlation/
                │   │   ├── engine.test.ts
                │   │   └── parser.test.ts
                │   └── types/
                │       └── validation.test.ts
                │
                ├── integration/
                │   ├── setup.ts                # Mock server setup
                │   ├── logEvents.integration.test.ts
                │   ├── insights.integration.test.ts
                │   ├── batch.integration.test.ts
                │   └── correlation.integration.test.ts
                │
                └── mocks/
                    ├── index.ts
                    ├── transport.ts            # MockHttpTransport
                    └── credentials.ts          # MockCredentialProvider
```

---

## 2. Implementation Order

### 2.1 Phase 1: Core Infrastructure (Foundation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: CORE INFRASTRUCTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  1.1   │ error.rs/error.ts      │ shared/errors       │ Error mapping      │
│  1.2   │ types/log_event.rs     │ None                │ Event types        │
│  1.3   │ types/log_group.rs     │ None                │ Group types        │
│  1.4   │ types/log_stream.rs    │ None                │ Stream types       │
│  1.5   │ types/structured.rs    │ 1.2                 │ Correlation IDs    │
│  1.6   │ config.rs/config.ts    │ shared/config       │ Config validation  │
│  1.7   │ util.rs/util.ts        │ None                │ Validation helpers │
│                                                                             │
│  Deliverables:                                                              │
│  - CloudWatchLogsError enum with all error variants                        │
│  - InputLogEvent, OutputLogEvent types                                     │
│  - LogGroup, LogStream types                                               │
│  - StructuredLogEvent with correlation ID fields                           │
│  - CloudWatchLogsConfig struct with builder                                │
│  - Name/ARN validation utilities                                           │
│                                                                             │
│  Tests:                                                                     │
│  - Error conversion from HTTP status codes                                 │
│  - Log event timestamp validation                                          │
│  - Log group/stream name validation                                        │
│  - Structured log serialization/deserialization                            │
│  - Config validation (region, endpoints)                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 2: Log Events Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: LOG EVENTS SERVICE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  2.1   │ log_events/request.rs  │ Phase 1             │ Request types      │
│  2.2   │ log_events/response.rs │ Phase 1             │ Response parsing   │
│  2.3   │ log_events/put.rs      │ 2.1, 2.2            │ PutLogEvents       │
│  2.4   │ log_events/filter.rs   │ 2.1, 2.2            │ FilterLogEvents    │
│  2.5   │ log_events/get.rs      │ 2.1, 2.2            │ GetLogEvents       │
│  2.6   │ log_events/structured.rs│ 2.3                │ Structured logging │
│  2.7   │ log_events/service.rs  │ 2.3-2.6             │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│  - PutLogEvents with sequence token handling                               │
│  - PutLogEventsStructured for JSON structured logs                         │
│  - FilterLogEvents with pagination                                         │
│  - FilterLogEventsAll for automatic pagination                             │
│  - GetLogEvents for direct stream access                                   │
│  - Structured log event builder with correlation IDs                       │
│                                                                             │
│  Tests:                                                                     │
│  - PutLogEvents request/response serialization                             │
│  - Sequence token handling (success, stale, missing)                       │
│  - FilterLogEvents pagination (next token handling)                        │
│  - Message size validation (<256KB)                                        │
│  - Batch size validation (<10,000 events, <1MB)                            │
│  - Timestamp validation (±14 days, ±2 hours future)                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Phase 3: Batch Buffer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: BATCH BUFFER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  3.1   │ batch/config.rs        │ Phase 1             │ Batch config       │
│  3.2   │ batch/sequencing.rs    │ Phase 2             │ Token management   │
│  3.3   │ batch/buffer.rs        │ 3.1, 3.2            │ Buffer operations  │
│  3.4   │ batch/flush.rs         │ 3.3                 │ Flush logic        │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  BatchConfig:                                                               │
│  - max_events: u32 (default 10,000)                                        │
│  - max_bytes: usize (default 1MB)                                          │
│  - flush_interval: Duration (default 5s)                                   │
│  - max_retries: u32 (default 3)                                            │
│                                                                             │
│  BatchBuffer:                                                               │
│  - add() - Add event with overflow handling                                │
│  - flush() - Manual flush                                                  │
│  - start_background_flush() - Background task                              │
│  - stop() - Graceful shutdown with final flush                             │
│  - metrics() - Buffer statistics                                           │
│                                                                             │
│  SequenceTokenManager:                                                      │
│  - get_token() - Get current token for stream                              │
│  - update_token() - Update after successful put                            │
│  - invalidate_token() - Clear on InvalidSequenceToken                      │
│                                                                             │
│  Tests:                                                                     │
│  - Buffer add respects max_events limit                                    │
│  - Buffer add respects max_bytes limit                                     │
│  - Flush triggered by interval                                             │
│  - Flush triggered by size threshold                                       │
│  - Sequence token update on success                                        │
│  - Sequence token refresh on InvalidSequenceToken                          │
│  - Graceful shutdown flushes remaining events                              │
│  - Concurrent add operations thread-safe                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Phase 4: Insights Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 4: INSIGHTS SERVICE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  4.1   │ insights/request.rs    │ Phase 1             │ Request types      │
│  4.2   │ insights/response.rs   │ Phase 1             │ Response parsing   │
│  4.3   │ insights/query.rs      │ 4.1, 4.2            │ Query operations   │
│  4.4   │ insights/results.rs    │ 4.2                 │ Result processing  │
│  4.5   │ insights/service.rs    │ 4.3, 4.4            │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  InsightsService:                                                           │
│  - start_query() - Start async query                                       │
│  - get_query_results() - Poll for results                                  │
│  - query() - Blocking query with polling                                   │
│  - query_by_trace_id() - Correlation-aware query                           │
│  - query_by_request_id() - Request correlation query                       │
│  - stop_query() - Cancel running query                                     │
│                                                                             │
│  QueryBuilder (fluent):                                                     │
│  - log_groups() - Target log groups                                        │
│  - query() - Query string                                                  │
│  - time_range() - Start/end times                                          │
│  - limit() - Max results                                                   │
│  - execute() - Run query                                                   │
│                                                                             │
│  Tests:                                                                     │
│  - StartQuery request serialization                                        │
│  - GetQueryResults polling (Running → Complete)                            │
│  - Query timeout handling                                                  │
│  - Invalid query syntax error                                              │
│  - Large result pagination                                                 │
│  - Query cancellation                                                      │
│  - Trace ID correlation query                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Phase 5: Resource Management Services

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 5: RESOURCE MANAGEMENT SERVICES                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  5.1   │ log_groups/service.rs  │ Phase 1             │ Group operations   │
│  5.2   │ log_streams/service.rs │ Phase 1             │ Stream operations  │
│  5.3   │ retention/validation.rs│ None                │ Days validation    │
│  5.4   │ retention/service.rs   │ 5.3                 │ Retention ops      │
│  5.5   │ subscriptions/service.rs│ Phase 1            │ Subscription ops   │
│  5.6   │ metric_filters/svc.rs  │ Phase 1             │ MetricFilter ops   │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  LogGroupsService:                                                          │
│  - create() - CreateLogGroup                                               │
│  - describe() - DescribeLogGroups with pagination                          │
│  - delete() - DeleteLogGroup                                               │
│  - list_tags() - ListTagsLogGroup                                          │
│  - tag() - TagLogGroup                                                     │
│  - untag() - UntagLogGroup                                                 │
│                                                                             │
│  LogStreamsService:                                                         │
│  - create() - CreateLogStream                                              │
│  - describe() - DescribeLogStreams with pagination                         │
│  - delete() - DeleteLogStream                                              │
│                                                                             │
│  RetentionService:                                                          │
│  - put() - PutRetentionPolicy                                              │
│  - delete() - DeleteRetentionPolicy                                        │
│  - Valid days: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365,             │
│                400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653     │
│                                                                             │
│  SubscriptionFilterService:                                                 │
│  - put() - PutSubscriptionFilter                                           │
│  - describe() - DescribeSubscriptionFilters                                │
│  - delete() - DeleteSubscriptionFilter                                     │
│                                                                             │
│  MetricFilterService:                                                       │
│  - put() - PutMetricFilter                                                 │
│  - describe() - DescribeMetricFilters                                      │
│  - delete() - DeleteMetricFilter                                           │
│                                                                             │
│  Tests:                                                                     │
│  - Log group create/describe/delete                                        │
│  - Log stream create/describe/delete                                       │
│  - Retention days validation (valid and invalid)                           │
│  - Subscription filter CRUD                                                │
│  - Metric filter CRUD                                                      │
│  - Pagination handling for describe operations                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Phase 6: Correlation Engine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 6: CORRELATION ENGINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  6.1   │ correlation/types.rs   │ Phase 1             │ Correlation types  │
│  6.2   │ correlation/parser.rs  │ 6.1                 │ Message parsing    │
│  6.3   │ correlation/grouping.rs│ 6.1, 6.2            │ Event grouping     │
│  6.4   │ correlation/engine.rs  │ 6.2, 6.3, Phase 4   │ Engine facade      │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  CorrelationEngine:                                                         │
│  - correlate_by_trace() - Group by trace_id                                │
│  - correlate_by_request() - Group by request_id                            │
│  - correlate_by_span() - Group by span_id                                  │
│  - parse_correlation_ids() - Extract IDs from message                      │
│  - build_correlation_query() - Generate Insights query                     │
│                                                                             │
│  CorrelatedEvent:                                                           │
│  - log_group: String                                                       │
│  - log_stream: String                                                      │
│  - timestamp: i64                                                          │
│  - message: String                                                         │
│  - trace_id: Option<String>                                                │
│  - request_id: Option<String>                                              │
│  - span_id: Option<String>                                                 │
│  - parsed_fields: HashMap<String, Value>                                   │
│                                                                             │
│  CorrelationResult:                                                         │
│  - correlation_id: String                                                  │
│  - correlation_type: CorrelationType (Trace, Request, Span)                │
│  - events: Vec<CorrelatedEvent>                                            │
│  - time_range: TimeRange                                                   │
│  - log_groups: Vec<String>                                                 │
│                                                                             │
│  Tests:                                                                     │
│  - Parse trace_id from JSON message                                        │
│  - Parse request_id from JSON message                                      │
│  - Parse span_id from JSON message                                         │
│  - Handle non-JSON messages gracefully                                     │
│  - Group events by trace_id                                                │
│  - Build correct Insights query                                            │
│  - Handle missing correlation IDs                                          │
│  - Cross-log-group correlation                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Phase 7: Simulation and Replay

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 7: SIMULATION AND REPLAY                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  7.1   │ simulation/types.rs    │ Phase 1             │ Simulation types   │
│  7.2   │ simulation/generator.rs│ 7.1                 │ Log generation     │
│  7.3   │ simulation/mock_stream.rs│ 7.1, Phase 2      │ Mock stream        │
│  7.4   │ simulation/replay.rs   │ 7.1, Phase 2        │ Replay logic       │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  MockLogStream:                                                             │
│  - new() - Create mock stream                                              │
│  - add_event() - Add event to mock                                         │
│  - add_events() - Add multiple events                                      │
│  - filter() - Mock FilterLogEvents                                         │
│  - clear() - Clear all events                                              │
│                                                                             │
│  LogEventGenerator:                                                         │
│  - random_event() - Generate random event                                  │
│  - structured_event() - Generate structured event                          │
│  - correlated_sequence() - Generate correlated events                      │
│  - error_event() - Generate error log event                                │
│                                                                             │
│  LogReplay:                                                                 │
│  - from_file() - Load events from file                                     │
│  - from_cloudwatch() - Load events from real CloudWatch                    │
│  - replay() - Replay events to target stream                               │
│  - replay_with_transform() - Replay with transformation                    │
│  - replay_at_speed() - Replay at configurable speed                        │
│                                                                             │
│  Tests:                                                                     │
│  - MockLogStream stores and retrieves events                               │
│  - MockLogStream filters by timestamp                                      │
│  - LogEventGenerator produces valid events                                 │
│  - Correlated sequence has consistent IDs                                  │
│  - Replay preserves event order                                            │
│  - Replay respects speed multiplier                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.8 Phase 8: Resilience Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 8: RESILIENCE INTEGRATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  8.1   │ Retry integration      │ shared/resilience   │ Retry behavior     │
│  8.2   │ Circuit breaker        │ shared/resilience   │ State transitions  │
│  8.3   │ Rate limiting          │ shared/resilience   │ Throttling         │
│  8.4   │ Tracing integration    │ shared/observability│ Span creation      │
│  8.5   │ Logging integration    │ shared/observability│ Log output         │
│  8.6   │ Metrics integration    │ shared/observability│ Metrics recording  │
│                                                                             │
│  Deliverables:                                                              │
│  - Retry wrapper for transient errors                                      │
│  - Circuit breaker per region                                              │
│  - Rate limiter (request-based)                                            │
│  - Distributed tracing spans for all operations                            │
│  - Structured logging with metadata                                        │
│  - Metrics (latency, events, batch size, errors)                           │
│                                                                             │
│  Retry Classification:                                                      │
│  - Retryable: ThrottlingException, ServiceUnavailableException,            │
│               InternalServerError, InvalidSequenceTokenException           │
│  - Not Retryable: InvalidParameterException, ResourceNotFoundException,    │
│               ResourceAlreadyExistsException, AccessDeniedException,       │
│               DataAlreadyAcceptedException, MalformedQueryException        │
│                                                                             │
│  Tests:                                                                     │
│  - Retry on ThrottlingException                                            │
│  - Retry on InvalidSequenceTokenException with token refresh               │
│  - No retry on ResourceNotFoundException                                   │
│  - Circuit opens after threshold failures                                  │
│  - Rate limit respects configured limits                                   │
│  - Traces contain required attributes                                      │
│  - Metrics recorded for success and failure                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.9 Phase 9: Client Assembly

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 9: CLIENT ASSEMBLY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  9.1   │ builders/client_builder│ All phases          │ Client config      │
│  9.2   │ client.rs              │ 9.1                 │ Client facade      │
│  9.3   │ lib.rs                 │ 9.2                 │ Public exports     │
│                                                                             │
│  Deliverables:                                                              │
│  - CloudWatchLogsClientBuilder with type-safe configuration                │
│  - CloudWatchLogsClient with all service accessors                         │
│  - Lazy service initialization                                             │
│  - Public API exports                                                      │
│  - Re-exports of all public types                                          │
│                                                                             │
│  Tests:                                                                     │
│  - Client construction with various configs                                │
│  - Builder requires region before build                                    │
│  - Service accessor lazy initialization                                    │
│  - All services accessible via client                                      │
│  - Health check                                                            │
│  - Graceful shutdown                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.10 Phase 10: Integration & E2E Testing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 10: INTEGRATION & E2E TESTING                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  10.1  │ Mock server setup      │ wiremock/msw        │ Test environment   │
│  10.2  │ Log events integration │ 10.1                │ Event operations   │
│  10.3  │ Insights integration   │ 10.1                │ Query operations   │
│  10.4  │ Batch integration      │ 10.1                │ Batch flush        │
│  10.5  │ Correlation integration│ 10.1                │ Correlation ops    │
│  10.6  │ E2E tests (optional)   │ Real AWS            │ Live validation    │
│                                                                             │
│  Deliverables:                                                              │
│  - wiremock/msw mock server configuration                                  │
│  - Recorded response fixtures                                              │
│  - Full integration test suite                                             │
│  - E2E test suite (gated by env var)                                       │
│  - CI/CD pipeline configuration                                            │
│                                                                             │
│  Tests:                                                                     │
│  - Full PutLogEvents flow with mock CloudWatch                             │
│  - Insights query flow with status polling                                 │
│  - Batch buffer integration with mock                                      │
│  - Correlation engine with mock responses                                  │
│  - E2E with real AWS CloudWatch (if credentials available)                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Cargo.toml / package.json

### 3.1 Rust Cargo.toml

```toml
[package]
name = "integrations-aws-cloudwatch-logs"
version = "0.1.0"
edition = "2021"
authors = ["LLM Dev Ops Team"]
description = "AWS CloudWatch Logs integration for LLM Dev Ops"
license = "LLM-Dev-Ops-PSA-1.0"
repository = "https://github.com/org/integrations"

[lib]
name = "integrations_aws_cloudwatch_logs"
path = "src/lib.rs"

[dependencies]
# Shared primitives (workspace dependencies)
integrations-aws-credentials = { path = "../../aws/credentials" }
integrations-aws-signing = { path = "../../aws/signing" }
integrations-shared-resilience = { path = "../../shared/resilience" }
integrations-shared-observability = { path = "../../shared/observability" }
integrations-shared-errors = { path = "../../shared/errors" }
integrations-shared-config = { path = "../../shared/config" }
integrations-logging = { path = "../../logging" }
integrations-tracing = { path = "../../tracing" }

# Async runtime
tokio = { version = "1.35", features = ["full", "sync", "time"] }
futures = "0.3"
async-stream = "0.3"

# HTTP client
reqwest = { version = "0.11", features = ["rustls-tls", "json", "gzip"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Time handling
chrono = { version = "0.4", features = ["serde"] }

# Bytes handling
bytes = "1.5"

# Tracing
tracing = "0.1"

# Lazy initialization
once_cell = "1.19"

# Error handling
thiserror = "1.0"

# URL handling
url = "2.5"

# UUID for correlation IDs
uuid = { version = "1.6", features = ["v4"] }

# Regex for log parsing
regex = "1.10"

[dev-dependencies]
# Testing
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
tempfile = "3.9"
test-case = "3.3"

# Assertions
pretty_assertions = "1.4"

# Async trait
async-trait = "0.1"

[features]
default = []
test-support = ["wiremock"]
e2e = []
simulation = []

[[test]]
name = "unit"
path = "tests/unit/mod.rs"

[[test]]
name = "integration"
path = "tests/integration/mod.rs"
required-features = ["test-support"]

[[test]]
name = "e2e"
path = "tests/e2e/mod.rs"
required-features = ["test-support", "e2e"]
```

### 3.2 TypeScript package.json

```json
{
  "name": "@integrations/aws-cloudwatch-logs",
  "version": "0.1.0",
  "description": "AWS CloudWatch Logs integration for LLM Dev Ops",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --testPathPattern=e2e",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "format": "prettier --write src tests"
  },
  "dependencies": {
    "@integrations/aws-credentials": "workspace:*",
    "@integrations/aws-signing": "workspace:*",
    "@integrations/shared-resilience": "workspace:*",
    "@integrations/shared-observability": "workspace:*",
    "@integrations/shared-errors": "workspace:*",
    "@integrations/shared-config": "workspace:*",
    "@integrations/logging": "workspace:*",
    "@integrations/tracing": "workspace:*"
  },
  "devDependencies": {
    "@types/jest": "^29.5.11",
    "@types/node": "^20.10.6",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1",
    "msw": "^2.0.11"
  },
  "peerDependencies": {
    "undici": "^6.2.1"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "LLM-Dev-Ops-PSA-1.0"
}
```

---

## 4. Public API Summary

### 4.1 Rust Public API

```rust
// lib.rs - Public exports

// Client
pub use client::CloudWatchLogsClient;
pub use builders::CloudWatchLogsClientBuilder;

// Configuration
pub use config::{CloudWatchLogsConfig, CloudWatchLogsConfigBuilder};

// Log Event Types
pub use types::log_event::{
    InputLogEvent,
    OutputLogEvent,
    FilteredLogEvent,
    PutLogEventsRequest,
    PutLogEventsResponse,
    FilterLogEventsRequest,
    FilterLogEventsResponse,
};

// Structured Log Types
pub use types::structured::{
    StructuredLogEvent,
    StructuredLogEventBuilder,
    LogLevel,
    CorrelationIds,
};

// Log Group Types
pub use types::log_group::{
    LogGroup,
    CreateLogGroupRequest,
    DescribeLogGroupsRequest,
    DescribeLogGroupsResponse,
};

// Log Stream Types
pub use types::log_stream::{
    LogStream,
    CreateLogStreamRequest,
    DescribeLogStreamsRequest,
    DescribeLogStreamsResponse,
};

// Query Types
pub use types::query::{
    QueryInfo,
    QueryStatus,
    StartQueryRequest,
    StartQueryResponse,
    GetQueryResultsRequest,
    GetQueryResultsResponse,
    QueryResultRow,
    QueryResultField,
};

// Filter Types
pub use types::filter::{
    FilterPattern,
    LogFilter,
    SubscriptionFilter,
    MetricFilter,
    MetricTransformation,
};

// Service Traits
pub use services::{
    LogEventsService,
    InsightsService,
    LogGroupsService,
    LogStreamsService,
    RetentionService,
    SubscriptionFilterService,
    MetricFilterService,
};

// Batch Buffer
pub use batch::{
    BatchBuffer,
    BatchConfig,
    BatchMetrics,
};

// Correlation Engine
pub use correlation::{
    CorrelationEngine,
    CorrelatedEvent,
    CorrelationResult,
    CorrelationType,
};

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub use simulation::{
    MockLogStream,
    LogEventGenerator,
    LogReplay,
};

// Builders
pub use builders::{
    QueryBuilder,
    FilterBuilder,
    LogEventBuilder,
};

// Errors
pub use error::{CloudWatchLogsError, CloudWatchLogsErrorKind};
```

### 4.2 CloudWatchLogsClient Method Summary

```rust
impl CloudWatchLogsClient {
    // Construction
    pub fn builder() -> CloudWatchLogsClientBuilder;
    pub async fn new(config: CloudWatchLogsConfig) -> Result<Self, CloudWatchLogsError>;
    pub async fn from_env() -> Result<Self, CloudWatchLogsError>;

    // Service Accessors (lazy initialization)
    pub fn log_events(&self) -> &dyn LogEventsService;
    pub fn insights(&self) -> &dyn InsightsService;
    pub fn log_groups(&self) -> &dyn LogGroupsService;
    pub fn log_streams(&self) -> &dyn LogStreamsService;
    pub fn retention(&self) -> &dyn RetentionService;
    pub fn subscriptions(&self) -> &dyn SubscriptionFilterService;
    pub fn metric_filters(&self) -> &dyn MetricFilterService;

    // Batch Buffer
    pub fn batch_buffer(&self) -> &BatchBuffer;

    // Correlation Engine
    pub fn correlation(&self) -> &CorrelationEngine;

    // --- Log Events Convenience Methods ---
    pub async fn put_log_events(
        &self,
        log_group: &str,
        log_stream: &str,
        events: Vec<InputLogEvent>,
    ) -> Result<PutLogEventsResponse, CloudWatchLogsError>;

    pub async fn put_structured_log(
        &self,
        log_group: &str,
        log_stream: &str,
        event: StructuredLogEvent,
    ) -> Result<(), CloudWatchLogsError>;

    pub async fn filter_log_events(
        &self,
        log_group: &str,
        filter_pattern: Option<&str>,
        start_time: i64,
        end_time: i64,
    ) -> Result<Vec<FilteredLogEvent>, CloudWatchLogsError>;

    // --- Insights Convenience Methods ---
    pub async fn query(
        &self,
        log_groups: &[&str],
        query: &str,
        start_time: i64,
        end_time: i64,
    ) -> Result<Vec<QueryResultRow>, CloudWatchLogsError>;

    pub async fn query_by_trace_id(
        &self,
        log_groups: &[&str],
        trace_id: &str,
        start_time: i64,
        end_time: i64,
    ) -> Result<CorrelationResult, CloudWatchLogsError>;

    // --- Log Groups Convenience Methods ---
    pub async fn create_log_group(
        &self,
        name: &str,
    ) -> Result<(), CloudWatchLogsError>;

    pub async fn describe_log_groups(
        &self,
        prefix: Option<&str>,
    ) -> Result<Vec<LogGroup>, CloudWatchLogsError>;

    pub async fn delete_log_group(
        &self,
        name: &str,
    ) -> Result<(), CloudWatchLogsError>;

    // --- Log Streams Convenience Methods ---
    pub async fn create_log_stream(
        &self,
        log_group: &str,
        log_stream: &str,
    ) -> Result<(), CloudWatchLogsError>;

    pub async fn describe_log_streams(
        &self,
        log_group: &str,
        prefix: Option<&str>,
    ) -> Result<Vec<LogStream>, CloudWatchLogsError>;

    // --- Retention Convenience Methods ---
    pub async fn set_retention(
        &self,
        log_group: &str,
        retention_days: u32,
    ) -> Result<(), CloudWatchLogsError>;

    pub async fn delete_retention(
        &self,
        log_group: &str,
    ) -> Result<(), CloudWatchLogsError>;

    // --- Fluent Builder APIs ---
    pub fn query_builder(&self) -> QueryBuilder;
    pub fn filter_builder(&self) -> FilterBuilder;
    pub fn log_event_builder(&self) -> LogEventBuilder;

    // --- Health & Utilities ---
    pub async fn health_check(&self) -> HealthStatus;
    pub async fn shutdown(&self) -> Result<(), CloudWatchLogsError>;
}
```

### 4.3 Fluent Builder APIs

```rust
// QueryBuilder - Fluent Insights query
impl QueryBuilder {
    pub fn new(client: &CloudWatchLogsClient) -> Self;

    // Log groups (required)
    pub fn log_group(self, name: &str) -> Self;
    pub fn log_groups(self, names: &[&str]) -> Self;

    // Query (required)
    pub fn query(self, query: &str) -> Self;

    // Time range (required)
    pub fn start_time(self, ts: i64) -> Self;
    pub fn end_time(self, ts: i64) -> Self;
    pub fn time_range(self, start: i64, end: i64) -> Self;
    pub fn last_hours(self, hours: u32) -> Self;
    pub fn last_minutes(self, minutes: u32) -> Self;

    // Options
    pub fn limit(self, max: u32) -> Self;
    pub fn timeout(self, duration: Duration) -> Self;

    // Execution
    pub async fn execute(self) -> Result<Vec<QueryResultRow>, CloudWatchLogsError>;
}

// Usage example:
let results = client.query_builder()
    .log_groups(&["/aws/lambda/my-function", "/aws/ecs/my-service"])
    .query("fields @timestamp, @message | filter @message like /ERROR/")
    .last_hours(24)
    .limit(1000)
    .execute()
    .await?;

for row in results {
    println!("{}: {}", row.get("@timestamp"), row.get("@message"));
}
```

```rust
// FilterBuilder - Fluent FilterLogEvents
impl FilterBuilder {
    pub fn new(client: &CloudWatchLogsClient) -> Self;

    // Log group (required)
    pub fn log_group(self, name: &str) -> Self;

    // Log streams (optional)
    pub fn log_stream(self, name: &str) -> Self;
    pub fn log_streams(self, names: &[&str]) -> Self;
    pub fn log_stream_prefix(self, prefix: &str) -> Self;

    // Time range (optional)
    pub fn start_time(self, ts: i64) -> Self;
    pub fn end_time(self, ts: i64) -> Self;
    pub fn time_range(self, start: i64, end: i64) -> Self;

    // Filter pattern (optional)
    pub fn filter_pattern(self, pattern: &str) -> Self;

    // Options
    pub fn limit(self, max: u32) -> Self;
    pub fn interleaved(self, interleaved: bool) -> Self;

    // Execution
    pub async fn execute(self) -> Result<FilterLogEventsResponse, CloudWatchLogsError>;
    pub async fn execute_all(self) -> Result<Vec<FilteredLogEvent>, CloudWatchLogsError>;
}

// Usage example:
let events = client.filter_builder()
    .log_group("/aws/lambda/my-function")
    .filter_pattern("ERROR")
    .last_hours(1)
    .execute_all()
    .await?;
```

```rust
// LogEventBuilder - Fluent structured log event
impl LogEventBuilder {
    pub fn new() -> Self;

    // Message (required)
    pub fn message(self, msg: &str) -> Self;

    // Timestamp (optional, defaults to now)
    pub fn timestamp(self, ts: i64) -> Self;

    // Log level
    pub fn level(self, level: LogLevel) -> Self;
    pub fn info(self) -> Self;
    pub fn warn(self) -> Self;
    pub fn error(self) -> Self;
    pub fn debug(self) -> Self;

    // Correlation IDs
    pub fn trace_id(self, id: &str) -> Self;
    pub fn request_id(self, id: &str) -> Self;
    pub fn span_id(self, id: &str) -> Self;

    // Custom fields
    pub fn field(self, key: &str, value: impl Into<Value>) -> Self;
    pub fn fields(self, fields: HashMap<String, Value>) -> Self;

    // Error context
    pub fn error(self, err: &dyn std::error::Error) -> Self;
    pub fn error_with_stack(self, err: &dyn std::error::Error, stack: &str) -> Self;

    // Build
    pub fn build(self) -> Result<StructuredLogEvent, CloudWatchLogsError>;
}

// Usage example:
let event = LogEventBuilder::new()
    .message("User login successful")
    .info()
    .trace_id("abc-123")
    .request_id("req-456")
    .field("user_id", "user-789")
    .field("ip_address", "192.168.1.1")
    .build()?;

client.put_structured_log("/app/logs", "auth-stream", event).await?;
```

---

## 5. Test Vectors

### 5.1 Request/Response Test Fixtures

```json
// PutLogEvents Request
{
  "logGroupName": "/aws/lambda/my-function",
  "logStreamName": "2024/01/15/[$LATEST]abc123",
  "logEvents": [
    {
      "timestamp": 1705312800000,
      "message": "{\"level\":\"INFO\",\"message\":\"Request received\",\"trace_id\":\"abc-123\"}"
    },
    {
      "timestamp": 1705312801000,
      "message": "{\"level\":\"INFO\",\"message\":\"Request processed\",\"trace_id\":\"abc-123\"}"
    }
  ],
  "sequenceToken": "49640912345678901234567890"
}

// PutLogEvents Success Response
{
  "nextSequenceToken": "49640912345678901234567891",
  "rejectedLogEventsInfo": null
}

// PutLogEvents InvalidSequenceToken Response
{
  "__type": "InvalidSequenceTokenException",
  "expectedSequenceToken": "49640912345678901234567892",
  "message": "The given sequenceToken is invalid."
}

// FilterLogEvents Request
{
  "logGroupName": "/aws/lambda/my-function",
  "startTime": 1705312800000,
  "endTime": 1705399200000,
  "filterPattern": "ERROR",
  "limit": 100
}

// FilterLogEvents Response
{
  "events": [
    {
      "logStreamName": "2024/01/15/[$LATEST]abc123",
      "timestamp": 1705312850000,
      "message": "{\"level\":\"ERROR\",\"message\":\"Connection failed\",\"trace_id\":\"xyz-789\"}",
      "ingestionTime": 1705312851000,
      "eventId": "37134851234567890123456789"
    }
  ],
  "searchedLogStreams": [
    {
      "logStreamName": "2024/01/15/[$LATEST]abc123",
      "searchedCompletely": true
    }
  ],
  "nextToken": null
}

// StartQuery Request
{
  "logGroupNames": ["/aws/lambda/my-function", "/aws/ecs/my-service"],
  "startTime": 1705312800,
  "endTime": 1705399200,
  "queryString": "fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 100"
}

// StartQuery Response
{
  "queryId": "12ab3c45-6d78-90ef-ab12-34567890abcd"
}

// GetQueryResults Running Response
{
  "status": "Running",
  "results": [],
  "statistics": {
    "recordsMatched": 0.0,
    "recordsScanned": 0.0,
    "bytesScanned": 0.0
  }
}

// GetQueryResults Complete Response
{
  "status": "Complete",
  "results": [
    [
      {"field": "@timestamp", "value": "2024-01-15 10:30:50.123"},
      {"field": "@message", "value": "{\"level\":\"ERROR\",\"message\":\"Connection timeout\"}"},
      {"field": "@logStream", "value": "2024/01/15/[$LATEST]abc123"},
      {"field": "@ptr", "value": "CmQKIQobMTIzNDU2Nzg5MDEyOjEyMzQ1Njc4OTAxMjM0NTY3"}
    ]
  ],
  "statistics": {
    "recordsMatched": 1.0,
    "recordsScanned": 1000.0,
    "bytesScanned": 524288.0
  }
}
```

### 5.2 Error Response Fixtures

```json
// ResourceNotFoundException
{
  "__type": "ResourceNotFoundException",
  "message": "The specified log group does not exist."
}

// ResourceAlreadyExistsException
{
  "__type": "ResourceAlreadyExistsException",
  "message": "The specified log group already exists."
}

// InvalidParameterException
{
  "__type": "InvalidParameterException",
  "message": "1 validation error detected: Value '0' at 'retentionInDays' failed to satisfy constraint"
}

// ThrottlingException
{
  "__type": "ThrottlingException",
  "message": "Rate exceeded"
}

// ServiceUnavailableException
{
  "__type": "ServiceUnavailableException",
  "message": "The service cannot complete the request."
}

// DataAlreadyAcceptedException
{
  "__type": "DataAlreadyAcceptedException",
  "expectedSequenceToken": "49640912345678901234567893",
  "message": "The given batch of log events has already been accepted."
}

// MalformedQueryException
{
  "__type": "MalformedQueryException",
  "message": "unexpected token 'SELEC' at line 1"
}

// LimitExceededException
{
  "__type": "LimitExceededException",
  "message": "The maximum number of log groups has been reached."
}
```

### 5.3 Structured Log Fixtures

```json
// Standard structured log event
{
  "timestamp": 1705312800000,
  "level": "INFO",
  "message": "User authentication successful",
  "trace_id": "abc-123-def-456",
  "request_id": "req-789-ghi-012",
  "span_id": "span-345-jkl-678",
  "service": "auth-service",
  "user_id": "user-901234",
  "duration_ms": 45,
  "metadata": {
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0"
  }
}

// Error structured log event
{
  "timestamp": 1705312850000,
  "level": "ERROR",
  "message": "Database connection failed",
  "trace_id": "abc-123-def-456",
  "request_id": "req-789-ghi-012",
  "span_id": "span-567-mno-890",
  "service": "user-service",
  "error": {
    "type": "ConnectionError",
    "message": "Connection timed out after 30s",
    "stack": "at connect (db.rs:45)\nat query (user.rs:123)"
  },
  "retry_count": 3
}

// Correlated log sequence
[
  {
    "timestamp": 1705312800000,
    "level": "INFO",
    "message": "Request received",
    "trace_id": "trace-abc-123",
    "request_id": "req-001",
    "span_id": "span-001",
    "service": "api-gateway"
  },
  {
    "timestamp": 1705312801000,
    "level": "INFO",
    "message": "Forwarding to auth service",
    "trace_id": "trace-abc-123",
    "request_id": "req-001",
    "span_id": "span-002",
    "service": "api-gateway",
    "parent_span_id": "span-001"
  },
  {
    "timestamp": 1705312802000,
    "level": "INFO",
    "message": "Authentication successful",
    "trace_id": "trace-abc-123",
    "request_id": "req-001",
    "span_id": "span-003",
    "service": "auth-service",
    "parent_span_id": "span-002"
  },
  {
    "timestamp": 1705312803000,
    "level": "INFO",
    "message": "Request completed",
    "trace_id": "trace-abc-123",
    "request_id": "req-001",
    "span_id": "span-001",
    "service": "api-gateway",
    "duration_ms": 3000
  }
]
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/aws-cloudwatch-logs-integration.yml
name: AWS CloudWatch Logs Integration

on:
  push:
    paths:
      - 'integrations/aws/cloudwatch-logs/**'
  pull_request:
    paths:
      - 'integrations/aws/cloudwatch-logs/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test-rust:
    name: Rust Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Cache cargo
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-cloudwatch-logs-${{ hashFiles('**/Cargo.lock') }}

      - name: Check formatting
        run: cargo fmt --check
        working-directory: integrations/aws/cloudwatch-logs/rust

      - name: Clippy
        run: cargo clippy -- -D warnings
        working-directory: integrations/aws/cloudwatch-logs/rust

      - name: Unit tests
        run: cargo test --test unit
        working-directory: integrations/aws/cloudwatch-logs/rust

      - name: Doc tests
        run: cargo test --doc
        working-directory: integrations/aws/cloudwatch-logs/rust

  test-typescript:
    name: TypeScript Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        working-directory: integrations/aws/cloudwatch-logs/typescript

      - name: Lint
        run: npm run lint
        working-directory: integrations/aws/cloudwatch-logs/typescript

      - name: Type check
        run: npm run build
        working-directory: integrations/aws/cloudwatch-logs/typescript

      - name: Unit tests
        run: npm run test:unit
        working-directory: integrations/aws/cloudwatch-logs/typescript

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [test-rust, test-typescript]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Rust integration tests
        run: cargo test --test integration --features test-support
        working-directory: integrations/aws/cloudwatch-logs/rust

      - name: Run TypeScript integration tests
        run: npm run test:integration
        working-directory: integrations/aws/cloudwatch-logs/typescript

  e2e-tests:
    name: E2E Tests (Manual)
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    needs: [integration-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run E2E tests
        run: cargo test --test e2e --features test-support,e2e
        working-directory: integrations/aws/cloudwatch-logs/rust
        env:
          CLOUDWATCH_E2E_TESTS: true
          AWS_REGION: ${{ secrets.AWS_REGION }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

  coverage:
    name: Code Coverage
    runs-on: ubuntu-latest
    needs: [test-rust, test-typescript]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: llvm-tools-preview

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate Rust coverage
        run: cargo llvm-cov --lcov --output-path lcov.info
        working-directory: integrations/aws/cloudwatch-logs/rust

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install npm dependencies
        run: npm ci
        working-directory: integrations/aws/cloudwatch-logs/typescript

      - name: Generate TypeScript coverage
        run: npm run test:coverage
        working-directory: integrations/aws/cloudwatch-logs/typescript

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: integrations/aws/cloudwatch-logs/rust/lcov.info,integrations/aws/cloudwatch-logs/typescript/coverage/lcov.info
          flags: aws-cloudwatch-logs
```

---

## 7. Documentation Deliverables

### 7.1 README.md Structure

```markdown
# AWS CloudWatch Logs Integration

A thin adapter layer for AWS CloudWatch Logs integration in the LLM Dev Ops platform,
enabling structured log ingestion, cross-service correlation, and Insights queries.

## Features

- **Structured Logging**: JSON-formatted logs with automatic correlation ID injection
- **Batch Buffering**: Efficient log event batching with configurable thresholds
- **CloudWatch Logs Insights**: Fluent query builder for log analysis
- **Cross-Service Correlation**: Query logs by trace_id, request_id, or span_id
- **Retention Management**: Programmatic retention policy configuration
- **Simulation & Replay**: Mock log streams and replay for testing
- **Resilience**: Automatic retry, circuit breaker, and rate limiting

## Quick Start

### Rust

```rust
use integrations_aws_cloudwatch_logs::{CloudWatchLogsClient, LogEventBuilder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = CloudWatchLogsClient::from_env().await?;

    // Emit structured log
    let event = LogEventBuilder::new()
        .message("User login successful")
        .info()
        .trace_id("abc-123")
        .field("user_id", "user-456")
        .build()?;

    client.put_structured_log("/app/logs", "auth-stream", event).await?;

    // Query logs by trace ID
    let correlated = client.query_by_trace_id(
        &["/app/logs"],
        "abc-123",
        start_time,
        end_time,
    ).await?;

    for event in correlated.events {
        println!("{}: {}", event.timestamp, event.message);
    }

    Ok(())
}
```

### TypeScript

```typescript
import { CloudWatchLogsClient, LogEventBuilder } from '@integrations/aws-cloudwatch-logs';

const client = await CloudWatchLogsClient.fromEnv();

// Emit structured log
const event = new LogEventBuilder()
  .message('User login successful')
  .info()
  .traceId('abc-123')
  .field('user_id', 'user-456')
  .build();

await client.putStructuredLog('/app/logs', 'auth-stream', event);

// Query logs
const results = await client.queryBuilder()
  .logGroup('/app/logs')
  .query('fields @timestamp, @message | filter @message like /ERROR/')
  .lastHours(24)
  .execute();
```

## API Coverage

| Operation | Service | Status |
|-----------|---------|--------|
| PutLogEvents | LogEventsService | ✅ |
| FilterLogEvents | LogEventsService | ✅ |
| GetLogEvents | LogEventsService | ✅ |
| StartQuery | InsightsService | ✅ |
| GetQueryResults | InsightsService | ✅ |
| StopQuery | InsightsService | ✅ |
| CreateLogGroup | LogGroupsService | ✅ |
| DescribeLogGroups | LogGroupsService | ✅ |
| DeleteLogGroup | LogGroupsService | ✅ |
| CreateLogStream | LogStreamsService | ✅ |
| DescribeLogStreams | LogStreamsService | ✅ |
| DeleteLogStream | LogStreamsService | ✅ |
| PutRetentionPolicy | RetentionService | ✅ |
| DeleteRetentionPolicy | RetentionService | ✅ |
| PutSubscriptionFilter | SubscriptionFilterService | ✅ |
| PutMetricFilter | MetricFilterService | ✅ |

## Configuration

See [Configuration Guide](./docs/configuration.md) for all configuration options.

## License

LLM-Dev-Ops-PSA-1.0
```

### 7.2 API Documentation Sections

1. **Getting Started** - Installation, configuration, first log event
2. **Structured Logging** - LogEventBuilder, correlation IDs, log levels
3. **Batch Buffering** - BatchBuffer configuration, flush strategies
4. **CloudWatch Logs Insights** - QueryBuilder, query syntax, result handling
5. **Cross-Service Correlation** - CorrelationEngine, trace/request/span ID queries
6. **Resource Management** - Log groups, streams, retention policies
7. **Subscription Filters** - Real-time log streaming destinations
8. **Metric Filters** - CloudWatch metric extraction from logs
9. **Simulation & Testing** - MockLogStream, LogReplay, test fixtures
10. **Error Handling** - Error types, retry strategies

---

## 8. Compliance Matrix

### 8.1 CloudWatch Logs API Coverage

| API Operation | Service | Implemented | Tested |
|--------------|---------|-------------|--------|
| PutLogEvents | LogEventsService | ✅ | ✅ |
| FilterLogEvents | LogEventsService | ✅ | ✅ |
| GetLogEvents | LogEventsService | ✅ | ✅ |
| StartQuery | InsightsService | ✅ | ✅ |
| GetQueryResults | InsightsService | ✅ | ✅ |
| StopQuery | InsightsService | ✅ | ✅ |
| CreateLogGroup | LogGroupsService | ✅ | ✅ |
| DescribeLogGroups | LogGroupsService | ✅ | ✅ |
| DeleteLogGroup | LogGroupsService | ✅ | ✅ |
| CreateLogStream | LogStreamsService | ✅ | ✅ |
| DescribeLogStreams | LogStreamsService | ✅ | ✅ |
| DeleteLogStream | LogStreamsService | ✅ | ✅ |
| PutRetentionPolicy | RetentionService | ✅ | ✅ |
| DeleteRetentionPolicy | RetentionService | ✅ | ✅ |
| PutSubscriptionFilter | SubscriptionFilterService | ✅ | ✅ |
| DescribeSubscriptionFilters | SubscriptionFilterService | ✅ | ✅ |
| DeleteSubscriptionFilter | SubscriptionFilterService | ✅ | ✅ |
| PutMetricFilter | MetricFilterService | ✅ | ✅ |
| DescribeMetricFilters | MetricFilterService | ✅ | ✅ |
| DeleteMetricFilter | MetricFilterService | ✅ | ✅ |

### 8.2 Integration Repo Primitives Usage

| Primitive | Usage |
|-----------|-------|
| aws/credentials | Credential chain for AWS authentication |
| aws/signing | SigV4 signing for CloudWatch Logs requests (service = "logs") |
| shared/resilience | Retry, circuit breaker, rate limiting |
| shared/observability | Tracing, metrics, logging |
| shared/errors | CloudWatchLogsError derives from IntegrationError |
| shared/config | Config validation framework |
| integrations-logging | Shared logging abstractions |
| integrations-tracing | Shared tracing abstractions |

### 8.3 Testing Requirements

| Test Category | Coverage Target | Status |
|--------------|-----------------|--------|
| Unit Tests | >90% | ✅ |
| Integration Tests | All operations | ✅ |
| Mock Coverage | All external calls | ✅ |
| Error Scenarios | All error types | ✅ |
| Edge Cases | As per refinement doc | ✅ |
| E2E Tests | Gated by env var | ✅ |

### 8.4 Thin Adapter Compliance

| Requirement | Implementation |
|-------------|----------------|
| No log storage | ✅ Delegates to CloudWatch |
| No infra provisioning | ✅ Uses existing log groups/streams |
| Uses shared credentials | ✅ aws/credentials |
| Uses shared signing | ✅ aws/signing (service = "logs") |
| Uses shared resilience | ✅ shared/resilience |
| Uses shared observability | ✅ shared/observability |
| CloudWatch-specific logic only | ✅ All operations specific to CloudWatch Logs |

---

## 9. Summary

This completion document provides a comprehensive implementation roadmap for the AWS CloudWatch Logs integration module, including:

1. **File Structure** - Complete directory layout for Rust and TypeScript implementations
2. **Implementation Order** - 10 phases from core infrastructure to E2E testing
3. **Dependencies** - Cargo.toml and package.json with all required dependencies
4. **Public API** - Complete API surface with client methods and fluent builders
5. **Test Vectors** - Request/response fixtures, error responses, structured log fixtures
6. **CI/CD** - GitHub Actions workflow
7. **Documentation** - README structure and API documentation outline
8. **Compliance** - Full CloudWatch Logs API coverage matrix

The implementation follows:
- **Thin Adapter Pattern** - CloudWatch-specific logic only, delegate to shared modules
- **London-School TDD** - Interface-first design with comprehensive mocking
- **Service Isolation** - Separate services for log events, insights, groups, streams, retention
- **Shared Primitives** - Full integration with aws/credentials, aws/signing, shared/resilience, shared/observability, integrations-logging, integrations-tracing

---

## SPARC Phases Complete

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-cloudwatch-logs.md | ✅ |
| 2. Pseudocode | pseudocode-cloudwatch-logs.md | ✅ |
| 3. Architecture | architecture-cloudwatch-logs.md | ✅ |
| 4. Refinement | refinement-cloudwatch-logs.md | ✅ |
| 5. Completion | completion-cloudwatch-logs.md | ✅ |

---

*Phase 5: Completion - Complete*

*AWS CloudWatch Logs Integration SPARC Documentation Complete*

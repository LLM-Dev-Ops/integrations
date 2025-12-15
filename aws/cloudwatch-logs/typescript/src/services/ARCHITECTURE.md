# InsightsService Architecture

## Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    InsightsService                          │
│                     (Interface)                             │
├─────────────────────────────────────────────────────────────┤
│ + startQuery(request): Promise<StartQueryResponse>         │
│ + getResults(queryId): Promise<GetQueryResultsResponse>    │
│ + stopQuery(queryId): Promise<void>                        │
│ + query(request, timeout): Promise<QueryResults>           │
│ + queryByTraceId(...): Promise<CorrelatedLogEvent[]>       │
│ + queryByRequestId(...): Promise<CorrelatedLogEvent[]>     │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ implements
                            │
┌─────────────────────────────────────────────────────────────┐
│              InsightsServiceImpl                            │
│                (Implementation)                             │
├─────────────────────────────────────────────────────────────┤
│ Private Fields:                                             │
│ - client: InsightsApiClient                                 │
│ - defaultPollInterval: 1000ms                               │
│ - maxPollInterval: 5000ms                                   │
│                                                             │
│ Public Methods:                                             │
│ - All interface methods                                     │
│                                                             │
│ Private Helper Methods:                                     │
│ - validateStartQueryRequest()                               │
│ - validateTimeRange()                                       │
│ - parseCorrelatedEvents()                                   │
│ - parseResultRow()                                          │
│ - escapeQueryString()                                       │
│ - sleep()                                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ uses
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               InsightsApiClient                             │
│                  (Interface)                                │
├─────────────────────────────────────────────────────────────┤
│ + startQuery(request): Promise<StartQueryResponse>         │
│ + getQueryResults(request): Promise<...Response>           │
│ + stopQuery(request): Promise<void>                        │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ implemented by
                            │
┌─────────────────────────────────────────────────────────────┐
│          CloudWatchLogsHttpClient                           │
│            (HTTP Implementation)                            │
├─────────────────────────────────────────────────────────────┤
│ - AWS SigV4 Request Signing                                 │
│ - JSON-RPC API Calls                                        │
│ - Error Mapping                                             │
│ - Retry Logic                                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Simple Query Flow

```
User Code
   │
   ▼
startQuery(request)
   │
   ├─► validateStartQueryRequest()
   │
   ├─► client.startQuery()
   │      │
   │      ├─► Sign Request (SigV4)
   │      ├─► HTTP POST with X-Amz-Target: Logs_20140328.StartQuery
   │      └─► Parse Response
   │
   └─► Return { queryId }
```

### 2. Poll-Based Query Flow

```
User Code
   │
   ▼
query(request, timeout)
   │
   ├─► startQuery(request)
   │      └─► Get queryId
   │
   ├─► Polling Loop:
   │   │
   │   ├─► getResults(queryId)
   │   │      │
   │   │      ├─► client.getQueryResults()
   │   │      └─► Check status
   │   │
   │   ├─► Status = Complete? → Return results
   │   ├─► Status = Failed/Cancelled/Timeout? → Throw error
   │   ├─► Timeout exceeded? → stopQuery() → Throw timeout
   │   │
   │   └─► sleep(pollInterval)
   │          └─► Exponential backoff (1s → 5s)
   │
   └─► Return QueryResults
```

### 3. Correlation Query Flow

```
User Code
   │
   ▼
queryByTraceId(logGroups, traceId, timeRange)
   │
   ├─► Validate inputs
   │
   ├─► Build query string:
   │   "fields @timestamp, @message, @logStream |
   │    filter trace_id = \"${traceId}\" |
   │    sort @timestamp asc"
   │
   ├─► query(request, 60000)
   │      └─► (Standard polling flow)
   │
   ├─► parseCorrelatedEvents(results)
   │   │
   │   └─► For each row:
   │       │
   │       ├─► Convert [{field, value}] to Map
   │       │
   │       ├─► Extract @timestamp, @message, @logStream
   │       │
   │       ├─► Try parse message as JSON
   │       │
   │       ├─► Extract correlation IDs:
   │       │   ├─► From direct fields (trace_id, request_id, etc.)
   │       │   └─► From parsed JSON (trace_id, traceId, etc.)
   │       │
   │       └─► Build CorrelatedLogEvent
   │
   └─► Return CorrelatedLogEvent[]
```

## Type Dependencies

```
insights.ts
   │
   ├─► ../types/requests.js
   │   ├─► StartQueryRequest
   │   ├─► GetQueryResultsRequest
   │   └─► StopQueryRequest
   │
   ├─► ../types/responses.js
   │   ├─► StartQueryResponse
   │   └─► GetQueryResultsResponse
   │
   ├─► ../types/query.js
   │   ├─► QueryResults
   │   ├─► QueryStatus
   │   ├─► QueryResultRow
   │   └─► ResultField
   │
   ├─► ../types/structured.js
   │   ├─► TimeRange
   │   ├─► CorrelatedLogEvent
   │   └─► LogLevel
   │
   └─► ../error/index.js
       ├─► CloudWatchLogsError
       ├─► timeoutError()
       └─► validationError()
```

## Query Result Parsing

### Input Format (from CloudWatch Logs API)

```json
{
  "status": "Complete",
  "results": [
    [
      { "field": "@timestamp", "value": "2024-01-15 10:30:00.000" },
      { "field": "@message", "value": "{\"level\":\"info\",\"trace_id\":\"abc-123\"}" },
      { "field": "@logStream", "value": "2024/01/15/[$LATEST]xyz" }
    ]
  ],
  "statistics": {
    "recordsMatched": 1,
    "recordsScanned": 1000,
    "bytesScanned": 50000
  }
}
```

### Parsing Steps

```
Raw Row (QueryResultRow)
   │
   ├─► Convert to Map<field, value>
   │
   ├─► Extract required fields
   │   ├─► @timestamp → Date
   │   ├─► @message → string
   │   └─► @logStream → string
   │
   ├─► Try parse @message as JSON
   │   ├─► Success: Extract fields
   │   └─► Fail: Use as plain text
   │
   ├─► Extract correlation IDs
   │   ├─► Check direct fields (trace_id, traceId)
   │   └─► Check parsed JSON fields
   │
   └─► Build CorrelatedLogEvent
       {
         timestamp: Date,
         message: string,
         logGroup: string,
         logStream: string,
         traceId?: string,
         requestId?: string,
         spanId?: string,
         service?: string,
         level?: LogLevel,
         fields: {...}
       }
```

## Error Handling Strategy

```
Method Call
   │
   ├─► Input Validation
   │   └─► Invalid? → throw validationError()
   │
   ├─► API Call (via client)
   │   └─► Error? → Propagate CloudWatchLogsError
   │
   ├─► Result Parsing
   │   └─► Malformed? → Skip row (graceful degradation)
   │
   └─► Timeout Check
       └─► Exceeded? → stopQuery() → throw timeoutError()
```

## Polling Strategy

```
Start: interval = 1000ms

Loop:
   1. Check elapsed time
   2. If timeout → stop query → throw
   3. Get results
   4. Check status:
      - Complete → return
      - Failed/Cancelled/Timeout/Unknown → throw
      - Scheduled/Running → continue
   5. Sleep(min(interval, remaining time))
   6. interval = min(interval * 1.5, 5000ms)
   7. Repeat
```

## Concurrency Model

- **Thread-safe**: No shared mutable state
- **Stateless**: Each method call is independent
- **Reentrant**: Can be called concurrently
- **No locking**: Purely async/await based

## Memory Model

- **Streaming**: Results parsed as received
- **No buffering**: No internal result cache
- **GC-friendly**: Short-lived allocations only
- **Bounded**: Poll interval limits memory growth

## Extension Points

Future implementations could extend:

1. **Custom Polling Strategy**
   ```typescript
   interface PollingStrategy {
     getNextInterval(attempt: number): number;
     shouldRetry(status: QueryStatus): boolean;
   }
   ```

2. **Result Streaming**
   ```typescript
   async *streamResults(queryId: string): AsyncIterator<QueryResultRow>
   ```

3. **Field Extractors**
   ```typescript
   interface FieldExtractor {
     extract(row: QueryResultRow): Record<string, unknown>;
   }
   ```

4. **Query Templates**
   ```typescript
   interface QueryTemplate {
     build(params: Record<string, string>): string;
   }
   ```

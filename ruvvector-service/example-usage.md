# RuvVector Service - Example Usage

## Quick Start

1. Start the service:
```bash
./start.sh
```

2. Test the health endpoint:
```bash
curl http://localhost:3100/health
```

## Example API Calls

### 1. Ingest a Single Event

```bash
curl -X POST http://localhost:3100/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "req-123",
    "integration": "github",
    "provider": "github-api",
    "eventType": "api.request",
    "timestamp": 1703097600000,
    "metadata": {
      "method": "GET",
      "endpoint": "/repos/user/repo",
      "status": "started"
    },
    "traceId": "trace-abc-123",
    "spanId": "span-xyz-789"
  }'
```

### 2. Ingest Multiple Events (Batch)

```bash
curl -X POST http://localhost:3100/ingest \
  -H "Content-Type: application/json" \
  -d '[
    {
      "correlationId": "req-456",
      "integration": "stripe",
      "eventType": "payment.initiated",
      "timestamp": 1703097600000,
      "metadata": {
        "amount": 1000,
        "currency": "usd"
      }
    },
    {
      "correlationId": "req-456",
      "integration": "stripe",
      "eventType": "payment.completed",
      "timestamp": 1703097602000,
      "metadata": {
        "amount": 1000,
        "currency": "usd",
        "status": "success"
      }
    }
  ]'
```

### 3. Query Events by Integration

```bash
curl "http://localhost:3100/query?integration=github&limit=10"
```

### 4. Query Events by Correlation ID

```bash
curl "http://localhost:3100/query?correlationId=req-123"
```

### 5. Query Events with Time Range

```bash
# Get events from the last hour
FROM=$(date -d '1 hour ago' +%s)000
TO=$(date +%s)000

curl "http://localhost:3100/query?from=$FROM&to=$TO&limit=50"
```

### 6. Query with Multiple Filters

```bash
curl "http://localhost:3100/query?integration=github&eventType=api.request&limit=20&offset=0"
```

### 7. Pagination Example

```bash
# First page
curl "http://localhost:3100/query?integration=stripe&limit=10&offset=0"

# Second page
curl "http://localhost:3100/query?integration=stripe&limit=10&offset=10"

# Third page
curl "http://localhost:3100/query?integration=stripe&limit=10&offset=20"
```

## Using with Node.js

```javascript
// ingest-event.js
async function ingestEvent(event) {
  const response = await fetch('http://localhost:3100/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  return response.json();
}

// Example usage
const event = {
  correlationId: 'user-action-789',
  integration: 'github',
  eventType: 'webhook.received',
  timestamp: Date.now(),
  metadata: {
    event: 'push',
    repository: 'user/repo'
  }
};

ingestEvent(event).then(console.log);
```

```javascript
// query-events.js
async function queryEvents(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`http://localhost:3100/query?${query}`);
  return response.json();
}

// Example usage
queryEvents({
  integration: 'github',
  correlationId: 'user-action-789',
  limit: 10
}).then(result => {
  console.log(`Found ${result.data.length} events`);
  result.data.forEach(event => {
    console.log(`${event.eventType} at ${new Date(event.timestamp)}`);
  });
});
```

## Monitoring and Debugging

### Check Service Health

```bash
# Simple health check
curl http://localhost:3100/health | jq

# Watch health status (every 5 seconds)
watch -n 5 'curl -s http://localhost:3100/health | jq'
```

### View Recent Events

```bash
# Get latest 20 events
curl "http://localhost:3100/query?limit=20" | jq '.data[] | {eventType, timestamp, integration}'
```

### Trace a Request Flow

```bash
# Get all events for a specific correlation ID
CORRELATION_ID="req-123"
curl "http://localhost:3100/query?correlationId=$CORRELATION_ID" | jq '.data | sort_by(.timestamp) | .[] | {eventType, timestamp}'
```

## Integration Patterns

### 1. Request/Response Tracking

```bash
# Track a complete request flow
CORRELATION_ID=$(uuidgen)
TIMESTAMP=$(date +%s)000

# Request started
curl -X POST http://localhost:3100/ingest -H "Content-Type: application/json" -d "{
  \"correlationId\": \"$CORRELATION_ID\",
  \"integration\": \"api\",
  \"eventType\": \"request.started\",
  \"timestamp\": $TIMESTAMP
}"

# Request completed
curl -X POST http://localhost:3100/ingest -H "Content-Type: application/json" -d "{
  \"correlationId\": \"$CORRELATION_ID\",
  \"integration\": \"api\",
  \"eventType\": \"request.completed\",
  \"timestamp\": $((TIMESTAMP + 150)),
  \"metadata\": {\"duration_ms\": 150}
}"

# Query the flow
curl "http://localhost:3100/query?correlationId=$CORRELATION_ID"
```

### 2. Multi-Service Trace

```bash
# Service A starts
curl -X POST http://localhost:3100/ingest -H "Content-Type: application/json" -d '{
  "correlationId": "trace-xyz",
  "integration": "service-a",
  "eventType": "processing.started",
  "timestamp": 1703097600000,
  "traceId": "trace-001",
  "spanId": "span-a"
}'

# Service B processing
curl -X POST http://localhost:3100/ingest -H "Content-Type: application/json" -d '{
  "correlationId": "trace-xyz",
  "integration": "service-b",
  "eventType": "processing.started",
  "timestamp": 1703097600500,
  "traceId": "trace-001",
  "spanId": "span-b"
}'

# Service B complete
curl -X POST http://localhost:3100/ingest -H "Content-Type: application/json" -d '{
  "correlationId": "trace-xyz",
  "integration": "service-b",
  "eventType": "processing.completed",
  "timestamp": 1703097601000,
  "traceId": "trace-001",
  "spanId": "span-b"
}'

# Service A complete
curl -X POST http://localhost:3100/ingest -H "Content-Type: application/json" -d '{
  "correlationId": "trace-xyz",
  "integration": "service-a",
  "eventType": "processing.completed",
  "timestamp": 1703097601200,
  "traceId": "trace-001",
  "spanId": "span-a"
}'

# View the complete trace
curl "http://localhost:3100/query?correlationId=trace-xyz" | jq
```

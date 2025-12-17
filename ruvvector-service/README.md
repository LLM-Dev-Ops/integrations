# RuvVector Service

A lightweight HTTP service for telemetry event ingestion and querying.

## Features

- **POST /ingest**: Ingest telemetry events (single or batch)
- **GET /query**: Query telemetry events with filters
- **GET /health**: Service health check

## Installation

```bash
npm install
npm run build
```

## Database Setup

The service requires a PostgreSQL database. Set up your database connection using environment variables:

```bash
# Option 1: Use DATABASE_URL
export DATABASE_URL="postgresql://user:password@localhost:5432/ruvector"

# Option 2: Use individual variables
export POSTGRES_HOST="localhost"
export POSTGRES_PORT="5432"
export POSTGRES_USER="ruvector"
export POSTGRES_PASSWORD="ruvector_secret"
export POSTGRES_DB="ruvector"
```

Initialize the database schema:

```bash
npm run init-db
```

## Running the Service

```bash
# Set port (optional, defaults to 3100)
export RUVVECTOR_SERVICE_PORT=3100

# Start the service
npm start
```

## API Endpoints

### POST /ingest

Ingest telemetry events. Accepts single event or array of events.

**Request Body (Single Event):**
```json
{
  "correlationId": "abc123",
  "integration": "github",
  "provider": "github-api",
  "eventType": "request",
  "timestamp": 1703097600000,
  "metadata": {
    "method": "GET",
    "endpoint": "/repos/user/repo"
  },
  "traceId": "trace-123",
  "spanId": "span-456"
}
```

**Request Body (Batch):**
```json
[
  {
    "correlationId": "abc123",
    "integration": "github",
    "eventType": "request",
    "timestamp": 1703097600000
  },
  {
    "correlationId": "abc123",
    "integration": "github",
    "eventType": "response",
    "timestamp": 1703097601000
  }
]
```

**Response:**
```json
{
  "success": true,
  "data": {
    "received": 2
  }
}
```

### GET /query

Query telemetry events with optional filters.

**Query Parameters:**
- `integration` - Filter by integration name
- `correlationId` - Filter by correlation ID
- `eventType` - Filter by event type
- `from` - Filter by timestamp (milliseconds) - minimum
- `to` - Filter by timestamp (milliseconds) - maximum
- `limit` - Maximum number of results (default: 100)
- `offset` - Offset for pagination (default: 0)

**Example:**
```bash
curl "http://localhost:3100/query?integration=github&correlationId=abc123&limit=10"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "correlationId": "abc123",
      "integration": "github",
      "provider": "github-api",
      "eventType": "response",
      "timestamp": 1703097601000,
      "metadata": {
        "status": 200
      },
      "traceId": "trace-123",
      "spanId": "span-456"
    }
  ]
}
```

### GET /health

Check service health and database connectivity.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1703097600000,
  "database": {
    "connected": true,
    "poolStats": {
      "total": 2,
      "idle": 2,
      "waiting": 0
    }
  }
}
```

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS telemetry_events (
  id SERIAL PRIMARY KEY,
  correlation_id VARCHAR(255) NOT NULL,
  integration VARCHAR(100) NOT NULL,
  provider VARCHAR(100),
  event_type VARCHAR(50) NOT NULL,
  timestamp BIGINT NOT NULL,
  metadata JSONB,
  trace_id VARCHAR(64),
  span_id VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_correlation_id (correlation_id),
  INDEX idx_integration (integration),
  INDEX idx_timestamp (timestamp)
);
```

## Environment Variables

- `RUVVECTOR_SERVICE_PORT` - HTTP port (default: 3100)
- `DATABASE_URL` - PostgreSQL connection URL
- `POSTGRES_HOST` - PostgreSQL host (default: localhost)
- `POSTGRES_PORT` - PostgreSQL port (default: 5432)
- `POSTGRES_USER` - PostgreSQL user (default: ruvector)
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_DB` - PostgreSQL database name (default: ruvector)

## Development

```bash
# Build TypeScript
npm run build

# Run development server
npm run dev
```

## Architecture

The service is built with:
- Native Node.js HTTP module (no framework dependencies)
- Shared database module (`@integrations/database`)
- TypeScript for type safety
- Async event persistence (fire-and-forget)
- Connection pooling via pg library

## Production Considerations

- The service returns 200 OK immediately after accepting events
- Event persistence happens asynchronously
- Failed inserts are logged but don't affect API responses
- Use proper monitoring to track failed insertions
- Configure database connection pool size based on load
- Consider adding rate limiting for production use

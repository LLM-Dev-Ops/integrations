# PostgreSQL Query Operations

This directory contains the query execution and transaction management layer for the PostgreSQL integration.

## Files

### query.ts
Production-grade query execution layer with comprehensive features:

- **QueryExecutor class**: High-level query execution with connection pooling, routing, and observability
- **PreparedStatement class**: Optimized repeated query execution
- **Type-safe interfaces**: Full TypeScript support with generic row types
- **Error handling**: Comprehensive PostgreSQL error mapping and handling
- **Observability**: Built-in metrics, tracing, and logging

### Key Features

#### 1. Multiple Execution Methods

- `execute<T>()` - Full result set with metadata
- `executeOne<T>()` - Single row or null
- `executeOneRequired<T>()` - Single row (throws if not found)
- `executeMany<T>()` - Convenience method for row arrays
- `stream<T>()` - Async iterator for large result sets
- `prepare()` - Create prepared statements

#### 2. Query Options

- **Timeout**: Set per-query timeouts in milliseconds
- **Target Routing**: Route to primary, replica, or any connection
- **Row Mode**: Object or array mode (future support)

#### 3. Prepared Statements

Optimize frequently executed queries:
```typescript
const stmt = await executor.prepare('get_user', 'SELECT * FROM users WHERE id = $1');
const user = await stmt.execute<User>([123]);
await stmt.deallocate();
```

#### 4. Error Handling

Comprehensive error types:
- `NoRowsError` - No rows returned when required
- `TooManyRowsError` - Multiple rows when one expected
- `QueryTimeoutError` - Query exceeded timeout
- `ExecutionError` - General execution errors
- Plus all PostgreSQL-specific errors (constraints, syntax, etc.)

#### 5. Observability

All queries are automatically instrumented with:
- **Metrics**: Query count, duration, rows affected/returned, errors
- **Tracing**: Distributed traces with query context
- **Logging**: Debug-level query execution logs

#### 6. Security

- Parameterized queries prevent SQL injection
- Query text redaction in logs (truncated to 200 chars)
- Password and sensitive data redaction via observability layer

## Type Definitions

### QueryParam
Union type for safe query parameters:
```typescript
type QueryParam = string | number | boolean | Date | Buffer | null | undefined | Record<string, unknown> | QueryParam[];
```

### QueryResult<T>
Result structure with metadata:
```typescript
interface QueryResult<T> {
  rows: T[];              // Result rows
  rowCount: number;       // Number of rows
  fields: FieldInfo[];    // Column metadata
  command: string;        // SQL command (SELECT, INSERT, etc.)
  duration: number;       // Execution time in ms
}
```

### FieldInfo
Column metadata:
```typescript
interface FieldInfo {
  name: string;           // Column name
  dataTypeId: number;     // PostgreSQL OID
  dataTypeName: string;   // Human-readable type
}
```

### QueryOptions
Execution options:
```typescript
interface QueryOptions {
  timeout?: number;         // Query timeout (ms)
  target?: QueryTarget;     // 'primary' | 'replica' | 'any'
  rowMode?: RowMode;        // 'object' | 'array'
}
```

## Usage Examples

See [example-usage.md](./example-usage.md) for comprehensive examples.

### Basic Query Execution

```typescript
import { QueryExecutor } from './query.js';

// Assuming executor is set up
const users = await executor.executeMany<User>(
  'SELECT * FROM users WHERE active = $1',
  [true]
);
```

### Single Row Fetch

```typescript
const user = await executor.executeOneRequired<User>(
  'SELECT * FROM users WHERE id = $1',
  [123]
);
```

### Streaming Large Results

```typescript
for await (const user of executor.stream<User>('SELECT * FROM users')) {
  console.log(user.name);
}
```

## Implementation Details

### PostgreSQL Type OID Mapping

The executor includes mapping for common PostgreSQL types:
- 16: bool
- 20: int8 (bigint)
- 21: int2 (smallint)
- 23: int4 (integer)
- 25: text
- 700: float4
- 701: float8
- 1043: varchar
- 1082: date
- 1114: timestamp
- 1184: timestamptz
- 2950: uuid
- 3802: jsonb

### Query Timeout Implementation

Timeouts are implemented using PostgreSQL's `statement_timeout`:
```sql
SET LOCAL statement_timeout = <timeout_ms>;
```

This ensures the timeout is enforced at the database level and automatically reset after the query.

### Error Parsing

All errors from the pg driver are parsed and mapped to appropriate error classes using the `parsePostgresError` function from the errors module. This provides:
- Consistent error types across the codebase
- Retryability information
- Detailed error context (table, column, constraint names)

### Observability Integration

The executor integrates with the observability system:

**Metrics Recorded:**
- `pg_queries_total` - Counter with command tag
- `pg_query_duration_seconds` - Histogram/timing
- `pg_rows_returned_total` - Counter for SELECT
- `pg_rows_affected_total` - Counter for DML
- `pg_errors_total` - Counter with error type

**Trace Spans:**
- Span name: `pg.query.execute`
- Attributes: query (redacted), param_count, target, duration_ms, row_count, command

**Logging:**
- Debug level for successful queries
- Error level for failed queries
- Query text is redacted/truncated for security

## Dependencies

- `pg` - PostgreSQL driver
- `../errors` - Error types and parsing
- `../observability` - Metrics, logging, tracing

## Architecture

The QueryExecutor uses dependency injection for connection management:

```typescript
new QueryExecutor(
  getConnection: (target) => Promise<PoolClient>,
  releaseConnection: (client) => void,
  observability: Observability
)
```

This allows:
- Decoupling from pool implementation
- Easy testing with mock connections
- Flexible routing strategies
- Centralized observability

## Testing

When testing, use the in-memory observability:

```typescript
import { createInMemoryObservability } from '../observability/index.js';

const observability = createInMemoryObservability();
const executor = new QueryExecutor(
  mockGetConnection,
  mockReleaseConnection,
  observability
);

// After test
const logs = observability.logger.getEntries();
const metrics = observability.metrics.getEntries();
const spans = observability.tracer.getSpans();
```

## Future Enhancements

1. **Cursor Support**: Server-side cursors for large result streaming
2. **Query Result Caching**: Optional query result caching
3. **Batch Execution**: Execute multiple queries in a single round-trip
4. **Query Builder Integration**: Type-safe query builder support
5. **Row Mode**: Support array mode for row results
6. **Query Plan Analysis**: EXPLAIN query integration for performance analysis

## SPARC Compliance

This implementation follows the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology:

- ✅ **Specification**: Based on specification-postgresql.md
- ✅ **Pseudocode**: Aligned with pseudocode-postgresql.md
- ✅ **Architecture**: Follows architecture-postgresql.md patterns
- ✅ **Refinement**: Production-ready error handling and observability
- ✅ **Completion**: Full TypeScript implementation with comprehensive JSDoc

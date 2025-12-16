# PostgreSQL Query Executor - Usage Examples

This document demonstrates how to use the PostgreSQL Query Executor implementation.

## Basic Setup

```typescript
import { QueryExecutor } from './query.js';
import { createInMemoryObservability } from '../observability/index.js';
import { Pool } from 'pg';

// Create a connection pool (this is typically done by the ConnectionPool class)
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword',
});

// Create observability container
const observability = createInMemoryObservability();

// Create query executor
const executor = new QueryExecutor(
  // getConnection function
  async (target) => {
    const client = await pool.connect();
    return client;
  },
  // releaseConnection function
  (client) => {
    client.release();
  },
  observability
);
```

## Query Execution Methods

### 1. execute() - Full Result Set

Execute a query and get all results with metadata:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

const result = await executor.execute<User>(
  'SELECT * FROM users WHERE age > $1',
  [18]
);

console.log(`Found ${result.rowCount} users`);
console.log(`Query took ${result.duration}ms`);
console.log(`Command: ${result.command}`);
console.log(`Fields: ${result.fields.map(f => f.name).join(', ')}`);

result.rows.forEach(user => {
  console.log(`${user.name} (${user.email})`);
});
```

### 2. executeOne() - Single Row or Null

Fetch a single row, or null if not found:

```typescript
const user = await executor.executeOne<User>(
  'SELECT * FROM users WHERE id = $1',
  [123]
);

if (user) {
  console.log(`Found user: ${user.name}`);
} else {
  console.log('User not found');
}

// Throws TooManyRowsError if more than one row is returned
```

### 3. executeOneRequired() - Single Row (Required)

Fetch a single row, throw NoRowsError if not found:

```typescript
try {
  const user = await executor.executeOneRequired<User>(
    'SELECT * FROM users WHERE id = $1',
    [123]
  );
  console.log(`User: ${user.name}`); // Guaranteed to exist
} catch (error) {
  if (error instanceof NoRowsError) {
    console.error('User not found');
  }
}
```

### 4. executeMany() - Array of Rows

Convenience method to get just the rows array:

```typescript
const users = await executor.executeMany<User>(
  'SELECT * FROM users WHERE active = $1',
  [true]
);

users.forEach(user => {
  console.log(user.name);
});
```

### 5. stream() - Streaming Results

Stream large result sets without loading all rows into memory:

```typescript
for await (const user of executor.stream<User>('SELECT * FROM users')) {
  console.log(user.name);
  // Process one row at a time
}
```

## Query Options

### Timeout

Set a query timeout in milliseconds:

```typescript
const result = await executor.execute(
  'SELECT * FROM large_table',
  [],
  { timeout: 5000 } // 5 second timeout
);
```

### Target Routing

Route queries to specific connection types:

```typescript
// Route to primary for writes
const writeResult = await executor.execute(
  'INSERT INTO users (name, email) VALUES ($1, $2)',
  ['Alice', 'alice@example.com'],
  { target: 'primary' }
);

// Route to replica for reads
const readResult = await executor.execute(
  'SELECT * FROM users',
  [],
  { target: 'replica' }
);

// Allow any connection
const anyResult = await executor.execute(
  'SELECT COUNT(*) FROM users',
  [],
  { target: 'any' }
);
```

## Prepared Statements

For queries executed repeatedly, use prepared statements for better performance:

```typescript
// Create and prepare the statement
const stmt = await executor.prepare(
  'get_user_by_id',
  'SELECT * FROM users WHERE id = $1',
  [23] // int4 OID (optional type hints)
);

// Execute multiple times with different parameters
const user1 = await stmt.execute<User>([1]);
const user2 = await stmt.execute<User>([2]);
const user3 = await stmt.execute<User>([3]);

// Clean up when done
await stmt.deallocate();
```

## Error Handling

The query executor provides comprehensive error handling:

```typescript
import {
  NoRowsError,
  TooManyRowsError,
  QueryTimeoutError,
  ExecutionError,
  UniqueViolationError,
  ForeignKeyViolationError,
} from '../errors/index.js';

try {
  const result = await executor.execute(
    'INSERT INTO users (email) VALUES ($1)',
    ['duplicate@example.com']
  );
} catch (error) {
  if (error instanceof UniqueViolationError) {
    console.error('Email already exists');
  } else if (error instanceof ForeignKeyViolationError) {
    console.error('Foreign key constraint violated');
  } else if (error instanceof QueryTimeoutError) {
    console.error('Query timed out');
  } else if (error instanceof ExecutionError) {
    console.error('Query execution failed:', error.message);
  }
}
```

## Observability

All query executions are automatically instrumented:

### Metrics

- `pg_queries_total` - Total number of queries executed
- `pg_query_duration_seconds` - Query execution time
- `pg_rows_returned_total` - Rows returned from SELECT queries
- `pg_rows_affected_total` - Rows affected by INSERT/UPDATE/DELETE
- `pg_errors_total` - Total errors

### Tracing

Each query creates a span with:
- Query text (redacted/truncated for security)
- Parameter count
- Target (primary/replica/any)
- Duration
- Row count
- Command type

### Logging

Query execution is logged at debug level with:
- Query text (redacted)
- Parameter count
- Target routing
- Duration
- Row count
- Error details (if failed)

## Type Safety

The query executor is fully type-safe:

```typescript
interface Product {
  id: number;
  name: string;
  price: number;
  inStock: boolean;
}

// TypeScript knows the return type
const products = await executor.executeMany<Product>(
  'SELECT * FROM products WHERE price < $1',
  [100]
);

// products is Product[]
products.forEach(product => {
  console.log(`${product.name}: $${product.price}`);
  // TypeScript autocomplete works here
});
```

## Security Features

### SQL Injection Prevention

All parameters are safely escaped using PostgreSQL's parameterized queries:

```typescript
// SAFE - parameters are escaped
const username = "'; DROP TABLE users; --";
const user = await executor.executeOne(
  'SELECT * FROM users WHERE username = $1',
  [username]
);
```

### Query Redaction

Long queries are truncated in logs to prevent sensitive data exposure:

```typescript
// Queries > 200 characters are truncated with "..." in logs
const longQuery = 'SELECT * FROM users WHERE ...';
```

### Parameter Redaction

Sensitive parameters are not logged by default. The observability layer can be configured to redact specific keys.

## Performance Tips

1. **Use Prepared Statements** for frequently executed queries
2. **Use streaming** for large result sets
3. **Route reads to replicas** to distribute load
4. **Set appropriate timeouts** to prevent long-running queries
5. **Monitor metrics** to identify slow queries

## Complete Example

```typescript
import { QueryExecutor } from './operations/query.js';
import { createConsoleObservability } from './observability/index.js';
import { LogLevel } from './observability/index.js';
import { Pool } from 'pg';

async function main() {
  // Setup
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    user: 'appuser',
    password: process.env.DB_PASSWORD,
  });

  const observability = createConsoleObservability(LogLevel.DEBUG);

  const executor = new QueryExecutor(
    async (target) => await pool.connect(),
    (client) => client.release(),
    observability
  );

  try {
    // Insert a user
    const insertResult = await executor.execute(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
      ['Alice', 'alice@example.com'],
      { target: 'primary' }
    );
    console.log(`Created user with ID: ${insertResult.rows[0].id}`);

    // Fetch the user
    const user = await executor.executeOneRequired<{ id: number; name: string; email: string }>(
      'SELECT * FROM users WHERE id = $1',
      [insertResult.rows[0].id],
      { target: 'replica' }
    );
    console.log(`User: ${user.name} (${user.email})`);

    // Stream all users
    console.log('All users:');
    for await (const u of executor.stream('SELECT * FROM users')) {
      console.log(`- ${u.name}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
```

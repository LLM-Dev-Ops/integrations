# AWS DynamoDB Integration

A type-safe, resilient TypeScript integration for AWS DynamoDB following SPARC architecture principles.

## Installation

```bash
npm install @integrations/aws-dynamodb
```

## Features

- **Type-Safe Operations**: Full TypeScript support with comprehensive type definitions
- **CRUD Operations**: Get, Put, Update, Delete operations with builder patterns
- **Query & Scan**: Powerful query and scan capabilities with filtering
- **Batch Operations**: Efficient batch read and write operations
- **Transactions**: ACID transaction support for multi-item operations
- **Resilience**: Built-in retry logic, circuit breakers, and error handling
- **Observability**: Comprehensive logging, metrics, and tracing
- **AWS SDK v3**: Built on the latest AWS SDK for JavaScript v3

## Directory Structure

```
src/
├── client/          # DynamoDB client initialization and configuration
├── config/          # Configuration interfaces and utilities
├── error/           # Error classes and error handling
├── types/           # Type definitions for DynamoDB operations
├── operations/      # Core CRUD operations (get, put, update, delete, query, scan)
├── batch/           # Batch read/write operations
├── transaction/     # Transaction support
├── builders/        # Fluent builders for queries and operations
├── observability/   # Logging, metrics, and tracing
└── resilience/      # Retry logic and circuit breakers
```

## Usage

```typescript
import { DynamoDBClient } from '@integrations/aws-dynamodb';

// Initialize client
const client = new DynamoDBClient({
  region: 'us-east-1',
  // Additional configuration options
});

// Example operations will be available after implementation
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Clean build artifacts
npm run clean
```

## Configuration

The integration supports various configuration options:

- **AWS Credentials**: Configure via environment variables, IAM roles, or credential providers
- **Region**: Specify AWS region for DynamoDB operations
- **Retry Configuration**: Customize retry behavior and timeouts
- **Observability**: Enable logging, metrics, and tracing

## License

MIT

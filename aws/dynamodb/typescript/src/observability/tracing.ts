/**
 * Tracing utilities for DynamoDB operations
 */

export interface DynamoDBSpan {
  id: string;
  operation: string;
  tableName: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error';
  attributes: Record<string, any>;
  error?: Error;
}

export interface Tracer {
  startSpan(operation: string, tableName: string, attributes?: Record<string, any>): DynamoDBSpan;
  finishSpan(span: DynamoDBSpan): void;
  finishSpanWithError(span: DynamoDBSpan, error: Error): void;
}

/**
 * Default tracer implementation that logs spans
 */
export class DefaultTracer implements Tracer {
  private serviceName: string;

  constructor(serviceName: string = 'dynamodb') {
    this.serviceName = serviceName;
  }

  startSpan(operation: string, tableName: string, attributes?: Record<string, any>): DynamoDBSpan {
    const span: DynamoDBSpan = {
      id: generateSpanId(),
      operation,
      tableName,
      startTime: Date.now(),
      status: 'ok',
      attributes: {
        'service.name': this.serviceName,
        ...attributes,
      },
    };

    console.debug(
      `[TRACE] DynamoDB span started: ${operation} on ${tableName} (${span.id})`
    );

    return span;
  }

  finishSpan(span: DynamoDBSpan): void {
    const endTime = Date.now();
    const duration = endTime - span.startTime;
    span.endTime = endTime;
    span.status = 'ok';

    console.debug(
      `[TRACE] DynamoDB span completed: ${span.operation} on ${span.tableName} (${span.id}) - ${duration}ms`
    );
  }

  finishSpanWithError(span: DynamoDBSpan, error: Error): void {
    const endTime = Date.now();
    const duration = endTime - span.startTime;
    span.endTime = endTime;
    span.status = 'error';
    span.error = error;

    console.debug(
      `[TRACE] DynamoDB span failed: ${span.operation} on ${span.tableName} (${span.id}) - ${duration}ms - ${error.message}`
    );
  }
}

/**
 * No-op tracer implementation for testing
 */
export class NoopTracer implements Tracer {
  startSpan(operation: string, tableName: string, attributes?: Record<string, any>): DynamoDBSpan {
    return {
      id: generateSpanId(),
      operation,
      tableName,
      startTime: Date.now(),
      status: 'ok',
      attributes: attributes || {},
    };
  }

  finishSpan(_span: DynamoDBSpan): void {
    // No-op
  }

  finishSpanWithError(_span: DynamoDBSpan, _error: Error): void {
    // No-op
  }
}

/**
 * Helper to create span with DynamoDB attributes
 */
export function createDynamoDBSpan(
  operation: string,
  tableName: string,
  attributes?: {
    pk?: string;
    sk?: string;
    indexName?: string;
    consistentRead?: boolean;
    itemCount?: number;
  }
): DynamoDBSpan {
  return {
    id: generateSpanId(),
    operation,
    tableName,
    startTime: Date.now(),
    status: 'ok',
    attributes: {
      ...attributes,
    },
  };
}

/**
 * Generates a unique span ID
 */
function generateSpanId(): string {
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

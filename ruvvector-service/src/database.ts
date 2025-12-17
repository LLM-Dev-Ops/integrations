/**
 * Database operations for telemetry events
 */

import { getDatabase, RuvectorDatabase } from '@integrations/database';
import { TelemetryEvent, QueryParams } from './types.js';

let db: RuvectorDatabase;

/**
 * Initialize database connection and ensure table exists
 */
export async function initDatabase(): Promise<void> {
  db = getDatabase();

  // Create telemetry_events table if it doesn't exist
  const createTableQuery = `
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_correlation_id ON telemetry_events (correlation_id);
    CREATE INDEX IF NOT EXISTS idx_integration ON telemetry_events (integration);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events (timestamp);
  `;

  await db.query(createTableQuery);
  console.log('Database initialized and table created');
}

/**
 * Get database instance
 */
export function getDb(): RuvectorDatabase {
  return db;
}

/**
 * Insert a single telemetry event
 */
export async function insertEvent(event: TelemetryEvent): Promise<void> {
  const query = `
    INSERT INTO telemetry_events
      (correlation_id, integration, provider, event_type, timestamp, metadata, trace_id, span_id)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  await db.query(query, [
    event.correlationId,
    event.integration,
    event.provider || null,
    event.eventType,
    event.timestamp,
    event.metadata ? JSON.stringify(event.metadata) : null,
    event.traceId || null,
    event.spanId || null,
  ]);
}

/**
 * Insert multiple telemetry events in a batch
 */
export async function insertEvents(events: TelemetryEvent[]): Promise<void> {
  if (events.length === 0) return;

  // Build bulk insert query
  const values: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  for (const event of events) {
    values.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`
    );
    params.push(
      event.correlationId,
      event.integration,
      event.provider || null,
      event.eventType,
      event.timestamp,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.traceId || null,
      event.spanId || null
    );
    paramIndex += 8;
  }

  const query = `
    INSERT INTO telemetry_events
      (correlation_id, integration, provider, event_type, timestamp, metadata, trace_id, span_id)
    VALUES ${values.join(', ')}
  `;

  await db.query(query, params);
}

/**
 * Query telemetry events with filters
 */
export async function queryEvents(params: QueryParams): Promise<TelemetryEvent[]> {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  if (params.integration) {
    conditions.push(`integration = $${paramIndex++}`);
    queryParams.push(params.integration);
  }

  if (params.correlationId) {
    conditions.push(`correlation_id = $${paramIndex++}`);
    queryParams.push(params.correlationId);
  }

  if (params.eventType) {
    conditions.push(`event_type = $${paramIndex++}`);
    queryParams.push(params.eventType);
  }

  if (params.from !== undefined) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    queryParams.push(params.from);
  }

  if (params.to !== undefined) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    queryParams.push(params.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 100;
  const offset = params.offset || 0;

  const query = `
    SELECT
      correlation_id as "correlationId",
      integration,
      provider,
      event_type as "eventType",
      timestamp,
      metadata,
      trace_id as "traceId",
      span_id as "spanId"
    FROM telemetry_events
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramIndex++}
    OFFSET $${paramIndex++}
  `;

  queryParams.push(limit, offset);

  const result = await db.query(query, queryParams);
  return result.rows;
}

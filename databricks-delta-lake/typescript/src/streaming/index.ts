/**
 * Databricks Delta Lake Streaming Job Builder
 *
 * Provides a fluent API for building and submitting structured streaming jobs
 * to Databricks. Supports Delta and Kafka sources/sinks with various trigger modes.
 *
 * @module @llmdevops/databricks-delta-lake-integration/streaming
 */

import type {
  StreamSource,
  StreamSink,
  TriggerMode,
  StreamingJobSpec,
  RunId,
} from '../types/index.js';

// ============================================================================
// Duration Type (milliseconds-based)
// ============================================================================

/**
 * Duration type for intervals (milliseconds-based)
 */
export interface Duration {
  /** Duration in milliseconds */
  milliseconds: number;
}

/**
 * Create a duration from seconds
 */
export function seconds(value: number): Duration {
  return { milliseconds: value * 1000 };
}

/**
 * Create a duration from minutes
 */
export function minutes(value: number): Duration {
  return { milliseconds: value * 60 * 1000 };
}

/**
 * Create a duration from hours
 */
export function hours(value: number): Duration {
  return { milliseconds: value * 60 * 60 * 1000 };
}

/**
 * Create a duration from milliseconds
 */
export function milliseconds(value: number): Duration {
  return { milliseconds: value };
}

// ============================================================================
// Transformation Types
// ============================================================================

/**
 * SQL transformation for streaming data
 */
export interface SqlTransformation {
  type: 'sql';
  /** SQL query to transform the data */
  sql: string;
}

/**
 * Transformation union type
 */
export type Transformation = SqlTransformation;

// ============================================================================
// Streaming Job Builder
// ============================================================================

/**
 * Builder for creating structured streaming jobs with a fluent API.
 *
 * @example
 * ```typescript
 * const spec = StreamingJobBuilder.fromDelta('source_table')
 *   .toDelta('target_table')
 *   .transform('SELECT *, current_timestamp() as processed_at FROM streaming_source')
 *   .triggerInterval(minutes(5))
 *   .checkpoint('/tmp/checkpoints/my_stream')
 *   .build();
 * ```
 *
 * @example
 * ```typescript
 * const spec = StreamingJobBuilder.fromKafka('broker1:9092,broker2:9092', 'my-topic')
 *   .toDelta('kafka_sink_table')
 *   .transform('SELECT CAST(value AS STRING) as data FROM streaming_source')
 *   .triggerOnce()
 *   .checkpoint('/tmp/checkpoints/kafka_stream')
 *   .build();
 * ```
 */
export class StreamingJobBuilder {
  private _source?: StreamSource;
  private _sink?: StreamSink;
  private _transformations: Transformation[] = [];
  private _trigger: TriggerMode = { type: 'processing_time', intervalMs: 10000 }; // Default: 10 seconds
  private _checkpointLocation?: string;
  private _queryName?: string;
  private _options: Record<string, string> = {};

  /**
   * Private constructor - use static factory methods
   */
  private constructor() {}

  /**
   * Create a streaming job from a Delta table source
   *
   * @param table - Full table name (catalog.schema.table)
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * StreamingJobBuilder.fromDelta('main.default.source_table')
   * ```
   */
  static fromDelta(table: string): StreamingJobBuilder {
    const builder = new StreamingJobBuilder();
    builder._source = { type: 'delta', table };
    return builder;
  }

  /**
   * Create a streaming job from a Kafka source
   *
   * @param bootstrapServers - Comma-separated list of Kafka brokers
   * @param topic - Kafka topic name
   * @param options - Additional Kafka options
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * StreamingJobBuilder.fromKafka('broker1:9092,broker2:9092', 'my-topic')
   * ```
   */
  static fromKafka(
    bootstrapServers: string,
    topic: string,
    options?: Record<string, string>
  ): StreamingJobBuilder {
    const builder = new StreamingJobBuilder();
    builder._source = {
      type: 'kafka',
      bootstrapServers,
      topic,
      options: options ?? {},
    };
    return builder;
  }

  /**
   * Set the Delta table sink for the streaming job
   *
   * @param table - Full table name (catalog.schema.table)
   * @param outputMode - Output mode: 'append', 'complete', or 'update' (default: 'append')
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.toDelta('main.default.target_table', 'append')
   * ```
   */
  toDelta(
    table: string,
    outputMode: 'append' | 'complete' | 'update' = 'append'
  ): this {
    this._sink = { type: 'delta', table, outputMode };
    return this;
  }

  /**
   * Add a SQL transformation to the streaming pipeline
   *
   * @param sql - SQL query to transform the data. Use 'streaming_source' as the source table name.
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.transform('SELECT *, current_timestamp() as processed_at FROM streaming_source')
   * ```
   */
  transform(sql: string): this {
    this._transformations.push({ type: 'sql', sql });
    return this;
  }

  /**
   * Set trigger to run at a fixed interval (ProcessingTime trigger)
   *
   * @param interval - Duration between trigger executions
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.triggerInterval(minutes(5))
   * ```
   */
  triggerInterval(interval: Duration): this {
    this._trigger = { type: 'processing_time', intervalMs: interval.milliseconds };
    return this;
  }

  /**
   * Set trigger to run once and stop (Once trigger)
   *
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.triggerOnce()
   * ```
   */
  triggerOnce(): this {
    this._trigger = { type: 'once' };
    return this;
  }

  /**
   * Set trigger to process all available data and stop (AvailableNow trigger)
   *
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.triggerAvailableNow()
   * ```
   */
  triggerAvailableNow(): this {
    this._trigger = { type: 'available_now' };
    return this;
  }

  /**
   * Set the checkpoint location for the streaming job
   *
   * @param location - Path to store checkpoint data (e.g., '/tmp/checkpoints/my_stream')
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.checkpoint('/dbfs/checkpoints/my_stream')
   * ```
   */
  checkpoint(location: string): this {
    this._checkpointLocation = location;
    return this;
  }

  /**
   * Set the query name for the streaming job (for monitoring)
   *
   * @param name - Query name
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.queryName('my_streaming_query')
   * ```
   */
  queryName(name: string): this {
    this._queryName = name;
    return this;
  }

  /**
   * Add additional options for the streaming job
   *
   * @param key - Option key
   * @param value - Option value
   * @returns Builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.option('maxFilesPerTrigger', '1000')
   * ```
   */
  option(key: string, value: string): this {
    this._options[key] = value;
    return this;
  }

  /**
   * Build the streaming job specification
   *
   * @returns Complete streaming job specification
   * @throws Error if required fields are not set
   *
   * @example
   * ```typescript
   * const spec = builder.build();
   * ```
   */
  build(): StreamingJobSpec {
    // Validate required fields
    if (!this._source) {
      throw new Error('Stream source is required. Use fromDelta() or fromKafka()');
    }
    if (!this._sink) {
      throw new Error('Stream sink is required. Use toDelta()');
    }
    if (!this._checkpointLocation) {
      throw new Error('Checkpoint location is required. Use checkpoint()');
    }

    // Build the spec
    return {
      source: this._source,
      sink: this._sink,
      trigger: this._trigger,
      checkpointLocation: this._checkpointLocation,
      queryName: this._queryName,
      transformations: this._transformations.map((t) => t.sql),
      options: Object.keys(this._options).length > 0 ? this._options : undefined,
    };
  }
}

// ============================================================================
// Notebook Generation
// ============================================================================

/**
 * Generate PySpark notebook code for a streaming job specification
 *
 * @param spec - Streaming job specification
 * @returns PySpark notebook code as a string
 *
 * @example
 * ```typescript
 * const notebookCode = generateStreamingNotebook(spec);
 * ```
 */
export function generateStreamingNotebook(spec: StreamingJobSpec): string {
  const lines: string[] = [];

  // Header
  lines.push('# Databricks notebook source');
  lines.push('# MAGIC %md');
  lines.push('# MAGIC # Structured Streaming Job');
  lines.push('# MAGIC');
  if (spec.queryName) {
    lines.push(`# MAGIC **Query Name:** ${spec.queryName}`);
  }
  lines.push(`# MAGIC **Source:** ${spec.source.type}`);
  lines.push(`# MAGIC **Sink:** ${spec.sink.type}`);
  lines.push(`# MAGIC **Trigger:** ${spec.trigger.type}`);
  lines.push('');

  // Imports
  lines.push('# COMMAND ----------');
  lines.push('');
  lines.push('from pyspark.sql import SparkSession');
  lines.push('from pyspark.sql.functions import *');
  lines.push('');

  // Initialize Spark session
  lines.push('# COMMAND ----------');
  lines.push('');
  lines.push('# Initialize Spark session');
  lines.push('spark = SparkSession.builder.getOrCreate()');
  lines.push('');

  // Read stream from source
  lines.push('# COMMAND ----------');
  lines.push('');
  lines.push('# Read stream from source');
  lines.push('');

  if (spec.source.type === 'delta') {
    lines.push(`# Source: Delta table "${spec.source.table}"`);
    lines.push('df = spark.readStream \\');
    lines.push('    .format("delta") \\');
    lines.push(`    .table("${spec.source.table}")`);
  } else if (spec.source.type === 'kafka') {
    lines.push(`# Source: Kafka topic "${spec.source.topic}"`);
    lines.push('df = spark.readStream \\');
    lines.push('    .format("kafka") \\');
    lines.push(`    .option("kafka.bootstrap.servers", "${spec.source.bootstrapServers}") \\`);
    lines.push(`    .option("subscribe", "${spec.source.topic}") \\`);

    // Add additional Kafka options
    if (spec.source.options) {
      for (const [key, value] of Object.entries(spec.source.options)) {
        lines.push(`    .option("${key}", "${value}") \\`);
      }
    }

    lines.push('    .load()');
  }

  lines.push('');
  lines.push('# Create temporary view for transformations');
  lines.push('df.createOrReplaceTempView("streaming_source")');
  lines.push('');

  // Apply transformations
  if (spec.transformations && spec.transformations.length > 0) {
    lines.push('# COMMAND ----------');
    lines.push('');
    lines.push('# Apply transformations');
    lines.push('');

    for (let i = 0; i < spec.transformations.length; i++) {
      const sql = spec.transformations[i];
      lines.push(`# Transformation ${i + 1}`);
      lines.push('df = spark.sql("""');
      lines.push(sql);
      lines.push('"""');
      lines.push(')');
      lines.push('');
      lines.push('# Update temporary view');
      lines.push('df.createOrReplaceTempView("streaming_source")');
      lines.push('');
    }
  }

  // Write stream to sink
  lines.push('# COMMAND ----------');
  lines.push('');
  lines.push('# Write stream to sink');
  lines.push('');

  lines.push('query = df.writeStream \\');

  // Output mode
  if (spec.sink.type === 'delta' && spec.sink.outputMode) {
    lines.push(`    .outputMode("${spec.sink.outputMode}") \\`);
  }

  // Format and location
  if (spec.sink.type === 'delta') {
    lines.push('    .format("delta") \\');
    lines.push(`    .option("checkpointLocation", "${spec.checkpointLocation}") \\`);
  }

  // Query name
  if (spec.queryName) {
    lines.push(`    .queryName("${spec.queryName}") \\`);
  }

  // Additional options
  if (spec.options) {
    for (const [key, value] of Object.entries(spec.options)) {
      lines.push(`    .option("${key}", "${value}") \\`);
    }
  }

  // Trigger configuration
  if (spec.trigger.type === 'processing_time') {
    const intervalSeconds = Math.floor(spec.trigger.intervalMs / 1000);
    lines.push(`    .trigger(processingTime="${intervalSeconds} seconds") \\`);
  } else if (spec.trigger.type === 'once') {
    lines.push('    .trigger(once=True) \\');
  } else if (spec.trigger.type === 'available_now') {
    lines.push('    .trigger(availableNow=True) \\');
  } else if (spec.trigger.type === 'continuous') {
    const checkpointIntervalSeconds = Math.floor(spec.trigger.checkpointIntervalMs / 1000);
    lines.push(`    .trigger(continuous="${checkpointIntervalSeconds} seconds") \\`);
  }

  // Table or path
  if (spec.sink.type === 'delta') {
    lines.push(`    .toTable("${spec.sink.table}")`);
  }

  lines.push('');

  // Wait for termination (for once/available_now triggers)
  if (spec.trigger.type === 'once' || spec.trigger.type === 'available_now') {
    lines.push('# COMMAND ----------');
    lines.push('');
    lines.push('# Wait for query to complete');
    lines.push('query.awaitTermination()');
    lines.push('');
  } else {
    lines.push('# COMMAND ----------');
    lines.push('');
    lines.push('# Display query status');
    lines.push('print(f"Query ID: {query.id}")');
    lines.push('print(f"Query Name: {query.name}")');
    lines.push('print(f"Is Active: {query.isActive}")');
    lines.push('');
    lines.push('# Note: The query will run continuously until stopped');
    lines.push('# To stop the query, use: query.stop()');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate a streaming job specification
 *
 * @param spec - Streaming job specification to validate
 * @throws Error if the specification is invalid
 */
export function validateStreamingJobSpec(spec: StreamingJobSpec): void {
  // Validate source
  if (!spec.source) {
    throw new Error('Stream source is required');
  }

  if (spec.source.type === 'delta') {
    if (!spec.source.table || spec.source.table.trim() === '') {
      throw new Error('Delta source table name is required');
    }
  } else if (spec.source.type === 'kafka') {
    if (!spec.source.bootstrapServers || spec.source.bootstrapServers.trim() === '') {
      throw new Error('Kafka bootstrap servers are required');
    }
    if (!spec.source.topic || spec.source.topic.trim() === '') {
      throw new Error('Kafka topic is required');
    }
  }

  // Validate sink
  if (!spec.sink) {
    throw new Error('Stream sink is required');
  }

  if (spec.sink.type === 'delta') {
    if (!spec.sink.table || spec.sink.table.trim() === '') {
      throw new Error('Delta sink table name is required');
    }
  }

  // Validate checkpoint location
  if (!spec.checkpointLocation || spec.checkpointLocation.trim() === '') {
    throw new Error('Checkpoint location is required');
  }

  // Validate trigger
  if (!spec.trigger) {
    throw new Error('Trigger mode is required');
  }

  if (spec.trigger.type === 'processing_time') {
    if (spec.trigger.intervalMs <= 0) {
      throw new Error('Processing time interval must be positive');
    }
  } else if (spec.trigger.type === 'continuous') {
    if (spec.trigger.checkpointIntervalMs <= 0) {
      throw new Error('Continuous checkpoint interval must be positive');
    }
  }

  // Validate transformations
  if (spec.transformations) {
    for (let i = 0; i < spec.transformations.length; i++) {
      const sql = spec.transformations[i];
      if (!sql || sql.trim() === '') {
        throw new Error(`Transformation ${i + 1} SQL is empty`);
      }
    }
  }
}

/**
 * Create a simple streaming job spec (for common use cases)
 *
 * @param sourceDeltaTable - Source Delta table name
 * @param targetDeltaTable - Target Delta table name
 * @param checkpointLocation - Checkpoint location path
 * @param triggerIntervalSeconds - Trigger interval in seconds (default: 10)
 * @returns Streaming job specification
 *
 * @example
 * ```typescript
 * const spec = createSimpleStreamingJob(
 *   'main.default.source',
 *   'main.default.target',
 *   '/dbfs/checkpoints/simple_stream'
 * );
 * ```
 */
export function createSimpleStreamingJob(
  sourceDeltaTable: string,
  targetDeltaTable: string,
  checkpointLocation: string,
  triggerIntervalSeconds: number = 10
): StreamingJobSpec {
  return StreamingJobBuilder.fromDelta(sourceDeltaTable)
    .toDelta(targetDeltaTable)
    .triggerInterval(seconds(triggerIntervalSeconds))
    .checkpoint(checkpointLocation)
    .build();
}

// ============================================================================
// Exports
// ============================================================================

export type {
  StreamSource,
  StreamSink,
  TriggerMode,
  StreamingJobSpec,
  RunId,
} from '../types/index.js';

export type { Transformation, SqlTransformation };

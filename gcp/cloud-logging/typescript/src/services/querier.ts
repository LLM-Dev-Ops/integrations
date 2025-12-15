/**
 * Log Querier Service
 *
 * Handles log entry queries with filtering, pagination, and correlation.
 * Following the SPARC specification.
 */

import type { GclConfig } from "../config/index.js";
import { resolveEndpoint, formatResourceName } from "../config/index.js";
import type { HttpTransport } from "../transport/index.js";
import { isSuccess, getRequestId } from "../transport/index.js";
import type { GcpAuthProvider } from "../client/auth.js";
import {
  formatTraceId,
  buildSpanTree,
  extractServices,
} from "../correlation/index.js";
import type {
  LogEntry,
  Severity,
  QueryRequest,
  QueryResponse,
  ListLogEntriesRequest,
  ListLogEntriesResponse,
  CorrelationOptions,
  CorrelatedLogs,
} from "../types/index.js";
import { severityToString } from "../types/index.js";
import { QueryError, parseGclError } from "../error/index.js";

/**
 * Log querier trait interface.
 */
export interface LogQuerierTrait {
  /**
   * Query log entries.
   */
  query(request: QueryRequest): Promise<QueryResponse>;

  /**
   * Query all log entries with auto-pagination.
   */
  queryAll(request: QueryRequest): AsyncIterable<LogEntry>;

  /**
   * Query logs by trace ID.
   */
  queryByTrace(traceId: string, options?: CorrelationOptions): Promise<CorrelatedLogs>;
}

/**
 * Filter builder for fluent query construction.
 */
export class FilterBuilder {
  private querier: LogQuerier;
  private parts: string[] = [];
  private resourceNames: string[] = [];
  private startTime?: Date;
  private endTime?: Date;
  private orderBy?: string;
  private pageSize?: number;

  constructor(querier: LogQuerier, resourceNames: string[]) {
    this.querier = querier;
    this.resourceNames = resourceNames;
  }

  /**
   * Filter by severity greater than or equal to.
   */
  severityGte(severity: Severity): this {
    this.parts.push(`severity >= ${severityToString(severity)}`);
    return this;
  }

  /**
   * Filter by exact severity.
   */
  severityEq(severity: Severity): this {
    this.parts.push(`severity = ${severityToString(severity)}`);
    return this;
  }

  /**
   * Filter by resource type.
   */
  resourceType(type: string): this {
    this.parts.push(`resource.type = "${type}"`);
    return this;
  }

  /**
   * Filter by label.
   */
  label(key: string, value: string): this {
    this.parts.push(`labels.${key} = "${value}"`);
    return this;
  }

  /**
   * Filter by resource label.
   */
  resourceLabel(key: string, value: string): this {
    this.parts.push(`resource.labels.${key} = "${value}"`);
    return this;
  }

  /**
   * Filter by text content (substring match).
   */
  textContains(text: string): this {
    this.parts.push(`textPayload : "${text}"`);
    return this;
  }

  /**
   * Filter by JSON payload field.
   */
  jsonField(path: string, value: string): this {
    this.parts.push(`jsonPayload.${path} = "${value}"`);
    return this;
  }

  /**
   * Filter by JSON payload field (numeric).
   */
  jsonFieldNumeric(path: string, op: string, value: number): this {
    this.parts.push(`jsonPayload.${path} ${op} ${value}`);
    return this;
  }

  /**
   * Filter by time range.
   */
  timeRange(start: Date, end: Date): this {
    this.startTime = start;
    this.endTime = end;
    return this;
  }

  /**
   * Filter by start time.
   */
  after(time: Date): this {
    this.startTime = time;
    return this;
  }

  /**
   * Filter by end time.
   */
  before(time: Date): this {
    this.endTime = time;
    return this;
  }

  /**
   * Filter by trace ID.
   */
  trace(traceId: string): this {
    const projectId = this.querier.getProjectId();
    this.parts.push(`trace = "${formatTraceId(projectId, traceId)}"`);
    return this;
  }

  /**
   * Filter by span ID.
   */
  spanId(spanId: string): this {
    this.parts.push(`spanId = "${spanId}"`);
    return this;
  }

  /**
   * Filter by log name.
   */
  logName(logName: string): this {
    this.parts.push(`logName = "${logName}"`);
    return this;
  }

  /**
   * Add raw filter expression.
   */
  raw(filter: string): this {
    this.parts.push(filter);
    return this;
  }

  /**
   * Add AND conjunction (for readability - parts are ANDed by default).
   */
  and(): this {
    // Parts are ANDed by default when joined
    return this;
  }

  /**
   * Add OR conjunction.
   */
  or(): this {
    if (this.parts.length >= 2) {
      const last = this.parts.pop()!;
      const secondLast = this.parts.pop()!;
      this.parts.push(`(${secondLast}) OR (${last})`);
    }
    return this;
  }

  /**
   * Group previous parts with parentheses.
   */
  group(): this {
    if (this.parts.length > 0) {
      const combined = this.parts.join(" AND ");
      this.parts = [`(${combined})`];
    }
    return this;
  }

  /**
   * Set order by expression.
   */
  orderByTimestamp(direction: "asc" | "desc" = "desc"): this {
    this.orderBy = `timestamp ${direction}`;
    return this;
  }

  /**
   * Set page size.
   */
  limit(size: number): this {
    this.pageSize = Math.min(size, 1000);
    return this;
  }

  /**
   * Build the query request.
   */
  build(): QueryRequest {
    const filter = this.buildFilterString();
    return {
      resourceNames: this.resourceNames,
      filter: filter || undefined,
      startTime: this.startTime?.toISOString(),
      endTime: this.endTime?.toISOString(),
      orderBy: this.orderBy,
      pageSize: this.pageSize,
    };
  }

  /**
   * Execute the query.
   */
  async execute(): Promise<QueryResponse> {
    return this.querier.query(this.build());
  }

  /**
   * Get a streaming iterator over all results.
   */
  stream(): AsyncIterable<LogEntry> {
    return this.querier.queryAll(this.build());
  }

  /**
   * Build the filter string from parts.
   */
  private buildFilterString(): string {
    const allParts = [...this.parts];

    // Add time filters
    if (this.startTime) {
      allParts.push(`timestamp >= "${this.startTime.toISOString()}"`);
    }
    if (this.endTime) {
      allParts.push(`timestamp <= "${this.endTime.toISOString()}"`);
    }

    return allParts.join(" AND ");
  }
}

/**
 * Log querier implementation.
 */
export class LogQuerier implements LogQuerierTrait {
  private config: GclConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;

  constructor(
    config: GclConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Get the project ID.
   */
  getProjectId(): string {
    return this.config.projectId;
  }

  /**
   * Create a filter builder for fluent query construction.
   */
  filter(resourceNames?: string[]): FilterBuilder {
    const resources = resourceNames ?? [formatResourceName(this.config.projectId)];
    return new FilterBuilder(this, resources);
  }

  /**
   * Query log entries.
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    const token = await this.authProvider.getAccessToken();
    const endpoint = resolveEndpoint(this.config);

    // Build API request
    const apiRequest: ListLogEntriesRequest = {
      resourceNames: request.resourceNames.length > 0
        ? request.resourceNames
        : [formatResourceName(this.config.projectId)],
      filter: request.filter,
      orderBy: request.orderBy ?? "timestamp desc",
      pageSize: Math.min(request.pageSize ?? 1000, 1000),
      pageToken: request.pageToken,
    };

    const response = await this.transport.send({
      method: "POST",
      url: `${endpoint}/v2/entries:list`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiRequest),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      const requestId = getRequestId(response);
      throw parseGclError(response.status, response.body.toString(), requestId);
    }

    const data = JSON.parse(response.body.toString()) as ListLogEntriesResponse;

    return {
      entries: (data.entries ?? []).map(this.parseLogEntry),
      nextPageToken: data.nextPageToken,
    };
  }

  /**
   * Query all log entries with auto-pagination.
   */
  async *queryAll(request: QueryRequest): AsyncIterable<LogEntry> {
    let pageToken: string | undefined = request.pageToken;

    do {
      const response = await this.query({
        ...request,
        pageToken,
      });

      for (const entry of response.entries) {
        yield entry;
      }

      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  /**
   * Query logs by trace ID for cross-service correlation.
   */
  async queryByTrace(
    traceId: string,
    options?: CorrelationOptions
  ): Promise<CorrelatedLogs> {
    const resourceNames = options?.resources ?? [
      formatResourceName(this.config.projectId),
    ];

    // Build trace filter
    const traceFilter = formatTraceId(this.config.projectId, traceId);
    let filter = `trace = "${traceFilter}"`;

    if (options?.includeChildren) {
      // Also search for parent trace label
      filter = `(${filter}) OR (labels.parent_trace = "${traceId}")`;
    }

    // Set time bounds (default to last hour)
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 60 * 60 * 1000);

    const queryRequest: QueryRequest = {
      resourceNames,
      filter,
      startTime: (options?.startTime ?? defaultStart).toISOString(),
      endTime: (options?.endTime ?? now).toISOString(),
      orderBy: "timestamp asc",
    };

    // Collect all entries
    const entries: LogEntry[] = [];
    for await (const entry of this.queryAll(queryRequest)) {
      entries.push(entry);
    }

    // Build span tree
    const spanTree = buildSpanTree(entries);

    // Extract unique services
    const services = extractServices(entries);

    return {
      traceId,
      entries,
      spanTree,
      services,
    };
  }

  /**
   * Parse log entry from API response.
   */
  private parseLogEntry(data: Record<string, unknown>): LogEntry {
    return {
      logName: data["logName"] as string | undefined,
      resource: data["resource"] as LogEntry["resource"],
      timestamp: data["timestamp"] as string | undefined,
      receiveTimestamp: data["receiveTimestamp"] as string | undefined,
      severity: (data["severity"] as string) ?? "DEFAULT",
      insertId: data["insertId"] as string | undefined,
      labels: (data["labels"] as Record<string, string>) ?? {},
      textPayload: data["textPayload"] as string | undefined,
      jsonPayload: data["jsonPayload"] as Record<string, unknown> | undefined,
      protoPayload: data["protoPayload"] as LogEntry["protoPayload"],
      httpRequest: data["httpRequest"] as LogEntry["httpRequest"],
      trace: data["trace"] as string | undefined,
      spanId: data["spanId"] as string | undefined,
      traceSampled: data["traceSampled"] as boolean | undefined,
      sourceLocation: data["sourceLocation"] as LogEntry["sourceLocation"],
      operation: data["operation"] as LogEntry["operation"],
    };
  }
}

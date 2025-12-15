/**
 * Query replay functionality for deterministic testing.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

import { promises as fs } from "fs";
import { TableSchema } from "../types/schema.js";
import { TableRow } from "../types/row.js";
import { Job, JobReference, QueryRequest, QueryResponse } from "../services/query/types.js";
import { BigQueryError } from "../error/index.js";
import { MockQueryResult, ReplayScenario } from "./types.js";

/**
 * Recorded query for replay.
 */
interface RecordedQuery {
  /** Query string. */
  query: string;

  /** Query result. */
  result: MockQueryResult;

  /** Job reference. */
  jobReference: JobReference;

  /** Timestamp when query was recorded. */
  timestamp: string;
}

/**
 * Serializable replay scenario for file storage.
 */
interface SerializableReplayScenario {
  /** Recorded queries. */
  queries: Record<string, {
    schema: TableSchema;
    rows: TableRow[];
    totalBytesProcessed: string;
    cacheHit: boolean;
  }>;

  /** Recorded jobs. */
  jobs: Record<string, Job>;

  /** Metadata about the recording. */
  metadata?: {
    recordedAt?: string;
    description?: string;
  };
}

/**
 * Client that wraps a real client and records all queries and responses.
 */
export class RecordingClient {
  private readonly queries: Map<string, RecordedQuery>;
  private readonly jobs: Map<string, Job>;

  /**
   * Create a new recording client.
   */
  constructor() {
    this.queries = new Map();
    this.jobs = new Map();
  }

  /**
   * Record a query execution.
   *
   * @param query - Query string
   * @param response - Query response
   */
  recordQuery(query: string, response: QueryResponse): void {
    const normalizedQuery = this.normalizeQuery(query);

    this.queries.set(normalizedQuery, {
      query: normalizedQuery,
      result: {
        schema: response.schema ?? { fields: [] },
        rows: response.rows,
        totalBytesProcessed: response.totalBytesProcessed ?? BigInt(0),
        cacheHit: response.cacheHit,
      },
      jobReference: response.jobReference,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record a job.
   *
   * @param jobId - Job ID
   * @param job - Job object
   */
  recordJob(jobId: string, job: Job): void {
    this.jobs.set(jobId, job);
  }

  /**
   * Get the recorded scenario.
   */
  getScenario(): ReplayScenario {
    const queries = new Map<string, MockQueryResult>();

    for (const [query, recorded] of Array.from(this.queries.entries())) {
      queries.set(query, recorded.result);
    }

    return {
      queries,
      jobs: new Map(this.jobs),
    };
  }

  /**
   * Clear all recorded data.
   */
  clear(): void {
    this.queries.clear();
    this.jobs.clear();
  }

  /**
   * Normalize a query string for matching.
   */
  private normalizeQuery(query: string): string {
    // Remove extra whitespace and normalize to lowercase
    return query.trim().replace(/\s+/g, " ").toLowerCase();
  }
}

/**
 * Client that replays recorded queries from a scenario.
 */
export class ReplayClient {
  private readonly scenario: ReplayScenario;
  private readonly callHistory: Array<{ query: string; timestamp: Date }>;

  /**
   * Create a new replay client.
   *
   * @param scenario - Replay scenario
   */
  constructor(scenario: ReplayScenario) {
    this.scenario = scenario;
    this.callHistory = [];
  }

  /**
   * Execute a query using recorded data.
   *
   * @param request - Query request
   * @returns Query response from recorded scenario
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    const normalizedQuery = this.normalizeQuery(request.query);

    this.callHistory.push({
      query: request.query,
      timestamp: new Date(),
    });

    // Find exact match
    const exactResult = this.scenario.queries.get(normalizedQuery);
    if (exactResult) {
      return this.createResponse(exactResult, request);
    }

    // Find pattern match
    for (const [pattern, result] of Array.from(this.scenario.queries.entries())) {
      if (normalizedQuery.includes(pattern) || pattern.includes(normalizedQuery)) {
        return this.createResponse(result, request);
      }
    }

    throw new BigQueryError(
      `No recorded response found for query: ${request.query}`,
      "Replay.QueryNotFound"
    );
  }

  /**
   * Get a job by ID.
   *
   * @param jobId - Job ID
   * @returns Job from recorded scenario
   */
  async getJob(jobId: string): Promise<Job> {
    const job = this.scenario.jobs.get(jobId);
    if (!job) {
      throw new BigQueryError(
        `No recorded job found: ${jobId}`,
        "Replay.JobNotFound"
      );
    }
    return job;
  }

  /**
   * Get query call history.
   */
  getCallHistory(): ReadonlyArray<{ query: string; timestamp: Date }> {
    return this.callHistory;
  }

  /**
   * Create a query response from a mock result.
   */
  private createResponse(result: MockQueryResult, request: QueryRequest): QueryResponse {
    // Check byte limit if specified
    if (request.maximumBytesBilled !== undefined &&
        result.totalBytesProcessed > request.maximumBytesBilled) {
      throw new BigQueryError(
        "Query exceeded maximum bytes billed",
        "Query.BytesExceeded"
      );
    }

    return {
      jobReference: {
        projectId: "replay-project",
        jobId: `replay-job-${Date.now()}`,
        location: "US",
      },
      schema: result.schema,
      rows: result.rows,
      totalRows: BigInt(result.rows.length),
      cacheHit: result.cacheHit,
      totalBytesProcessed: result.totalBytesProcessed,
      totalBytesBilled: result.totalBytesProcessed,
      jobComplete: true,
      numDmlAffectedRows: BigInt(0),
    };
  }

  /**
   * Normalize a query string for matching.
   */
  private normalizeQuery(query: string): string {
    return query.trim().replace(/\s+/g, " ").toLowerCase();
  }
}

/**
 * Save a replay scenario to a JSON file.
 *
 * @param scenario - Replay scenario to save
 * @param path - File path
 */
export async function saveScenario(scenario: ReplayScenario, path: string): Promise<void> {
  const serializable: SerializableReplayScenario = {
    queries: {},
    jobs: {},
    metadata: {
      recordedAt: new Date().toISOString(),
    },
  };

  // Convert queries map to object
  for (const [query, result] of Array.from(scenario.queries.entries())) {
    serializable.queries[query] = {
      schema: result.schema,
      rows: result.rows,
      totalBytesProcessed: result.totalBytesProcessed.toString(),
      cacheHit: result.cacheHit,
    };
  }

  // Convert jobs map to object
  for (const [jobId, job] of Array.from(scenario.jobs.entries())) {
    serializable.jobs[jobId] = job;
  }

  const json = JSON.stringify(serializable, null, 2);
  await fs.writeFile(path, json, "utf-8");
}

/**
 * Load a replay scenario from a JSON file.
 *
 * @param path - File path
 * @returns Loaded replay scenario
 */
export async function loadScenario(path: string): Promise<ReplayScenario> {
  const json = await fs.readFile(path, "utf-8");
  const serializable: SerializableReplayScenario = JSON.parse(json);

  const queries = new Map<string, MockQueryResult>();
  const jobs = new Map<string, Job>();

  // Convert queries object to map
  for (const [query, result] of Object.entries(serializable.queries)) {
    queries.set(query, {
      schema: result.schema,
      rows: result.rows,
      totalBytesProcessed: BigInt(result.totalBytesProcessed),
      cacheHit: result.cacheHit,
    });
  }

  // Convert jobs object to map
  for (const [jobId, job] of Object.entries(serializable.jobs)) {
    jobs.set(jobId, job);
  }

  return {
    queries,
    jobs,
  };
}

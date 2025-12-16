/**
 * Jobs Client Module
 *
 * Handles job submission, monitoring, and lifecycle management for Databricks Jobs API.
 * Implements adaptive polling with exponential backoff for waitForCompletion.
 *
 * @module @llmdevops/databricks-delta-lake-integration/jobs
 */

import {
  JobError,
  RunFailed,
  RunCanceled,
  ClusterNotAvailable,
  ServiceError,
  InternalError,
  isRetryableError,
} from '../errors/index.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * HTTP request method
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * HTTP executor interface for making API requests
 */
export interface HttpExecutor {
  /**
   * Execute an HTTP request
   * @param method - HTTP method
   * @param path - API path (without base URL)
   * @param body - Optional request body
   * @returns Response data
   */
  request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown
  ): Promise<T>;
}

/**
 * Metrics recording interface
 */
export interface MetricsRecorder {
  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, labels?: Record<string, string>): void;

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Tracing span interface
 */
export interface TracingSpan {
  /**
   * Set an attribute on the span
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * End the span
   */
  end(): void;
}

/**
 * Tracer interface
 */
export interface Tracer {
  /**
   * Start a new tracing span
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TracingSpan;
}

// ============================================================================
// Job Task Types
// ============================================================================

/**
 * Notebook task configuration
 */
export interface NotebookTask {
  type: 'notebook';
  /** Path to the notebook in the workspace */
  notebookPath: string;
  /** Base parameters to pass to the notebook */
  baseParameters?: Record<string, string>;
  /** Optional cluster specification */
  clusterSpec?: ClusterSpec;
}

/**
 * Spark JAR task configuration
 */
export interface SparkJarTask {
  type: 'spark_jar';
  /** Main class to execute */
  mainClassName: string;
  /** URI to the JAR file */
  jarUri: string;
  /** Parameters to pass to the main class */
  parameters?: string[];
  /** Optional cluster specification */
  clusterSpec?: ClusterSpec;
}

/**
 * Spark Python task configuration
 */
export interface SparkPythonTask {
  type: 'spark_python';
  /** Path to the Python file */
  pythonFile: string;
  /** Parameters to pass to the script */
  parameters?: string[];
  /** Optional cluster specification */
  clusterSpec?: ClusterSpec;
}

/**
 * Spark Submit task configuration
 */
export interface SparkSubmitTask {
  type: 'spark_submit';
  /** Spark submit parameters */
  parameters: string[];
  /** Optional cluster specification */
  clusterSpec?: ClusterSpec;
}

/**
 * Union type for all job task types
 */
export type JobTask = NotebookTask | SparkJarTask | SparkPythonTask | SparkSubmitTask;

// ============================================================================
// Cluster Specification
// ============================================================================

/**
 * Autoscale configuration
 */
export interface AutoscaleConfig {
  /** Minimum number of workers */
  minWorkers: number;
  /** Maximum number of workers */
  maxWorkers: number;
}

/**
 * Cluster specification for job execution
 */
export interface ClusterSpec {
  /** Spark version (e.g., "13.3.x-scala2.12") */
  sparkVersion: string;
  /** Node type ID (e.g., "Standard_DS3_v2") */
  nodeTypeId: string;
  /** Number of workers (fixed size) */
  numWorkers?: number;
  /** Autoscale configuration (overrides numWorkers) */
  autoscale?: AutoscaleConfig;
  /** Spark configuration properties */
  sparkConf?: Record<string, string>;
  /** Spark environment variables */
  sparkEnvVars?: Record<string, string>;
  /** Init scripts */
  initScripts?: Array<{ dbfs?: { destination: string } }>;
}

/**
 * Default cluster specification
 */
export function defaultClusterSpec(): ClusterSpec {
  return {
    sparkVersion: '13.3.x-scala2.12',
    nodeTypeId: 'Standard_DS3_v2',
    numWorkers: 2,
    sparkConf: {},
  };
}

/**
 * Cluster specification presets
 */
export const ClusterPresets = {
  /**
   * Small cluster for development and testing
   */
  small(): ClusterSpec {
    return {
      sparkVersion: '13.3.x-scala2.12',
      nodeTypeId: 'Standard_DS3_v2',
      numWorkers: 1,
      sparkConf: {
        'spark.databricks.delta.preview.enabled': 'true',
      },
    };
  },

  /**
   * Medium cluster with autoscaling for variable workloads
   */
  mediumAutoscale(): ClusterSpec {
    return {
      sparkVersion: '13.3.x-scala2.12',
      nodeTypeId: 'Standard_DS3_v2',
      autoscale: {
        minWorkers: 2,
        maxWorkers: 8,
      },
      sparkConf: {
        'spark.databricks.delta.preview.enabled': 'true',
        'spark.databricks.adaptive.enabled': 'true',
      },
    };
  },

  /**
   * Large cluster optimized for ETL workloads
   */
  largeEtl(): ClusterSpec {
    return {
      sparkVersion: '13.3.x-scala2.12',
      nodeTypeId: 'Standard_DS4_v2',
      numWorkers: 10,
      sparkConf: {
        'spark.databricks.delta.preview.enabled': 'true',
        'spark.databricks.adaptive.enabled': 'true',
        'spark.sql.adaptive.coalescePartitions.enabled': 'true',
        'spark.sql.shuffle.partitions': '200',
      },
    };
  },

  /**
   * GPU-enabled cluster for ML workloads
   */
  gpuMl(): ClusterSpec {
    return {
      sparkVersion: '13.3.x-gpu-ml-scala2.12',
      nodeTypeId: 'Standard_NC6s_v3',
      numWorkers: 2,
      sparkConf: {
        'spark.databricks.delta.preview.enabled': 'true',
        'spark.task.resource.gpu.amount': '1',
      },
    };
  },
};

// ============================================================================
// Run State Types
// ============================================================================

/**
 * Run lifecycle state
 */
export type RunLifeCycleState =
  | 'PENDING'
  | 'RUNNING'
  | 'TERMINATING'
  | 'TERMINATED'
  | 'SKIPPED'
  | 'INTERNAL_ERROR';

/**
 * Run result state (when terminated)
 */
export type RunResultState = 'SUCCESS' | 'FAILED' | 'CANCELED' | 'TIMEDOUT';

/**
 * Run state information
 */
export interface RunState {
  /** Lifecycle state of the run */
  lifeCycleState: RunLifeCycleState;
  /** Result state (only present when terminated) */
  resultState?: RunResultState;
  /** State message with additional details */
  stateMessage?: string;
  /** User-facing state message */
  userFacingMessage?: string;
}

/**
 * Run status information
 */
export interface RunStatus {
  /** Unique run identifier */
  runId: number;
  /** Run state */
  state: RunState;
  /** Run name */
  runName?: string;
  /** Start time (epoch milliseconds) */
  startTime?: number;
  /** Setup duration (milliseconds) */
  setupDuration?: number;
  /** Execution duration (milliseconds) */
  executionDuration?: number;
  /** Cleanup duration (milliseconds) */
  cleanupDuration?: number;
  /** End time (epoch milliseconds) */
  endTime?: number;
  /** Cluster instance information */
  clusterInstance?: {
    clusterId: string;
    sparkContextId: string;
  };
  /** Task execution details */
  tasks?: Array<{
    runId: number;
    taskKey: string;
    state: RunState;
    startTime?: number;
    endTime?: number;
  }>;
}

/**
 * Run output information
 */
export interface RunOutput {
  /** Notebook output (for notebook tasks) */
  notebookOutput?: {
    result?: string;
    truncated?: boolean;
  };
  /** SQL output (for SQL tasks) */
  sqlOutput?: {
    queryOutput?: {
      outputLink?: string;
      warehouseId?: string;
    };
  };
  /** DLT output (for DLT pipeline tasks) */
  dltOutput?: {
    notebookOutput?: {
      result?: string;
    };
  };
  /** Logs from the run */
  logs?: string;
  /** Logs URL */
  logsUrl?: string;
  /** Error message if failed */
  error?: string;
  /** Error trace if failed */
  errorTrace?: string;
  /** Run page URL */
  runPageUrl?: string;
}

/**
 * Run identifier
 */
export type RunId = number;

// ============================================================================
// Jobs Client
// ============================================================================

/**
 * Options for waiting for job completion
 */
export interface WaitOptions {
  /** Initial polling interval in milliseconds (default: 1000) */
  initialIntervalMs?: number;
  /** Maximum polling interval in milliseconds (default: 30000) */
  maxIntervalMs?: number;
  /** Timeout in milliseconds (default: 3600000 = 1 hour) */
  timeoutMs?: number;
  /** Exponential backoff multiplier (default: 1.5) */
  backoffMultiplier?: number;
}

/**
 * Options for running jobs
 */
export interface RunOptions {
  /** Job name override */
  runName?: string;
  /** Timeout for the entire job in seconds */
  timeoutSeconds?: number;
  /** Idempotency token for exactly-once semantics */
  idempotencyToken?: string;
}

/**
 * Options for listing runs
 */
export interface ListRunsOptions {
  /** Filter by job ID */
  jobId?: number;
  /** Return only active runs */
  activeOnly?: boolean;
  /** Completed only */
  completedOnly?: boolean;
  /** Offset for pagination */
  offset?: number;
  /** Limit number of results */
  limit?: number;
  /** Start time filter (epoch milliseconds) */
  startTimeFrom?: number;
  /** End time filter (epoch milliseconds) */
  startTimeTo?: number;
}

/**
 * Jobs client for managing Databricks job runs
 */
export class JobsClient {
  private readonly httpExecutor: HttpExecutor;
  private readonly metrics?: MetricsRecorder;
  private readonly tracer?: Tracer;

  /**
   * Create a new JobsClient
   * @param httpExecutor - HTTP executor for making API requests
   * @param metrics - Optional metrics recorder
   * @param tracer - Optional tracer for distributed tracing
   */
  constructor(httpExecutor: HttpExecutor, metrics?: MetricsRecorder, tracer?: Tracer) {
    this.httpExecutor = httpExecutor;
    this.metrics = metrics;
    this.tracer = tracer;
  }

  /**
   * Submit a one-time job run
   *
   * @param task - Job task configuration
   * @param options - Optional run configuration
   * @returns Run ID of the submitted job
   *
   * @example
   * ```typescript
   * const runId = await jobsClient.submitRun({
   *   type: 'notebook',
   *   notebookPath: '/Users/me/my-notebook',
   *   baseParameters: { param1: 'value1' },
   *   clusterSpec: ClusterPresets.small()
   * });
   * ```
   */
  async submitRun(task: JobTask, options?: RunOptions): Promise<RunId> {
    const span = this.tracer?.startSpan('databricks.job.submit', {
      job_type: task.type,
      notebook_path: task.type === 'notebook' ? task.notebookPath : '',
    });

    try {
      const request = this.buildSubmitRequest(task, options);

      interface SubmitRunResponse {
        run_id: number;
      }

      const response = await this.httpExecutor.request<SubmitRunResponse>(
        'POST',
        '/jobs/runs/submit',
        request
      );

      // Record metrics
      this.metrics?.incrementCounter('databricks_jobs_submitted_total', {
        job_type: task.type,
      });

      span?.setAttribute('run_id', response.run_id);
      span?.end();

      return response.run_id;
    } catch (error) {
      span?.end();
      throw this.handleJobError(error, 'Failed to submit job run');
    }
  }

  /**
   * Trigger an existing job to run now
   *
   * @param jobId - The ID of the job to run
   * @param notebookParams - Optional parameters for notebook jobs
   * @param jarParams - Optional parameters for JAR jobs
   * @returns Run ID of the triggered job
   */
  async runNow(
    jobId: number,
    notebookParams?: Record<string, string>,
    jarParams?: string[]
  ): Promise<RunId> {
    const span = this.tracer?.startSpan('databricks.job.run_now', {
      job_id: jobId,
    });

    try {
      const request: Record<string, unknown> = {
        job_id: jobId,
      };

      if (notebookParams) {
        request.notebook_params = notebookParams;
      }
      if (jarParams) {
        request.jar_params = jarParams;
      }

      interface RunNowResponse {
        run_id: number;
      }

      const response = await this.httpExecutor.request<RunNowResponse>(
        'POST',
        '/jobs/run-now',
        request
      );

      this.metrics?.incrementCounter('databricks_jobs_triggered_total', {
        job_id: jobId.toString(),
      });

      span?.setAttribute('run_id', response.run_id);
      span?.end();

      return response.run_id;
    } catch (error) {
      span?.end();
      throw this.handleJobError(error, 'Failed to trigger job');
    }
  }

  /**
   * Get the status of a job run
   *
   * @param runId - Run ID to check
   * @returns Run status information
   *
   * @example
   * ```typescript
   * const status = await jobsClient.getRun(runId);
   * console.log(`State: ${status.state.lifeCycleState}`);
   * if (status.state.resultState) {
   *   console.log(`Result: ${status.state.resultState}`);
   * }
   * ```
   */
  async getRun(runId: RunId): Promise<RunStatus> {
    const span = this.tracer?.startSpan('databricks.job.status', {
      run_id: runId,
    });

    try {
      interface GetRunResponse {
        run_id: number;
        run_name?: string;
        state: {
          life_cycle_state: string;
          result_state?: string;
          state_message?: string;
          user_facing_message?: string;
        };
        start_time?: number;
        setup_duration?: number;
        execution_duration?: number;
        cleanup_duration?: number;
        end_time?: number;
        cluster_instance?: {
          cluster_id: string;
          spark_context_id: string;
        };
        tasks?: Array<{
          run_id: number;
          task_key: string;
          state: {
            life_cycle_state: string;
            result_state?: string;
            state_message?: string;
          };
          start_time?: number;
          end_time?: number;
        }>;
      }

      const response = await this.httpExecutor.request<GetRunResponse>(
        'GET',
        `/jobs/runs/get?run_id=${runId}`
      );

      const status = this.parseRunStatus(response);

      span?.setAttribute('state', status.state.lifeCycleState);
      if (status.startTime && status.endTime) {
        const durationSeconds = (status.endTime - status.startTime) / 1000;
        span?.setAttribute('duration', durationSeconds);
      }
      span?.end();

      return status;
    } catch (error) {
      span?.end();
      throw this.handleJobError(error, 'Failed to get run status');
    }
  }

  /**
   * List job runs with optional filtering
   *
   * @param options - Filter options
   * @returns List of run statuses
   */
  async listRuns(options?: ListRunsOptions): Promise<RunStatus[]> {
    try {
      const queryParams = new URLSearchParams();

      if (options?.jobId !== undefined) {
        queryParams.set('job_id', options.jobId.toString());
      }
      if (options?.activeOnly) {
        queryParams.set('active_only', 'true');
      }
      if (options?.completedOnly) {
        queryParams.set('completed_only', 'true');
      }
      if (options?.offset !== undefined) {
        queryParams.set('offset', options.offset.toString());
      }
      if (options?.limit !== undefined) {
        queryParams.set('limit', options.limit.toString());
      }
      if (options?.startTimeFrom !== undefined) {
        queryParams.set('start_time_from', options.startTimeFrom.toString());
      }
      if (options?.startTimeTo !== undefined) {
        queryParams.set('start_time_to', options.startTimeTo.toString());
      }

      interface ListRunsResponse {
        runs: Array<{
          run_id: number;
          run_name?: string;
          state: {
            life_cycle_state: string;
            result_state?: string;
            state_message?: string;
          };
          start_time?: number;
          end_time?: number;
        }>;
        has_more: boolean;
      }

      const path = queryParams.toString()
        ? `/jobs/runs/list?${queryParams.toString()}`
        : '/jobs/runs/list';

      const response = await this.httpExecutor.request<ListRunsResponse>('GET', path);

      return (response.runs || []).map((run) => this.parseRunStatus(run));
    } catch (error) {
      throw this.handleJobError(error, 'Failed to list runs');
    }
  }

  /**
   * Cancel a running job
   *
   * @param runId - Run ID to cancel
   *
   * @example
   * ```typescript
   * await jobsClient.cancelRun(runId);
   * console.log('Job canceled');
   * ```
   */
  async cancelRun(runId: RunId): Promise<void> {
    try {
      await this.httpExecutor.request('POST', '/jobs/runs/cancel', {
        run_id: runId,
      });

      this.metrics?.incrementCounter('databricks_jobs_canceled_total');
    } catch (error) {
      throw this.handleJobError(error, 'Failed to cancel run');
    }
  }

  /**
   * Get the output of a completed job run
   *
   * @param runId - Run ID to get output for
   * @returns Run output information
   *
   * @example
   * ```typescript
   * const output = await jobsClient.getOutput(runId);
   * if (output.notebookOutput) {
   *   console.log('Notebook result:', output.notebookOutput.result);
   * }
   * ```
   */
  async getOutput(runId: RunId): Promise<RunOutput> {
    try {
      interface GetOutputResponse {
        notebook_output?: {
          result?: string;
          truncated?: boolean;
        };
        sql_output?: {
          query_output?: {
            output_link?: string;
            warehouse_id?: string;
          };
        };
        dlt_output?: {
          notebook_output?: {
            result?: string;
          };
        };
        logs?: string;
        logs_url?: string;
        error?: string;
        error_trace?: string;
        run_page_url?: string;
      }

      const response = await this.httpExecutor.request<GetOutputResponse>(
        'GET',
        `/jobs/runs/get-output?run_id=${runId}`
      );

      return {
        notebookOutput: response.notebook_output,
        sqlOutput: response.sql_output
          ? {
              queryOutput: response.sql_output.query_output
                ? {
                    outputLink: response.sql_output.query_output.output_link,
                    warehouseId: response.sql_output.query_output.warehouse_id,
                  }
                : undefined,
            }
          : undefined,
        dltOutput: response.dlt_output
          ? {
              notebookOutput: response.dlt_output.notebook_output
                ? {
                    result: response.dlt_output.notebook_output.result,
                  }
                : undefined,
            }
          : undefined,
        logs: response.logs,
        logsUrl: response.logs_url,
        error: response.error,
        errorTrace: response.error_trace,
        runPageUrl: response.run_page_url,
      };
    } catch (error) {
      throw this.handleJobError(error, 'Failed to get run output');
    }
  }

  /**
   * Export run details for archival or analysis
   *
   * @param runId - Run ID to export
   * @returns Run export data
   */
  async exportRun(runId: RunId): Promise<unknown> {
    try {
      return await this.httpExecutor.request('GET', `/jobs/runs/export?run_id=${runId}`);
    } catch (error) {
      throw this.handleJobError(error, 'Failed to export run');
    }
  }

  /**
   * Wait for a job run to complete with adaptive polling
   *
   * Uses exponential backoff to reduce API calls while still being responsive:
   * - Starts with 1s polling interval
   * - Increases to max 30s interval
   * - Times out after 1 hour by default
   *
   * @param runId - Run ID to wait for
   * @param options - Wait configuration options
   * @returns Final run status
   * @throws {RunFailed} If the job fails
   * @throws {RunCanceled} If the job is canceled
   * @throws {InternalError} If an internal error occurs
   * @throws {Error} If the wait times out
   *
   * @example
   * ```typescript
   * const runId = await jobsClient.submitRun(task);
   * const status = await jobsClient.waitForCompletion(runId);
   * console.log('Job completed successfully!');
   * ```
   */
  async waitForCompletion(runId: RunId, options?: WaitOptions): Promise<RunStatus> {
    const initialIntervalMs = options?.initialIntervalMs ?? 1000; // 1 second
    const maxIntervalMs = options?.maxIntervalMs ?? 30000; // 30 seconds
    const timeoutMs = options?.timeoutMs ?? 3600000; // 1 hour
    const backoffMultiplier = options?.backoffMultiplier ?? 1.5;

    const startTime = Date.now();
    let currentIntervalMs = initialIntervalMs;

    const span = this.tracer?.startSpan('databricks.job.wait_completion', {
      run_id: runId,
      timeout_ms: timeoutMs,
    });

    try {
      while (true) {
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          span?.end();
          throw new Error(
            `Timeout waiting for job run ${runId} to complete after ${timeoutMs}ms`
          );
        }

        // Get current status
        const status = await this.getRun(runId);

        // Check terminal states
        if (status.state.lifeCycleState === 'TERMINATED') {
          const resultState = status.state.resultState;

          if (resultState === 'SUCCESS') {
            // Record successful completion metrics
            if (status.startTime && status.endTime) {
              const durationSeconds = (status.endTime - status.startTime) / 1000;
              this.metrics?.recordHistogram('databricks_job_duration_seconds', durationSeconds, {
                result: 'success',
              });
              span?.setAttribute('duration_seconds', durationSeconds);
            }

            span?.setAttribute('result', 'success');
            span?.end();
            return status;
          } else if (resultState === 'FAILED') {
            span?.setAttribute('result', 'failed');
            span?.end();
            throw new RunFailed(
              runId.toString(),
              status.state.stateMessage || 'Job run failed'
            );
          } else if (resultState === 'CANCELED' || resultState === 'TIMEDOUT') {
            span?.setAttribute('result', resultState.toLowerCase());
            span?.end();
            throw new RunCanceled(runId.toString());
          } else {
            // Unknown result state
            span?.end();
            throw new InternalError(
              `Job run ${runId} terminated with unknown result state: ${resultState}`
            );
          }
        } else if (status.state.lifeCycleState === 'INTERNAL_ERROR') {
          span?.setAttribute('result', 'internal_error');
          span?.end();
          throw new InternalError(
            `Job run ${runId} encountered an internal error: ${status.state.stateMessage || 'Unknown error'}`
          );
        } else if (status.state.lifeCycleState === 'SKIPPED') {
          span?.setAttribute('result', 'skipped');
          span?.end();
          return status;
        }

        // Still running or pending - wait and retry with backoff
        await this.sleep(currentIntervalMs);

        // Increase interval with exponential backoff
        currentIntervalMs = Math.min(
          currentIntervalMs * backoffMultiplier,
          maxIntervalMs
        );
      }
    } catch (error) {
      span?.end();
      throw error;
    }
  }

  /**
   * Convenience method to submit and wait for completion
   *
   * @param task - Job task configuration
   * @param options - Optional run configuration
   * @param waitOptions - Optional wait configuration
   * @returns Final run status
   */
  async submitAndWait(
    task: JobTask,
    options?: RunOptions,
    waitOptions?: WaitOptions
  ): Promise<RunStatus> {
    const runId = await this.submitRun(task, options);
    return await this.waitForCompletion(runId, waitOptions);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Build submit request from task configuration
   */
  private buildSubmitRequest(task: JobTask, options?: RunOptions): Record<string, unknown> {
    const runName = options?.runName || this.generateRunName();
    const clusterSpec = task.clusterSpec || defaultClusterSpec();

    const request: Record<string, unknown> = {
      run_name: runName,
      tasks: [
        {
          task_key: 'main',
          new_cluster: this.serializeClusterSpec(clusterSpec),
        },
      ],
    };

    // Add timeout if specified
    if (options?.timeoutSeconds) {
      request.timeout_seconds = options.timeoutSeconds;
    } else {
      request.timeout_seconds = 3600; // Default 1 hour
    }

    // Add idempotency token if specified
    if (options?.idempotencyToken) {
      request.idempotency_token = options.idempotencyToken;
    }

    // Add task-specific configuration
    const taskConfig = request.tasks as Array<Record<string, unknown>>;
    switch (task.type) {
      case 'notebook':
        taskConfig[0].notebook_task = {
          notebook_path: task.notebookPath,
          base_parameters: task.baseParameters || {},
        };
        break;

      case 'spark_jar':
        taskConfig[0].spark_jar_task = {
          main_class_name: task.mainClassName,
          jar_uri: task.jarUri,
          parameters: task.parameters || [],
        };
        break;

      case 'spark_python':
        taskConfig[0].spark_python_task = {
          python_file: task.pythonFile,
          parameters: task.parameters || [],
        };
        break;

      case 'spark_submit':
        taskConfig[0].spark_submit_task = {
          parameters: task.parameters,
        };
        break;
    }

    return request;
  }

  /**
   * Serialize cluster specification to API format
   */
  private serializeClusterSpec(spec: ClusterSpec): Record<string, unknown> {
    const cluster: Record<string, unknown> = {
      spark_version: spec.sparkVersion,
      node_type_id: spec.nodeTypeId,
    };

    if (spec.autoscale) {
      cluster.autoscale = {
        min_workers: spec.autoscale.minWorkers,
        max_workers: spec.autoscale.maxWorkers,
      };
    } else if (spec.numWorkers !== undefined) {
      cluster.num_workers = spec.numWorkers;
    }

    if (spec.sparkConf && Object.keys(spec.sparkConf).length > 0) {
      cluster.spark_conf = spec.sparkConf;
    }

    if (spec.sparkEnvVars && Object.keys(spec.sparkEnvVars).length > 0) {
      cluster.spark_env_vars = spec.sparkEnvVars;
    }

    if (spec.initScripts && spec.initScripts.length > 0) {
      cluster.init_scripts = spec.initScripts;
    }

    return cluster;
  }

  /**
   * Parse API response to RunStatus
   */
  private parseRunStatus(response: {
    run_id: number;
    run_name?: string;
    state: {
      life_cycle_state: string;
      result_state?: string;
      state_message?: string;
      user_facing_message?: string;
    };
    start_time?: number;
    setup_duration?: number;
    execution_duration?: number;
    cleanup_duration?: number;
    end_time?: number;
    cluster_instance?: {
      cluster_id: string;
      spark_context_id: string;
    };
    tasks?: Array<{
      run_id: number;
      task_key: string;
      state: {
        life_cycle_state: string;
        result_state?: string;
        state_message?: string;
      };
      start_time?: number;
      end_time?: number;
    }>;
  }): RunStatus {
    return {
      runId: response.run_id,
      runName: response.run_name,
      state: {
        lifeCycleState: response.state.life_cycle_state as RunLifeCycleState,
        resultState: response.state.result_state as RunResultState | undefined,
        stateMessage: response.state.state_message,
        userFacingMessage: response.state.user_facing_message,
      },
      startTime: response.start_time,
      setupDuration: response.setup_duration,
      executionDuration: response.execution_duration,
      cleanupDuration: response.cleanup_duration,
      endTime: response.end_time,
      clusterInstance: response.cluster_instance
        ? {
            clusterId: response.cluster_instance.cluster_id,
            sparkContextId: response.cluster_instance.spark_context_id,
          }
        : undefined,
      tasks: response.tasks?.map((task) => ({
        runId: task.run_id,
        taskKey: task.task_key,
        state: {
          lifeCycleState: task.state.life_cycle_state as RunLifeCycleState,
          resultState: task.state.result_state as RunResultState | undefined,
          stateMessage: task.state.state_message,
        },
        startTime: task.start_time,
        endTime: task.end_time,
      })),
    };
  }

  /**
   * Generate a unique run name
   */
  private generateRunName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `job-run-${timestamp}-${random}`;
  }

  /**
   * Handle and wrap job errors
   */
  private handleJobError(error: unknown, message: string): Error {
    if (error instanceof JobError) {
      return error;
    }

    if (error instanceof Error) {
      // Check for specific error patterns
      if (error.message.includes('cluster') && error.message.includes('not available')) {
        return new ClusterNotAvailable(undefined, { cause: error });
      }
    }

    return new JobError(message, undefined, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Exports - all types and classes are already exported above
// ============================================================================

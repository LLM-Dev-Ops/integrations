/**
 * Agent metrics collector - Tracks agent execution, steps, tools, and memory operations.
 */

/**
 * Agent execution latency buckets (in seconds).
 */
export const AGENT_LATENCY_BUCKETS = [
  0.1,   // 100ms - very fast operations
  0.5,   // 500ms - quick tool calls
  1.0,   // 1s - typical operations
  5.0,   // 5s - complex operations
  10.0,  // 10s - long-running operations
  30.0,  // 30s - very complex workflows
  60.0,  // 60s - extended executions
  300.0  // 5min - maximum expected
];

/**
 * Agent execution parameters for recording metrics.
 */
export interface AgentExecutionParams {
  agentType: string;
  status: string;
  durationMs: number;
  stepCount?: number;
  toolCallCount?: number;
}

/**
 * Minimal MetricsRegistry interface.
 */
interface MetricsRegistry {
  counterVec(config: any): CounterVec;
  histogramVec(config: any): HistogramVec;
  gaugeVec(config: any): GaugeVec;
}

/**
 * Minimal Counter Vector interface.
 */
interface CounterVec {
  labels(labels: Record<string, string>): Counter;
}

/**
 * Minimal Counter interface.
 */
interface Counter {
  inc(value?: number): void;
}

/**
 * Minimal Histogram Vector interface.
 */
interface HistogramVec {
  labels(labels: Record<string, string>): Histogram;
}

/**
 * Minimal Histogram interface.
 */
interface Histogram {
  observe(value: number): void;
}

/**
 * Minimal Gauge Vector interface.
 */
interface GaugeVec {
  labels(labels: Record<string, string>): Gauge;
}

/**
 * Minimal Gauge interface.
 */
interface Gauge {
  inc(value?: number): void;
  dec(value?: number): void;
  set(value: number): void;
}

/**
 * Collector for agent execution metrics.
 */
export class AgentMetricsCollector {
  private readonly executionsTotal: CounterVec;
  private readonly executionDuration: HistogramVec;
  private readonly stepsTotal: CounterVec;
  private readonly stepDuration: HistogramVec;
  private readonly toolCallsTotal: CounterVec;
  private readonly toolCallDuration: HistogramVec;
  private readonly memoryOperations: CounterVec;
  private readonly activeAgents: GaugeVec;
  private readonly agentErrors: CounterVec;

  constructor(registry: MetricsRegistry) {
    // Total number of agent executions
    this.executionsTotal = registry.counterVec({
      name: 'agent_executions_total',
      help: 'Total number of agent executions',
      labelNames: ['agent_type', 'status']
    });

    // Agent execution duration
    this.executionDuration = registry.histogramVec({
      name: 'agent_execution_duration_seconds',
      help: 'Agent execution latency distribution',
      labelNames: ['agent_type'],
      buckets: AGENT_LATENCY_BUCKETS
    });

    // Total agent steps
    this.stepsTotal = registry.counterVec({
      name: 'agent_steps_total',
      help: 'Total number of agent steps executed',
      labelNames: ['agent_type', 'step_type']
    });

    // Step duration
    this.stepDuration = registry.histogramVec({
      name: 'agent_step_duration_seconds',
      help: 'Agent step latency distribution',
      labelNames: ['agent_type', 'step_type'],
      buckets: AGENT_LATENCY_BUCKETS
    });

    // Total tool calls
    this.toolCallsTotal = registry.counterVec({
      name: 'agent_tool_calls_total',
      help: 'Total number of agent tool calls',
      labelNames: ['agent_type', 'tool_name', 'status']
    });

    // Tool call duration
    this.toolCallDuration = registry.histogramVec({
      name: 'agent_tool_call_duration_seconds',
      help: 'Agent tool call latency distribution',
      labelNames: ['agent_type', 'tool_name'],
      buckets: AGENT_LATENCY_BUCKETS
    });

    // Memory operations
    this.memoryOperations = registry.counterVec({
      name: 'agent_memory_operations_total',
      help: 'Total number of agent memory operations',
      labelNames: ['agent_type', 'operation_type']
    });

    // Active agents
    this.activeAgents = registry.gaugeVec({
      name: 'agent_active_count',
      help: 'Number of currently active agents',
      labelNames: ['agent_type']
    });

    // Agent errors
    this.agentErrors = registry.counterVec({
      name: 'agent_errors_total',
      help: 'Total number of agent errors',
      labelNames: ['agent_type', 'error_type']
    });
  }

  /**
   * Record an agent execution completion.
   */
  recordExecution(params: AgentExecutionParams): void {
    // Increment execution counter
    this.executionsTotal.labels({
      agent_type: params.agentType,
      status: params.status
    }).inc();

    // Record execution duration
    this.executionDuration.labels({
      agent_type: params.agentType
    }).observe(params.durationMs / 1000);
  }

  /**
   * Record an agent step.
   */
  recordStep(agentType: string, stepType: string, durationMs: number): void {
    // Increment step counter
    this.stepsTotal.labels({
      agent_type: agentType,
      step_type: stepType
    }).inc();

    // Record step duration
    this.stepDuration.labels({
      agent_type: agentType,
      step_type: stepType
    }).observe(durationMs / 1000);
  }

  /**
   * Record a tool call.
   */
  recordToolCall(
    agentType: string,
    toolName: string,
    durationMs: number,
    success: boolean
  ): void {
    const status = success ? 'success' : 'failure';

    // Increment tool call counter
    this.toolCallsTotal.labels({
      agent_type: agentType,
      tool_name: toolName,
      status
    }).inc();

    // Record tool call duration
    this.toolCallDuration.labels({
      agent_type: agentType,
      tool_name: toolName
    }).observe(durationMs / 1000);
  }

  /**
   * Record a memory operation.
   */
  recordMemoryOperation(agentType: string, operationType: string): void {
    this.memoryOperations.labels({
      agent_type: agentType,
      operation_type: operationType
    }).inc();
  }

  /**
   * Set the number of active agents.
   */
  setActiveAgents(agentType: string, count: number): void {
    this.activeAgents.labels({
      agent_type: agentType
    }).set(count);
  }

  /**
   * Record an agent error.
   */
  recordError(agentType: string, errorType: string): void {
    this.agentErrors.labels({
      agent_type: agentType,
      error_type: errorType
    }).inc();
  }

  /**
   * Track active agent (returns cleanup function).
   */
  trackActiveAgent(agentType: string): () => void {
    const gauge = this.activeAgents.labels({
      agent_type: agentType
    });

    gauge.inc();

    return () => {
      gauge.dec();
    };
  }
}

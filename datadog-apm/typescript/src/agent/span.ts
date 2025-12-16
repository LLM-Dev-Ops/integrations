/**
 * Agent span implementation for Datadog APM
 * Following the SPARC pseudocode specification
 */

import type { Span, TagValue, SpanContext } from '../types/index.js';
import type { AgentSpan, AgentSpanOptions, AgentStepSpanOptions } from './interface.js';

/**
 * Agent semantic tags
 */
export const AGENT_TAGS = {
  NAME: 'agent.name',
  TYPE: 'agent.type',
  STEP: 'agent.step',
  STEP_TYPE: 'agent.step_type',
  TOOL: 'agent.tool',
  PARENT: 'agent.parent',
  PARENT_TRACE_ID: 'agent.parent_trace_id',
  TOTAL_STEPS: 'agent.total_steps',
  STEP_COUNT: 'agent.step_count',
  TOOL_CALL_COUNT: 'agent.tool_call_count',
} as const;

/**
 * Agent metrics
 */
export const AGENT_METRICS = {
  EXECUTIONS: 'agent.executions',
  STEPS: 'agent.steps',
  TOOL_CALLS: 'agent.tool_calls',
  TOOL_DURATION: 'agent.tool_duration',
  ERRORS: 'agent.errors',
  EXECUTION_TIME: 'agent.execution_time',
} as const;

/**
 * Interface for Datadog APM client (minimal needed for Agent span)
 */
export interface DatadogAPMClient {
  startSpan(name: string, options?: any): Span;
  histogram(name: string, value: number, tags?: Record<string, TagValue>): void;
  increment(name: string, value?: number, tags?: Record<string, TagValue>): void;
}

/**
 * Agent span implementation
 */
export class AgentSpanImpl implements AgentSpan {
  private stepCount: number = 0;
  private toolCalls: number = 0;
  private _tags: Record<string, TagValue> = {};
  private finished: boolean = false;

  constructor(
    private baseSpan: Span,
    private client: DatadogAPMClient,
    private agentName: string,
    private agentType: string
  ) {}

  /**
   * Start a step within the agent execution
   */
  startStep(name: string, options: AgentStepSpanOptions): Span {
    this.stepCount++;

    const stepSpan = this.client.startSpan(name, {
      type: 'custom',
      resource: `step.${options.stepNumber}`,
      childOf: this,
      tags: {
        [AGENT_TAGS.STEP]: options.stepNumber,
        [AGENT_TAGS.STEP_TYPE]: options.stepType ?? 'execution',
      },
    });

    if (options.toolName) {
      stepSpan.setTag(AGENT_TAGS.TOOL, options.toolName);
    }

    return stepSpan;
  }

  /**
   * Record a tool call
   */
  recordToolCall(toolName: string, duration: number, success: boolean): AgentSpan {
    this.toolCalls++;

    this.client.increment(AGENT_METRICS.TOOL_CALLS, 1, {
      agent: this.agentName,
      tool: toolName,
      status: success ? 'success' : 'error',
    });

    this.client.histogram(AGENT_METRICS.TOOL_DURATION, duration, {
      agent: this.agentName,
      tool: toolName,
    });

    return this;
  }

  /**
   * Set total steps
   */
  setTotalSteps(count: number): AgentSpan {
    this.setTag(AGENT_TAGS.TOTAL_STEPS, count);
    return this;
  }

  /**
   * Link parent agent
   */
  linkParentAgent(parentAgentSpan: AgentSpan): AgentSpan {
    const parentName = parentAgentSpan.getTag(AGENT_TAGS.NAME);
    if (parentName) {
      this.setTag(AGENT_TAGS.PARENT, parentName);
    }
    this.setTag(AGENT_TAGS.PARENT_TRACE_ID, parentAgentSpan.traceId);
    return this;
  }

  /**
   * Get tag value
   */
  getTag(key: string): string | number | boolean | undefined {
    return this._tags[key];
  }

  // Span interface implementation - delegate to base span
  get traceId(): string {
    return this.baseSpan.traceId;
  }

  get spanId(): string {
    return this.baseSpan.spanId;
  }

  get parentId(): string | undefined {
    return this.baseSpan.parentId;
  }

  get name(): string {
    return this.baseSpan.name;
  }

  get service(): string {
    return this.baseSpan.service;
  }

  get resource(): string {
    return this.baseSpan.resource;
  }

  get startTime(): number {
    return this.baseSpan.startTime;
  }

  get duration(): number | undefined {
    return this.baseSpan.duration;
  }

  get tags(): Record<string, TagValue> {
    return this._tags;
  }

  get error(): number | undefined {
    return this.baseSpan.error;
  }

  get metrics(): Record<string, number> {
    return this.baseSpan.metrics;
  }

  setTag(key: string, value: TagValue): Span {
    this._tags[key] = value;
    this.baseSpan.setTag(key, value);
    return this;
  }

  setError(error: Error): Span {
    this.baseSpan.setError(error);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, TagValue>): Span {
    this.baseSpan.addEvent(name, attributes);
    return this;
  }

  finish(endTime?: number): void {
    if (this.finished) {
      return;
    }

    // Set final counts
    this.setTag(AGENT_TAGS.STEP_COUNT, this.stepCount);
    this.setTag(AGENT_TAGS.TOOL_CALL_COUNT, this.toolCalls);

    // Emit agent metrics
    this.client.increment(AGENT_METRICS.EXECUTIONS, 1, {
      agent: this.agentName,
      type: this.agentType,
    });

    this.client.histogram(AGENT_METRICS.STEPS, this.stepCount, {
      agent: this.agentName,
    });

    this.finished = true;
    this.baseSpan.finish(endTime);
  }

  context(): SpanContext {
    return this.baseSpan.context();
  }
}
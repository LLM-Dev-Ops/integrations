import type {
  Tracer,
  Meter,
  Span,
  Context,
  SpanAttributes,
  MetricAttributes,
  Counter,
  Histogram,
  Link,
  RedactionConfig,
} from '../types/index.js';

/**
 * Semantic Conventions for Gen AI Operations
 */
export const GEN_AI_SYSTEM = 'gen_ai.system';
export const GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
export const GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model';
export const GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const GEN_AI_PROMPT = 'gen_ai.prompt';
export const GEN_AI_COMPLETION = 'gen_ai.completion';
export const GEN_AI_SYSTEM_PROMPT = 'gen_ai.system_prompt';
export const GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
export const GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
export const GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
export const GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
export const GEN_AI_USAGE_TOTAL_TOKENS = 'gen_ai.usage.total_tokens';
export const GEN_AI_RESPONSE_FINISH_REASON = 'gen_ai.response.finish_reason';
export const GEN_AI_LATENCY_MS = 'gen_ai.latency_ms';
export const GEN_AI_TIME_TO_FIRST_TOKEN_MS = 'gen_ai.time_to_first_token_ms';
export const GEN_AI_TOKENS_PER_SECOND = 'gen_ai.tokens_per_second';

/**
 * Semantic Conventions for Agent Operations
 */
export const AGENT_NAME = 'agent.name';
export const AGENT_STEP = 'agent.step';
export const AGENT_STEP_INDEX = 'agent.step.index';
export const AGENT_TOOL_CALL = 'agent.tool.call';
export const AGENT_TOOL_NAME = 'agent.tool.name';
export const AGENT_TOOL_INPUT = 'agent.tool.input';
export const AGENT_MEMORY_QUERY = 'agent.memory.query';
export const AGENT_MEMORY_RESULTS_COUNT = 'agent.memory.results_count';

/**
 * Redacts sensitive information from strings
 */
function redactString(value: string, redactionConfig?: RedactionConfig): string {
  if (!redactionConfig) {
    return value;
  }

  let redacted = value;

  // Apply custom redaction patterns
  if (redactionConfig.customRedactionPatterns) {
    for (const pattern of redactionConfig.customRedactionPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
  }

  return redacted;
}

/**
 * LLM Span Builder
 * Fluent interface for building LLM spans with proper attributes
 */
export class LLMSpanBuilder {
  private attributes: SpanAttributes = {};

  constructor(
    private tracer: Tracer,
    private operation: string,
    private model: string,
    private provider: string,
    private redactionConfig?: RedactionConfig
  ) {
    this.attributes[GEN_AI_SYSTEM] = provider;
    this.attributes[GEN_AI_REQUEST_MODEL] = model;
    this.attributes[GEN_AI_OPERATION_NAME] = operation;
  }

  /**
   * Set the prompt for the LLM call
   * Respects redaction configuration
   */
  withPrompt(prompt: string): this {
    if (this.redactionConfig?.redactPrompts) {
      this.attributes[GEN_AI_PROMPT] = '[REDACTED]';
    } else {
      this.attributes[GEN_AI_PROMPT] = redactString(prompt, this.redactionConfig);
    }
    return this;
  }

  /**
   * Set the max tokens parameter
   */
  withMaxTokens(tokens: number): this {
    this.attributes[GEN_AI_REQUEST_MAX_TOKENS] = tokens;
    return this;
  }

  /**
   * Set the temperature parameter
   */
  withTemperature(temp: number): this {
    this.attributes[GEN_AI_REQUEST_TEMPERATURE] = temp;
    return this;
  }

  /**
   * Set the system prompt
   */
  withSystemPrompt(prompt: string): this {
    if (this.redactionConfig?.redactPrompts) {
      this.attributes[GEN_AI_SYSTEM_PROMPT] = '[REDACTED]';
    } else {
      this.attributes[GEN_AI_SYSTEM_PROMPT] = redactString(prompt, this.redactionConfig);
    }
    return this;
  }

  /**
   * Start the span and return an LLMSpan instance
   */
  start(): LLMSpan {
    const span = this.tracer.startSpan(`${this.operation} ${this.model}`, {
      attributes: this.attributes,
    });
    return new LLMSpan(span, this.redactionConfig);
  }
}

/**
 * LLM Span
 * Wraps an OpenTelemetry span with LLM-specific methods
 */
export class LLMSpan {
  private startTime: number;
  private inputTokens: number = 0;
  private outputTokens: number = 0;

  constructor(
    private span: Span,
    private redactionConfig?: RedactionConfig
  ) {
    this.startTime = Date.now();
  }

  /**
   * Set the LLM response
   */
  setResponse(response: string, finishReason: string): this {
    if (this.redactionConfig?.redactResponses) {
      this.span.setAttribute(GEN_AI_COMPLETION, '[REDACTED]');
    } else {
      this.span.setAttribute(GEN_AI_COMPLETION, redactString(response, this.redactionConfig));
    }
    this.span.setAttribute(GEN_AI_RESPONSE_FINISH_REASON, finishReason);
    return this;
  }

  /**
   * Set token usage information
   */
  setTokenUsage(inputTokens: number, outputTokens: number): this {
    this.inputTokens = inputTokens;
    this.outputTokens = outputTokens;
    this.span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
    this.span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
    this.span.setAttribute(GEN_AI_USAGE_TOTAL_TOKENS, inputTokens + outputTokens);
    return this;
  }

  /**
   * Set the response model (may differ from request model)
   */
  setResponseModel(model: string): this {
    this.span.setAttribute(GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  /**
   * Set time to first token (for streaming)
   */
  setTimeToFirstToken(ms: number): this {
    this.span.setAttribute(GEN_AI_TIME_TO_FIRST_TOKEN_MS, ms);
    return this;
  }

  /**
   * End the span successfully
   */
  end(): void {
    const latencyMs = Date.now() - this.startTime;
    this.span.setAttribute(GEN_AI_LATENCY_MS, latencyMs);
    this.span.setStatus({ code: 1 }); // OK status
    this.span.end();
  }

  /**
   * End the span with an error
   */
  endWithError(error: Error): void {
    const latencyMs = Date.now() - this.startTime;
    this.span.setAttribute(GEN_AI_LATENCY_MS, latencyMs);
    this.span.recordException(error);
    this.span.setStatus({ code: 2, message: error.message }); // ERROR status
    this.span.end();
  }

  /**
   * Get the underlying span
   */
  getSpan(): Span {
    return this.span;
  }
}

/**
 * Streaming LLM Span
 * Extends LLMSpan with streaming-specific functionality
 */
export class StreamingLLMSpan extends LLMSpan {
  private firstTokenTime?: number;
  private tokenCount: number = 0;
  private streamStartTime: number;

  constructor(span: Span, redactionConfig?: RedactionConfig) {
    super(span, redactionConfig);
    this.streamStartTime = Date.now();
  }

  /**
   * Record a token from the stream
   */
  recordToken(token: string): void {
    // Record time to first token
    if (!this.firstTokenTime) {
      this.firstTokenTime = Date.now();
      const timeToFirstToken = this.firstTokenTime - this.streamStartTime;
      this.setTimeToFirstToken(timeToFirstToken);
    }

    this.tokenCount++;
  }

  /**
   * End the streaming span and calculate tokens per second
   */
  end(): void {
    const totalTime = Date.now() - this.streamStartTime;
    const tokensPerSecond = (this.tokenCount / totalTime) * 1000;

    this.getSpan().setAttribute(GEN_AI_TOKENS_PER_SECOND, tokensPerSecond);
    this.getSpan().setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, this.tokenCount);

    super.end();
  }
}

/**
 * Agent Tracer
 * Specialized tracer for agent workflows with steps and tool calls
 */
export class AgentTracer {
  private parentContext?: Context;

  constructor(
    private tracer: Tracer,
    private agentName: string
  ) {}

  /**
   * Set the parent context for all spans
   */
  withParent(context: Context): this {
    this.parentContext = context;
    return this;
  }

  /**
   * Start an agent execution span
   * Returns [span, context] tuple
   */
  startAgentSpan(): [Span, Context] {
    const span = this.tracer.startSpan(`agent.${this.agentName}`, {
      attributes: {
        [AGENT_NAME]: this.agentName,
      },
    }, this.parentContext);

    // Create a context with this span
    const context = this.parentContext || ({} as Context);

    return [span, context];
  }

  /**
   * Trace an agent step
   * Returns [span, context] tuple
   */
  traceStep(context: Context, stepName: string, stepIndex: number): [Span, Context] {
    const span = this.tracer.startSpan(`agent.step.${stepName}`, {
      attributes: {
        [AGENT_NAME]: this.agentName,
        [AGENT_STEP]: stepName,
        [AGENT_STEP_INDEX]: stepIndex,
      },
    }, context);

    return [span, context];
  }

  /**
   * Trace a tool call
   * Returns [span, context] tuple
   */
  traceToolCall(context: Context, toolName: string, toolInput: string): [Span, Context] {
    const span = this.tracer.startSpan(`agent.tool.${toolName}`, {
      attributes: {
        [AGENT_NAME]: this.agentName,
        [AGENT_TOOL_CALL]: true,
        [AGENT_TOOL_NAME]: toolName,
        [AGENT_TOOL_INPUT]: toolInput,
      },
    }, context);

    return [span, context];
  }

  /**
   * Trace a memory retrieval operation
   * Returns [span, context] tuple
   */
  traceMemoryRetrieval(context: Context, query: string, resultsCount: number): [Span, Context] {
    const span = this.tracer.startSpan('agent.memory.retrieval', {
      attributes: {
        [AGENT_NAME]: this.agentName,
        [AGENT_MEMORY_QUERY]: query,
        [AGENT_MEMORY_RESULTS_COUNT]: resultsCount,
      },
    }, context);

    return [span, context];
  }

  /**
   * Link a child agent to a parent agent context
   */
  linkChildAgent(parentContext: Context, childContext: Context): Link {
    // Extract span context from child context
    // This is a simplified implementation - in practice would need proper context API
    const childSpan = childContext.getValue(Symbol.for('OpenTelemetry.Span')) as Span | undefined;

    if (!childSpan) {
      throw new Error('Child context does not contain a span');
    }

    return {
      context: childSpan.spanContext(),
      attributes: {
        'link.type': 'child_agent',
      },
    };
  }
}

/**
 * LLM Metrics
 * Records metrics for LLM operations
 */
export class LLMMetrics {
  private tokenCounter: Counter;
  private requestCounter: Counter;
  private errorCounter: Counter;
  private latencyHistogram: Histogram;
  private costCounter?: Counter;

  constructor(private meter: Meter) {
    this.tokenCounter = meter.createCounter('gen_ai.tokens', {
      description: 'Total tokens used by LLM calls',
      unit: 'tokens',
    });

    this.requestCounter = meter.createCounter('gen_ai.requests', {
      description: 'Total number of LLM requests',
      unit: 'requests',
    });

    this.errorCounter = meter.createCounter('gen_ai.errors', {
      description: 'Total number of LLM errors',
      unit: 'errors',
    });

    this.latencyHistogram = meter.createHistogram('gen_ai.latency', {
      description: 'Latency of LLM requests',
      unit: 'ms',
    });
  }

  /**
   * Record an LLM request
   */
  recordRequest(model: string, inputTokens: number, outputTokens: number, latencyMs: number): void {
    const attributes: MetricAttributes = {
      model,
    };

    this.requestCounter.add(1, attributes);
    this.tokenCounter.add(inputTokens + outputTokens, {
      ...attributes,
      token_type: 'total',
    });
    this.tokenCounter.add(inputTokens, {
      ...attributes,
      token_type: 'input',
    });
    this.tokenCounter.add(outputTokens, {
      ...attributes,
      token_type: 'output',
    });
    this.latencyHistogram.record(latencyMs, attributes);
  }

  /**
   * Record an LLM error
   */
  recordError(model: string, errorType: string): void {
    this.errorCounter.add(1, {
      model,
      error_type: errorType,
    });
  }

  /**
   * Record LLM cost
   */
  recordCost(model: string, cost: number): void {
    if (!this.costCounter) {
      this.costCounter = this.meter.createCounter('gen_ai.cost', {
        description: 'Total cost of LLM requests',
        unit: 'USD',
      });
    }

    this.costCounter.add(cost, { model });
  }
}

/**
 * Create an LLM span builder
 */
export function createLLMSpan(
  tracer: Tracer,
  operation: string,
  model: string,
  provider: string,
  redactionConfig?: RedactionConfig
): LLMSpanBuilder {
  return new LLMSpanBuilder(tracer, operation, model, provider, redactionConfig);
}

/**
 * Create an agent tracer
 */
export function createAgentTracer(tracer: Tracer, agentName: string): AgentTracer {
  return new AgentTracer(tracer, agentName);
}

/**
 * Create LLM metrics recorder
 */
export function createLLMMetrics(meter: Meter): LLMMetrics {
  return new LLMMetrics(meter);
}

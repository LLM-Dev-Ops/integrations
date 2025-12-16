/**
 * LLM semantic tags for Datadog APM
 * Following the SPARC specification for LLM instrumentation
 */

export const LLM_TAGS = {
  PROVIDER: 'llm.provider',
  MODEL: 'llm.model',
  REQUEST_TYPE: 'llm.request_type',
  INPUT_TOKENS: 'llm.input_tokens',
  OUTPUT_TOKENS: 'llm.output_tokens',
  TOTAL_TOKENS: 'llm.total_tokens',
  FINISH_REASON: 'llm.finish_reason',
  STREAMING: 'llm.streaming',
  TEMPERATURE: 'llm.temperature',
  MAX_TOKENS: 'llm.max_tokens',
  TOP_P: 'llm.top_p',
  STREAM_CHUNKS: 'llm.stream_chunks',
  TTFT: 'llm.ttft', // Time to first token
  TOKENS_PER_SECOND: 'llm.tokens_per_second',
  COST: 'llm.cost',
} as const;

export const LLM_METRICS = {
  TOKENS_INPUT: 'llm.tokens.input',
  TOKENS_OUTPUT: 'llm.tokens.output',
  REQUEST_LATENCY: 'llm.request.latency',
  REQUESTS: 'llm.requests',
  TTFT: 'llm.ttft',
  TOKENS_PER_SECOND: 'llm.tokens_per_second',
  COST: 'llm.cost',
} as const;
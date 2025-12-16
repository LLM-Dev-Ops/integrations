/**
 * Agent step tracing helpers
 */

import type { AgentSpan, AgentStepSpanOptions } from './interface.js';
import type { Span } from '../types/index.js';

/**
 * Step execution result
 */
export interface StepResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

/**
 * Trace an agent step
 * @param agentSpan - Parent agent span
 * @param stepName - Step name
 * @param options - Step options
 * @param fn - Step function to execute
 * @returns Step result
 */
export async function traceStep<T>(
  agentSpan: AgentSpan,
  stepName: string,
  options: AgentStepSpanOptions,
  fn: (stepSpan: Span) => Promise<T>
): Promise<StepResult<T>> {
  const stepSpan = agentSpan.startStep(stepName, options);
  const startTime = performance.now();

  try {
    const result = await fn(stepSpan);
    const duration = performance.now() - startTime;

    stepSpan.finish();

    return {
      success: true,
      result,
      duration,
    };
  } catch (error) {
    const duration = performance.now() - startTime;

    stepSpan.setError(error as Error);
    stepSpan.finish();

    return {
      success: false,
      error: error as Error,
      duration,
    };
  }
}

/**
 * Trace multiple agent steps sequentially
 * @param agentSpan - Parent agent span
 * @param steps - Array of step configurations
 * @returns Array of step results
 */
export async function traceSteps<T = any>(
  agentSpan: AgentSpan,
  steps: Array<{
    name: string;
    options: AgentStepSpanOptions;
    fn: (stepSpan: Span) => Promise<T>;
  }>
): Promise<StepResult<T>[]> {
  const results: StepResult<T>[] = [];

  for (const step of steps) {
    const result = await traceStep(agentSpan, step.name, step.options, step.fn);
    results.push(result);

    // Stop if a step fails
    if (!result.success) {
      break;
    }
  }

  agentSpan.setTotalSteps(steps.length);

  return results;
}
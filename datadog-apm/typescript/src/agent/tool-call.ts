/**
 * Tool call instrumentation for agents
 */

import type { AgentSpan } from './interface.js';
import type { Span } from '../types/index.js';

/**
 * Tool call result
 */
export interface ToolCallResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

/**
 * Tool call instrumentor
 */
export class ToolCallInstrumentor {
  /**
   * Instrument a tool call
   * @param agentSpan - Agent span
   * @param toolName - Tool name
   * @param fn - Tool function to execute
   * @returns Tool call result
   */
  static async instrument<T>(
    agentSpan: AgentSpan,
    toolName: string,
    fn: () => Promise<T>
  ): Promise<ToolCallResult<T>> {
    const startTime = performance.now();

    try {
      const result = await fn();
      const duration = performance.now() - startTime;

      agentSpan.recordToolCall(toolName, duration, true);

      return {
        success: true,
        result,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;

      agentSpan.recordToolCall(toolName, duration, false);

      return {
        success: false,
        error: error as Error,
        duration,
      };
    }
  }

  /**
   * Instrument a tool call with a custom span
   * @param agentSpan - Agent span
   * @param toolName - Tool name
   * @param fn - Tool function that receives a span
   * @param createSpan - Function to create a span
   * @returns Tool call result
   */
  static async instrumentWithSpan<T>(
    agentSpan: AgentSpan,
    toolName: string,
    fn: (span: Span) => Promise<T>,
    createSpan: (name: string) => Span
  ): Promise<ToolCallResult<T>> {
    const toolSpan = createSpan(`tool.${toolName}`);
    toolSpan.setTag('tool.name', toolName);
    toolSpan.setTag('agent.name', agentSpan.getTag('agent.name')!);

    const startTime = performance.now();

    try {
      const result = await fn(toolSpan);
      const duration = performance.now() - startTime;

      agentSpan.recordToolCall(toolName, duration, true);
      toolSpan.finish();

      return {
        success: true,
        result,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;

      agentSpan.recordToolCall(toolName, duration, false);
      toolSpan.setError(error as Error);
      toolSpan.finish();

      return {
        success: false,
        error: error as Error,
        duration,
      };
    }
  }
}
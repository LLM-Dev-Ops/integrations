/**
 * Agent span interfaces for Datadog APM
 * Following the SPARC specification
 */

import type { Span } from '../types/index.js';

/**
 * Options for creating an agent span
 */
export interface AgentSpanOptions {
  agentName: string;
  agentType?: string;
  parentSpan?: Span;
}

/**
 * Options for creating an agent step span
 */
export interface AgentStepSpanOptions {
  stepNumber: number;
  stepType?: string;
  toolName?: string;
}

/**
 * Agent span interface extending base Span
 */
export interface AgentSpan extends Span {
  /**
   * Start a new step within the agent execution
   * @param name - Step name
   * @param options - Step options
   * @returns Span for the step
   */
  startStep(name: string, options: AgentStepSpanOptions): Span;

  /**
   * Record a tool call made by the agent
   * @param toolName - Name of the tool
   * @param duration - Duration in milliseconds
   * @param success - Whether the call succeeded
   */
  recordToolCall(toolName: string, duration: number, success: boolean): AgentSpan;

  /**
   * Set the total number of steps
   * @param count - Total step count
   */
  setTotalSteps(count: number): AgentSpan;

  /**
   * Link to a parent agent span
   * @param parentAgentSpan - Parent agent span
   */
  linkParentAgent(parentAgentSpan: AgentSpan): AgentSpan;

  /**
   * Get the tag value for a given key
   * @param key - Tag key to retrieve
   */
  getTag(key: string): string | number | boolean | undefined;
}
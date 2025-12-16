/**
 * Agent correlation manager for tracking multi-agent traces
 */

import type { AgentSpan } from './interface.js';
import type { SpanContext } from '../types/index.js';

/**
 * Agent correlation data
 */
export interface AgentCorrelation {
  agentName: string;
  agentType: string;
  traceId: string;
  spanId: string;
  parentAgentName?: string;
  parentTraceId?: string;
}

/**
 * Manager for correlating multi-agent traces
 */
export class AgentCorrelationManager {
  private correlations: Map<string, AgentCorrelation> = new Map();

  /**
   * Register an agent span for correlation
   * @param agentSpan - Agent span to register
   */
  register(agentSpan: AgentSpan): void {
    const agentName = agentSpan.getTag('agent.name') as string;
    const agentType = agentSpan.getTag('agent.type') as string;
    const parentAgentName = agentSpan.getTag('agent.parent') as string | undefined;
    const parentTraceId = agentSpan.getTag('agent.parent_trace_id') as string | undefined;

    const correlation: AgentCorrelation = {
      agentName,
      agentType,
      traceId: agentSpan.traceId,
      spanId: agentSpan.spanId,
      parentAgentName,
      parentTraceId,
    };

    this.correlations.set(agentSpan.spanId, correlation);
  }

  /**
   * Get correlation data for a span
   * @param spanId - Span ID
   * @returns Correlation data or undefined
   */
  getCorrelation(spanId: string): AgentCorrelation | undefined {
    return this.correlations.get(spanId);
  }

  /**
   * Get all correlations for a trace
   * @param traceId - Trace ID
   * @returns Array of correlations
   */
  getTraceCorrelations(traceId: string): AgentCorrelation[] {
    return Array.from(this.correlations.values()).filter(
      (c) => c.traceId === traceId || c.parentTraceId === traceId
    );
  }

  /**
   * Get child agents for a parent agent
   * @param parentAgentName - Parent agent name
   * @returns Array of child correlations
   */
  getChildAgents(parentAgentName: string): AgentCorrelation[] {
    return Array.from(this.correlations.values()).filter(
      (c) => c.parentAgentName === parentAgentName
    );
  }

  /**
   * Clear correlation data
   */
  clear(): void {
    this.correlations.clear();
  }

  /**
   * Remove old correlations
   * @param maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge: number = 3600000): void {
    // This is a simple implementation
    // In production, you'd track timestamps and remove old entries
    if (this.correlations.size > 10000) {
      this.correlations.clear();
    }
  }
}
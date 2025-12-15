/**
 * Trace Correlation Module
 *
 * Handles trace context propagation and correlation for Cloud Logging.
 * Following the SPARC specification.
 */

import type { LogEntry, SpanNode } from "../types/index.js";

/**
 * Trace context information.
 */
export interface TraceContext {
  /** Trace ID. */
  traceId: string;
  /** Span ID. */
  spanId?: string;
  /** Whether the trace is sampled. */
  sampled?: boolean;
}

/**
 * Global trace context storage (async local storage pattern).
 */
let currentContext: TraceContext | undefined;

/**
 * Set the current trace context.
 */
export function setTraceContext(context: TraceContext | undefined): void {
  currentContext = context;
}

/**
 * Get the current trace context.
 */
export function getTraceContext(): TraceContext | undefined {
  return currentContext;
}

/**
 * Run a function with a specific trace context.
 */
export async function withTraceContext<T>(
  context: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  const previous = currentContext;
  currentContext = context;
  try {
    return await fn();
  } finally {
    currentContext = previous;
  }
}

/**
 * Format trace ID for Cloud Logging.
 */
export function formatTraceId(projectId: string, traceId: string): string {
  return `projects/${projectId}/traces/${traceId}`;
}

/**
 * Parse trace ID from Cloud Logging format.
 */
export function parseTraceId(trace: string): { projectId: string; traceId: string } | undefined {
  const match = trace.match(/^projects\/([^/]+)\/traces\/(.+)$/);
  if (match?.[1] && match[2]) {
    return {
      projectId: match[1],
      traceId: match[2],
    };
  }
  return undefined;
}

/**
 * Generate a unique insert ID for deduplication.
 */
export function generateInsertId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Enrich a log entry with trace context.
 */
export function enrichWithTraceContext(
  entry: LogEntry,
  projectId: string,
  context?: TraceContext
): LogEntry {
  const ctx = context ?? currentContext;
  if (!ctx) {
    return entry;
  }

  return {
    ...entry,
    trace: formatTraceId(projectId, ctx.traceId),
    spanId: ctx.spanId ?? entry.spanId,
    traceSampled: ctx.sampled ?? entry.traceSampled,
  };
}

/**
 * Build a span tree from log entries.
 */
export function buildSpanTree(entries: LogEntry[]): SpanNode {
  const root: SpanNode = {
    spanId: "root",
    entries: [],
    children: [],
  };

  // Group entries by span ID
  const spanGroups = new Map<string, LogEntry[]>();
  const entriesWithoutSpan: LogEntry[] = [];

  for (const entry of entries) {
    if (entry.spanId) {
      const existing = spanGroups.get(entry.spanId);
      if (existing) {
        existing.push(entry);
      } else {
        spanGroups.set(entry.spanId, [entry]);
      }
    } else {
      entriesWithoutSpan.push(entry);
    }
  }

  // Create span nodes
  const spanNodes = new Map<string, SpanNode>();
  for (const [spanId, spanEntries] of spanGroups) {
    const service = detectService(spanEntries);
    spanNodes.set(spanId, {
      spanId,
      service,
      entries: spanEntries,
      children: [],
    });
  }

  // For now, add all spans as children of root (parent-child detection would
  // require additional metadata not always present in log entries)
  for (const node of spanNodes.values()) {
    root.children.push(node);
  }

  // Add entries without span to root
  root.entries = entriesWithoutSpan;

  return root;
}

/**
 * Detect service name from log entries.
 */
function detectService(entries: LogEntry[]): string | undefined {
  for (const entry of entries) {
    // Check labels for service name
    if (entry.labels["service"]) {
      return entry.labels["service"];
    }
    if (entry.labels["k8s-pod/app"]) {
      return entry.labels["k8s-pod/app"];
    }

    // Check resource labels
    if (entry.resource?.labels["service_name"]) {
      return entry.resource.labels["service_name"];
    }
    if (entry.resource?.labels["container_name"]) {
      return entry.resource.labels["container_name"];
    }
  }
  return undefined;
}

/**
 * Extract unique services from log entries.
 */
export function extractServices(entries: LogEntry[]): string[] {
  const services = new Set<string>();

  for (const entry of entries) {
    // Check labels
    if (entry.labels["service"]) {
      services.add(entry.labels["service"]);
    }
    if (entry.labels["k8s-pod/app"]) {
      services.add(entry.labels["k8s-pod/app"]);
    }

    // Check resource labels
    if (entry.resource?.labels["service_name"]) {
      services.add(entry.resource.labels["service_name"]);
    }
    if (entry.resource?.labels["container_name"]) {
      services.add(entry.resource.labels["container_name"]);
    }
  }

  return Array.from(services);
}

/**
 * Parse W3C trace context header.
 */
export function parseTraceparent(header: string): TraceContext | undefined {
  // Format: version-traceId-spanId-flags
  // Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
  const parts = header.split("-");
  if (parts.length !== 4) {
    return undefined;
  }

  const [version, traceId, spanId, flags] = parts;
  if (version !== "00" || !traceId || !spanId || !flags) {
    return undefined;
  }

  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}

/**
 * Format W3C trace context header.
 */
export function formatTraceparent(context: TraceContext): string {
  const flags = context.sampled ? "01" : "00";
  return `00-${context.traceId}-${context.spanId ?? "0000000000000000"}-${flags}`;
}

/**
 * Parse Cloud Trace context header (X-Cloud-Trace-Context).
 */
export function parseCloudTraceContext(header: string): TraceContext | undefined {
  // Format: TRACE_ID/SPAN_ID;o=TRACE_TRUE
  // Example: 105445aa7843bc8bf206b12000100000/1;o=1
  const match = header.match(/^([a-f0-9]+)(?:\/(\d+))?(?:;o=(\d))?$/);
  if (!match?.[1]) {
    return undefined;
  }

  return {
    traceId: match[1],
    spanId: match[2],
    sampled: match[3] === "1",
  };
}

/**
 * Format Cloud Trace context header.
 */
export function formatCloudTraceContext(context: TraceContext): string {
  let header = context.traceId;
  if (context.spanId) {
    header += `/${context.spanId}`;
  }
  if (context.sampled !== undefined) {
    header += `;o=${context.sampled ? "1" : "0"}`;
  }
  return header;
}

/**
 * Common Types for Google Cloud Logging
 *
 * Following the SPARC specification.
 */

/**
 * Severity levels for log entries.
 * Values match the Cloud Logging API severity values.
 */
export enum Severity {
  /** Unspecified log level. */
  DEFAULT = 0,
  /** Debug or trace information. */
  DEBUG = 100,
  /** Routine information. */
  INFO = 200,
  /** Normal but significant events. */
  NOTICE = 300,
  /** Warning events. */
  WARNING = 400,
  /** Error events. */
  ERROR = 500,
  /** Critical events. */
  CRITICAL = 600,
  /** Action must be taken immediately. */
  ALERT = 700,
  /** System is unusable. */
  EMERGENCY = 800,
}

/**
 * Severity string type for flexible input.
 */
export type SeverityString =
  | "DEFAULT"
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARNING"
  | "ERROR"
  | "CRITICAL"
  | "ALERT"
  | "EMERGENCY";

/**
 * Convert severity string to enum value.
 */
export function parseSeverity(severity: string | number): Severity {
  if (typeof severity === "number") {
    return severity as Severity;
  }

  const upper = severity.toUpperCase();
  switch (upper) {
    case "DEFAULT":
      return Severity.DEFAULT;
    case "DEBUG":
      return Severity.DEBUG;
    case "INFO":
      return Severity.INFO;
    case "NOTICE":
      return Severity.NOTICE;
    case "WARNING":
    case "WARN":
      return Severity.WARNING;
    case "ERROR":
      return Severity.ERROR;
    case "CRITICAL":
      return Severity.CRITICAL;
    case "ALERT":
      return Severity.ALERT;
    case "EMERGENCY":
      return Severity.EMERGENCY;
    default:
      return Severity.DEFAULT;
  }
}

/**
 * Convert severity enum to string name.
 */
export function severityToString(severity: Severity): SeverityString {
  switch (severity) {
    case Severity.DEFAULT:
      return "DEFAULT";
    case Severity.DEBUG:
      return "DEBUG";
    case Severity.INFO:
      return "INFO";
    case Severity.NOTICE:
      return "NOTICE";
    case Severity.WARNING:
      return "WARNING";
    case Severity.ERROR:
      return "ERROR";
    case Severity.CRITICAL:
      return "CRITICAL";
    case Severity.ALERT:
      return "ALERT";
    case Severity.EMERGENCY:
      return "EMERGENCY";
    default:
      return "DEFAULT";
  }
}

/**
 * Monitored resource descriptor.
 */
export interface MonitoredResource {
  /** Resource type (e.g., "global", "gce_instance", "k8s_container"). */
  type: string;
  /** Resource labels. */
  labels: Record<string, string>;
}

/**
 * Create a global resource.
 */
export function globalResource(projectId: string): MonitoredResource {
  return {
    type: "global",
    labels: {
      project_id: projectId,
    },
  };
}

/**
 * Create a GCE instance resource.
 */
export function gceInstanceResource(
  projectId: string,
  zone: string,
  instanceId: string
): MonitoredResource {
  return {
    type: "gce_instance",
    labels: {
      project_id: projectId,
      zone,
      instance_id: instanceId,
    },
  };
}

/**
 * Create a Kubernetes container resource.
 */
export function k8sContainerResource(
  projectId: string,
  location: string,
  clusterName: string,
  namespace: string,
  podName: string,
  containerName: string
): MonitoredResource {
  return {
    type: "k8s_container",
    labels: {
      project_id: projectId,
      location,
      cluster_name: clusterName,
      namespace_name: namespace,
      pod_name: podName,
      container_name: containerName,
    },
  };
}

/**
 * Create a Cloud Run revision resource.
 */
export function cloudRunRevisionResource(
  projectId: string,
  location: string,
  serviceName: string,
  revisionName: string
): MonitoredResource {
  return {
    type: "cloud_run_revision",
    labels: {
      project_id: projectId,
      location,
      service_name: serviceName,
      revision_name: revisionName,
    },
  };
}

/**
 * Source location information.
 */
export interface SourceLocation {
  /** Source file name. */
  file: string;
  /** Line number within the source file. */
  line: number;
  /** Function name. */
  function: string;
}

/**
 * Log entry operation metadata.
 */
export interface LogEntryOperation {
  /** Operation identifier. */
  id: string;
  /** Producer of the operation. */
  producer: string;
  /** Whether this is the first entry in the operation. */
  first: boolean;
  /** Whether this is the last entry in the operation. */
  last: boolean;
}

/**
 * HTTP request metadata for log entries.
 */
export interface HttpRequest {
  /** Request method (GET, POST, etc.). */
  requestMethod: string;
  /** Request URL. */
  requestUrl: string;
  /** Request size in bytes. */
  requestSize?: number;
  /** Response status code. */
  status?: number;
  /** Response size in bytes. */
  responseSize?: number;
  /** User agent string. */
  userAgent?: string;
  /** Remote IP address. */
  remoteIp?: string;
  /** Server IP address. */
  serverIp?: string;
  /** Referer URL. */
  referer?: string;
  /** Request latency in seconds with up to nine fractional digits. */
  latency?: string;
  /** Whether response was from cache. */
  cacheLookup?: boolean;
  /** Whether response was served from cache. */
  cacheHit?: boolean;
  /** Whether response was validated with origin server. */
  cacheValidatedWithOriginServer?: boolean;
  /** Number of bytes in cache response. */
  cacheFillBytes?: number;
  /** Protocol used for the request. */
  protocol?: string;
}

/**
 * Log entry structure.
 */
export interface LogEntry {
  /** Full log name (projects/{project}/logs/{log_id}). */
  logName?: string;
  /** Monitored resource. */
  resource?: MonitoredResource;
  /** Entry timestamp (ISO 8601 format). */
  timestamp?: string;
  /** Receive timestamp (ISO 8601 format). */
  receiveTimestamp?: string;
  /** Log severity. */
  severity: Severity | SeverityString | string;
  /** Unique entry ID for deduplication. */
  insertId?: string;
  /** User-defined labels. */
  labels: Record<string, string>;
  /** Text payload. */
  textPayload?: string;
  /** JSON payload. */
  jsonPayload?: Record<string, unknown>;
  /** Proto payload (base64 encoded). */
  protoPayload?: {
    "@type": string;
    [key: string]: unknown;
  };
  /** HTTP request metadata. */
  httpRequest?: HttpRequest;
  /** Trace resource name. */
  trace?: string;
  /** Span ID within the trace. */
  spanId?: string;
  /** Whether the trace is sampled. */
  traceSampled?: boolean;
  /** Source code location. */
  sourceLocation?: SourceLocation;
  /** Operation metadata. */
  operation?: LogEntryOperation;
}

/**
 * Create a basic log entry.
 */
export function createLogEntry(
  severity: Severity | SeverityString,
  payload: string | Record<string, unknown>,
  options?: {
    labels?: Record<string, string>;
    trace?: string;
    spanId?: string;
    insertId?: string;
  }
): LogEntry {
  const entry: LogEntry = {
    severity,
    labels: options?.labels ?? {},
  };

  if (typeof payload === "string") {
    entry.textPayload = payload;
  } else {
    entry.jsonPayload = payload;
  }

  if (options?.trace) {
    entry.trace = options.trace;
  }

  if (options?.spanId) {
    entry.spanId = options.spanId;
  }

  if (options?.insertId) {
    entry.insertId = options.insertId;
  }

  return entry;
}

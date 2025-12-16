/**
 * Minimal MetricsRegistry interface for health checks.
 */
interface MetricsRegistry {
  gather(): Promise<any[]>;
}

/**
 * Health check response.
 */
export interface HealthResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

/**
 * Simple health check - always returns OK.
 */
export function handleHealth(): HealthResponse {
  return {
    status: 200,
    body: 'OK',
    headers: { 'Content-Type': 'text/plain' }
  };
}

/**
 * Readiness check - verifies metrics collection is working.
 */
export async function handleReady(
  registry: MetricsRegistry,
  timeout: number = 5000
): Promise<HealthResponse> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeout)
    );
    await Promise.race([registry.gather(), timeoutPromise]);
    return {
      status: 200,
      body: 'Ready',
      headers: { 'Content-Type': 'text/plain' }
    };
  } catch {
    return {
      status: 503,
      body: 'Not Ready',
      headers: { 'Content-Type': 'text/plain' }
    };
  }
}

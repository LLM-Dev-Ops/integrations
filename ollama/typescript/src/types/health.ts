/**
 * Ollama Integration - Health Status Types
 *
 * Types for server health checking.
 * Based on SPARC specification for Ollama health monitoring.
 */

/**
 * Health status
 *
 * Indicates whether the Ollama server is running and accessible.
 */
export interface HealthStatus {
  /**
   * Server running status
   *
   * True if the server is reachable and responding.
   */
  running: boolean;

  /**
   * Ollama server version
   *
   * Version string if available from server response.
   */
  version?: string;
}

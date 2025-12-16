/**
 * Client interface for Amazon ECR.
 *
 * This module provides the interface for ECR client operations,
 * allowing for dependency injection and testing.
 *
 * @module types/client
 */

/**
 * Interface for ECR client operations.
 * This allows services to be decoupled from the actual AWS SDK implementation.
 */
export interface EcrClientInterface {
  /**
   * Send a request to the ECR API.
   *
   * @param operation - The ECR operation name
   * @param request - The request payload
   * @returns The response from ECR
   */
  send<TRequest, TResponse>(operation: string, request: TRequest): Promise<TResponse>;
}

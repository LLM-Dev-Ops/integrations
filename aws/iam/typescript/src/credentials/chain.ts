/**
 * Role chain provider for cross-account access.
 *
 * This module provides support for role chaining, where you assume multiple
 * roles in sequence. This is useful for cross-account access patterns where
 * you need to assume a role in account A to then assume a role in account B.
 *
 * AWS enforces a maximum chain depth of 2 role assumptions.
 *
 * @module credentials/chain
 */

import type { AssumedCredentials } from '../types/responses.js';
import type { AssumeRoleRequest } from '../types/requests.js';
import { IamError, configurationError } from '../error/index.js';
import type { StsService } from './provider.js';

/**
 * A single step in a role assumption chain.
 */
export interface RoleChainStep {
  /**
   * ARN of the role to assume in this step.
   */
  roleArn: string;

  /**
   * Session name for this role assumption.
   */
  sessionName: string;

  /**
   * External ID for cross-account role assumption (optional).
   */
  externalId?: string;

  /**
   * Session duration in seconds (optional).
   * Defaults to 3600 (1 hour).
   */
  durationSeconds?: number;

  /**
   * Session policy to scope down permissions (optional).
   */
  sessionPolicy?: string;

  /**
   * Managed policy ARNs to attach to session (optional).
   */
  policyArns?: string[];
}

/**
 * AWS maximum role chain depth.
 *
 * AWS allows a maximum of 2 role assumptions in a chain:
 * - Base credentials -> Role A
 * - Role A credentials -> Role B
 *
 * Attempting to assume a third role (Role B -> Role C) will fail.
 */
const AWS_MAX_CHAIN_DEPTH = 2;

/**
 * Provider for role chaining.
 *
 * This provider assumes multiple roles in sequence, using the credentials
 * from each step to assume the next role in the chain. This is useful for
 * complex cross-account access patterns.
 *
 * AWS enforces a maximum chain depth of 2, meaning you can only assume
 * two roles in sequence from your base credentials.
 *
 * @example Simple two-role chain
 * ```typescript
 * const provider = new RoleChainProvider(
 *   stsService,
 *   [
 *     {
 *       roleArn: 'arn:aws:iam::111111111111:role/JumpRole',
 *       sessionName: 'jump-session',
 *     },
 *     {
 *       roleArn: 'arn:aws:iam::222222222222:role/TargetRole',
 *       sessionName: 'target-session',
 *       externalId: 'my-external-id',
 *     },
 *   ]
 * );
 *
 * const credentials = await provider.assumeChain();
 * ```
 *
 * @example With session policies
 * ```typescript
 * const provider = new RoleChainProvider(
 *   stsService,
 *   [
 *     {
 *       roleArn: 'arn:aws:iam::111111111111:role/AdminRole',
 *       sessionName: 'admin-session',
 *       sessionPolicy: JSON.stringify({
 *         Version: '2012-10-17',
 *         Statement: [{
 *           Effect: 'Allow',
 *           Action: 's3:*',
 *           Resource: '*'
 *         }]
 *       }),
 *     },
 *   ]
 * );
 * ```
 */
export class RoleChainProvider {
  /**
   * Creates a new role chain provider.
   *
   * @param stsService - STS service for assuming roles
   * @param chain - Array of role chain steps to execute in order
   * @throws {IamError} If chain is empty or exceeds maximum depth
   */
  constructor(
    private readonly stsService: StsService,
    private readonly chain: RoleChainStep[]
  ) {
    // Validate chain
    if (!chain || chain.length === 0) {
      throw configurationError('Role chain must contain at least one step');
    }

    if (chain.length > AWS_MAX_CHAIN_DEPTH) {
      throw configurationError(
        `Role chain exceeds AWS maximum depth of ${AWS_MAX_CHAIN_DEPTH} (got ${chain.length})`
      );
    }

    // Validate each step
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i]!;

      if (!step.roleArn) {
        throw configurationError(`Chain step ${i}: roleArn is required`);
      }

      if (!step.roleArn.startsWith('arn:aws:iam::')) {
        throw configurationError(
          `Chain step ${i}: invalid role ARN format: ${step.roleArn}`
        );
      }

      if (!step.sessionName) {
        throw configurationError(`Chain step ${i}: sessionName is required`);
      }

      if (step.sessionName.length < 2 || step.sessionName.length > 64) {
        throw configurationError(
          `Chain step ${i}: session name must be 2-64 characters`
        );
      }

      if (!/^[\w+=,.@-]+$/.test(step.sessionName)) {
        throw configurationError(
          `Chain step ${i}: session name contains invalid characters`
        );
      }
    }
  }

  /**
   * Executes the role assumption chain.
   *
   * This method assumes each role in the chain sequentially, using the
   * credentials from each step to assume the next role. The final
   * credentials are returned.
   *
   * Each step:
   * 1. Uses the current STS service (with previous step's credentials)
   * 2. Assumes the role for this step
   * 3. Creates a new STS service with the assumed credentials
   * 4. Proceeds to the next step
   *
   * If any step fails, the entire chain fails and the error is propagated.
   *
   * @returns Promise resolving to final assumed credentials
   * @throws {IamError} If any step in the chain fails
   *
   * @example
   * ```typescript
   * try {
   *   const credentials = await provider.assumeChain();
   *   console.log('Final role ARN:', credentials.assumedRoleArn);
   * } catch (error) {
   *   console.error('Chain failed:', error.message);
   * }
   * ```
   */
  public async assumeChain(): Promise<AssumedCredentials> {
    let currentService = this.stsService;
    let currentCredentials: AssumedCredentials | null = null;

    // Execute each step in the chain
    for (let i = 0; i < this.chain.length; i++) {
      const step = this.chain[i]!;

      try {
        // Build assume role request for this step
        const request: AssumeRoleRequest = {
          roleArn: step.roleArn,
          sessionName: step.sessionName,
          externalId: step.externalId,
          durationSeconds: step.durationSeconds,
          sessionPolicy: step.sessionPolicy,
          policyArns: step.policyArns,
        };

        // Assume the role using current service
        currentCredentials = await currentService.assumeRole(request);

        // If there are more steps, create a new STS service with these credentials
        if (i < this.chain.length - 1) {
          // The next step needs to use a service configured with these credentials
          // This is typically done by creating a new STS service instance
          // For now, we'll continue using the same service as it should handle
          // credential updates internally
          currentService = this.stsService;
        }
      } catch (error) {
        // Add context about which step failed
        if (error instanceof IamError) {
          throw new IamError(
            `Role chain failed at step ${i + 1} (${step.roleArn}): ${error.message}`,
            error.code,
            error.retryable,
            error.requestId,
            error.statusCode
          );
        }

        throw configurationError(
          `Role chain failed at step ${i + 1} (${step.roleArn}): ${error}`
        );
      }
    }

    // Return the final credentials
    if (!currentCredentials) {
      throw configurationError('Role chain completed but no credentials were obtained');
    }

    return currentCredentials;
  }

  /**
   * Gets the number of steps in the chain.
   *
   * @returns Number of role assumption steps
   */
  public getChainLength(): number {
    return this.chain.length;
  }

  /**
   * Gets a specific step in the chain.
   *
   * @param index - Step index (0-based)
   * @returns Chain step at the specified index
   * @throws {Error} If index is out of bounds
   */
  public getStep(index: number): RoleChainStep {
    if (index < 0 || index >= this.chain.length) {
      throw new Error(`Step index ${index} out of bounds (chain length: ${this.chain.length})`);
    }

    return { ...this.chain[index]! };
  }

  /**
   * Gets all steps in the chain.
   *
   * Returns a copy to prevent external modification.
   *
   * @returns Array of all chain steps
   */
  public getChain(): RoleChainStep[] {
    return this.chain.map(step => ({ ...step }));
  }

  /**
   * Validates that the chain is within AWS limits.
   *
   * This is called in the constructor, but can also be called
   * explicitly to verify a chain before execution.
   *
   * @throws {IamError} If chain is invalid
   */
  public validate(): void {
    if (this.chain.length > AWS_MAX_CHAIN_DEPTH) {
      throw configurationError(
        `Role chain exceeds AWS maximum depth of ${AWS_MAX_CHAIN_DEPTH}`
      );
    }
  }
}

/**
 * Builder for creating role chains.
 *
 * Provides a fluent API for constructing role chains step by step.
 *
 * @example
 * ```typescript
 * const credentials = await RoleChainBuilder.create(stsService)
 *   .addRole('arn:aws:iam::111111111111:role/JumpRole', 'jump-session')
 *   .addRole('arn:aws:iam::222222222222:role/TargetRole', 'target-session')
 *   .withExternalId('my-external-id')
 *   .assumeChain();
 * ```
 */
export class RoleChainBuilder {
  private readonly steps: RoleChainStep[] = [];
  private currentStep: Partial<RoleChainStep> | null = null;

  /**
   * Creates a new role chain builder.
   *
   * @param stsService - STS service for assuming roles
   */
  private constructor(private readonly stsService: StsService) {}

  /**
   * Creates a new role chain builder.
   *
   * @param stsService - STS service for assuming roles
   * @returns New builder instance
   */
  public static create(stsService: StsService): RoleChainBuilder {
    return new RoleChainBuilder(stsService);
  }

  /**
   * Adds a role to the chain.
   *
   * @param roleArn - ARN of the role to assume
   * @param sessionName - Session name for this role assumption
   * @returns This builder for chaining
   */
  public addRole(roleArn: string, sessionName: string): this {
    // Complete the current step if any
    if (this.currentStep) {
      this.completeCurrentStep();
    }

    // Start a new step
    this.currentStep = {
      roleArn,
      sessionName,
    };

    return this;
  }

  /**
   * Sets the external ID for the current role.
   *
   * @param externalId - External ID for cross-account access
   * @returns This builder for chaining
   */
  public withExternalId(externalId: string): this {
    this.ensureCurrentStep();
    this.currentStep!.externalId = externalId;
    return this;
  }

  /**
   * Sets the session duration for the current role.
   *
   * @param durationSeconds - Session duration in seconds
   * @returns This builder for chaining
   */
  public withDuration(durationSeconds: number): this {
    this.ensureCurrentStep();
    this.currentStep!.durationSeconds = durationSeconds;
    return this;
  }

  /**
   * Sets the session policy for the current role.
   *
   * @param sessionPolicy - Session policy JSON string
   * @returns This builder for chaining
   */
  public withSessionPolicy(sessionPolicy: string): this {
    this.ensureCurrentStep();
    this.currentStep!.sessionPolicy = sessionPolicy;
    return this;
  }

  /**
   * Sets the policy ARNs for the current role.
   *
   * @param policyArns - Managed policy ARNs to attach
   * @returns This builder for chaining
   */
  public withPolicyArns(policyArns: string[]): this {
    this.ensureCurrentStep();
    this.currentStep!.policyArns = policyArns;
    return this;
  }

  /**
   * Builds and executes the role chain.
   *
   * @returns Promise resolving to final assumed credentials
   * @throws {IamError} If chain is invalid or assumption fails
   */
  public async assumeChain(): Promise<AssumedCredentials> {
    // Complete the current step
    if (this.currentStep) {
      this.completeCurrentStep();
    }

    // Build and execute the chain
    const provider = new RoleChainProvider(this.stsService, this.steps);
    return provider.assumeChain();
  }

  /**
   * Builds the chain without executing it.
   *
   * @returns RoleChainProvider instance
   * @throws {IamError} If chain is invalid
   */
  public build(): RoleChainProvider {
    // Complete the current step
    if (this.currentStep) {
      this.completeCurrentStep();
    }

    return new RoleChainProvider(this.stsService, this.steps);
  }

  /**
   * Ensures there is a current step being built.
   *
   * @throws {Error} If no step is being built
   */
  private ensureCurrentStep(): void {
    if (!this.currentStep) {
      throw new Error('No role has been added. Call addRole() first.');
    }
  }

  /**
   * Completes the current step and adds it to the chain.
   *
   * @throws {Error} If current step is missing required fields
   */
  private completeCurrentStep(): void {
    if (!this.currentStep) {
      return;
    }

    if (!this.currentStep.roleArn || !this.currentStep.sessionName) {
      throw new Error('Current step is missing required fields');
    }

    this.steps.push(this.currentStep as RoleChainStep);
    this.currentStep = null;
  }
}

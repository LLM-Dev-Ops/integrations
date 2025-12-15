/**
 * Deployment Registry Types
 *
 * Type definitions for Azure OpenAI deployment registry and routing.
 */

import type { AzureDeployment, ModelFamily, ModelCapability } from '../types/index.js';

/** Options for resolving a deployment */
export interface DeploymentResolveOptions {
  /** Prefer deployments in specific region */
  preferredRegion?: string;
  /** Require specific capabilities */
  requiredCapabilities?: ModelCapability[];
  /** Exclude specific deployments */
  excludeDeployments?: string[];
}

/** Result of deployment resolution */
export interface DeploymentResolution {
  deployment: AzureDeployment;
  /** Why this deployment was selected */
  reason: 'exact-match' | 'model-family' | 'capability-match' | 'fallback';
}

/** Deployment registry interface */
export interface DeploymentRegistry {
  /**
   * Resolve deployment by exact ID
   */
  resolve(deploymentId: string): AzureDeployment | undefined;

  /**
   * Resolve deployment by model hint (maps to model family)
   */
  resolveByModel(
    modelHint: string,
    options?: DeploymentResolveOptions
  ): DeploymentResolution | undefined;

  /**
   * List all registered deployments
   */
  list(): AzureDeployment[];

  /**
   * List deployments by capability
   */
  listByCapability(capability: ModelCapability): AzureDeployment[];

  /**
   * List deployments by model family
   */
  listByModelFamily(family: ModelFamily): AzureDeployment[];

  /**
   * Register a new deployment
   */
  register(deployment: AzureDeployment): void;

  /**
   * Remove a deployment
   */
  remove(deploymentId: string): boolean;

  /**
   * Update deployment status
   */
  setActive(deploymentId: string, active: boolean): void;
}

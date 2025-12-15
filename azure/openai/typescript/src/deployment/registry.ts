/**
 * Deployment Registry Implementation
 *
 * Manages Azure OpenAI deployments and provides routing logic.
 */

import type { AzureDeployment, ModelFamily, ModelCapability } from '../types/index.js';
import type {
  DeploymentRegistry,
  DeploymentResolveOptions,
  DeploymentResolution
} from './types.js';

/** Model hint to family mapping */
const MODEL_HINT_TO_FAMILY: Record<string, ModelFamily> = {
  'gpt-4': 'gpt-4',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-35-turbo': 'gpt-35-turbo',
  'gpt-3.5-turbo': 'gpt-35-turbo',
  'text-embedding-ada-002': 'text-embedding-ada-002',
  'text-embedding-3-small': 'text-embedding-3-small',
  'text-embedding-3-large': 'text-embedding-3-large',
  'dall-e-3': 'dall-e-3',
  'whisper': 'whisper',
  'whisper-1': 'whisper',
};

/**
 * Implementation of the deployment registry
 */
export class DeploymentRegistryImpl implements DeploymentRegistry {
  private deployments: Map<string, AzureDeployment> = new Map();

  constructor(initialDeployments?: AzureDeployment[]) {
    if (initialDeployments) {
      for (const deployment of initialDeployments) {
        this.register(deployment);
      }
    }
  }

  resolve(deploymentId: string): AzureDeployment | undefined {
    return this.deployments.get(deploymentId);
  }

  resolveByModel(
    modelHint: string,
    options?: DeploymentResolveOptions
  ): DeploymentResolution | undefined {
    // Normalize model hint to family
    const family = MODEL_HINT_TO_FAMILY[modelHint.toLowerCase()] ?? modelHint as ModelFamily;

    // Get candidates by model family
    let candidates = this.listByModelFamily(family).filter(d => d.active !== false);

    // Filter by required capabilities
    if (options?.requiredCapabilities?.length) {
      candidates = candidates.filter(d =>
        options.requiredCapabilities!.every(cap => d.capabilities.includes(cap))
      );
    }

    // Exclude specific deployments
    if (options?.excludeDeployments?.length) {
      candidates = candidates.filter(d =>
        !options.excludeDeployments!.includes(d.deploymentId)
      );
    }

    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by priority and preferred region
    candidates.sort((a, b) => {
      // Priority first (higher is better)
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;

      // Preferred region
      if (options?.preferredRegion) {
        const aMatch = a.region === options.preferredRegion ? 1 : 0;
        const bMatch = b.region === options.preferredRegion ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }

      return 0;
    });

    const firstCandidate = candidates[0];
    if (!firstCandidate) {
      return undefined;
    }

    return {
      deployment: firstCandidate,
      reason: 'model-family',
    };
  }

  list(): AzureDeployment[] {
    return Array.from(this.deployments.values());
  }

  listByCapability(capability: ModelCapability): AzureDeployment[] {
    return this.list().filter(d => d.capabilities.includes(capability));
  }

  listByModelFamily(family: ModelFamily): AzureDeployment[] {
    return this.list().filter(d => d.modelFamily === family);
  }

  register(deployment: AzureDeployment): void {
    this.deployments.set(deployment.deploymentId, {
      ...deployment,
      active: deployment.active ?? true,
      priority: deployment.priority ?? 0,
    });
  }

  remove(deploymentId: string): boolean {
    return this.deployments.delete(deploymentId);
  }

  setActive(deploymentId: string, active: boolean): void {
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      deployment.active = active;
    }
  }
}

/**
 * Creates a deployment registry from environment configuration
 */
export function createRegistryFromEnv(): DeploymentRegistryImpl {
  const deployments: AzureDeployment[] = [];

  // Parse AZURE_OPENAI_DEPLOYMENTS environment variable
  // Format: deploymentId:resourceName:region:apiVersion:modelFamily:capabilities
  const deploymentsEnv = process.env.AZURE_OPENAI_DEPLOYMENTS;
  if (deploymentsEnv) {
    const entries = deploymentsEnv.split(';');
    for (const entry of entries) {
      const [deploymentId, resourceName, region, apiVersion, modelFamily, caps] = entry.split(':');
      if (deploymentId && resourceName && modelFamily) {
        deployments.push({
          deploymentId,
          resourceName,
          region: region || 'eastus',
          apiVersion: (apiVersion as AzureDeployment['apiVersion']) || '2024-06-01',
          modelFamily: modelFamily as ModelFamily,
          capabilities: caps ? (caps.split(',') as ModelCapability[]) : ['chat'],
        });
      }
    }
  }

  // Legacy single deployment support
  const singleDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME;
  if (singleDeployment && resourceName && deployments.length === 0) {
    const region = process.env.AZURE_OPENAI_REGION ?? 'eastus';
    const apiVersion = (process.env.AZURE_OPENAI_API_VERSION ?? '2024-06-01') as AzureDeployment['apiVersion'];
    const modelFamily = (process.env.AZURE_OPENAI_MODEL_FAMILY ?? 'gpt-4') as ModelFamily;
    deployments.push({
      deploymentId: singleDeployment,
      resourceName,
      region,
      apiVersion,
      modelFamily,
      capabilities: ['chat', 'function-calling', 'streaming'],
    });
  }

  return new DeploymentRegistryImpl(deployments);
}

/**
 * Mock ECR client implementation for testing.
 *
 * This module provides a MockEcrClient that simulates AWS ECR API operations
 * using in-memory state, enabling testing without AWS credentials.
 *
 * @module simulation/mock-client
 */

import { EcrClientInterface } from '../types/client.js';
import { EcrError, EcrErrorKind } from '../errors.js';
import {
  MockRegistry,
  MockRepository,
  MockImage,
  ScanFindings,
} from './mock-registry.js';
import { ScanState, ScanStatus } from '../types/scan.js';

/**
 * Error injection configuration.
 */
export interface ErrorInjectionConfig {
  /** Specific operation to inject error into, or undefined for all operations. */
  readonly operation?: string;
  /** Type of error to inject. */
  readonly errorKind: EcrErrorKind;
  /** Probability of error occurring (0-1), default 1 (always). */
  readonly probability?: number;
  /** Number of times to inject error, undefined for unlimited. */
  readonly count?: number;
}

/**
 * Latency injection configuration.
 */
export interface LatencyConfig {
  /** Specific operation to inject latency into, or undefined for all operations. */
  readonly operation?: string;
  /** Base delay in milliseconds. */
  readonly delayMs: number;
  /** Random jitter in milliseconds to add to delay. */
  readonly jitterMs?: number;
}

/**
 * Scan progression configuration for simulating gradual scan completion.
 */
export interface ScanProgressionConfig {
  /** Repository name. */
  readonly repository: string;
  /** Image digest. */
  readonly digest: string;
  /** States to progress through. */
  readonly states: ScanState[];
  /** Delay between state transitions in milliseconds. */
  readonly delayBetweenStatesMs: number;
  /** Final findings to set when scan completes. */
  readonly finalFindings: ScanFindings;
}

/**
 * Recorded operation for history tracking.
 */
export interface RecordedOperation {
  /** Operation name. */
  readonly operation: string;
  /** Operation parameters. */
  readonly params: unknown;
  /** Timestamp of operation. */
  readonly timestamp: Date;
  /** Result if successful. */
  readonly result?: unknown;
  /** Error if failed. */
  readonly error?: EcrError;
}

/**
 * Mock ECR client for testing.
 *
 * This client simulates ECR API operations using in-memory state,
 * supporting error injection, latency injection, and operation recording.
 */
export class MockEcrClient implements EcrClientInterface {
  private registry: MockRegistry;
  private operationHistory: RecordedOperation[];
  private errorInjections: ErrorInjectionConfig[];
  private latencyConfigs: LatencyConfig[];
  private scanProgressions: Map<string, ScanProgressionConfig>;
  private errorCounts: Map<ErrorInjectionConfig, number>;

  constructor() {
    this.registry = new MockRegistry();
    this.operationHistory = [];
    this.errorInjections = [];
    this.latencyConfigs = [];
    this.scanProgressions = new Map();
    this.errorCounts = new Map();
  }

  // Builder methods

  /**
   * Adds a repository to the mock registry.
   *
   * @param repo - Repository to add
   * @returns This client for chaining
   */
  withRepository(repo: MockRepository): this {
    this.registry.addRepository(repo);
    return this;
  }

  /**
   * Adds an image to a repository.
   *
   * @param repoName - Repository name
   * @param image - Image to add
   * @returns This client for chaining
   */
  withImage(repoName: string, image: MockImage): this {
    this.registry.addImage(repoName, image);
    return this;
  }

  /**
   * Sets scan findings for an image.
   *
   * @param repoName - Repository name
   * @param digest - Image digest
   * @param findings - Scan findings
   * @returns This client for chaining
   */
  withScanFindings(
    repoName: string,
    digest: string,
    findings: ScanFindings
  ): this {
    this.registry.setScanResult(repoName, digest, findings);
    return this;
  }

  /**
   * Configures error injection.
   *
   * @param config - Error injection configuration
   * @returns This client for chaining
   */
  withErrorInjection(config: ErrorInjectionConfig): this {
    this.errorInjections.push(config);
    this.errorCounts.set(config, 0);
    return this;
  }

  /**
   * Configures latency injection.
   *
   * @param config - Latency configuration
   * @returns This client for chaining
   */
  withLatencyInjection(config: LatencyConfig): this {
    this.latencyConfigs.push(config);
    return this;
  }

  /**
   * Configures scan progression simulation.
   *
   * @param config - Scan progression configuration
   * @returns This client for chaining
   */
  configureScanProgression(config: ScanProgressionConfig): this {
    const key = `${config.repository}:${config.digest}`;
    this.scanProgressions.set(key, config);
    return this;
  }

  // Operation history

  /**
   * Gets the operation history.
   *
   * @returns Array of recorded operations
   */
  getOperationHistory(): RecordedOperation[] {
    return [...this.operationHistory];
  }

  /**
   * Gets the count of a specific operation.
   *
   * @param operation - Operation name
   * @returns Number of times operation was called
   */
  getOperationCount(operation: string): number {
    return this.operationHistory.filter((op) => op.operation === operation)
      .length;
  }

  /**
   * Clears the operation history.
   */
  clearHistory(): void {
    this.operationHistory = [];
  }

  /**
   * Resets all state including registry, history, and injections.
   */
  reset(): void {
    this.registry.clear();
    this.operationHistory = [];
    this.errorInjections = [];
    this.latencyConfigs = [];
    this.scanProgressions.clear();
    this.errorCounts.clear();
  }

  // EcrClientInterface implementation

  /**
   * Sends a request to the mock ECR API.
   *
   * @param operation - Operation name
   * @param params - Operation parameters
   * @returns Operation result
   * @throws {EcrError} If error is injected or operation fails
   */
  async send<TRequest, TResponse>(
    operation: string,
    params: TRequest
  ): Promise<TResponse> {
    const timestamp = new Date();

    try {
      // Check for error injection
      await this.checkErrorInjection(operation);

      // Apply latency injection
      await this.applyLatency(operation);

      // Execute operation
      const result = await this.executeOperation(operation, params);

      // Record successful operation
      this.operationHistory.push({
        operation,
        params,
        timestamp,
        result,
      });

      return result as TResponse;
    } catch (error) {
      // Record failed operation
      const ecrError = error instanceof EcrError ? error : this.wrapError(error);
      this.operationHistory.push({
        operation,
        params,
        timestamp,
        error: ecrError,
      });
      throw ecrError;
    }
  }

  /**
   * Checks if an error should be injected for the operation.
   *
   * @param operation - Operation name
   * @throws {EcrError} If error should be injected
   */
  private async checkErrorInjection(operation: string): Promise<void> {
    for (const config of this.errorInjections) {
      // Check if this injection applies to this operation
      if (config.operation && config.operation !== operation) {
        continue;
      }

      // Check probability
      const probability = config.probability ?? 1;
      if (Math.random() > probability) {
        continue;
      }

      // Check count limit
      if (config.count !== undefined) {
        const currentCount = this.errorCounts.get(config) ?? 0;
        if (currentCount >= config.count) {
          continue;
        }
        this.errorCounts.set(config, currentCount + 1);
      }

      // Inject error
      throw this.createError(config.errorKind);
    }
  }

  /**
   * Applies latency injection if configured.
   *
   * @param operation - Operation name
   */
  private async applyLatency(operation: string): Promise<void> {
    for (const config of this.latencyConfigs) {
      // Check if this latency applies to this operation
      if (config.operation && config.operation !== operation) {
        continue;
      }

      // Calculate delay with jitter
      let delay = config.delayMs;
      if (config.jitterMs) {
        delay += Math.random() * config.jitterMs;
      }

      // Apply delay
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Executes a mock operation.
   *
   * @param operation - Operation name
   * @param params - Operation parameters
   * @returns Operation result
   * @throws {EcrError} If operation fails
   */
  private async executeOperation(
    operation: string,
    params: unknown
  ): Promise<unknown> {
    switch (operation) {
      case 'DescribeRepositories':
        return this.describeRepositories(params as any);
      case 'DescribeImages':
        return this.describeImages(params as any);
      case 'ListImages':
        return this.listImages(params as any);
      case 'BatchGetImage':
        return this.batchGetImage(params as any);
      case 'PutImage':
        return this.putImage(params as any);
      case 'BatchDeleteImage':
        return this.batchDeleteImage(params as any);
      case 'StartImageScan':
        return this.startImageScan(params as any);
      case 'DescribeImageScanFindings':
        return this.describeImageScanFindings(params as any);
      case 'GetAuthorizationToken':
        return this.getAuthorizationToken(params as any);
      default:
        throw new EcrError(
          EcrErrorKind.InvalidParameter,
          `Unknown operation: ${operation}`
        );
    }
  }

  // Mock operation implementations

  private describeRepositories(params: {
    repositoryNames?: string[];
  }): unknown {
    const repos = params.repositoryNames
      ? params.repositoryNames
          .map((name) => this.registry.getRepository(name))
          .filter((r): r is MockRepository => r !== undefined)
      : this.registry.listRepositories();

    if (params.repositoryNames && repos.length === 0) {
      throw EcrError.repositoryNotFound('Repository not found');
    }

    return {
      repositories: repos.map((r) => MockRegistry.toRepository(r)),
    };
  }

  private describeImages(params: {
    repositoryName: string;
    imageIds?: Array<{ imageDigest?: string; imageTag?: string }>;
  }): unknown {
    const repo = this.registry.getRepository(params.repositoryName);
    if (!repo) {
      throw EcrError.repositoryNotFound(
        `Repository ${params.repositoryName} not found`
      );
    }

    let images: MockImage[];
    if (params.imageIds && params.imageIds.length > 0) {
      images = params.imageIds
        .map((id) => {
          const identifier = id.imageDigest || id.imageTag;
          return identifier
            ? this.registry.getImage(params.repositoryName, identifier)
            : undefined;
        })
        .filter((img): img is MockImage => img !== undefined);

      if (images.length === 0) {
        throw EcrError.imageNotFound('Image not found');
      }
    } else {
      images = this.registry.listImages(params.repositoryName);
    }

    return {
      imageDetails: images.map((img) =>
        MockRegistry.toImageDetail(params.repositoryName, repo.registryId, img)
      ),
    };
  }

  private listImages(params: { repositoryName: string }): unknown {
    const repo = this.registry.getRepository(params.repositoryName);
    if (!repo) {
      throw EcrError.repositoryNotFound(
        `Repository ${params.repositoryName} not found`
      );
    }

    const images = this.registry.listImages(params.repositoryName);
    return {
      imageIds: images.flatMap((img) =>
        img.tags.map((tag) => ({
          imageDigest: img.digest,
          imageTag: tag,
        }))
      ),
    };
  }

  private batchGetImage(params: {
    repositoryName: string;
    imageIds: Array<{ imageDigest?: string; imageTag?: string }>;
  }): unknown {
    const repo = this.registry.getRepository(params.repositoryName);
    if (!repo) {
      throw EcrError.repositoryNotFound(
        `Repository ${params.repositoryName} not found`
      );
    }

    const images = params.imageIds
      .map((id) => {
        const identifier = id.imageDigest || id.imageTag;
        return identifier
          ? this.registry.getImage(params.repositoryName, identifier)
          : undefined;
      })
      .filter((img): img is MockImage => img !== undefined);

    return {
      images: images.map((img) => ({
        registryId: repo.registryId,
        repositoryName: params.repositoryName,
        imageId: {
          imageDigest: img.digest,
          imageTag: img.tags[0],
        },
        imageManifest: img.manifest,
        imageManifestMediaType: img.manifestMediaType,
      })),
      failures: [],
    };
  }

  private putImage(params: {
    repositoryName: string;
    imageManifest: string;
    imageTag: string;
  }): unknown {
    const repo = this.registry.getRepository(params.repositoryName);
    if (!repo) {
      throw EcrError.repositoryNotFound(
        `Repository ${params.repositoryName} not found`
      );
    }

    // Parse manifest to get digest (simplified - real implementation would hash)
    const digest = `sha256:${this.hashString(params.imageManifest)}`;

    // Check if image exists
    const existingImage = this.registry.getImage(params.repositoryName, digest);
    if (existingImage) {
      // Just add tag
      this.registry.addTag(params.repositoryName, digest, params.imageTag);
    } else {
      // Create new image
      const newImage: MockImage = {
        digest,
        tags: [params.imageTag],
        manifest: params.imageManifest,
        manifestMediaType: 'application/vnd.docker.distribution.manifest.v2+json',
        sizeBytes: params.imageManifest.length,
        pushedAt: new Date(),
      };
      this.registry.addImage(params.repositoryName, newImage);
    }

    return {
      image: {
        registryId: repo.registryId,
        repositoryName: params.repositoryName,
        imageId: {
          imageDigest: digest,
          imageTag: params.imageTag,
        },
        imageManifest: params.imageManifest,
      },
    };
  }

  private batchDeleteImage(params: {
    repositoryName: string;
    imageIds: Array<{ imageDigest?: string; imageTag?: string }>;
  }): unknown {
    const repo = this.registry.getRepository(params.repositoryName);
    if (!repo) {
      throw EcrError.repositoryNotFound(
        `Repository ${params.repositoryName} not found`
      );
    }

    const failures: unknown[] = [];
    const deletedImages: unknown[] = [];

    for (const id of params.imageIds) {
      const identifier = id.imageDigest || id.imageTag;
      if (!identifier) {
        continue;
      }

      try {
        const deleted = this.registry.deleteImage(
          params.repositoryName,
          identifier
        );
        if (deleted) {
          deletedImages.push({
            imageDigest: id.imageDigest,
            imageTag: id.imageTag,
          });
        }
      } catch (error) {
        failures.push({
          imageId: id,
          failureCode: 'ImageNotFound',
          failureReason: 'Image not found',
        });
      }
    }

    return {
      imageIds: deletedImages,
      failures,
    };
  }

  private async startImageScan(params: {
    repositoryName: string;
    imageId: { imageDigest?: string; imageTag?: string };
  }): Promise<unknown> {
    const repo = this.registry.getRepository(params.repositoryName);
    if (!repo) {
      throw EcrError.repositoryNotFound(
        `Repository ${params.repositoryName} not found`
      );
    }

    const identifier = params.imageId.imageDigest || params.imageId.imageTag;
    if (!identifier) {
      throw EcrError.invalidParameter('Image identifier required');
    }

    const image = this.registry.getImage(params.repositoryName, identifier);
    if (!image) {
      throw EcrError.imageNotFound('Image not found');
    }

    // Set initial scan status
    this.registry.setScanStatus(params.repositoryName, image.digest, {
      status: ScanState.InProgress,
      description: 'Scan in progress',
    });

    // Check for scan progression configuration
    const key = `${params.repositoryName}:${image.digest}`;
    const progression = this.scanProgressions.get(key);
    if (progression) {
      this.startScanProgression(progression);
    }

    return {
      registryId: repo.registryId,
      repositoryName: params.repositoryName,
      imageId: {
        imageDigest: image.digest,
        imageTag: image.tags[0],
      },
      imageScanStatus: {
        status: ScanState.InProgress,
        description: 'Scan started',
      },
    };
  }

  private describeImageScanFindings(params: {
    repositoryName: string;
    imageId: { imageDigest?: string; imageTag?: string };
  }): unknown {
    const repo = this.registry.getRepository(params.repositoryName);
    if (!repo) {
      throw EcrError.repositoryNotFound(
        `Repository ${params.repositoryName} not found`
      );
    }

    const identifier = params.imageId.imageDigest || params.imageId.imageTag;
    if (!identifier) {
      throw EcrError.invalidParameter('Image identifier required');
    }

    const image = this.registry.getImage(params.repositoryName, identifier);
    if (!image) {
      throw EcrError.imageNotFound('Image not found');
    }

    if (!image.scanFindings || !image.scanStatus) {
      throw new EcrError(
        EcrErrorKind.ScanNotFound,
        'No scan findings available'
      );
    }

    return {
      registryId: repo.registryId,
      repositoryName: params.repositoryName,
      imageId: {
        imageDigest: image.digest,
        imageTag: image.tags[0],
      },
      imageScanStatus: image.scanStatus,
      imageScanFindings: {
        imageScanCompletedAt: image.scanFindings.scanCompletedAt.toISOString(),
        vulnerabilitySourceUpdatedAt:
          image.scanFindings.vulnerabilitySourceUpdatedAt?.toISOString(),
        findingSeverityCounts: image.scanFindings.findingSeverityCounts,
        findings: image.scanFindings.findings,
      },
    };
  }

  private getAuthorizationToken(_params: unknown): unknown {
    const token = Buffer.from('AWS:mock-password').toString('base64');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 12);

    return {
      authorizationData: [
        {
          authorizationToken: token,
          expiresAt: expiresAt.toISOString(),
          proxyEndpoint: 'https://123456789012.dkr.ecr.us-east-1.amazonaws.com',
        },
      ],
    };
  }

  /**
   * Starts scan progression in the background.
   */
  private startScanProgression(config: ScanProgressionConfig): void {
    let stateIndex = 0;

    const progressScan = () => {
      if (stateIndex >= config.states.length) {
        // Scan complete - set final findings
        this.registry.setScanResult(
          config.repository,
          config.digest,
          config.finalFindings
        );
        return;
      }

      const state = config.states[stateIndex];
      this.registry.setScanStatus(config.repository, config.digest, {
        status: state,
        description: `Scan state: ${state}`,
      });

      stateIndex++;
      setTimeout(progressScan, config.delayBetweenStatesMs);
    };

    setTimeout(progressScan, config.delayBetweenStatesMs);
  }

  /**
   * Creates an error from an error kind.
   */
  private createError(kind: EcrErrorKind): EcrError {
    const messages: Record<EcrErrorKind, string> = {
      [EcrErrorKind.RepositoryNotFound]: 'Repository not found',
      [EcrErrorKind.ImageNotFound]: 'Image not found',
      [EcrErrorKind.LayersNotFound]: 'Layers not found',
      [EcrErrorKind.LifecyclePolicyNotFound]: 'Lifecycle policy not found',
      [EcrErrorKind.RepositoryPolicyNotFound]: 'Repository policy not found',
      [EcrErrorKind.ScanNotFound]: 'Scan not found',
      [EcrErrorKind.InvalidParameter]: 'Invalid parameter',
      [EcrErrorKind.InvalidLayerPart]: 'Invalid layer part',
      [EcrErrorKind.LimitExceeded]: 'Limit exceeded',
      [EcrErrorKind.TooManyTags]: 'Too many tags',
      [EcrErrorKind.ImageTagAlreadyExists]: 'Image tag already exists',
      [EcrErrorKind.ImageDigestMismatch]: 'Image digest mismatch',
      [EcrErrorKind.AccessDenied]: 'Access denied',
      [EcrErrorKind.KmsError]: 'KMS error',
      [EcrErrorKind.ServiceUnavailable]: 'Service unavailable',
      [EcrErrorKind.ThrottlingException]: 'Throttling exception',
      [EcrErrorKind.Timeout]: 'Request timeout',
      [EcrErrorKind.ConnectionFailed]: 'Connection failed',
      [EcrErrorKind.ScanInProgress]: 'Scan in progress',
      [EcrErrorKind.ScanFailed]: 'Scan failed',
      [EcrErrorKind.InvalidConfiguration]: 'Invalid configuration',
      [EcrErrorKind.MissingAuth]: 'Missing authentication',
      [EcrErrorKind.InvalidRegion]: 'Invalid region',
      [EcrErrorKind.InvalidEndpointUrl]: 'Invalid endpoint URL',
      [EcrErrorKind.Unknown]: 'Unknown error',
    };

    return new EcrError(kind, messages[kind] || 'Unknown error');
  }

  /**
   * Wraps an unknown error as EcrError.
   */
  private wrapError(error: unknown): EcrError {
    if (error instanceof Error) {
      return new EcrError(EcrErrorKind.Unknown, error.message, {
        cause: error,
      });
    }
    return new EcrError(
      EcrErrorKind.Unknown,
      String(error)
    );
  }

  /**
   * Simple hash function for generating digests.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

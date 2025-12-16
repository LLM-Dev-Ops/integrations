/**
 * Main Artifact Registry client implementation.
 * @module client/client
 */

import type { ArtifactRegistryConfig } from '../config.js';
import { configFromEnv, validateConfig } from '../config.js';
import { GcpAuthProvider } from '../auth/provider.js';
import { DockerTokenProvider } from '../auth/docker-token.js';
import { RepositoryService } from '../services/repository.js';
import { PackageService } from '../services/package.js';
import { DockerService } from '../services/docker.js';
import { VulnerabilityService } from '../services/vulnerability.js';
import { buildUrl, httpRequest, type HttpResponse, type RequestOptions } from './http.js';

/**
 * Main client for Google Artifact Registry operations.
 *
 * @example
 * ```typescript
 * import { ArtifactRegistryClient, ArtifactRegistryConfig } from '@integrations/google-artifact-registry';
 *
 * // Create client with configuration
 * const config = ArtifactRegistryConfig.builder('my-project')
 *   .location('us-central1')
 *   .build();
 *
 * const client = new ArtifactRegistryClient(config);
 *
 * // List repositories
 * const repos = await client.repositories().list('us-central1');
 *
 * // Get Docker manifest
 * const image = createImageReference('us-central1', 'my-project', 'my-repo', 'my-image', 'latest');
 * const manifest = await client.docker().getManifest(image);
 * ```
 */
export class ArtifactRegistryClient {
  private readonly config: ArtifactRegistryConfig;
  private readonly authProvider: GcpAuthProvider;
  private readonly dockerTokenProvider: DockerTokenProvider;

  // Lazy-initialized services
  private repositoryService?: RepositoryService;
  private packageService?: PackageService;
  private dockerService?: DockerService;
  private vulnerabilityService?: VulnerabilityService;

  constructor(config: ArtifactRegistryConfig) {
    validateConfig(config);
    this.config = { ...config };
    this.authProvider = new GcpAuthProvider(
      config.auth ?? { type: 'adc' },
      config.projectId
    );
    this.dockerTokenProvider = new DockerTokenProvider(this.authProvider);
  }

  /**
   * Gets the repository service for repository operations.
   */
  repositories(): RepositoryService {
    if (!this.repositoryService) {
      this.repositoryService = new RepositoryService(this);
    }
    return this.repositoryService;
  }

  /**
   * Gets the package service for package operations.
   */
  packages(): PackageService {
    if (!this.packageService) {
      this.packageService = new PackageService(this);
    }
    return this.packageService;
  }

  /**
   * Gets the Docker service for OCI registry operations.
   */
  docker(): DockerService {
    if (!this.dockerService) {
      this.dockerService = new DockerService(this, this.dockerTokenProvider);
    }
    return this.dockerService;
  }

  /**
   * Gets the vulnerability service for Container Analysis operations.
   */
  vulnerabilities(): VulnerabilityService {
    if (!this.vulnerabilityService) {
      this.vulnerabilityService = new VulnerabilityService(this);
    }
    return this.vulnerabilityService;
  }

  /**
   * Makes an authenticated GET request to the Artifact Registry API.
   */
  async get<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  /**
   * Makes an authenticated POST request to the Artifact Registry API.
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, { ...options, body });
  }

  /**
   * Makes an authenticated PUT request to the Artifact Registry API.
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  /**
   * Makes an authenticated DELETE request to the Artifact Registry API.
   */
  async delete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  /**
   * Makes an authenticated PATCH request to the Artifact Registry API.
   */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  /**
   * Core request method with authentication.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    options?: RequestOptions & { body?: unknown }
  ): Promise<HttpResponse<T>> {
    const token = await this.authProvider.getToken();
    const url = buildUrl(this.config.apiEndpoint, `/v1${path}`, options?.query);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': this.config.userAgent,
      ...options?.headers,
    };

    return httpRequest<T>(method, url, {
      headers,
      body: options?.body,
      timeout: options?.timeout ?? this.config.timeout,
    });
  }

  /**
   * Gets an access token for external use.
   */
  async getAccessToken(): Promise<string> {
    return this.authProvider.getToken();
  }

  /**
   * Gets the client configuration.
   */
  getConfig(): Readonly<ArtifactRegistryConfig> {
    return { ...this.config };
  }

  /**
   * Gets the project ID.
   */
  getProjectId(): string {
    return this.config.projectId;
  }

  /**
   * Gets the default location.
   */
  getDefaultLocation(): string {
    return this.config.defaultLocation ?? 'us';
  }

  /**
   * Clears all authentication caches.
   */
  clearAuthCache(): void {
    this.authProvider.clearCache();
    this.dockerTokenProvider.clearCache();
  }
}

/**
 * Creates a new Artifact Registry client.
 */
export function createClient(config: ArtifactRegistryConfig): ArtifactRegistryClient {
  return new ArtifactRegistryClient(config);
}

/**
 * Creates a client from environment variables.
 */
export function createClientFromEnv(): ArtifactRegistryClient {
  return new ArtifactRegistryClient(configFromEnv());
}

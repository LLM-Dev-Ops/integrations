/**
 * Public registry service for Amazon ECR Public.
 *
 * This service provides operations for ECR Public (public.ecr.aws),
 * including listing public repositories and managing public authentication.
 *
 * Note: ECR Public uses a different endpoint (api.ecr-public.{region}.amazonaws.com)
 * and different API version (2020-10-30) compared to private ECR.
 *
 * @module services/public
 */

import type { EcrClientInterface } from '../types/client.js';
import type {
  PublicRepository,
  PublicRepositoryList,
  ListPublicReposOptions,
  ImageList,
  ListImagesOptions,
  AuthorizationData,
} from '../types/public.js';
import type { ImageIdentifier } from '../types/image.js';
import { TagMutability, ScanType, EncryptionType } from '../types/repository.js';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Service for managing ECR Public registry operations.
 */
export class PublicRegistryService {
  /**
   * Creates a new PublicRegistryService instance.
   *
   * @param client - ECR Public client interface
   * @param _region - AWS region (typically us-east-1 for ECR Public) - reserved for future use
   */
  constructor(
    private readonly client: EcrClientInterface,
    private readonly _region: string
  ) {}

  /**
   * Lists public repositories.
   *
   * Uses DescribeRepositories on the ECR Public API with pagination support.
   *
   * @param options - List options (repository names, max results)
   * @returns List of public repositories
   * @throws {EcrError} If unable to list repositories
   */
  async listPublicRepositories(
    options?: ListPublicReposOptions
  ): Promise<PublicRepositoryList> {
    try {
      const repositories: PublicRepository[] = [];
      let nextToken = options?.nextToken;

      do {
        interface DescribeRepositoriesRequest {
          repositoryNames?: string[];
          nextToken?: string;
          maxResults?: number;
        }

        interface DescribeRepositoriesResponse {
          repositories?: Array<{
            repositoryArn: string;
            registryId: string;
            repositoryName: string;
            repositoryUri: string;
            createdAt: string;
            imageTagMutability?: string;
            imageScanningConfiguration?: {
              scanOnPush: boolean;
            };
          }>;
          nextToken?: string;
        }

        const request: DescribeRepositoriesRequest = {
          maxResults: options?.maxResults ?? 100,
        };

        if (options?.repositoryNames) {
          request.repositoryNames = options.repositoryNames;
        }
        if (nextToken) {
          request.nextToken = nextToken;
        }

        const response = await this.client.send<
          DescribeRepositoriesRequest,
          DescribeRepositoriesResponse
        >('DescribeRepositories', request);

        if (response.repositories) {
          for (const repo of response.repositories) {
            repositories.push(this.parsePublicRepository(repo));
          }
        }

        nextToken = response.nextToken;
      } while (nextToken);

      return {
        repositories,
      };
    } catch (error) {
      if (error instanceof EcrError) {
        throw error;
      }
      throw new EcrError(
        EcrErrorKind.ServiceUnavailable,
        `Failed to list public repositories: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets a single public repository by name.
   *
   * @param repositoryName - Repository name
   * @returns Public repository details
   * @throws {EcrError} If repository not found
   */
  async getPublicRepository(
    repositoryName: string
  ): Promise<PublicRepository> {
    try {
      const result = await this.listPublicRepositories({
        repositoryNames: [repositoryName],
      });

      if (!result.repositories || result.repositories.length === 0) {
        throw EcrError.repositoryNotFound(
          `Public repository not found: ${repositoryName}`
        );
      }

      const repo = result.repositories[0];
      if (!repo) {
        throw EcrError.repositoryNotFound(
          `Public repository not found: ${repositoryName}`
        );
      }

      return repo;
    } catch (error) {
      if (error instanceof EcrError) {
        throw error;
      }
      throw new EcrError(
        EcrErrorKind.ServiceUnavailable,
        `Failed to get public repository: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Lists images in a public repository.
   *
   * @param repositoryName - Repository name
   * @param options - List options (tag status, max results, pagination)
   * @returns List of images
   * @throws {EcrError} If repository not found or unable to list images
   */
  async listPublicImages(
    repositoryName: string,
    options?: ListImagesOptions
  ): Promise<ImageList> {
    try {
      const images: ImageIdentifier[] = [];
      let nextToken = options?.nextToken;
      let totalCollected = 0;
      const limit = options?.limit ?? Number.MAX_SAFE_INTEGER;

      do {
        interface ListImagesRequest {
          repositoryName: string;
          nextToken?: string;
          maxResults?: number;
          filter?: {
            tagStatus?: string;
          };
        }

        interface ListImagesResponse {
          imageIds?: Array<{
            imageDigest?: string;
            imageTag?: string;
          }>;
          nextToken?: string;
        }

        const request: ListImagesRequest = {
          repositoryName,
          maxResults: options?.maxResults ?? 100,
        };

        if (nextToken) {
          request.nextToken = nextToken;
        }

        if (options?.tagStatus) {
          request.filter = {
            tagStatus: options.tagStatus,
          };
        }

        const response = await this.client.send<
          ListImagesRequest,
          ListImagesResponse
        >('ListImages', request);

        if (response.imageIds) {
          for (const imageId of response.imageIds) {
            if (totalCollected >= limit) {
              break;
            }

            const id: ImageIdentifier = {
              ...(imageId.imageDigest !== undefined && {
                imageDigest: imageId.imageDigest,
              }),
              ...(imageId.imageTag !== undefined && {
                imageTag: imageId.imageTag,
              }),
            };
            images.push(id);
            totalCollected++;
          }
        }

        nextToken = response.nextToken;

        if (totalCollected >= limit) {
          break;
        }
      } while (nextToken);

      const result: ImageList = {
        images,
        ...(nextToken !== undefined && { nextToken }),
      };
      return result;
    } catch (error) {
      if (error instanceof EcrError) {
        throw error;
      }
      throw new EcrError(
        EcrErrorKind.ServiceUnavailable,
        `Failed to list public images: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets an authorization token for the public registry.
   *
   * Uses GetAuthorizationToken on the ECR Public API.
   * Returns token for public.ecr.aws.
   *
   * @returns Authorization data for public registry
   * @throws {EcrError} If unable to get authorization token
   */
  async getPublicAuthToken(): Promise<AuthorizationData> {
    try {
      interface GetAuthorizationTokenResponse {
        authorizationData?: {
          authorizationToken: string;
          expiresAt: string;
        };
      }

      const response = await this.client.send<
        {},
        GetAuthorizationTokenResponse
      >('GetAuthorizationToken', {});

      if (!response.authorizationData) {
        throw new EcrError(
          EcrErrorKind.AccessDenied,
          'No authorization data returned from ECR Public'
        );
      }

      return {
        authorizationToken: response.authorizationData.authorizationToken,
        expiresAt: response.authorizationData.expiresAt,
        proxyEndpoint: 'public.ecr.aws',
      };
    } catch (error) {
      if (error instanceof EcrError) {
        throw error;
      }
      throw new EcrError(
        EcrErrorKind.ServiceUnavailable,
        `Failed to get public auth token: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parses a public repository from the API response.
   *
   * @private
   * @param repo - Repository data from API
   * @returns Parsed public repository
   */
  private parsePublicRepository(repo: {
    repositoryArn: string;
    registryId: string;
    repositoryName: string;
    repositoryUri: string;
    createdAt: string;
    imageTagMutability?: string;
    imageScanningConfiguration?: {
      scanOnPush: boolean;
    };
  }): PublicRepository {
    return {
      registryId: repo.registryId,
      repositoryName: repo.repositoryName,
      repositoryArn: repo.repositoryArn,
      repositoryUri: repo.repositoryUri,
      createdAt: repo.createdAt,
      imageTagMutability:
        repo.imageTagMutability === 'IMMUTABLE'
          ? TagMutability.Immutable
          : TagMutability.Mutable,
      imageScanningConfiguration: {
        scanOnPush: repo.imageScanningConfiguration?.scanOnPush ?? false,
        scanType: ScanType.Basic,
      },
      encryptionConfiguration: {
        encryptionType: EncryptionType.Aes256,
      },
    };
  }
}

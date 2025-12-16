/**
 * Request building utilities for Amazon ECR transport layer.
 *
 * This module provides functions for building ECR API requests including:
 * - Endpoint construction (regional, FIPS, dualstack, public)
 * - Request parameter serialization
 * - AWS SigV4 signing preparation
 *
 * @module transport/request
 */

/**
 * Options for building ECR endpoints.
 */
export interface EndpointOptions {
  /** Use FIPS endpoints. */
  readonly useFips?: boolean;
  /** Use dualstack (IPv4/IPv6) endpoints. */
  readonly useDualstack?: boolean;
  /** Use ECR Public registry. */
  readonly publicRegistry?: boolean;
  /** Custom endpoint URL override. */
  readonly endpointUrl?: string;
}

/**
 * ECR API request structure.
 */
export interface EcrRequest {
  /** Target API operation. */
  readonly operation: string;
  /** Request parameters. */
  readonly params: Record<string, any>;
  /** Request headers. */
  readonly headers: Record<string, string>;
  /** Request body (JSON). */
  readonly body: string;
}

/**
 * Build ECR endpoint URL for a given region.
 *
 * Endpoint patterns:
 * - Standard: ecr.{region}.amazonaws.com
 * - FIPS: ecr-fips.{region}.amazonaws.com
 * - Dualstack: ecr.{region}.api.aws
 * - Public: public.ecr.aws
 *
 * @param region - AWS region (e.g., 'us-east-1')
 * @param options - Endpoint configuration options
 * @returns Full endpoint URL
 */
export function buildEcrEndpoint(
  region: string,
  options: EndpointOptions = {}
): string {
  // Custom endpoint override
  if (options.endpointUrl) {
    return options.endpointUrl;
  }

  // ECR Public registry
  if (options.publicRegistry) {
    return buildEcrPublicEndpoint(region);
  }

  // Build private registry endpoint
  let host: string;

  if (options.useFips && options.useDualstack) {
    host = `ecr-fips.${region}.api.aws`;
  } else if (options.useFips) {
    host = `ecr-fips.${region}.amazonaws.com`;
  } else if (options.useDualstack) {
    host = `ecr.${region}.api.aws`;
  } else {
    host = `ecr.${region}.amazonaws.com`;
  }

  return `https://${host}`;
}

/**
 * Build ECR Public registry endpoint.
 *
 * ECR Public is a global service with a single endpoint.
 *
 * @param region - AWS region (used for signing, not in endpoint)
 * @returns ECR Public endpoint URL
 */
export function buildEcrPublicEndpoint(region: string): string {
  return 'https://public.ecr.aws';
}

/**
 * Build an ECR API request.
 *
 * ECR uses JSON protocol with AWS SigV4 signing.
 *
 * @param operation - ECR API operation (e.g., 'DescribeRepositories')
 * @param params - Operation parameters
 * @returns ECR request object
 */
export function buildRequest(
  operation: string,
  params: Record<string, any> = {}
): EcrRequest {
  // Filter out undefined values
  const cleanParams = filterUndefined(params);

  // Build request body
  const body = JSON.stringify(cleanParams);

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': `AmazonEC2ContainerRegistry_V20150921.${operation}`,
  };

  return {
    operation,
    params: cleanParams,
    headers,
    body,
  };
}

/**
 * Build a request for ECR Public API.
 *
 * ECR Public uses a different target header prefix.
 *
 * @param operation - ECR Public API operation
 * @param params - Operation parameters
 * @returns ECR request object
 */
export function buildPublicRequest(
  operation: string,
  params: Record<string, any> = {}
): EcrRequest {
  const cleanParams = filterUndefined(params);
  const body = JSON.stringify(cleanParams);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': `SpencerFrontendService.${operation}`,
  };

  return {
    operation,
    params: cleanParams,
    headers,
    body,
  };
}

/**
 * Filter undefined values from an object recursively.
 *
 * @param obj - Object to filter
 * @returns Object with undefined values removed
 */
function filterUndefined(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.filter((item) => item !== undefined);
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = filterUndefined(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Build DescribeRepositories request.
 */
export function buildDescribeRepositoriesRequest(params: {
  registryId?: string;
  repositoryNames?: string[];
  nextToken?: string;
  maxResults?: number;
}): EcrRequest {
  return buildRequest('DescribeRepositories', {
    registryId: params.registryId,
    repositoryNames: params.repositoryNames,
    nextToken: params.nextToken,
    maxResults: params.maxResults,
  });
}

/**
 * Build ListImages request.
 */
export function buildListImagesRequest(params: {
  registryId?: string;
  repositoryName: string;
  nextToken?: string;
  maxResults?: number;
  filter?: {
    tagStatus?: 'TAGGED' | 'UNTAGGED' | 'ANY';
  };
}): EcrRequest {
  return buildRequest('ListImages', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
    nextToken: params.nextToken,
    maxResults: params.maxResults,
    filter: params.filter,
  });
}

/**
 * Build DescribeImages request.
 */
export function buildDescribeImagesRequest(params: {
  registryId?: string;
  repositoryName: string;
  imageIds?: Array<{
    imageDigest?: string;
    imageTag?: string;
  }>;
  nextToken?: string;
  maxResults?: number;
  filter?: {
    tagStatus?: 'TAGGED' | 'UNTAGGED' | 'ANY';
  };
}): EcrRequest {
  return buildRequest('DescribeImages', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
    imageIds: params.imageIds,
    nextToken: params.nextToken,
    maxResults: params.maxResults,
    filter: params.filter,
  });
}

/**
 * Build BatchGetImage request.
 */
export function buildBatchGetImageRequest(params: {
  registryId?: string;
  repositoryName: string;
  imageIds: Array<{
    imageDigest?: string;
    imageTag?: string;
  }>;
  acceptedMediaTypes?: string[];
}): EcrRequest {
  return buildRequest('BatchGetImage', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
    imageIds: params.imageIds,
    acceptedMediaTypes: params.acceptedMediaTypes,
  });
}

/**
 * Build PutImage request.
 */
export function buildPutImageRequest(params: {
  registryId?: string;
  repositoryName: string;
  imageManifest: string;
  imageManifestMediaType?: string;
  imageTag?: string;
  imageDigest?: string;
}): EcrRequest {
  return buildRequest('PutImage', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
    imageManifest: params.imageManifest,
    imageManifestMediaType: params.imageManifestMediaType,
    imageTag: params.imageTag,
    imageDigest: params.imageDigest,
  });
}

/**
 * Build BatchDeleteImage request.
 */
export function buildBatchDeleteImageRequest(params: {
  registryId?: string;
  repositoryName: string;
  imageIds: Array<{
    imageDigest?: string;
    imageTag?: string;
  }>;
}): EcrRequest {
  return buildRequest('BatchDeleteImage', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
    imageIds: params.imageIds,
  });
}

/**
 * Build GetAuthorizationToken request.
 */
export function buildGetAuthorizationTokenRequest(params: {
  registryIds?: string[];
}): EcrRequest {
  return buildRequest('GetAuthorizationToken', {
    registryIds: params.registryIds,
  });
}

/**
 * Build StartImageScan request.
 */
export function buildStartImageScanRequest(params: {
  registryId?: string;
  repositoryName: string;
  imageId: {
    imageDigest?: string;
    imageTag?: string;
  };
  scanType?: 'BASIC' | 'ENHANCED';
}): EcrRequest {
  return buildRequest('StartImageScan', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
    imageId: params.imageId,
  });
}

/**
 * Build DescribeImageScanFindings request.
 */
export function buildDescribeImageScanFindingsRequest(params: {
  registryId?: string;
  repositoryName: string;
  imageId: {
    imageDigest?: string;
    imageTag?: string;
  };
  nextToken?: string;
  maxResults?: number;
}): EcrRequest {
  return buildRequest('DescribeImageScanFindings', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
    imageId: params.imageId,
    nextToken: params.nextToken,
    maxResults: params.maxResults,
  });
}

/**
 * Build GetLifecyclePolicy request.
 */
export function buildGetLifecyclePolicyRequest(params: {
  registryId?: string;
  repositoryName: string;
}): EcrRequest {
  return buildRequest('GetLifecyclePolicy', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
  });
}

/**
 * Build GetRepositoryPolicy request.
 */
export function buildGetRepositoryPolicyRequest(params: {
  registryId?: string;
  repositoryName: string;
}): EcrRequest {
  return buildRequest('GetRepositoryPolicy', {
    registryId: params.registryId,
    repositoryName: params.repositoryName,
  });
}

/**
 * Build DescribeRegistry request.
 */
export function buildDescribeRegistryRequest(): EcrRequest {
  return buildRequest('DescribeRegistry', {});
}

/**
 * Build ListTagsForResource request.
 */
export function buildListTagsForResourceRequest(params: {
  resourceArn: string;
}): EcrRequest {
  return buildRequest('ListTagsForResource', {
    resourceArn: params.resourceArn,
  });
}

/**
 * Transport layer for Amazon ECR API.
 *
 * This module exports all transport utilities for building requests,
 * parsing responses, and handling errors.
 *
 * @module transport
 */

// Request building
export {
  buildEcrEndpoint,
  buildEcrPublicEndpoint,
  buildRequest,
  buildPublicRequest,
  buildDescribeRepositoriesRequest,
  buildListImagesRequest,
  buildDescribeImagesRequest,
  buildBatchGetImageRequest,
  buildPutImageRequest,
  buildBatchDeleteImageRequest,
  buildGetAuthorizationTokenRequest,
  buildStartImageScanRequest,
  buildDescribeImageScanFindingsRequest,
  buildGetLifecyclePolicyRequest,
  buildGetRepositoryPolicyRequest,
  buildDescribeRegistryRequest,
  buildListTagsForResourceRequest,
} from './request.js';

export type { EndpointOptions, EcrRequest } from './request.js';

// Response parsing
export {
  parseRepository,
  parseImage,
  parseImageDetail,
  parseManifest,
  parseScanFindings,
  parseAuthorizationData,
  parseDescribeRepositoriesResponse,
  parseListImagesResponse,
  parseDescribeImagesResponse,
  parseBatchGetImageResponse,
  parseBatchDeleteImageResponse,
  parseGetAuthorizationTokenResponse,
  parseStartImageScanResponse,
  parseDescribeImageScanFindingsResponse,
  parseGetLifecyclePolicyResponse,
  parseGetRepositoryPolicyResponse,
} from './response.js';

export type {
  AuthorizationData,
  ScanFindingsSummary,
  Finding,
  ScanFindings,
} from './response.js';

// Error mapping
export {
  mapAwsError,
  isRetryableAwsError,
  getRetryDelay,
  isNotFoundError,
  isAccessDeniedError,
  isThrottlingError,
} from './error-mapper.js';

export type { AwsErrorResponse } from './error-mapper.js';

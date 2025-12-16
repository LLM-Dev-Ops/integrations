# Amazon ECR Image Service Implementation

## Overview

This implementation provides the `ImageService` for Amazon ECR, following the SPARC specification and pseudocode defined in `/workspaces/integrations/plans/amazon-ecr/`.

## Files Created/Modified

### Type Definitions

1. **`src/types/image.ts`** - Image-related type definitions
   - `ImageIdentifier` - Image identifier using digest and/or tag
   - `Image` - Image with manifest information
   - `ImageDetail` - Detailed image information
   - `ListImagesOptions` - Options for listing images
   - `ImageList` - Paginated list of images
   - `ImageFailure` - Image failure information
   - `BatchGetResult` - Result from batch get images
   - `DeleteFailure` - Delete failure information
   - `DeleteResult` - Result from batch delete images

2. **`src/types/scan.ts`** - Scan-related type definitions
   - `ScanState` - Scan state enumeration
   - `ScanStatus` - Scan status information
   - `ScanFindingsSummary` - Summary with severity counts
   - `Severity` - Severity enumeration
   - `Finding` - Individual vulnerability finding
   - `EnhancedFinding` - Enhanced finding with Inspector

3. **`src/types/errors.ts`** - Error type definitions
   - `EcrErrorKind` - Enumeration of error types
   - `EcrError` - Custom error class with error mapping
   - Factory methods for common errors

4. **`src/types/client.ts`** - Client interface
   - `EcrClientInterface` - Interface for dependency injection

5. **`src/types/index.ts`** - Barrel export for all types

### Service Implementation

**`src/services/image.ts`** - ImageService implementation with the following operations:

#### 1. listImages(repositoryName, options?)
- Lists images in a repository
- Handles pagination automatically
- Supports filtering by tag status (Tagged, Untagged, Any)
- Returns: `ImageList { images, nextToken }`

#### 2. describeImages(repositoryName, imageIds)
- Describes images in detail
- Batches requests into groups of 100 (API limit)
- Returns: Array of `ImageDetail`

#### 3. getImage(repositoryName, imageId)
- Gets a single image with manifest
- Specifies accepted media types:
  - Docker manifest v2
  - OCI manifest v1
  - Docker manifest list v2
  - OCI image index v1
- Throws `ImageNotFound` if not found
- Returns: `Image`

#### 4. batchGetImages(repositoryName, imageIds)
- Retrieves multiple images with manifests
- Returns: `BatchGetResult { images, failures }`

#### 5. putImageTag(repositoryName, sourceDigest, targetTag)
- Gets source image manifest first
- Uses PutImage API to add tag
- Emits `ecr.images.tagged` metric (commented for observability layer)
- Throws `ImageTagAlreadyExists` for immutable repositories
- Returns: `Image`

#### 6. batchDeleteImages(repositoryName, imageIds)
- Deletes multiple images
- Batches into groups of 100
- Emits `ecr.images.deleted` metric (commented for observability layer)
- Returns: `DeleteResult { deleted, failures }`

### Helper Methods

- `parseImageDetail(detail)` - Parses AWS response to ImageDetail
- `chunk<T>(array, size)` - Splits array into chunks for batching
- `formatImageId(imageId)` - Formats image ID for error messages
- `isImageTagAlreadyExistsError(error)` - Checks for specific error type
- `mapError(error)` - Maps AWS SDK errors to EcrError types

### Error Mapping

The service properly maps all AWS ECR errors to typed `EcrError` instances:

- `RepositoryNotFoundException` → `RepositoryNotFound`
- `ImageNotFoundException` → `ImageNotFound`
- `LayersNotFoundException` → `LayersNotFound`
- `LifecyclePolicyNotFoundException` → `LifecyclePolicyNotFound`
- `RepositoryPolicyNotFoundException` → `RepositoryPolicyNotFound`
- `ScanNotFoundException` → `ScanNotFound`
- `InvalidParameterException` → `InvalidParameter`
- `InvalidLayerPartException` → `InvalidLayerPart`
- `LimitExceededException` → `LimitExceeded`
- `TooManyTagsException` → `TooManyTags`
- `ImageTagAlreadyExistsException` → `ImageTagAlreadyExists`
- `ImageDigestDoesNotMatchException` → `ImageDigestMismatch`
- `AccessDeniedException` → `AccessDenied`
- `KmsException` → `KmsError`
- `ServerException` → `ServiceUnavailable`
- `ThrottlingException` → `ThrottlingException`

## Compliance with SPARC Specification

✅ **Specification Compliance**
- All required operations implemented
- Type definitions match SPARC specification
- Error taxonomy implemented as defined

✅ **Pseudocode Compliance**
- Follows the pseudocode logic from `plans/amazon-ecr/pseudocode-amazon-ecr.md`
- Implements batching for operations with API limits
- Handles pagination as specified
- Error mapping matches pseudocode

✅ **Thin Adapter Principle**
- Uses `EcrClientInterface` for dependency injection
- Does not include AWS credential management (delegated to `aws/auth`)
- Metrics emission commented (delegated to `shared/observability`)
- Circuit breaker and retry logic delegated to `shared/resilience`

✅ **Pattern Consistency**
- Follows similar patterns to GitHub services
- Uses readonly properties for type safety
- Comprehensive JSDoc documentation
- Proper error handling and type safety

## API Limits Respected

- **ListImages**: 100 results per request (paginated)
- **DescribeImages**: 100 images per batch (automatically batched)
- **BatchGetImage**: 100 images maximum
- **BatchDeleteImage**: 100 images per batch (automatically batched)

## Testing Considerations

The implementation is designed for testability:

1. **Dependency Injection**: Accepts `EcrClientInterface` allowing mock implementations
2. **Error Handling**: All errors are typed and testable
3. **Batching Logic**: Helper methods are testable independently
4. **Type Safety**: Full TypeScript typing enables compile-time validation

## Next Steps

To use this service:

1. Implement `EcrClientInterface` with actual AWS SDK integration
2. Wire up observability metrics (uncomment metric emission calls)
3. Integrate with `shared/resilience` for retry and circuit breaking
4. Add integration tests with mock ECR client
5. Add unit tests for error mapping and batching logic

## File Locations

- Service: `/workspaces/integrations/amazon-ecr/typescript/src/services/image.ts`
- Types: `/workspaces/integrations/amazon-ecr/typescript/src/types/`
- Documentation: `/workspaces/integrations/amazon-ecr/typescript/src/services/README.md`

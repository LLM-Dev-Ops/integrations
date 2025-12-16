# Amazon ECR Services

This directory contains service implementations for Amazon ECR operations.

## ImageService

The `ImageService` provides comprehensive image management functionality:

### Operations

1. **listImages** - List images in a repository with optional filtering
2. **describeImages** - Get detailed information about images (batched up to 100)
3. **getImage** - Retrieve a single image with its manifest
4. **batchGetImages** - Retrieve multiple images with manifests
5. **putImageTag** - Add a tag to an existing image
6. **batchDeleteImages** - Delete multiple images (batched up to 100)

### Usage Example

```typescript
import { ImageService } from './services';
import { EcrClientInterface } from './types/client';

// Assuming you have an ECR client implementation
const client: EcrClientInterface = createEcrClient(config);
const imageService = new ImageService(client);

// List all tagged images
const images = await imageService.listImages('my-repository', {
  tagStatus: 'TAGGED',
  maxResults: 50
});

console.log(`Found ${images.images.length} images`);

// Describe specific images
const details = await imageService.describeImages('my-repository', [
  { imageTag: 'latest' },
  { imageTag: 'v1.0.0' }
]);

for (const detail of details) {
  console.log(`Image: ${detail.imageDigest}`);
  console.log(`Tags: ${detail.imageTags.join(', ')}`);
  console.log(`Size: ${detail.imageSizeInBytes} bytes`);
}

// Get image manifest
const image = await imageService.getImage('my-repository', {
  imageTag: 'latest'
});

console.log('Manifest:', image.imageManifest);

// Tag an image
const taggedImage = await imageService.putImageTag(
  'my-repository',
  'sha256:abcdef123456...',
  'production'
);

console.log(`Tagged image as: ${taggedImage.imageId.imageTag}`);

// Delete old images
const deleteResult = await imageService.batchDeleteImages('my-repository', [
  { imageTag: 'old-version' },
  { imageDigest: 'sha256:old123...' }
]);

console.log(`Deleted ${deleteResult.deleted.length} images`);
if (deleteResult.failures.length > 0) {
  console.log('Failures:', deleteResult.failures);
}
```

### Error Handling

The service throws `EcrError` instances for all error conditions:

```typescript
import { EcrError, EcrErrorKind } from './types';

try {
  const image = await imageService.getImage('my-repo', { imageTag: 'missing' });
} catch (error) {
  if (error instanceof EcrError) {
    switch (error.kind) {
      case EcrErrorKind.ImageNotFound:
        console.log('Image does not exist');
        break;
      case EcrErrorKind.RepositoryNotFound:
        console.log('Repository does not exist');
        break;
      case EcrErrorKind.ThrottlingException:
        console.log('Request throttled, retry after:', error.statusCode);
        break;
      default:
        console.log('Error:', error.toString());
    }
  }
}
```

### Features

- **Automatic Batching**: Operations like `describeImages` and `batchDeleteImages` automatically batch requests to stay within API limits (100 items per batch)
- **Pagination Support**: `listImages` handles pagination automatically when a limit is specified
- **Error Mapping**: AWS SDK errors are mapped to typed `EcrError` instances
- **Type Safety**: Full TypeScript types for all operations and responses
- **Media Type Support**: Supports Docker v2 manifests, OCI manifests, and manifest lists

### API Limits

The service respects AWS ECR API limits:

- **ListImages**: 100 results per request (use pagination for more)
- **DescribeImages**: 100 images per request (automatically batched)
- **BatchGetImage**: Up to 100 images per request
- **BatchDeleteImage**: Up to 100 images per request (automatically batched)

### Implementation Notes

Following the SPARC specification:

1. All operations use the `EcrClientInterface` for making API calls
2. Errors are properly mapped to domain-specific error types
3. Operations emit metrics (commented out, to be handled by observability layer)
4. Follows similar patterns to the GitHub services implementation
5. All types are imported from `../types/index.ts`

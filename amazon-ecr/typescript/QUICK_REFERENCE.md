# Amazon ECR Image Service - Quick Reference

## Import

```typescript
import { ImageService } from './services';
import { EcrClientInterface } from './types/client';
import { 
  ImageIdentifier, 
  Image, 
  ImageDetail, 
  ListImagesOptions 
} from './types';
```

## Initialization

```typescript
const client: EcrClientInterface = createEcrClient(config);
const imageService = new ImageService(client);
```

## Operations

### List Images

```typescript
// List all tagged images
const result = await imageService.listImages('my-repo', {
  tagStatus: 'TAGGED',
  maxResults: 50,
  limit: 100
});

console.log(`Found ${result.images.length} images`);
```

### Describe Images

```typescript
const details = await imageService.describeImages('my-repo', [
  { imageTag: 'latest' },
  { imageDigest: 'sha256:abc...' }
]);

for (const detail of details) {
  console.log(`${detail.imageDigest}: ${detail.imageTags.join(', ')}`);
}
```

### Get Single Image

```typescript
const image = await imageService.getImage('my-repo', {
  imageTag: 'latest'
});

console.log('Manifest:', JSON.parse(image.imageManifest!));
```

### Batch Get Images

```typescript
const result = await imageService.batchGetImages('my-repo', [
  { imageTag: 'v1.0' },
  { imageTag: 'v2.0' }
]);

console.log(`Retrieved: ${result.images.length}`);
console.log(`Failed: ${result.failures.length}`);
```

### Tag Image

```typescript
const tagged = await imageService.putImageTag(
  'my-repo',
  'sha256:source-digest...',
  'production'
);

console.log(`Tagged as: ${tagged.imageId.imageTag}`);
```

### Delete Images

```typescript
const result = await imageService.batchDeleteImages('my-repo', [
  { imageTag: 'old-v1' },
  { imageTag: 'old-v2' }
]);

console.log(`Deleted: ${result.deleted.length}`);
```

## Error Handling

```typescript
import { EcrError, EcrErrorKind } from './types';

try {
  const image = await imageService.getImage('my-repo', { 
    imageTag: 'missing' 
  });
} catch (error) {
  if (error instanceof EcrError) {
    console.log(`Error: ${error.kind}`);
    console.log(`Message: ${error.message}`);
    console.log(`Retryable: ${error.isRetryable()}`);
  }
}
```

## Type Reference

### ImageIdentifier
```typescript
interface ImageIdentifier {
  imageDigest?: string;  // sha256:...
  imageTag?: string;     // latest, v1.0, etc.
}
```

### Image
```typescript
interface Image {
  registryId: string;
  repositoryName: string;
  imageId: ImageIdentifier;
  imageManifest?: string;
  imageManifestMediaType?: string;
}
```

### ImageDetail
```typescript
interface ImageDetail {
  registryId: string;
  repositoryName: string;
  imageDigest: string;
  imageTags: string[];
  imageSizeInBytes: number;
  imagePushedAt: string;
  imageScanStatus?: ScanStatus;
  imageScanFindingsSummary?: ScanFindingsSummary;
  imageManifestMediaType: string;
  artifactMediaType?: string;
  lastRecordedPullTime?: string;
}
```

### ListImagesOptions
```typescript
interface ListImagesOptions {
  maxResults?: number;      // Per page (max 100)
  tagStatus?: 'TAGGED' | 'UNTAGGED' | 'ANY';
  limit?: number;           // Total limit
  nextToken?: string;       // For pagination
}
```

## Error Kinds

```typescript
enum EcrErrorKind {
  RepositoryNotFound,
  ImageNotFound,
  ImageTagAlreadyExists,
  ThrottlingException,
  AccessDenied,
  ServiceUnavailable,
  // ... and more
}
```

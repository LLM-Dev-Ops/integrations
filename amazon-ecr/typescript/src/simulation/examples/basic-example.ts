/**
 * Basic example of using the ECR simulation module.
 *
 * This example demonstrates:
 * - Creating a mock registry
 * - Adding repositories and images
 * - Using the mock client
 * - Error injection
 * - Operation history tracking
 */

import { MockEcrClient } from '../mock-client.js';
import type { MockRepository, MockImage } from '../mock-registry.js';
import { TagMutability } from '../../types/repository.js';
import { ScanType } from '../../types/repository.js';
import { EcrErrorKind } from '../../errors.js';

async function basicExample() {
  console.log('=== ECR Simulation Basic Example ===\n');

  // Create a mock client
  const client = new MockEcrClient();

  // Setup mock repository
  const repo: MockRepository = {
    name: 'my-application',
    uri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-application',
    arn: 'arn:aws:ecr:us-east-1:123456789012:repository/my-application',
    registryId: '123456789012',
    createdAt: new Date('2024-01-01'),
    imageTagMutability: TagMutability.Immutable,
    imageScanningConfiguration: {
      scanOnPush: true,
      scanType: ScanType.Basic,
    },
  };

  console.log('1. Adding repository:', repo.name);
  client.withRepository(repo);

  // Setup mock images
  const images: MockImage[] = [
    {
      digest: 'sha256:abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234',
      tags: ['latest', 'v1.0.0'],
      manifest: JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
        config: {
          mediaType: 'application/vnd.docker.container.image.v1+json',
          size: 7023,
          digest: 'sha256:config123',
        },
        layers: [
          {
            mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
            size: 32654,
            digest: 'sha256:layer1',
          },
        ],
      }),
      manifestMediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      sizeBytes: 1024000,
      pushedAt: new Date('2024-01-15'),
    },
    {
      digest: 'sha256:efgh5678901234efgh5678901234efgh5678901234efgh5678901234efgh5678',
      tags: ['v0.9.0'],
      manifest: JSON.stringify({ schemaVersion: 2 }),
      manifestMediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      sizeBytes: 950000,
      pushedAt: new Date('2024-01-10'),
    },
  ];

  console.log('2. Adding images:', images.map(i => i.tags.join(', ')).join(' | '));
  for (const image of images) {
    client.withImage(repo.name, image);
  }

  // List repositories
  console.log('\n3. Listing repositories:');
  const repoResponse = await client.send('DescribeRepositories', {
    repositoryNames: [repo.name],
  });
  console.log('   Found:', (repoResponse as any).repositories.length, 'repository');

  // List images
  console.log('\n4. Listing images:');
  const imageResponse = await client.send('DescribeImages', {
    repositoryName: repo.name,
  });
  const imageDetails = (imageResponse as any).imageDetails;
  console.log('   Found:', imageDetails.length, 'images');
  for (const detail of imageDetails) {
    console.log(`   - ${detail.imageDigest.substring(0, 19)}... [${detail.imageTags.join(', ')}]`);
  }

  // Get specific image
  console.log('\n5. Getting image by tag:');
  const specificImage = await client.send('BatchGetImage', {
    repositoryName: repo.name,
    imageIds: [{ imageTag: 'latest' }],
  });
  const image = (specificImage as any).images[0];
  console.log(`   Image: ${image.imageId.imageTag}`);
  console.log(`   Digest: ${image.imageId.imageDigest.substring(0, 19)}...`);

  // Check operation history
  console.log('\n6. Operation history:');
  const history = client.getOperationHistory();
  console.log('   Total operations:', history.length);
  for (const op of history) {
    console.log(`   - ${op.operation} at ${op.timestamp.toISOString()}`);
  }

  console.log('\n=== Error Injection Example ===\n');

  // Create client with error injection
  const errorClient = new MockEcrClient()
    .withRepository(repo)
    .withErrorInjection({
      operation: 'DescribeImages',
      errorKind: EcrErrorKind.ThrottlingException,
      probability: 1.0, // Always inject
      count: 2, // Only first 2 calls
    });

  console.log('7. Testing error injection (throttling):');

  // First two calls should fail
  for (let i = 1; i <= 3; i++) {
    try {
      await errorClient.send('DescribeImages', { repositoryName: repo.name });
      console.log(`   Call ${i}: Success`);
    } catch (error: any) {
      console.log(`   Call ${i}: Error - ${error.message}`);
    }
  }

  console.log('\n=== Latency Injection Example ===\n');

  // Create client with latency injection
  const slowClient = new MockEcrClient()
    .withRepository(repo)
    .withImage(repo.name, images[0])
    .withLatencyInjection({
      operation: 'DescribeImages',
      delayMs: 500,
      jitterMs: 200,
    });

  console.log('8. Testing latency injection:');
  const start = Date.now();
  await slowClient.send('DescribeImages', { repositoryName: repo.name });
  const duration = Date.now() - start;
  console.log(`   Request took: ${duration}ms (expected 500-700ms)`);

  console.log('\n=== Example Complete ===');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  basicExample().catch(console.error);
}

export { basicExample };

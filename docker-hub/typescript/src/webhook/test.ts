/**
 * Simple test to validate webhook handler
 */

import { WebhookHandlerImpl, createWebhookHandler, getFullRepositoryName, getImageReference } from './index.js';

// Sample webhook payload from Docker Hub
const samplePayload = JSON.stringify({
  callbackUrl: "https://registry.hub.docker.com/u/username/repo/hook/webhook-id/",
  pushData: {
    pushedAt: 1702857600,
    pusher: "johndoe",
    tag: "v1.2.3",
    images: [
      "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    ]
  },
  repository: {
    commentCount: 0,
    dateCreated: 1700000000,
    description: "My awesome Docker image",
    dockerfile: "FROM alpine\nRUN echo hello",
    fullDescription: "# My Awesome Image\n\nThis is a detailed description.",
    isOfficial: false,
    isPrivate: false,
    isTrusted: false,
    name: "myrepo",
    namespace: "username",
    owner: "johndoe",
    repoName: "username/myrepo",
    repoUrl: "https://hub.docker.com/r/username/myrepo",
    starCount: 42,
    status: "Active"
  }
});

async function test() {
  console.log('Testing Docker Hub webhook handler...\n');

  const handler = createWebhookHandler();

  try {
    // Test with string body
    const event = await handler.handle(samplePayload);

    console.log('✓ Successfully parsed webhook');
    console.log('Event details:');
    console.log(`  Type: ${event.type}`);
    console.log(`  Repository: ${getFullRepositoryName(event)}`);
    console.log(`  Image: ${getImageReference(event)}`);
    console.log(`  Pusher: ${event.pusher}`);
    console.log(`  Timestamp: ${event.timestamp.toISOString()}`);
    console.log(`  Images: ${event.images.length}`);

    // Test with Uint8Array
    const encoder = new TextEncoder();
    const uint8Body = encoder.encode(samplePayload);
    const event2 = await handler.handle(uint8Body);
    console.log('\n✓ Successfully parsed webhook from Uint8Array');

    // Test invalid payload
    try {
      await handler.handle('{"invalid": "payload"}');
      console.log('\n✗ Should have thrown error for invalid payload');
    } catch (error) {
      console.log('\n✓ Correctly rejected invalid payload');
    }

    console.log('\nAll tests passed!');
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

test();

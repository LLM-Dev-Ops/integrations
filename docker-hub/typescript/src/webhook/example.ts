/**
 * Example usage of Docker Hub webhook handler.
 *
 * This file demonstrates how to use the webhook handler in various scenarios.
 */

import {
  createWebhookHandler,
  WebhookHandler,
  WebhookEvent,
  WebhookPayload,
  getFullRepositoryName,
  getImageReference,
  isPushEvent,
  extractRepositoryMetadata,
  isPrivateRepository,
  isOfficialImage,
} from './index.js';

// ============================================================================
// Basic Usage
// ============================================================================

/**
 * Basic webhook handling example.
 */
async function basicExample(requestBody: string): Promise<void> {
  const handler = createWebhookHandler();

  try {
    // Parse and handle the webhook
    const event = await handler.handle(requestBody);

    console.log('Received webhook event:');
    console.log(`  Type: ${event.type}`);
    console.log(`  Repository: ${getFullRepositoryName(event)}`);
    console.log(`  Image: ${getImageReference(event)}`);
    console.log(`  Pusher: ${event.pusher}`);
    console.log(`  Timestamp: ${event.timestamp.toISOString()}`);
    console.log(`  Number of images: ${event.images.length}`);
  } catch (error) {
    console.error('Failed to process webhook:', error);
    throw error;
  }
}

// ============================================================================
// Express.js Integration
// ============================================================================

/**
 * Example Express.js webhook endpoint.
 */
function expressExample() {
  // Pseudo-code for Express.js integration
  const express = require('express');
  const app = express();

  // Use raw body parser for webhooks
  app.post(
    '/webhooks/docker-hub',
    express.raw({ type: 'application/json' }),
    async (req: any, res: any) => {
      const handler = createWebhookHandler();

      try {
        // Handle the webhook
        const event = await handler.handle(req.body);

        // Process the event
        await processDockerHubEvent(event);

        // Respond with success
        res.status(200).json({ status: 'ok' });
      } catch (error) {
        console.error('Webhook processing failed:', error);
        res.status(400).json({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return app;
}

// ============================================================================
// Event Processing
// ============================================================================

/**
 * Process a Docker Hub webhook event.
 */
async function processDockerHubEvent(event: WebhookEvent): Promise<void> {
  // Check event type
  if (isPushEvent(event)) {
    console.log(`New image pushed: ${getImageReference(event)}`);

    // Trigger CI/CD pipeline
    await triggerDeployment(event);

    // Send notification
    await sendNotification(event);

    // Update monitoring
    await updateMonitoring(event);
  }
}

/**
 * Trigger deployment based on webhook event.
 */
async function triggerDeployment(event: WebhookEvent): Promise<void> {
  // Check if this is a production tag
  if (event.tag === 'latest' || event.tag.startsWith('v')) {
    console.log(`Triggering deployment for ${getImageReference(event)}`);

    // Example: Call deployment API
    // await deploymentApi.deploy({
    //   image: getImageReference(event),
    //   tag: event.tag,
    //   timestamp: event.timestamp,
    // });
  }
}

/**
 * Send notification about new image.
 */
async function sendNotification(event: WebhookEvent): Promise<void> {
  const message = `
New Docker image pushed:
- Repository: ${getFullRepositoryName(event)}
- Tag: ${event.tag}
- Pusher: ${event.pusher}
- Time: ${event.timestamp.toISOString()}
- Images: ${event.images.length}
  `.trim();

  console.log('Sending notification:', message);

  // Example: Send to Slack, Discord, email, etc.
  // await slackClient.sendMessage({
  //   channel: '#deployments',
  //   text: message,
  // });
}

/**
 * Update monitoring systems with new image information.
 */
async function updateMonitoring(event: WebhookEvent): Promise<void> {
  console.log(`Updating monitoring for ${getImageReference(event)}`);

  // Example: Update metrics, logs, or tracking systems
  // await metricsClient.recordEvent({
  //   type: 'docker_image_push',
  //   repository: getFullRepositoryName(event),
  //   tag: event.tag,
  //   timestamp: event.timestamp,
  // });
}

// ============================================================================
// Advanced Usage with Payload Inspection
// ============================================================================

/**
 * Advanced webhook handling with full payload access.
 */
async function advancedExample(requestBody: string): Promise<void> {
  const handler = createWebhookHandler();

  // Parse payload first to get full details
  const payload: WebhookPayload = handler.parsePayload(requestBody);

  // Check repository characteristics
  if (isPrivateRepository(payload)) {
    console.log('This is a private repository');
  }

  if (isOfficialImage(payload)) {
    console.log('This is an official Docker Hub image');
  }

  // Extract repository metadata
  const metadata = extractRepositoryMetadata(payload);
  console.log('Repository metadata:', {
    name: metadata.name,
    namespace: metadata.namespace,
    owner: metadata.owner,
    description: metadata.description,
    stars: metadata.starCount,
    isPrivate: metadata.isPrivate,
    isOfficial: metadata.isOfficial,
    isTrusted: metadata.isTrusted,
    url: metadata.url,
  });

  // Convert to event
  const event = handler.toEvent(payload);

  // Process based on metadata
  if (metadata.isPrivate && metadata.starCount > 100) {
    console.log('High-profile private repository push detected');
    // Handle specially
  }
}

// ============================================================================
// Filtering and Conditional Processing
// ============================================================================

/**
 * Process webhooks with filtering.
 */
async function filteredProcessing(requestBody: string): Promise<void> {
  const handler = createWebhookHandler();
  const event = await handler.handle(requestBody);

  // Only process certain tags
  const importantTags = ['latest', 'stable', 'production'];
  const isVersionTag = /^v\d+\.\d+\.\d+$/.test(event.tag);

  if (importantTags.includes(event.tag) || isVersionTag) {
    console.log(`Processing important tag: ${event.tag}`);
    await processDockerHubEvent(event);
  } else {
    console.log(`Skipping tag: ${event.tag}`);
  }

  // Only process from certain namespaces
  const allowedNamespaces = ['myorg', 'production'];
  if (allowedNamespaces.includes(event.namespace)) {
    console.log(`Processing allowed namespace: ${event.namespace}`);
    await processDockerHubEvent(event);
  }

  // Only process during business hours
  const hour = event.timestamp.getHours();
  if (hour >= 9 && hour <= 17) {
    console.log('Processing during business hours');
    await processDockerHubEvent(event);
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Comprehensive error handling example.
 */
async function errorHandlingExample(requestBody: string): Promise<void> {
  const handler = createWebhookHandler();

  try {
    const event = await handler.handle(requestBody);
    await processDockerHubEvent(event);
  } catch (error) {
    if (error instanceof Error) {
      // Log error details
      console.error('Webhook processing failed:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      // Handle specific error types
      if (error.message.includes('Invalid webhook payload')) {
        console.error('Received malformed webhook payload');
        // Maybe alert administrators
      } else if (error.message.includes('Failed to parse')) {
        console.error('JSON parsing error');
        // Log raw payload for debugging
      }
    }

    // Re-throw to signal failure to caller
    throw error;
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process multiple webhooks in batch.
 */
async function batchProcessing(webhookBodies: string[]): Promise<void> {
  const handler = createWebhookHandler();

  const results = await Promise.allSettled(
    webhookBodies.map(async (body) => {
      const event = await handler.handle(body);
      return processDockerHubEvent(event);
    })
  );

  // Log results
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`Processed ${successful} webhooks successfully`);
  console.log(`Failed to process ${failed} webhooks`);

  // Log failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Webhook ${index} failed:`, result.reason);
    }
  });
}

// ============================================================================
// Lambda/Serverless Integration
// ============================================================================

/**
 * Example AWS Lambda handler.
 */
async function lambdaHandler(event: any): Promise<any> {
  const handler = createWebhookHandler();

  try {
    // Parse webhook from Lambda event
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;

    const webhookEvent = await handler.handle(body);

    // Process the webhook
    await processDockerHubEvent(webhookEvent);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'ok' }),
    };
  } catch (error) {
    console.error('Lambda webhook processing failed:', error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

// ============================================================================
// Webhook Signature Verification (Future Enhancement)
// ============================================================================

/**
 * Note: Docker Hub doesn't currently provide webhook signatures.
 * If they add this feature in the future, you would verify like this:
 */
function futureSignatureVerification(
  requestBody: string,
  signature: string,
  secret: string
): boolean {
  // This is a placeholder for future signature verification
  // Docker Hub doesn't currently sign webhooks like GitHub does

  // If they implement HMAC-SHA256 signatures in the future:
  // const crypto = require('crypto');
  // const expectedSignature = crypto
  //   .createHmac('sha256', secret)
  //   .update(requestBody)
  //   .digest('hex');
  // return crypto.timingSafeEqual(
  //   Buffer.from(signature),
  //   Buffer.from(expectedSignature)
  // );

  console.log('Docker Hub webhooks do not currently support signatures');
  return true;
}

// ============================================================================
// Export Examples
// ============================================================================

export {
  basicExample,
  expressExample,
  processDockerHubEvent,
  advancedExample,
  filteredProcessing,
  errorHandlingExample,
  batchProcessing,
  lambdaHandler,
};

# Docker Hub Webhook Handler

Production-ready TypeScript implementation of a Docker Hub webhook handler following the SPARC specification.

## Overview

This module provides a complete webhook handler for Docker Hub push events. It handles payload parsing, validation, and event conversion with comprehensive error handling and type safety.

## Features

- **Zod Validation**: Schema-based validation using Zod for runtime type safety
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Detailed error messages with proper error types
- **Production-Ready**: Handles edge cases, malformed payloads, and encoding variations
- **Zero Signatures**: Docker Hub doesn't use cryptographic signatures, so validation focuses on payload structure
- **Helper Functions**: Utilities for common webhook operations

## Installation

```bash
npm install @integrations/docker-hub
```

## Quick Start

```typescript
import { createWebhookHandler } from '@integrations/docker-hub/webhook';

const handler = createWebhookHandler();

// Handle a webhook
const event = await handler.handle(requestBody);

console.log(`New push to ${event.namespace}/${event.repository}:${event.tag}`);
console.log(`Pushed by ${event.pusher} at ${event.timestamp}`);
```

## API Reference

### WebhookHandler Interface

#### `parsePayload(body: string | Uint8Array): WebhookPayload`

Parses and validates the raw webhook payload.

- **Parameters:**
  - `body`: Raw request body (string or Uint8Array)
- **Returns:** Validated `WebhookPayload` object
- **Throws:** `DockerHubError` if payload is invalid

```typescript
const payload = handler.parsePayload(requestBody);
console.log(payload.repository.name);
```

#### `toEvent(payload: WebhookPayload): WebhookEvent`

Converts a webhook payload to a normalized event.

- **Parameters:**
  - `payload`: Validated webhook payload
- **Returns:** `WebhookEvent` object with normalized data

```typescript
const event = handler.toEvent(payload);
console.log(event.timestamp); // Date object
```

#### `handle(body: string | Uint8Array): Promise<WebhookEvent>`

Main entry point - parses and converts in one step.

- **Parameters:**
  - `body`: Raw request body
- **Returns:** Promise resolving to `WebhookEvent`
- **Throws:** `DockerHubError` if processing fails

```typescript
const event = await handler.handle(requestBody);
```

### Types

#### WebhookPayload

Raw webhook payload structure from Docker Hub:

```typescript
interface WebhookPayload {
  callbackUrl: string;
  pushData: {
    pushedAt: number;      // Unix timestamp in seconds
    pusher: string;        // Username
    tag: string;           // Tag name
    images: string[];      // Image digests
  };
  repository: {
    commentCount: number;
    dateCreated: number;
    description: string;
    dockerfile: string;
    fullDescription: string;
    isOfficial: boolean;
    isPrivate: boolean;
    isTrusted: boolean;
    name: string;          // Repository name
    namespace: string;     // Owner/organization
    owner: string;
    repoName: string;      // Full name (namespace/name)
    repoUrl: string;
    starCount: number;
    status: string;
  };
}
```

#### WebhookEvent

Normalized event structure:

```typescript
interface WebhookEvent {
  type: 'push' | 'delete';    // Event type
  repository: string;          // Repository name
  namespace: string;           // Namespace/owner
  tag: string;                 // Tag name
  pusher: string;              // Who pushed
  timestamp: Date;             // When it happened
  images: string[];            // Image digests
}
```

### Helper Functions

#### `getFullRepositoryName(event: WebhookEvent): string`

Returns the full repository name in `namespace/repository` format.

```typescript
const fullName = getFullRepositoryName(event);
// "myorg/myrepo"
```

#### `getImageReference(event: WebhookEvent): string`

Returns the full image reference in `namespace/repository:tag` format.

```typescript
const imageRef = getImageReference(event);
// "myorg/myrepo:v1.2.3"
```

#### `isPushEvent(event: WebhookEvent): boolean`

Checks if the event is a push event.

```typescript
if (isPushEvent(event)) {
  console.log('New image pushed!');
}
```

#### `isPrivateRepository(payload: WebhookPayload): boolean`

Checks if the repository is private.

```typescript
if (isPrivateRepository(payload)) {
  console.log('Private repository');
}
```

#### `isOfficialImage(payload: WebhookPayload): boolean`

Checks if this is an official Docker Hub image.

```typescript
if (isOfficialImage(payload)) {
  console.log('Official image');
}
```

#### `extractRepositoryMetadata(payload: WebhookPayload)`

Extracts repository metadata from the payload.

```typescript
const metadata = extractRepositoryMetadata(payload);
console.log(`${metadata.name}: ${metadata.description}`);
console.log(`Stars: ${metadata.starCount}`);
```

## Usage Examples

### Express.js

```typescript
import express from 'express';
import { createWebhookHandler } from '@integrations/docker-hub/webhook';

const app = express();
const webhookHandler = createWebhookHandler();

app.post(
  '/webhooks/docker-hub',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const event = await webhookHandler.handle(req.body);

      console.log(`Push to ${event.namespace}/${event.repository}:${event.tag}`);

      // Process the event
      await deployImage(event);

      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Webhook failed:', error);
      res.status(400).json({ error: 'Invalid webhook' });
    }
  }
);
```

### AWS Lambda

```typescript
import { createWebhookHandler } from '@integrations/docker-hub/webhook';

const handler = createWebhookHandler();

export async function lambdaHandler(event: any) {
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;

    const webhookEvent = await handler.handle(body);

    await processWebhook(webhookEvent);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'ok' }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid webhook' }),
    };
  }
}
```

### Filtering Events

```typescript
const event = await handler.handle(requestBody);

// Only process production tags
if (event.tag === 'latest' || event.tag.startsWith('v')) {
  await deployToProduction(event);
}

// Only process specific namespaces
if (event.namespace === 'myorg') {
  await notifyTeam(event);
}
```

### Error Handling

```typescript
import { DockerHubError, isDockerHubError } from '@integrations/docker-hub';

try {
  const event = await handler.handle(requestBody);
  await processEvent(event);
} catch (error) {
  if (isDockerHubError(error)) {
    console.error('Docker Hub error:', error.kind, error.message);
    console.error('Status code:', error.statusCode);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Webhook Payload Example

Here's what a typical Docker Hub webhook payload looks like:

```json
{
  "callbackUrl": "https://registry.hub.docker.com/u/username/repo/hook/id/",
  "pushData": {
    "pushedAt": 1702857600,
    "pusher": "johndoe",
    "tag": "v1.2.3",
    "images": [
      "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    ]
  },
  "repository": {
    "commentCount": 0,
    "dateCreated": 1700000000,
    "description": "My awesome Docker image",
    "dockerfile": "FROM alpine\\nRUN echo hello",
    "fullDescription": "# My Image\\n\\nDetailed description.",
    "isOfficial": false,
    "isPrivate": false,
    "isTrusted": false,
    "name": "myrepo",
    "namespace": "username",
    "owner": "johndoe",
    "repoName": "username/myrepo",
    "repoUrl": "https://hub.docker.com/r/username/myrepo",
    "starCount": 42,
    "status": "Active"
  }
}
```

## Security Considerations

### No Signature Verification

**Important:** Docker Hub does not currently provide cryptographic signatures for webhooks (unlike GitHub). This means:

1. **IP Filtering**: Consider restricting webhook endpoints to Docker Hub's IP ranges
2. **Validation**: The handler validates payload structure but cannot verify authenticity
3. **Network Security**: Use HTTPS and consider additional authentication mechanisms
4. **Rate Limiting**: Implement rate limiting to prevent abuse

### Best Practices

1. **Use HTTPS**: Always use HTTPS for webhook endpoints
2. **Validate Payloads**: The handler validates structure, but verify business logic
3. **Implement Timeouts**: Set reasonable timeouts for webhook processing
4. **Log Everything**: Log all webhook attempts for audit trails
5. **Error Handling**: Don't expose internal errors to webhook responses
6. **Idempotency**: Design handlers to be idempotent (same event processed multiple times = same result)

## Testing

```typescript
import { createWebhookHandler } from '@integrations/docker-hub/webhook';

const handler = createWebhookHandler();

const testPayload = JSON.stringify({
  callbackUrl: "https://registry.hub.docker.com/u/test/repo/hook/1/",
  pushData: {
    pushedAt: 1702857600,
    pusher: "testuser",
    tag: "v1.0.0",
    images: ["sha256:abc123..."]
  },
  repository: {
    commentCount: 0,
    dateCreated: 1700000000,
    description: "Test repo",
    dockerfile: "",
    fullDescription: "",
    isOfficial: false,
    isPrivate: false,
    isTrusted: false,
    name: "testrepo",
    namespace: "testuser",
    owner: "testuser",
    repoName: "testuser/testrepo",
    repoUrl: "https://hub.docker.com/r/testuser/testrepo",
    starCount: 0,
    status: "Active"
  }
});

const event = await handler.handle(testPayload);
console.assert(event.type === 'push');
console.assert(event.tag === 'v1.0.0');
```

## Troubleshooting

### Invalid Payload Error

If you get "Invalid webhook payload structure" errors:

1. Verify the payload is valid JSON
2. Check all required fields are present
3. Ensure field types match the schema
4. Log the raw payload for inspection

### Timestamp Issues

Docker Hub sends timestamps as Unix epoch in **seconds** (not milliseconds). The handler automatically converts these to JavaScript Date objects.

### Encoding Issues

The handler accepts both string and Uint8Array bodies, automatically handling UTF-8 decoding.

## License

MIT

## Contributing

Contributions welcome! Please ensure:

1. All code follows TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Follow SPARC specification guidelines

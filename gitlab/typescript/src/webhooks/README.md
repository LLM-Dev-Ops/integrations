# GitLab Webhooks

Secure webhook validation and event handling for GitLab CI/CD pipelines and jobs.

## Features

- **Secure Token Validation**: Constant-time string comparison prevents timing attacks
- **Token Rotation Support**: Configure multiple valid tokens for seamless rotation
- **IP Allowlisting**: Optional IP-based access control with CIDR support
- **Payload Size Limits**: Configurable size limits to prevent abuse (default: 1MB)
- **Type-Safe Event Handling**: Fully typed pipeline and job event payloads
- **Event Routing**: Automatic routing to appropriate handlers based on event type

## Quick Start

### Basic Setup

```typescript
import { WebhookValidator, WebhookHandler } from './webhooks';

// Create validator
const validator = new WebhookValidator({
  expectedTokens: ['your-secret-token'],
  maxPayloadSize: 2 * 1024 * 1024, // 2MB
});

// Create handler
const handler = new WebhookHandler(validator);

// Register event handlers
handler.onPipelineEvent(async (event) => {
  console.log(`Pipeline ${event.object_attributes.id}: ${event.object_attributes.status}`);

  if (event.object_attributes.status === 'success') {
    // Handle successful pipeline
  } else if (event.object_attributes.status === 'failed') {
    // Handle failed pipeline
  }
});

handler.onJobEvent(async (event) => {
  console.log(`Job ${event.build_name}: ${event.build_status}`);

  if (event.build_status === 'failed') {
    console.error(`Failure reason: ${event.build_failure_reason}`);
  }
});

// Process incoming webhook
const response = await handler.handle({
  headers: request.headers,
  body: request.body,
  ip: request.ip, // Optional
});

console.log(response.status); // 'processed', 'ignored', or 'error'
```

### Express.js Integration

```typescript
import express from 'express';
import { WebhookValidator, WebhookHandler } from './webhooks';

const app = express();
app.use(express.json());

const validator = new WebhookValidator({
  expectedTokens: [process.env.GITLAB_WEBHOOK_TOKEN!],
});

const handler = new WebhookHandler(validator);

// Register handlers
handler.onPipelineEvent(async (event) => {
  // Process pipeline event
});

handler.onJobEvent(async (event) => {
  // Process job event
});

app.post('/webhooks/gitlab', async (req, res) => {
  try {
    const response = await handler.handle({
      headers: req.headers as Record<string, string>,
      body: req.body,
      ip: req.ip,
    });

    if (response.status === 'error') {
      res.status(400).json(response);
    } else {
      res.status(200).json(response);
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

app.listen(3000);
```

## Configuration

### WebhookValidator

```typescript
interface WebhookValidatorConfig {
  // Required: List of valid webhook tokens
  expectedTokens: string[];

  // Optional: IP allowlist (supports CIDR notation)
  allowedIps?: string[];

  // Optional: Maximum payload size in bytes (default: 1MB)
  maxPayloadSize?: number;
}
```

### Token Rotation

Support for multiple tokens enables zero-downtime token rotation:

```typescript
const validator = new WebhookValidator({
  expectedTokens: [
    'current-token',  // Active token
    'new-token',      // New token being rolled out
  ],
});

// After rotation is complete, remove old token:
const validator = new WebhookValidator({
  expectedTokens: ['new-token'],
});
```

### IP Allowlisting

```typescript
const validator = new WebhookValidator({
  expectedTokens: ['token'],
  allowedIps: [
    '192.168.1.100',      // Single IP
    '10.0.0.0/24',        // CIDR range
    '172.16.0.0/16',      // Larger CIDR range
  ],
});
```

## Event Types

### Pipeline Events

Triggered when a pipeline is created, updated, or completes.

```typescript
interface PipelineWebhookEvent {
  object_kind: 'pipeline';
  object_attributes: {
    id: number;
    ref: string;
    sha: string;
    status: PipelineStatus;
    created_at: string;
    started_at?: string;
    finished_at?: string;
    duration?: number;
    // ... more fields
  };
  builds?: Array<{
    id: number;
    name: string;
    stage: string;
    status: JobStatus;
    // ... more fields
  }>;
  // ... more fields
}
```

**Example Handler:**

```typescript
handler.onPipelineEvent(async (event) => {
  const { id, status, ref, duration } = event.object_attributes;

  console.log(`Pipeline #${id} on ${ref}: ${status}`);

  if (status === 'success') {
    console.log(`Completed in ${duration}s`);
  }

  // Access builds/jobs
  if (event.builds) {
    const failedJobs = event.builds.filter(b => b.status === 'failed');
    if (failedJobs.length > 0) {
      console.log(`Failed jobs: ${failedJobs.map(j => j.name).join(', ')}`);
    }
  }
});
```

### Job Events

Triggered when a job (build) is created, started, or completes.

```typescript
interface JobWebhookEvent {
  object_kind: 'build';
  build_id: number;
  build_name: string;
  build_stage: string;
  build_status: JobStatus;
  build_started_at?: string;
  build_finished_at?: string;
  build_duration?: number;
  build_failure_reason?: string;
  ref: string;
  sha: string;
  // ... more fields
}
```

**Example Handler:**

```typescript
handler.onJobEvent(async (event) => {
  console.log(`Job: ${event.build_name} (${event.build_stage})`);
  console.log(`Status: ${event.build_status}`);

  if (event.build_status === 'failed') {
    console.error(`Failed: ${event.build_failure_reason}`);

    // Notify team, create issue, etc.
    if (!event.build_allow_failure) {
      await notifyTeam({
        job: event.build_name,
        reason: event.build_failure_reason,
        ref: event.ref,
      });
    }
  }
});
```

## Security Best Practices

1. **Always use HTTPS** for webhook endpoints in production
2. **Use strong, random tokens** (minimum 32 characters)
3. **Rotate tokens regularly** using the multi-token support
4. **Enable IP allowlisting** if possible to restrict webhook sources
5. **Set appropriate payload size limits** based on your needs
6. **Monitor webhook failures** and alert on validation errors
7. **Log webhook events** for audit and debugging purposes

## Error Handling

The handler returns different statuses based on the processing outcome:

```typescript
const response = await handler.handle(request);

switch (response.status) {
  case 'processed':
    // Event was successfully handled
    console.log('Success:', response.message);
    break;

  case 'ignored':
    // Event type not supported or no handlers registered
    console.log('Ignored:', response.message);
    break;

  case 'error':
    // Validation failed or handler threw an error
    console.error('Error:', response.message);
    break;
}
```

### Common Errors

- **WebhookValidationError**: Token mismatch, invalid IP, or oversized payload
- **InvalidWebhookEventError**: Missing or malformed event headers/payload
- **UnknownWebhookEventError**: Unsupported event type
- **SerializationError**: Failed to parse JSON payload

## Testing

### Mock Webhook Request

```typescript
import { WebhookValidator, WebhookHandler } from './webhooks';

const validator = new WebhookValidator({
  expectedTokens: ['test-token'],
});

const handler = new WebhookHandler(validator);

// Register test handler
let receivedEvent: any = null;
handler.onPipelineEvent(async (event) => {
  receivedEvent = event;
});

// Send mock webhook
const response = await handler.handle({
  headers: {
    'x-gitlab-token': 'test-token',
    'x-gitlab-event': 'Pipeline Hook',
  },
  body: {
    object_kind: 'pipeline',
    object_attributes: {
      id: 123,
      ref: 'main',
      sha: 'abc123',
      status: 'success',
      created_at: new Date().toISOString(),
    },
    project: {
      id: 1,
      name: 'test-project',
      path_with_namespace: 'group/test-project',
    },
  },
});

console.log(response.status); // 'processed'
console.log(receivedEvent?.object_attributes.id); // 123
```

## GitLab Webhook Configuration

Configure webhooks in your GitLab project:

1. Go to **Settings > Webhooks**
2. Set **URL** to your endpoint (e.g., `https://api.example.com/webhooks/gitlab`)
3. Set **Secret token** to match your `expectedTokens`
4. Select triggers:
   - ✓ Pipeline events
   - ✓ Job events
5. Optionally enable **SSL verification**
6. Click **Add webhook**

## References

- [GitLab Webhook Documentation](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html)
- [GitLab Pipeline Events](https://docs.gitlab.com/ee/user/project/integrations/webhook_events.html#pipeline-events)
- [GitLab Job Events](https://docs.gitlab.com/ee/user/project/integrations/webhook_events.html#job-events)

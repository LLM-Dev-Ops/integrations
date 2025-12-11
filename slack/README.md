# Slack Integration

Production-ready Slack API integration with comprehensive support for Web API, Socket Mode, Events API, and Webhooks.

## Features

- **Web API Coverage**: Full support for Conversations, Messages, Users, Files, Reactions, Pins, and Views
- **Socket Mode**: Real-time events via WebSocket connection
- **Events API**: Webhook-based event delivery with signature verification
- **Incoming Webhooks**: Send messages to channels via webhooks
- **Slash Commands**: Handle custom slash commands
- **Interactive Components**: Buttons, select menus, modals, and app home
- **Resilience**: Retry with exponential backoff, circuit breaker, and rate limiting
- **Observability**: Structured logging, metrics, and distributed tracing

## Installation

### Rust

Add to your `Cargo.toml`:

```toml
[dependencies]
slack-client = { path = "rust" }
```

### TypeScript

```bash
npm install @anthropic/slack-client
# or
yarn add @anthropic/slack-client
```

## Quick Start

### Rust

```rust
use slack_client::{SlackClient, SlackConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create client from environment
    let client = slack_client::create_client_from_env()?;

    // Post a message
    let response = client.messages().post(
        PostMessageRequest::new("#general", "Hello, Slack!")
    ).await?;

    println!("Message posted: {}", response.ts);
    Ok(())
}
```

### TypeScript

```typescript
import { createSlack, createSlackFromEnv } from '@anthropic/slack-client';

// Create client from token
const slack = createSlack('xoxb-your-bot-token');

// Or from environment variables
const slack = createSlackFromEnv();

// Post a message
const response = await slack.services.messages.post({
  channel: '#general',
  text: 'Hello, Slack!',
});

console.log(`Message posted: ${response.ts}`);
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot token (xoxb-*) |
| `SLACK_USER_TOKEN` | User token (xoxp-*) |
| `SLACK_APP_TOKEN` | App-level token (xapp-*) for Socket Mode |
| `SLACK_SIGNING_SECRET` | Signing secret for webhook verification |
| `SLACK_CLIENT_ID` | OAuth client ID |
| `SLACK_CLIENT_SECRET` | OAuth client secret |

## Services

### Conversations

```typescript
// List channels
const channels = await slack.services.conversations.listAll();

// Get channel history
const messages = await slack.services.conversations.historyAll({
  channel: 'C123456789',
});

// Create a channel
const channel = await slack.services.conversations.create({
  name: 'new-channel',
});
```

### Messages

```typescript
// Post a message
await slack.services.messages.post({
  channel: 'C123456789',
  text: 'Hello!',
  blocks: [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Bold* and _italic_' },
    },
  ],
});

// Update a message
await slack.services.messages.update({
  channel: 'C123456789',
  ts: '1234567890.123456',
  text: 'Updated message',
});

// Schedule a message
await slack.services.messages.schedule({
  channel: 'C123456789',
  text: 'Scheduled message',
  post_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
});
```

### Users

```typescript
// List users
const users = await slack.services.users.listAll();

// Get user info
const user = await slack.services.users.info({ user: 'U123456789' });

// Find by email
const user = await slack.services.users.lookupByEmail('user@example.com');
```

### Files

```typescript
// Upload a file
const file = await slack.services.files.upload({
  channels: ['C123456789'],
  content: 'File content',
  filename: 'example.txt',
});

// List files
const files = await slack.services.files.list({ channel: 'C123456789' });
```

### Reactions

```typescript
// Add reaction
await slack.services.reactions.add({
  channel: 'C123456789',
  timestamp: '1234567890.123456',
  name: 'thumbsup',
});

// Remove reaction
await slack.services.reactions.remove({
  channel: 'C123456789',
  timestamp: '1234567890.123456',
  name: 'thumbsup',
});
```

## Socket Mode

Connect to Slack's Socket Mode for real-time events:

```typescript
import { createSocketModeClient } from '@anthropic/slack-client';

const socketClient = createSocketModeClient({
  appToken: process.env.SLACK_APP_TOKEN,
});

// Handle events
socketClient.on('message', async (event, context) => {
  console.log(`New message: ${event.text}`);
});

// Connect
await socketClient.connect();
```

## Events API

Handle events via HTTP webhooks:

```typescript
import { createEventDispatcher, createWebhookHandler } from '@anthropic/slack-client';

const dispatcher = createEventDispatcher();
const webhookHandler = createWebhookHandler(process.env.SLACK_SIGNING_SECRET);

// Register handlers
dispatcher.on('message', async (event, context) => {
  console.log(`Message: ${event.text}`);
});

// In your HTTP handler
app.post('/slack/events', async (req, res) => {
  const body = req.body;

  // Handle URL verification
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge });
  }

  // Verify signature
  if (!webhookHandler.verifyRequest(req.headers, JSON.stringify(body))) {
    return res.status(401).send('Invalid signature');
  }

  // Dispatch event
  await dispatcher.handleRequest(body);
  res.status(200).send();
});
```

## Incoming Webhooks

```typescript
import { createIncomingWebhook } from '@anthropic/slack-client';

const webhook = createIncomingWebhook(process.env.SLACK_WEBHOOK_URL);

// Send message
await webhook.send('Hello from webhook!');

// Send with blocks
await webhook.sendBlocks([
  {
    type: 'section',
    text: { type: 'mrkdwn', text: '*Important announcement*' },
  },
]);
```

## Views (Modals)

```typescript
import { ViewsService } from '@anthropic/slack-client';

// Open a modal
await slack.services.views.open({
  trigger_id: 'trigger_id_from_interaction',
  view: ViewsService.createModal({
    title: 'My Modal',
    submitText: 'Submit',
    callbackId: 'my_modal',
  })
    .addSection('Welcome to my modal!')
    .addInput('Name', { type: 'plain_text_input', action_id: 'name_input' })
    .build(),
});
```

## Resilience

The client includes built-in resilience features:

### Retry

```typescript
import { createResilience } from '@anthropic/slack-client';

const resilience = createResilience({
  retry: {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
  },
});
```

### Circuit Breaker

```typescript
const resilience = createResilience({
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  },
});
```

### Rate Limiting

The client automatically respects Slack's rate limits and implements client-side rate limiting to prevent hitting API limits.

## Testing

### Mocks

```typescript
import { createMockClient, channelFixtures, messageFixtures } from '@anthropic/slack-client';

const mock = createMockClient();

// Mock responses
mock.mockConversationsList([
  channelFixtures.publicChannel({ name: 'general' }),
]);

mock.mockPostMessage('C123', '1234.5678');

// Use mock for testing
const calls = mock.getCalls();
```

### Fixtures

```typescript
import { channelFixtures, messageFixtures, userFixtures } from '@anthropic/slack-client';

// Create test data
const channel = channelFixtures.publicChannel({ name: 'test-channel' });
const message = messageFixtures.simple('Test message');
const user = userFixtures.regular({ name: 'testuser' });
```

## API Reference

See the generated documentation for full API reference:

- **Rust**: `cargo doc --open`
- **TypeScript**: Check the TypeScript definitions

## Rate Limit Tiers

Slack uses different rate limit tiers:

| Tier | Requests/Minute | Common Methods |
|------|-----------------|----------------|
| Tier 1 | 1 | Special methods |
| Tier 2 | 20 | conversations.list, users.list |
| Tier 3 | 50 | conversations.history, chat.update |
| Tier 4 | 100+ | chat.postMessage, auth.test |

## License

MIT

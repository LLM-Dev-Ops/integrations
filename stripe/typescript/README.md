# @integrations/stripe

Production-ready TypeScript client for the Stripe API - LLM DevOps Platform Integration.

## Features

- **Payment Intents**: Create, confirm, capture, and cancel payment intents
- **Subscriptions**: Full lifecycle management with pause/resume support
- **Invoices**: Retrieve, finalize, pay, and void invoices
- **Webhook Processing**: Signature verification and event dispatch
- **Checkout Sessions**: Hosted checkout page generation
- **Billing Portal**: Customer self-service session creation
- **Idempotency**: Automatic key generation and response caching
- **Resilience**: Retry logic with exponential backoff and circuit breaker
- **Simulation**: Record/replay for CI/CD testing

## Installation

```bash
npm install @integrations/stripe
```

## Quick Start

```typescript
import { createClient, createClientFromEnv } from '@integrations/stripe';

// Create client with explicit configuration
const client = createClient({
  apiKey: 'sk_test_...',
  webhookSecret: 'whsec_...',
});

// Or create from environment variables
const client = createClientFromEnv();

// Create a payment intent
const paymentIntent = await client.paymentIntents.create({
  amount: 1000, // $10.00
  currency: 'usd',
  customer: 'cus_xxx',
});

console.log('Payment Intent:', paymentIntent.id);
console.log('Client Secret:', paymentIntent.client_secret);
```

## Configuration

### Environment Variables

```bash
# Required
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Optional
STRIPE_API_VERSION=2024-12-18.acacia
STRIPE_BASE_URL=https://api.stripe.com/v1
STRIPE_TIMEOUT=30000
STRIPE_MAX_RETRIES=3
```

### Programmatic Configuration

```typescript
import { createClient } from '@integrations/stripe';

const client = createClient({
  apiKey: 'sk_test_...',
  webhookSecret: 'whsec_...',
  apiVersion: '2024-12-18.acacia',
  timeout: 30000,
  maxRetries: 3,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
  },
  idempotency: {
    strategy: 'content_hash',
    cacheTtl: 86400000, // 24 hours
    cacheSize: 10000,
  },
});
```

### Builder Pattern

```typescript
import { builder } from '@integrations/stripe';

const client = builder()
  .apiKey('sk_test_...')
  .webhookSecret('whsec_...')
  .timeout(30000)
  .maxRetries(3)
  .build();
```

## API Reference

### Payment Intents

```typescript
// Create
const pi = await client.paymentIntents.create({
  amount: 1000,
  currency: 'usd',
  customer: 'cus_xxx',
});

// Retrieve
const pi = await client.paymentIntents.retrieve('pi_xxx');

// Confirm
const pi = await client.paymentIntents.confirm('pi_xxx', {
  payment_method: 'pm_xxx',
});

// Capture
const pi = await client.paymentIntents.capture('pi_xxx');

// Cancel
const pi = await client.paymentIntents.cancel('pi_xxx', {
  cancellation_reason: 'requested_by_customer',
});

// List
const list = await client.paymentIntents.list({
  customer: 'cus_xxx',
  limit: 10,
});
```

### Subscriptions

```typescript
// Create
const sub = await client.subscriptions.create({
  customer: 'cus_xxx',
  items: [{ price: 'price_xxx', quantity: 1 }],
  trial_period_days: 14,
});

// Update
const sub = await client.subscriptions.update('sub_xxx', {
  items: [{ id: 'si_xxx', price: 'price_yyy' }],
  proration_behavior: 'create_prorations',
});

// Cancel
const sub = await client.subscriptions.cancel('sub_xxx', true); // at period end

// Pause
const sub = await client.subscriptions.pause('sub_xxx');

// Resume
const sub = await client.subscriptions.resume('sub_xxx');
```

### Invoices

```typescript
// Retrieve
const invoice = await client.invoices.retrieve('in_xxx');

// List
const list = await client.invoices.list({
  customer: 'cus_xxx',
  status: 'open',
});

// Finalize
const invoice = await client.invoices.finalize('in_xxx');

// Pay
const invoice = await client.invoices.pay('in_xxx', {
  payment_method: 'pm_xxx',
});

// Void
const invoice = await client.invoices.void('in_xxx');

// Upcoming
const invoice = await client.invoices.upcoming({
  customer: 'cus_xxx',
  subscription: 'sub_xxx',
});
```

### Webhooks

```typescript
import { EventTypes } from '@integrations/stripe';

// Setup webhook handlers
const webhooks = client.webhooks();

webhooks
  .on(EventTypes.PAYMENT_INTENT_SUCCEEDED, async (event) => {
    const paymentIntent = event.data.object;
    console.log('Payment succeeded:', paymentIntent.id);
  })
  .on(EventTypes.SUBSCRIPTION_CREATED, async (event) => {
    const subscription = event.data.object;
    console.log('Subscription created:', subscription.id);
  });

// Process incoming webhook (in your HTTP handler)
async function handleWebhook(req: Request) {
  const payload = {
    rawBody: await req.text(),
    signature: req.headers.get('stripe-signature')!,
  };

  const event = webhooks.verifyAndParse(payload);
  await webhooks.processEvent(event);
}
```

### Checkout Sessions

```typescript
// Create checkout session
const session = await client.sessions.createCheckout({
  mode: 'subscription',
  success_url: 'https://example.com/success',
  cancel_url: 'https://example.com/cancel',
  customer: 'cus_xxx',
  line_items: [{ price: 'price_xxx', quantity: 1 }],
});

console.log('Checkout URL:', session.url);

// Create billing portal session
const portal = await client.sessions.createBillingPortal({
  customer: 'cus_xxx',
  return_url: 'https://example.com/account',
});

console.log('Portal URL:', portal.url);
```

## Simulation / Testing

```typescript
import {
  createClient,
  SimulationRecorder,
  SimulationReplayer,
  FileRecordingStorage,
  mockPaymentIntentSucceededEvent,
} from '@integrations/stripe';

// Record mode
const storage = new FileRecordingStorage('./recordings.json');
const recorder = new SimulationRecorder(storage);

// After making API calls
await recorder.save();

// Replay mode in tests
const recordings = await storage.load();
const replayer = new SimulationReplayer(recordings);

// Mock webhook events for testing
const event = mockPaymentIntentSucceededEvent(1000, 'usd');
await webhooks.processEvent(event);
```

## Error Handling

```typescript
import {
  StripeError,
  CardError,
  RateLimitError,
  ValidationError,
} from '@integrations/stripe';

try {
  await client.paymentIntents.create({
    amount: 1000,
    currency: 'usd',
  });
} catch (error) {
  if (error instanceof CardError) {
    console.log('Card declined:', error.declineCode);
  } else if (error instanceof RateLimitError) {
    console.log('Rate limited, retry after:', error.retryAfter);
  } else if (error instanceof ValidationError) {
    console.log('Invalid parameter:', error.param);
  } else if (error instanceof StripeError) {
    console.log('Stripe error:', error.message);
  }
}
```

## Health Check

```typescript
const health = await client.healthCheck();
console.log('Healthy:', health.healthy);
console.log('Latency:', health.latencyMs, 'ms');
console.log('API Version:', health.apiVersion);
```

## License

MIT

# HubSpot API Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/hubspot-api`

---

## 1. Implementation Checklist

### 1.1 Core Components

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 1 | HubSpotClient interface | `src/client.ts` | ☐ | ☐ |
| 2 | HubSpotClientImpl | `src/client.ts` | ☐ | ☐ |
| 3 | HubSpotConfig type | `src/types/config.ts` | ☐ | ☐ |
| 4 | Configuration validation | `src/config.ts` | ☐ | ☐ |

### 1.2 CRM Object Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 5 | createObject | `src/operations/objects.ts` | ☐ | ☐ |
| 6 | getObject | `src/operations/objects.ts` | ☐ | ☐ |
| 7 | updateObject | `src/operations/objects.ts` | ☐ | ☐ |
| 8 | deleteObject | `src/operations/objects.ts` | ☐ | ☐ |
| 9 | CrmObject type | `src/types/objects.ts` | ☐ | ☐ |
| 10 | ObjectType enum | `src/types/objects.ts` | ☐ | ☐ |

### 1.3 Batch Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 11 | batchCreate | `src/operations/batch.ts` | ☐ | ☐ |
| 12 | batchRead | `src/operations/batch.ts` | ☐ | ☐ |
| 13 | batchUpdate | `src/operations/batch.ts` | ☐ | ☐ |
| 14 | batchArchive | `src/operations/batch.ts` | ☐ | ☐ |
| 15 | Chunk processing | `src/operations/batch.ts` | ☐ | ☐ |
| 16 | BatchResult type | `src/types/batch.ts` | ☐ | ☐ |

### 1.4 Search Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 17 | searchObjects | `src/operations/search.ts` | ☐ | ☐ |
| 18 | searchAll iterator | `src/operations/search.ts` | ☐ | ☐ |
| 19 | Filter builder | `src/operations/search.ts` | ☐ | ☐ |
| 20 | SearchQuery type | `src/types/search.ts` | ☐ | ☐ |
| 21 | FilterOperator type | `src/types/search.ts` | ☐ | ☐ |

### 1.5 Association Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 22 | createAssociation | `src/operations/associations.ts` | ☐ | ☐ |
| 23 | getAssociations | `src/operations/associations.ts` | ☐ | ☐ |
| 24 | deleteAssociation | `src/operations/associations.ts` | ☐ | ☐ |
| 25 | batchAssociate | `src/operations/associations.ts` | ☐ | ☐ |
| 26 | Association type | `src/types/associations.ts` | ☐ | ☐ |

### 1.6 Pipeline Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 27 | getPipelines | `src/operations/pipelines.ts` | ☐ | ☐ |
| 28 | getPipelineStages | `src/operations/pipelines.ts` | ☐ | ☐ |
| 29 | moveToPipelineStage | `src/operations/pipelines.ts` | ☐ | ☐ |
| 30 | Pipeline type | `src/types/pipelines.ts` | ☐ | ☐ |

### 1.7 Engagement Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 31 | createEngagement | `src/operations/engagements.ts` | ☐ | ☐ |
| 32 | getEngagements | `src/operations/engagements.ts` | ☐ | ☐ |
| 33 | updateEngagement | `src/operations/engagements.ts` | ☐ | ☐ |
| 34 | EngagementType enum | `src/types/engagements.ts` | ☐ | ☐ |

### 1.8 Rate Limiting

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 35 | RateLimiter class | `src/rate-limiter.ts` | ☐ | ☐ |
| 36 | Token bucket (daily) | `src/rate-limiter.ts` | ☐ | ☐ |
| 37 | Token bucket (burst) | `src/rate-limiter.ts` | ☐ | ☐ |
| 38 | Token bucket (search) | `src/rate-limiter.ts` | ☐ | ☐ |
| 39 | Header sync | `src/rate-limiter.ts` | ☐ | ☐ |
| 40 | RateLimitStatus type | `src/types/rate-limit.ts` | ☐ | ☐ |

### 1.9 Token Management

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 41 | TokenManager class | `src/token-manager.ts` | ☐ | ☐ |
| 42 | Token validation | `src/token-manager.ts` | ☐ | ☐ |
| 43 | Token refresh | `src/token-manager.ts` | ☐ | ☐ |
| 44 | Concurrent refresh prevention | `src/token-manager.ts` | ☐ | ☐ |

### 1.10 Webhook Processing

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 45 | WebhookProcessor class | `src/webhooks/processor.ts` | ☐ | ☐ |
| 46 | Signature validation | `src/webhooks/signature.ts` | ☐ | ☐ |
| 47 | Event parsing | `src/webhooks/parser.ts` | ☐ | ☐ |
| 48 | Deduplication | `src/webhooks/dedup.ts` | ☐ | ☐ |
| 49 | Handler routing | `src/webhooks/router.ts` | ☐ | ☐ |
| 50 | WebhookEvent type | `src/types/webhooks.ts` | ☐ | ☐ |

### 1.11 HTTP Transport

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 51 | HttpClient class | `src/http/client.ts` | ☐ | ☐ |
| 52 | Request execution | `src/http/client.ts` | ☐ | ☐ |
| 53 | Retry logic | `src/http/retry.ts` | ☐ | ☐ |
| 54 | Backoff calculation | `src/http/retry.ts` | ☐ | ☐ |

### 1.12 Error Handling

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 55 | HubSpotError base | `src/errors.ts` | ☐ | ☐ |
| 56 | AuthenticationError | `src/errors.ts` | ☐ | ☐ |
| 57 | RateLimitError | `src/errors.ts` | ☐ | ☐ |
| 58 | ValidationError | `src/errors.ts` | ☐ | ☐ |
| 59 | ObjectNotFoundError | `src/errors.ts` | ☐ | ☐ |
| 60 | WebhookError | `src/errors.ts` | ☐ | ☐ |
| 61 | Error parser | `src/error-parser.ts` | ☐ | ☐ |

### 1.13 Observability

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 62 | Metrics collector | `src/observability/metrics.ts` | ☐ | ☐ |
| 63 | Request metrics | `src/observability/metrics.ts` | ☐ | ☐ |
| 64 | Webhook metrics | `src/observability/metrics.ts` | ☐ | ☐ |
| 65 | Tracing spans | `src/observability/tracing.ts` | ☐ | ☐ |
| 66 | Structured logging | `src/observability/logging.ts` | ☐ | ☐ |

### 1.14 Testing Support

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 67 | MockHubSpotClient | `src/testing/mock-client.ts` | ☐ | ☐ |
| 68 | In-memory storage | `src/testing/mock-client.ts` | ☐ | ☐ |
| 69 | Request capture | `src/testing/mock-client.ts` | ☐ | ☐ |
| 70 | Response mocking | `src/testing/mock-client.ts` | ☐ | ☐ |
| 71 | Request recorder | `src/testing/recorder.ts` | ☐ | ☐ |
| 72 | Replay client | `src/testing/replay.ts` | ☐ | ☐ |

### 1.15 Utilities

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 73 | Health check | `src/utils/health.ts` | ☐ | ☐ |
| 74 | Request aggregator | `src/utils/aggregator.ts` | ☐ | ☐ |
| 75 | Cache manager | `src/utils/cache.ts` | ☐ | ☐ |

---

## 2. File Manifest

### 2.1 Directory Structure

```
integrations/hubspot-api/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── client.ts                   # HubSpotClient implementation
│   ├── config.ts                   # Configuration validation
│   ├── rate-limiter.ts             # Rate limit management
│   ├── token-manager.ts            # OAuth token handling
│   ├── errors.ts                   # Error classes
│   ├── error-parser.ts             # API error parsing
│   │
│   ├── types/
│   │   ├── index.ts                # Type exports
│   │   ├── config.ts               # Configuration types
│   │   ├── objects.ts              # CRM object types
│   │   ├── batch.ts                # Batch operation types
│   │   ├── search.ts               # Search types
│   │   ├── associations.ts         # Association types
│   │   ├── pipelines.ts            # Pipeline types
│   │   ├── engagements.ts          # Engagement types
│   │   ├── webhooks.ts             # Webhook types
│   │   └── rate-limit.ts           # Rate limit types
│   │
│   ├── operations/
│   │   ├── index.ts                # Operation exports
│   │   ├── objects.ts              # CRUD operations
│   │   ├── batch.ts                # Batch operations
│   │   ├── search.ts               # Search operations
│   │   ├── associations.ts         # Association operations
│   │   ├── pipelines.ts            # Pipeline operations
│   │   └── engagements.ts          # Engagement operations
│   │
│   ├── webhooks/
│   │   ├── index.ts                # Webhook exports
│   │   ├── processor.ts            # Main processor
│   │   ├── signature.ts            # Signature validation
│   │   ├── parser.ts               # Event parsing
│   │   ├── dedup.ts                # Deduplication
│   │   └── router.ts               # Handler routing
│   │
│   ├── http/
│   │   ├── index.ts                # HTTP exports
│   │   ├── client.ts               # HTTP client
│   │   └── retry.ts                # Retry logic
│   │
│   ├── observability/
│   │   ├── index.ts                # Observability exports
│   │   ├── metrics.ts              # Metrics collector
│   │   ├── tracing.ts              # Tracing integration
│   │   └── logging.ts              # Structured logging
│   │
│   ├── testing/
│   │   ├── index.ts                # Testing exports
│   │   ├── mock-client.ts          # Mock client
│   │   ├── recorder.ts             # Request recorder
│   │   └── replay.ts               # Replay client
│   │
│   └── utils/
│       ├── index.ts                # Utility exports
│       ├── health.ts               # Health checks
│       ├── aggregator.ts           # Request batching
│       └── cache.ts                # Response caching
│
├── tests/
│   ├── unit/
│   │   ├── rate-limiter.test.ts
│   │   ├── token-manager.test.ts
│   │   ├── webhook-processor.test.ts
│   │   ├── signature.test.ts
│   │   ├── error-parser.test.ts
│   │   └── search-builder.test.ts
│   │
│   ├── integration/
│   │   ├── contacts.test.ts
│   │   ├── companies.test.ts
│   │   ├── deals.test.ts
│   │   ├── associations.test.ts
│   │   ├── search.test.ts
│   │   └── webhooks.test.ts
│   │
│   └── fixtures/
│       ├── webhook-payloads.json
│       └── api-responses.json
│
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

### 2.2 File Count Summary

| Category | Files | Lines (est.) |
|----------|-------|--------------|
| Source (src/) | 35 | ~3,500 |
| Types | 10 | ~500 |
| Operations | 6 | ~800 |
| Webhooks | 6 | ~600 |
| HTTP | 3 | ~300 |
| Observability | 4 | ~300 |
| Testing support | 4 | ~400 |
| Unit tests | 6 | ~900 |
| Integration tests | 6 | ~600 |
| Config files | 4 | ~100 |
| **Total** | **84** | **~8,000** |

---

## 3. Dependency Specification

### 3.1 package.json

```json
{
  "name": "@llm-devops/hubspot-api",
  "version": "1.0.0",
  "description": "HubSpot API integration for LLM Dev Ops platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "peerDependencies": {
    "@llm-devops/auth": "^1.0.0",
    "@llm-devops/observability": "^1.0.0",
    "@llm-devops/tracing": "^1.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 4. CI/CD Configuration

### 4.1 GitHub Actions Workflow

```yaml
# .github/workflows/hubspot-api-ci.yml
name: HubSpot API Integration CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'integrations/hubspot-api/**'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/hubspot-api/**'

defaults:
  run:
    working-directory: integrations/hubspot-api

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/hubspot-api/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/hubspot-api/package-lock.json
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: integrations/hubspot-api/coverage/lcov.info
          flags: hubspot-api-unit

  integration-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/hubspot-api/package-lock.json
      - run: npm ci
      - run: npm run test:integration
        env:
          HUBSPOT_ACCESS_TOKEN: ${{ secrets.HUBSPOT_SANDBOX_TOKEN }}
          HUBSPOT_PORTAL_ID: ${{ secrets.HUBSPOT_SANDBOX_PORTAL }}

  build:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck, unit-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/hubspot-api/package-lock.json
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: integrations/hubspot-api/dist/

  publish:
    runs-on: ubuntu-latest
    needs: [build, integration-tests]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: integrations/hubspot-api/dist/
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 5. Operational Runbooks

### 5.1 Runbook: Rate Limit Exhausted

```
┌─────────────────────────────────────────────────────────────────────┐
│  RUNBOOK: HubSpot Rate Limit Exhausted                              │
│  Alert: hubspot_rate_limit_remaining < 1000                        │
└─────────────────────────────────────────────────────────────────────┘

SEVERITY: P2 (High)

SYMPTOMS:
- 429 errors from HubSpot API
- Requests being queued
- Operations timing out

DIAGNOSIS:

1. Check rate limit status:
   curl localhost:8080/health | jq '.checks.rateLimit'

2. Check recent request volume:
   Query: rate(hubspot_requests_total[1h])

3. Identify high-volume operations:
   Query: topk(5, sum by (operation) (rate(hubspot_requests_total[1h])))

RESOLUTION:

A. If approaching daily limit:
   - Reduce batch sizes
   - Defer non-critical operations
   - Enable request aggregation

B. If burst limit exceeded:
   - Enable burst smoothing
   - Reduce concurrent requests
   - Add delays between operations

C. If search limit exceeded:
   - Cache search results
   - Reduce search frequency
   - Use broader filters, fewer queries

PREVENTION:
- Monitor daily consumption trends
- Set up alerts at 50% and 80% thresholds
- Review and optimize high-volume operations
```

### 5.2 Runbook: Token Refresh Failure

```
┌─────────────────────────────────────────────────────────────────────┐
│  RUNBOOK: HubSpot Token Refresh Failure                             │
│  Alert: hubspot_token_refresh_errors > 0                           │
└─────────────────────────────────────────────────────────────────────┘

SEVERITY: P1 (Critical)

SYMPTOMS:
- 401 errors from HubSpot API
- All operations failing
- Token refresh loop

DIAGNOSIS:

1. Check token status:
   curl localhost:8080/health | jq '.checks.token'

2. Check recent auth errors:
   kubectl logs -l app=hubspot-integration | grep "401\|token\|refresh"

3. Verify credentials in secret manager:
   aws secretsmanager get-secret-value --secret-id hubspot/credentials

RESOLUTION:

A. If refresh token expired (>6 months):
   - Re-authorize via OAuth flow
   - Update stored tokens
   - Restart service

B. If client credentials invalid:
   - Verify client ID/secret in HubSpot app settings
   - Update credentials in secret manager
   - Restart service

C. If HubSpot app deauthorized:
   - Check HubSpot portal > Integrations
   - Re-authorize the integration
   - Update tokens

PREVENTION:
- Monitor token expiry
- Set up refresh well before expiry (not just on 401)
- Alert on refresh failures immediately
```

### 5.3 Runbook: Webhook Processing Backlog

```
┌─────────────────────────────────────────────────────────────────────┐
│  RUNBOOK: Webhook Processing Backlog                                │
│  Alert: hubspot_webhooks_pending > 100 for 5 minutes               │
└─────────────────────────────────────────────────────────────────────┘

SEVERITY: P3 (Medium)

SYMPTOMS:
- Webhooks not being processed
- Growing queue depth
- Stale CRM data in platform

DIAGNOSIS:

1. Check webhook queue:
   curl localhost:8080/webhooks/status

2. Check processing rate:
   Query: rate(hubspot_webhooks_processed[5m])

3. Check for errors:
   Query: rate(hubspot_webhooks_errors[5m])

RESOLUTION:

A. If handler is slow:
   - Scale up webhook processors
   - Optimize handler code
   - Add async processing for heavy operations

B. If high error rate:
   - Check handler logs for exceptions
   - Verify downstream services are healthy
   - Fix handler bugs

C. If burst of webhooks:
   - Normal during bulk CRM updates
   - Will clear naturally
   - Monitor for continued growth

PREVENTION:
- Auto-scale based on queue depth
- Keep handlers lightweight
- Async heavy processing
```

---

## 6. Deployment Guide

### 6.1 Environment Variables

```bash
# Required
HUBSPOT_ACCESS_TOKEN=pat-xxx           # Private app token or OAuth token
HUBSPOT_PORTAL_ID=12345678             # HubSpot portal ID

# OAuth (if using OAuth flow)
HUBSPOT_CLIENT_ID=xxx
HUBSPOT_CLIENT_SECRET=xxx
HUBSPOT_REFRESH_TOKEN=xxx

# Webhooks (if using)
HUBSPOT_WEBHOOK_SECRET=xxx             # From HubSpot app settings

# Optional
HUBSPOT_BASE_URL=https://api.hubapi.com
HUBSPOT_TIMEOUT=30000
HUBSPOT_MAX_RETRIES=3
HUBSPOT_DAILY_LIMIT=500000             # Based on tier
HUBSPOT_BURST_LIMIT=100
HUBSPOT_SEARCH_LIMIT=4

# Observability
LOG_LEVEL=info
METRICS_PORT=9090
```

### 6.2 Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hubspot-integration
spec:
  replicas: 2
  selector:
    matchLabels:
      app: hubspot-integration
  template:
    metadata:
      labels:
        app: hubspot-integration
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
    spec:
      containers:
        - name: hubspot
          image: llm-devops/hubspot-api:1.0.0
          ports:
            - containerPort: 8080
              name: http
            - containerPort: 8081
              name: webhooks
            - containerPort: 9090
              name: metrics
          env:
            - name: HUBSPOT_PORTAL_ID
              valueFrom:
                secretKeyRef:
                  name: hubspot-credentials
                  key: portalId
            - name: HUBSPOT_ACCESS_TOKEN
              valueFrom:
                secretKeyRef:
                  name: hubspot-credentials
                  key: accessToken
            - name: HUBSPOT_WEBHOOK_SECRET
              valueFrom:
                secretKeyRef:
                  name: hubspot-credentials
                  key: webhookSecret
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: hubspot-integration
spec:
  selector:
    app: hubspot-integration
  ports:
    - port: 8080
      name: http
    - port: 8081
      name: webhooks
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hubspot-webhooks
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  rules:
    - host: webhooks.example.com
      http:
        paths:
          - path: /hubspot
            pathType: Prefix
            backend:
              service:
                name: hubspot-integration
                port:
                  number: 8081
```

---

## 7. API Reference

### 7.1 Public Exports

```typescript
// Main client
export { HubSpotClient, createHubSpotClient } from './client';

// Configuration
export { HubSpotConfig, validateConfig } from './config';

// Types
export {
  ObjectType,
  CrmObject,
  Properties,
  SearchQuery,
  SearchResult,
  FilterClause,
  FilterOperator,
  BatchResult,
  Association,
  Pipeline,
  PipelineStage,
  EngagementType,
  WebhookEvent,
  RateLimitStatus,
} from './types';

// Errors
export {
  HubSpotError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  ObjectNotFoundError,
  WebhookError,
} from './errors';

// Webhooks
export { WebhookProcessor, WebhookHandler } from './webhooks';

// Testing
export { MockHubSpotClient, createTestClient } from './testing';

// Utilities
export { healthCheck } from './utils';
```

### 7.2 Quick Start Example

```typescript
import { createHubSpotClient } from '@llm-devops/hubspot-api';

// Create client
const hubspot = createHubSpotClient({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  portalId: process.env.HUBSPOT_PORTAL_ID,
});

// Create a contact
const contact = await hubspot.createObject('contacts', {
  email: 'john@example.com',
  firstname: 'John',
  lastname: 'Doe',
});

// Search contacts
const results = await hubspot.searchObjects('contacts', {
  filters: [
    { property: 'email', operator: 'CONTAINS', value: '@example.com' }
  ],
  properties: ['email', 'firstname', 'lastname'],
  limit: 10,
});

// Create association
await hubspot.createAssociation(
  { type: 'contacts', id: contact.id },
  { type: 'companies', id: '12345' },
  'contact_to_company'
);

// Handle webhooks
hubspot.webhooks.on('contact.creation', async (event) => {
  console.log('New contact:', event.objectId);
});

// Check rate limits
const status = hubspot.getRateLimitStatus();
console.log(`Daily remaining: ${status.daily.remaining}`);
```

---

## 8. Acceptance Criteria Verification

### 8.1 Functional Requirements

| Requirement | Test | Status |
|-------------|------|--------|
| CRUD operations for all object types | `objects.test.ts` | ☐ |
| Batch operations handle 100+ items | `batch.test.ts` | ☐ |
| Search with filters, sorting, pagination | `search.test.ts` | ☐ |
| Associations created and queried | `associations.test.ts` | ☐ |
| Webhooks validate and route correctly | `webhooks.test.ts` | ☐ |
| Rate limits respected automatically | `rate-limiter.test.ts` | ☐ |
| Token refresh works transparently | `token-manager.test.ts` | ☐ |

### 8.2 Non-Functional Requirements

| Requirement | Test | Status |
|-------------|------|--------|
| No data loss during rate limit backoff | Integration test | ☐ |
| Graceful degradation on API errors | Unit test | ☐ |
| Webhook signature validation secure | `signature.test.ts` | ☐ |
| Mock client enables full test coverage | Unit tests | ☐ |
| Replay produces deterministic results | `replay.test.ts` | ☐ |

### 8.3 Performance Requirements

| Requirement | Target | Test | Status |
|-------------|--------|------|--------|
| Single object read | < 200ms | Benchmark | ☐ |
| Single object create | < 300ms | Benchmark | ☐ |
| Batch (100 items) | < 2s | Benchmark | ☐ |
| Search query | < 500ms | Benchmark | ☐ |
| Webhook processing | < 100ms | Benchmark | ☐ |

---

## 9. Sign-Off

### 9.1 Approval Checklist

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tech Lead | | | ☐ |
| Security Review | | | ☐ |
| QA Lead | | | ☐ |
| DevOps | | | ☐ |

### 9.2 Release Criteria

- [ ] All unit tests passing (>80% coverage)
- [ ] Integration tests passing against sandbox
- [ ] Security review completed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Runbooks reviewed by ops team
- [ ] Deployment tested in staging

---

## 10. Summary

The HubSpot API Integration Module is ready for implementation with:

- **75 components** across 15 categories
- **84 files** totaling ~8,000 lines of code
- **Complete test coverage** plan (unit, integration)
- **Production-ready** CI/CD pipeline
- **Operational runbooks** for common scenarios
- **Kubernetes deployment** configuration

### SPARC Phases Complete

| Phase | Document | Status |
|-------|----------|--------|
| Specification | `specification-hubspot-api.md` | ✅ |
| Pseudocode | `pseudocode-hubspot-api.md` | ✅ |
| Architecture | `architecture-hubspot-api.md` | ✅ |
| Refinement | `refinement-hubspot-api.md` | ✅ |
| Completion | `completion-hubspot-api.md` | ✅ |

The module is ready for implementation following the London-School TDD approach.

# Datadog APM Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/datadog-apm`

---

## 1. Overview

This completion document provides the implementation roadmap, file manifests, test coverage requirements, CI/CD configuration, and operational runbooks for the Datadog APM Integration Module.

---

## 2. Implementation Checklist

### 2.1 Core Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 1 | Error types | `src/errors/index.ts` | P0 | ⬜ |
| 2 | Configuration | `src/config/config.ts` | P0 | ⬜ |
| 3 | Config validation | `src/config/validation.ts` | P0 | ⬜ |
| 4 | Config from environment | `src/config/env.ts` | P0 | ⬜ |
| 5 | Client interface | `src/client/interface.ts` | P0 | ⬜ |
| 6 | Client implementation | `src/client/client.ts` | P0 | ⬜ |
| 7 | Client factory | `src/client/factory.ts` | P0 | ⬜ |
| 8 | Type definitions | `src/types/index.ts` | P0 | ⬜ |

### 2.2 Tracing Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 9 | Span interface | `src/tracing/interface.ts` | P0 | ⬜ |
| 10 | Span implementation | `src/tracing/span.ts` | P0 | ⬜ |
| 11 | Span options | `src/tracing/options.ts` | P0 | ⬜ |
| 12 | Tracer wrapper | `src/tracing/tracer.ts` | P0 | ⬜ |
| 13 | Span timeout manager | `src/tracing/timeout.ts` | P1 | ⬜ |

### 2.3 Context Propagation

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 14 | Carrier interface | `src/propagation/carrier.ts` | P0 | ⬜ |
| 15 | Header carrier | `src/propagation/header-carrier.ts` | P0 | ⬜ |
| 16 | Datadog propagator | `src/propagation/datadog.ts` | P0 | ⬜ |
| 17 | W3C propagator | `src/propagation/w3c.ts` | P0 | ⬜ |
| 18 | Composite propagator | `src/propagation/composite.ts` | P0 | ⬜ |
| 19 | Trace ID converter | `src/propagation/trace-id.ts` | P0 | ⬜ |

### 2.4 Metrics Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 20 | Metrics interface | `src/metrics/interface.ts` | P0 | ⬜ |
| 21 | DogStatsD wrapper | `src/metrics/statsd.ts` | P0 | ⬜ |
| 22 | Metric coalescing | `src/metrics/coalescing.ts` | P1 | ⬜ |
| 23 | Timer utility | `src/metrics/timer.ts` | P0 | ⬜ |
| 24 | Cardinality protector | `src/metrics/cardinality.ts` | P1 | ⬜ |

### 2.5 Logging Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 25 | Log context | `src/logging/context.ts` | P0 | ⬜ |
| 26 | Log correlation | `src/logging/correlation.ts` | P0 | ⬜ |
| 27 | Correlated logger | `src/logging/logger.ts` | P1 | ⬜ |

### 2.6 LLM Instrumentation

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 28 | LLM span interface | `src/llm/interface.ts` | P0 | ⬜ |
| 29 | LLM span implementation | `src/llm/span.ts` | P0 | ⬜ |
| 30 | LLM semantic tags | `src/llm/tags.ts` | P0 | ⬜ |
| 31 | Streaming span | `src/llm/streaming.ts` | P0 | ⬜ |
| 32 | Token cost tracker | `src/llm/cost.ts` | P2 | ⬜ |
| 33 | Content sanitizer | `src/llm/sanitizer.ts` | P1 | ⬜ |

### 2.7 Agent Tracing

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 34 | Agent span interface | `src/agent/interface.ts` | P0 | ⬜ |
| 35 | Agent span implementation | `src/agent/span.ts` | P0 | ⬜ |
| 36 | Agent correlation | `src/agent/correlation.ts` | P1 | ⬜ |
| 37 | Tool call instrumentor | `src/agent/tool-call.ts` | P1 | ⬜ |
| 38 | Step tracing | `src/agent/step.ts` | P0 | ⬜ |

### 2.8 Security Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 39 | PII redactor | `src/security/redaction.ts` | P0 | ⬜ |
| 40 | Redaction rules | `src/security/rules.ts` | P0 | ⬜ |
| 41 | Tag blocker | `src/security/blocker.ts` | P0 | ⬜ |
| 42 | Safe serializer | `src/security/serializer.ts` | P1 | ⬜ |

### 2.9 Testing Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 43 | Mock client | `src/testing/mock-client.ts` | P0 | ⬜ |
| 44 | Mock span | `src/testing/mock-span.ts` | P0 | ⬜ |
| 45 | Assertions | `src/testing/assertions.ts` | P0 | ⬜ |
| 46 | Fixtures | `src/testing/fixtures.ts` | P1 | ⬜ |

### 2.10 Resilience Components

| # | Component | File | Priority | Status |
|---|-----------|------|----------|--------|
| 47 | Circuit breaker | `src/resilience/circuit-breaker.ts` | P1 | ⬜ |
| 48 | Agent health check | `src/resilience/health-check.ts` | P1 | ⬜ |
| 49 | Adaptive sampler | `src/resilience/sampler.ts` | P2 | ⬜ |

---

## 3. File Manifest

### 3.1 TypeScript Package Structure

```
integrations/datadog-apm/
├── typescript/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── README.md
│   │
│   ├── src/
│   │   ├── index.ts                          # Public API exports
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts                      # All type exports
│   │   │   ├── common.ts                     # Common types
│   │   │   ├── span.ts                       # Span types
│   │   │   ├── metric.ts                     # Metric types
│   │   │   └── config.ts                     # Config types
│   │   │
│   │   ├── errors/
│   │   │   ├── index.ts                      # Error exports
│   │   │   ├── base.ts                       # DatadogAPMError base
│   │   │   ├── configuration.ts              # ConfigurationError
│   │   │   ├── connection.ts                 # ConnectionError
│   │   │   ├── tracing.ts                    # TracingError
│   │   │   └── metric.ts                     # MetricError
│   │   │
│   │   ├── config/
│   │   │   ├── index.ts                      # Config exports
│   │   │   ├── config.ts                     # DatadogAPMConfig interface
│   │   │   ├── validation.ts                 # validateConfig()
│   │   │   ├── env.ts                        # configFromEnvironment()
│   │   │   └── defaults.ts                   # Default values
│   │   │
│   │   ├── client/
│   │   │   ├── index.ts                      # Client exports
│   │   │   ├── interface.ts                  # DatadogAPMClient interface
│   │   │   ├── client.ts                     # DatadogAPMClientImpl
│   │   │   └── factory.ts                    # DatadogAPMClientFactory
│   │   │
│   │   ├── tracing/
│   │   │   ├── index.ts                      # Tracing exports
│   │   │   ├── interface.ts                  # Span interface
│   │   │   ├── span.ts                       # SpanImpl
│   │   │   ├── options.ts                    # SpanOptions, SpanType
│   │   │   ├── tracer.ts                     # Tracer wrapper
│   │   │   └── timeout.ts                    # SpanTimeoutManager
│   │   │
│   │   ├── propagation/
│   │   │   ├── index.ts                      # Propagation exports
│   │   │   ├── carrier.ts                    # Carrier interface
│   │   │   ├── header-carrier.ts             # HeaderCarrier
│   │   │   ├── datadog.ts                    # Datadog header propagation
│   │   │   ├── w3c.ts                        # W3C TraceContext
│   │   │   ├── composite.ts                  # Composite propagator
│   │   │   └── trace-id.ts                   # TraceIdConverter
│   │   │
│   │   ├── metrics/
│   │   │   ├── index.ts                      # Metrics exports
│   │   │   ├── interface.ts                  # MetricsClient interface
│   │   │   ├── statsd.ts                     # DogStatsD wrapper
│   │   │   ├── coalescing.ts                 # CoalescingMetricBuffer
│   │   │   ├── timer.ts                      # Timer class
│   │   │   └── cardinality.ts                # CardinalityProtector
│   │   │
│   │   ├── logging/
│   │   │   ├── index.ts                      # Logging exports
│   │   │   ├── context.ts                    # LogContext interface
│   │   │   ├── correlation.ts                # Log-trace correlation
│   │   │   └── logger.ts                     # CorrelatedLogger
│   │   │
│   │   ├── llm/
│   │   │   ├── index.ts                      # LLM exports
│   │   │   ├── interface.ts                  # LLMSpan interface
│   │   │   ├── span.ts                       # LLMSpanImpl
│   │   │   ├── tags.ts                       # LLM semantic tags
│   │   │   ├── streaming.ts                  # StreamingLLMSpan
│   │   │   ├── cost.ts                       # CostTracker
│   │   │   └── sanitizer.ts                  # ContentSanitizer
│   │   │
│   │   ├── agent/
│   │   │   ├── index.ts                      # Agent exports
│   │   │   ├── interface.ts                  # AgentSpan interface
│   │   │   ├── span.ts                       # AgentSpanImpl
│   │   │   ├── correlation.ts                # AgentCorrelationManager
│   │   │   ├── tool-call.ts                  # ToolCallInstrumentor
│   │   │   └── step.ts                       # Step tracing helpers
│   │   │
│   │   ├── security/
│   │   │   ├── index.ts                      # Security exports
│   │   │   ├── redaction.ts                  # PIIRedactor
│   │   │   ├── rules.ts                      # RedactionRule[]
│   │   │   ├── blocker.ts                    # TagBlocker
│   │   │   └── serializer.ts                 # SafeTagSerializer
│   │   │
│   │   ├── resilience/
│   │   │   ├── index.ts                      # Resilience exports
│   │   │   ├── circuit-breaker.ts            # AgentCircuitBreaker
│   │   │   ├── health-check.ts               # Agent health checker
│   │   │   └── sampler.ts                    # AdaptiveSampler
│   │   │
│   │   └── testing/
│   │       ├── index.ts                      # Testing exports
│   │       ├── mock-client.ts                # MockDatadogAPMClient
│   │       ├── mock-span.ts                  # MockSpan
│   │       ├── assertions.ts                 # Test assertions
│   │       └── fixtures.ts                   # Test fixtures
│   │
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── client.test.ts
│   │   │   ├── config.test.ts
│   │   │   ├── span.test.ts
│   │   │   ├── propagation.test.ts
│   │   │   ├── metrics.test.ts
│   │   │   ├── llm-span.test.ts
│   │   │   ├── agent-span.test.ts
│   │   │   ├── redaction.test.ts
│   │   │   ├── cardinality.test.ts
│   │   │   └── correlation.test.ts
│   │   │
│   │   └── integration/
│   │       ├── agent-connection.test.ts
│   │       ├── trace-export.test.ts
│   │       ├── metric-export.test.ts
│   │       ├── context-propagation.test.ts
│   │       ├── llm-tracing.test.ts
│   │       ├── agent-tracing.test.ts
│   │       └── shutdown.test.ts
│   │
│   ├── __mocks__/
│   │   ├── dd-trace.ts                       # Mock dd-trace module
│   │   └── hot-shots.ts                      # Mock StatsD client
│   │
│   ├── __fixtures__/
│   │   ├── spans.ts                          # Span fixtures
│   │   ├── metrics.ts                        # Metric fixtures
│   │   ├── headers.ts                        # Header fixtures
│   │   └── llm.ts                            # LLM request/response fixtures
│   │
│   └── examples/
│       ├── basic-usage.ts                    # Basic tracing example
│       ├── llm-tracing.ts                    # LLM call tracing
│       ├── agent-tracing.ts                  # Multi-step agent
│       ├── express-middleware.ts             # Express integration
│       ├── fastify-plugin.ts                 # Fastify integration
│       └── streaming.ts                      # Streaming LLM response
│
└── plans/
    ├── specification-datadog-apm.md
    ├── pseudocode-datadog-apm.md
    ├── architecture-datadog-apm.md
    ├── refinement-datadog-apm.md
    └── completion-datadog-apm.md
```

### 3.2 File Count Summary

| Category | Files | Lines (Est.) |
|----------|-------|--------------|
| Source (src/) | 52 | ~4,500 |
| Unit Tests | 10 | ~1,500 |
| Integration Tests | 7 | ~800 |
| Mocks | 2 | ~200 |
| Fixtures | 4 | ~300 |
| Examples | 6 | ~400 |
| Config/Docs | 5 | ~200 |
| **Total** | **86** | **~7,900** |

---

## 4. Dependency Specification

### 4.1 package.json

```json
{
  "name": "@llm-devops/datadog-apm",
  "version": "0.1.0",
  "description": "Datadog APM integration for LLM Dev Ops platform",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "import": "./dist/testing/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write 'src/**/*.ts' '__tests__/**/*.ts'",
    "prepublishOnly": "npm run build && npm run test"
  },
  "dependencies": {
    "dd-trace": "^5.0.0",
    "hot-shots": "^10.0.0"
  },
  "peerDependencies": {
    "@llm-devops/shared-observability": "^0.1.0",
    "@llm-devops/shared-tracing": "^0.1.0",
    "@llm-devops/shared-credentials": "^0.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "@vitest/coverage-v8": "^1.2.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "prettier": "^3.2.0",
    "testcontainers": "^10.4.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "LicenseRef-LLM-DevOps-Permanent",
  "repository": {
    "type": "git",
    "url": "https://github.com/llm-devops/integrations.git",
    "directory": "integrations/datadog-apm"
  },
  "keywords": [
    "datadog",
    "apm",
    "tracing",
    "observability",
    "llm",
    "opentelemetry"
  ]
}
```

### 4.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 4.3 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/unit/**/*.test.ts'],
    exclude: ['__tests__/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '__tests__/',
        '__mocks__/',
        '__fixtures__/',
        'examples/',
        '**/*.d.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
```

---

## 5. Test Coverage Requirements

### 5.1 Unit Test Coverage

| Module | Min Coverage | Critical Paths |
|--------|--------------|----------------|
| `client/` | 90% | Client init, span creation, shutdown |
| `config/` | 95% | Validation, env parsing |
| `tracing/` | 90% | Span lifecycle, tag setting, error handling |
| `propagation/` | 95% | Header injection/extraction, format conversion |
| `metrics/` | 85% | Counter/gauge/histogram, tag formatting |
| `llm/` | 90% | Token tracking, streaming, cost calculation |
| `agent/` | 85% | Step correlation, tool call tracing |
| `security/` | 95% | PII redaction, tag blocking |
| `testing/` | 80% | Mock client, assertions |

### 5.2 Integration Test Scenarios

| Scenario | Description | Priority |
|----------|-------------|----------|
| Agent Connection | Connect to local Datadog Agent | P0 |
| Trace Export | Send spans, verify in Agent stats | P0 |
| Metric Export | Send DogStatsD metrics | P0 |
| Context Propagation | Inject/extract across HTTP | P0 |
| LLM Tracing | Full LLM call with tokens | P0 |
| Agent Tracing | Multi-step agent execution | P1 |
| Streaming | Streaming response with TTFT | P1 |
| Graceful Shutdown | Flush on shutdown | P0 |
| Agent Unavailable | Graceful degradation | P1 |
| High Volume | 10K spans/second throughput | P2 |

### 5.3 Test Matrix

| Environment | Node Version | dd-trace Version | Priority |
|-------------|--------------|------------------|----------|
| CI (Ubuntu) | 18.x | 5.x | P0 |
| CI (Ubuntu) | 20.x | 5.x | P0 |
| CI (Ubuntu) | 22.x | 5.x | P1 |
| Local (macOS) | 20.x | 5.x | P0 |
| Docker | 20.x | 5.x | P0 |

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/datadog-apm.yml
name: Datadog APM Integration

on:
  push:
    branches: [main]
    paths:
      - 'integrations/datadog-apm/**'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/datadog-apm/**'

env:
  WORKING_DIR: integrations/datadog-apm/typescript

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ${{ env.WORKING_DIR }}/package-lock.json
      - name: Install dependencies
        working-directory: ${{ env.WORKING_DIR }}
        run: npm ci
      - name: Lint
        working-directory: ${{ env.WORKING_DIR }}
        run: npm run lint
      - name: Type check
        working-directory: ${{ env.WORKING_DIR }}
        run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
          cache-dependency-path: ${{ env.WORKING_DIR }}/package-lock.json
      - name: Install dependencies
        working-directory: ${{ env.WORKING_DIR }}
        run: npm ci
      - name: Run unit tests
        working-directory: ${{ env.WORKING_DIR }}
        run: npm run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ${{ env.WORKING_DIR }}/coverage/lcov.info
          flags: datadog-apm-unit
          name: datadog-apm-node${{ matrix.node-version }}

  integration-test:
    runs-on: ubuntu-latest
    needs: [lint, test]
    services:
      datadog-agent:
        image: datadog/agent:latest
        ports:
          - 8126:8126
          - 8125:8125/udp
        env:
          DD_API_KEY: ${{ secrets.DD_API_KEY }}
          DD_APM_ENABLED: true
          DD_APM_NON_LOCAL_TRAFFIC: true
          DD_DOGSTATSD_NON_LOCAL_TRAFFIC: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ${{ env.WORKING_DIR }}/package-lock.json
      - name: Install dependencies
        working-directory: ${{ env.WORKING_DIR }}
        run: npm ci
      - name: Wait for agent
        run: sleep 10
      - name: Run integration tests
        working-directory: ${{ env.WORKING_DIR }}
        env:
          DD_AGENT_HOST: localhost
          DD_TRACE_AGENT_PORT: 8126
          DD_DOGSTATSD_PORT: 8125
        run: npm run test:integration

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ${{ env.WORKING_DIR }}/package-lock.json
      - name: Install dependencies
        working-directory: ${{ env.WORKING_DIR }}
        run: npm ci
      - name: Build
        working-directory: ${{ env.WORKING_DIR }}
        run: npm run build
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: ${{ env.WORKING_DIR }}/dist

  publish:
    runs-on: ubuntu-latest
    needs: [build, integration-test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: ${{ env.WORKING_DIR }}/dist
      - name: Publish
        working-directory: ${{ env.WORKING_DIR }}
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 6.2 Docker Compose for Local Testing

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  datadog-agent:
    image: datadog/agent:latest
    container_name: dd-agent-test
    environment:
      - DD_API_KEY=${DD_API_KEY:-fake_api_key_for_testing}
      - DD_APM_ENABLED=true
      - DD_APM_NON_LOCAL_TRAFFIC=true
      - DD_DOGSTATSD_NON_LOCAL_TRAFFIC=true
      - DD_LOG_LEVEL=debug
    ports:
      - "8126:8126"
      - "8125:8125/udp"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8126/info"]
      interval: 10s
      timeout: 5s
      retries: 5

  test-runner:
    build:
      context: ./typescript
      dockerfile: Dockerfile.test
    depends_on:
      datadog-agent:
        condition: service_healthy
    environment:
      - DD_AGENT_HOST=datadog-agent
      - DD_TRACE_AGENT_PORT=8126
      - DD_DOGSTATSD_PORT=8125
      - DD_SERVICE=test-service
      - DD_ENV=test
      - DD_VERSION=0.0.0
    command: npm run test:integration
```

---

## 7. Operational Runbooks

### 7.1 Installation

```bash
# Install from npm
npm install @llm-devops/datadog-apm

# Or with yarn
yarn add @llm-devops/datadog-apm

# Peer dependencies (if not already installed)
npm install @llm-devops/shared-observability @llm-devops/shared-tracing
```

### 7.2 Basic Configuration

```typescript
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

// Create client with explicit config
const client = DatadogAPMClientFactory.create({
  service: 'my-llm-service',
  env: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '0.0.0',

  // Optional: Agent connection (defaults shown)
  agentHost: 'localhost',
  agentPort: 8126,
  statsdPort: 8125,

  // Optional: Sampling
  sampleRate: 1.0,  // 100% in dev, lower in prod

  // Optional: Security
  redactionRules: [
    { pattern: /password/i, replacement: '[REDACTED]', applyTo: 'all' }
  ]
});

// Or use environment variables
const client = DatadogAPMClientFactory.create(
  configFromEnvironment()
);
```

### 7.3 Environment Variables

```bash
# Required - Unified Service Tagging
DD_SERVICE=my-llm-service
DD_ENV=production
DD_VERSION=1.2.3

# Agent Connection
DD_AGENT_HOST=localhost
DD_TRACE_AGENT_PORT=8126
DD_DOGSTATSD_HOST=localhost
DD_DOGSTATSD_PORT=8125

# Sampling
DD_TRACE_SAMPLE_RATE=0.1  # 10% in production
DD_PRIORITY_SAMPLING=true

# Optional: Custom tags
DD_TAGS=team:ml,component:inference

# Optional: Debug
DD_TRACE_DEBUG=true
DD_LOG_LEVEL=debug
```

### 7.4 Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-service
spec:
  template:
    spec:
      containers:
        - name: app
          image: my-llm-service:latest
          env:
            - name: DD_SERVICE
              value: "llm-service"
            - name: DD_ENV
              valueFrom:
                fieldRef:
                  fieldPath: metadata.labels['env']
            - name: DD_VERSION
              value: "1.2.3"
            - name: DD_AGENT_HOST
              valueFrom:
                fieldRef:
                  fieldPath: status.hostIP
            - name: DD_TRACE_AGENT_PORT
              value: "8126"
            - name: DD_DOGSTATSD_PORT
              value: "8125"
            - name: DD_TRACE_SAMPLE_RATE
              value: "0.1"
```

### 7.5 Troubleshooting Guide

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| No traces in Datadog | Check agent connectivity | Verify `DD_AGENT_HOST` and port 8126 is accessible |
| Missing metrics | Check DogStatsD | Verify UDP port 8125 is accessible |
| High memory usage | Large trace buffer | Reduce `traceBufferSize` or increase flush frequency |
| Spans not correlated | Context not propagated | Ensure `injectContext` called before outbound requests |
| PII in traces | Redaction not applied | Check `redactionRules` configuration |
| Agent timeouts | Network issues | Increase `connectionTimeout`, check agent health |
| High cardinality alert | Dynamic tags | Review tags, use `CardinalityProtector` |

### 7.6 Health Checks

```typescript
// Health check endpoint example
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

app.get('/health/datadog', async (req, res) => {
  const client = DatadogAPMClientFactory.getInstance();

  try {
    const isHealthy = await client.checkAgentHealth();

    if (isHealthy) {
      res.json({ status: 'healthy', agent: 'connected' });
    } else {
      res.status(503).json({ status: 'degraded', agent: 'unhealthy' });
    }
  } catch (error) {
    res.status(503).json({ status: 'error', message: error.message });
  }
});
```

### 7.7 Graceful Shutdown

```typescript
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

// Register shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');

  const client = DatadogAPMClientFactory.getInstance();

  try {
    // Flush pending telemetry with 10s timeout
    await client.shutdown();
    console.log('Datadog APM shutdown complete');
  } catch (error) {
    console.error('Shutdown error:', error);
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  // Same as SIGTERM
});
```

---

## 8. Acceptance Criteria

### 8.1 Functional Requirements

| # | Requirement | Verification |
|---|-------------|--------------|
| F1 | Traces appear in Datadog APM | Integration test + manual verification |
| F2 | Metrics visible in Metrics Explorer | Integration test + manual verification |
| F3 | Logs correlated with traces | Log search with trace_id filter |
| F4 | Service map shows dependencies | Visual inspection in Datadog |
| F5 | LLM spans have correct attributes | Unit test assertions |
| F6 | Agent steps are correlated | Trace view inspection |
| F7 | Errors tracked with stack traces | Error tracking UI |
| F8 | Context propagates across HTTP | Integration test |
| F9 | W3C TraceContext fallback works | Unit test |
| F10 | PII is redacted | Security audit |

### 8.2 Non-Functional Requirements

| # | Requirement | Target | Verification |
|---|-------------|--------|--------------|
| NF1 | Span creation latency | < 1μs | Benchmark |
| NF2 | Memory overhead | < 50MB | Load test |
| NF3 | Throughput | 10K spans/s | Load test |
| NF4 | Agent unavailable handling | No app crash | Chaos test |
| NF5 | Shutdown flush | < 10s | Integration test |
| NF6 | Test coverage | > 80% | CI coverage report |
| NF7 | TypeScript strict mode | No errors | CI type check |
| NF8 | No runtime dependencies on Datadog cloud | Mock tests pass | CI |

### 8.3 Documentation Requirements

| # | Document | Location |
|---|----------|----------|
| D1 | API Reference | Generated from TSDoc |
| D2 | Configuration Guide | README.md |
| D3 | Troubleshooting Guide | README.md |
| D4 | Example Code | examples/ directory |
| D5 | SPARC Documentation | plans/ directory |

---

## 9. Release Checklist

### 9.1 Pre-Release

- [ ] All P0 components implemented
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] README.md complete

### 9.2 Release

- [ ] Create git tag
- [ ] CI pipeline passes
- [ ] Package published to registry
- [ ] Documentation deployed
- [ ] Release notes published

### 9.3 Post-Release

- [ ] Verify package installable
- [ ] Smoke test in staging environment
- [ ] Monitor for issues
- [ ] Update dependent projects

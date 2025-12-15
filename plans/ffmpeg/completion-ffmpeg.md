# FFmpeg Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/ffmpeg`

---

## 1. Implementation Checklist

### 1.1 Core Components

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 1 | FFmpegClient interface | `src/client.ts` | ☐ | ☐ |
| 2 | FFmpegClientImpl | `src/client.ts` | ☐ | ☐ |
| 3 | FFmpegConfig type | `src/types/config.ts` | ☐ | ☐ |
| 4 | Configuration validation | `src/config.ts` | ☐ | ☐ |
| 5 | Binary verification | `src/utils/binary.ts` | ☐ | ☐ |

### 1.2 Command Building

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 6 | FFmpegCommand interface | `src/types/command.ts` | ☐ | ☐ |
| 7 | FFmpegCommandBuilder | `src/command-builder.ts` | ☐ | ☐ |
| 8 | InputSpec type | `src/types/input.ts` | ☐ | ☐ |
| 9 | OutputSpec type | `src/types/output.ts` | ☐ | ☐ |
| 10 | Input args builder | `src/command-builder.ts` | ☐ | ☐ |
| 11 | Output args builder | `src/command-builder.ts` | ☐ | ☐ |
| 12 | Command serialization | `src/command-builder.ts` | ☐ | ☐ |

### 1.3 Filter Graph

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 13 | FilterGraph class | `src/filter-graph.ts` | ☐ | ☐ |
| 14 | FilterNode interface | `src/types/filter.ts` | ☐ | ☐ |
| 15 | Scale filter | `src/filter-graph.ts` | ☐ | ☐ |
| 16 | Crop filter | `src/filter-graph.ts` | ☐ | ☐ |
| 17 | Loudnorm filter | `src/filter-graph.ts` | ☐ | ☐ |
| 18 | Overlay filter | `src/filter-graph.ts` | ☐ | ☐ |
| 19 | Complex filter builder | `src/filter-graph.ts` | ☐ | ☐ |
| 20 | Filter string serialization | `src/filter-graph.ts` | ☐ | ☐ |

### 1.4 Process Execution

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 21 | ProcessExecutor interface | `src/types/executor.ts` | ☐ | ☐ |
| 22 | ProcessExecutorImpl | `src/process-executor.ts` | ☐ | ☐ |
| 23 | Process spawning | `src/process-executor.ts` | ☐ | ☐ |
| 24 | Timeout handling | `src/process-executor.ts` | ☐ | ☐ |
| 25 | Signal handling | `src/process-executor.ts` | ☐ | ☐ |
| 26 | Stream piping | `src/process-executor.ts` | ☐ | ☐ |
| 27 | Exit code handling | `src/process-executor.ts` | ☐ | ☐ |
| 28 | Resource monitoring | `src/process-executor.ts` | ☐ | ☐ |

### 1.5 Progress Tracking

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 29 | Progress interface | `src/types/progress.ts` | ☐ | ☐ |
| 30 | ProgressTracker class | `src/progress-tracker.ts` | ☐ | ☐ |
| 31 | Stderr parsing | `src/progress-tracker.ts` | ☐ | ☐ |
| 32 | Time extraction | `src/progress-tracker.ts` | ☐ | ☐ |
| 33 | Frame extraction | `src/progress-tracker.ts` | ☐ | ☐ |
| 34 | Percentage calculation | `src/progress-tracker.ts` | ☐ | ☐ |
| 35 | Progress events | `src/progress-tracker.ts` | ☐ | ☐ |

### 1.6 Job Management

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 36 | JobManager class | `src/job-manager.ts` | ☐ | ☐ |
| 37 | JobRecord interface | `src/types/job.ts` | ☐ | ☐ |
| 38 | JobStatus type | `src/types/job.ts` | ☐ | ☐ |
| 39 | Job queue | `src/job-manager.ts` | ☐ | ☐ |
| 40 | Concurrency control | `src/job-manager.ts` | ☐ | ☐ |
| 41 | Job cancellation | `src/job-manager.ts` | ☐ | ☐ |
| 42 | Job serialization | `src/job-serializer.ts` | ☐ | ☐ |
| 43 | Job replay | `src/job-serializer.ts` | ☐ | ☐ |

### 1.7 Probing Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 44 | MediaInfo interface | `src/types/media-info.ts` | ☐ | ☐ |
| 45 | StreamInfo interface | `src/types/media-info.ts` | ☐ | ☐ |
| 46 | FormatInfo interface | `src/types/media-info.ts` | ☐ | ☐ |
| 47 | probe() method | `src/operations/probe.ts` | ☐ | ☐ |
| 48 | FFprobe execution | `src/operations/probe.ts` | ☐ | ☐ |
| 49 | JSON parsing | `src/operations/probe.ts` | ☐ | ☐ |
| 50 | Stream type detection | `src/operations/probe.ts` | ☐ | ☐ |

### 1.8 Transcoding Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 51 | TranscodeJob interface | `src/types/jobs.ts` | ☐ | ☐ |
| 52 | transcode() method | `src/operations/transcode.ts` | ☐ | ☐ |
| 53 | transcodeToPreset() | `src/operations/transcode.ts` | ☐ | ☐ |
| 54 | Two-pass encoding | `src/operations/transcode.ts` | ☐ | ☐ |
| 55 | Container remux | `src/operations/transcode.ts` | ☐ | ☐ |
| 56 | Output validation | `src/operations/transcode.ts` | ☐ | ☐ |

### 1.9 Audio Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 57 | AudioExtractJob interface | `src/types/jobs.ts` | ☐ | ☐ |
| 58 | extractAudio() method | `src/operations/audio.ts` | ☐ | ☐ |
| 59 | normalizeAudio() method | `src/operations/audio.ts` | ☐ | ☐ |
| 60 | convertAudio() method | `src/operations/audio.ts` | ☐ | ☐ |
| 61 | trimAudio() method | `src/operations/audio.ts` | ☐ | ☐ |
| 62 | Loudnorm two-pass | `src/operations/audio.ts` | ☐ | ☐ |

### 1.10 Video Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 63 | ThumbnailJob interface | `src/types/jobs.ts` | ☐ | ☐ |
| 64 | generateThumbnail() | `src/operations/video.ts` | ☐ | ☐ |
| 65 | resize() method | `src/operations/video.ts` | ☐ | ☐ |
| 66 | crop() method | `src/operations/video.ts` | ☐ | ☐ |
| 67 | trimVideo() method | `src/operations/video.ts` | ☐ | ☐ |
| 68 | concatenate() method | `src/operations/video.ts` | ☐ | ☐ |
| 69 | extractFrames() method | `src/operations/video.ts` | ☐ | ☐ |

### 1.11 Advanced Operations

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 70 | createHLS() method | `src/operations/advanced.ts` | ☐ | ☐ |
| 71 | watermark() method | `src/operations/advanced.ts` | ☐ | ☐ |
| 72 | extractSubtitles() | `src/operations/advanced.ts` | ☐ | ☐ |
| 73 | embedSubtitles() | `src/operations/advanced.ts` | ☐ | ☐ |
| 74 | applyFilter() method | `src/operations/advanced.ts` | ☐ | ☐ |

### 1.12 Streaming

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 75 | Stream-to-file processing | `src/operations/stream.ts` | ☐ | ☐ |
| 76 | File-to-stream processing | `src/operations/stream.ts` | ☐ | ☐ |
| 77 | Stream-to-stream pipeline | `src/operations/stream.ts` | ☐ | ☐ |
| 78 | Backpressure handling | `src/operations/stream.ts` | ☐ | ☐ |

### 1.13 Presets

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 79 | PresetLibrary class | `src/presets.ts` | ☐ | ☐ |
| 80 | web-hd preset | `src/presets.ts` | ☐ | ☐ |
| 81 | web-sd preset | `src/presets.ts` | ☐ | ☐ |
| 82 | mobile preset | `src/presets.ts` | ☐ | ☐ |
| 83 | archive preset | `src/presets.ts` | ☐ | ☐ |
| 84 | podcast preset | `src/presets.ts` | ☐ | ☐ |
| 85 | music preset | `src/presets.ts` | ☐ | ☐ |
| 86 | voice preset | `src/presets.ts` | ☐ | ☐ |
| 87 | Custom preset registration | `src/presets.ts` | ☐ | ☐ |

### 1.14 Error Handling

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 88 | FFmpegError base class | `src/errors.ts` | ☐ | ☐ |
| 89 | ConfigurationError | `src/errors.ts` | ☐ | ☐ |
| 90 | BinaryNotFoundError | `src/errors.ts` | ☐ | ☐ |
| 91 | InputError hierarchy | `src/errors.ts` | ☐ | ☐ |
| 92 | ProcessError hierarchy | `src/errors.ts` | ☐ | ☐ |
| 93 | OutputError hierarchy | `src/errors.ts` | ☐ | ☐ |
| 94 | ResourceError hierarchy | `src/errors.ts` | ☐ | ☐ |
| 95 | Error parser (stderr) | `src/error-parser.ts` | ☐ | ☐ |

### 1.15 Security

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 96 | Path sanitization | `src/security/path.ts` | ☐ | ☐ |
| 97 | Filter validation | `src/security/filter.ts` | ☐ | ☐ |
| 98 | Input size validation | `src/security/limits.ts` | ☐ | ☐ |
| 99 | Protocol whitelist | `src/security/protocol.ts` | ☐ | ☐ |

### 1.16 Observability

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 100 | Metrics collector | `src/observability/metrics.ts` | ☐ | ☐ |
| 101 | Job counter metrics | `src/observability/metrics.ts` | ☐ | ☐ |
| 102 | Duration histogram | `src/observability/metrics.ts` | ☐ | ☐ |
| 103 | Bytes counter | `src/observability/metrics.ts` | ☐ | ☐ |
| 104 | Tracing spans | `src/observability/tracing.ts` | ☐ | ☐ |
| 105 | Structured logging | `src/observability/logging.ts` | ☐ | ☐ |

### 1.17 Testing Support

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 106 | MockFFmpegExecutor | `src/testing/mock-executor.ts` | ☐ | ☐ |
| 107 | Mock result configuration | `src/testing/mock-executor.ts` | ☐ | ☐ |
| 108 | Command capture | `src/testing/mock-executor.ts` | ☐ | ☐ |
| 109 | Assertion helpers | `src/testing/mock-executor.ts` | ☐ | ☐ |
| 110 | Test fixtures | `src/testing/fixtures.ts` | ☐ | ☐ |
| 111 | Factory functions | `src/testing/factories.ts` | ☐ | ☐ |

### 1.18 Utilities

| # | Component | File | Status | Tests |
|---|-----------|------|--------|-------|
| 112 | Time formatting | `src/utils/time.ts` | ☐ | ☐ |
| 113 | Bitrate parsing | `src/utils/bitrate.ts` | ☐ | ☐ |
| 114 | Temp file manager | `src/utils/temp.ts` | ☐ | ☐ |
| 115 | Health check | `src/utils/health.ts` | ☐ | ☐ |
| 116 | Graceful shutdown | `src/utils/shutdown.ts` | ☐ | ☐ |

---

## 2. File Manifest

### 2.1 Directory Structure

```
integrations/ffmpeg/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── client.ts                   # FFmpegClient implementation
│   ├── config.ts                   # Configuration validation
│   ├── command-builder.ts          # Command construction
│   ├── filter-graph.ts             # Filter graph builder
│   ├── process-executor.ts         # Process management
│   ├── progress-tracker.ts         # Progress parsing
│   ├── job-manager.ts              # Job queue management
│   ├── job-serializer.ts           # Job serialization/replay
│   ├── presets.ts                  # Preset library
│   ├── errors.ts                   # Error classes
│   ├── error-parser.ts             # FFmpeg stderr parser
│   │
│   ├── types/
│   │   ├── index.ts                # Type exports
│   │   ├── config.ts               # Configuration types
│   │   ├── command.ts              # Command types
│   │   ├── input.ts                # Input specification
│   │   ├── output.ts               # Output specification
│   │   ├── filter.ts               # Filter types
│   │   ├── progress.ts             # Progress types
│   │   ├── job.ts                  # Job types
│   │   ├── jobs.ts                 # Operation job types
│   │   ├── media-info.ts           # Media info types
│   │   └── executor.ts             # Executor interface
│   │
│   ├── operations/
│   │   ├── index.ts                # Operation exports
│   │   ├── probe.ts                # Probing operations
│   │   ├── transcode.ts            # Transcoding operations
│   │   ├── audio.ts                # Audio operations
│   │   ├── video.ts                # Video operations
│   │   ├── stream.ts               # Streaming operations
│   │   └── advanced.ts             # Advanced operations
│   │
│   ├── security/
│   │   ├── index.ts                # Security exports
│   │   ├── path.ts                 # Path sanitization
│   │   ├── filter.ts               # Filter validation
│   │   ├── limits.ts               # Size/duration limits
│   │   └── protocol.ts             # Protocol whitelist
│   │
│   ├── observability/
│   │   ├── index.ts                # Observability exports
│   │   ├── metrics.ts              # Metrics collector
│   │   ├── tracing.ts              # Tracing integration
│   │   └── logging.ts              # Structured logging
│   │
│   ├── testing/
│   │   ├── index.ts                # Testing exports
│   │   ├── mock-executor.ts        # Mock process executor
│   │   ├── fixtures.ts             # Test fixtures
│   │   └── factories.ts            # Test factories
│   │
│   └── utils/
│       ├── index.ts                # Utility exports
│       ├── binary.ts               # Binary verification
│       ├── time.ts                 # Time formatting
│       ├── bitrate.ts              # Bitrate parsing
│       ├── temp.ts                 # Temp file management
│       ├── health.ts               # Health checks
│       └── shutdown.ts             # Graceful shutdown
│
├── tests/
│   ├── unit/
│   │   ├── command-builder.test.ts
│   │   ├── filter-graph.test.ts
│   │   ├── progress-tracker.test.ts
│   │   ├── job-manager.test.ts
│   │   ├── error-parser.test.ts
│   │   ├── presets.test.ts
│   │   └── utils/
│   │       ├── time.test.ts
│   │       ├── bitrate.test.ts
│   │       └── path.test.ts
│   │
│   ├── integration/
│   │   ├── probe.test.ts
│   │   ├── transcode.test.ts
│   │   ├── audio.test.ts
│   │   ├── video.test.ts
│   │   ├── streaming.test.ts
│   │   └── concurrent.test.ts
│   │
│   ├── e2e/
│   │   ├── full-pipeline.test.ts
│   │   └── error-recovery.test.ts
│   │
│   └── fixtures/
│       ├── test-video-10s.mp4
│       ├── test-audio-5s.wav
│       ├── corrupted.mp4
│       ├── no-audio.mp4
│       └── no-video.mp4
│
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
└── README.md
```

### 2.2 File Count Summary

| Category | Files | Lines (est.) |
|----------|-------|--------------|
| Source (src/) | 42 | ~4,500 |
| Types (types/) | 11 | ~600 |
| Operations | 6 | ~1,200 |
| Security | 5 | ~400 |
| Observability | 4 | ~350 |
| Testing support | 4 | ~500 |
| Utilities | 7 | ~450 |
| Unit tests | 10 | ~1,500 |
| Integration tests | 6 | ~800 |
| E2E tests | 2 | ~300 |
| Config files | 5 | ~150 |
| **Total** | **102** | **~10,750** |

---

## 3. Dependency Specification

### 3.1 package.json

```json
{
  "name": "@llm-devops/ffmpeg",
  "version": "1.0.0",
  "description": "FFmpeg integration module for LLM Dev Ops platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --testPathPattern=e2e",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "execa": "^8.0.0"
  },
  "peerDependencies": {
    "@llm-devops/observability": "^1.0.0",
    "@llm-devops/tracing": "^1.0.0",
    "@llm-devops/credentials": "^1.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "@llm-devops/observability": {
      "optional": true
    },
    "@llm-devops/tracing": {
      "optional": true
    }
  }
}
```

### 3.2 TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 3.3 Jest Configuration

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

---

## 4. CI/CD Configuration

### 4.1 GitHub Actions Workflow

```yaml
# .github/workflows/ffmpeg-ci.yml
name: FFmpeg Integration CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'integrations/ffmpeg/**'
      - '.github/workflows/ffmpeg-ci.yml'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/ffmpeg/**'

defaults:
  run:
    working-directory: integrations/ffmpeg

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/ffmpeg/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/ffmpeg/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/ffmpeg/coverage/lcov.info
          flags: ffmpeg-unit

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      # No services needed - uses system FFmpeg
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/ffmpeg/package-lock.json

      - name: Install FFmpeg
        run: |
          sudo apt-get update
          sudo apt-get install -y ffmpeg
          ffmpeg -version
          ffprobe -version

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration
        env:
          FFMPEG_PATH: /usr/bin/ffmpeg
          FFPROBE_PATH: /usr/bin/ffprobe

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: integration-test-outputs
          path: integrations/ffmpeg/tests/fixtures/output/

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/ffmpeg/package-lock.json

      - name: Install FFmpeg
        run: |
          sudo apt-get update
          sudo apt-get install -y ffmpeg

      - name: Install dependencies
        run: npm ci

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          FFMPEG_PATH: /usr/bin/ffmpeg
          FFPROBE_PATH: /usr/bin/ffprobe
          FFMPEG_TIMEOUT: 120000

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, unit-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: integrations/ffmpeg/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: integrations/ffmpeg/dist/

  publish:
    name: Publish
    runs-on: ubuntu-latest
    needs: [build, e2e-tests]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
          cache: 'npm'
          cache-dependency-path: integrations/ffmpeg/package-lock.json

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: integrations/ffmpeg/dist/

      - name: Publish package
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4.2 Docker Build

```dockerfile
# Dockerfile
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production image
FROM node:20-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation
RUN ffmpeg -version && ffprobe -version

WORKDIR /app

# Copy production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create temp directory
RUN mkdir -p /tmp/ffmpeg && chmod 777 /tmp/ffmpeg

# Set environment
ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe
ENV FFMPEG_TEMP_DIR=/tmp/ffmpeg

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('./dist').healthCheck().then(r => process.exit(r.status === 'healthy' ? 0 : 1))"

# Run as non-root
USER node

CMD ["node", "dist/index.js"]
```

---

## 5. Operational Runbooks

### 5.1 Runbook: High Error Rate

```
┌─────────────────────────────────────────────────────────────────────┐
│  RUNBOOK: High FFmpeg Error Rate                                    │
│  Alert: ffmpeg_error_rate > 5% for 5 minutes                       │
└─────────────────────────────────────────────────────────────────────┘

SEVERITY: P2 (High)

SYMPTOMS:
- Increased error rate in FFmpeg jobs
- Users reporting failed transcodes
- Alert: "FFmpeg error rate exceeded threshold"

DIAGNOSIS:

1. Check error breakdown by type:
   ┌─────────────────────────────────────────────────────────────────┐
   │ Query: sum by (error_type) (rate(ffmpeg_errors_total[5m]))     │
   └─────────────────────────────────────────────────────────────────┘

2. Check recent logs for patterns:
   ┌─────────────────────────────────────────────────────────────────┐
   │ kubectl logs -l app=ffmpeg-worker --since=10m | grep ERROR     │
   └─────────────────────────────────────────────────────────────────┘

3. Check system resources:
   ┌─────────────────────────────────────────────────────────────────┐
   │ kubectl top pods -l app=ffmpeg-worker                          │
   │ df -h /tmp/ffmpeg  # Check temp disk space                     │
   └─────────────────────────────────────────────────────────────────┘

RESOLUTION BY ERROR TYPE:

A. FileNotFound errors:
   - Check if source files exist
   - Verify storage mount is healthy
   - Check file permissions

B. TimeoutExceeded errors:
   - Check for unusually large files
   - Consider increasing timeout
   - Check for system resource contention

C. MemoryExceeded errors:
   - Reduce maxConcurrent
   - Increase memory limits in pod spec
   - Check for memory leaks

D. CodecNotFound errors:
   - Verify FFmpeg build includes required codecs
   - Check container image is up to date

E. CorruptedInput errors:
   - Source files may be damaged
   - Check upload pipeline for issues
   - Enable input validation logging

ESCALATION:
- If errors persist > 30 minutes: Page on-call engineer
- If affecting > 10% of jobs: Incident response
```

### 5.2 Runbook: Queue Backup

```
┌─────────────────────────────────────────────────────────────────────┐
│  RUNBOOK: FFmpeg Queue Backup                                       │
│  Alert: ffmpeg_queue_depth > 50 for 10 minutes                     │
└─────────────────────────────────────────────────────────────────────┘

SEVERITY: P3 (Medium)

SYMPTOMS:
- Job queue growing
- Increased job wait times
- Users reporting slow processing

DIAGNOSIS:

1. Check current queue state:
   ┌─────────────────────────────────────────────────────────────────┐
   │ curl localhost:8080/health | jq '.queuedJobs, .activeJobs'     │
   └─────────────────────────────────────────────────────────────────┘

2. Check processing rate:
   ┌─────────────────────────────────────────────────────────────────┐
   │ Query: rate(ffmpeg_jobs_total{status="completed"}[5m])         │
   └─────────────────────────────────────────────────────────────────┘

3. Check for stuck jobs:
   ┌─────────────────────────────────────────────────────────────────┐
   │ Query: ffmpeg_job_duration_seconds{status="running"}           │
   │        > 3600  # Jobs running > 1 hour                         │
   └─────────────────────────────────────────────────────────────────┘

RESOLUTION:

A. Normal backlog (burst traffic):
   - Monitor for natural drain
   - No action if rate is healthy

B. Stuck jobs blocking queue:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Cancel stuck jobs via API                                    │
   │ curl -X POST localhost:8080/jobs/{jobId}/cancel                │
   └─────────────────────────────────────────────────────────────────┘

C. Insufficient capacity:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Scale up workers                                             │
   │ kubectl scale deployment ffmpeg-worker --replicas=8            │
   └─────────────────────────────────────────────────────────────────┘

D. Resource contention:
   - Check CPU/memory usage
   - Consider increasing resource limits
   - Check for noisy neighbors

PREVENTION:
- Implement rate limiting at API layer
- Set up auto-scaling based on queue depth
- Add circuit breaker for burst protection
```

### 5.3 Runbook: Disk Space Low

```
┌─────────────────────────────────────────────────────────────────────┐
│  RUNBOOK: FFmpeg Temp Disk Space Low                                │
│  Alert: ffmpeg_temp_disk_usage_percent > 80%                       │
└─────────────────────────────────────────────────────────────────────┘

SEVERITY: P2 (High)

SYMPTOMS:
- Jobs failing with "disk full" errors
- Temp directory filling up
- Output write failures

DIAGNOSIS:

1. Check disk usage:
   ┌─────────────────────────────────────────────────────────────────┐
   │ df -h /tmp/ffmpeg                                              │
   │ du -sh /tmp/ffmpeg/*                                           │
   └─────────────────────────────────────────────────────────────────┘

2. Find large files:
   ┌─────────────────────────────────────────────────────────────────┐
   │ find /tmp/ffmpeg -size +100M -exec ls -lh {} \;               │
   └─────────────────────────────────────────────────────────────────┘

3. Check for orphaned temp directories:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Find dirs older than 1 hour                                  │
   │ find /tmp/ffmpeg -type d -mmin +60                            │
   └─────────────────────────────────────────────────────────────────┘

RESOLUTION:

A. Clean orphaned temp files:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Remove temp dirs older than 2 hours                          │
   │ find /tmp/ffmpeg -type d -mmin +120 -exec rm -rf {} \;        │
   └─────────────────────────────────────────────────────────────────┘

B. Force cleanup via API:
   ┌─────────────────────────────────────────────────────────────────┐
   │ curl -X POST localhost:8080/admin/cleanup-temp                 │
   └─────────────────────────────────────────────────────────────────┘

C. Reduce concurrent jobs temporarily:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Set env var and restart                                      │
   │ FFMPEG_MAX_CONCURRENT=2                                        │
   └─────────────────────────────────────────────────────────────────┘

D. Expand disk (if possible):
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Kubernetes: Update PVC size                                  │
   │ kubectl patch pvc ffmpeg-temp -p '{"spec":{"resources":{       │
   │   "requests":{"storage":"50Gi"}}}}'                            │
   └─────────────────────────────────────────────────────────────────┘

PREVENTION:
- Set up cleanup cron job
- Monitor disk usage trends
- Implement job input size limits
- Add pre-job disk space check
```

### 5.4 Runbook: Memory Pressure

```
┌─────────────────────────────────────────────────────────────────────┐
│  RUNBOOK: FFmpeg Memory Pressure                                    │
│  Alert: container_memory_usage > 85% for 5 minutes                 │
└─────────────────────────────────────────────────────────────────────┘

SEVERITY: P2 (High)

SYMPTOMS:
- High memory usage on FFmpeg pods
- OOMKilled pods
- Slow job processing

DIAGNOSIS:

1. Check memory usage:
   ┌─────────────────────────────────────────────────────────────────┐
   │ kubectl top pods -l app=ffmpeg-worker                          │
   └─────────────────────────────────────────────────────────────────┘

2. Check for OOMKilled events:
   ┌─────────────────────────────────────────────────────────────────┐
   │ kubectl get events --field-selector reason=OOMKilled           │
   └─────────────────────────────────────────────────────────────────┘

3. Check active job characteristics:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Look for high-resolution or long-duration inputs             │
   │ curl localhost:8080/jobs?status=running | jq                   │
   └─────────────────────────────────────────────────────────────────┘

RESOLUTION:

A. Immediate relief:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Pause queue to let current jobs complete                     │
   │ curl -X POST localhost:8080/admin/pause-queue                  │
   └─────────────────────────────────────────────────────────────────┘

B. Reduce concurrency:
   ┌─────────────────────────────────────────────────────────────────┐
   │ kubectl set env deployment/ffmpeg-worker \                     │
   │   FFMPEG_MAX_CONCURRENT=2                                      │
   └─────────────────────────────────────────────────────────────────┘

C. Increase memory limits (if available):
   ┌─────────────────────────────────────────────────────────────────┐
   │ kubectl patch deployment ffmpeg-worker -p '{"spec":{           │
   │   "template":{"spec":{"containers":[{                          │
   │     "name":"ffmpeg",                                           │
   │     "resources":{"limits":{"memory":"8Gi"}}                    │
   │   }]}}}}'                                                      │
   └─────────────────────────────────────────────────────────────────┘

D. Kill memory-heavy jobs:
   ┌─────────────────────────────────────────────────────────────────┐
   │ # Find and cancel jobs with large inputs                       │
   │ curl -X POST localhost:8080/jobs/{large-job-id}/cancel        │
   └─────────────────────────────────────────────────────────────────┘

PREVENTION:
- Implement per-job memory limits
- Add input size/resolution limits
- Use streaming for large files
- Set up memory pressure detection in JobManager
```

---

## 6. Deployment Guide

### 6.1 Prerequisites Checklist

| Requirement | Check | Notes |
|-------------|-------|-------|
| Node.js 18+ | `node --version` | Required runtime |
| FFmpeg 5.0+ | `ffmpeg -version` | Media processing |
| FFprobe | `ffprobe -version` | Usually bundled |
| Disk space | 10GB+ temp | For processing |
| Memory | 4GB+ per worker | For concurrent jobs |

### 6.2 Environment Variables

```bash
# Required
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

# Optional with defaults
FFMPEG_MAX_CONCURRENT=4
FFMPEG_TIMEOUT=3600000
FFMPEG_MAX_MEMORY_MB=2048
FFMPEG_TEMP_DIR=/tmp/ffmpeg
FFMPEG_CPU_THREADS=0
FFMPEG_LOG_LEVEL=info

# Observability (optional)
OTEL_SERVICE_NAME=ffmpeg-integration
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
METRICS_PORT=9090
```

### 6.3 Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ffmpeg-worker
  labels:
    app: ffmpeg-worker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ffmpeg-worker
  template:
    metadata:
      labels:
        app: ffmpeg-worker
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
    spec:
      containers:
        - name: ffmpeg
          image: llm-devops/ffmpeg:1.0.0
          resources:
            requests:
              memory: "2Gi"
              cpu: "2"
            limits:
              memory: "4Gi"
              cpu: "4"
          env:
            - name: FFMPEG_MAX_CONCURRENT
              value: "4"
            - name: FFMPEG_TEMP_DIR
              value: "/data/temp"
          ports:
            - containerPort: 8080
              name: http
            - containerPort: 9090
              name: metrics
          volumeMounts:
            - name: temp-storage
              mountPath: /data/temp
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: temp-storage
          emptyDir:
            sizeLimit: 20Gi
      terminationGracePeriodSeconds: 300  # Allow jobs to complete
---
apiVersion: v1
kind: Service
metadata:
  name: ffmpeg-worker
spec:
  selector:
    app: ffmpeg-worker
  ports:
    - port: 8080
      targetPort: 8080
      name: http
    - port: 9090
      targetPort: 9090
      name: metrics
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ffmpeg-worker
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ffmpeg-worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Pods
      pods:
        metric:
          name: ffmpeg_queue_depth
        target:
          type: AverageValue
          averageValue: "10"
```

### 6.4 Verification Checklist

```
┌─────────────────────────────────────────────────────────────────────┐
│  POST-DEPLOYMENT VERIFICATION                                        │
└─────────────────────────────────────────────────────────────────────┘

1. Health Check
   ┌─────────────────────────────────────────────────────────────────┐
   │ curl http://ffmpeg-worker:8080/health                          │
   │ Expected: {"status":"healthy",...}                              │
   └─────────────────────────────────────────────────────────────────┘

2. Probe Test
   ┌─────────────────────────────────────────────────────────────────┐
   │ curl -X POST http://ffmpeg-worker:8080/probe \                 │
   │   -H "Content-Type: application/json" \                        │
   │   -d '{"input":{"type":"file","path":"/test/video.mp4"}}'     │
   │ Expected: MediaInfo JSON response                               │
   └─────────────────────────────────────────────────────────────────┘

3. Transcode Test
   ┌─────────────────────────────────────────────────────────────────┐
   │ curl -X POST http://ffmpeg-worker:8080/transcode \             │
   │   -H "Content-Type: application/json" \                        │
   │   -d '{"input":{"type":"file","path":"/test/video.mp4"},      │
   │        "output":{"type":"file","path":"/test/out.webm"},      │
   │        "preset":"web-sd"}'                                      │
   │ Expected: {"jobId":"...","status":"completed"}                  │
   └─────────────────────────────────────────────────────────────────┘

4. Metrics Endpoint
   ┌─────────────────────────────────────────────────────────────────┐
   │ curl http://ffmpeg-worker:9090/metrics                         │
   │ Expected: Prometheus metrics output                             │
   └─────────────────────────────────────────────────────────────────┘

5. Log Output
   ┌─────────────────────────────────────────────────────────────────┐
   │ kubectl logs -l app=ffmpeg-worker --tail=50                    │
   │ Expected: Structured JSON logs, no errors                       │
   └─────────────────────────────────────────────────────────────────┘
```

---

## 7. API Reference

### 7.1 Public Exports

```typescript
// Main client
export { FFmpegClient, createFFmpegClient } from './client';

// Configuration
export { FFmpegConfig, validateConfig } from './config';

// Types
export {
  InputSpec,
  OutputSpec,
  MediaInfo,
  StreamInfo,
  FormatInfo,
  Progress,
  JobResult,
  JobStatus,
  TranscodeJob,
  AudioExtractJob,
  ThumbnailJob,
  ResizeJob,
  ConcatJob,
  PresetName,
} from './types';

// Errors
export {
  FFmpegError,
  ConfigurationError,
  BinaryNotFoundError,
  FileNotFoundError,
  InvalidFormatError,
  CorruptedInputError,
  TimeoutExceededError,
  MemoryExceededError,
  ProcessError,
} from './errors';

// Command building (advanced)
export { FFmpegCommandBuilder } from './command-builder';
export { FilterGraph } from './filter-graph';

// Presets
export { PRESETS, PresetLibrary } from './presets';

// Testing
export { MockFFmpegExecutor, createTestClient } from './testing';

// Utilities
export { healthCheck, gracefulShutdown } from './utils';
```

### 7.2 Quick Start Example

```typescript
import { createFFmpegClient } from '@llm-devops/ffmpeg';

// Create client
const ffmpeg = createFFmpegClient({
  maxConcurrent: 4,
  timeout: 600000, // 10 minutes
});

// Probe a file
const info = await ffmpeg.probe({
  type: 'file',
  path: '/path/to/video.mp4',
});
console.log(`Duration: ${info.duration}s`);

// Transcode to web format
const result = await ffmpeg.transcode({
  input: { type: 'file', path: '/path/to/video.mp4' },
  output: { type: 'file', path: '/path/to/output.webm' },
  preset: 'web-hd',
});
console.log(`Completed in ${result.duration}ms`);

// Extract audio
await ffmpeg.extractAudio({
  input: { type: 'file', path: '/path/to/video.mp4' },
  output: { type: 'file', path: '/path/to/audio.mp3' },
  normalize: true,
});

// Generate thumbnail
await ffmpeg.generateThumbnail({
  input: { type: 'file', path: '/path/to/video.mp4' },
  output: { type: 'file', path: '/path/to/thumb.jpg' },
  timestamp: 5, // 5 seconds in
  width: 320,
});

// Graceful shutdown
await ffmpeg.shutdown();
```

---

## 8. Acceptance Criteria Verification

### 8.1 Functional Requirements

| Requirement | Test | Status |
|-------------|------|--------|
| Probe returns accurate metadata | `probe.test.ts` | ☐ |
| Transcode produces valid output | `transcode.test.ts` | ☐ |
| Audio extraction works | `audio.test.ts` | ☐ |
| Video resize maintains aspect | `video.test.ts` | ☐ |
| Progress events emitted | `progress-tracker.test.ts` | ☐ |
| Jobs can be cancelled | `job-manager.test.ts` | ☐ |
| Presets produce expected output | `presets.test.ts` | ☐ |
| Stream mode works for large files | `streaming.test.ts` | ☐ |

### 8.2 Non-Functional Requirements

| Requirement | Test | Status |
|-------------|------|--------|
| No memory leaks on long-running | Load test | ☐ |
| Graceful degradation without FFmpeg | Unit test | ☐ |
| Concurrent job limits enforced | `job-manager.test.ts` | ☐ |
| Temp files always cleaned up | Integration test | ☐ |
| Deterministic output for same input | E2E test | ☐ |
| Mock executor enables testing | Unit tests | ☐ |

### 8.3 Security Requirements

| Requirement | Test | Status |
|-------------|------|--------|
| Path traversal blocked | `security/path.test.ts` | ☐ |
| Command injection prevented | `security/filter.test.ts` | ☐ |
| Input size limits enforced | `security/limits.test.ts` | ☐ |
| Resource limits work | Integration test | ☐ |

### 8.4 Performance Requirements

| Requirement | Target | Test | Status |
|-------------|--------|------|--------|
| Probe latency | < 500ms | Benchmark | ☐ |
| Thumbnail generation | < 2s | Benchmark | ☐ |
| Audio extract | < 10s/min | Benchmark | ☐ |
| Transcode (1080p) | ~1x realtime | Benchmark | ☐ |

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
- [ ] All integration tests passing
- [ ] Security review completed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Runbooks reviewed by ops team
- [ ] Deployment tested in staging
- [ ] Rollback procedure verified

---

## 10. Summary

The FFmpeg Integration Module is ready for implementation with:

- **116 components** across 16 categories
- **102 files** totaling ~10,750 lines of code
- **Complete test coverage** plan (unit, integration, e2e)
- **Production-ready** CI/CD pipeline
- **Operational runbooks** for common scenarios
- **Kubernetes deployment** configuration
- **Comprehensive API** documentation

### SPARC Phases Complete

| Phase | Document | Status |
|-------|----------|--------|
| Specification | `specification-ffmpeg.md` | ✅ |
| Pseudocode | `pseudocode-ffmpeg.md` | ✅ |
| Architecture | `architecture-ffmpeg.md` | ✅ |
| Refinement | `refinement-ffmpeg.md` | ✅ |
| Completion | `completion-ffmpeg.md` | ✅ |

The module is ready for implementation following the London-School TDD approach with mock-based testing.

# FFmpeg Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/ffmpeg`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the FFmpeg Integration Module, providing a production-ready interface for invoking FFmpeg media processing operations within the LLM Dev Ops platform, enabling audio/video transcoding, extraction, normalization, and format conversion.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to FFmpeg binary and shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The FFmpeg Integration Module provides a **thin adapter layer** that:
- Invokes FFmpeg binary for media transformation tasks
- Provides type-safe command builders for common operations
- Manages process execution with resource limits and timeouts
- Enables streaming input/output for large media files
- Supports deterministic, reproducible media transformations
- Enables simulation/replay of media jobs for testing

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Command Building** | Type-safe FFmpeg command construction |
| **Process Execution** | Spawn, monitor, and manage FFmpeg processes |
| **Stream Handling** | Pipe-based I/O for memory-efficient processing |
| **Progress Tracking** | Parse FFmpeg output for progress metrics |
| **Resource Management** | CPU, memory, and concurrent job limits |
| **Output Validation** | Verify output integrity and format |
| **Job Replay** | Deterministic re-execution of transformations |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Command builder | Transcode, extract, normalize, convert |
| Process wrapper | Spawn with timeout, signals, resource limits |
| Stream I/O | stdin/stdout piping for large files |
| Progress parsing | Duration, frame, bitrate extraction |
| Preset library | Common transcoding profiles |
| Audio operations | Extract, normalize, convert, mix |
| Video operations | Transcode, resize, crop, thumbnail |
| Format detection | Probe input file metadata |
| Job serialization | Reproducible command snapshots |
| Mock executor | Testing without FFmpeg binary |

#### Out of Scope

| Item | Reason |
|------|--------|
| FFmpeg binary distribution | System/container scope |
| Hardware acceleration setup | Infrastructure scope |
| Codec licensing | Legal/deployment scope |
| Storage management | Platform storage scope |
| CDN integration | Separate integration |
| Live streaming servers | Separate integration |
| Video player UI | Frontend scope |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate media processing logic |
| Binary invocation | Shell out to FFmpeg, not libav bindings |
| Deterministic outputs | Same input + params = same output |
| Stream-first | Support files larger than memory |
| Graceful cancellation | SIGTERM then SIGKILL with cleanup |
| No blocking I/O | Async process management |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/observability` | Logging, metrics emission |
| `shared/tracing` | Span creation for jobs |
| `shared/credentials` | Storage access credentials |

### 3.2 External Dependencies (TypeScript)

| Package | Purpose |
|---------|---------|
| `execa` | Process execution with streams |
| `fluent-ffmpeg` | Optional: fluent command builder |
| Native `child_process` | Fallback process spawning |

### 3.3 System Requirements

| Requirement | Details |
|-------------|---------|
| FFmpeg binary | v5.0+ in PATH or configured path |
| FFprobe binary | For media probing (bundled with FFmpeg) |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| libav native bindings | Complexity, portability |
| Cloud-specific SDKs | Use shared storage abstractions |

---

## 4. API Coverage

### 4.1 Probing Operations

| Operation | Description |
|-----------|-------------|
| `probe` | Get media file metadata (duration, codecs, streams) |
| `probeStream` | Probe from readable stream |
| `getFormat` | Get container format info |
| `getStreams` | List audio/video/subtitle streams |

### 4.2 Transcoding Operations

| Operation | Description |
|-----------|-------------|
| `transcode` | Full transcoding with codec options |
| `transcodeToPreset` | Use predefined preset (web, mobile, archive) |
| `changeContainer` | Remux without re-encoding |
| `twoPassEncode` | High-quality two-pass encoding |

### 4.3 Audio Operations

| Operation | Description |
|-----------|-------------|
| `extractAudio` | Extract audio track from video |
| `normalizeAudio` | Loudness normalization (EBU R128) |
| `convertAudio` | Audio format conversion |
| `mixAudio` | Mix multiple audio sources |
| `trimAudio` | Extract time range |

### 4.4 Video Operations

| Operation | Description |
|-----------|-------------|
| `extractFrames` | Extract frames as images |
| `generateThumbnail` | Create thumbnail at timestamp |
| `resize` | Scale video dimensions |
| `crop` | Crop video region |
| `trimVideo` | Extract time range |
| `concatenate` | Join multiple videos |

### 4.5 Advanced Operations

| Operation | Description |
|-----------|-------------|
| `applyFilter` | Apply FFmpeg filter graph |
| `extractSubtitles` | Extract subtitle tracks |
| `embedSubtitles` | Burn-in or embed subtitles |
| `createHLS` | Generate HLS playlist and segments |
| `watermark` | Overlay image/text watermark |

---

## 5. Configuration

### 5.1 FFmpeg Client Config

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ffmpegPath` | string | `"ffmpeg"` | Path to FFmpeg binary |
| `ffprobePath` | string | `"ffprobe"` | Path to FFprobe binary |
| `timeout` | number | `3600000` | Default job timeout (ms) |
| `maxConcurrent` | number | `4` | Max concurrent jobs |
| `tempDir` | string | `os.tmpdir()` | Temporary file directory |
| `defaultPreset` | string | `"medium"` | Default encoding preset |

### 5.2 Resource Limits

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxMemoryMB` | number | `2048` | Memory limit per job |
| `cpuThreads` | number | `0` | FFmpeg threads (0=auto) |
| `niceLevel` | number | `10` | Process priority (Unix) |
| `ioNice` | string | `"idle"` | I/O priority class |

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
FFmpegError
├── ConfigurationError
│   ├── BinaryNotFound
│   ├── InvalidPath
│   └── UnsupportedVersion
│
├── InputError
│   ├── FileNotFound
│   ├── InvalidFormat
│   ├── CorruptedInput
│   ├── UnsupportedCodec
│   └── StreamNotFound
│
├── ProcessError
│   ├── SpawnFailed
│   ├── TimeoutExceeded
│   ├── MemoryExceeded
│   ├── SignalTerminated
│   └── NonZeroExit
│
├── OutputError
│   ├── WriteFailure
│   ├── DiskFull
│   ├── InvalidOutput
│   └── VerificationFailed
│
└── ResourceError
    ├── ConcurrencyLimitReached
    ├── TempDirUnavailable
    └── InsufficientPermissions
```

### 6.2 Error Handling Strategy

| Error Type | Handling | Retry |
|------------|----------|-------|
| `BinaryNotFound` | Fail fast | No |
| `FileNotFound` | Return error | No |
| `TimeoutExceeded` | Kill process, cleanup | Optional |
| `MemoryExceeded` | Kill process, cleanup | No |
| `NonZeroExit` | Parse stderr, return | Depends on code |
| `ConcurrencyLimitReached` | Queue or reject | Yes (wait) |

---

## 7. Job Model

### 7.1 Job Structure

```typescript
interface FFmpegJob {
  id: string;
  operation: OperationType;
  input: InputSpec;
  output: OutputSpec;
  options: TransformOptions;
  resourceLimits: ResourceLimits;
  createdAt: Date;
  status: JobStatus;
}

type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';
```

### 7.2 Job Serialization (for Replay)

Jobs must be serializable to JSON for:
- Audit logging
- Deterministic replay
- Distributed execution
- Failure recovery

---

## 8. Streaming Architecture

### 8.1 Stream Modes

| Mode | Input | Output | Use Case |
|------|-------|--------|----------|
| File-to-File | Path | Path | Standard transcoding |
| Stream-to-File | Readable | Path | Upload processing |
| File-to-Stream | Path | Writable | Download/serve |
| Stream-to-Stream | Readable | Writable | Pipeline processing |

### 8.2 Memory Constraints

| Scenario | Strategy |
|----------|----------|
| Large file input | Stream, never load fully |
| Multiple outputs | Sequential or temp files |
| Progress tracking | Parse stderr stream |
| Cancellation | Destroy streams, kill process |

---

## 9. Observability Requirements

### 9.1 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `ffmpeg.jobs.total` | Counter | Total jobs executed |
| `ffmpeg.jobs.active` | Gauge | Currently running jobs |
| `ffmpeg.jobs.duration` | Histogram | Job execution time |
| `ffmpeg.jobs.queue_wait` | Histogram | Time in queue |
| `ffmpeg.input.bytes` | Counter | Bytes processed (input) |
| `ffmpeg.output.bytes` | Counter | Bytes produced (output) |
| `ffmpeg.errors` | Counter | Errors by type |
| `ffmpeg.cpu.usage` | Gauge | CPU utilization |
| `ffmpeg.memory.usage` | Gauge | Memory utilization |

### 9.2 Logging

| Level | When |
|-------|------|
| ERROR | Process failures, corrupted output |
| WARN | Timeout, resource limits approached |
| INFO | Job start, complete, cancel |
| DEBUG | Command details, progress updates |
| TRACE | FFmpeg stderr output |

### 9.3 Tracing

| Span | Attributes |
|------|------------|
| `ffmpeg.job` | job_id, operation, input_format, output_format |
| `ffmpeg.probe` | file_path, duration, codec |
| `ffmpeg.process` | pid, exit_code, duration_ms |

---

## 10. Security Requirements

### 10.1 Input Validation

| Requirement | Implementation |
|-------------|----------------|
| Path traversal | Validate paths, no `..` |
| Command injection | Never interpolate user input |
| File type validation | Probe before processing |
| Size limits | Reject oversized inputs |

### 10.2 Process Isolation

| Requirement | Implementation |
|-------------|----------------|
| Resource limits | cgroups/ulimit |
| Temp file cleanup | Always cleanup on exit |
| No shell execution | Direct exec, no shell |
| Signal handling | Graceful termination |

---

## 11. Performance Requirements

### 11.1 Latency Budgets

| Operation | Target |
|-----------|--------|
| Probe | < 500ms |
| Thumbnail | < 2s |
| Audio extract | < 10s per minute |
| Transcode (1080p) | ~1x realtime |
| HLS generation | < 2x realtime |

### 11.2 Resource Budgets

| Resource | Limit |
|----------|-------|
| Memory per job | 2 GB default |
| CPU threads | Configurable |
| Temp disk | 2x input size |
| Concurrent jobs | 4 default |

---

## 12. Preset Library

### 12.1 Video Presets

| Preset | Codec | Resolution | Bitrate | Use Case |
|--------|-------|------------|---------|----------|
| `web-hd` | H.264 | 1080p | 5 Mbps | Web streaming |
| `web-sd` | H.264 | 720p | 2.5 Mbps | Mobile web |
| `mobile` | H.264 | 480p | 1 Mbps | Mobile apps |
| `archive` | H.265 | Original | CRF 18 | Long-term storage |
| `thumbnail` | MJPEG | 320px | N/A | Preview images |

### 12.2 Audio Presets

| Preset | Codec | Sample Rate | Bitrate | Use Case |
|--------|-------|-------------|---------|----------|
| `podcast` | AAC | 44.1kHz | 128 kbps | Speech content |
| `music` | AAC | 48kHz | 256 kbps | Music streaming |
| `voice` | Opus | 16kHz | 32 kbps | Voice messages |
| `archive` | FLAC | Original | Lossless | Archival |

---

## 13. Testing Requirements

### 13.1 Mock Executor

Provide `MockFFmpegExecutor` for testing:
- Simulates process execution
- Returns configurable outputs
- Captures command arguments
- Supports failure injection

### 13.2 Fixtures

| Fixture | Format | Duration | Purpose |
|---------|--------|----------|---------|
| `test-video.mp4` | H.264/AAC | 10s | General testing |
| `test-audio.wav` | PCM | 5s | Audio tests |
| `corrupted.mp4` | Invalid | N/A | Error handling |
| `large-video.mp4` | H.264 | 60s | Stream testing |

---

## 14. Acceptance Criteria

### 14.1 Functional

- [ ] Probe returns accurate metadata
- [ ] Transcode produces valid output
- [ ] Audio extraction works
- [ ] Video resize maintains aspect ratio
- [ ] Progress events emitted
- [ ] Jobs can be cancelled
- [ ] Presets produce expected output
- [ ] Stream mode works for large files

### 14.2 Non-Functional

- [ ] No memory leaks on long-running jobs
- [ ] Graceful degradation without FFmpeg
- [ ] Concurrent job limits enforced
- [ ] Temp files always cleaned up
- [ ] Deterministic output for same input
- [ ] Mock executor enables testing

### 14.3 Documentation

- [ ] API reference complete
- [ ] Preset documentation
- [ ] Troubleshooting guide
- [ ] Example code provided

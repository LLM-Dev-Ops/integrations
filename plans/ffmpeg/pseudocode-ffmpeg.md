# FFmpeg Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/ffmpeg`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Command Builder](#3-command-builder)
4. [Process Executor](#4-process-executor)
5. [Probing Operations](#5-probing-operations)
6. [Transcoding Operations](#6-transcoding-operations)
7. [Audio Operations](#7-audio-operations)
8. [Video Operations](#8-video-operations)
9. [Stream Handling](#9-stream-handling)
10. [Job Management](#10-job-management)
11. [Progress Tracking](#11-progress-tracking)
12. [Testing Support](#12-testing-support)

---

## 1. Overview

### 1.1 Pseudocode Conventions

```
CLASS ClassName:
    field: Type

    FUNCTION method(param: Type) -> ReturnType:
        // Comments explain intent
        variable = expression
        IF condition:
            action
        FOR item IN collection:
            process(item)
        RETURN value
```

### 1.2 London-School TDD Mapping

Each interface serves as a **contract** for:
1. **Production implementations** - Real FFmpeg process execution
2. **Test doubles (mocks)** - Simulated execution for testing
3. **Dependency injection** - Composable, testable architecture

---

## 2. Client Initialization

### 2.1 FFmpegClient Interface

```pseudocode
INTERFACE FFmpegClient:
    FUNCTION probe(input: InputSpec) -> Promise<MediaInfo>
    FUNCTION transcode(job: TranscodeJob) -> Promise<JobResult>
    FUNCTION extractAudio(job: AudioExtractJob) -> Promise<JobResult>
    FUNCTION generateThumbnail(job: ThumbnailJob) -> Promise<JobResult>
    FUNCTION executeCommand(command: FFmpegCommand) -> Promise<JobResult>
    FUNCTION cancelJob(jobId: string) -> Promise<void>
    FUNCTION getJobStatus(jobId: string) -> JobStatus
    FUNCTION shutdown() -> Promise<void>

CLASS FFmpegClientImpl IMPLEMENTS FFmpegClient:
    config: FFmpegConfig
    executor: ProcessExecutor
    jobManager: JobManager
    logger: Logger
    metrics: MetricsClient

    FUNCTION constructor(config: FFmpegConfig):
        this.config = validateConfig(config)
        this.logger = config.logger ?? new NoopLogger()
        this.metrics = config.metrics ?? new NoopMetrics()

        // Verify FFmpeg binary exists
        this.verifyBinary(config.ffmpegPath)
        this.verifyBinary(config.ffprobePath)

        // Initialize executor with resource limits
        this.executor = new ProcessExecutor({
            timeout: config.timeout,
            maxMemoryMB: config.maxMemoryMB,
            cpuThreads: config.cpuThreads
        })

        // Initialize job manager
        this.jobManager = new JobManager({
            maxConcurrent: config.maxConcurrent,
            tempDir: config.tempDir
        })

        this.logger.info("FFmpeg client initialized", {
            ffmpegPath: config.ffmpegPath,
            maxConcurrent: config.maxConcurrent
        })

    FUNCTION verifyBinary(path: string) -> void:
        TRY:
            result = execSync(`${path} -version`)
            version = parseVersion(result.toString())

            IF version < MIN_SUPPORTED_VERSION:
                throw new ConfigurationError(
                    `FFmpeg version ${version} not supported, need ${MIN_SUPPORTED_VERSION}+`
                )
        CATCH error:
            throw new BinaryNotFoundError(path, error)
```

### 2.2 Configuration

```pseudocode
INTERFACE FFmpegConfig:
    ffmpegPath?: string         // Default: "ffmpeg"
    ffprobePath?: string        // Default: "ffprobe"
    timeout?: number            // Default: 3600000 (1 hour)
    maxConcurrent?: number      // Default: 4
    tempDir?: string            // Default: os.tmpdir()
    maxMemoryMB?: number        // Default: 2048
    cpuThreads?: number         // Default: 0 (auto)
    defaultPreset?: string      // Default: "medium"
    logger?: Logger
    metrics?: MetricsClient

FUNCTION validateConfig(config: FFmpegConfig) -> FFmpegConfig:
    errors = []

    IF config.maxConcurrent !== undefined AND config.maxConcurrent < 1:
        errors.push("maxConcurrent must be >= 1")

    IF config.timeout !== undefined AND config.timeout < 1000:
        errors.push("timeout must be >= 1000ms")

    IF config.maxMemoryMB !== undefined AND config.maxMemoryMB < 256:
        errors.push("maxMemoryMB must be >= 256")

    IF errors.length > 0:
        throw new ConfigurationError(errors.join("; "))

    RETURN {
        ffmpegPath: config.ffmpegPath ?? "ffmpeg",
        ffprobePath: config.ffprobePath ?? "ffprobe",
        timeout: config.timeout ?? 3600000,
        maxConcurrent: config.maxConcurrent ?? 4,
        tempDir: config.tempDir ?? os.tmpdir(),
        maxMemoryMB: config.maxMemoryMB ?? 2048,
        cpuThreads: config.cpuThreads ?? 0,
        defaultPreset: config.defaultPreset ?? "medium",
        ...config
    }
```

---

## 3. Command Builder

### 3.1 FFmpegCommand Interface

```pseudocode
INTERFACE FFmpegCommand:
    inputs: InputSpec[]
    outputs: OutputSpec[]
    globalOptions: string[]
    filterGraph?: FilterGraph

    FUNCTION toArgs() -> string[]
    FUNCTION toString() -> string
    FUNCTION toJSON() -> object  // For serialization/replay

CLASS FFmpegCommandBuilder:
    private inputs: InputSpec[] = []
    private outputs: OutputSpec[] = []
    private globalOptions: string[] = []
    private filterGraph: FilterGraph | null = null

    FUNCTION addInput(input: InputSpec) -> FFmpegCommandBuilder:
        this.inputs.push(input)
        RETURN this

    FUNCTION addOutput(output: OutputSpec) -> FFmpegCommandBuilder:
        this.outputs.push(output)
        RETURN this

    FUNCTION setGlobalOption(option: string, value?: string) -> FFmpegCommandBuilder:
        IF value !== undefined:
            this.globalOptions.push(option, value)
        ELSE:
            this.globalOptions.push(option)
        RETURN this

    FUNCTION overwrite() -> FFmpegCommandBuilder:
        RETURN this.setGlobalOption("-y")

    FUNCTION setThreads(count: number) -> FFmpegCommandBuilder:
        RETURN this.setGlobalOption("-threads", String(count))

    FUNCTION setFilter(filter: FilterGraph) -> FFmpegCommandBuilder:
        this.filterGraph = filter
        RETURN this

    FUNCTION build() -> FFmpegCommand:
        IF this.inputs.length === 0:
            throw new ValidationError("At least one input required")

        IF this.outputs.length === 0:
            throw new ValidationError("At least one output required")

        RETURN {
            inputs: [...this.inputs],
            outputs: [...this.outputs],
            globalOptions: [...this.globalOptions],
            filterGraph: this.filterGraph,
            toArgs: () => this.buildArgs(),
            toString: () => this.buildArgs().join(" "),
            toJSON: () => this.serialize()
        }

    PRIVATE FUNCTION buildArgs() -> string[]:
        args = []

        // Global options first
        args.push(...this.globalOptions)

        // Input specifications
        FOR input IN this.inputs:
            args.push(...this.buildInputArgs(input))

        // Filter graph
        IF this.filterGraph:
            args.push("-filter_complex", this.filterGraph.toString())

        // Output specifications
        FOR output IN this.outputs:
            args.push(...this.buildOutputArgs(output))

        RETURN args

    PRIVATE FUNCTION buildInputArgs(input: InputSpec) -> string[]:
        args = []

        // Input options before -i
        IF input.seekTo:
            args.push("-ss", formatTime(input.seekTo))

        IF input.duration:
            args.push("-t", formatTime(input.duration))

        IF input.format:
            args.push("-f", input.format)

        FOR [key, value] IN Object.entries(input.options ?? {}):
            args.push(`-${key}`, String(value))

        // Input source
        IF input.type === "file":
            args.push("-i", input.path)
        ELSE IF input.type === "pipe":
            args.push("-i", "pipe:0")
        ELSE IF input.type === "url":
            args.push("-i", input.url)

        RETURN args

    PRIVATE FUNCTION buildOutputArgs(output: OutputSpec) -> string[]:
        args = []

        // Codec options
        IF output.videoCodec:
            args.push("-c:v", output.videoCodec)
        IF output.audioCodec:
            args.push("-c:a", output.audioCodec)

        // Quality settings
        IF output.videoBitrate:
            args.push("-b:v", output.videoBitrate)
        IF output.audioBitrate:
            args.push("-b:a", output.audioBitrate)
        IF output.crf:
            args.push("-crf", String(output.crf))

        // Size/format
        IF output.resolution:
            args.push("-s", output.resolution)
        IF output.fps:
            args.push("-r", String(output.fps))
        IF output.format:
            args.push("-f", output.format)

        // Additional options
        FOR [key, value] IN Object.entries(output.options ?? {}):
            args.push(`-${key}`, String(value))

        // Output destination
        IF output.type === "file":
            args.push(output.path)
        ELSE IF output.type === "pipe":
            args.push("pipe:1")

        RETURN args
```

### 3.2 Input/Output Specifications

```pseudocode
INTERFACE InputSpec:
    type: "file" | "pipe" | "url"
    path?: string           // For file type
    url?: string            // For url type
    stream?: Readable       // For pipe type
    format?: string         // Force input format
    seekTo?: number         // Start time in seconds
    duration?: number       // Duration to process
    options?: Record<string, string>

INTERFACE OutputSpec:
    type: "file" | "pipe"
    path?: string           // For file type
    stream?: Writable       // For pipe type
    format?: string         // Output format
    videoCodec?: string     // e.g., "libx264", "copy"
    audioCodec?: string     // e.g., "aac", "copy"
    videoBitrate?: string   // e.g., "5M"
    audioBitrate?: string   // e.g., "128k"
    crf?: number            // Quality (0-51)
    resolution?: string     // e.g., "1920x1080"
    fps?: number            // Frame rate
    options?: Record<string, string>
```

---

## 4. Process Executor

### 4.1 Executor Interface

```pseudocode
INTERFACE ProcessExecutor:
    FUNCTION execute(command: FFmpegCommand, options: ExecuteOptions) -> Promise<ProcessResult>
    FUNCTION kill(pid: number, signal?: string) -> void

INTERFACE ExecuteOptions:
    timeout?: number
    cwd?: string
    env?: Record<string, string>
    stdin?: Readable
    stdout?: Writable
    onProgress?: (progress: Progress) -> void
    signal?: AbortSignal

INTERFACE ProcessResult:
    exitCode: number
    stdout: string
    stderr: string
    duration: number
    killed: boolean

CLASS ProcessExecutorImpl IMPLEMENTS ProcessExecutor:
    private activeProcesses: Map<number, ChildProcess> = new Map()
    private config: ExecutorConfig

    ASYNC FUNCTION execute(command: FFmpegCommand, options: ExecuteOptions) -> Promise<ProcessResult>:
        args = command.toArgs()
        startTime = Date.now()

        this.logger.debug("Executing FFmpeg command", {
            args: args.join(" "),
            timeout: options.timeout
        })

        process = spawn(this.config.ffmpegPath, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: ["pipe", "pipe", "pipe"]
        })

        this.activeProcesses.set(process.pid, process)

        // Set up timeout
        timeoutId = null
        IF options.timeout:
            timeoutId = setTimeout(() => {
                this.kill(process.pid, "SIGTERM")
                // Force kill after grace period
                setTimeout(() => this.kill(process.pid, "SIGKILL"), 5000)
            }, options.timeout)

        // Handle abort signal
        IF options.signal:
            options.signal.addEventListener("abort", () => {
                this.kill(process.pid, "SIGTERM")
            })

        // Connect streams
        IF options.stdin:
            options.stdin.pipe(process.stdin)

        IF options.stdout:
            process.stdout.pipe(options.stdout)

        // Parse progress from stderr
        stderrChunks = []
        process.stderr.on("data", (chunk) => {
            stderrChunks.push(chunk)
            IF options.onProgress:
                progress = this.parseProgress(chunk.toString())
                IF progress:
                    options.onProgress(progress)
        })

        // Wait for completion
        TRY:
            exitCode = await this.waitForExit(process)

            IF timeoutId:
                clearTimeout(timeoutId)

            RETURN {
                exitCode,
                stdout: "",  // Usually empty for FFmpeg
                stderr: Buffer.concat(stderrChunks).toString(),
                duration: Date.now() - startTime,
                killed: exitCode === null
            }

        FINALLY:
            this.activeProcesses.delete(process.pid)

    FUNCTION kill(pid: number, signal: string = "SIGTERM") -> void:
        process = this.activeProcesses.get(pid)
        IF process:
            process.kill(signal)
            this.logger.debug("Sent signal to process", { pid, signal })

    PRIVATE ASYNC FUNCTION waitForExit(process: ChildProcess) -> Promise<number>:
        RETURN new Promise((resolve, reject) => {
            process.on("exit", (code) => resolve(code ?? 0))
            process.on("error", (err) => reject(new SpawnFailedError(err)))
        })

    PRIVATE FUNCTION parseProgress(output: string) -> Progress | null:
        // FFmpeg progress format: frame=123 fps=30 time=00:00:05.00 bitrate=1000kbits/s
        match = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
        IF match:
            hours = parseInt(match[1])
            minutes = parseInt(match[2])
            seconds = parseInt(match[3])
            centiseconds = parseInt(match[4])

            timeSeconds = hours * 3600 + minutes * 60 + seconds + centiseconds / 100

            frameMatch = output.match(/frame=\s*(\d+)/)
            fpsMatch = output.match(/fps=\s*([\d.]+)/)
            bitrateMatch = output.match(/bitrate=\s*([\d.]+)kbits/)

            RETURN {
                time: timeSeconds,
                frame: frameMatch ? parseInt(frameMatch[1]) : undefined,
                fps: fpsMatch ? parseFloat(fpsMatch[1]) : undefined,
                bitrate: bitrateMatch ? parseFloat(bitrateMatch[1]) : undefined
            }

        RETURN null
```

---

## 5. Probing Operations

### 5.1 Probe Implementation

```pseudocode
INTERFACE MediaInfo:
    format: FormatInfo
    streams: StreamInfo[]
    duration: number
    size: number
    bitrate: number

INTERFACE FormatInfo:
    name: string
    longName: string
    duration: number
    size: number
    bitrate: number
    tags: Record<string, string>

INTERFACE StreamInfo:
    index: number
    type: "video" | "audio" | "subtitle" | "data"
    codec: string
    codecLongName: string
    profile?: string
    // Video-specific
    width?: number
    height?: number
    fps?: number
    pixelFormat?: string
    // Audio-specific
    sampleRate?: number
    channels?: number
    channelLayout?: string
    // Common
    bitrate?: number
    duration?: number
    tags: Record<string, string>

ASYNC FUNCTION client.probe(input: InputSpec) -> Promise<MediaInfo>:
    args = [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams"
    ]

    IF input.type === "file":
        args.push(input.path)
    ELSE IF input.type === "url":
        args.push(input.url)
    ELSE IF input.type === "pipe":
        args.push("pipe:0")

    startTime = Date.now()

    TRY:
        result = await this.executeProbe(args, input.stream)

        IF result.exitCode !== 0:
            throw new ProbeError(`FFprobe failed: ${result.stderr}`)

        data = JSON.parse(result.stdout)

        mediaInfo = {
            format: this.parseFormat(data.format),
            streams: data.streams.map(s => this.parseStream(s)),
            duration: parseFloat(data.format.duration),
            size: parseInt(data.format.size),
            bitrate: parseInt(data.format.bit_rate)
        }

        this.metrics.histogram("ffmpeg.probe.duration", Date.now() - startTime)
        this.logger.debug("Probe completed", {
            duration: mediaInfo.duration,
            streams: mediaInfo.streams.length
        })

        RETURN mediaInfo

    CATCH error:
        this.metrics.increment("ffmpeg.errors", { operation: "probe" })
        throw new ProbeError(input, error)

PRIVATE FUNCTION parseStream(raw: object) -> StreamInfo:
    base = {
        index: raw.index,
        type: raw.codec_type,
        codec: raw.codec_name,
        codecLongName: raw.codec_long_name,
        profile: raw.profile,
        bitrate: raw.bit_rate ? parseInt(raw.bit_rate) : undefined,
        duration: raw.duration ? parseFloat(raw.duration) : undefined,
        tags: raw.tags ?? {}
    }

    IF raw.codec_type === "video":
        RETURN {
            ...base,
            width: raw.width,
            height: raw.height,
            fps: this.parseFps(raw.r_frame_rate),
            pixelFormat: raw.pix_fmt
        }

    IF raw.codec_type === "audio":
        RETURN {
            ...base,
            sampleRate: raw.sample_rate ? parseInt(raw.sample_rate) : undefined,
            channels: raw.channels,
            channelLayout: raw.channel_layout
        }

    RETURN base
```

---

## 6. Transcoding Operations

### 6.1 Transcode Implementation

```pseudocode
INTERFACE TranscodeJob:
    id?: string
    input: InputSpec
    output: OutputSpec
    preset?: PresetName
    options?: TranscodeOptions

INTERFACE TranscodeOptions:
    twoPass?: boolean
    hwAccel?: string        // e.g., "cuda", "vaapi"
    deinterlace?: boolean
    denoise?: boolean
    normalize?: boolean     // Audio normalization

ASYNC FUNCTION client.transcode(job: TranscodeJob) -> Promise<JobResult>:
    jobId = job.id ?? generateJobId()

    this.logger.info("Starting transcode job", { jobId, preset: job.preset })
    this.metrics.increment("ffmpeg.jobs.total", { operation: "transcode" })

    // Register job
    this.jobManager.registerJob(jobId, job)

    TRY:
        // Get preset if specified
        outputSpec = job.output
        IF job.preset:
            presetConfig = PRESETS[job.preset]
            outputSpec = { ...presetConfig, ...job.output }

        // Build command
        builder = new FFmpegCommandBuilder()
            .addInput(job.input)
            .addOutput(outputSpec)
            .overwrite()
            .setThreads(this.config.cpuThreads)

        IF job.options?.twoPass:
            RETURN await this.executeTwoPass(jobId, builder, job)

        command = builder.build()

        // Execute
        result = await this.executeJob(jobId, command)

        // Validate output
        IF job.output.type === "file":
            await this.validateOutput(job.output.path)

        this.jobManager.completeJob(jobId, "completed")

        RETURN {
            jobId,
            status: "completed",
            outputPath: job.output.path,
            duration: result.duration,
            stats: this.parseStats(result.stderr)
        }

    CATCH error:
        this.jobManager.completeJob(jobId, "failed", error)
        throw error

ASYNC FUNCTION executeTwoPass(jobId: string, builder: FFmpegCommandBuilder, job: TranscodeJob) -> Promise<JobResult>:
    passLogFile = path.join(this.config.tempDir, `${jobId}-pass`)

    // First pass - analysis
    this.logger.debug("Starting first pass", { jobId })

    pass1Builder = builder.clone()
        .setGlobalOption("-pass", "1")
        .setGlobalOption("-passlogfile", passLogFile)

    // Output to null for first pass
    pass1Command = pass1Builder
        .clearOutputs()
        .addOutput({ type: "file", path: "/dev/null", format: "null" })
        .build()

    await this.executeJob(jobId, pass1Command)

    // Second pass - encoding
    this.logger.debug("Starting second pass", { jobId })

    pass2Builder = builder.clone()
        .setGlobalOption("-pass", "2")
        .setGlobalOption("-passlogfile", passLogFile)

    pass2Command = pass2Builder.build()
    result = await this.executeJob(jobId, pass2Command)

    // Cleanup pass log files
    await this.cleanupPassLogs(passLogFile)

    RETURN {
        jobId,
        status: "completed",
        outputPath: job.output.path,
        duration: result.duration,
        stats: this.parseStats(result.stderr)
    }
```

### 6.2 Preset Definitions

```pseudocode
CONST PRESETS: Record<PresetName, Partial<OutputSpec>> = {
    "web-hd": {
        videoCodec: "libx264",
        audioCodec: "aac",
        videoBitrate: "5M",
        audioBitrate: "192k",
        resolution: "1920x1080",
        options: {
            "preset": "medium",
            "profile:v": "high",
            "level": "4.1",
            "movflags": "+faststart"
        }
    },

    "web-sd": {
        videoCodec: "libx264",
        audioCodec: "aac",
        videoBitrate: "2500k",
        audioBitrate: "128k",
        resolution: "1280x720",
        options: {
            "preset": "medium",
            "profile:v": "main",
            "movflags": "+faststart"
        }
    },

    "mobile": {
        videoCodec: "libx264",
        audioCodec: "aac",
        videoBitrate: "1M",
        audioBitrate: "96k",
        resolution: "854x480",
        options: {
            "preset": "fast",
            "profile:v": "baseline",
            "level": "3.0"
        }
    },

    "archive": {
        videoCodec: "libx265",
        audioCodec: "aac",
        crf: 18,
        audioBitrate: "256k",
        options: {
            "preset": "slow"
        }
    },

    "podcast": {
        audioCodec: "aac",
        audioBitrate: "128k",
        options: {
            "ac": "1",
            "ar": "44100"
        }
    },

    "music": {
        audioCodec: "aac",
        audioBitrate: "256k",
        options: {
            "ac": "2",
            "ar": "48000"
        }
    },

    "voice": {
        audioCodec: "libopus",
        audioBitrate: "32k",
        options: {
            "ac": "1",
            "ar": "16000",
            "application": "voip"
        }
    }
}
```

---

## 7. Audio Operations

### 7.1 Audio Extraction

```pseudocode
INTERFACE AudioExtractJob:
    id?: string
    input: InputSpec
    output: OutputSpec
    streamIndex?: number    // Which audio stream
    normalize?: boolean

ASYNC FUNCTION client.extractAudio(job: AudioExtractJob) -> Promise<JobResult>:
    jobId = job.id ?? generateJobId()

    this.logger.info("Starting audio extraction", { jobId })

    builder = new FFmpegCommandBuilder()
        .addInput(job.input)
        .setGlobalOption("-vn")  // No video
        .overwrite()

    // Select specific stream if specified
    IF job.streamIndex !== undefined:
        builder.setGlobalOption("-map", `0:a:${job.streamIndex}`)

    // Apply normalization filter
    IF job.normalize:
        builder.setFilter(new FilterGraph()
            .addFilter("loudnorm", {
                I: -16,
                TP: -1.5,
                LRA: 11
            })
        )

    builder.addOutput(job.output)
    command = builder.build()

    result = await this.executeJob(jobId, command)

    RETURN {
        jobId,
        status: "completed",
        outputPath: job.output.path,
        duration: result.duration
    }
```

### 7.2 Audio Normalization

```pseudocode
INTERFACE NormalizeJob:
    id?: string
    input: InputSpec
    output: OutputSpec
    target: NormalizationTarget

INTERFACE NormalizationTarget:
    standard: "ebu-r128" | "atsc-a85" | "custom"
    integratedLoudness?: number  // LUFS, default -16
    truePeak?: number            // dBTP, default -1.5
    loudnessRange?: number       // LU, default 11

ASYNC FUNCTION client.normalizeAudio(job: NormalizeJob) -> Promise<JobResult>:
    jobId = job.id ?? generateJobId()

    // Two-pass normalization for best results
    // First pass: analyze
    analyzeCommand = new FFmpegCommandBuilder()
        .addInput(job.input)
        .setFilter(new FilterGraph()
            .addFilter("loudnorm", {
                I: job.target.integratedLoudness ?? -16,
                TP: job.target.truePeak ?? -1.5,
                LRA: job.target.loudnessRange ?? 11,
                print_format: "json"
            })
        )
        .addOutput({ type: "file", path: "/dev/null", format: "null" })
        .build()

    analyzeResult = await this.executeJob(jobId + "-analyze", analyzeCommand)

    // Parse measured values from output
    measured = this.parseLoudnormOutput(analyzeResult.stderr)

    // Second pass: apply correction
    normalizeCommand = new FFmpegCommandBuilder()
        .addInput(job.input)
        .setFilter(new FilterGraph()
            .addFilter("loudnorm", {
                I: job.target.integratedLoudness ?? -16,
                TP: job.target.truePeak ?? -1.5,
                LRA: job.target.loudnessRange ?? 11,
                measured_I: measured.inputI,
                measured_TP: measured.inputTP,
                measured_LRA: measured.inputLRA,
                measured_thresh: measured.inputThresh,
                offset: measured.targetOffset,
                linear: "true"
            })
        )
        .addOutput(job.output)
        .overwrite()
        .build()

    result = await this.executeJob(jobId, normalizeCommand)

    RETURN {
        jobId,
        status: "completed",
        outputPath: job.output.path,
        stats: {
            inputLoudness: measured.inputI,
            outputLoudness: job.target.integratedLoudness ?? -16
        }
    }
```

---

## 8. Video Operations

### 8.1 Thumbnail Generation

```pseudocode
INTERFACE ThumbnailJob:
    id?: string
    input: InputSpec
    output: OutputSpec
    timestamp?: number      // Seconds, default: 10% of duration
    width?: number          // Default: 320
    height?: number         // Default: proportional

ASYNC FUNCTION client.generateThumbnail(job: ThumbnailJob) -> Promise<JobResult>:
    jobId = job.id ?? generateJobId()

    // Get duration if timestamp not specified
    timestamp = job.timestamp
    IF timestamp === undefined:
        info = await this.probe(job.input)
        timestamp = info.duration * 0.1  // 10% into video

    // Calculate dimensions
    width = job.width ?? 320
    height = job.height ?? -1  // Maintain aspect ratio

    builder = new FFmpegCommandBuilder()
        .addInput({
            ...job.input,
            seekTo: timestamp
        })
        .setGlobalOption("-frames:v", "1")
        .setFilter(new FilterGraph()
            .addFilter("scale", { w: width, h: height })
        )
        .addOutput({
            ...job.output,
            videoCodec: "mjpeg",
            options: { "q:v": "2" }
        })
        .overwrite()

    command = builder.build()
    result = await this.executeJob(jobId, command)

    RETURN {
        jobId,
        status: "completed",
        outputPath: job.output.path,
        timestamp
    }
```

### 8.2 Video Resize

```pseudocode
INTERFACE ResizeJob:
    id?: string
    input: InputSpec
    output: OutputSpec
    width?: number
    height?: number
    maintainAspect?: boolean  // Default: true
    algorithm?: "bilinear" | "bicubic" | "lanczos"

ASYNC FUNCTION client.resize(job: ResizeJob) -> Promise<JobResult>:
    jobId = job.id ?? generateJobId()

    // Build scale filter
    scaleParams = {}

    IF job.width AND job.height AND job.maintainAspect !== false:
        // Fit within bounds, maintain aspect
        scaleParams = {
            w: `min(${job.width},iw)`,
            h: `min(${job.height},ih)`,
            force_original_aspect_ratio: "decrease"
        }
    ELSE IF job.width AND NOT job.height:
        scaleParams = { w: job.width, h: -2 }  // -2 ensures even height
    ELSE IF job.height AND NOT job.width:
        scaleParams = { w: -2, h: job.height }
    ELSE:
        scaleParams = { w: job.width, h: job.height }

    IF job.algorithm:
        scaleParams.flags = job.algorithm

    builder = new FFmpegCommandBuilder()
        .addInput(job.input)
        .setFilter(new FilterGraph()
            .addFilter("scale", scaleParams)
        )
        .addOutput(job.output)
        .overwrite()

    command = builder.build()
    result = await this.executeJob(jobId, command)

    RETURN {
        jobId,
        status: "completed",
        outputPath: job.output.path
    }
```

### 8.3 Video Concatenation

```pseudocode
INTERFACE ConcatJob:
    id?: string
    inputs: InputSpec[]
    output: OutputSpec
    transition?: TransitionSpec

INTERFACE TransitionSpec:
    type: "fade" | "dissolve" | "wipe"
    duration: number  // Seconds

ASYNC FUNCTION client.concatenate(job: ConcatJob) -> Promise<JobResult>:
    jobId = job.id ?? generateJobId()

    IF job.inputs.length < 2:
        throw new ValidationError("Concatenation requires at least 2 inputs")

    builder = new FFmpegCommandBuilder()

    // Add all inputs
    FOR input IN job.inputs:
        builder.addInput(input)

    IF job.transition:
        // Complex concatenation with transitions
        filterGraph = this.buildTransitionFilter(job.inputs.length, job.transition)
        builder.setFilter(filterGraph)
    ELSE:
        // Simple concatenation using concat filter
        filterParts = []
        FOR i IN range(job.inputs.length):
            filterParts.push(`[${i}:v][${i}:a]`)

        concatFilter = `${filterParts.join("")}concat=n=${job.inputs.length}:v=1:a=1[outv][outa]`

        builder.setFilter(new FilterGraph().raw(concatFilter))
        builder.setGlobalOption("-map", "[outv]")
        builder.setGlobalOption("-map", "[outa]")

    builder.addOutput(job.output).overwrite()

    command = builder.build()
    result = await this.executeJob(jobId, command)

    RETURN {
        jobId,
        status: "completed",
        outputPath: job.output.path
    }
```

---

## 9. Stream Handling

### 9.1 Stream-to-File Processing

```pseudocode
ASYNC FUNCTION client.processStream(
    inputStream: Readable,
    output: OutputSpec,
    options: StreamOptions
) -> Promise<JobResult>:
    jobId = options.jobId ?? generateJobId()

    // Create command with pipe input
    builder = new FFmpegCommandBuilder()
        .addInput({
            type: "pipe",
            stream: inputStream,
            format: options.inputFormat  // Required for pipe input
        })
        .addOutput(output)
        .overwrite()

    IF options.codec:
        builder.setGlobalOption("-c:v", options.codec)

    command = builder.build()

    // Execute with stdin connected to stream
    result = await this.executor.execute(command, {
        stdin: inputStream,
        timeout: options.timeout,
        onProgress: options.onProgress
    })

    IF result.exitCode !== 0:
        throw new ProcessError(`FFmpeg exited with code ${result.exitCode}`, result.stderr)

    RETURN {
        jobId,
        status: "completed",
        outputPath: output.path,
        duration: result.duration
    }
```

### 9.2 File-to-Stream Processing

```pseudocode
ASYNC FUNCTION client.streamOutput(
    input: InputSpec,
    outputStream: Writable,
    options: StreamOptions
) -> Promise<JobResult>:
    jobId = options.jobId ?? generateJobId()

    builder = new FFmpegCommandBuilder()
        .addInput(input)
        .addOutput({
            type: "pipe",
            format: options.outputFormat ?? "mp4",
            options: {
                "movflags": "frag_keyframe+empty_moov"  // Required for streaming MP4
            }
        })

    command = builder.build()

    // Execute with stdout connected to stream
    result = await this.executor.execute(command, {
        stdout: outputStream,
        timeout: options.timeout,
        onProgress: options.onProgress
    })

    RETURN {
        jobId,
        status: "completed",
        duration: result.duration
    }
```

### 9.3 Pipe-through Processing

```pseudocode
ASYNC FUNCTION client.pipeThroughTransform(
    inputStream: Readable,
    outputStream: Writable,
    transform: TransformSpec
) -> Promise<JobResult>:
    jobId = generateJobId()

    builder = new FFmpegCommandBuilder()
        .addInput({
            type: "pipe",
            format: transform.inputFormat
        })

    // Apply transform filters
    IF transform.filters:
        builder.setFilter(new FilterGraph().fromSpec(transform.filters))

    builder.addOutput({
        type: "pipe",
        format: transform.outputFormat,
        videoCodec: transform.videoCodec,
        audioCodec: transform.audioCodec
    })

    command = builder.build()

    result = await this.executor.execute(command, {
        stdin: inputStream,
        stdout: outputStream,
        timeout: transform.timeout
    })

    RETURN {
        jobId,
        status: "completed",
        duration: result.duration
    }
```

---

## 10. Job Management

### 10.1 Job Manager

```pseudocode
CLASS JobManager:
    private jobs: Map<string, JobRecord> = new Map()
    private activeCount: number = 0
    private queue: JobQueue
    private maxConcurrent: number

    FUNCTION constructor(config: JobManagerConfig):
        this.maxConcurrent = config.maxConcurrent
        this.queue = new JobQueue()

    ASYNC FUNCTION submitJob(job: FFmpegJob) -> Promise<string>:
        jobId = job.id ?? generateJobId()

        record: JobRecord = {
            id: jobId,
            job,
            status: "pending",
            createdAt: new Date(),
            progress: null
        }

        this.jobs.set(jobId, record)

        IF this.activeCount >= this.maxConcurrent:
            // Queue the job
            this.logger.debug("Job queued", { jobId, queueSize: this.queue.size() })
            await this.queue.enqueue(jobId)
            this.metrics.increment("ffmpeg.jobs.queued")
        ELSE:
            // Start immediately
            this.startJob(jobId)

        RETURN jobId

    PRIVATE ASYNC FUNCTION startJob(jobId: string) -> void:
        record = this.jobs.get(jobId)
        IF NOT record:
            RETURN

        this.activeCount++
        record.status = "running"
        record.startedAt = new Date()

        this.metrics.gauge("ffmpeg.jobs.active", this.activeCount)
        this.logger.info("Job started", { jobId })

    FUNCTION completeJob(jobId: string, status: JobStatus, error?: Error) -> void:
        record = this.jobs.get(jobId)
        IF NOT record:
            RETURN

        record.status = status
        record.completedAt = new Date()
        record.error = error

        this.activeCount--
        this.metrics.gauge("ffmpeg.jobs.active", this.activeCount)

        // Process queue
        this.processQueue()

        // Emit metrics
        IF record.startedAt:
            duration = record.completedAt.getTime() - record.startedAt.getTime()
            this.metrics.histogram("ffmpeg.jobs.duration", duration, {
                status,
                operation: record.job.operation
            })

    PRIVATE FUNCTION processQueue() -> void:
        WHILE this.activeCount < this.maxConcurrent AND this.queue.size() > 0:
            nextJobId = this.queue.dequeue()
            IF nextJobId:
                this.startJob(nextJobId)

    FUNCTION cancelJob(jobId: string) -> boolean:
        record = this.jobs.get(jobId)
        IF NOT record:
            RETURN false

        IF record.status === "running":
            // Signal executor to kill process
            this.executor.cancelJob(jobId)
            record.status = "cancelled"
            this.activeCount--
            this.processQueue()
            RETURN true

        IF record.status === "pending":
            this.queue.remove(jobId)
            record.status = "cancelled"
            RETURN true

        RETURN false

    FUNCTION getJobStatus(jobId: string) -> JobStatus | null:
        record = this.jobs.get(jobId)
        RETURN record?.status ?? null

    FUNCTION getJobProgress(jobId: string) -> Progress | null:
        record = this.jobs.get(jobId)
        RETURN record?.progress ?? null
```

### 10.2 Job Serialization

```pseudocode
INTERFACE SerializedJob:
    version: string
    id: string
    operation: string
    command: string[]
    input: SerializedInput
    output: SerializedOutput
    options: Record<string, unknown>
    createdAt: string

FUNCTION serializeJob(job: FFmpegJob) -> SerializedJob:
    command = job.command ?? buildCommand(job)

    RETURN {
        version: "1.0",
        id: job.id,
        operation: job.operation,
        command: command.toArgs(),
        input: serializeInput(job.input),
        output: serializeOutput(job.output),
        options: job.options,
        createdAt: new Date().toISOString()
    }

FUNCTION deserializeJob(serialized: SerializedJob) -> FFmpegJob:
    IF serialized.version !== "1.0":
        throw new Error(`Unsupported job version: ${serialized.version}`)

    RETURN {
        id: serialized.id,
        operation: serialized.operation as OperationType,
        input: deserializeInput(serialized.input),
        output: deserializeOutput(serialized.output),
        options: serialized.options
    }

// Replay a serialized job
ASYNC FUNCTION client.replayJob(serialized: SerializedJob) -> Promise<JobResult>:
    job = deserializeJob(serialized)
    job.id = generateJobId()  // New ID for replay

    this.logger.info("Replaying job", {
        originalId: serialized.id,
        newId: job.id
    })

    RETURN await this.executeJob(job)
```

---

## 11. Progress Tracking

### 11.1 Progress Events

```pseudocode
INTERFACE Progress:
    time: number            // Current position in seconds
    frame?: number          // Current frame number
    fps?: number            // Processing speed
    bitrate?: number        // Current bitrate (kbps)
    speed?: number          // Processing speed (e.g., 2.5x)
    percent?: number        // Completion percentage (if duration known)

CLASS ProgressTracker:
    private totalDuration: number | null = null
    private listeners: Set<ProgressListener> = new Set()

    FUNCTION setTotalDuration(duration: number) -> void:
        this.totalDuration = duration

    FUNCTION parseAndEmit(stderr: string) -> void:
        lines = stderr.split("\n")

        FOR line IN lines:
            progress = this.parseLine(line)
            IF progress:
                IF this.totalDuration AND progress.time:
                    progress.percent = (progress.time / this.totalDuration) * 100

                this.emit(progress)

    PRIVATE FUNCTION parseLine(line: string) -> Progress | null:
        // Parse FFmpeg progress line
        // Format: frame=1234 fps=30.0 q=28.0 size=1234kB time=00:01:23.45 bitrate=1234.5kbits/s speed=2.5x

        IF NOT line.includes("time="):
            RETURN null

        progress: Partial<Progress> = {}

        // Time
        timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
        IF timeMatch:
            progress.time = parseInt(timeMatch[1]) * 3600 +
                           parseInt(timeMatch[2]) * 60 +
                           parseInt(timeMatch[3]) +
                           parseInt(timeMatch[4]) / 100

        // Frame
        frameMatch = line.match(/frame=\s*(\d+)/)
        IF frameMatch:
            progress.frame = parseInt(frameMatch[1])

        // FPS
        fpsMatch = line.match(/fps=\s*([\d.]+)/)
        IF fpsMatch:
            progress.fps = parseFloat(fpsMatch[1])

        // Bitrate
        bitrateMatch = line.match(/bitrate=\s*([\d.]+)kbits/)
        IF bitrateMatch:
            progress.bitrate = parseFloat(bitrateMatch[1])

        // Speed
        speedMatch = line.match(/speed=\s*([\d.]+)x/)
        IF speedMatch:
            progress.speed = parseFloat(speedMatch[1])

        RETURN progress as Progress

    FUNCTION onProgress(listener: ProgressListener) -> () => void:
        this.listeners.add(listener)
        RETURN () => this.listeners.delete(listener)

    PRIVATE FUNCTION emit(progress: Progress) -> void:
        FOR listener IN this.listeners:
            TRY:
                listener(progress)
            CATCH error:
                // Don't let listener errors break progress tracking
                console.error("Progress listener error:", error)
```

---

## 12. Testing Support

### 12.1 Mock Executor

```pseudocode
CLASS MockFFmpegExecutor IMPLEMENTS ProcessExecutor:
    capturedCommands: CapturedCommand[] = []
    mockResults: Map<string, ProcessResult> = new Map()
    defaultResult: ProcessResult

    FUNCTION constructor():
        this.defaultResult = {
            exitCode: 0,
            stdout: "",
            stderr: "frame=100 fps=30 time=00:00:10.00 speed=2x",
            duration: 1000,
            killed: false
        }

    FUNCTION setMockResult(pattern: string | RegExp, result: ProcessResult) -> void:
        this.mockResults.set(pattern.toString(), result)

    FUNCTION setFailure(pattern: string | RegExp, error: Error) -> void:
        this.mockResults.set(pattern.toString(), {
            exitCode: 1,
            stdout: "",
            stderr: error.message,
            duration: 100,
            killed: false
        })

    ASYNC FUNCTION execute(command: FFmpegCommand, options: ExecuteOptions) -> Promise<ProcessResult>:
        args = command.toArgs()
        commandStr = args.join(" ")

        this.capturedCommands.push({
            args,
            options,
            timestamp: Date.now()
        })

        // Check for matching mock result
        FOR [pattern, result] OF this.mockResults:
            IF commandStr.match(new RegExp(pattern)):
                // Simulate progress events
                IF options.onProgress:
                    await this.simulateProgress(options.onProgress)
                RETURN result

        // Return default success
        IF options.onProgress:
            await this.simulateProgress(options.onProgress)

        RETURN this.defaultResult

    PRIVATE ASYNC FUNCTION simulateProgress(callback: ProgressListener) -> void:
        FOR i IN [25, 50, 75, 100]:
            await sleep(10)
            callback({
                time: i / 10,
                percent: i,
                fps: 30,
                speed: 2.0
            })

    // Assertions
    FUNCTION assertCommandExecuted(pattern: string | RegExp) -> void:
        found = this.capturedCommands.some(cmd =>
            cmd.args.join(" ").match(new RegExp(pattern))
        )
        IF NOT found:
            throw new AssertionError(`No command matching ${pattern} was executed`)

    FUNCTION assertCommandContains(args: string[]) -> void:
        FOR expectedArg IN args:
            found = this.capturedCommands.some(cmd =>
                cmd.args.includes(expectedArg)
            )
            IF NOT found:
                throw new AssertionError(`No command contained argument: ${expectedArg}`)

    FUNCTION getCommandCount() -> number:
        RETURN this.capturedCommands.length

    FUNCTION reset() -> void:
        this.capturedCommands = []
        this.mockResults.clear()
```

### 12.2 Test Fixtures

```pseudocode
CONST TEST_FIXTURES = {
    probeResult: {
        format: {
            name: "mov,mp4,m4a,3gp,3g2,mj2",
            duration: "10.000000",
            size: "1234567",
            bit_rate: "987654"
        },
        streams: [
            {
                index: 0,
                codec_type: "video",
                codec_name: "h264",
                width: 1920,
                height: 1080,
                r_frame_rate: "30/1"
            },
            {
                index: 1,
                codec_type: "audio",
                codec_name: "aac",
                sample_rate: "48000",
                channels: 2
            }
        ]
    },

    progressOutput: `
frame=  100 fps=30.0 q=28.0 size=    1234kB time=00:00:03.33 bitrate=3033.0kbits/s speed=2.5x
frame=  200 fps=30.0 q=28.0 size=    2468kB time=00:00:06.67 bitrate=3033.0kbits/s speed=2.5x
frame=  300 fps=30.0 q=28.0 size=    3702kB time=00:00:10.00 bitrate=3033.0kbits/s speed=2.5x
`,

    errorOutput: {
        fileNotFound: "path/to/input.mp4: No such file or directory",
        invalidFormat: "Invalid data found when processing input",
        codecNotFound: "Unknown encoder 'libfake'"
    }
}

FUNCTION createTestInput(overrides?: Partial<InputSpec>) -> InputSpec:
    RETURN {
        type: "file",
        path: "/test/input.mp4",
        ...overrides
    }

FUNCTION createTestOutput(overrides?: Partial<OutputSpec>) -> OutputSpec:
    RETURN {
        type: "file",
        path: "/test/output.mp4",
        videoCodec: "libx264",
        audioCodec: "aac",
        ...overrides
    }
```

---

## 13. Filter Graph Builder

### 13.1 Filter Graph Implementation

```pseudocode
CLASS FilterGraph:
    private filters: FilterNode[] = []
    private connections: FilterConnection[] = []

    FUNCTION addFilter(name: string, params?: Record<string, unknown>) -> FilterGraph:
        filter: FilterNode = {
            id: generateFilterId(),
            name,
            params: params ?? {}
        }
        this.filters.push(filter)
        RETURN this

    FUNCTION chain(...filterNames: string[]) -> FilterGraph:
        FOR name IN filterNames:
            this.addFilter(name)
        RETURN this

    FUNCTION scale(width: number, height: number) -> FilterGraph:
        RETURN this.addFilter("scale", { w: width, h: height })

    FUNCTION crop(width: number, height: number, x?: number, y?: number) -> FilterGraph:
        RETURN this.addFilter("crop", { w: width, h: height, x: x ?? 0, y: y ?? 0 })

    FUNCTION fps(rate: number) -> FilterGraph:
        RETURN this.addFilter("fps", { fps: rate })

    FUNCTION loudnorm(params: LoudnormParams) -> FilterGraph:
        RETURN this.addFilter("loudnorm", params)

    FUNCTION overlay(x: number, y: number) -> FilterGraph:
        RETURN this.addFilter("overlay", { x, y })

    FUNCTION raw(filterString: string) -> FilterGraph:
        this.filters.push({
            id: "raw",
            name: "raw",
            raw: filterString
        })
        RETURN this

    FUNCTION toString() -> string:
        IF this.filters.length === 0:
            RETURN ""

        // Check for raw filter
        rawFilter = this.filters.find(f => f.raw)
        IF rawFilter:
            RETURN rawFilter.raw

        // Build filter chain
        parts = this.filters.map(f => this.formatFilter(f))
        RETURN parts.join(",")

    PRIVATE FUNCTION formatFilter(filter: FilterNode) -> string:
        IF Object.keys(filter.params).length === 0:
            RETURN filter.name

        paramStr = Object.entries(filter.params)
            .map(([k, v]) => `${k}=${v}`)
            .join(":")

        RETURN `${filter.name}=${paramStr}`
```

# FFmpeg Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/ffmpeg`

---

## 1. Architecture Overview

### 1.1 Design Philosophy

The FFmpeg Integration Module follows a **layered adapter architecture** that separates concerns between job orchestration, command building, and process execution:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Transcode   │  │ Extract     │  │ Thumbnail   │  │ Normalize   │ │
│  │ Request     │  │ Audio       │  │ Generate    │  │ Audio       │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
┌─────────▼────────────────▼────────────────▼────────────────▼────────┐
│                        Client Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      FFmpegClient                                ││
│  │         (Job validation, routing, observability)                ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                     Orchestration Layer                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │   JobManager    │  │  CommandBuilder │  │  PresetLibrary  │      │
│  │                 │  │                 │  │                 │      │
│  │ - Queue jobs    │  │ - Build args    │  │ - web-hd        │      │
│  │ - Concurrency   │  │ - Validate      │  │ - podcast       │      │
│  │ - Track status  │  │ - Serialize     │  │ - archive       │      │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘      │
└───────────┼────────────────────┼────────────────────────────────────┘
            │                    │
┌───────────▼────────────────────▼────────────────────────────────────┐
│                      Execution Layer                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    ProcessExecutor                               ││
│  │    (Spawn, stream I/O, timeout, signals, progress parsing)      ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                       System Layer                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │  FFmpeg Binary  │  │  FFprobe Binary │  │   File System   │      │
│  │                 │  │                 │  │                 │      │
│  │  - Transcode    │  │  - Probe        │  │  - Input files  │      │
│  │  - Filter       │  │  - Metadata     │  │  - Output files │      │
│  │  - Mux/Demux    │  │                 │  │  - Temp files   │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Binary invocation | Avoids native binding complexity, uses stable CLI |
| Process-per-job | Isolation, resource limits, easy cancellation |
| Stream-first I/O | Memory efficiency for large files |
| Job queue | Controlled concurrency, resource management |
| Command serialization | Reproducibility, audit, replay capability |
| Preset library | Consistent outputs, best practices encoded |

---

## 2. Component Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FFmpegClient                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - config: FFmpegConfig                                          ││
│  │ - executor: ProcessExecutor                                     ││
│  │ - jobManager: JobManager                                        ││
│  │ - presets: PresetLibrary                                        ││
│  │ - logger: Logger                                                ││
│  │ - metrics: MetricsClient                                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Methods:                                                            │
│  ├── probe(input) -> MediaInfo                                      │
│  ├── transcode(job) -> JobResult                                    │
│  ├── extractAudio(job) -> JobResult                                 │
│  ├── normalizeAudio(job) -> JobResult                               │
│  ├── generateThumbnail(job) -> JobResult                            │
│  ├── resize(job) -> JobResult                                       │
│  ├── concatenate(job) -> JobResult                                  │
│  ├── executeCommand(command) -> JobResult                           │
│  ├── cancelJob(jobId) -> void                                       │
│  └── shutdown() -> void                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      FFmpegCommandBuilder                            │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - inputs: InputSpec[]                                           ││
│  │ - outputs: OutputSpec[]                                         ││
│  │ - globalOptions: string[]                                       ││
│  │ - filterGraph: FilterGraph                                      ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Builder Pattern:                                                    │
│  builder.addInput(input)                                            │
│         .addOutput(output)                                          │
│         .setFilter(filterGraph)                                     │
│         .overwrite()                                                │
│         .build() -> FFmpegCommand                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        ProcessExecutor                               │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - activeProcesses: Map<pid, ChildProcess>                       ││
│  │ - config: ExecutorConfig                                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Process Lifecycle:                                                  │
│  spawn() -> monitor() -> [progress events] -> exit/kill            │
│                                                                      │
│  Features:                                                           │
│  ├── Timeout enforcement                                            │
│  ├── Signal handling (SIGTERM, SIGKILL)                             │
│  ├── Stream piping (stdin, stdout, stderr)                          │
│  ├── Progress parsing from stderr                                   │
│  └── Resource limit enforcement                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Job Management Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         JobManager                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ - jobs: Map<jobId, JobRecord>                                   ││
│  │ - queue: JobQueue                                               ││
│  │ - activeCount: number                                           ││
│  │ - maxConcurrent: number                                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Job States:                                                         │
│  pending -> running -> completed | failed | cancelled | timeout     │
│                                                                      │
│  Queue Management:                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  [Job5] [Job4] [Job3]  ->  [Running: Job1, Job2]  ->  [Done]   ││
│  │       Queue                    Active Slots           Results   ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         JobRecord                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ id: string                                                      ││
│  │ job: FFmpegJob                                                  ││
│  │ status: JobStatus                                               ││
│  │ progress: Progress | null                                       ││
│  │ pid: number | null                                              ││
│  │ createdAt: Date                                                 ││
│  │ startedAt: Date | null                                          ││
│  │ completedAt: Date | null                                        ││
│  │ error: Error | null                                             ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow Architecture

### 3.1 Transcode Job Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Transcode Job Flow                              │
└─────────────────────────────────────────────────────────────────────┘

  1. Job Submit              2. Validation            3. Queue/Start
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ transcode()   │──────▶│ Validate job  │──────▶│ JobManager    │
│               │       │               │       │               │
│ - input spec  │       │ - Input exists│       │ - Check slots │
│ - output spec │       │ - Output path │       │ - Queue or    │
│ - preset      │       │ - Codec valid │       │   start       │
└───────────────┘       └───────────────┘       └───────┬───────┘
                                                        │
  4. Build Command           5. Execute                 │
┌───────────────┐       ┌───────────────┐              │
│ CommandBuilder│◀──────│ Apply preset  │◀─────────────┘
│               │       │               │
│ - Add input   │       │ - Merge opts  │
│ - Add output  │       │ - Set codec   │
│ - Set filters │       │ - Set quality │
└───────┬───────┘       └───────────────┘
        │
  6. Spawn Process           7. Monitor
┌───────▼───────┐       ┌───────────────┐
│ ProcessExec   │──────▶│ Progress      │
│               │       │ Tracker       │
│ - fork()      │       │               │
│ - pipe I/O    │       │ - Parse stderr│
│ - Set limits  │       │ - Emit events │
└───────┬───────┘       └───────┬───────┘
        │                       │
  8. Completion              9. Cleanup
┌───────▼───────┐       ┌───────────────┐
│ Wait for exit │──────▶│ Finalize      │
│               │       │               │
│ - Exit code   │       │ - Verify out  │
│ - Duration    │       │ - Clean temp  │
│ - Stats       │       │ - Emit metric │
└───────────────┘       └───────────────┘
```

### 3.2 Stream Processing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Stream Processing Modes                           │
└─────────────────────────────────────────────────────────────────────┘

Mode 1: File-to-File (Standard)
┌─────────────┐                              ┌─────────────┐
│ Input File  │ ──── FFmpeg Process ──────▶ │ Output File │
│ /path/in.mp4│                              │ /path/out.mp4│
└─────────────┘                              └─────────────┘

Mode 2: Stream-to-File (Upload Processing)
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ Readable    │──────▶│   FFmpeg    │──────▶│ Output File │
│ Stream      │ stdin │   Process   │       │             │
│ (upload)    │       │             │       │             │
└─────────────┘       └─────────────┘       └─────────────┘

Mode 3: File-to-Stream (Download/Serve)
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ Input File  │──────▶│   FFmpeg    │──────▶│ Writable    │
│             │       │   Process   │ stdout│ Stream      │
│             │       │             │       │ (response)  │
└─────────────┘       └─────────────┘       └─────────────┘

Mode 4: Stream-to-Stream (Pipeline)
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ Readable    │──────▶│   FFmpeg    │──────▶│ Writable    │
│ Stream      │ stdin │   Process   │ stdout│ Stream      │
│             │       │             │       │             │
└─────────────┘       └─────────────┘       └─────────────┘
```

### 3.3 Progress Event Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Progress Event Flow                              │
└─────────────────────────────────────────────────────────────────────┘

FFmpeg Process                Progress Tracker              Application
┌─────────────┐              ┌─────────────┐              ┌─────────────┐
│   stderr    │─────────────▶│   Parse     │─────────────▶│  Callback   │
│             │              │   Output    │              │             │
│ frame=100   │              │             │              │ onProgress( │
│ fps=30.0    │              │ Extract:    │              │   time: 10, │
│ time=00:10  │              │ - time      │              │   pct: 50%, │
│ speed=2x    │              │ - frame     │              │   fps: 30   │
│             │              │ - fps       │              │ )           │
│             │              │ - speed     │              │             │
└─────────────┘              └─────────────┘              └─────────────┘

Progress Line Format:
┌─────────────────────────────────────────────────────────────────────┐
│ frame=  300 fps=30.0 q=28.0 size=3702kB time=00:00:10.00           │
│ bitrate=3033.0kbits/s speed=2.50x                                   │
└─────────────────────────────────────────────────────────────────────┘
         │       │              │                    │
         ▼       ▼              ▼                    ▼
      frame    fps           time               speed
```

---

## 4. Integration Architecture

### 4.1 Platform Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                  LLM Dev Ops Platform Integration                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     LLM Dev Ops Platform                             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Audio        │  │ Video        │  │ Content      │               │
│  │ Transcription│  │ Analysis     │  │ Processing   │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│         └────────────┬────┴────────────────┘                        │
│                      ▼                                               │
│         ┌────────────────────────┐                                  │
│         │    FFmpeg Module       │                                  │
│         │                        │                                  │
│         │  - Extract audio       │                                  │
│         │  - Generate thumbnails │                                  │
│         │  - Transcode formats   │                                  │
│         │  - Normalize audio     │                                  │
│         └───────────┬────────────┘                                  │
│                     │                                                │
│  ┌──────────────────┼──────────────────┐                            │
│  │                  │                  │                            │
│  ▼                  ▼                  ▼                            │
│ ┌────────┐    ┌──────────┐    ┌────────────┐                        │
│ │shared/ │    │ shared/  │    │  shared/   │                        │
│ │logging │    │ metrics  │    │ tracing    │                        │
│ └────────┘    └──────────┘    └────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Shared Module Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Dependency Architecture                             │
└─────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────────┐
                    │       ffmpeg/          │
                    │                        │
                    │  - FFmpegClient        │
                    │  - CommandBuilder      │
                    │  - ProcessExecutor     │
                    │  - JobManager          │
                    │  - PresetLibrary       │
                    └───────────┬────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │   shared/     │   │   shared/     │   │   shared/     │
   │ observability │   │   tracing     │   │  credentials  │
   │               │   │               │   │               │
   │ - Logger      │   │ - Span        │   │ - Storage     │
   │ - Metrics     │   │ - Context     │   │   access      │
   └───────────────┘   └───────────────┘   └───────────────┘

External:
┌───────────────┐   ┌───────────────┐
│     execa     │   │ child_process │
│               │   │   (Node.js)   │
│ Process exec  │   │               │
└───────────────┘   └───────────────┘
```

### 4.3 Media Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│              Example: Audio Transcription Pipeline                   │
└─────────────────────────────────────────────────────────────────────┘

  Upload                FFmpeg                  Whisper              Result
┌─────────┐          ┌─────────┐            ┌─────────┐          ┌─────────┐
│ Video   │─────────▶│ Extract │───────────▶│ Transcribe│────────▶│ Text +  │
│ File    │          │ Audio   │            │ Audio    │          │ Timestamps│
│         │          │         │            │          │          │         │
│ .mp4    │          │ .wav    │            │ STT API  │          │ .json   │
└─────────┘          └─────────┘            └─────────┘          └─────────┘

Pipeline Code:
┌─────────────────────────────────────────────────────────────────────┐
│ // Extract audio for transcription                                  │
│ const audioPath = await ffmpeg.extractAudio({                       │
│   input: { type: "file", path: videoPath },                        │
│   output: { type: "file", path: tempAudio, format: "wav" },        │
│   normalize: true  // EBU R128 normalization                        │
│ });                                                                  │
│                                                                      │
│ // Send to transcription service                                    │
│ const transcript = await whisper.transcribe(audioPath);            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Resource Management

### 5.1 Concurrency Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Concurrency Model                                │
└─────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────┐
                    │      Job Queue          │
                    │  ┌───┬───┬───┬───┬───┐  │
                    │  │ 8 │ 7 │ 6 │ 5 │...│  │
                    │  └───┴───┴───┴───┴───┘  │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
      │   Slot 1      │ │   Slot 2      │ │   Slot N      │
      │ ┌───────────┐ │ │ ┌───────────┐ │ │ ┌───────────┐ │
      │ │  Job 1    │ │ │ │  Job 2    │ │ │ │  Job 4    │ │
      │ │ Running   │ │ │ │ Running   │ │ │ │ Running   │ │
      │ └───────────┘ │ │ └───────────┘ │ │ └───────────┘ │
      │   PID: 1234   │ │   PID: 1235   │ │   PID: 1237   │
      │   CPU: 200%   │ │   CPU: 150%   │ │   CPU: 100%   │
      │   MEM: 1.5GB  │ │   MEM: 800MB  │ │   MEM: 500MB  │
      └───────────────┘ └───────────────┘ └───────────────┘

Config: maxConcurrent = N (default: 4)
```

### 5.2 Resource Limits

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Resource Limits                                 │
└─────────────────────────────────────────────────────────────────────┘

Per-Process Limits:
┌─────────────────────────────────────────────────────────────────────┐
│ Resource        │ Limit        │ Enforcement                        │
├─────────────────┼──────────────┼────────────────────────────────────┤
│ Memory          │ 2 GB         │ Monitor RSS, kill if exceeded      │
│ CPU Threads     │ Configurable │ FFmpeg -threads flag               │
│ Execution Time  │ 1 hour       │ Timeout, SIGTERM then SIGKILL      │
│ Temp Disk       │ 2x input     │ Check before start                 │
└─────────────────────────────────────────────────────────────────────┘

System-Wide Limits:
┌─────────────────────────────────────────────────────────────────────┐
│ Resource              │ Limit        │ Enforcement                  │
├───────────────────────┼──────────────┼──────────────────────────────┤
│ Concurrent Jobs       │ 4            │ Queue excess jobs            │
│ Queue Size            │ 100          │ Reject if full               │
│ Total Memory          │ 8 GB         │ Pause queue if exceeded      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Temp File Management

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Temp File Lifecycle                               │
└─────────────────────────────────────────────────────────────────────┘

  Job Start              Processing              Cleanup
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Create temp   │───▶│ FFmpeg writes │───▶│ Delete temp   │
│ directory     │    │ to temp files │    │ on completion │
│               │    │               │    │               │
│ /tmp/ffmpeg/  │    │ - pass logs   │    │ Also on:      │
│ job-{id}/     │    │ - segments    │    │ - Failure     │
│               │    │ - concat list │    │ - Timeout     │
└───────────────┘    └───────────────┘    │ - Cancel      │
                                          │ - Shutdown    │
                                          └───────────────┘

Cleanup Guarantee:
┌─────────────────────────────────────────────────────────────────────┐
│ try {                                                               │
│   await executeJob(job);                                            │
│ } finally {                                                         │
│   await cleanupTempFiles(job.id);  // Always runs                  │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Command Architecture

### 6.1 Command Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FFmpeg Command Structure                          │
└─────────────────────────────────────────────────────────────────────┘

ffmpeg [global_options] [input_options] -i input [output_options] output

Example:
┌─────────────────────────────────────────────────────────────────────┐
│ ffmpeg                                                              │
│   -y                           # Global: overwrite                  │
│   -threads 4                   # Global: thread count               │
│   -ss 00:00:10                 # Input: seek to 10s                 │
│   -i /path/input.mp4           # Input: file path                   │
│   -t 60                        # Input: duration 60s                │
│   -c:v libx264                 # Output: video codec                │
│   -c:a aac                     # Output: audio codec                │
│   -b:v 5M                      # Output: video bitrate              │
│   -filter:v "scale=1920:1080"  # Output: video filter               │
│   /path/output.mp4             # Output: file path                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Filter Graph Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Filter Graph Structure                            │
└─────────────────────────────────────────────────────────────────────┘

Simple Chain:
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Input  │───▶│  scale  │───▶│  crop   │───▶│ Output  │
│  [0:v]  │    │1920:1080│    │ 16:9    │    │  [out]  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘

Filter String: "scale=1920:1080,crop=1920:1080:0:0"

Complex Graph (Multiple Inputs):
┌─────────┐
│ Input 0 │───┐
│  [0:v]  │   │    ┌─────────┐    ┌─────────┐
└─────────┘   ├───▶│ overlay │───▶│ Output  │
┌─────────┐   │    │  x:y    │    │  [out]  │
│ Input 1 │───┘    └─────────┘    └─────────┘
│  [1:v]  │
└─────────┘

Filter String: "[0:v][1:v]overlay=10:10[out]"
```

---

## 7. Error Handling Architecture

### 7.1 Error Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Error Handling Flow                               │
└─────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  FFmpeg Process │
                         │    stderr       │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │ Exit 0    │ │ Exit != 0 │ │ Signal    │
            │ Success   │ │ Error     │ │ Killed    │
            └───────────┘ └─────┬─────┘ └─────┬─────┘
                                │             │
                    ┌───────────┴─────────────┴───────────┐
                    │          Parse stderr               │
                    └───────────────────┬─────────────────┘
                                        │
              ┌─────────────┬───────────┼───────────┬─────────────┐
              │             │           │           │             │
              ▼             ▼           ▼           ▼             ▼
      ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
      │ FileNot   │ │ Invalid   │ │ Codec     │ │ Timeout   │ │ Unknown   │
      │ Found     │ │ Format    │ │ NotFound  │ │           │ │           │
      └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘
```

### 7.2 Error Recovery

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Error Recovery Strategies                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Error Type          │ Recovery Strategy                             │
├─────────────────────┼───────────────────────────────────────────────┤
│ Timeout             │ Kill process, cleanup temp files, report      │
│ Memory Exceeded     │ Kill process, reduce quality/resolution, retry│
│ Disk Full           │ Cleanup temp, fail with clear message         │
│ Codec Not Found     │ Fail fast, suggest codec installation         │
│ Corrupt Input       │ Skip corrupt portions or fail                 │
│ Process Crash       │ Cleanup, retry once if transient              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Metrics Collection

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Metrics Architecture                              │
└─────────────────────────────────────────────────────────────────────┘

FFmpegClient                    Metrics Collector
┌─────────────┐                ┌─────────────────┐
│ Job Start   │───────────────▶│ ffmpeg.jobs.    │
│             │                │ total++         │
│             │                │ active++        │
└─────────────┘                └─────────────────┘

┌─────────────┐                ┌─────────────────┐
│ Progress    │───────────────▶│ ffmpeg.progress │
│ Event       │                │ (gauge)         │
└─────────────┘                └─────────────────┘

┌─────────────┐                ┌─────────────────┐
│ Job End     │───────────────▶│ ffmpeg.jobs.    │
│             │                │ duration (hist) │
│             │                │ active--        │
└─────────────┘                └─────────────────┘

Metric Names:
┌─────────────────────────────────────────────────────────────────────┐
│ ffmpeg.jobs.total        │ Counter   │ Total jobs by operation     │
│ ffmpeg.jobs.active       │ Gauge     │ Currently running jobs      │
│ ffmpeg.jobs.duration     │ Histogram │ Job duration in ms          │
│ ffmpeg.jobs.queue_wait   │ Histogram │ Time waiting in queue       │
│ ffmpeg.input.bytes       │ Counter   │ Input bytes processed       │
│ ffmpeg.output.bytes      │ Counter   │ Output bytes produced       │
│ ffmpeg.errors            │ Counter   │ Errors by type              │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Tracing Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Trace Structure                                   │
└─────────────────────────────────────────────────────────────────────┘

Trace: transcode-job-123
│
├── Span: ffmpeg.transcode
│   ├── job_id: "job-123"
│   ├── input_format: "mp4"
│   ├── output_format: "webm"
│   ├── preset: "web-hd"
│   │
│   ├── Span: ffmpeg.probe
│   │   ├── duration: 120.5
│   │   ├── video_codec: "h264"
│   │   └── audio_codec: "aac"
│   │
│   └── Span: ffmpeg.process
│       ├── pid: 12345
│       ├── exit_code: 0
│       ├── cpu_time: 45000
│       └── memory_peak: 1500000000
```

---

## 9. Testing Architecture

### 9.1 Mock Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Test Architecture                                 │
└─────────────────────────────────────────────────────────────────────┘

Production:                          Testing:
┌─────────────────┐                 ┌─────────────────┐
│  FFmpegClient   │                 │  FFmpegClient   │
│                 │                 │                 │
│  ProcessExecutor│                 │  MockExecutor   │
│  (real ffmpeg)  │                 │  (simulated)    │
└─────────────────┘                 └─────────────────┘

MockFFmpegExecutor:
┌─────────────────────────────────────────────────────────────────────┐
│ - capturedCommands: []     // Records all commands                  │
│ - mockResults: Map         // Configurable responses                │
│ - simulateProgress: bool   // Emit fake progress events             │
│                                                                      │
│ Methods:                                                             │
│ - setMockResult(pattern, result)                                    │
│ - setFailure(pattern, error)                                        │
│ - assertCommandExecuted(pattern)                                    │
│ - assertCommandContains(args)                                       │
│ - reset()                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Test Isolation

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Test Isolation Strategy                           │
└─────────────────────────────────────────────────────────────────────┘

Unit Tests:                    Integration Tests:
┌─────────────────┐           ┌─────────────────┐
│ Mock Executor   │           │ Real FFmpeg     │
│ No file I/O     │           │ Real files      │
│ Fast (<10ms)    │           │ Slow (~seconds) │
│                 │           │                 │
│ Test:           │           │ Test:           │
│ - Command build │           │ - End-to-end    │
│ - Job manager   │           │ - File output   │
│ - Validation    │           │ - Quality check │
└─────────────────┘           └─────────────────┘
```

---

## 10. Deployment Architecture

### 10.1 Container Deployment

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Container Architecture                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Application Container                           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Node.js Application                           ││
│  │  ┌───────────────────────────────────────────────────────────┐  ││
│  │  │                   FFmpeg Module                            │  ││
│  │  └───────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              FFmpeg + FFprobe Binaries                           ││
│  │              /usr/bin/ffmpeg                                     ││
│  │              /usr/bin/ffprobe                                    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              Temp Volume: /tmp/ffmpeg                            ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘

Dockerfile snippet:
┌─────────────────────────────────────────────────────────────────────┐
│ FROM node:20-slim                                                   │
│ RUN apt-get update && apt-get install -y ffmpeg                    │
│ # Verify installation                                               │
│ RUN ffmpeg -version && ffprobe -version                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Kubernetes Deployment

```yaml
# Resource requests/limits for FFmpeg workloads
┌─────────────────────────────────────────────────────────────────────┐
│ resources:                                                          │
│   requests:                                                         │
│     memory: "2Gi"                                                   │
│     cpu: "2"                                                        │
│   limits:                                                           │
│     memory: "4Gi"                                                   │
│     cpu: "4"                                                        │
│                                                                      │
│ volumeMounts:                                                       │
│   - name: temp-storage                                              │
│     mountPath: /tmp/ffmpeg                                          │
│                                                                      │
│ volumes:                                                            │
│   - name: temp-storage                                              │
│     emptyDir:                                                       │
│       sizeLimit: 10Gi                                               │
└─────────────────────────────────────────────────────────────────────┘
```

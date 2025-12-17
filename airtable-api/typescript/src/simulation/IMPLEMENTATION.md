# Airtable API Simulation Layer - Implementation Summary

## Overview

This document summarizes the implementation of the simulation layer for record/replay testing in the Airtable API integration.

## Files Created

1. **`/workspaces/integrations/airtable-api/typescript/src/simulation/index.ts`** (818 lines)
   - Main implementation file
   - All core classes, interfaces, and functions

2. **`/workspaces/integrations/airtable-api/typescript/src/simulation/example.ts`** (330 lines)
   - Comprehensive usage examples
   - Demonstrates all features

3. **`/workspaces/integrations/airtable-api/typescript/src/simulation/README.md`** (344 lines)
   - Complete documentation
   - Best practices and workflows

## Implementation Details

### Types (6 interfaces)

1. **RecordedRequest**
   - `method: string` - HTTP method
   - `path: string` - Request path
   - `query?: Record<string, string>` - Query parameters
   - `body?: unknown` - Request body
   - `headers?: Record<string, string>` - Request headers

2. **RecordedResponse**
   - `status: number` - HTTP status code
   - `body?: unknown` - Response body
   - `headers?: Record<string, string>` - Response headers

3. **RecordedInteraction**
   - `request: RecordedRequest` - The recorded request
   - `response: RecordedResponse` - The recorded response
   - `timestamp: string` - ISO 8601 timestamp

4. **SimulationSession**
   - `id: string` - Unique session identifier
   - `interactions: RecordedInteraction[]` - Recorded interactions
   - `metadata?: Record<string, unknown>` - Optional metadata

5. **RequestOptions**
   - Same as RecordedRequest
   - Used for client requests

6. **Response**
   - Same as RecordedResponse
   - Used for client responses

### Classes (4 classes)

#### 1. InteractionRecorder

**Purpose**: Records HTTP request/response pairs for later replay

**Constructor**:
- `constructor(sessionId?: string)` - Creates recorder with optional session ID

**Public Methods**:
- `record(request: RecordedRequest, response: RecordedResponse): void` - Records an interaction
- `getSession(): SimulationSession` - Gets current session
- `save(filePath: string): Promise<void>` - Saves session to JSON file
- `clear(): void` - Clears all recorded interactions
- `setMetadata(key: string, value: unknown): void` - Sets session metadata

**Private Methods**:
- `deepCopy<T>(obj: T): T` - Deep copies objects to avoid reference issues

#### 2. InteractionReplayer

**Purpose**: Replays recorded interactions for testing

**Constructor**:
- `constructor(session: SimulationSession)` - Creates replayer from session

**Static Methods**:
- `static load(filePath: string): Promise<InteractionReplayer>` - Loads session from file

**Public Methods**:
- `match(request: RecordedRequest): RecordedResponse | null` - Matches request and returns response
- `hasMoreInteractions(): boolean` - Checks if more interactions available
- `getMatchedCount(): number` - Gets count of matched interactions
- `getRemainingCount(): number` - Gets count of remaining interactions
- `getMetadata(): Record<string, unknown> | undefined` - Gets session metadata

**Private Methods**:
- `matchesRequest(recorded: RecordedRequest, incoming: RecordedRequest): boolean` - Checks if requests match
- `pathsMatch(recorded: string, incoming: string): boolean` - Matches paths with fuzzy ID support
- `isAirtableId(str: string): boolean` - Checks if string is an Airtable ID
- `queryParamsMatch(recorded: Record<string, string>, incoming?: Record<string, string>): boolean` - Matches query parameters

**Fuzzy Matching Logic**:
- Exact match on HTTP method
- Path matching with fuzzy ID support for dynamic IDs
- Supports prefixes: `app`, `tbl`, `rec`, `fld`, `viw`
- Sequential matching (first match is removed from queue)
- Optional query parameter matching

#### 3. SimulationClient

**Purpose**: HTTP client wrapper supporting record/replay modes

**Constructor**:
- `constructor(mode: SimulationMode, recorder?: InteractionRecorder, replayer?: InteractionReplayer)`

**Public Methods**:
- `setRealClientExecutor(executor: (options: RequestOptions) => Promise<Response>): void` - Sets real HTTP client
- `executeRequest(options: RequestOptions): Promise<Response>` - Executes request based on mode
- `getRecorder(): InteractionRecorder | undefined` - Gets recorder instance
- `getReplayer(): InteractionReplayer | undefined` - Gets replayer instance

**Private Methods**:
- `executeRealRequest(options: RequestOptions): Promise<Response>` - Executes real HTTP request
- `executeAndRecord(options: RequestOptions): Promise<Response>` - Executes and records
- `executeFromReplay(options: RequestOptions): Promise<Response>` - Replays from recording

**Behavior by Mode**:
- **Disabled**: Pass through to real client
- **Record**: Pass through to real client + record interaction
- **Replay**: Match request and return recorded response

#### 4. WebhookSimulator

**Purpose**: Simulates Airtable webhook payloads with HMAC signatures

**Constructor**:
- `constructor()` - Creates new simulator

**Public Methods**:
- `registerSecret(webhookId: string, secret: string): void` - Registers webhook secret
- `simulatePayload(webhookId: string, payload: WebhookPayload): { headers: Record<string, string>, body: string }` - Generates webhook with signature
- `validateSignature(webhookId: string, body: string, signature: string): boolean` - Validates webhook signature

**Signature Generation**:
- Uses HMAC-SHA256
- Generates `x-airtable-content-mac` header
- Includes webhook metadata headers
- Provides test-friendly defaults

### Factory Functions (4 functions)

1. **createRecorder(sessionId?: string): InteractionRecorder**
   - Creates new recorder instance

2. **createReplayer(session: SimulationSession): InteractionReplayer**
   - Creates new replayer from session

3. **loadReplayer(filePath: string): Promise<InteractionReplayer>**
   - Loads replayer from JSON file

4. **createSimulationClient(mode: SimulationMode, recorder?: InteractionRecorder, replayer?: InteractionReplayer): SimulationClient**
   - Creates simulation client

## Integration Points

### With Config Module
- Imports `SimulationMode` enum from `../config/index.js`
- Supports three modes: Disabled, Record, Replay

### With Errors Module
- Imports simulation-specific errors from `../errors/index.js`:
  - `SimulationNotInReplayError` - Not in replay mode
  - `SimulationExhaustedError` - No matching interaction found
  - `SimulationMismatchError` - Request doesn't match expected pattern

### With Types Module
- Imports `WebhookPayload` type from `../types/index.js`
- Uses for webhook simulation

## Key Features

### 1. Sequential Matching
- Interactions are matched in order
- First matching interaction is removed from queue
- Prevents interaction reuse

### 2. Fuzzy ID Matching
- Automatically matches Airtable IDs with same prefix
- Example: `appAAAAAAAAAAAAAA` matches `appBBBBBBBBBBBBBB`
- Supported prefixes: `app`, `tbl`, `rec`, `fld`, `viw`
- IDs must be 17 characters with valid prefix

### 3. File Persistence
- Sessions saved as JSON
- Uses `fs/promises` for async I/O
- Pretty-printed JSON (2-space indent)
- Includes metadata support

### 4. Webhook Simulation
- HMAC-SHA256 signature generation
- Simulates Airtable webhook headers
- Validation support for testing
- Secret management per webhook

## Testing Approach

### Record Phase
```typescript
const recorder = createRecorder('test-name');
// Execute real API calls
recorder.record(request, response);
await recorder.save('./fixtures/test-name.json');
```

### Replay Phase
```typescript
const replayer = await loadReplayer('./fixtures/test-name.json');
const client = createSimulationClient(SimulationMode.Replay, undefined, replayer);
// Execute tests - responses come from recordings
```

## Error Handling

All simulation errors extend `AirtableError`:
- Non-retryable errors
- Include error codes
- Provide detailed messages
- Support error chaining

## Dependencies

- `fs/promises` - File I/O operations
- `crypto` - HMAC signature generation
- `../config/index.js` - SimulationMode enum
- `../errors/index.js` - Error classes
- `../types/index.js` - WebhookPayload type

## Statistics

- **Total Lines**: 1,492 (code + docs + examples)
- **Main Implementation**: 818 lines
- **Examples**: 330 lines
- **Documentation**: 344 lines
- **Exported Items**: 13
  - 6 interfaces
  - 4 classes
  - 3 functions (4 including async)

## Compliance

All requirements from the specification have been implemented:

✅ RecordedInteraction, RecordedRequest, RecordedResponse types
✅ SimulationSession type with id, interactions, metadata
✅ InteractionRecorder class with all required methods
✅ InteractionReplayer class with all required methods
✅ Sequential matching with removal
✅ Fuzzy matching for dynamic IDs
✅ SimulationClient class wrapping execution
✅ Record/Replay mode support
✅ WebhookSimulator class with MAC signature generation
✅ Factory functions (createRecorder, createReplayer, loadReplayer)
✅ Import SimulationMode from config
✅ Import errors from errors module
✅ Use fs/promises for file operations
✅ Use JSON for serialization
✅ Proper JSDoc comments throughout
✅ Export all types, classes, and functions

## Next Steps

The simulation layer is complete and ready for:
1. Integration with AirtableClient
2. Unit test creation
3. Integration test creation
4. Documentation updates in main README

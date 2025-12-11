# Gemini TypeScript SDK Examples

This directory contains comprehensive examples demonstrating how to use the Gemini TypeScript SDK.

## Prerequisites

Before running any example, make sure you have:

1. Set your Gemini API key as an environment variable:
   ```bash
   export GEMINI_API_KEY="your-api-key-here"
   ```

2. Built the project:
   ```bash
   npm run build
   ```

## Examples Overview

### 1. Basic Content Generation (`basic.ts`)

Demonstrates the fundamentals of using the Gemini API:
- Creating a client from environment variables
- Simple text generation
- Handling responses and metadata
- Printing usage statistics

**Run:**
```bash
node dist/examples/basic.js
```

**Key Concepts:**
- Client initialization with `createClientFromEnv()`
- Using `client.content.generate()`
- Accessing response candidates and usage metadata

---

### 2. Streaming Content (`streaming.ts`)

Shows how to use streaming for real-time content generation:
- Creating streaming requests
- Processing chunks with `async for...of`
- Accumulating responses in real-time
- Tracking chunk counts and tokens

**Run:**
```bash
node dist/examples/streaming.js
```

**Key Concepts:**
- Using `client.content.generateStream()`
- Async iteration over response chunks
- Real-time output with `process.stdout.write()`

---

### 3. Multimodal Content (`multimodal.ts`)

Demonstrates working with text and images:
- Base64-encoded inline images
- File URIs from uploaded files
- Multiple images in a single request
- Combining text and visual content

**Run:**
```bash
node dist/examples/multimodal.js
```

**Key Concepts:**
- Using `inlineData` with base64-encoded images
- Using `fileData` with uploaded file URIs
- Mixing text and image parts
- File upload and waiting for processing

---

### 4. Safety Settings (`safety-settings.ts`)

Shows how to configure content safety filters:
- Setting harm categories and thresholds
- Handling `SafetyBlockedError` exceptions
- Understanding safety ratings
- Different safety threshold levels
- Analyzing prompt feedback

**Run:**
```bash
node dist/examples/safety-settings.js
```

**Key Concepts:**
- Configuring `safetySettings` array
- Harm categories: harassment, hate speech, explicit content, dangerous content
- Block thresholds: BLOCK_NONE, BLOCK_LOW_AND_ABOVE, BLOCK_MEDIUM_AND_ABOVE, BLOCK_ONLY_HIGH
- Handling safety blocks gracefully

---

### 5. File Operations (`files.ts`)

Complete guide to file management:
- Uploading files (text, images, etc.)
- Listing uploaded files with pagination
- Getting file metadata
- Waiting for files to become ACTIVE
- Deleting files
- File state transitions

**Run:**
```bash
node dist/examples/files.js
```

**Key Concepts:**
- Using `client.files.upload()`
- File states: PROCESSING, ACTIVE, FAILED
- Using `client.files.waitForActive()`
- Pagination with `pageToken`

---

### 6. Cached Content (`cached-content.ts`)

Learn about content caching to reduce costs:
- Creating cached content with TTL
- Using cached content in generation requests
- Updating cache expiration times
- Listing and managing cached content
- Understanding cache token savings

**Run:**
```bash
node dist/examples/cached-content.js
```

**Key Concepts:**
- Creating caches with `client.cachedContent.create()`
- Setting TTL vs absolute expiration time
- Using `cachedContent` parameter in generation
- Tracking cached token usage for cost optimization

---

### 7. Embeddings (`embeddings.ts`)

Comprehensive embedding generation examples:
- Single text embeddings
- Batch embedding generation
- Different task types (retrieval, classification, clustering)
- Semantic similarity comparison
- Text clustering
- Using titles with embeddings

**Run:**
```bash
node dist/examples/embeddings.js
```

**Key Concepts:**
- Using `client.embeddings.embed()`
- Batch processing with `client.embeddings.batchEmbed()`
- Task types: RETRIEVAL_QUERY, RETRIEVAL_DOCUMENT, SEMANTIC_SIMILARITY, CLASSIFICATION, CLUSTERING
- Cosine similarity calculations
- Practical applications like search and clustering

---

### 8. Resilience Patterns (`resilience.ts`)

Advanced fault tolerance and reliability patterns:
- Retry with exponential backoff
- Circuit breaker pattern
- Rate limiting
- Combining patterns with ResilienceOrchestrator
- Creating clients with custom resilience config
- Monitoring circuit breaker state

**Run:**
```bash
node dist/examples/resilience.js
```

**Key Concepts:**
- `RetryExecutor` for automatic retries
- `CircuitBreaker` for fault isolation
- `RateLimiter` for API quota management
- `ResilienceOrchestrator` to combine all patterns
- Configuring retry delays, jitter, and backoff multipliers
- Circuit states: CLOSED, OPEN, HALF_OPEN

---

## Example Structure

Each example follows a consistent structure:

1. **Header Documentation**: Describes what the example demonstrates
2. **Prerequisites**: Lists requirements (API key, environment setup)
3. **Usage Instructions**: Shows how to run the example
4. **Multiple Sub-Examples**: Each file contains 5-7 focused examples
5. **Error Handling**: Proper try/catch blocks with informative error messages
6. **Cleanup**: Resources are cleaned up in `finally` blocks where applicable
7. **Console Output**: Clear logging showing what's happening at each step

## Running All Examples

To run all examples in sequence:

```bash
for example in basic streaming multimodal safety-settings files cached-content embeddings resilience; do
  echo "Running $example..."
  node dist/examples/$example.js
  echo "---"
done
```

## Additional Examples

This directory also contains:

- `resilience-demo.ts`: Advanced resilience demonstration
- `resilience-integration-test.ts`: Integration testing for resilience features

## Common Patterns

### Error Handling

All examples use proper error handling:

```typescript
try {
  const response = await client.content.generate(model, request);
  // Process response
} catch (error) {
  console.error('Error:', error);
  if (error instanceof GeminiError) {
    console.error('Error type:', error.type);
    console.error('Is retryable:', error.isRetryable);
  }
}
```

### Client Creation

Two ways to create a client:

```typescript
// From environment variable
const client = createClientFromEnv();

// With explicit config
const client = createClient({
  apiKey: 'your-api-key',
  timeout: 30000,
  retry: { maxAttempts: 3 },
});
```

### Resource Cleanup

Examples that create resources clean them up:

```typescript
let resourceId: string | null = null;

try {
  resourceId = await createResource();
  // Use resource
} finally {
  if (resourceId) {
    await deleteResource(resourceId);
  }
}
```

## Tips for Learning

1. **Start with `basic.ts`**: Get familiar with the core API
2. **Try `streaming.ts`**: See how real-time generation works
3. **Explore `multimodal.ts`**: Learn about image inputs
4. **Study `resilience.ts`**: Understand production-ready patterns
5. **Experiment**: Modify prompts, parameters, and configurations

## Troubleshooting

### "Missing API Key" Error

Make sure you've set the environment variable:
```bash
export GEMINI_API_KEY="your-api-key"
```

### "Model Not Found" Error

Ensure you're using a valid model name:
- `gemini-2.0-flash-exp` - Latest flash model
- `models/text-embedding-004` - Embedding model

### Import Errors

Make sure you've built the project:
```bash
npm run build
```

### Rate Limit Errors

If you hit rate limits:
- Add delays between requests
- Use the `resilience.ts` example patterns
- Configure custom rate limits in client config

## Further Reading

- [Gemini API Documentation](https://ai.google.dev/docs)
- [TypeScript SDK README](../README.md)
- [API Reference](../docs/API.md)

## Contributing

Have an idea for a new example? Contributions are welcome! Please ensure:
- Examples are well-documented
- Code follows the existing style
- Error handling is comprehensive
- Resources are cleaned up properly

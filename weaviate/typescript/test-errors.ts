// Quick test file to verify error module functionality
import {
  WeaviateError,
  ConfigurationError,
  AuthenticationError,
  ObjectNotFoundError,
  ClassNotFoundError,
  InvalidVectorError,
  RateLimitedError,
  BatchPartialFailureError,
  GraphQLError,
  mapHttpError,
  mapToWeaviateError,
  isWeaviateError,
  isRetryableError,
} from './src/errors/index.js';

console.log('Testing Weaviate Error Module...\n');

// Test 1: Configuration Error
console.log('1. ConfigurationError:');
const configErr = new ConfigurationError('Missing endpoint URL');
console.log(`   Name: ${configErr.name}`);
console.log(`   Category: ${configErr.category}`);
console.log(`   Retryable: ${configErr.isRetryable}`);
console.log(`   Is WeaviateError: ${isWeaviateError(configErr)}`);

// Test 2: Authentication Error
console.log('\n2. AuthenticationError:');
const authErr = new AuthenticationError('Invalid API key');
console.log(`   Status: ${authErr.statusCode}`);
console.log(`   Retryable: ${authErr.isRetryable}`);

// Test 3: Not Found Errors
console.log('\n3. ObjectNotFoundError:');
const notFoundErr = new ObjectNotFoundError('123e4567-e89b-12d3-a456-426614174000', 'Article');
console.log(`   Message: ${notFoundErr.message}`);
console.log(`   Status: ${notFoundErr.statusCode}`);

// Test 4: Validation Error
console.log('\n4. InvalidVectorError:');
const vectorErr = new InvalidVectorError('Vector dimension mismatch: expected 384, got 768');
console.log(`   Category: ${vectorErr.category}`);
console.log(`   Status: ${vectorErr.statusCode}`);

// Test 5: Rate Limit Error
console.log('\n5. RateLimitedError:');
const rateLimitErr = new RateLimitedError('Too many requests', 60);
console.log(`   Retryable: ${rateLimitErr.isRetryable}`);
console.log(`   Retry After: ${rateLimitErr.retryAfter}s`);
console.log(`   Is retryable error: ${isRetryableError(rateLimitErr)}`);

// Test 6: Batch Partial Failure
console.log('\n6. BatchPartialFailureError:');
const batchErr = new BatchPartialFailureError(
  95,
  5,
  [
    { index: 10, objectId: 'obj-1', message: 'Invalid property' },
    { index: 25, objectId: 'obj-2', message: 'Vector dimension mismatch' },
  ]
);
console.log(`   Successful: ${batchErr.successful}`);
console.log(`   Failed: ${batchErr.failed}`);
console.log(`   Failed indices: ${batchErr.getFailedIndices()}`);

// Test 7: GraphQL Error
console.log('\n7. GraphQLError:');
const graphqlErr = new GraphQLError([
  { message: 'Field "invalidField" not found', path: ['Get', 'Article'] },
  { message: 'Invalid filter syntax' },
]);
console.log(`   Message: ${graphqlErr.message}`);
console.log(`   First error: ${graphqlErr.getFirstErrorMessage()}`);
console.log(`   Has "Field" error: ${graphqlErr.hasErrorMessage('Field')}`);

// Test 8: HTTP Error Mapping
console.log('\n8. HTTP Error Mapping:');
const http404 = mapHttpError({
  status: 404,
  data: { message: "Class 'NonExistent' not found" },
});
console.log(`   Mapped to: ${http404.name}`);
console.log(`   Message: ${http404.message}`);

const http429 = mapHttpError({
  status: 429,
  data: { message: 'Rate limit exceeded' },
  headers: { 'retry-after': '30' },
});
console.log(`   Rate limit retry after: ${http429.retryAfter}s`);

// Test 9: Error JSON serialization
console.log('\n9. Error JSON serialization:');
const jsonErr = authErr.toJSON();
console.log(`   JSON: ${JSON.stringify(jsonErr, null, 2)}`);

// Test 10: Error toString
console.log('\n10. Error toString:');
console.log(`   ${notFoundErr.toString()}`);

console.log('\n✓ All tests completed successfully!');

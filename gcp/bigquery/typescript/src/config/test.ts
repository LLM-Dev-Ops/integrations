/**
 * Basic test for BigQuery configuration module
 * Run with: npx tsx src/config/test.ts
 */

import { configBuilder, validateProjectId, validateDatasetId, validateTableId, resolveEndpoint } from './index.js';

console.log('Testing BigQuery Configuration Module\n');

// Test 1: Basic configuration
console.log('Test 1: Basic configuration');
try {
  const config = configBuilder()
    .projectId('test-project-123')
    .location('US')
    .build();
  console.log('✓ Basic config created:', {
    projectId: config.projectId,
    location: config.location,
    timeout: config.timeout,
  });
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 2: Configuration with credentials
console.log('\nTest 2: Configuration with credentials');
try {
  const config = configBuilder()
    .projectId('test-project-123')
    .applicationDefault()
    .build();
  console.log('✓ Config with credentials created');
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 3: Configuration with cost limits
console.log('\nTest 3: Configuration with cost limits');
try {
  const config = configBuilder()
    .projectId('test-project-123')
    .maximumBytesBilled(1000000000n)
    .build();
  console.log('✓ Config with cost limits created:', {
    maximumBytesBilled: config.maximumBytesBilled,
  });
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 4: Configuration with custom settings
console.log('\nTest 4: Configuration with custom settings');
try {
  const config = configBuilder()
    .projectId('test-project-123')
    .useQueryCache(false)
    .useLegacySql(true)
    .enableLogging(true)
    .build();
  console.log('✓ Config with custom settings created:', {
    useQueryCache: config.useQueryCache,
    useLegacySql: config.useLegacySql,
    enableLogging: config.enableLogging,
  });
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 5: Validation - valid project ID
console.log('\nTest 5: Project ID validation (valid)');
try {
  validateProjectId('test-project-123');
  console.log('✓ Valid project ID accepted');
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 6: Validation - invalid project ID
console.log('\nTest 6: Project ID validation (invalid)');
try {
  validateProjectId('Test-Project-123'); // uppercase not allowed
  console.error('✗ Should have thrown error');
} catch (error) {
  console.log('✓ Invalid project ID rejected:', (error as Error).message);
}

// Test 7: Dataset ID validation
console.log('\nTest 7: Dataset ID validation');
try {
  validateDatasetId('my_dataset_123');
  console.log('✓ Valid dataset ID accepted');
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 8: Table ID validation
console.log('\nTest 8: Table ID validation');
try {
  validateTableId('my_table_123');
  console.log('✓ Valid table ID accepted');
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 9: Endpoint resolution
console.log('\nTest 9: Endpoint resolution');
try {
  const config = configBuilder()
    .projectId('test-project-123')
    .build();
  const endpoint = resolveEndpoint(config);
  console.log('✓ Default endpoint resolved:', endpoint);
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 10: Custom endpoint
console.log('\nTest 10: Custom endpoint');
try {
  const config = configBuilder()
    .projectId('test-project-123')
    .apiEndpoint('http://localhost:9050')
    .build();
  const endpoint = resolveEndpoint(config);
  console.log('✓ Custom endpoint resolved:', endpoint);
} catch (error) {
  console.error('✗ Failed:', error);
}

// Test 11: Missing project ID
console.log('\nTest 11: Missing project ID (should fail)');
try {
  configBuilder().build();
  console.error('✗ Should have thrown error');
} catch (error) {
  console.log('✓ Missing project ID rejected:', (error as Error).message);
}

console.log('\nAll tests completed!');

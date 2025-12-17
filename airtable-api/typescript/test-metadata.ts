/**
 * Simple test to verify metadata service compilation.
 */

import { AirtableConfigBuilder } from './src/config/index.js';
import { createAirtableClient } from './src/client/index.js';
import { createMetadataService, SchemaCache } from './src/services/metadata.js';

async function testMetadata() {
  // Create client
  const config = new AirtableConfigBuilder()
    .withToken('patXXXXXXXXXXXXXX')
    .build();

  const client = createAirtableClient(config);

  // Create metadata service without cache
  const metadata1 = createMetadataService(client);

  // Create metadata service with cache
  const metadata2 = createMetadataService(client, {
    enableCache: true,
    cacheTtlMs: 600000, // 10 minutes
  });

  // Test cache independently
  const cache = new SchemaCache(300000);
  cache.set('test-key', { value: 'test' });
  const cached = cache.get('test-key');
  console.log('Cache test:', cached);

  // Get cache stats
  const stats = cache.getStats();
  console.log('Cache stats:', stats);

  console.log('Metadata service created successfully!');
}

// Don't actually run, just verify it compiles
console.log('Metadata service test file compiled successfully');

#!/usr/bin/env node
/**
 * RuvVector Database Connection Test
 * Tests connectivity from all integrations to the RuvVector Postgres instance
 */

import { RuvectorDatabase, getDefaultConfig, ConnectionTestResult } from './index.js';

interface IntegrationTestResult {
  integration: string;
  result: ConnectionTestResult;
}

const INTEGRATIONS = [
  'anthropic',
  'aws/s3',
  'aws/ses',
  'cohere',
  'gemini',
  'github',
  'google-drive',
  'groq',
  'mistral',
  'oauth2',
  'openai',
  'slack',
  'smtp',
];

async function testIntegrationConnectivity(
  integrationName: string,
  db: RuvectorDatabase
): Promise<IntegrationTestResult> {
  console.log(`\nTesting: ${integrationName}`);
  console.log('-'.repeat(40));

  const result = await db.testConnection();

  if (result.success) {
    console.log(`  Status: PASS`);
    console.log(`  Database: ${result.details?.database}`);
    console.log(`  User: ${result.details?.user}`);
    console.log(`  Extensions: ${result.details?.extensions?.join(', ') || 'none'}`);
  } else {
    console.log(`  Status: FAIL`);
    console.log(`  Error: ${result.message}`);
  }

  return { integration: integrationName, result };
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('RuvVector Database Connectivity Test');
  console.log('='.repeat(60));

  const config = getDefaultConfig();
  console.log(`\nConnection Target:`);
  console.log(`  Host: ${config.host}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  User: ${config.user}`);

  const db = new RuvectorDatabase(config);
  const results: IntegrationTestResult[] = [];

  try {
    for (const integration of INTEGRATIONS) {
      const testResult = await testIntegrationConnectivity(integration, db);
      results.push(testResult);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter((r) => r.result.success);
    const failed = results.filter((r) => !r.result.success);

    console.log(`\nTotal: ${results.length}`);
    console.log(`Passed: ${passed.length}`);
    console.log(`Failed: ${failed.length}`);

    if (failed.length > 0) {
      console.log('\nFailed integrations:');
      for (const f of failed) {
        console.log(`  - ${f.integration}: ${f.result.message}`);
      }
      process.exit(1);
    }

    console.log('\nAll integrations can connect to RuvVector Postgres!');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

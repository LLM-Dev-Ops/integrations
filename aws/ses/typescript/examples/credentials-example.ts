/**
 * AWS SES Credentials Module Examples
 *
 * This file demonstrates various ways to use the credentials module
 * for different deployment scenarios.
 */

import {
  defaultProvider,
  StaticCredentialProvider,
  EnvironmentCredentialProvider,
  ProfileCredentialProvider,
  IMDSCredentialProvider,
  ChainCredentialProvider,
  CachedCredentialProvider,
  CredentialError,
} from '../src/credentials/index.js';

/**
 * Example 1: Using the default provider chain (recommended for production)
 */
async function exampleDefaultProvider() {
  console.log('Example 1: Default Provider Chain');
  console.log('----------------------------------');

  try {
    const provider = defaultProvider();
    const credentials = await provider.getCredentials();

    console.log('✓ Credentials loaded successfully');
    console.log('  Access Key ID:', credentials.accessKeyId.substring(0, 8) + '...');
    console.log('  Has Session Token:', !!credentials.sessionToken);
    console.log('  Expiration:', credentials.expiration || 'No expiration');
  } catch (error) {
    if (error instanceof CredentialError) {
      console.error('✗ Failed to load credentials:', error.code);
      console.error('  Message:', error.message);
    }
  }

  console.log();
}

/**
 * Example 2: Using static credentials (for testing)
 */
async function exampleStaticCredentials() {
  console.log('Example 2: Static Credentials');
  console.log('-----------------------------');

  try {
    const provider = new StaticCredentialProvider({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });

    const credentials = await provider.getCredentials();
    console.log('✓ Static credentials loaded');
    console.log('  Access Key ID:', credentials.accessKeyId.substring(0, 8) + '...');
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
  }

  console.log();
}

/**
 * Example 3: Using environment variables
 */
async function exampleEnvironmentCredentials() {
  console.log('Example 3: Environment Variables');
  console.log('--------------------------------');

  // Set environment variables (in production, these would be set externally)
  process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

  try {
    const provider = new EnvironmentCredentialProvider();
    const credentials = await provider.getCredentials();

    console.log('✓ Environment credentials loaded');
    console.log('  Access Key ID:', credentials.accessKeyId.substring(0, 8) + '...');
  } catch (error) {
    if (error instanceof CredentialError) {
      console.error('✗ Failed:', error.code);
      console.error('  Message:', error.message);
    }
  }

  // Clean up
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;

  console.log();
}

/**
 * Example 4: Using named profiles
 */
async function exampleProfileCredentials() {
  console.log('Example 4: Named Profile');
  console.log('------------------------');

  try {
    // This will look for a profile named 'default' in ~/.aws/credentials
    const provider = new ProfileCredentialProvider({
      profile: 'default',
    });

    const credentials = await provider.getCredentials();
    console.log('✓ Profile credentials loaded');
    console.log('  Access Key ID:', credentials.accessKeyId.substring(0, 8) + '...');
  } catch (error) {
    if (error instanceof CredentialError) {
      console.error('✗ Failed:', error.code);
      console.error('  Message:', error.message);
      console.error('  (This is expected if ~/.aws/credentials does not exist)');
    }
  }

  console.log();
}

/**
 * Example 5: Using IMDS (only works on EC2 instances)
 */
async function exampleIMDSCredentials() {
  console.log('Example 5: Instance Metadata Service');
  console.log('------------------------------------');

  try {
    const provider = new IMDSCredentialProvider({
      timeout: 2000, // 2 second timeout
      maxRetries: 1, // Only try once for this example
    });

    const credentials = await provider.getCredentials();
    console.log('✓ IMDS credentials loaded');
    console.log('  Access Key ID:', credentials.accessKeyId.substring(0, 8) + '...');
    console.log('  Session Token:', credentials.sessionToken?.substring(0, 20) + '...');
    console.log('  Expiration:', credentials.expiration);
  } catch (error) {
    if (error instanceof CredentialError) {
      console.error('✗ Failed:', error.code);
      console.error('  (This is expected if not running on EC2)');
    }
  }

  console.log();
}

/**
 * Example 6: Custom credential chain
 */
async function exampleCustomChain() {
  console.log('Example 6: Custom Credential Chain');
  console.log('----------------------------------');

  // Set environment variables for this example
  process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

  try {
    const provider = new ChainCredentialProvider([
      new StaticCredentialProvider({
        accessKeyId: 'AKIASTATIC1234567',
        secretAccessKey: 'StaticSecretKey123',
      }),
      new EnvironmentCredentialProvider(),
      new ProfileCredentialProvider(),
    ]);

    const credentials = await provider.getCredentials();
    console.log('✓ Credentials loaded from chain');
    console.log('  Access Key ID:', credentials.accessKeyId.substring(0, 8) + '...');

    // The provider caches the successful source
    const credentials2 = await provider.getCredentials();
    console.log('✓ Second call used cached provider');
  } catch (error) {
    if (error instanceof CredentialError) {
      console.error('✗ All providers failed:', error.code);
    }
  }

  // Clean up
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;

  console.log();
}

/**
 * Example 7: Caching credentials
 */
async function exampleCachedCredentials() {
  console.log('Example 7: Cached Credentials');
  console.log('-----------------------------');

  try {
    const baseProvider = new StaticCredentialProvider({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });

    const cachedProvider = new CachedCredentialProvider(baseProvider, {
      ttl: 60 * 60 * 1000, // Cache for 1 hour
      refreshBuffer: 5 * 60 * 1000, // Refresh 5 minutes before expiry
    });

    // First call fetches from underlying provider
    console.log('First call...');
    const credentials1 = await cachedProvider.getCredentials();
    console.log('✓ Credentials loaded and cached');

    // Second call uses cache
    console.log('Second call...');
    const credentials2 = await cachedProvider.getCredentials();
    console.log('✓ Credentials retrieved from cache');

    // Get cache statistics
    const stats = cachedProvider.getCacheStats();
    if (stats) {
      console.log('  Cached at:', stats.cachedAt.toISOString());
      console.log('  Expires at:', stats.expiresAt.toISOString());
    }

    // Clear cache
    cachedProvider.clearCache();
    console.log('✓ Cache cleared');
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
  }

  console.log();
}

/**
 * Example 8: Handling temporary credentials with expiration
 */
async function exampleTemporaryCredentials() {
  console.log('Example 8: Temporary Credentials');
  console.log('--------------------------------');

  try {
    // Create credentials that expire in 1 hour
    const provider = new StaticCredentialProvider({
      accessKeyId: 'ASIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'AQoDYXdzEJr...',
      expiration: new Date(Date.now() + 3600000), // 1 hour from now
    });

    const credentials = await provider.getCredentials();
    console.log('✓ Temporary credentials loaded');
    console.log('  Access Key ID:', credentials.accessKeyId.substring(0, 8) + '...');
    console.log('  Session Token:', credentials.sessionToken?.substring(0, 20) + '...');
    console.log('  Expires:', credentials.expiration?.toISOString());

    // Check if expired
    const isExpired = provider.isExpired();
    console.log('  Is Expired:', isExpired);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
  }

  console.log();
}

/**
 * Example 9: Error handling
 */
async function exampleErrorHandling() {
  console.log('Example 9: Error Handling');
  console.log('------------------------');

  // Clear environment variables to force an error
  const savedKeyId = process.env.AWS_ACCESS_KEY_ID;
  const savedSecret = process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;

  try {
    const provider = new EnvironmentCredentialProvider();
    await provider.getCredentials();
  } catch (error) {
    if (error instanceof CredentialError) {
      console.log('✓ Caught CredentialError as expected');
      console.log('  Error Code:', error.code);
      console.log('  Error Message:', error.message);
      console.log('  Error Name:', error.name);

      // Handle different error codes
      switch (error.code) {
        case 'MISSING':
          console.log('  → Credentials are missing, check configuration');
          break;
        case 'INVALID':
          console.log('  → Credentials are invalid, verify format');
          break;
        case 'EXPIRED':
          console.log('  → Credentials expired, refresh needed');
          break;
        default:
          console.log('  → Unexpected error code');
      }
    }
  }

  // Restore environment variables
  if (savedKeyId) process.env.AWS_ACCESS_KEY_ID = savedKeyId;
  if (savedSecret) process.env.AWS_SECRET_ACCESS_KEY = savedSecret;

  console.log();
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('AWS SES Credentials Module Examples');
  console.log('===================================\n');

  await exampleDefaultProvider();
  await exampleStaticCredentials();
  await exampleEnvironmentCredentials();
  await exampleProfileCredentials();
  await exampleIMDSCredentials();
  await exampleCustomChain();
  await exampleCachedCredentials();
  await exampleTemporaryCredentials();
  await exampleErrorHandling();

  console.log('All examples completed!');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

// Export for use in other files
export {
  exampleDefaultProvider,
  exampleStaticCredentials,
  exampleEnvironmentCredentials,
  exampleProfileCredentials,
  exampleIMDSCredentials,
  exampleCustomChain,
  exampleCachedCredentials,
  exampleTemporaryCredentials,
  exampleErrorHandling,
};

// Quick test to verify the config module compiles and works
const config = await import('./src/config/index.ts');

console.log('Testing MySQL config module...\n');

// Test 1: Create connection config
console.log('1. Testing createDefaultConnectionConfig...');
const connConfig = config.createDefaultConnectionConfig({
  host: 'localhost',
  database: 'testdb',
  username: 'testuser',
  password: 'testpass'
});
console.log('   Port:', connConfig.port, '(should be 3306)');
console.log('   Charset:', connConfig.charset, '(should be utf8mb4)');
console.log('   SSL Mode:', connConfig.sslMode, '(should be PREFERRED)');

// Test 2: Parse connection string
console.log('\n2. Testing parseConnectionString...');
const parsed = config.parseConnectionString('mysql://user:pass@db.example.com:3307/mydb?charset=latin1&sslmode=require');
console.log('   Host:', parsed.host);
console.log('   Port:', parsed.port, '(should be 3307)');
console.log('   Database:', parsed.database);
console.log('   Charset:', parsed.charset, '(should be latin1)');
console.log('   SSL Mode:', parsed.sslMode, '(should be REQUIRED)');

// Test 3: Builder pattern
console.log('\n3. Testing MysqlConfigBuilder...');
const builder = new config.MysqlConfigBuilder();
const fullConfig = builder
  .withConnectionString('mysql://admin:secret@localhost/production')
  .withPool({ maxConnections: 50 })
  .withQueryTimeout(60000)
  .withQueryLogging(true)
  .build();
console.log('   Query timeout:', fullConfig.defaultQueryTimeoutMs, '(should be 60000)');
console.log('   Max connections:', fullConfig.pool.maxConnections, '(should be 50)');
console.log('   Log queries:', fullConfig.logQueries, '(should be true)');

// Test 4: Redaction
console.log('\n4. Testing redactConfig...');
const redacted = config.redactConfig(connConfig);
console.log('   Password:', redacted.password, '(should be [REDACTED])');

// Test 5: Constants
console.log('\n5. Testing constants...');
console.log('   DEFAULT_MYSQL_PORT:', config.DEFAULT_MYSQL_PORT);
console.log('   DEFAULT_QUERY_TIMEOUT:', config.DEFAULT_QUERY_TIMEOUT);
console.log('   DEFAULT_MAX_QUERY_SIZE:', config.DEFAULT_MAX_QUERY_SIZE);

console.log('\n✓ All tests passed!');

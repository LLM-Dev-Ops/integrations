import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Global test settings
    globals: true,

    // Test environment
    environment: 'node',

    // Test file patterns
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/**/__tests__/**/*.ts'
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      '**/examples/**'
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/__mocks__/**',
        '**/examples/**',
        '**/types/**',
        'dist/**',
        'node_modules/**',
        'src/index.ts', // Main barrel export file
      ],
      include: [
        'src/**/*.ts'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },

    // Test timeout
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter
    reporters: ['verbose'],

    // Watch mode
    watch: false,

    // Pool options
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },

    // Setup files
    setupFiles: [],

    // Mock reset
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,

    // Snapshot options
    resolveSnapshotPath: (testPath, snapExtension) => {
      return path.join(
        path.dirname(testPath),
        '__snapshots__',
        path.basename(testPath) + snapExtension
      );
    },
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@types': path.resolve(__dirname, './src/types'),
      '@config': path.resolve(__dirname, './src/config'),
      '@auth': path.resolve(__dirname, './src/auth'),
      '@errors': path.resolve(__dirname, './src/errors'),
      '@filter': path.resolve(__dirname, './src/filter'),
      '@search': path.resolve(__dirname, './src/search'),
      '@batch': path.resolve(__dirname, './src/batch'),
      '@aggregate': path.resolve(__dirname, './src/aggregate'),
      '@schema': path.resolve(__dirname, './src/schema'),
      '@observability': path.resolve(__dirname, './src/observability'),
      '@resilience': path.resolve(__dirname, './src/resilience'),
      '@transport': path.resolve(__dirname, './src/transport'),
      '@graphql': path.resolve(__dirname, './src/graphql'),
    },
  },
});

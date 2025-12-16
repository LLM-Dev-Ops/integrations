import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points
  entry: {
    index: 'src/index.ts',
    config: 'src/config/index.ts',
    auth: 'src/auth/index.ts',
    types: 'src/types/index.ts',
    errors: 'src/errors/index.ts',
    filter: 'src/filter/index.ts',
    search: 'src/search/index.ts',
    batch: 'src/batch/index.ts',
    aggregate: 'src/aggregate/index.ts',
    schema: 'src/schema/index.ts',
    observability: 'src/observability/index.ts',
    resilience: 'src/resilience/index.ts',
  },

  // Output formats
  format: ['cjs', 'esm'],

  // Generate type declarations
  dts: true,

  // Clean output directory before build
  clean: true,

  // Generate sourcemaps
  sourcemap: true,

  // Code splitting
  splitting: false,

  // Tree shaking
  treeshake: true,

  // Minification (disabled for library readability)
  minify: false,

  // Target environment
  target: 'es2022',

  // Platform
  platform: 'node',

  // External dependencies
  external: [],

  // Don't bundle node_modules
  noExternal: [],

  // Output extension for ESM
  esbuildOptions(options) {
    options.mainFields = ['module', 'main'];
    options.conditions = ['import', 'require'];
  },

  // Banner to add to each file
  banner: {
    js: `/**
 * @llmdevops/weaviate-integration
 * Production-ready Weaviate Vector Database client
 *
 * @version 0.1.0
 * @license MIT
 */`,
  },

  // Enable watch mode logging
  onSuccess: 'echo "Build completed successfully"',
});

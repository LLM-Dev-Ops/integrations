# Airtable Metadata Service Usage Guide

This guide demonstrates how to use the Airtable Metadata Service to access base and table schema information.

## Overview

The Metadata Service provides access to:
- **Base metadata**: List and retrieve information about accessible bases
- **Table schemas**: Get complete table structures including fields and views
- **Schema caching**: Optional caching to reduce API calls

## Quick Start

```typescript
import { AirtableConfigBuilder } from './src/config/index.js';
import { createAirtableClient } from './src/client/index.js';
import { createMetadataService } from './src/services/metadata.js';

// Create client
const config = new AirtableConfigBuilder()
  .withToken('patXXXXXXXXXXXXXX')
  .build();

const client = createAirtableClient(config);

// Create metadata service
const metadata = createMetadataService(client);
```

## Listing Bases

```typescript
// Get all accessible bases
const bases = await metadata.listBases();

for (const base of bases) {
  console.log(`Base: ${base.name} (${base.id})`);
  console.log(`Permission: ${base.permissionLevel}`);
}
```

## Getting Base Information

```typescript
// Get specific base metadata
const base = await metadata.getBase('appXXXXXXXXXXXXXX');
console.log(`Base: ${base.name}`);
console.log(`Permission level: ${base.permissionLevel}`);
```

## Listing Tables

```typescript
// Get all tables in a base with their schemas
const tables = await metadata.listTables('appXXXXXXXXXXXXXX');

for (const table of tables) {
  console.log(`Table: ${table.name} (${table.id})`);
  console.log(`Primary field: ${table.primaryFieldId}`);
  console.log(`Fields: ${table.fields.length}`);
  console.log(`Views: ${table.views.length}`);
}
```

## Getting Table Schema

```typescript
// Get table by ID
const tableById = await metadata.getTable(
  'appXXXXXXXXXXXXXX',
  'tblXXXXXXXXXXXXXX'
);

// Get table by name
const tableByName = await metadata.getTable(
  'appXXXXXXXXXXXXXX',
  'My Table Name'
);

// Inspect fields
for (const field of tableByName.fields) {
  console.log(`Field: ${field.name}`);
  console.log(`  Type: ${field.type}`);
  console.log(`  ID: ${field.id}`);
  if (field.description) {
    console.log(`  Description: ${field.description}`);
  }
  if (field.options) {
    console.log(`  Options:`, field.options);
  }
}

// Inspect views
for (const view of tableByName.views) {
  console.log(`View: ${view.name} (${view.type})`);
}
```

## Using Schema Cache

Caching reduces API calls by storing schema information temporarily.

```typescript
// Create metadata service with caching enabled
const metadata = createMetadataService(client, {
  enableCache: true,
  cacheTtlMs: 600000, // 10 minutes
});

// First call - fetches from API
const tables1 = await metadata.listTables('appXXXXXXXXXXXXXX');

// Second call - returns cached result (within TTL)
const tables2 = await metadata.listTables('appXXXXXXXXXXXXXX');

// Clear entire cache
metadata.clearCache();

// Invalidate specific base
metadata.invalidateBase('appXXXXXXXXXXXXXX');

// Invalidate specific table
metadata.invalidateTable('appXXXXXXXXXXXXXX', 'tblXXXXXXXXXXXXXX');

// Get cache statistics
const stats = metadata.getCacheStats();
console.log(`Cache size: ${stats?.size}`);
console.log(`Cached keys:`, stats?.keys);
```

## Field Types

The metadata service returns comprehensive field information:

```typescript
const table = await metadata.getTable('appXXXXXXXXXXXXXX', 'tblXXXXXXXXXXXXXX');

for (const field of table.fields) {
  switch (field.type) {
    case 'singleLineText':
    case 'multilineText':
    case 'richText':
      console.log(`${field.name}: Text field`);
      break;

    case 'singleSelect':
    case 'multipleSelects':
      console.log(`${field.name}: Select field`);
      if (field.options?.choices) {
        console.log('  Choices:', field.options.choices);
      }
      break;

    case 'number':
    case 'currency':
    case 'percent':
      console.log(`${field.name}: Numeric field`);
      if (field.options?.precision) {
        console.log(`  Precision: ${field.options.precision}`);
      }
      break;

    case 'multipleRecordLinks':
      console.log(`${field.name}: Linked records`);
      if (field.options?.linkedTableId) {
        console.log(`  Links to: ${field.options.linkedTableId}`);
      }
      break;

    case 'formula':
      console.log(`${field.name}: Formula field`);
      if (field.options?.formula) {
        console.log(`  Formula: ${field.options.formula}`);
      }
      break;

    case 'rollup':
      console.log(`${field.name}: Rollup field`);
      if (field.options?.aggregationFunction) {
        console.log(`  Function: ${field.options.aggregationFunction}`);
      }
      break;

    default:
      console.log(`${field.name}: ${field.type}`);
  }
}
```

## View Types

Tables can have multiple view types:

```typescript
const table = await metadata.getTable('appXXXXXXXXXXXXXX', 'tblXXXXXXXXXXXXXX');

for (const view of table.views) {
  switch (view.type) {
    case 'grid':
      console.log(`${view.name}: Grid view (default spreadsheet view)`);
      break;
    case 'form':
      console.log(`${view.name}: Form view (data entry)`);
      break;
    case 'calendar':
      console.log(`${view.name}: Calendar view (timeline)`);
      break;
    case 'gallery':
      console.log(`${view.name}: Gallery view (card layout)`);
      break;
    case 'kanban':
      console.log(`${view.name}: Kanban view (board)`);
      break;
    case 'timeline':
      console.log(`${view.name}: Timeline view (Gantt)`);
      break;
    default:
      console.log(`${view.name}: ${view.type}`);
  }
}
```

## Error Handling

```typescript
import { ValidationError, NotFoundError, AirtableError } from './src/errors/index.js';

try {
  // Invalid base ID format
  await metadata.getBase('invalid-id');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
  }
}

try {
  // Non-existent base
  await metadata.getBase('appNOTEXISTINGXXX');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('Base not found:', error.message);
  }
}

try {
  // Table not found
  await metadata.getTable('appXXXXXXXXXXXXXX', 'NonExistentTable');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Table not found:', error.message);
  } else if (error instanceof AirtableError) {
    console.error('API error:', error.message);
  }
}
```

## Advanced: Direct Cache Usage

You can use the SchemaCache class directly for custom caching:

```typescript
import { SchemaCache } from './src/services/metadata.js';

// Create cache with 5 minute TTL
const cache = new SchemaCache(300000);

// Store value
cache.set('my-key', { data: 'value' });

// Store with custom TTL (10 minutes)
cache.set('my-key-2', { data: 'value2' }, 600000);

// Retrieve value
const value = cache.get('my-key');

// Invalidate single entry
cache.invalidate('my-key');

// Clear all entries
cache.clear();

// Get statistics
const stats = cache.getStats();
console.log('Cache entries:', stats.size);
console.log('Keys:', stats.keys);
```

## Complete Example

```typescript
import { AirtableConfigBuilder } from './src/config/index.js';
import { createAirtableClient } from './src/client/index.js';
import { createMetadataService } from './src/services/metadata.js';
import { createConsoleObservability } from './src/observability/index.js';

async function exploreAirtableSchema() {
  // Create client with observability
  const config = new AirtableConfigBuilder()
    .withToken(process.env.AIRTABLE_PAT!)
    .build();

  const observability = createConsoleObservability();
  const client = createAirtableClient(config, observability);

  // Create metadata service with caching
  const metadata = createMetadataService(client, {
    enableCache: true,
    cacheTtlMs: 300000,
    logger: observability.logger,
  });

  // List all bases
  console.log('\\n=== Your Bases ===');
  const bases = await metadata.listBases();

  for (const base of bases) {
    console.log(`\\nBase: ${base.name}`);
    console.log(`  ID: ${base.id}`);
    console.log(`  Permission: ${base.permissionLevel}`);

    // List tables in this base
    console.log(`  Tables:`);
    const tables = await metadata.listTables(base.id);

    for (const table of tables) {
      console.log(`    - ${table.name} (${table.fields.length} fields, ${table.views.length} views)`);

      // Show first 3 fields
      const previewFields = table.fields.slice(0, 3);
      for (const field of previewFields) {
        console.log(`      * ${field.name} [${field.type}]`);
      }

      if (table.fields.length > 3) {
        console.log(`      ... and ${table.fields.length - 3} more fields`);
      }
    }
  }

  // Get detailed schema for specific table
  if (bases.length > 0) {
    const firstBase = bases[0];
    const tables = await metadata.listTables(firstBase.id);

    if (tables.length > 0) {
      const firstTable = tables[0];
      console.log(`\\n=== Detailed Schema: ${firstTable.name} ===`);

      console.log(`\\nFields:`);
      for (const field of firstTable.fields) {
        console.log(`  ${field.name}`);
        console.log(`    Type: ${field.type}`);
        console.log(`    ID: ${field.id}`);
        if (field.description) {
          console.log(`    Description: ${field.description}`);
        }
      }

      console.log(`\\nViews:`);
      for (const view of firstTable.views) {
        console.log(`  ${view.name} (${view.type})`);
      }
    }
  }

  // Show cache stats
  const cacheStats = metadata.getCacheStats();
  console.log(`\\n=== Cache Statistics ===`);
  console.log(`Entries: ${cacheStats?.size ?? 0}`);
}

// Run the example
exploreAirtableSchema().catch(console.error);
```

## API Reference

### MetadataService Interface

```typescript
interface MetadataService {
  // List all accessible bases
  listBases(): Promise<Base[]>;

  // Get specific base metadata
  getBase(baseId: string): Promise<Base>;

  // List all tables with schemas
  listTables(baseId: string): Promise<TableSchema[]>;

  // Get specific table schema
  getTable(baseId: string, tableIdOrName: string): Promise<TableSchema>;
}
```

### MetadataServiceImpl Methods

```typescript
class MetadataServiceImpl implements MetadataService {
  // Clear all cached data
  clearCache(): void;

  // Invalidate cache for specific base
  invalidateBase(baseId: string): void;

  // Invalidate cache for specific table
  invalidateTable(baseId: string, tableIdOrName: string): void;

  // Get cache statistics
  getCacheStats(): { size: number; keys: string[] } | undefined;
}
```

### SchemaCache Methods

```typescript
class SchemaCache {
  constructor(defaultTtlMs?: number);

  // Get cached value
  get<T>(key: string): T | undefined;

  // Set cached value with optional TTL
  set<T>(key: string, value: T, ttlMs?: number): void;

  // Invalidate specific key
  invalidate(key: string): void;

  // Clear all entries
  clear(): void;

  // Get cache statistics
  getStats(): { size: number; keys: string[] };
}
```

## Type Definitions

### Base

```typescript
interface Base {
  id: string;              // Base ID (e.g., "appXXXXXXXXXXXXXX")
  name: string;            // Base name
  permissionLevel: PermissionLevel;
}

type PermissionLevel = 'none' | 'read' | 'comment' | 'edit' | 'create';
```

### TableSchema

```typescript
interface TableSchema {
  id: string;              // Table ID (e.g., "tblXXXXXXXXXXXXXX")
  name: string;            // Table name
  primaryFieldId: string;  // ID of primary field
  fields: FieldSchema[];   // Array of field schemas
  views: ViewSchema[];     // Array of view schemas
  description?: string;    // Optional table description
}
```

### FieldSchema

```typescript
interface FieldSchema {
  id: string;                      // Field ID
  name: string;                    // Field name
  type: FieldType;                 // Field type
  description?: string;            // Optional description
  options?: Record<string, unknown>; // Type-specific options
}
```

### ViewSchema

```typescript
interface ViewSchema {
  id: string;    // View ID
  name: string;  // View name
  type: ViewType; // View type
}

type ViewType = 'grid' | 'form' | 'calendar' | 'gallery' |
                'kanban' | 'timeline' | 'block' | 'ganttChart';
```

/**
 * Schema Helpers
 *
 * Utility functions for working with Weaviate schema definitions.
 * Provides type guards, property lookups, and schema introspection helpers.
 *
 * @module @weaviate/schema/helpers
 */

import type { ClassDefinition, PropertyDefinition } from '../types/schema.js';

/**
 * Check if a property is a text property
 *
 * Text properties have data types containing "text" (case-insensitive).
 *
 * @param property - Property definition to check
 * @returns True if the property is a text property
 *
 * @example
 * ```typescript
 * const titleProp: PropertyDefinition = {
 *   name: 'title',
 *   dataType: ['text'],
 *   tokenization: Tokenization.Word,
 * };
 *
 * if (isTextProperty(titleProp)) {
 *   console.log('Title is a text property');
 *   console.log(`Tokenization: ${titleProp.tokenization}`);
 * }
 * ```
 */
export function isTextProperty(property: PropertyDefinition): boolean {
  return property.dataType.some((type) =>
    type.toLowerCase().includes('text')
  );
}

/**
 * Check if a property is a reference property
 *
 * Reference properties have class names as data types (capitalized strings
 * that don't contain array notation).
 *
 * @param property - Property definition to check
 * @returns True if the property is a reference property
 *
 * @example
 * ```typescript
 * const authorProp: PropertyDefinition = {
 *   name: 'author',
 *   dataType: ['Author'],
 * };
 *
 * if (isReferenceProperty(authorProp)) {
 *   console.log('Author is a reference property');
 *   console.log(`References class: ${authorProp.dataType[0]}`);
 * }
 * ```
 */
export function isReferenceProperty(property: PropertyDefinition): boolean {
  return property.dataType.some((type) => {
    // Reference properties are capitalized and don't contain []
    return type[0] === type[0].toUpperCase() && !type.includes('[');
  });
}

/**
 * Check if a property is an array property
 *
 * Array properties have data types ending with "[]".
 *
 * @param property - Property definition to check
 * @returns True if the property is an array property
 *
 * @example
 * ```typescript
 * const tagsProp: PropertyDefinition = {
 *   name: 'tags',
 *   dataType: ['text[]'],
 * };
 *
 * if (isArrayProperty(tagsProp)) {
 *   console.log('Tags is an array property');
 *   console.log(`Base type: ${getBaseDataType(tagsProp)}`); // 'text'
 * }
 * ```
 */
export function isArrayProperty(property: PropertyDefinition): boolean {
  return property.dataType.some((type) => type.includes('[]'));
}

/**
 * Get the base data type from a property definition
 *
 * Strips array notation ("[]") from the first data type.
 *
 * @param property - Property definition
 * @returns Base data type without array notation
 *
 * @example
 * ```typescript
 * const tagsProp: PropertyDefinition = {
 *   name: 'tags',
 *   dataType: ['text[]'],
 * };
 *
 * const baseType = getBaseDataType(tagsProp);
 * console.log(baseType); // 'text'
 * ```
 */
export function getBaseDataType(property: PropertyDefinition): string {
  const firstType = property.dataType[0];
  return firstType.replace('[]', '');
}

/**
 * Find a property by name in a class definition
 *
 * Performs case-sensitive property name lookup.
 *
 * @param schema - Class definition to search
 * @param name - Property name to find
 * @returns Property definition if found, undefined otherwise
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const titleProp = findProperty(classDef, 'title');
 *   if (titleProp) {
 *     console.log(`Title type: ${titleProp.dataType.join(', ')}`);
 *     console.log(`Searchable: ${titleProp.indexSearchable}`);
 *   } else {
 *     console.log('Title property not found');
 *   }
 * }
 * ```
 */
export function findProperty(
  schema: ClassDefinition,
  name: string
): PropertyDefinition | undefined {
  return schema.properties.find((prop) => prop.name === name);
}

/**
 * Get vector dimension from class definition
 *
 * Extracts the vector dimension from the vector index configuration.
 * Returns 0 if no vector index configuration is available or if the
 * dimension cannot be determined.
 *
 * Note: Weaviate doesn't always expose vector dimensions in the schema
 * endpoint. This function attempts to infer it from available data.
 *
 * @param classDefinition - Class definition
 * @returns Vector dimension, or 0 if not available
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const dimension = getVectorDimension(classDef);
 *   if (dimension > 0) {
 *     console.log(`Vector dimension: ${dimension}`);
 *   } else {
 *     console.log('Vector dimension not available from schema');
 *   }
 * }
 * ```
 */
export function getVectorDimension(classDefinition: ClassDefinition): number {
  // Weaviate doesn't directly expose vector dimension in schema
  // This would need to be inferred from actual vectors or module config
  // For now, return 0 to indicate "not available from schema"

  // Some vectorizers may expose dimension in moduleConfig
  if (classDefinition.moduleConfig) {
    for (const config of Object.values(classDefinition.moduleConfig)) {
      if (config && typeof config === 'object' && 'dimensions' in config) {
        const dim = (config as { dimensions: unknown }).dimensions;
        if (typeof dim === 'number') {
          return dim;
        }
      }
    }
  }

  return 0;
}

/**
 * Check if a class has a vectorizer configured
 *
 * Returns true if the class has a vectorizer other than "none".
 *
 * @param classDefinition - Class definition
 * @returns True if a vectorizer is configured
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   if (hasVectorizer(classDef)) {
 *     console.log('Class has automatic vectorization');
 *     const module = getVectorizerModule(classDef);
 *     console.log(`Vectorizer: ${module}`);
 *   } else {
 *     console.log('Class requires manual vectors');
 *   }
 * }
 * ```
 */
export function hasVectorizer(classDefinition: ClassDefinition): boolean {
  return classDefinition.vectorizer !== 'none' &&
         classDefinition.vectorizer !== '';
}

/**
 * Get the vectorizer module name from a class definition
 *
 * Returns the vectorizer module name, or null if no vectorizer is configured.
 *
 * @param classDefinition - Class definition
 * @returns Vectorizer module name, or null if none configured
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const vectorizer = getVectorizerModule(classDef);
 *   if (vectorizer) {
 *     console.log(`Vectorizer: ${vectorizer}`);
 *
 *     if (vectorizer.includes('openai')) {
 *       console.log('Using OpenAI embeddings');
 *     } else if (vectorizer.includes('huggingface')) {
 *       console.log('Using Hugging Face embeddings');
 *     }
 *   } else {
 *     console.log('No automatic vectorization');
 *   }
 * }
 * ```
 */
export function getVectorizerModule(classDefinition: ClassDefinition): string | null {
  if (!hasVectorizer(classDefinition)) {
    return null;
  }
  return classDefinition.vectorizer;
}

/**
 * Check if multi-tenancy is enabled for a class
 *
 * Returns true if the class has multi-tenancy enabled.
 *
 * @param classDefinition - Class definition
 * @returns True if multi-tenancy is enabled
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   if (isMultiTenancyEnabled(classDef)) {
 *     console.log('Multi-tenancy is enabled');
 *     console.log('Tenant parameter is required for operations');
 *
 *     // Auto-creation settings
 *     const autoCreate = classDef.multiTenancyConfig?.autoTenantCreation;
 *     console.log(`Auto-create tenants: ${autoCreate}`);
 *   } else {
 *     console.log('Single-tenant class');
 *   }
 * }
 * ```
 */
export function isMultiTenancyEnabled(classDefinition: ClassDefinition): boolean {
  return classDefinition.multiTenancyConfig?.enabled === true;
}

/**
 * Get the number of properties in a class definition
 *
 * @param classDefinition - Class definition
 * @returns Number of properties
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const propCount = getPropertyCount(classDef);
 *   console.log(`Class has ${propCount} properties`);
 * }
 * ```
 */
export function getPropertyCount(classDefinition: ClassDefinition): number {
  return classDefinition.properties.length;
}

/**
 * Get all text properties from a class definition
 *
 * @param classDefinition - Class definition
 * @returns Array of text properties
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const textProps = getTextProperties(classDef);
 *   console.log('Text properties:');
 *   for (const prop of textProps) {
 *     console.log(`  - ${prop.name} (${prop.tokenization})`);
 *   }
 * }
 * ```
 */
export function getTextProperties(classDefinition: ClassDefinition): PropertyDefinition[] {
  return classDefinition.properties.filter(isTextProperty);
}

/**
 * Get all reference properties from a class definition
 *
 * @param classDefinition - Class definition
 * @returns Array of reference properties
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const refProps = getReferenceProperties(classDef);
 *   console.log('Reference properties:');
 *   for (const prop of refProps) {
 *     console.log(`  - ${prop.name} -> ${prop.dataType.join(', ')}`);
 *   }
 * }
 * ```
 */
export function getReferenceProperties(classDefinition: ClassDefinition): PropertyDefinition[] {
  return classDefinition.properties.filter(isReferenceProperty);
}

/**
 * Get all array properties from a class definition
 *
 * @param classDefinition - Class definition
 * @returns Array of array properties
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const arrayProps = getArrayProperties(classDef);
 *   console.log('Array properties:');
 *   for (const prop of arrayProps) {
 *     const baseType = getBaseDataType(prop);
 *     console.log(`  - ${prop.name}: ${baseType}[]`);
 *   }
 * }
 * ```
 */
export function getArrayProperties(classDefinition: ClassDefinition): PropertyDefinition[] {
  return classDefinition.properties.filter(isArrayProperty);
}

/**
 * Get all searchable properties from a class definition
 *
 * Returns properties that have indexSearchable set to true.
 *
 * @param classDefinition - Class definition
 * @returns Array of searchable properties
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const searchableProps = getSearchableProperties(classDef);
 *   console.log('BM25 searchable properties:');
 *   for (const prop of searchableProps) {
 *     console.log(`  - ${prop.name}`);
 *   }
 * }
 * ```
 */
export function getSearchableProperties(classDefinition: ClassDefinition): PropertyDefinition[] {
  return classDefinition.properties.filter((prop) => prop.indexSearchable === true);
}

/**
 * Get all filterable properties from a class definition
 *
 * Returns properties that have indexFilterable set to true.
 *
 * @param classDefinition - Class definition
 * @returns Array of filterable properties
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const filterableProps = getFilterableProperties(classDef);
 *   console.log('Filterable properties:');
 *   for (const prop of filterableProps) {
 *     console.log(`  - ${prop.name}: ${prop.dataType.join(', ')}`);
 *   }
 * }
 * ```
 */
export function getFilterableProperties(classDefinition: ClassDefinition): PropertyDefinition[] {
  return classDefinition.properties.filter((prop) => prop.indexFilterable === true);
}

/**
 * Get the replication factor for a class
 *
 * @param classDefinition - Class definition
 * @returns Replication factor (default: 1)
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const factor = getReplicationFactor(classDef);
 *   console.log(`Replication factor: ${factor}`);
 * }
 * ```
 */
export function getReplicationFactor(classDefinition: ClassDefinition): number {
  return classDefinition.replicationConfig?.factor ?? 1;
}

/**
 * Check if a class has async replication enabled
 *
 * @param classDefinition - Class definition
 * @returns True if async replication is enabled
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   if (hasAsyncReplication(classDef)) {
 *     console.log('Async replication enabled - writes may not be immediately visible');
 *   }
 * }
 * ```
 */
export function hasAsyncReplication(classDefinition: ClassDefinition): boolean {
  return classDefinition.replicationConfig?.asyncEnabled === true;
}

/**
 * Get the distance metric for a class
 *
 * @param classDefinition - Class definition
 * @returns Distance metric name (e.g., 'cosine', 'dot', 'l2-squared')
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   const metric = getDistanceMetric(classDef);
 *   console.log(`Distance metric: ${metric}`);
 * }
 * ```
 */
export function getDistanceMetric(classDefinition: ClassDefinition): string {
  return classDefinition.vectorIndexConfig?.distance ?? 'cosine';
}

/**
 * Check if Product Quantization (PQ) is enabled for a class
 *
 * @param classDefinition - Class definition
 * @returns True if PQ is enabled
 *
 * @example
 * ```typescript
 * const classDef = await schemaService.getClass('Article');
 * if (classDef) {
 *   if (isPQEnabled(classDef)) {
 *     console.log('Product Quantization enabled for memory optimization');
 *   }
 * }
 * ```
 */
export function isPQEnabled(classDefinition: ClassDefinition): boolean {
  return classDefinition.vectorIndexConfig?.pq?.enabled === true;
}

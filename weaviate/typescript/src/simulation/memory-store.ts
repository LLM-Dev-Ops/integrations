/**
 * In-memory object storage for mock client
 *
 * This module provides an in-memory storage implementation for the mock
 * Weaviate client, organizing objects by class name and ID.
 */

import type { UUID } from '../types/property.js';
import type { WeaviateObject } from '../types/object.js';
import type { WhereFilter } from '../types/filter.js';
import { matchesFilter } from './filter-eval.js';

/**
 * In-memory storage for Weaviate objects
 *
 * Organizes objects by class name and ID for efficient lookups.
 */
export class MemoryStore {
  private objects: Map<string, Map<UUID, WeaviateObject>>;

  constructor() {
    this.objects = new Map();
  }

  /**
   * Gets an object by class name and ID
   *
   * @param className - The class name
   * @param id - The object ID
   * @returns The object or undefined if not found
   */
  get(className: string, id: UUID): WeaviateObject | undefined {
    const classObjects = this.objects.get(className);
    if (!classObjects) {
      return undefined;
    }
    return classObjects.get(id);
  }

  /**
   * Stores an object
   *
   * @param object - The object to store
   */
  set(object: WeaviateObject): void {
    let classObjects = this.objects.get(object.className);
    if (!classObjects) {
      classObjects = new Map();
      this.objects.set(object.className, classObjects);
    }
    classObjects.set(object.id, object);
  }

  /**
   * Deletes an object
   *
   * @param className - The class name
   * @param id - The object ID
   * @returns True if the object was deleted, false if not found
   */
  delete(className: string, id: UUID): boolean {
    const classObjects = this.objects.get(className);
    if (!classObjects) {
      return false;
    }
    return classObjects.delete(id);
  }

  /**
   * Checks if an object exists
   *
   * @param className - The class name
   * @param id - The object ID
   * @returns True if the object exists
   */
  has(className: string, id: UUID): boolean {
    const classObjects = this.objects.get(className);
    if (!classObjects) {
      return false;
    }
    return classObjects.has(id);
  }

  /**
   * Clears all objects from a class
   *
   * @param className - The class name to clear
   */
  clearClass(className: string): void {
    this.objects.delete(className);
  }

  /**
   * Clears all objects from all classes
   */
  clear(): void {
    this.objects.clear();
  }

  /**
   * Gets all objects from a class
   *
   * @param className - The class name
   * @returns Array of objects
   */
  getAllByClass(className: string): WeaviateObject[] {
    const classObjects = this.objects.get(className);
    if (!classObjects) {
      return [];
    }
    return Array.from(classObjects.values());
  }

  /**
   * Filters objects by a where filter
   *
   * @param className - The class name
   * @param filter - The filter to apply
   * @returns Array of matching objects
   */
  filter(className: string, filter: WhereFilter): WeaviateObject[] {
    const classObjects = this.getAllByClass(className);
    return classObjects.filter((obj) => matchesFilter(obj, filter));
  }

  /**
   * Gets all objects across all classes
   *
   * @returns Array of all objects
   */
  getAll(): WeaviateObject[] {
    const allObjects: WeaviateObject[] = [];
    for (const classObjects of this.objects.values()) {
      allObjects.push(...classObjects.values());
    }
    return allObjects;
  }

  /**
   * Gets the count of objects in a class
   *
   * @param className - The class name
   * @returns Number of objects
   */
  count(className: string): number {
    const classObjects = this.objects.get(className);
    return classObjects ? classObjects.size : 0;
  }

  /**
   * Gets the total count of objects across all classes
   *
   * @returns Total number of objects
   */
  totalCount(): number {
    let total = 0;
    for (const classObjects of this.objects.values()) {
      total += classObjects.size;
    }
    return total;
  }

  /**
   * Gets all class names that have objects
   *
   * @returns Array of class names
   */
  getClassNames(): string[] {
    return Array.from(this.objects.keys());
  }
}

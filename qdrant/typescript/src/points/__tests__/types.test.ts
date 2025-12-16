/**
 * Type Guards Tests
 *
 * Unit tests for vector type guards
 */

import { describe, it, expect } from 'vitest';
import { isSparseVector, isNamedVector, isDenseVector } from '../types.js';
import type { Vector, SparseVector } from '../types.js';

describe('Vector Type Guards', () => {
  describe('isDenseVector', () => {
    it('should return true for dense vector', () => {
      const vector: Vector = [0.1, 0.2, 0.3, 0.4];
      expect(isDenseVector(vector)).toBe(true);
    });

    it('should return false for sparse vector', () => {
      const vector: Vector = {
        indices: [0, 5, 10],
        values: [0.1, 0.2, 0.3],
      };
      expect(isDenseVector(vector)).toBe(false);
    });

    it('should return false for named vectors', () => {
      const vector: Vector = {
        image: [0.1, 0.2, 0.3],
        text: [0.4, 0.5, 0.6],
      };
      expect(isDenseVector(vector)).toBe(false);
    });

    it('should return true for empty array', () => {
      const vector: Vector = [];
      expect(isDenseVector(vector)).toBe(true);
    });
  });

  describe('isSparseVector', () => {
    it('should return true for sparse vector', () => {
      const vector: Vector = {
        indices: [0, 5, 10, 15],
        values: [0.1, 0.2, 0.3, 0.4],
      };
      expect(isSparseVector(vector)).toBe(true);
    });

    it('should return false for dense vector', () => {
      const vector: Vector = [0.1, 0.2, 0.3];
      expect(isSparseVector(vector)).toBe(false);
    });

    it('should return false for named vectors', () => {
      const vector: Vector = {
        image: [0.1, 0.2],
        text: [0.3, 0.4],
      };
      expect(isSparseVector(vector)).toBe(false);
    });

    it('should return false for object with only indices', () => {
      const vector = {
        indices: [0, 1, 2],
      };
      expect(isSparseVector(vector as Vector)).toBe(false);
    });

    it('should return false for object with only values', () => {
      const vector = {
        values: [0.1, 0.2, 0.3],
      };
      expect(isSparseVector(vector as Vector)).toBe(false);
    });

    it('should return true for sparse vector with empty arrays', () => {
      const vector: SparseVector = {
        indices: [],
        values: [],
      };
      expect(isSparseVector(vector)).toBe(true);
    });
  });

  describe('isNamedVector', () => {
    it('should return true for named vectors', () => {
      const vector: Vector = {
        image: [0.1, 0.2, 0.3],
        text: [0.4, 0.5, 0.6],
      };
      expect(isNamedVector(vector)).toBe(true);
    });

    it('should return true for single named vector', () => {
      const vector: Vector = {
        default: [0.1, 0.2, 0.3],
      };
      expect(isNamedVector(vector)).toBe(true);
    });

    it('should return false for dense vector', () => {
      const vector: Vector = [0.1, 0.2, 0.3];
      expect(isNamedVector(vector)).toBe(false);
    });

    it('should return false for sparse vector', () => {
      const vector: Vector = {
        indices: [0, 5],
        values: [0.1, 0.2],
      };
      expect(isNamedVector(vector)).toBe(false);
    });

    it('should return false for object with non-array values', () => {
      const vector = {
        key1: 'not an array',
        key2: 42,
      };
      expect(isNamedVector(vector as Vector)).toBe(false);
    });

    it('should return false for object with mixed array and non-array values', () => {
      const vector = {
        valid: [0.1, 0.2],
        invalid: 'string',
      };
      expect(isNamedVector(vector as Vector)).toBe(false);
    });

    it('should return true for empty object', () => {
      const vector: Vector = {};
      expect(isNamedVector(vector)).toBe(true);
    });
  });

  describe('Type guard combinations', () => {
    it('should have mutually exclusive dense and sparse', () => {
      const denseVector: Vector = [0.1, 0.2];
      expect(isDenseVector(denseVector)).toBe(true);
      expect(isSparseVector(denseVector)).toBe(false);
      expect(isNamedVector(denseVector)).toBe(false);
    });

    it('should have mutually exclusive sparse and named', () => {
      const sparseVector: Vector = {
        indices: [0, 1],
        values: [0.1, 0.2],
      };
      expect(isDenseVector(sparseVector)).toBe(false);
      expect(isSparseVector(sparseVector)).toBe(true);
      expect(isNamedVector(sparseVector)).toBe(false);
    });

    it('should have mutually exclusive named and dense', () => {
      const namedVector: Vector = {
        image: [0.1, 0.2],
        text: [0.3, 0.4],
      };
      expect(isDenseVector(namedVector)).toBe(false);
      expect(isSparseVector(namedVector)).toBe(false);
      expect(isNamedVector(namedVector)).toBe(true);
    });
  });

  describe('TypeScript type narrowing', () => {
    it('should narrow dense vector type', () => {
      const vector: Vector = [0.1, 0.2, 0.3];

      if (isDenseVector(vector)) {
        // TypeScript should know vector is number[]
        const length: number = vector.length;
        const firstElement: number = vector[0] ?? 0;
        expect(length).toBe(3);
        expect(firstElement).toBe(0.1);
      } else {
        throw new Error('Should be dense vector');
      }
    });

    it('should narrow sparse vector type', () => {
      const vector: Vector = {
        indices: [0, 5],
        values: [0.1, 0.2],
      };

      if (isSparseVector(vector)) {
        // TypeScript should know vector is SparseVector
        const indicesLength: number = vector.indices.length;
        const valuesLength: number = vector.values.length;
        expect(indicesLength).toBe(2);
        expect(valuesLength).toBe(2);
      } else {
        throw new Error('Should be sparse vector');
      }
    });

    it('should narrow named vector type', () => {
      const vector: Vector = {
        image: [0.1, 0.2],
        text: [0.3, 0.4],
      };

      if (isNamedVector(vector)) {
        // TypeScript should know vector is Record<string, number[]>
        const keys = Object.keys(vector);
        const imageVector = vector['image'];
        expect(keys).toContain('image');
        expect(keys).toContain('text');
        expect(imageVector).toEqual([0.1, 0.2]);
      } else {
        throw new Error('Should be named vector');
      }
    });
  });
});

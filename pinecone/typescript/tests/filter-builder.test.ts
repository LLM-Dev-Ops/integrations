/**
 * Unit tests for Pinecone FilterBuilder
 *
 * Tests the fluent filter builder API and verifies correct
 * serialization to Pinecone's expected JSON format.
 */

import { describe, it, expect } from "vitest";
import { FilterBuilder, filter } from "../src/types/filter-builder.js";
import type { MetadataFilter } from "../src/types/filter.js";

describe("FilterBuilder", () => {
  describe("construction", () => {
    it("should create a new instance with FilterBuilder.new()", () => {
      const builder = FilterBuilder.new();
      expect(builder).toBeInstanceOf(FilterBuilder);
    });

    it("should create a new instance with filter() convenience function", () => {
      const builder = filter();
      expect(builder).toBeInstanceOf(FilterBuilder);
    });
  });

  describe("empty filters", () => {
    it("should build an empty object when no conditions are added", () => {
      const result = FilterBuilder.new().build();
      expect(result).toEqual({});
    });
  });

  describe("single condition filters", () => {
    it("should build a simple equality filter", () => {
      const result = FilterBuilder.new().eq("status", "active").build();

      expect(result).toEqual({
        status: { $eq: "active" },
      });
    });

    it("should build a not-equal filter", () => {
      const result = FilterBuilder.new().ne("role", "admin").build();

      expect(result).toEqual({
        role: { $ne: "admin" },
      });
    });

    it("should build a greater-than filter", () => {
      const result = FilterBuilder.new().gt("age", 18).build();

      expect(result).toEqual({
        age: { $gt: 18 },
      });
    });

    it("should build a greater-than-or-equal filter", () => {
      const result = FilterBuilder.new().gte("score", 50).build();

      expect(result).toEqual({
        score: { $gte: 50 },
      });
    });

    it("should build a less-than filter", () => {
      const result = FilterBuilder.new().lt("count", 100).build();

      expect(result).toEqual({
        count: { $lt: 100 },
      });
    });

    it("should build a less-than-or-equal filter", () => {
      const result = FilterBuilder.new().lte("price", 999.99).build();

      expect(result).toEqual({
        price: { $lte: 999.99 },
      });
    });

    it("should build an in-array filter with strings", () => {
      const result = FilterBuilder.new()
        .in("category", ["premium", "gold", "platinum"])
        .build();

      expect(result).toEqual({
        category: { $in: ["premium", "gold", "platinum"] },
      });
    });

    it("should build an in-array filter with numbers", () => {
      const result = FilterBuilder.new().in("priority", [1, 2, 3]).build();

      expect(result).toEqual({
        priority: { $in: [1, 2, 3] },
      });
    });

    it("should build a not-in-array filter", () => {
      const result = FilterBuilder.new()
        .nin("status", ["deleted", "archived"])
        .build();

      expect(result).toEqual({
        status: { $nin: ["deleted", "archived"] },
      });
    });

    it("should support boolean values", () => {
      const result = FilterBuilder.new().eq("verified", true).build();

      expect(result).toEqual({
        verified: { $eq: true },
      });
    });

    it("should support numeric values", () => {
      const result = FilterBuilder.new().eq("count", 42).build();

      expect(result).toEqual({
        count: { $eq: 42 },
      });
    });
  });

  describe("multiple conditions with AND", () => {
    it("should combine two conditions with AND by default", () => {
      const result = FilterBuilder.new()
        .eq("status", "active")
        .gte("age", 18)
        .build();

      expect(result).toEqual({
        $and: [{ status: { $eq: "active" } }, { age: { $gte: 18 } }],
      });
    });

    it("should combine multiple conditions with explicit AND", () => {
      const result = FilterBuilder.new()
        .and()
        .eq("status", "active")
        .gte("score", 50)
        .lt("score", 100)
        .build();

      expect(result).toEqual({
        $and: [
          { status: { $eq: "active" } },
          { score: { $gte: 50 } },
          { score: { $lt: 100 } },
        ],
      });
    });

    it("should support range queries (gte + lte)", () => {
      const result = FilterBuilder.new().gte("age", 18).lte("age", 65).build();

      expect(result).toEqual({
        $and: [{ age: { $gte: 18 } }, { age: { $lte: 65 } }],
      });
    });

    it("should combine different operator types", () => {
      const result = FilterBuilder.new()
        .eq("type", "user")
        .ne("role", "admin")
        .gte("credits", 100)
        .in("tier", ["premium", "enterprise"])
        .build();

      expect(result).toEqual({
        $and: [
          { type: { $eq: "user" } },
          { role: { $ne: "admin" } },
          { credits: { $gte: 100 } },
          { tier: { $in: ["premium", "enterprise"] } },
        ],
      });
    });
  });

  describe("multiple conditions with OR", () => {
    it("should combine two conditions with OR", () => {
      const result = FilterBuilder.new()
        .or()
        .eq("country", "US")
        .eq("country", "CA")
        .build();

      expect(result).toEqual({
        $or: [{ country: { $eq: "US" } }, { country: { $eq: "CA" } }],
      });
    });

    it("should combine multiple conditions with OR", () => {
      const result = FilterBuilder.new()
        .or()
        .eq("status", "active")
        .eq("status", "pending")
        .eq("status", "processing")
        .build();

      expect(result).toEqual({
        $or: [
          { status: { $eq: "active" } },
          { status: { $eq: "pending" } },
          { status: { $eq: "processing" } },
        ],
      });
    });

    it("should support OR with different operators", () => {
      const result = FilterBuilder.new()
        .or()
        .eq("vip", true)
        .gte("purchases", 10)
        .in("tier", ["premium", "gold"])
        .build();

      expect(result).toEqual({
        $or: [
          { vip: { $eq: true } },
          { purchases: { $gte: 10 } },
          { tier: { $in: ["premium", "gold"] } },
        ],
      });
    });
  });

  describe("operator switching", () => {
    it("should use AND when set explicitly", () => {
      const result = FilterBuilder.new()
        .and()
        .eq("field1", "value1")
        .eq("field2", "value2")
        .build();

      expect(result).toEqual({
        $and: [{ field1: { $eq: "value1" } }, { field2: { $eq: "value2" } }],
      });
    });

    it("should switch to OR when set explicitly", () => {
      const result = FilterBuilder.new()
        .or()
        .eq("field1", "value1")
        .eq("field2", "value2")
        .build();

      expect(result).toEqual({
        $or: [{ field1: { $eq: "value1" } }, { field2: { $eq: "value2" } }],
      });
    });

    it("should maintain the last set operator for all conditions", () => {
      const result = FilterBuilder.new()
        .and()
        .eq("field1", "value1")
        .or() // Switch to OR
        .eq("field2", "value2")
        .eq("field3", "value3")
        .build();

      // All conditions use OR because that was the last operator set
      expect(result).toEqual({
        $or: [
          { field1: { $eq: "value1" } },
          { field2: { $eq: "value2" } },
          { field3: { $eq: "value3" } },
        ],
      });
    });
  });

  describe("method chaining", () => {
    it("should support fluent chaining", () => {
      const result = FilterBuilder.new()
        .eq("a", 1)
        .ne("b", 2)
        .gt("c", 3)
        .gte("d", 4)
        .lt("e", 5)
        .lte("f", 6)
        .in("g", [7, 8])
        .nin("h", [9, 10])
        .build();

      expect(result).toEqual({
        $and: [
          { a: { $eq: 1 } },
          { b: { $ne: 2 } },
          { c: { $gt: 3 } },
          { d: { $gte: 4 } },
          { e: { $lt: 5 } },
          { f: { $lte: 6 } },
          { g: { $in: [7, 8] } },
          { h: { $nin: [9, 10] } },
        ],
      });
    });

    it("should support chaining with operator changes", () => {
      const result = FilterBuilder.new()
        .and()
        .eq("status", "active")
        .or()
        .eq("country", "US")
        .eq("country", "CA")
        .build();

      expect(result).toEqual({
        $or: [
          { status: { $eq: "active" } },
          { country: { $eq: "US" } },
          { country: { $eq: "CA" } },
        ],
      });
    });
  });

  describe("real-world scenarios", () => {
    it("should build a user filter query", () => {
      const result = FilterBuilder.new()
        .and()
        .eq("type", "user")
        .eq("verified", true)
        .gte("age", 18)
        .in("country", ["US", "CA", "UK"])
        .build();

      expect(result).toEqual({
        $and: [
          { type: { $eq: "user" } },
          { verified: { $eq: true } },
          { age: { $gte: 18 } },
          { country: { $in: ["US", "CA", "UK"] } },
        ],
      });
    });

    it("should build an e-commerce filter", () => {
      const result = FilterBuilder.new()
        .and()
        .in("category", ["electronics", "computers"])
        .gte("price", 100)
        .lte("price", 1000)
        .eq("in_stock", true)
        .build();

      expect(result).toEqual({
        $and: [
          { category: { $in: ["electronics", "computers"] } },
          { price: { $gte: 100 } },
          { price: { $lte: 1000 } },
          { in_stock: { $eq: true } },
        ],
      });
    });

    it("should build a content moderation filter", () => {
      const result = FilterBuilder.new()
        .or()
        .eq("flagged", true)
        .gte("reports", 5)
        .in("status", ["review", "flagged"])
        .build();

      expect(result).toEqual({
        $or: [
          { flagged: { $eq: true } },
          { reports: { $gte: 5 } },
          { status: { $in: ["review", "flagged"] } },
        ],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty string values", () => {
      const result = FilterBuilder.new().eq("field", "").build();

      expect(result).toEqual({
        field: { $eq: "" },
      });
    });

    it("should handle zero values", () => {
      const result = FilterBuilder.new().eq("count", 0).build();

      expect(result).toEqual({
        count: { $eq: 0 },
      });
    });

    it("should handle negative numbers", () => {
      const result = FilterBuilder.new().gte("balance", -100).build();

      expect(result).toEqual({
        balance: { $gte: -100 },
      });
    });

    it("should handle floating point numbers", () => {
      const result = FilterBuilder.new().lte("score", 99.99).build();

      expect(result).toEqual({
        score: { $lte: 99.99 },
      });
    });

    it("should handle empty arrays", () => {
      const result = FilterBuilder.new().in("tags", []).build();

      expect(result).toEqual({
        tags: { $in: [] },
      });
    });

    it("should handle field names with special characters", () => {
      const result = FilterBuilder.new()
        .eq("user.email", "test@example.com")
        .build();

      expect(result).toEqual({
        "user.email": { $eq: "test@example.com" },
      });
    });
  });

  describe("type safety", () => {
    it("should enforce number type for gt operator", () => {
      const result = FilterBuilder.new().gt("age", 18).build();

      expect(result).toEqual({
        age: { $gt: 18 },
      });

      // TypeScript should not allow: .gt("age", "18")
      // This is a compile-time check
    });

    it("should enforce number type for comparison operators", () => {
      const result = FilterBuilder.new()
        .gt("a", 1)
        .gte("b", 2)
        .lt("c", 3)
        .lte("d", 4)
        .build();

      expect(result).toEqual({
        $and: [
          { a: { $gt: 1 } },
          { b: { $gte: 2 } },
          { c: { $lt: 3 } },
          { d: { $lte: 4 } },
        ],
      });
    });
  });
});
